// Package edge is the public HTTP entry point. It polls routes from the
// control plane and reverse-proxies each Host to its upstream node:port.
// It can terminate TLS itself with automatic Let's Encrypt certificates (see
// cmd/lp-edge) or sit behind another TLS terminator.
package edge

import (
	"context"
	"encoding/json"
	"fmt"
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
	Interval   time.Duration // route refresh interval; 0 means 3s

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
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("routes: HTTP %d", resp.StatusCode) // keep the last good table
	}
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

// HostPolicy is for autocert: certificates are issued only for hosts that
// currently have a route, so the edge cannot be made to request certificates
// for arbitrary names.
func (e *Edge) HostPolicy(_ context.Context, host string) error {
	e.mu.RLock()
	_, ok := e.routes[strings.ToLower(host)]
	e.mu.RUnlock()
	if !ok {
		return fmt.Errorf("host %q is not served by this platform", host)
	}
	return nil
}

func (e *Edge) Poll(ctx context.Context) {
	every := e.Interval
	if every == 0 {
		every = 3 * time.Second
	}
	t := time.NewTicker(every)
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
