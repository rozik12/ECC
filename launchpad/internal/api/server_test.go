package api

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"launchpad/internal/model"
	"launchpad/internal/store"
)

func do(t *testing.T, h http.Handler, method, path, token string, body any) *httptest.ResponseRecorder {
	t.Helper()
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(method, path, bytes.NewReader(b))
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

func TestDeployFlow(t *testing.T) {
	st, _ := store.Open("")
	srv := New(Config{APIToken: "u", NodeToken: "n", BaseDomain: "example.test"}, st)
	h := srv.Handler()

	if w := do(t, h, "GET", "/api/v1/services", "wrong", nil); w.Code != 401 {
		t.Fatalf("auth: %d", w.Code)
	}
	if w := do(t, h, "POST", "/api/v1/services", "u", map[string]any{"name": "Bad Name", "image": "nginx"}); w.Code != 400 {
		t.Fatalf("validation: %d", w.Code)
	}
	if w := do(t, h, "POST", "/api/v1/services", "u", map[string]any{"name": "web", "image": "--privileged"}); w.Code != 400 {
		t.Fatalf("flag-injection image accepted: %d", w.Code)
	}
	w := do(t, h, "POST", "/api/v1/services", "u", map[string]any{"name": "web", "image": "nginx:1", "port": 80})
	if w.Code != 201 {
		t.Fatalf("create: %d %s", w.Code, w.Body)
	}
	var v View
	_ = json.Unmarshal(w.Body.Bytes(), &v)
	if v.Domain != "web.example.test" || v.State != "pending" {
		t.Fatalf("%+v", v)
	}
	if w := do(t, h, "POST", "/api/v1/services", "u", map[string]any{"name": "web", "image": "nginx"}); w.Code != 409 {
		t.Fatalf("dup: %d", w.Code)
	}

	// Node registers, gets the service after scheduling, reports it running.
	w = do(t, h, "POST", "/internal/nodes/register", "n", model.Node{Name: "n1", Addr: "10.0.0.5"})
	var node model.Node
	_ = json.Unmarshal(w.Body.Bytes(), &node)
	srv.RunSchedulerOnce()
	w = do(t, h, "POST", "/internal/nodes/"+node.ID+"/heartbeat", "n", heartbeatReq{})
	var hb heartbeatResp
	_ = json.Unmarshal(w.Body.Bytes(), &hb)
	if len(hb.Services) != 1 {
		t.Fatalf("assigned: %s", w.Body)
	}
	do(t, h, "POST", "/internal/nodes/"+node.ID+"/heartbeat", "n", heartbeatReq{Statuses: []model.Status{
		{ServiceID: v.ID, Revision: 1, State: model.StateRunning, HostPort: 32768}}})

	w = do(t, h, "GET", "/internal/routes", "n", nil)
	var rs []model.Route
	_ = json.Unmarshal(w.Body.Bytes(), &rs)
	if len(rs) != 1 || rs[0].Host != "web.example.test" || rs[0].Upstream != "10.0.0.5:32768" {
		t.Fatalf("routes: %+v", rs)
	}

	// Redeploy: the new revision is not healthy yet, so traffic stays on the old one.
	do(t, h, "POST", "/api/v1/services/"+v.ID+"/redeploy", "u", nil)
	routeFor := func() string {
		w := do(t, h, "GET", "/internal/routes", "n", nil)
		var rs []model.Route
		_ = json.Unmarshal(w.Body.Bytes(), &rs)
		if len(rs) == 0 {
			return ""
		}
		return rs[0].Upstream
	}
	report := func(sts ...model.Status) {
		do(t, h, "POST", "/internal/nodes/"+node.ID+"/heartbeat", "n", heartbeatReq{Statuses: sts})
	}
	report(model.Status{ServiceID: v.ID, Revision: 1, State: model.StateRunning, HostPort: 32768},
		model.Status{ServiceID: v.ID, Revision: 2, State: model.StateStarting, HostPort: 32769})
	if got := routeFor(); got != "10.0.0.5:32768" {
		t.Fatalf("during rollout traffic must stay on rev 1, got %q", got)
	}
	w = do(t, h, "GET", "/api/v1/services/"+v.ID, "u", nil)
	_ = json.Unmarshal(w.Body.Bytes(), &v)
	if v.State != model.StateStarting || v.ServingRevision != 1 {
		t.Fatalf("view during rollout: %+v", v)
	}

	// New revision turns healthy: traffic switches.
	report(model.Status{ServiceID: v.ID, Revision: 1, State: model.StateRunning, HostPort: 32768},
		model.Status{ServiceID: v.ID, Revision: 2, State: model.StateRunning, HostPort: 32769})
	if got := routeFor(); got != "10.0.0.5:32769" {
		t.Fatalf("after healthy, traffic must move to rev 2, got %q", got)
	}

	// A failed rollout must not take the old revision out of rotation.
	do(t, h, "POST", "/api/v1/services/"+v.ID+"/redeploy", "u", nil)
	report(model.Status{ServiceID: v.ID, Revision: 2, State: model.StateRunning, HostPort: 32769},
		model.Status{ServiceID: v.ID, Revision: 3, State: model.StateFailed, Error: "boom"})
	if got := routeFor(); got != "10.0.0.5:32769" {
		t.Fatalf("failed rollout broke routing: %q", got)
	}
}

func TestStaleNodeCannotReport(t *testing.T) {
	st, _ := store.Open("")
	srv := New(Config{APIToken: "u", NodeToken: "n", BaseDomain: "x.test"}, st)
	h := srv.Handler()
	w := do(t, h, "POST", "/api/v1/services", "u", map[string]any{"name": "web", "image": "nginx"})
	var v View
	_ = json.Unmarshal(w.Body.Bytes(), &v)
	w = do(t, h, "POST", "/internal/nodes/register", "n", model.Node{Name: "a", Addr: "10.0.0.1"})
	var a model.Node
	_ = json.Unmarshal(w.Body.Bytes(), &a)
	w = do(t, h, "POST", "/internal/nodes/register", "n", model.Node{Name: "b", Addr: "10.0.0.2"})
	var b model.Node
	_ = json.Unmarshal(w.Body.Bytes(), &b)
	srv.RunSchedulerOnce()
	got, _ := st.GetService(v.ID)
	other := a.ID
	if got.NodeID == a.ID {
		other = b.ID
	}
	do(t, h, "POST", "/internal/nodes/"+other+"/heartbeat", "n", heartbeatReq{Statuses: []model.Status{
		{ServiceID: v.ID, Revision: 1, State: model.StateRunning, HostPort: 1}}})
	if w := do(t, h, "GET", "/internal/routes", "n", nil); w.Body.String() != "[]\n" {
		t.Fatalf("a node that does not own the service created a route: %s", w.Body)
	}
}

// fixture is a control plane with one registered node and a helper to call it.
type fixture struct {
	t    *testing.T
	st   store.Store
	srv  *Server
	h    http.Handler
	node model.Node
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	st, _ := store.Open("")
	srv := New(Config{APIToken: "u", NodeToken: "n", BaseDomain: "apps.test"}, st)
	f := &fixture{t: t, st: st, srv: srv, h: srv.Handler()}
	w := do(t, f.h, "POST", "/internal/nodes/register", "n", model.Node{Name: "n1", Addr: "10.0.0.5"})
	_ = json.Unmarshal(w.Body.Bytes(), &f.node)
	return f
}

func (f *fixture) create(body map[string]any) View {
	f.t.Helper()
	w := do(f.t, f.h, "POST", "/api/v1/services", "u", body)
	if w.Code != 201 {
		f.t.Fatalf("create: %d %s", w.Code, w.Body)
	}
	var v View
	_ = json.Unmarshal(w.Body.Bytes(), &v)
	f.srv.RunSchedulerOnce()
	return v
}

func (f *fixture) get(id string) View {
	f.t.Helper()
	w := do(f.t, f.h, "GET", "/api/v1/services/"+id, "u", nil)
	var v View
	_ = json.Unmarshal(w.Body.Bytes(), &v)
	return v
}

func (f *fixture) beat(req heartbeatReq) {
	f.t.Helper()
	if w := do(f.t, f.h, "POST", "/internal/nodes/"+f.node.ID+"/heartbeat", "n", req); w.Code != 200 {
		f.t.Fatalf("heartbeat: %d %s", w.Code, w.Body)
	}
}

func (f *fixture) code(method, path string, body any) int {
	return do(f.t, f.h, method, path, "u", body).Code
}

func TestCreateIgnoresPlatformControlledFields(t *testing.T) {
	f := newFixture(t)
	v := f.create(map[string]any{"name": "web", "image": "nginx", "node_id": "evil", "webhook_secret": "mine",
		"revision": 99, "pin_commit": "x", "custom_domains": []string{"steal.example.org"},
		"history": []map[string]any{{"revision": 7}}, "domain": "bank.com"})
	if v.Revision != 1 || v.PinCommit != "" || v.WebhookSecret != "" || len(v.CustomDomains) != 0 ||
		v.Domain != "web.apps.test" || len(v.History) != 1 || v.NodeID == "evil" {
		t.Fatalf("client set platform fields: %+v", v)
	}
}

func TestRollbackPinsBuiltCommitAndRedeployUnpins(t *testing.T) {
	f := newFixture(t)
	v := f.create(map[string]any{"name": "app", "git_url": "https://github.com/o/r", "git_ref": "main", "port": 3000, "env": map[string]string{"V": "1"}})
	if v.WebhookSecret == "" {
		t.Fatal("git service has no webhook secret")
	}
	// Revision 1 is never built: it cannot be rolled back to yet.
	do(t, f.h, "POST", "/api/v1/services/"+v.ID+"/redeploy", "u", nil)
	if c := f.code("POST", "/api/v1/services/"+v.ID+"/rollback", map[string]int{"revision": 1}); c != 409 {
		t.Fatalf("rollback to unbuilt revision: %d", c)
	}
	// The agent reports the commit it built for revision 1, then revision 2 moves on.
	f.beat(heartbeatReq{Statuses: []model.Status{{ServiceID: v.ID, Revision: 1, State: model.StateRunning, HostPort: 1, Commit: "aaaa111"}}})
	do(t, f.h, "PUT", "/api/v1/services/"+v.ID+"/env", "u", map[string]string{"V": "2"})

	if c := f.code("POST", "/api/v1/services/"+v.ID+"/rollback", map[string]int{"revision": 9}); c != 404 {
		t.Fatalf("unknown revision: %d", c)
	}
	if c := f.code("POST", "/api/v1/services/"+v.ID+"/rollback", map[string]int{"revision": 1}); c != 200 {
		t.Fatalf("rollback: %d", c)
	}
	got := f.get(v.ID)
	if got.Revision != 4 || got.PinCommit != "aaaa111" || got.Env["V"] != "1" || got.BuildRef() != "aaaa111" {
		t.Fatalf("after rollback: rev=%d pin=%q env=%v", got.Revision, got.PinCommit, got.Env)
	}
	if last := got.History[len(got.History)-1]; last.Note != "rollback to 1" || last.Commit != "aaaa111" {
		t.Fatalf("history: %+v", last)
	}
	// A normal redeploy goes back to tracking the branch.
	do(t, f.h, "POST", "/api/v1/services/"+v.ID+"/redeploy", "u", nil)
	if got = f.get(v.ID); got.PinCommit != "" || got.BuildRef() != "main" {
		t.Fatalf("redeploy kept the pin: %q", got.PinCommit)
	}
	if c := f.code("POST", "/api/v1/services/"+v.ID+"/rollback", map[string]int{"revision": got.Revision}); c != 409 {
		t.Fatalf("rollback to current: %d", c)
	}
}

func sign(secret string, body []byte) string {
	m := hmac.New(sha256.New, []byte(secret))
	m.Write(body)
	return "sha256=" + hex.EncodeToString(m.Sum(nil))
}

func hook(t *testing.T, f *fixture, id, event, secret string, payload any) *httptest.ResponseRecorder {
	t.Helper()
	b, _ := json.Marshal(payload)
	req := httptest.NewRequest("POST", "/hooks/github/"+id, bytes.NewReader(b))
	req.Header.Set("X-GitHub-Event", event)
	req.Header.Set("X-Hub-Signature-256", sign(secret, b))
	w := httptest.NewRecorder()
	f.h.ServeHTTP(w, req)
	return w
}

func TestGithubWebhook(t *testing.T) {
	f := newFixture(t)
	v := f.create(map[string]any{"name": "app", "git_url": "https://github.com/o/r", "git_ref": "release"})
	push := func(ref string) map[string]any {
		return map[string]any{"ref": ref, "after": "0123456789abcdef0123456789abcdef01234567"}
	}

	if w := hook(t, f, v.ID, "push", "wrong-secret", push("refs/heads/release")); w.Code != 401 {
		t.Fatalf("bad signature: %d", w.Code)
	}
	if w := hook(t, f, "ffffffffffff", "push", v.WebhookSecret, push("refs/heads/release")); w.Code != 401 {
		t.Fatalf("unknown service must look like a bad signature: %d", w.Code)
	}
	req := httptest.NewRequest("POST", "/hooks/github/"+v.ID, strings.NewReader("{}"))
	w := httptest.NewRecorder()
	f.h.ServeHTTP(w, req)
	if w.Code != 401 {
		t.Fatalf("missing signature: %d", w.Code)
	}
	if w := hook(t, f, v.ID, "ping", v.WebhookSecret, map[string]any{}); w.Code != 200 {
		t.Fatalf("ping: %d", w.Code)
	}
	if w := hook(t, f, v.ID, "push", v.WebhookSecret, push("refs/heads/feature")); w.Code != 202 || f.get(v.ID).Revision != 1 {
		t.Fatalf("other branch deployed: %d rev=%d", w.Code, f.get(v.ID).Revision)
	}
	if w := hook(t, f, v.ID, "push", v.WebhookSecret, push("refs/tags/v1")); f.get(v.ID).Revision != 1 || w.Code != 202 {
		t.Fatal("tag push deployed")
	}
	if w := hook(t, f, v.ID, "push", v.WebhookSecret, map[string]any{"ref": "refs/heads/release", "deleted": true}); f.get(v.ID).Revision != 1 || w.Code != 202 {
		t.Fatal("branch deletion deployed")
	}
	if w := hook(t, f, v.ID, "push", v.WebhookSecret, push("refs/heads/release")); w.Code != 202 {
		t.Fatalf("push: %d %s", w.Code, w.Body)
	}
	got := f.get(v.ID)
	if got.Revision != 2 || got.History[1].Note != "push 0123456" {
		t.Fatalf("push did not deploy: rev=%d %+v", got.Revision, got.History)
	}

	// Image services have no webhook secret, so the endpoint is closed for them.
	img := f.create(map[string]any{"name": "img", "image": "nginx"})
	if w := hook(t, f, img.ID, "push", "", push("refs/heads/main")); w.Code != 401 {
		t.Fatalf("image service accepted a webhook: %d", w.Code)
	}
}

func TestPushMatches(t *testing.T) {
	for _, c := range []struct {
		tracked, ref string
		want         bool
	}{
		{"", "refs/heads/main", true}, {"", "refs/heads/master", true}, {"", "refs/heads/dev", false},
		{"dev", "refs/heads/dev", true}, {"dev", "refs/heads/main", false}, {"dev", "refs/tags/dev", false},
	} {
		if got := pushMatches(c.tracked, c.ref); got != c.want {
			t.Errorf("pushMatches(%q,%q)=%v", c.tracked, c.ref, got)
		}
	}
}

func TestCustomDomains(t *testing.T) {
	f := newFixture(t)
	a := f.create(map[string]any{"name": "shop", "image": "nginx"})
	b := f.create(map[string]any{"name": "blog", "image": "nginx"})
	add := func(id, d string) int {
		return f.code("POST", "/api/v1/services/"+id+"/domains", map[string]string{"domain": d})
	}
	if c := add(a.ID, "Shop.Example.org."); c != 201 {
		t.Fatalf("add: %d", c)
	}
	if c := add(a.ID, "shop.example.org"); c != 200 {
		t.Fatalf("idempotent add: %d", c)
	}
	if c := add(b.ID, "shop.example.org"); c != 409 {
		t.Fatalf("domain taken by another service: %d", c)
	}
	for _, bad := range []string{"apps.test", "x.apps.test", "localhost", "10.0.0.1", "a b.com", "-x.com", ""} {
		if c := add(a.ID, bad); c != 400 {
			t.Errorf("accepted %q: %d", bad, c)
		}
	}
	if got := f.get(a.ID); len(got.CustomDomains) != 1 || got.CustomDomains[0] != "shop.example.org" {
		t.Fatalf("%+v", got.CustomDomains)
	}

	// Once running, the custom domain routes like the platform name.
	f.beat(heartbeatReq{Statuses: []model.Status{{ServiceID: a.ID, Revision: 1, State: model.StateRunning, HostPort: 4000}}})
	w := do(t, f.h, "GET", "/internal/routes", "n", nil)
	var rs []model.Route
	_ = json.Unmarshal(w.Body.Bytes(), &rs)
	hosts := map[string]string{}
	for _, r := range rs {
		hosts[r.Host] = r.Upstream
	}
	if hosts["shop.apps.test"] != "10.0.0.5:4000" || hosts["shop.example.org"] != "10.0.0.5:4000" || len(hosts) != 2 {
		t.Fatalf("routes: %v", hosts)
	}

	if c := f.code("DELETE", "/api/v1/services/"+a.ID+"/domains/shop.example.org", nil); c != 200 {
		t.Fatalf("remove: %d", c)
	}
	if c := add(b.ID, "shop.example.org"); c != 201 {
		t.Fatalf("domain not freed: %d", c)
	}
	for i := 0; i < maxCustomDomains; i++ {
		add(a.ID, fmt.Sprintf("d%d.example.org", i))
	}
	if c := add(a.ID, "one-too-many.example.org"); c != 400 {
		t.Fatalf("domain limit: %d", c)
	}
}

func TestLogShippingAndReading(t *testing.T) {
	f := newFixture(t)
	v := f.create(map[string]any{"name": "web", "image": "nginx"})
	now := time.Now()
	f.beat(heartbeatReq{Logs: []model.LogBatch{{ServiceID: v.ID, Revision: 1, Lines: []model.LogLine{
		{Time: now, Text: "listening"}, {Time: now, Text: strings.Repeat("x", 10000)}}}}})

	// Another node cannot write logs for a service it does not run.
	w := do(t, f.h, "POST", "/internal/nodes/register", "n", model.Node{Name: "n2", Addr: "10.0.0.6"})
	var other model.Node
	_ = json.Unmarshal(w.Body.Bytes(), &other)
	do(t, f.h, "POST", "/internal/nodes/"+other.ID+"/heartbeat", "n", heartbeatReq{Logs: []model.LogBatch{
		{ServiceID: v.ID, Revision: 1, Lines: []model.LogLine{{Time: now, Text: "forged"}}}}})

	read := func(q string) (lines []model.LogLine, next int64) {
		w := do(t, f.h, "GET", "/api/v1/services/"+v.ID+"/logs"+q, "u", nil)
		var resp struct {
			Lines []model.LogLine `json:"lines"`
			Next  int64           `json:"next"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		return resp.Lines, resp.Next
	}
	lines, next := read("")
	if len(lines) != 2 || lines[0].Text != "listening" || lines[0].Revision != 1 || len(lines[1].Text) != model.MaxLogLineBytes {
		t.Fatalf("lines: %+v", lines)
	}
	if more, n2 := read(fmt.Sprintf("?after=%d", next)); len(more) != 0 || n2 != next {
		t.Fatalf("cursor re-read: %+v next=%d", more, n2)
	}
	if c := f.code("GET", "/api/v1/services/ffffffffffff/logs", nil); c != 404 {
		t.Fatalf("logs for unknown service: %d", c)
	}
}

func TestPatchValidatesAndRevisions(t *testing.T) {
	f := newFixture(t)
	v := f.create(map[string]any{"name": "web", "image": "nginx:1", "port": 80})
	patch := func(body map[string]any) int { return f.code("PATCH", "/api/v1/services/"+v.ID, body) }
	if c := patch(map[string]any{"port": 70000}); c != 400 {
		t.Fatalf("bad port: %d", c)
	}
	if c := patch(map[string]any{"memory_mb": 999999}); c != 400 {
		t.Fatalf("bad memory: %d", c)
	}
	if c := patch(map[string]any{"volumes": []map[string]string{{"name": "d", "path": "/../etc"}}}); c != 400 {
		t.Fatalf("volume path traversal accepted: %d", c)
	}
	if got := f.get(v.ID); got.Revision != 1 {
		t.Fatalf("rejected patches must not bump the revision: %d", got.Revision)
	}
	if c := patch(map[string]any{"image": "nginx:2", "port": 8081, "health_path": "/up", "memory_mb": 1024, "cpus": 2,
		"volumes": []map[string]string{{"name": "data", "path": "/data"}}, "git_ref": "ignored-for-image-service"}); c != 200 {
		t.Fatalf("patch: %d", c)
	}
	got := f.get(v.ID)
	if got.Revision != 2 || got.Image != "nginx:2" || got.Port != 8081 || got.Memory() != 1024 || got.CPU() != 2 ||
		len(got.Volumes) != 1 || got.GitRef != "" || got.History[1].Image != "nginx:2" {
		t.Fatalf("%+v", got)
	}
}

func TestDashboardIsServedWithStrictCSP(t *testing.T) {
	f := newFixture(t)
	req := httptest.NewRequest("GET", "/", nil)
	w := httptest.NewRecorder()
	f.h.ServeHTTP(w, req)
	if w.Code != 200 || !strings.Contains(w.Header().Get("Content-Security-Policy"), "script-src 'self'") ||
		strings.Contains(w.Header().Get("Content-Security-Policy"), "unsafe-inline") {
		t.Fatalf("%d csp=%q", w.Code, w.Header().Get("Content-Security-Policy"))
	}
	if w := do(t, f.h, "GET", "/api/v1/services", "u", nil); w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("API responses must not be cacheable")
	}
}
