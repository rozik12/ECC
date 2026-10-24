package scheduler

import (
	"testing"
	"time"

	"launchpad/internal/model"
	"launchpad/internal/store"
)

func TestPlacesAndFailsOver(t *testing.T) {
	st, _ := store.Open("")
	now := time.Now()
	_ = st.UpsertNode(model.Node{ID: "aaaaaaaaaaaa", Name: "a", Addr: "a", LastSeen: now})
	_ = st.UpsertNode(model.Node{ID: "bbbbbbbbbbbb", Name: "b", Addr: "b", LastSeen: now})
	for _, n := range []string{"s1", "s2", "s3", "s4"} {
		if _, err := st.CreateService(model.Service{Name: n, Image: "nginx", Port: 80}); err != nil {
			t.Fatal(err)
		}
	}
	Reconcile(st, now, 15*time.Second)
	count := map[string]int{}
	for _, s := range st.ListServices() {
		count[s.NodeID]++
	}
	if count["aaaaaaaaaaaa"] != 2 || count["bbbbbbbbbbbb"] != 2 {
		t.Fatalf("uneven spread: %v", count)
	}

	// Node a stops heartbeating; its services must move to b.
	later := now.Add(time.Minute)
	_ = st.Touch("bbbbbbbbbbbb", later)
	Reconcile(st, later, 15*time.Second)
	for _, s := range st.ListServices() {
		if s.NodeID != "bbbbbbbbbbbb" {
			t.Fatalf("%s still on %s", s.Name, s.NodeID)
		}
	}
}

func TestNoHealthyNodeLeavesUnassigned(t *testing.T) {
	st, _ := store.Open("")
	_, _ = st.CreateService(model.Service{Name: "web", Image: "nginx", Port: 80})
	if n := Reconcile(st, time.Now(), time.Second); n != 0 {
		t.Fatalf("moved %d", n)
	}
}
