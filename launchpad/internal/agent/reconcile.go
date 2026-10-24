package agent

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"strconv"
	"time"

	"launchpad/internal/model"
)

// Container is one managed container as seen on this node.
type Container struct {
	Name      string
	ServiceID string
	Revision  int
	Running   bool
	HostPort  int
}

// Runtime abstracts the container engine so reconcile logic is testable.
type Runtime interface {
	List(ctx context.Context) ([]Container, error)
	// Prepare pulls or builds the image for svc. For git services commit is the
	// resolved commit that was built ("" when the image came from a registry).
	Prepare(ctx context.Context, svc model.Service) (image, commit string, err error)
	Start(ctx context.Context, svc model.Service, image string) (Container, error)
	Remove(ctx context.Context, name string) error
	// Logs returns output lines newer than since (or the last tail lines when
	// since is zero), oldest first.
	Logs(ctx context.Context, name string, since time.Time, tail int) ([]model.LogLine, error)
}

const (
	retryAfter     = time.Minute      // wait before rebuilding a revision that failed
	startupTimeout = 60 * time.Second // a new container must turn healthy within this
	drainGrace     = 10 * time.Second // old revision lingers so the edge can switch routes
	firstLogTail   = 100
	maxBatchLines  = 500
)

type failure struct {
	rev int
	at  time.Time
	msg string
}

// Probe reports whether the container published on hostPort is healthy.
type Probe func(ctx context.Context, hostPort int, healthPath string) bool

type Reconciler struct {
	RT    Runtime
	Probe Probe
	Now   func() time.Time

	failed     map[string]failure   // by service id
	startedAt  map[string]time.Time // by container name, until first healthy
	supersedAt map[string]time.Time // by container name, when a newer revision turned healthy
	commits    map[string]string    // by container name
	logCursor  map[string]time.Time // by container name
	live       []Container          // running containers seen by the last Reconcile
}

func NewReconciler(rt Runtime) *Reconciler {
	return &Reconciler{RT: rt, Probe: HTTPProbe, Now: time.Now,
		failed: map[string]failure{}, startedAt: map[string]time.Time{}, supersedAt: map[string]time.Time{},
		commits: map[string]string{}, logCursor: map[string]time.Time{}}
}

// Reconcile converges the node to desired and returns the statuses to report:
// one for the newest revision of each service, plus one per older revision
// that is still healthy. Older revisions keep serving until the newest one is
// healthy, then are removed after a short drain.
func (r *Reconciler) Reconcile(ctx context.Context, desired []model.Service) []model.Status {
	have, err := r.RT.List(ctx)
	if err != nil {
		log.Printf("list containers: %v", err)
		return nil
	}
	want := map[string]model.Service{}
	for _, s := range desired {
		want[s.ID] = s
	}
	for _, c := range have {
		if _, ok := want[c.ServiceID]; !ok {
			r.remove(ctx, c.Name)
		}
	}
	var out []model.Status
	for _, s := range desired {
		cur, redeployed := r.current(ctx, s, have)
		out = append(out, cur)
		if redeployed {
			// Containers may have been removed (volume services) or started.
			if h, err := r.RT.List(ctx); err == nil {
				have = h
			}
		}
		for _, c := range have {
			if c.ServiceID != s.ID || c.Revision == s.Revision {
				continue
			}
			if c.Revision > s.Revision {
				r.remove(ctx, c.Name)
				continue
			}
			if cur.State == model.StateRunning {
				at, ok := r.supersedAt[c.Name]
				if !ok {
					at = r.Now()
					r.supersedAt[c.Name] = at
				}
				if r.Now().Sub(at) >= drainGrace {
					r.remove(ctx, c.Name)
					delete(r.supersedAt, c.Name)
					continue
				}
			}
			if c.Running && r.Probe(ctx, c.HostPort, s.HealthPath) {
				out = append(out, model.Status{ServiceID: s.ID, Revision: c.Revision,
					State: model.StateRunning, HostPort: c.HostPort, Commit: r.commits[c.Name]})
			}
		}
	}
	r.live = r.live[:0]
	if final, err := r.RT.List(ctx); err == nil {
		for _, c := range final {
			if c.Running {
				r.live = append(r.live, c)
			}
		}
	}
	r.forget(have)
	return out
}

// forget drops per-container bookkeeping for containers that no longer exist.
func (r *Reconciler) forget(have []Container) {
	names := map[string]bool{}
	for _, c := range r.live {
		names[c.Name] = true
	}
	for _, c := range have {
		names[c.Name] = true
	}
	for _, m := range []map[string]time.Time{r.startedAt, r.supersedAt, r.logCursor} {
		for k := range m {
			if !names[k] {
				delete(m, k)
			}
		}
	}
	for k := range r.commits {
		if !names[k] {
			delete(r.commits, k)
		}
	}
}

