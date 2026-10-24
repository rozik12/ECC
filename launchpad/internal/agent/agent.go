// Package agent runs on every node. It heartbeats to the control plane,
// receives the services assigned to this node and reconciles containers.
package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"strconv"
	"sync"
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
	// Prepare pulls or builds the image for svc and returns its reference.
	Prepare(ctx context.Context, svc model.Service) (string, error)
	Start(ctx context.Context, svc model.Service, image string) (Container, error)
	Remove(ctx context.Context, name string) error
}

const (
	retryAfter     = time.Minute      // wait before rebuilding a revision that failed
	startupTimeout = 60 * time.Second // a new container must turn healthy within this
	drainGrace     = 10 * time.Second // old revision lingers so the edge can switch routes
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
}

func NewReconciler(rt Runtime) *Reconciler {
	return &Reconciler{RT: rt, Probe: HTTPProbe, Now: time.Now,
		failed: map[string]failure{}, startedAt: map[string]time.Time{}, supersedAt: map[string]time.Time{}}
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
		cur := r.current(ctx, s, have)
		out = append(out, cur)
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
					State: model.StateRunning, HostPort: c.HostPort})
			}
		}
	}
	return out
}

// current drives the newest revision of s towards healthy.
func (r *Reconciler) current(ctx context.Context, s model.Service, have []Container) model.Status {
	st := model.Status{ServiceID: s.ID, Revision: s.Revision}
	c, ok := find(have, s.ID, s.Revision)
	if !ok || !c.Running {
		if f, ok := r.failed[s.ID]; ok && f.rev == s.Revision && r.Now().Sub(f.at) < retryAfter {
			st.State, st.Error = model.StateFailed, f.msg
			return st
		}
		var err error
		if c, err = r.deploy(ctx, s); err != nil {
			r.failed[s.ID] = failure{s.Revision, r.Now(), err.Error()}
			st.State, st.Error = model.StateFailed, err.Error()
			return st
		}
		delete(r.failed, s.ID)
		r.startedAt[c.Name] = r.Now()
	}
	st.HostPort = c.HostPort
	if r.Probe(ctx, c.HostPort, s.HealthPath) {
		delete(r.startedAt, c.Name)
		st.State = model.StateRunning
		return st
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
		return st
	}
	st.State = model.StateStarting
	return st
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

func (r *Reconciler) deploy(ctx context.Context, s model.Service) (Container, error) {
	// A stale container with the target name (e.g. exited) would block `run`.
	r.remove(ctx, fmt.Sprintf("lp-%s-%d", s.ID, s.Revision))
	img, err := r.RT.Prepare(ctx, s)
	if err != nil {
		return Container{}, fmt.Errorf("prepare: %w", err)
	}
	c, err := r.RT.Start(ctx, s, img)
	if err != nil {
		return Container{}, fmt.Errorf("start: %w", err)
	}
	return c, nil
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

// Agent glues a Reconciler to the control plane.
type Agent struct {
	URL, Token, Name, Addr, ID string
	HTTP                       *http.Client
	Rec                        *Reconciler

	mu       sync.Mutex
	statuses []model.Status
	desired  []model.Service
}

func (a *Agent) post(ctx context.Context, path string, in, out any) error {
	b, _ := json.Marshal(in)
	req, err := http.NewRequestWithContext(ctx, "POST", a.URL+path, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+a.Token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := a.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("%s: HTTP %d", path, resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func (a *Agent) register(ctx context.Context) error {
	var n model.Node
	if err := a.post(ctx, "/internal/nodes/register", model.Node{ID: a.ID, Name: a.Name, Addr: a.Addr}, &n); err != nil {
		return err
	}
	a.ID = n.ID
	log.Printf("registered as node %s", a.ID)
	return nil
}

// Run blocks until ctx is done. Heartbeats never wait on image builds: the
// reconcile loop runs separately so a slow build cannot make the node look dead.
func (a *Agent) Run(ctx context.Context) {
	kick := make(chan struct{}, 1)
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case <-kick:
			case <-time.After(10 * time.Second):
			}
			a.mu.Lock()
			d := append([]model.Service(nil), a.desired...)
			a.mu.Unlock()
			sts := a.Rec.Reconcile(ctx, d)
			a.mu.Lock()
			a.statuses = sts
			a.mu.Unlock()
		}
	}()
	t := time.NewTicker(3 * time.Second)
	defer t.Stop()
	for {
		if a.ID == "" {
			if err := a.register(ctx); err != nil {
				log.Printf("register: %v", err)
			}
		}
		if a.ID != "" {
			a.mu.Lock()
			req := struct {
				Statuses []model.Status `json:"statuses"`
			}{a.statuses}
			a.mu.Unlock()
			var resp struct {
				Services []model.Service `json:"services"`
			}
			if err := a.post(ctx, "/internal/nodes/"+a.ID+"/heartbeat", req, &resp); err != nil {
				log.Printf("heartbeat: %v", err)
				a.ID = "" // control plane may have lost us; re-register
			} else {
				a.mu.Lock()
				a.desired = resp.Services
				a.mu.Unlock()
				select {
				case kick <- struct{}{}:
				default:
				}
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}
