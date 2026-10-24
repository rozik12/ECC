// Package agent runs on every node. It heartbeats to the control plane,
// receives the services assigned to this node, reconciles containers and
// ships their logs.
package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"launchpad/internal/model"
)

const maxPendingLogLines = 5000

// Agent glues a Reconciler to the control plane.
type Agent struct {
	URL, Token, Name, Addr, ID string
	HTTP                       *http.Client
	Rec                        *Reconciler
	Every                      time.Duration // heartbeat interval; 0 means 3s

	mu       sync.Mutex
	statuses []model.Status
	desired  []model.Service
	logs     []model.LogBatch
}

func (a *Agent) post(ctx context.Context, path string, in, out any) error {
	b, _ := json.Marshal(in)
	req, err := http.NewRequestWithContext(ctx, "POST", a.URL+path, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+a.Token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := a.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("%s: HTTP %d", path, resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func (a *Agent) register(ctx context.Context) error {
	var n model.Node
	if err := a.post(ctx, "/internal/nodes/register", model.Node{ID: a.ID, Name: a.Name, Addr: a.Addr}, &n); err != nil {
		return err
	}
	a.ID = n.ID
	log.Printf("registered as node %s", a.ID)
	return nil
}

func (a *Agent) queueLogs(batches []model.LogBatch) {
	if len(batches) == 0 {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	a.logs = append(a.logs, batches...)
	// Bound memory while the control plane is unreachable: drop the oldest.
	total := 0
	for _, b := range a.logs {
		total += len(b.Lines)
	}
	for total > maxPendingLogLines && len(a.logs) > 1 {
		total -= len(a.logs[0].Lines)
		a.logs = a.logs[1:]
	}
}

// Run blocks until ctx is done. Heartbeats never wait on image builds: the
// reconcile loop runs separately so a slow build cannot make the node look dead.
func (a *Agent) Run(ctx context.Context) {
	kick := make(chan struct{}, 1)
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case <-kick:
			case <-time.After(10 * time.Second):
			}
			a.mu.Lock()
			d := append([]model.Service(nil), a.desired...)
			a.mu.Unlock()
			sts := a.Rec.Reconcile(ctx, d)
			a.mu.Lock()
			if sts != nil || len(d) == 0 {
				a.statuses = sts
			}
			a.mu.Unlock()
			a.queueLogs(a.Rec.CollectLogs(ctx))
		}
	}()
	every := a.Every
	if every == 0 {
		every = 3 * time.Second
	}
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		if a.ID == "" {
			if err := a.register(ctx); err != nil {
				log.Printf("register: %v", err)
			}
		}
		if a.ID != "" {
			a.heartbeat(ctx, kick)
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

func (a *Agent) heartbeat(ctx context.Context, kick chan<- struct{}) {
	a.mu.Lock()
	sent := len(a.logs)
	req := struct {
		Statuses []model.Status   `json:"statuses"`
		Logs     []model.LogBatch `json:"logs,omitempty"`
	}{a.statuses, append([]model.LogBatch(nil), a.logs...)}
	a.mu.Unlock()
	var resp struct {
		Services []model.Service `json:"services"`
	}
	if err := a.post(ctx, "/internal/nodes/"+a.ID+"/heartbeat", req, &resp); err != nil {
		log.Printf("heartbeat: %v", err)
		a.ID = "" // control plane may have lost us; re-register
		return
	}
	a.mu.Lock()
	a.desired = resp.Services
	if sent <= len(a.logs) {
		a.logs = a.logs[sent:] // only what was delivered; newer batches stay queued
	}
	a.mu.Unlock()
	select {
	case kick <- struct{}{}:
	default:
	}
}