// current drives the newest revision of s towards healthy. redeployed reports
// whether it touched containers.
func (r *Reconciler) current(ctx context.Context, s model.Service, have []Container) (st model.Status, redeployed bool) {
	st = model.Status{ServiceID: s.ID, Revision: s.Revision}
	c, ok := find(have, s.ID, s.Revision)
	if !ok || !c.Running {
		if f, ok := r.failed[s.ID]; ok && f.rev == s.Revision && r.Now().Sub(f.at) < retryAfter {
			st.State, st.Error = model.StateFailed, f.msg
			return st, false
		}
		var err error
		if c, err = r.deploy(ctx, s, have); err != nil {
			r.failed[s.ID] = failure{s.Revision, r.Now(), err.Error()}
			st.State, st.Error = model.StateFailed, err.Error()
			return st, true
		}
		delete(r.failed, s.ID)
		r.startedAt[c.Name] = r.Now()
		redeployed = true
	}
	st.HostPort, st.Commit = c.HostPort, r.commits[c.Name]
	if r.Probe(ctx, c.HostPort, s.HealthPath) {
		delete(r.startedAt, c.Name)
		st.State = model.StateRunning
		return st, redeployed
	}
	started, ok := r.startedAt[c.Name]
	if !ok { // container found already running, e.g. after an agent restart
		started = r.Now()
		r.startedAt[c.Name] = started
	}
	if r.Now().Sub(started) > startupTimeout {
		msg := "health check failed"
		r.remove(ctx, c.Name)
		delete(r.startedAt, c.Name)
		r.failed[s.ID] = failure{s.Revision, r.Now(), msg}
		st.HostPort, st.State, st.Error = 0, model.StateFailed, msg
		return st, true
	}
	st.State = model.StateStarting
	return st, redeployed
}

func (r *Reconciler) deploy(ctx context.Context, s model.Service, have []Container) (Container, error) {
	// A stale container with the target name (e.g. exited) would block `run`.
	r.remove(ctx, fmt.Sprintf("lp-%s-%d", s.ID, s.Revision))
	img, commit, err := r.RT.Prepare(ctx, s)
	if err != nil {
		return Container{}, fmt.Errorf("prepare: %w", err)
	}
	if len(s.Volumes) > 0 {
		// Never run two containers on the same volume: stop the old revision
		// first. This trades a short outage for data safety.
		for _, o := range have {
			if o.ServiceID == s.ID && o.Revision != s.Revision {
				r.remove(ctx, o.Name)
			}
		}
	}
	c, err := r.RT.Start(ctx, s, img)
	if err != nil {
		return Container{}, fmt.Errorf("start: %w", err)
	}
	if commit != "" {
		r.commits[c.Name] = commit
	}
	return c, nil
}

// CollectLogs returns output produced since the previous call, one batch per
// running container. The first call for a container returns its recent tail.
func (r *Reconciler) CollectLogs(ctx context.Context) []model.LogBatch {
	var out []model.LogBatch
	for _, c := range r.live {
		cursor, seen := r.logCursor[c.Name]
		tail := 0
		if !seen {
			tail = firstLogTail
		}
		lines, err := r.RT.Logs(ctx, c.Name, cursor, tail)
		if err != nil {
			continue
		}
		var fresh []model.LogLine
		for _, l := range lines {
			if seen && !l.Time.After(cursor) {
				continue
			}
			l.Revision = c.Revision
			fresh = append(fresh, l)
			if l.Time.After(cursor) {
				cursor = l.Time
			}
		}
		if !seen && cursor.IsZero() {
			cursor = r.Now() // nothing logged yet: only ask for newer output next time
		}
		r.logCursor[c.Name] = cursor
		for len(fresh) > 0 {
			n := min(len(fresh), maxBatchLines)
			out = append(out, model.LogBatch{ServiceID: c.ServiceID, Revision: c.Revision, Lines: fresh[:n]})
			fresh = fresh[n:]
		}
	}
	return out
}

// HTTPProbe checks 127.0.0.1:hostPort: a TCP connect, then (if healthPath is
// set) an HTTP GET where any status below 500 counts as healthy.
func HTTPProbe(ctx context.Context, hostPort int, healthPath string) bool {
	if hostPort == 0 {
		return false
	}
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	addr := net.JoinHostPort("127.0.0.1", strconv.Itoa(hostPort))
	if healthPath == "" {
		c, err := (&net.Dialer{}).DialContext(ctx, "tcp", addr)
		if err != nil {
			return false
		}
		c.Close()
		return true
	}
	req, err := http.NewRequestWithContext(ctx, "GET", "http://"+addr+healthPath, nil)
	if err != nil {
		return false
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode < 500
}

func (r *Reconciler) remove(ctx context.Context, name string) {
	if err := r.RT.Remove(ctx, name); err != nil {
		log.Printf("remove %s: %v", name, err)
	}
}

func find(cs []Container, id string, rev int) (Container, bool) {
	for _, c := range cs {
		if c.ServiceID == id && c.Revision == rev {
			return c, true
		}
	}
	return Container{}, false
}
