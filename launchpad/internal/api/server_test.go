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

	// Env change bumps the revision, so the old running status stops counting.
	do(t, h, "PUT", "/api/v1/services/"+v.ID+"/env", "u", map[string]string{"A": "1"})
	w = do(t, h, "GET", "/internal/routes", "n", nil)
	_ = json.Unmarshal(w.Body.Bytes(), &rs)
	if len(rs) != 0 {
		t.Fatalf("stale revision still routed: %+v", rs)
	}
}
