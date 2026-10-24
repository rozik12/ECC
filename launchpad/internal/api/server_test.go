package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

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
