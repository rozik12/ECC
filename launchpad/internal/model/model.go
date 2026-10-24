// Package model holds the types shared by the control plane, agents and edge.
package model

import (
	"fmt"
	"regexp"
	"strings"
	"time"
)

type Volume struct {
	Name string `json:"name"`
	Path string `json:"path"` // mount point inside the container
}

type Service struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Image  string `json:"image,omitempty"`
	GitURL string `json:"git_url,omitempty"`
	GitRef string `json:"git_ref,omitempty"` // branch or tag to track
	// PinCommit, when set, is built instead of GitRef. A rollback sets it; the
	// next redeploy or push webhook clears it so the service tracks GitRef again.
	PinCommit string `json:"pin_commit,omitempty"`
	Port      int    `json:"port"`
	// HealthPath, when set, is probed over HTTP (any status below 500 is healthy).
	// Empty means a plain TCP connect to the published port.
	HealthPath string            `json:"health_path,omitempty"`
	Env        map[string]string `json:"env,omitempty"`
	MemoryMB   int               `json:"memory_mb,omitempty"` // 0 = DefaultMemoryMB
	CPUs       float64           `json:"cpus,omitempty"`      // 0 = DefaultCPUs
	// Volumes are node-local named volumes. A service with volumes is pinned to
	// its node and redeploys by stopping the old container first, because two
	// containers must not write the same volume at once.
	Volumes       []Volume `json:"volumes,omitempty"`
	CustomDomains []string `json:"custom_domains,omitempty"`
	// WebhookSecret signs GitHub push webhooks for git services.
	WebhookSecret string    `json:"webhook_secret,omitempty"`
	Revision      int       `json:"revision"`
	History       []Release `json:"history,omitempty"`
	NodeID        string    `json:"node_id,omitempty"`
	Domain        string    `json:"domain"`
	CreatedAt     time.Time `json:"created_at"`
}

// Release is the deployable snapshot of one revision. Rollback re-applies it.
type Release struct {
	Revision   int               `json:"revision"`
	Image      string            `json:"image,omitempty"`
	GitURL     string            `json:"git_url,omitempty"`
	GitRef     string            `json:"git_ref,omitempty"`
	Commit     string            `json:"commit,omitempty"` // filled once an agent builds it
	Port       int               `json:"port"`
	HealthPath string            `json:"health_path,omitempty"`
	Env        map[string]string `json:"env,omitempty"`
	At         time.Time         `json:"at"`
	Note       string            `json:"note"`
}

const (
	DefaultMemoryMB = 512
	DefaultCPUs     = 1.0
	MaxMemoryMB     = 16384
	MaxCPUs         = 16.0
	MaxReleases     = 20
)

func (s *Service) Memory() int {
	if s.MemoryMB > 0 {
		return s.MemoryMB
	}
	return DefaultMemoryMB
}

func (s *Service) CPU() float64 {
	if s.CPUs > 0 {
		return s.CPUs
	}
	return DefaultCPUs
}

// BuildRef is what an agent should fetch for a git service.
func (s *Service) BuildRef() string {
	if s.PinCommit != "" {
		return s.PinCommit
	}
	return s.GitRef
}

// Snapshot captures the current spec as a release for the current revision.
func (s *Service) Snapshot(note string, now time.Time) Release {
	r := Release{Revision: s.Revision, Image: s.Image, GitURL: s.GitURL, GitRef: s.GitRef,
		Port: s.Port, HealthPath: s.HealthPath, At: now.UTC(), Note: note}
	if s.PinCommit != "" {
		r.Commit = s.PinCommit
	}
	if s.Env != nil {
		r.Env = make(map[string]string, len(s.Env))
		for k, v := range s.Env {
			r.Env[k] = v
		}
	}
	return r
}

// Bump starts a new revision with the current spec. Every spec change goes
// through here so History stays complete.
func (s *Service) Bump(note string, now time.Time) {
	s.Revision++
	s.History = append(s.History, s.Snapshot(note, now))
	if n := len(s.History); n > MaxReleases {
		s.History = append([]Release(nil), s.History[n-MaxReleases:]...)
	}
}

// ReleaseOf returns the history entry for a revision.
func (s *Service) ReleaseOf(rev int) (Release, bool) {
	for _, r := range s.History {
		if r.Revision == rev {
			return r, true
		}
	}
	return Release{}, false
}

// SetCommit records the commit an agent built for a revision (first write wins).
func (s *Service) SetCommit(rev int, commit string) bool {
	for i := range s.History {
		if s.History[i].Revision == rev && s.History[i].Commit == "" {
			s.History[i].Commit = commit
			return true
		}
	}
	return false
}

type Node struct {
	ID       string    `json:"id"`
	Name     string    `json:"name"`
	Addr     string    `json:"addr"` // host the edge uses to reach published ports
	LastSeen time.Time `json:"last_seen"`
}

// Status is what an agent reports about one revision of a service.
type Status struct {
	ServiceID string `json:"service_id"`
	Revision  int    `json:"revision"`
	State     string `json:"state"` // building | starting | running | failed
	HostPort  int    `json:"host_port,omitempty"`
	Commit    string `json:"commit,omitempty"`
	Error     string `json:"error,omitempty"`
}

// Route maps a public host name to a running upstream.
type Route struct {
	Host     string `json:"host"`
	Upstream string `json:"upstream"`
}

