// Package api is the control plane HTTP surface: a user API for the CLI and
// dashboard, a signed webhook for GitHub, and an internal API for node agents
// and the edge.
package api

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"launchpad/internal/model"
	"launchpad/internal/scheduler"
	"launchpad/internal/store"
	"launchpad/internal/web"
)

type Config struct {
	APIToken   string        // bearer token for the user API
	NodeToken  string        // shared secret agents and the edge present
	BaseDomain string        // services get <name>.<BaseDomain>
	NodeTTL    time.Duration // heartbeat age after which a node is dead
}

const (
	maxCustomDomains = 5
	maxHeartbeatBody = 8 << 20
	maxWebhookBody   = 5 << 20
)

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

// View is a service plus its live deployment state.
type View struct {
	model.Service
	// State is the state of the newest revision: pending, building, starting,
	// running or failed. While it is not running, ServingRevision names the
	// older revision still receiving traffic (0 if none).
	State           string `json:"state"`
	Error           string `json:"error,omitempty"`
	ServingRevision int    `json:"serving_revision,omitempty"`
	Upstream        string `json:"upstream,omitempty"`
	NodeName        string `json:"node_name,omitempty"`
}

func (s *Server) Handler() http.Handler {
	m := http.NewServeMux()
	m.HandleFunc("POST /api/v1/services", s.user(s.createService))
	m.HandleFunc("GET /api/v1/services", s.user(s.listServices))
	m.HandleFunc("GET /api/v1/services/{id}", s.user(s.getService))
	m.HandleFunc("PATCH /api/v1/services/{id}", s.user(s.patchService))
	m.HandleFunc("DELETE /api/v1/services/{id}", s.user(s.deleteService))
	m.HandleFunc("PUT /api/v1/services/{id}/env", s.user(s.setEnv))
	m.HandleFunc("POST /api/v1/services/{id}/redeploy", s.user(s.redeploy))
	m.HandleFunc("POST /api/v1/services/{id}/rollback", s.user(s.rollback))
	m.HandleFunc("POST /api/v1/services/{id}/reschedule", s.user(s.reschedule))
	m.HandleFunc("GET /api/v1/services/{id}/logs", s.user(s.logs))
	m.HandleFunc("POST /api/v1/services/{id}/domains", s.user(s.addDomain))
	m.HandleFunc("DELETE /api/v1/services/{id}/domains/{domain}", s.user(s.removeDomain))
	m.HandleFunc("GET /api/v1/nodes", s.user(s.listNodes))

	m.HandleFunc("POST /hooks/github/{id}", s.githubWebhook)

	m.HandleFunc("POST /internal/nodes/register", s.node(s.register))
	m.HandleFunc("POST /internal/nodes/{id}/heartbeat", s.node(s.heartbeat))
	m.HandleFunc("GET /internal/routes", s.node(s.routes))
	m.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte("ok")) })
	m.Handle("/", web.Handler())
	return secure(m)
}

