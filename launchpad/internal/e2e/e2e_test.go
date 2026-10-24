// Package e2e runs the real control plane, agents and edge over real sockets.
// Only the container engine is faked: each "container" is an in-process HTTP
// server on a real port, so routing, health gating and failover are the real code.
package e2e

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"launchpad/internal/agent"
	"launchpad/internal/api"
	"launchpad/internal/edge"
	"launchpad/internal/model"
	"launchpad/internal/store"
)

// engine is a fake container runtime for one node.
type engine struct {
	node string

	mu    sync.Mutex
	cs    map[string]*box
	order []string
}

type box struct {
	c       agent.Container
	srv     *http.Server
	readyAt time.Time
}

func newEngine(node string) *engine { return &engine{node: node, cs: map[string]*box{}} }

func (e *engine) List(context.Context) ([]agent.Container, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	var out []agent.Container
	for _, n := range e.order {
		if b, ok := e.cs[n]; ok {
			out = append(out, b.c)
		}
	}
	return out, nil
}

func (e *engine) Prepare(_ context.Context, s model.Service) (string, string, error) {
	return "img", "", nil
}

// Start serves "rev N on <node>" on /, but answers 503 everywhere for the first
// 400ms, so any traffic sent before the health gate opens shows up as a failure.
func (e *engine) Start(_ context.Context, s model.Service, _ string) (agent.Container, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return agent.Container{}, err
	}
	name := fmt.Sprintf("lp-%s-%d", s.ID, s.Revision)
	b := &box{readyAt: time.Now().Add(400 * time.Millisecond)}
	mux := http.NewServeMux()
	mux.HandleFunc("/up", func(w http.ResponseWriter, r *http.Request) {
		if time.Now().Before(b.readyAt) {
			http.Error(w, "warming up", 503)
		}
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if time.Now().Before(b.readyAt) { // a warming container must not receive user traffic
			http.Error(w, "warming up", 503)
			return
		}
		fmt.Fprintf(w, "rev %d on %s", s.Revision, e.node)
	})
	b.srv = &http.Server{Handler: mux}
	go b.srv.Serve(ln)
	b.c = agent.Container{Name: name, ServiceID: s.ID, Revision: s.Revision, Running: true, HostPort: ln.Addr().(*net.TCPAddr).Port}
	e.mu.Lock()
	e.cs[name] = b
	e.order = append(e.order, name)
	e.mu.Unlock()
	return b.c, nil
}

func (e *engine) Remove(_ context.Context, name string) error {
	e.mu.Lock()
	b, ok := e.cs[name]
	delete(e.cs, name)
	e.mu.Unlock()
	if ok {
		b.srv.Close()
	}
	return nil
}

func (e *engine) Logs(_ context.Context, name string, since time.Time, tail int) ([]model.LogLine, error) {
	e.mu.Lock()
	_, ok := e.cs[name]
	e.mu.Unlock()
	if !ok || !since.IsZero() {
		return nil, nil
	}
	return []model.LogLine{{Time: time.Now(), Text: "booted " + name + " on " + e.node}}, nil
}

func (e *engine) shutdown() {
	e.mu.Lock()
	defer e.mu.Unlock()
	for _, b := range e.cs {
		b.srv.Close()
	}
}

type cluster struct {
	t       *testing.T
	cpURL   string
	edgeURL string
	agents  map[string]context.CancelFunc
}

func startCluster(t *testing.T) *cluster {
	t.Helper()
	st, _ := store.Open("")
	cp := api.New(api.Config{APIToken: "tok", NodeToken: "nt", BaseDomain: "apps.test", NodeTTL: time.Second}, st)
	cpSrv := httptest.NewServer(cp.Handler())
	t.Cleanup(cpSrv.Close)

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	go func() {
		for ctx.Err() == nil {
			cp.RunSchedulerOnce()
			time.Sleep(50 * time.Millisecond)
		}
	}()

	c := &cluster{t: t, cpURL: cpSrv.URL, agents: map[string]context.CancelFunc{}}
	for _, name := range []string{"node-a", "node-b"} {
		eng := newEngine(name)
		t.Cleanup(eng.shutdown)
		actx, acancel := context.WithCancel(ctx)
		c.agents[name] = acancel
		a := &agent.Agent{URL: cpSrv.URL, Token: "nt", Name: name, Addr: "127.0.0.1",
			HTTP: http.DefaultClient, Rec: agent.NewReconciler(eng), Every: 50 * time.Millisecond}
		go a.Run(actx)
	}
	e := &edge.Edge{URL: cpSrv.URL, Token: "nt", HTTP: http.DefaultClient, Interval: 50 * time.Millisecond}
	go e.Poll(ctx)
	edgeSrv := httptest.NewServer(e)
	t.Cleanup(edgeSrv.Close)
	c.edgeURL = edgeSrv.URL
	return c
}

