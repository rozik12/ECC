// Package api is the control plane HTTP surface: a user API for the CLI and
// dashboard, and an internal API for node agents and the edge.
package api

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"log"
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
	st  store.Store
	now func() time.Time
}

func New(cfg Config, st store.Store) *Server {
	if cfg.NodeTTL == 0 {
		cfg.NodeTTL = 15 * time.Second
	}
	return &Server{cfg: cfg, st: st, now: time.Now}
}

type View struct {
	model.Service
	// State is the state of the newest revision: pending, building, starting,
	// running or failed. While it is not running, ServingRevision names the
	// older revision still receiving traffic (0 if none).
	State           string `json:"state"`
	Error           string `json:"error,omitempty"`
	ServingRevision int    `json:"serving_revision,omitempty"`
	Upstream        string `json:"upstream,omitempty"`
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

// RunScheduler places services until stop is closed. With several control
// plane replicas only the elected leader schedules.
func (s *Server) RunScheduler(stop <-chan struct{}) {
	t := time.NewTicker(2 * time.Second)
	defer t.Stop()
	for {
		s.RunSchedulerOnce()
		select {
		case <-stop:
			return
		case <-t.C:
		}
	}
}

// RunSchedulerOnce runs one placement pass if this replica is the leader.
func (s *Server) RunSchedulerOnce() {
	if l, ok := s.st.(interface{ IsLeader(context.Context) bool }); ok {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if !l.IsLeader(ctx) {
			return
		}
	}
	if _, err := scheduler.Reconcile(s.st, s.now(), s.cfg.NodeTTL); err != nil {
		log.Printf("scheduler: %v", err)
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

func (s *Server) view(svc model.Service) (View, error) {
	v := View{Service: svc, State: "pending"}
	sts, err := s.st.StatusesOf(svc.ID)
	if err != nil {
		return v, err
	}
	for _, st := range sts {
		if st.Revision == svc.Revision {
			v.State, v.Error = st.State, st.Error
		}
	}
	if live, ok := store.Live(sts); ok {
		if live.Revision != svc.Revision {
			v.ServingRevision = live.Revision
		}
		nodes, err := s.st.ListNodes()
		if err != nil {
			return v, err
		}
		for _, n := range nodes {
			if n.ID == svc.NodeID {
				v.Upstream = fmt.Sprintf("%s:%d", n.Addr, live.HostPort)
			}
		}
	}
	return v, nil
}

func (s *Server) respondView(w http.ResponseWriter, code int, svc model.Service) {
	v, err := s.view(svc)
	if err != nil {
		storeErr(w, err)
		return
	}
	writeJSON(w, code, v)
}

// storeErr maps store errors to HTTP codes; anything unexpected is a 500 so
// callers (notably the edge) keep their last good state instead of trusting
// a half-answer.
func storeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeErr(w, 404, err)
	case errors.Is(err, store.ErrConflict):
		writeErr(w, 409, err)
	default:
		log.Printf("store: %v", err)
		writeErr(w, 500, errors.New("internal error"))
	}
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
	if err != nil {
		storeErr(w, err)
		return
	}
	s.respondView(w, 201, out)
}

func (s *Server) listServices(w http.ResponseWriter, _ *http.Request) {
	svcs, err := s.st.ListServices()
	if err != nil {
		storeErr(w, err)
		return
	}
	out := []View{}
	for _, svc := range svcs {
		v, err := s.view(svc)
		if err != nil {
			storeErr(w, err)
			return
		}
		out = append(out, v)
	}
	writeJSON(w, 200, out)
}

func (s *Server) getService(w http.ResponseWriter, r *http.Request) {
	svc, err := s.st.GetService(r.PathValue("id"))
	if err != nil {
		storeErr(w, err)
		return
	}
	s.respondView(w, 200, svc)
}

func (s *Server) deleteService(w http.ResponseWriter, r *http.Request) {
	if err := s.st.DeleteService(r.PathValue("id")); err != nil {
		storeErr(w, err)
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
		storeErr(w, err)
		return
	}
	s.respondView(w, 200, svc)
}

func (s *Server) redeploy(w http.ResponseWriter, r *http.Request) {
	svc, err := s.st.UpdateService(r.PathValue("id"), func(x *model.Service) { x.Revision++ })
	if err != nil {
		storeErr(w, err)
		return
	}
	s.respondView(w, 200, svc)
}

func (s *Server) listNodes(w http.ResponseWriter, _ *http.Request) {
	type nv struct {
		model.Node
		Healthy bool `json:"healthy"`
	}
	nodes, err := s.st.ListNodes()
	if err != nil {
		storeErr(w, err)
		return
	}
	out := []nv{}
	for _, n := range nodes {
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
		storeErr(w, err)
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
		if errors.Is(err, store.ErrNotFound) {
			writeErr(w, 404, errors.New("unknown node: register first"))
			return
		}
		storeErr(w, err)
		return
	}
	var req heartbeatReq
	if err := decode(w, r, &req); err != nil {
		writeErr(w, 400, err)
		return
	}
	if err := s.st.SetStatuses(id, req.Statuses); err != nil {
		storeErr(w, err)
		return
	}
	svcs, err := s.st.ListServices()
	if err != nil {
		storeErr(w, err)
		return
	}
	resp := heartbeatResp{Services: []model.Service{}}
	for _, svc := range svcs {
		if svc.NodeID == id {
			resp.Services = append(resp.Services, svc)
		}
	}
	writeJSON(w, 200, resp)
}

func (s *Server) routes(w http.ResponseWriter, _ *http.Request) {
	svcs, err := s.st.ListServices()
	if err != nil {
		storeErr(w, err)
		return
	}
	out := []model.Route{}
	for _, svc := range svcs {
		v, err := s.view(svc)
		if err != nil {
			storeErr(w, err)
			return
		}
		if v.Upstream != "" {
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