// secure adds headers that are right for every response. API responses are
// never cacheable (they carry secrets); the dashboard sets its own policy.
func secure(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		if strings.HasPrefix(r.URL.Path, "/api/") || strings.HasPrefix(r.URL.Path, "/internal/") {
			w.Header().Set("Cache-Control", "no-store")
		}
		next.ServeHTTP(w, r)
	})
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
	nodes, err := s.st.ListNodes()
	if err != nil {
		return v, err
	}
	for _, n := range nodes {
		if n.ID == svc.NodeID {
			v.NodeName = n.Name
			if live, ok := store.Live(sts); ok {
				v.Upstream = fmt.Sprintf("%s:%d", n.Addr, live.HostPort)
			}
		}
	}
	if live, ok := store.Live(sts); ok && live.Revision != svc.Revision {
		v.ServingRevision = live.Revision
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

// spec is the part of a service a client may set. Everything else (id,
// revision, history, node, domains, secrets) is controlled by the platform.
type spec struct {
	Name       string            `json:"name"`
	Image      string            `json:"image"`
	GitURL     string            `json:"git_url"`
	GitRef     string            `json:"git_ref"`
	Port       int               `json:"port"`
	HealthPath string            `json:"health_path"`
	Env        map[string]string `json:"env"`
	MemoryMB   int               `json:"memory_mb"`
	CPUs       float64           `json:"cpus"`
	Volumes    []model.Volume    `json:"volumes"`
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (s *Server) createService(w http.ResponseWriter, r *http.Request) {
	var sp spec
	if err := decode(w, r, 1<<20, &sp); err != nil {
		writeErr(w, 400, err)
		return
	}
	if sp.Port == 0 {
		sp.Port = 8080
	}
	svc := model.Service{Name: sp.Name, Image: sp.Image, GitURL: sp.GitURL, GitRef: sp.GitRef,
		Port: sp.Port, HealthPath: sp.HealthPath, Env: sp.Env, MemoryMB: sp.MemoryMB, CPUs: sp.CPUs, Volumes: sp.Volumes}
	if err := svc.Validate(); err != nil {
		writeErr(w, 400, err)
		return
	}
	svc.Domain = svc.Name + "." + s.cfg.BaseDomain
	if svc.GitURL != "" {
		svc.WebhookSecret = randomHex(24)
	}
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

// patch is a partial update of the fields that can change after creation.
type patch struct {
	Image      *string         `json:"image"`
	GitRef     *string         `json:"git_ref"`
	Port       *int            `json:"port"`
	HealthPath *string         `json:"health_path"`
	MemoryMB   *int            `json:"memory_mb"`
	CPUs       *float64        `json:"cpus"`
	Volumes    *[]model.Volume `json:"volumes"`
}

func (p patch) apply(x *model.Service) {
	if p.Image != nil && x.GitURL == "" {
		x.Image = *p.Image
	}
	if p.GitRef != nil && x.GitURL != "" {
		x.GitRef, x.PinCommit = *p.GitRef, ""
	}
	if p.Port != nil {
		x.Port = *p.Port
	}
	if p.HealthPath != nil {
		x.HealthPath = *p.HealthPath
	}
	if p.MemoryMB != nil {
		x.MemoryMB = *p.MemoryMB
	}
	if p.CPUs != nil {
		x.CPUs = *p.CPUs
	}
	if p.Volumes != nil {
		x.Volumes = *p.Volumes
	}
}

func (s *Server) patchService(w http.ResponseWriter, r *http.Request) {
	var p patch
	if err := decode(w, r, 1<<20, &p); err != nil {
		writeErr(w, 400, err)
		return
	}
	id := r.PathValue("id")
	cur, err := s.st.GetService(id)
	if err != nil {
		storeErr(w, err)
		return
	}
	probe := cur
	p.apply(&probe)
	if err := probe.Validate(); err != nil {
		writeErr(w, 400, err)
		return
	}
	svc, err := s.st.UpdateService(id, func(x *model.Service) { p.apply(x); x.Bump("config updated", s.now()) })
	if err != nil {
		storeErr(w, err)
		return
	}
	s.respondView(w, 200, svc)
}

func (s *Server) setEnv(w http.ResponseWriter, r *http.Request) {
	var env map[string]string
	if err := decode(w, r, 1<<20, &env); err != nil {
		writeErr(w, 400, err)
		return
	}
	if err := model.ValidateEnv(env); err != nil {
		writeErr(w, 400, err)
		return
	}
	svc, err := s.st.UpdateService(r.PathValue("id"), func(x *model.Service) { x.Env = env; x.Bump("env updated", s.now()) })
	if err != nil {
		storeErr(w, err)
		return
	}
	s.respondView(w, 200, svc)
}

// redeploy rebuilds from the tracked ref (clearing any rollback pin).
func (s *Server) redeploy(w http.ResponseWriter, r *http.Request) {
	svc, err := s.st.UpdateService(r.PathValue("id"), func(x *model.Service) { x.PinCommit = ""; x.Bump("redeploy", s.now()) })
	if err != nil {
		storeErr(w, err)
		return
	}
	s.respondView(w, 200, svc)
}

func (s *Server) rollback(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Revision int `json:"revision"`
	}
	if err := decode(w, r, 1<<10, &req); err != nil {
		writeErr(w, 400, err)
		return
	}
	id := r.PathValue("id")
	cur, err := s.st.GetService(id)
	if err != nil {
		storeErr(w, err)
		return
	}
	target, ok := cur.ReleaseOf(req.Revision)
	switch {
	case !ok:
		writeErr(w, 404, errors.New("no such revision in history"))
		return
	case req.Revision == cur.Revision:
		writeErr(w, 409, errors.New("that revision is already current"))
		return
	case cur.GitURL != "" && target.Commit == "":
		writeErr(w, 409, errors.New("that revision was never built, so its commit is unknown"))
		return
	}
	svc, err := s.st.UpdateService(id, func(x *model.Service) {
		x.Image, x.Port, x.HealthPath = target.Image, target.Port, target.HealthPath
		x.Env = copyEnv(target.Env)
		if x.GitURL != "" {
			x.PinCommit = target.Commit
		}
		x.Bump(fmt.Sprintf("rollback to %d", target.Revision), s.now())
	})
	if err != nil {
		storeErr(w, err)
		return
	}
	s.respondView(w, 200, svc)
}

// reschedule forgets the node a service is pinned to. Needed for services with
// volumes when their node is gone for good (the data on it is not moved).
func (s *Server) reschedule(w http.ResponseWriter, r *http.Request) {
	svc, err := s.st.UpdateService(r.PathValue("id"), func(x *model.Service) { x.NodeID = "" })
	if err != nil {
		storeErr(w, err)
		return
	}
	s.respondView(w, 200, svc)
}

func (s *Server) logs(w http.ResponseWriter, r *http.Request) {
	after, _ := strconv.ParseInt(r.URL.Query().Get("after"), 10, 64)
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > store.MaxLogLines {
		limit = 500
	}
	lines, err := s.st.Logs(r.PathValue("id"), after, limit)
	if err != nil {
		storeErr(w, err)
		return
	}
	if lines == nil {
		lines = []model.LogLine{}
	}
	next := after
	if n := len(lines); n > 0 {
		next = lines[n-1].Seq
	}
	writeJSON(w, 200, map[string]any{"lines": lines, "next": next})
}

func (s *Server) addDomain(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Domain string `json:"domain"`
	}
	if err := decode(w, r, 1<<10, &req); err != nil {
		writeErr(w, 400, err)
		return
	}
	host, err := model.NormalizeDomain(req.Domain, s.cfg.BaseDomain)
	if err != nil {
		writeErr(w, 400, err)
		return
	}
	id := r.PathValue("id")
	cur, err := s.st.GetService(id)
	if err != nil {
		storeErr(w, err)
		return
	}
	for _, d := range cur.CustomDomains {
		if d == host {
			s.respondView(w, 200, cur)
			return
		}
	}
	if len(cur.CustomDomains) >= maxCustomDomains {
		writeErr(w, 400, fmt.Errorf("at most %d custom domains", maxCustomDomains))
		return
	}
	if err := s.st.ClaimDomain(host, id); err != nil {
		storeErr(w, err)
		return
	}
	svc, err := s.st.UpdateService(id, func(x *model.Service) {
		for _, d := range x.CustomDomains {
			if d == host {
				return
			}
		}
		x.CustomDomains = append(x.CustomDomains, host)
	})
	if err != nil {
		_ = s.st.ReleaseDomain(host, id)
		storeErr(w, err)
		return
	}
	s.respondView(w, 201, svc)
}

func (s *Server) removeDomain(w http.ResponseWriter, r *http.Request) {
	id, host := r.PathValue("id"), strings.ToLower(r.PathValue("domain"))
	svc, err := s.st.UpdateService(id, func(x *model.Service) {
		kept := x.CustomDomains[:0]
		for _, d := range x.CustomDomains {
			if d != host {
				kept = append(kept, d)
			}
		}
		x.CustomDomains = kept
	})
	if err != nil {
		storeErr(w, err)
		return
	}
	if err := s.st.ReleaseDomain(host, id); err != nil {
		storeErr(w, err)
		return
	}
	s.respondView(w, 200, svc)
}

func (s *Server) listNodes(w http.ResponseWriter, _ *http.Request) {
	type nv struct {
		model.Node
		Healthy  bool `json:"healthy"`
		Services int  `json:"services"`
	}
	nodes, err := s.st.ListNodes()
	if err != nil {
		storeErr(w, err)
		return
	}
	svcs, err := s.st.ListServices()
	if err != nil {
		storeErr(w, err)
		return
	}
	count := map[string]int{}
	for _, svc := range svcs {
		count[svc.NodeID]++
	}
	out := []nv{}
	for _, n := range nodes {
		out = append(out, nv{n, scheduler.Healthy(n, s.now(), s.cfg.NodeTTL), count[n.ID]})
	}
	writeJSON(w, 200, out)
}

// githubWebhook redeploys a git service when its tracked branch is pushed.
// Authenticity is the HMAC-SHA256 signature GitHub computes with the service's
// webhook secret; unknown services and bad signatures are indistinguishable.
func (s *Server) githubWebhook(w http.ResponseWriter, r *http.Request) {
	deny := func() { writeErr(w, 401, errors.New("invalid signature")) }
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxWebhookBody))
	if err != nil {
		writeErr(w, 413, errors.New("payload too large"))
		return
	}
	id := r.PathValue("id")
	svc, err := s.st.GetService(id)
	if err != nil || svc.WebhookSecret == "" {
		deny()
		return
	}
	mac := hmac.New(sha256.New, []byte(svc.WebhookSecret))
	mac.Write(body)
	want := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(want), []byte(r.Header.Get("X-Hub-Signature-256"))) {
		deny()
		return
	}
	switch r.Header.Get("X-GitHub-Event") {
	case "ping":
		writeJSON(w, 200, map[string]string{"status": "pong"})
		return
	case "push":
	default:
		writeJSON(w, 202, map[string]string{"status": "ignored event"})
		return
	}
	var ev struct {
		Ref     string `json:"ref"`
		After   string `json:"after"`
		Deleted bool   `json:"deleted"`
	}
	if err := json.Unmarshal(body, &ev); err != nil {
		writeErr(w, 400, errors.New("bad payload"))
		return
	}
	if ev.Deleted || !pushMatches(svc.GitRef, ev.Ref) {
		writeJSON(w, 202, map[string]string{"status": "ignored branch"})
		return
	}
	note := "push"
	if len(ev.After) >= 7 && model.ValidRef(ev.After) {
		note = "push " + ev.After[:7]
	}
	out, err := s.st.UpdateService(id, func(x *model.Service) { x.PinCommit = ""; x.Bump(note, s.now()) })
	if err != nil {
		storeErr(w, err)
		return
	}
	writeJSON(w, 202, map[string]any{"status": "deploying", "revision": out.Revision})
}

