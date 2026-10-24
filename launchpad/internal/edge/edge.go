// Package edge is the public HTTP entry point. It polls routes from the
// control plane and reverse-proxies each Host to its upstream node:port.
// TLS is terminated in front of it (Caddy/cloud LB); see docs/ARCHITECTURE.md.
package edge

import (
	"context"
	"encoding/json"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"strings"
	"sync"
	"time"

	"launchpad/internal/model"
)

type Edge struct {
	URL, Token string
	HTTP       *http.Client

	mu     sync.RWMutex
	routes map[string]string
}

func (e *Edge) Refresh(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, "GET", e.URL+"/internal/routes", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+e.Token)
	resp, err := e.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	var rs []model.Route
	if err := json.NewDecoder(resp.Body).Decode(&rs); err != nil {
		return err
	}
	m := make(map[string]string, len(rs))
	for _, r := range rs {
		m[strings.ToLower(r.Host)] = r.Upstream
	}
	e.mu.Lock()
	e.routes = m
	e.mu.Unlock()
	return nil
}

func (e *Edge) Poll(ctx context.Context) {
	t := time.NewTicker(3 * time.Second)
	defer t.Stop()
	for {
		if err := e.Refresh(ctx); err != nil {
			log.Printf("refresh routes: %v", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

func (e *Edge) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	host := strings.ToLower(r.Host)
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	e.mu.RLock()
	up, ok := e.routes[host]
	e.mu.RUnlock()
	if !ok {
		http.Error(w, "no such service", http.StatusNotFound)
		return
	}
	(&httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.Out.URL.Scheme, pr.Out.URL.Host = "http", up
			pr.SetXForwarded()
		},
		ErrorHandler: func(w http.ResponseWriter, _ *http.Request, err error) {
			log.Printf("proxy %s: %v", host, err)
			http.Error(w, "service unavailable", http.StatusBadGateway)
		},
	}).ServeHTTP(w, r)
}
