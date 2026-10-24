// Package api is the control plane HTTP surface: a user API for the CLI and
// dashboard, and an internal API for node agents and the edge.
package api

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"launchpad/internal/model"
	"launchpad/internal/scheduler"
	"launchpad/internal/store"
)

type Config struct {
	APIToken   string        // bearer token for the user API
	NodeToken  string        // shared secret agents and the edge present
	BaseDomain string        // services get <name>.<BaseDomain>
	NodeTTL    time.Duration // heartbeat age after which a node is dead
}

type Server struct {
	cfg Config
	st  *store.Store
	now func() time.Time
}

func New(cfg Config, st *store.Store) *Server {
	if cfg.NodeTTL == 0 {
		cfg.NodeTTL = 15 * time.Second
	}
	return &Server{cfg: cfg, st: st, now: time.Now}
}

type View struct {
	model.Service
	State    string `json:"state"`
	Error    string `json:"error,omitempty"`
	Upstream string `json:"upstream,omitempty"`
}

func (s *Server) Handler() http.Handler {
	m := http.NewServeMux()
	m.HandleFunc("POST /api/v1/services", s.user(s.createService))
	m.HandleFunc("GET /api/v1/services", s.user(s.listServices))
	m.HandleFunc("GET /api/v1/services/{id}", s.user(s.getService))
	m.HandleFunc("DELETE /api/v1/services/{id}", s.user(s.deleteService))
	m.HandleFunc("PUT /api/v1/services/{id}/env", s.user(s.setEnv))
	m.HandleFunc("POST /api/v1/services/{id}/redeploy", s.user(s.redeploy))
	m.HandleFunc("GET /api/v1/nodes", s.user(s.listNodes))

	m.HandleFunc("POST /internal/nodes/register", s.node(s.register))
	m.HandleFunc("POST /internal/nodes/{id}/heartbeat", s.node(s.heartbeat))
	m.HandleFunc("GET /internal/routes", s.node(s.routes))
	m.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte("ok")) })
	return m
}

// RunScheduler places services until stop is closed.
func (s *Server) RunScheduler(stop <-chan struct{}) {
	t := time.NewTicker(2 * time.Second)
	defer t.Stop()
	for {
		scheduler.Reconcile(s.st, s.now(), s.cfg.NodeTTL)
		select {
		case <-stop:
			return
		case <-t.C:
		}
	}
}

func (s *Server) user(h http.HandlerFunc) http.HandlerFunc { return s.auth(s.cfg.APIToken, h) }
func (s *Server) node(h http.HandlerFunc) http.HandlerFunc { return s.auth(s.cfg.NodeToken, h) }

func (s *Server) auth(token string, h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if token == "" || subtle.ConstantTimeCompare([]byte(got), []byte(token)) != 1 {
			writeErr(w, http.StatusUnauthorized, errors.New("unauthorized"))
			return
		}
		h(w, r)
	}
}

func (s *Server) view(svc model.Service) View {
	v := View{Service: svc, State: "pending"}
	if st, ok := s.st.StatusOf(svc.ID); ok {
		v.State, v.Error = st.State, st.Error
		if st.State == model.StateRunning {
			for _, n := range s.st.ListNodes() {
				if n.ID == svc.NodeID {
					v.Upstream = fmt.Sprintf("%s:%d", n.Addr, st.HostPort)
				}
			}
		}
	}
	return v
}

func (s *Server) createService(w http.ResponseWriter, r *http.Request) {
	var svc model.Service
	if err := decode(w, r, &svc); err != nil {
		writeErr(w, 400, err)
		return
	}
	if svc.Port == 0 {
		svc.Port = 8080
	}
	if err := svc.Validate(); err != nil {
		writeErr(w, 400, err)
		return
	}
	svc.NodeID, svc.Domain = "", svc.Name+"."+s.cfg.BaseDomain
	out, err := s.st.CreateService(svc)
	if errors.Is(err, store.ErrConflict) {
		writeErr(w, 409, err)
		return
	} else if err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 201, s.view(out))
}

