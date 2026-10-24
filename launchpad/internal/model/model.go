// Package model holds the types shared by the control plane, agents and edge.
package model

import (
	"fmt"
	"regexp"
	"time"
)

type Service struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	Image     string            `json:"image,omitempty"`
	GitURL    string            `json:"git_url,omitempty"`
	GitRef    string            `json:"git_ref,omitempty"`
	Port      int               `json:"port"`
	Env       map[string]string `json:"env,omitempty"`
	Revision  int               `json:"revision"`
	NodeID    string            `json:"node_id,omitempty"`
	Domain    string            `json:"domain"`
	CreatedAt time.Time         `json:"created_at"`
}

type Node struct {
	ID       string    `json:"id"`
	Name     string    `json:"name"`
	Addr     string    `json:"addr"` // host the edge uses to reach published ports
	LastSeen time.Time `json:"last_seen"`
}

// Status is what an agent reports about one service it was asked to run.
type Status struct {
	ServiceID string `json:"service_id"`
	Revision  int    `json:"revision"`
	State     string `json:"state"` // building | running | failed
	HostPort  int    `json:"host_port,omitempty"`
	Error     string `json:"error,omitempty"`
}

// Route maps a public host name to a running upstream.
type Route struct {
	Host     string `json:"host"`
	Upstream string `json:"upstream"`
}

const (
	StateBuilding = "building"
	StateRunning  = "running"
	StateFailed   = "failed"
)

var (
	nameRe  = regexp.MustCompile(`^[a-z][a-z0-9-]{1,38}$`)
	imageRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{0,254}$`)
	refRe   = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$`)
	envRe   = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]{0,127}$`)
	idRe    = regexp.MustCompile(`^[a-f0-9]{12}$`)
)

func ValidID(id string) bool { return idRe.MatchString(id) }

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
	if s.GitRef != "" && !refRe.MatchString(s.GitRef) {
		return fmt.Errorf("invalid git_ref")
	}
	if s.Port < 1 || s.Port > 65535 {
		return fmt.Errorf("port out of range")
	}
	return ValidateEnv(s.Env)
}

func ValidateEnv(env map[string]string) error {
	for k := range env {
		if !envRe.MatchString(k) {
			return fmt.Errorf("invalid env var name %q", k)
		}
	}
	return nil
}
