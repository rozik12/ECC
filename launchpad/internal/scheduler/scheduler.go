// Package scheduler assigns services to healthy nodes.
package scheduler

import (
	"time"

	"launchpad/internal/model"
	"launchpad/internal/store"
)

// Healthy reports whether a node has heartbeated within ttl.
func Healthy(n model.Node, now time.Time, ttl time.Duration) bool {
	return now.Sub(n.LastSeen) <= ttl
}

// Reconcile gives every service a healthy node: unassigned services are placed
// on the least-loaded node, and services on dead nodes are moved. It returns
// how many services were (re)assigned.
func Reconcile(st *store.Store, now time.Time, ttl time.Duration) int {
	nodes := st.ListNodes()
	healthy := map[string]bool{}
	load := map[string]int{}
	for _, n := range nodes {
		if Healthy(n, now, ttl) {
			healthy[n.ID] = true
			load[n.ID] = 0
		}
	}
	if len(healthy) == 0 {
		return 0
	}
	svcs := st.ListServices()
	for _, s := range svcs {
		if healthy[s.NodeID] {
			load[s.NodeID]++
		}
	}
	moved := 0
	for _, s := range svcs {
		if healthy[s.NodeID] {
			continue
		}
		target := leastLoaded(nodes, healthy, load)
		if _, err := st.UpdateService(s.ID, func(x *model.Service) { x.NodeID = target }); err == nil {
			load[target]++
			moved++
		}
	}
	return moved
}

func leastLoaded(nodes []model.Node, healthy map[string]bool, load map[string]int) string {
	best := ""
	for _, n := range nodes { // nodes are sorted by ID, so ties are deterministic
		if !healthy[n.ID] {
			continue
		}
		if best == "" || load[n.ID] < load[best] {
			best = n.ID
		}
	}
	return best
}