func (s *Server) listServices(w http.ResponseWriter, _ *http.Request) {
	out := []View{}
	for _, svc := range s.st.ListServices() {
		out = append(out, s.view(svc))
	}
	writeJSON(w, 200, out)
}

func (s *Server) getService(w http.ResponseWriter, r *http.Request) {
	svc, err := s.st.GetService(r.PathValue("id"))
	if err != nil {
		writeErr(w, 404, err)
		return
	}
	writeJSON(w, 200, s.view(svc))
}

func (s *Server) deleteService(w http.ResponseWriter, r *http.Request) {
	if err := s.st.DeleteService(r.PathValue("id")); err != nil {
		writeErr(w, 404, err)
		return
	}
	w.WriteHeader(204)
}

func (s *Server) setEnv(w http.ResponseWriter, r *http.Request) {
	var env map[string]string
	if err := decode(w, r, &env); err != nil {
		writeErr(w, 400, err)
		return
	}
	if err := model.ValidateEnv(env); err != nil {
		writeErr(w, 400, err)
		return
	}
	svc, err := s.st.UpdateService(r.PathValue("id"), func(x *model.Service) { x.Env = env; x.Revision++ })
	if err != nil {
		writeErr(w, 404, err)
		return
	}
	writeJSON(w, 200, s.view(svc))
}

func (s *Server) redeploy(w http.ResponseWriter, r *http.Request) {
	svc, err := s.st.UpdateService(r.PathValue("id"), func(x *model.Service) { x.Revision++ })
	if err != nil {
		writeErr(w, 404, err)
		return
	}
	writeJSON(w, 200, s.view(svc))
}

func (s *Server) listNodes(w http.ResponseWriter, _ *http.Request) {
	type nv struct {
		model.Node
		Healthy bool `json:"healthy"`
	}
	out := []nv{}
	for _, n := range s.st.ListNodes() {
		out = append(out, nv{n, scheduler.Healthy(n, s.now(), s.cfg.NodeTTL)})
	}
	writeJSON(w, 200, out)
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var n model.Node
	if err := decode(w, r, &n); err != nil || n.Name == "" || n.Addr == "" {
		writeErr(w, 400, errors.New("name and addr required"))
		return
	}
	if !model.ValidID(n.ID) {
		n.ID = store.NewID()
	}
	n.LastSeen = s.now()
	if err := s.st.UpsertNode(n); err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 200, n)
}

type heartbeatReq struct {
	Statuses []model.Status `json:"statuses"`
}
type heartbeatResp struct {
	Services []model.Service `json:"services"`
}

func (s *Server) heartbeat(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := s.st.Touch(id, s.now()); err != nil {
		writeErr(w, 404, errors.New("unknown node: register first"))
		return
	}
	var req heartbeatReq
	if err := decode(w, r, &req); err != nil {
		writeErr(w, 400, err)
		return
	}
	s.st.SetStatuses(id, req.Statuses)
	resp := heartbeatResp{Services: []model.Service{}}
	for _, svc := range s.st.ListServices() {
		if svc.NodeID == id {
			resp.Services = append(resp.Services, svc)
		}
	}
	writeJSON(w, 200, resp)
}

func (s *Server) routes(w http.ResponseWriter, _ *http.Request) {
	out := []model.Route{}
	for _, svc := range s.st.ListServices() {
		if v := s.view(svc); v.Upstream != "" {
			out = append(out, model.Route{Host: svc.Domain, Upstream: v.Upstream})
		}
	}
	writeJSON(w, 200, out)
}

func decode(w http.ResponseWriter, r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	return json.NewDecoder(r.Body).Decode(v)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, err error) {
	writeJSON(w, code, map[string]string{"error": err.Error()})
}

// RunSchedulerOnce runs a single placement pass (used by tests and startup).
func (s *Server) RunSchedulerOnce() { scheduler.Reconcile(s.st, s.now(), s.cfg.NodeTTL) }
