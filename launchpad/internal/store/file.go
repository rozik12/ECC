// Package store holds control plane state. File is the single-node store;
// PG (pg.go) lets several control plane replicas share one database.
package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"launchpad/internal/model"
)

type File struct {
	mu   sync.Mutex
	path string
	d    data

	// Logs are soft state: kept in memory only.
	logs   map[string][]model.LogLine
	logSeq map[string]int64
}

type data struct {
	Services map[string]*model.Service `json:"services"`
	Nodes    map[string]*model.Node    `json:"nodes"`
	Statuses map[string][]reported     `json:"statuses"`
	Domains  map[string]string         `json:"domains"` // host -> service id
}

type reported struct {
	NodeID string       `json:"node_id"`
	Status model.Status `json:"status"`
}

// Open loads path, or starts empty when path is "" or missing.
func Open(path string) (*File, error) {
	s := &File{path: path, d: data{
		Services: map[string]*model.Service{},
		Nodes:    map[string]*model.Node{},
		Statuses: map[string][]reported{},
		Domains:  map[string]string{},
	}, logs: map[string][]model.LogLine{}, logSeq: map[string]int64{}}
	if path == "" {
		return s, nil
	}
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return s, nil
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(b, &s.d); err != nil {
		return nil, err
	}
	if s.d.Services == nil {
		s.d.Services = map[string]*model.Service{}
	}
	if s.d.Nodes == nil {
		s.d.Nodes = map[string]*model.Node{}
	}
	if s.d.Statuses == nil {
		s.d.Statuses = map[string][]reported{}
	}
	if s.d.Domains == nil {
		s.d.Domains = map[string]string{}
	}
	return s, nil
}

// save must be called with s.mu held. Writes atomically via rename.
func (s *File) save() error {
	if s.path == "" {
		return nil
	}
	b, err := json.MarshalIndent(&s.d, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return err
	}
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

func (s *File) CreateService(svc model.Service) (model.Service, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, o := range s.d.Services {
		if o.Name == svc.Name {
			return model.Service{}, ErrConflict
		}
	}
	svc.ID = NewID()
	svc.Revision = 1
	svc.CreatedAt = time.Now().UTC()
	svc.History = []model.Release{svc.Snapshot("created", svc.CreatedAt)}
	s.d.Services[svc.ID] = &svc
	return svc, s.save()
}

func (s *File) GetService(id string) (model.Service, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	svc, ok := s.d.Services[id]
	if !ok {
		return model.Service{}, ErrNotFound
	}
	return clone(svc), nil
}

func (s *File) ListServices() ([]model.Service, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]model.Service, 0, len(s.d.Services))
	for _, svc := range s.d.Services {
		out = append(out, clone(svc))
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.Before(out[j].CreatedAt) })
	return out, nil
}

func (s *File) UpdateService(id string, fn func(*model.Service)) (model.Service, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	svc, ok := s.d.Services[id]
	if !ok {
		return model.Service{}, ErrNotFound
	}
	fn(svc)
	return clone(svc), s.save()
}

func (s *File) DeleteService(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.d.Services[id]; !ok {
		return ErrNotFound
	}
	delete(s.d.Services, id)
	delete(s.d.Statuses, id)
	for host, owner := range s.d.Domains {
		if owner == id {
			delete(s.d.Domains, host)
		}
	}
	delete(s.logs, id)
	delete(s.logSeq, id)
	return s.save()
}

func (s *File) UpsertNode(n model.Node) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.d.Nodes[n.ID] = &n
	return s.save()
}

func (s *File) Touch(nodeID string, now time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	n, ok := s.d.Nodes[nodeID]
	if !ok {
		return ErrNotFound
	}
	n.LastSeen = now
	return nil // LastSeen is soft state; not worth a disk write per heartbeat
}

func (s *File) ListNodes() ([]model.Node, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]model.Node, 0, len(s.d.Nodes))
	for _, n := range s.d.Nodes {
		out = append(out, *n)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}

// SetStatuses replaces what nodeID reports for each service it mentions.
// Services not assigned to nodeID are ignored, so a stale agent cannot
// overwrite the truth.
func (s *File) SetStatuses(nodeID string, sts []model.Status) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	fresh := map[string][]reported{}
	for _, st := range sts {
		svc, ok := s.d.Services[st.ServiceID]
		if !ok || svc.NodeID != nodeID {
			continue
		}
		fresh[st.ServiceID] = append(fresh[st.ServiceID], reported{NodeID: nodeID, Status: st})
	}
	for id, rs := range fresh {
		s.d.Statuses[id] = rs
	}
	return nil // statuses are soft state, rebuilt from heartbeats
}

// StatusesOf returns every status the service's current node reports.
func (s *File) StatusesOf(id string) ([]model.Status, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	svc, ok := s.d.Services[id]
	if !ok {
		return nil, ErrNotFound
	}
	var out []model.Status
	for _, r := range s.d.Statuses[id] {
		if r.NodeID == svc.NodeID {
			out = append(out, r.Status)
		}
	}
	return out, nil
}

func (s *File) ClaimDomain(host, serviceID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.d.Services[serviceID]; !ok {
		return ErrNotFound
	}
	if owner, ok := s.d.Domains[host]; ok && owner != serviceID {
		return ErrConflict
	}
	s.d.Domains[host] = serviceID
	return s.save()
}

func (s *File) ReleaseDomain(host, serviceID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.d.Domains[host] != serviceID {
		return nil
	}
	delete(s.d.Domains, host)
	return s.save()
}

func (s *File) AppendLogs(id string, lines []model.LogLine) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.d.Services[id]; !ok {
		return ErrNotFound
	}
	for _, l := range lines {
		s.logSeq[id]++
		l.Seq = s.logSeq[id]
		s.logs[id] = append(s.logs[id], l)
	}
	if n := len(s.logs[id]); n > MaxLogLines {
		s.logs[id] = append([]model.LogLine(nil), s.logs[id][n-MaxLogLines:]...)
	}
	return nil
}

func (s *File) Logs(id string, after int64, limit int) ([]model.LogLine, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.d.Services[id]; !ok {
		return nil, ErrNotFound
	}
	var out []model.LogLine
	for _, l := range s.logs[id] {
		if l.Seq > after {
			out = append(out, l)
		}
	}
	if limit > 0 && len(out) > limit {
		out = out[len(out)-limit:]
	}
	return out, nil
}

func clone(s *model.Service) model.Service {
	c := *s
	c.Env = copyEnv(s.Env)
	c.Volumes = append([]model.Volume(nil), s.Volumes...)
	c.CustomDomains = append([]string(nil), s.CustomDomains...)
	if s.History != nil {
		c.History = make([]model.Release, len(s.History))
		for i, r := range s.History {
			r.Env = copyEnv(r.Env)
			c.History[i] = r
		}
	}
	return c
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
