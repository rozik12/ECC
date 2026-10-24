// Package store is a small file-backed state store for the control plane.
// It is deliberately simple; swap it for Postgres when the control plane
// needs to be highly available (see docs/ARCHITECTURE.md).
package store

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"launchpad/internal/model"
)

var ErrNotFound = errors.New("not found")
var ErrConflict = errors.New("name already in use")

type Store struct {
	mu   sync.Mutex
	path string
	d    data
}

type data struct {
	Services map[string]*model.Service `json:"services"`
	Nodes    map[string]*model.Node    `json:"nodes"`
	Statuses map[string]reported       `json:"statuses"`
}

type reported struct {
	NodeID string       `json:"node_id"`
	Status model.Status `json:"status"`
}

// Open loads path, or starts empty when path is "" or missing.
func Open(path string) (*Store, error) {
	s := &Store{path: path, d: data{
		Services: map[string]*model.Service{},
		Nodes:    map[string]*model.Node{},
		Statuses: map[string]reported{},
	}}
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
		s.d.Statuses = map[string]reported{}
	}
	return s, nil
}

func NewID() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// save must be called with s.mu held. Writes atomically via rename.
func (s *Store) save() error {
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

func (s *Store) CreateService(svc model.Service) (model.Service, error) {
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
	s.d.Services[svc.ID] = &svc
	return svc, s.save()
}

func (s *Store) GetService(id string) (model.Service, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	svc, ok := s.d.Services[id]
	if !ok {
		return model.Service{}, ErrNotFound
	}
	return clone(svc), nil
}

func (s *Store) ListServices() []model.Service {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]model.Service, 0, len(s.d.Services))
	for _, svc := range s.d.Services {
		out = append(out, clone(svc))
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.Before(out[j].CreatedAt) })
	return out
}

func (s *Store) UpdateService(id string, fn func(*model.Service)) (model.Service, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	svc, ok := s.d.Services[id]
	if !ok {
		return model.Service{}, ErrNotFound
	}
	fn(svc)
	return clone(svc), s.save()
}

func (s *Store) DeleteService(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.d.Services[id]; !ok {
		return ErrNotFound
	}
	delete(s.d.Services, id)
	delete(s.d.Statuses, id)
	return s.save()
}

func (s *Store) UpsertNode(n model.Node) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.d.Nodes[n.ID] = &n
	return s.save()
}

func (s *Store) Touch(nodeID string, now time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	n, ok := s.d.Nodes[nodeID]
	if !ok {
		return ErrNotFound
	}
	n.LastSeen = now
	return nil // LastSeen is soft state; not worth a disk write per heartbeat
}

func (s *Store) ListNodes() []model.Node {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]model.Node, 0, len(s.d.Nodes))
	for _, n := range s.d.Nodes {
		out = append(out, *n)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// SetStatuses replaces what nodeID reports. Statuses for services that are not
// assigned to nodeID are ignored, so a stale agent cannot overwrite the truth.
func (s *Store) SetStatuses(nodeID string, sts []model.Status) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, st := range sts {
		svc, ok := s.d.Services[st.ServiceID]
		if !ok || svc.NodeID != nodeID {
			continue
		}
		s.d.Statuses[st.ServiceID] = reported{NodeID: nodeID, Status: st}
	}
}

// StatusOf returns the status for the service's current node and revision.
func (s *Store) StatusOf(id string) (model.Status, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	svc, ok := s.d.Services[id]
	if !ok {
		return model.Status{}, false
	}
	r, ok := s.d.Statuses[id]
	if !ok || r.NodeID != svc.NodeID || r.Status.Revision != svc.Revision {
		return model.Status{}, false
	}
	return r.Status, true
}

func clone(s *model.Service) model.Service {
	c := *s
	if s.Env != nil {
		c.Env = make(map[string]string, len(s.Env))
		for k, v := range s.Env {
			c.Env[k] = v
		}
	}
	return c
}
