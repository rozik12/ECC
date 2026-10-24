package cli

import (
	"bytes"
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"launchpad/internal/api"
	"launchpad/internal/model"
	"launchpad/internal/store"
)

// env is a real control plane (in-memory store) behind an httptest server.
type env struct {
	t   *testing.T
	st  store.Store
	srv *httptest.Server
	app *App
	out *bytes.Buffer
}

func newEnv(t *testing.T) *env {
	t.Helper()
	st, _ := store.Open("")
	cp := api.New(api.Config{APIToken: "tok", NodeToken: "nt", BaseDomain: "apps.test"}, st)
	srv := httptest.NewServer(cp.Handler())
	t.Cleanup(srv.Close)
	out := &bytes.Buffer{}
	return &env{t: t, st: st, srv: srv, out: out,
		app: &App{BaseURL: srv.URL, Token: "tok", HTTP: srv.Client(), Out: out, Err: out, Poll: 10 * time.Millisecond}}
}

func (e *env) run(args ...string) (string, error) {
	e.t.Helper()
	e.out.Reset()
	err := e.app.Run(context.Background(), args[0], args[1:])
	return e.out.String(), err
}

func (e *env) must(args ...string) string {
	e.t.Helper()
	out, err := e.run(args...)
	if err != nil {
		e.t.Fatalf("lp %v: %v\n%s", args, err, out)
	}
	return out
}

func TestDeployListStatusEnvAndDelete(t *testing.T) {
	e := newEnv(t)
	out := e.must("deploy", "web", "--image", "nginx:1", "--port", "80", "-e", "A=1", "-e", "B=two=2", "--volume", "data:/data", "--memory", "256")
	if !strings.Contains(out, "created web") || !strings.Contains(out, "web.apps.test") {
		t.Fatalf("deploy output: %q", out)
	}
	svcs, _ := e.st.ListServices()
	if len(svcs) != 1 || svcs[0].Env["B"] != "two=2" || svcs[0].Volumes[0].Path != "/data" || svcs[0].MemoryMB != 256 || svcs[0].Port != 80 {
		t.Fatalf("stored: %+v", svcs)
	}
	// Flags may follow the positional name too.
	e.must("deploy", "--git", "https://github.com/o/r", "api")
	if out := e.must("webhook", "api"); !strings.Contains(out, "/hooks/github/") || !strings.Contains(out, "secret: ") {
		t.Fatalf("webhook: %q", out)
	}
	if _, err := e.run("webhook", "web"); err == nil {
		t.Fatal("image service has no webhook")
	}

	if out := e.must("ls"); !strings.Contains(out, "web") || !strings.Contains(out, "pending") || !strings.Contains(out, "api") {
		t.Fatalf("ls: %q", out)
	}
	if out := e.must("status", "web"); !strings.Contains(out, "revision") || !strings.Contains(out, "nginx:1") || !strings.Contains(out, "created") {
		t.Fatalf("status: %q", out)
	}

	if out := e.must("env", "web"); out != "A=1\nB=two=2\n" {
		t.Fatalf("env: %q", out)
	}
	e.must("env", "web", "C=3", "A=10", "--unset", "B")
	if out := e.must("env", "web"); out != "A=10\nC=3\n" {
		t.Fatalf("env after merge: %q", out)
	}
	if _, err := e.run("env", "web", "NOEQUALS"); err == nil {
		t.Fatal("malformed KEY=value accepted")
	}

	e.must("redeploy", "web")
	got, _ := e.st.GetService(svcs[0].ID)
	if got.Revision != 3 { // created, env change, redeploy
		t.Fatalf("revision %d, want 3", got.Revision)
	}
	e.must("domains", "web", "add", "shop.example.org")
	if out := e.must("domains", "web"); !strings.Contains(out, "shop.example.org") {
		t.Fatalf("domains: %q", out)
	}
	e.must("domains", "web", "rm", "SHOP.example.org")
	if out := e.must("domains", "web"); strings.Contains(out, "shop.example.org") {
		t.Fatalf("domain not removed: %q", out)
	}

	e.must("rm", "web")
	if _, err := e.run("status", "web"); err == nil || !strings.Contains(err.Error(), `no service named "web"`) {
		t.Fatalf("after rm: %v", err)
	}
}

func TestRollback(t *testing.T) {
	e := newEnv(t)
	e.must("deploy", "web", "--image", "nginx:1")
	e.must("env", "web", "V=2")
	if _, err := e.run("rollback", "web", "9"); err == nil {
		t.Fatal("unknown revision accepted")
	}
	e.must("rollback", "web", "1")
	svcs, _ := e.st.ListServices()
	if svcs[0].Revision != 3 || len(svcs[0].Env) != 0 {
		t.Fatalf("after rollback: rev %d env %v", svcs[0].Revision, svcs[0].Env)
	}
}

func TestLogsFollowStreamsNewLinesOnce(t *testing.T) {
	e := newEnv(t)
	e.must("deploy", "web", "--image", "nginx:1")
	svcs, _ := e.st.ListServices()
	id := svcs[0].ID
	now := time.Now()
	_ = e.st.AppendLogs(id, []model.LogLine{{Time: now, Revision: 1, Text: "one"}, {Time: now, Revision: 1, Text: "two"}})

	if out := e.must("logs", "web", "-n", "1"); !strings.Contains(out, "two") || strings.Contains(out, "one") {
		t.Fatalf("-n 1 should print only the newest line: %q", out)
	}

	ctx, cancel := context.WithCancel(context.Background())
	e.out.Reset()
	done := make(chan error, 1)
	go func() { done <- e.app.Run(ctx, "logs", []string{"web", "-f"}) }()
	time.Sleep(60 * time.Millisecond)
	_ = e.st.AppendLogs(id, []model.LogLine{{Time: now, Revision: 1, Text: "three"}})
	time.Sleep(80 * time.Millisecond)
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	out := e.out.String()
	for _, w := range []string{"one", "two", "three"} {
		if strings.Count(out, " "+w+"\n") != 1 {
			t.Fatalf("%q should appear exactly once in:\n%s", w, out)
		}
	}
}

func TestErrorsAreReadable(t *testing.T) {
	e := newEnv(t)
	if _, err := e.run("deploy", "Bad Name", "--image", "x"); err == nil || !strings.Contains(err.Error(), "name must match") {
		t.Fatalf("server validation error not surfaced: %v", err)
	}
	if _, err := e.run("deploy", "x"); err == nil {
		t.Fatal("deploy without a source accepted")
	}
	if _, err := e.run("nope"); err == nil || !strings.Contains(err.Error(), "unknown command") {
		t.Fatalf("%v", err)
	}
	bad := &App{BaseURL: e.srv.URL, Token: "wrong", HTTP: e.srv.Client(), Out: e.out, Err: e.out}
	if err := bad.Run(context.Background(), "ls", nil); err == nil || !strings.Contains(err.Error(), "unauthorized") {
		t.Fatalf("%v", err)
	}
	if err := (&App{}).Run(context.Background(), "ls", nil); err == nil || !strings.Contains(err.Error(), "LP_API_TOKEN") {
		t.Fatalf("%v", err)
	}
}
