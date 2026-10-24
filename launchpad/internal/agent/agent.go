// Package agent runs on every node. It heartbeats to the control plane,
// receives the services assigned to this node and reconciles containers.
package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
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

const retryAfter = time.Minute

type failure struct {
	rev int
	at  time.Time
	msg string
}

type Reconciler struct {
	RT     Runtime
	Now    func() time.Time
	failed map[string]failure
}

func NewReconciler(rt Runtime) *Reconciler {
	return &Reconciler{RT: rt, Now: time.Now, failed: map[string]failure{}}
}

// Reconcile converges the node to desired and returns a status per service.
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
	// Containers of services that are gone or moved away.
	for _, c := range have {
		if _, ok := want[c.ServiceID]; !ok {
			r.remove(ctx, c.Name)
		}
	}
	var out []model.Status
	for _, s := range desired {
		st := model.Status{ServiceID: s.ID, Revision: s.Revision}
		if c, ok := find(have, s.ID, s.Revision); ok && c.Running {
			st.State, st.HostPort = model.StateRunning, c.HostPort
			r.removeOld(ctx, have, s)
			out = append(out, st)
			continue
		}
		if f, ok := r.failed[s.ID]; ok && f.rev == s.Revision && r.Now().Sub(f.at) < retryAfter {
			st.State, st.Error = model.StateFailed, f.msg
			out = append(out, st)
			continue
		}
		c, err := r.deploy(ctx, s)
		if err != nil {
			r.failed[s.ID] = failure{s.Revision, r.Now(), err.Error()}
			st.State, st.Error = model.StateFailed, err.Error()
		} else {
			delete(r.failed, s.ID)
			st.State, st.HostPort = model.StateRunning, c.HostPort
			r.removeOld(ctx, have, s)
		}
		out = append(out, st)
	}
	return out
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

func (r *Reconciler) removeOld(ctx context.Context, have []Container, s model.Service) {
	for _, c := range have {
		if c.ServiceID == s.ID && c.Revision != s.Revision {
			r.remove(ctx, c.Name)
		}
	}
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
