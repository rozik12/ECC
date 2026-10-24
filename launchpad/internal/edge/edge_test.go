package edge

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"launchpad/internal/model"
)

func newEdge(t *testing.T, cp http.HandlerFunc) *Edge {
	t.Helper()
	srv := httptest.NewServer(cp)
	t.Cleanup(srv.Close)
	return &Edge{URL: srv.URL, Token: "n", HTTP: srv.Client()}
}

func TestProxiesByHostAndKeepsLastGoodRoutes(t *testing.T) {
	app := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("host=" + r.Host + " fwd=" + r.Header.Get("X-Forwarded-For")))
	}))
	defer app.Close()

	fail := false
	e := newEdge(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer n" {
			w.WriteHeader(401)
			return
		}
		if fail {
			w.WriteHeader(500)
			return
		}
		_ = json.NewEncoder(w).Encode([]model.Route{
			{Host: "Web.Example.test", Upstream: app.Listener.Addr().String()},
			{Host: "shop.customer.org", Upstream: app.Listener.Addr().String()}})
	})
	if err := e.Refresh(context.Background()); err != nil {
		t.Fatal(err)
	}

	get := func(host string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("GET", "/", nil)
		req.Host = host
		req.RemoteAddr = "203.0.113.9:1234"
		w := httptest.NewRecorder()
		e.ServeHTTP(w, req)
		return w
	}
	if w := get("web.example.test:8080"); w.Code != 200 || w.Body.String() != "host=web.example.test:8080 fwd=203.0.113.9" {
		t.Fatalf("%d %q", w.Code, w.Body)
	}
	if w := get("shop.customer.org"); w.Code != 200 {
		t.Fatalf("custom domain: %d", w.Code)
	}
	if w := get("nope.example.test"); w.Code != 404 {
		t.Fatalf("unknown host: %d", w.Code)
	}

	// Control plane outage must not blank the routing table.
	fail = true
	if err := e.Refresh(context.Background()); err == nil {
		t.Fatal("expected refresh error")
	}
	if w := get("web.example.test"); w.Code != 200 {
		t.Fatalf("routes lost after failed refresh: %d", w.Code)
	}
}

func TestHostPolicyOnlyAllowsKnownHosts(t *testing.T) {
	e := &Edge{routes: map[string]string{"web.example.test": "1.2.3.4:5"}}
	if err := e.HostPolicy(context.Background(), "WEB.example.test"); err != nil {
		t.Fatal(err)
	}
	if err := e.HostPolicy(context.Background(), "evil.test"); err == nil {
		t.Fatal("certificate allowed for unknown host")
	}
}