// LogLine is one line of container output. Seq is assigned by the store and
// is increasing per service, so clients can ask for "lines after N".
type LogLine struct {
	Seq      int64     `json:"seq"`
	Time     time.Time `json:"time"`
	Revision int       `json:"revision"`
	Text     string    `json:"text"`
}

// LogBatch is what an agent ships for one service.
type LogBatch struct {
	ServiceID string    `json:"service_id"`
	Revision  int       `json:"revision"`
	Lines     []LogLine `json:"lines"`
}

const (
	StateBuilding = "building"
	StateStarting = "starting" // container is up, not yet healthy
	StateRunning  = "running"
	StateFailed   = "failed"

	MaxLogLineBytes = 4096
)

var (
	nameRe    = regexp.MustCompile(`^[a-z][a-z0-9-]{1,38}$`)
	imageRe   = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{0,254}$`)
	refRe     = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$`)
	envRe     = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]{0,127}$`)
	healthRe  = regexp.MustCompile(`^/[A-Za-z0-9._~/%?&=+-]{0,255}$`)
	idRe      = regexp.MustCompile(`^[a-f0-9]{12}$`)
	volNameRe = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,31}$`)
	volPathRe = regexp.MustCompile(`^/[A-Za-z0-9._/-]{1,200}$`)
	labelRe   = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`)
)

func ValidID(id string) bool { return idRe.MatchString(id) }

// ValidRef reports whether s is a safe git ref or commit SHA to pass to git.
func ValidRef(s string) bool { return refRe.MatchString(s) }

// Validate checks every field that later reaches a docker or git command line.
func (s *Service) Validate() error {
	if !nameRe.MatchString(s.Name) {
		return fmt.Errorf("name must match %s", nameRe)
	}
	if (s.Image == "") == (s.GitURL == "") {
		return fmt.Errorf("set exactly one of image or git_url")
	}
	if s.Image != "" && !imageRe.MatchString(s.Image) {
		return fmt.Errorf("invalid image reference")
	}
	if s.GitURL != "" && !(len(s.GitURL) > 8 && s.GitURL[:8] == "https://") {
		return fmt.Errorf("git_url must start with https://")
	}
	if s.GitURL != "" && strings.ContainsAny(s.GitURL, " \t\r\n") {
		return fmt.Errorf("invalid git_url")
	}
	if s.GitRef != "" && !refRe.MatchString(s.GitRef) {
		return fmt.Errorf("invalid git_ref")
	}
	return s.ValidateRuntime()
}

// ValidateRuntime checks the fields that shape how the container runs.
func (s *Service) ValidateRuntime() error {
	if s.HealthPath != "" && !healthRe.MatchString(s.HealthPath) {
		return fmt.Errorf("health_path must start with / and contain no spaces")
	}
	if s.Port < 1 || s.Port > 65535 {
		return fmt.Errorf("port out of range")
	}
	if s.MemoryMB < 0 || s.MemoryMB > MaxMemoryMB {
		return fmt.Errorf("memory_mb must be between 0 and %d", MaxMemoryMB)
	}
	if s.CPUs < 0 || s.CPUs > MaxCPUs {
		return fmt.Errorf("cpus must be between 0 and %d", int(MaxCPUs))
	}
	if len(s.Volumes) > 4 {
		return fmt.Errorf("at most 4 volumes")
	}
	seen := map[string]bool{}
	for _, v := range s.Volumes {
		if !volNameRe.MatchString(v.Name) || seen[v.Name] {
			return fmt.Errorf("invalid or duplicate volume name %q", v.Name)
		}
		seen[v.Name] = true
		if !volPathRe.MatchString(v.Path) || strings.Contains(v.Path, "..") {
			return fmt.Errorf("invalid volume path %q", v.Path)
		}
	}
	return ValidateEnv(s.Env)
}

func ValidateEnv(env map[string]string) error {
	if len(env) > 200 {
		return fmt.Errorf("at most 200 env vars")
	}
	for k, v := range env {
		if !envRe.MatchString(k) {
			return fmt.Errorf("invalid env var name %q", k)
		}
		if len(v) > 32*1024 {
			return fmt.Errorf("env var %s is too long", k)
		}
	}
	return nil
}

// NormalizeDomain lowercases and validates a custom domain. IP literals and
// single-label names are rejected; baseDomain (and anything under it) is
// reserved for platform-assigned names so one service cannot shadow another.
func NormalizeDomain(d, baseDomain string) (string, error) {
	d = strings.ToLower(strings.TrimSuffix(strings.TrimSpace(d), "."))
	if len(d) > 253 || !strings.Contains(d, ".") {
		return "", fmt.Errorf("invalid domain")
	}
	labels := strings.Split(d, ".")
	for _, l := range labels {
		if !labelRe.MatchString(l) {
			return "", fmt.Errorf("invalid domain")
		}
	}
	if allDigits(labels[len(labels)-1]) {
		return "", fmt.Errorf("IP addresses are not allowed")
	}
	if baseDomain != "" && (d == baseDomain || strings.HasSuffix(d, "."+baseDomain)) {
		return "", fmt.Errorf("%s is reserved for platform-assigned names", baseDomain)
	}
	return d, nil
}

func allDigits(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return s != ""
}