func (c *cluster) api(method, path string, body any) (int, []byte) {
	c.t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = strings.NewReader(string(b))
	}
	req, _ := http.NewRequest(method, c.cpURL+"/api/v1"+path, rd)
	req.Header.Set("Authorization", "Bearer tok")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, b
}

func (c *cluster) view(id string) (v struct {
	model.Service
	State           string `json:"state"`
	ServingRevision int    `json:"serving_revision"`
	NodeName        string `json:"node_name"`
}) {
	_, b := c.api("GET", "/services/"+id, nil)
	_ = json.Unmarshal(b, &v)
	return v
}

// fetch requests the edge as if from a browser visiting host.
func (c *cluster) fetch(host string) (int, string) {
	req, _ := http.NewRequest("GET", c.edgeURL+"/", nil)
	req.Host = host
	resp, err := (&http.Client{Timeout: 2 * time.Second}).Do(req)
	if err != nil {
		return 0, err.Error()
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(b)
}

func waitFor(t *testing.T, what string, within time.Duration, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(within)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

func TestDeployRolloutAndFailover(t *testing.T) {
	c := startCluster(t)

	// 1. Deploy and reach it through the edge.
	code, b := c.api("POST", "/services", map[string]any{"name": "web", "image": "ignored:1", "port": 8080, "health_path": "/up"})
	if code != 201 {
		t.Fatalf("create: %d %s", code, b)
	}
	var created struct{ ID string }
	_ = json.Unmarshal(b, &created)
	id := created.ID

	waitFor(t, "service running", 10*time.Second, func() bool { return c.view(id).State == "running" })
	waitFor(t, "edge route", 5*time.Second, func() bool { code, _ := c.fetch("web.apps.test"); return code == 200 })
	if _, body := c.fetch("web.apps.test"); !strings.HasPrefix(body, "rev 1 on ") {
		t.Fatalf("body %q", body)
	}
	if code, _ := c.fetch("unknown.apps.test"); code != 404 {
		t.Fatalf("unknown host: %d", code)
	}

	// 2. Logs shipped by the agent show up in the API.
	waitFor(t, "shipped logs", 5*time.Second, func() bool {
		_, b := c.api("GET", "/services/"+id+"/logs", nil)
		return strings.Contains(string(b), "booted lp-"+id+"-1")
	})

	// 3. Roll out revision 2 while hammering the edge: not one request may fail,
	// and once traffic reaches revision 2 it must never go back to revision 1.
	var failures, total atomic.Int64
	var sawRev2 atomic.Bool
	var wentBack atomic.Bool
	stop := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-stop:
				return
			default:
			}
			code, body := c.fetch("web.apps.test")
			total.Add(1)
			switch {
			case code != 200:
				failures.Add(1)
				t.Logf("failed request during rollout: %d %q", code, body)
			case strings.HasPrefix(body, "rev 2 "):
				sawRev2.Store(true)
			case strings.HasPrefix(body, "rev 1 ") && sawRev2.Load():
				wentBack.Store(true)
			}
			time.Sleep(5 * time.Millisecond)
		}
	}()
	if code, b := c.api("PUT", "/services/"+id+"/env", map[string]string{"GREETING": "hi"}); code != 200 {
		t.Fatalf("env: %d %s", code, b)
	}
	sawStarting := false
	waitFor(t, "revision 2 serving", 15*time.Second, func() bool {
		v := c.view(id)
		if v.Revision == 2 && v.State != "running" && v.ServingRevision == 1 {
			sawStarting = true // the old revision carried traffic while the new one warmed up
		}
		return sawRev2.Load()
	})
	time.Sleep(200 * time.Millisecond)
	close(stop)
	wg.Wait()
	if failures.Load() != 0 {
		t.Fatalf("%d of %d requests failed during rollout", failures.Load(), total.Load())
	}
	if wentBack.Load() {
		t.Fatal("traffic returned to revision 1 after reaching revision 2")
	}
	if !sawStarting {
		t.Fatal("never observed revision 2 warming up while revision 1 served")
	}
	t.Logf("rollout: %d requests, 0 failures", total.Load())

	// 4. Kill the node that hosts the service: it must move and keep answering.
	host := c.view(id).NodeName
	c.agents[host]()
	waitFor(t, "failover to the other node", 20*time.Second, func() bool {
		code, body := c.fetch("web.apps.test")
		return code == 200 && !strings.HasSuffix(body, " on "+host)
	})
	if v := c.view(id); v.NodeName == host || v.State != "running" {
		t.Fatalf("after failover: %+v", v)
	}
}