// pushMatches reports whether a push to ref should deploy a service tracking
// tracked. An empty tracked ref means the conventional default branches.
func pushMatches(tracked, ref string) bool {
	branch, ok := strings.CutPrefix(ref, "refs/heads/")
	if !ok {
		return false
	}
	if tracked == "" {
		return branch == "main" || branch == "master"
	}
	return branch == tracked
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var n model.Node
	if err := decode(w, r, 1<<16, &n); err != nil || n.Name == "" || n.Addr == "" {
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
	Statuses []model.Status   `json:"statuses"`
	Logs     []model.LogBatch `json:"logs,omitempty"`
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
	if err := decode(w, r, maxHeartbeatBody, &req); err != nil {
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
	mine := map[string]model.Service{}
	resp := heartbeatResp{Services: []model.Service{}}
	for _, svc := range svcs {
		if svc.NodeID == id {
			mine[svc.ID] = svc
			resp.Services = append(resp.Services, svc)
		}
	}
	// Failures below only affect observability, not deployment: log and carry on.
	for _, st := range req.Statuses {
		if svc, ok := mine[st.ServiceID]; ok && st.Commit != "" && model.ValidRef(st.Commit) {
			if rel, ok := svc.ReleaseOf(st.Revision); ok && rel.Commit == "" {
				_, _ = s.st.UpdateService(svc.ID, func(x *model.Service) { x.SetCommit(st.Revision, st.Commit) })
			}
		}
	}
	for _, b := range req.Logs {
		if _, ok := mine[b.ServiceID]; !ok {
			continue
		}
		lines := b.Lines
		if len(lines) > 1000 {
			lines = lines[len(lines)-1000:]
		}
		for i := range lines {
			lines[i].Revision = b.Revision
			if len(lines[i].Text) > model.MaxLogLineBytes {
				lines[i].Text = lines[i].Text[:model.MaxLogLineBytes]
			}
		}
		if err := s.st.AppendLogs(b.ServiceID, lines); err != nil {
			log.Printf("append logs: %v", err)
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
		if v.Upstream == "" {
			continue
		}
		out = append(out, model.Route{Host: svc.Domain, Upstream: v.Upstream})
		for _, d := range svc.CustomDomains {
			out = append(out, model.Route{Host: d, Upstream: v.Upstream})
		}
	}
	writeJSON(w, 200, out)
}

func copyEnv(m map[string]string) map[string]string {
	if m == nil {
		return nil
	}
	out := make(map[string]string, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

func decode(w http.ResponseWriter, r *http.Request, limit int64, v any) error {
	r.Body = http.MaxBytesReader(w, r.Body, limit)
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
