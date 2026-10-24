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
	mustReconcile(t, st, now)
	count := map[string]int{}
	svcs, _ := st.ListServices()
	for _, s := range svcs {
		count[s.NodeID]++
	}
	if count["aaaaaaaaaaaa"] != 2 || count["bbbbbbbbbbbb"] != 2 {
		t.Fatalf("uneven spread: %v", count)
	}

	// Node a stops heartbeating; its services must move to b.
	later := now.Add(time.Minute)
	_ = st.Touch("bbbbbbbbbbbb", later)
	mustReconcile(t, st, later)
	svcs, _ = st.ListServices()
	for _, s := range svcs {
		if s.NodeID != "bbbbbbbbbbbb" {
			t.Fatalf("%s still on %s", s.Name, s.NodeID)
		}
	}
}

func TestNoHealthyNodeLeavesUnassigned(t *testing.T) {
	st, _ := store.Open("")
	_, _ = st.CreateService(model.Service{Name: "web", Image: "nginx", Port: 80})
	if n, _ := Reconcile(st, time.Now(), time.Second); n != 0 {
		t.Fatalf("moved %d", n)
	}
}

func mustReconcile(t *testing.T, st store.Store, now time.Time) {
	t.Helper()
	if _, err := Reconcile(st, now, 15*time.Second); err != nil {
		t.Fatal(err)
	}
}

func TestVolumeServicesStayPinnedToTheirNode(t *testing.T) {
	st, _ := store.Open("")
	now := time.Now()
	_ = st.UpsertNode(model.Node{ID: "aaaaaaaaaaaa", Name: "a", Addr: "a", LastSeen: now})
	_ = st.UpsertNode(model.Node{ID: "bbbbbbbbbbbb", Name: "b", Addr: "b", LastSeen: now})
	db, _ := st.CreateService(model.Service{Name: "db", Image: "postgres", Port: 5432,
		Volumes: []model.Volume{{Name: "data", Path: "/var/lib/postgresql/data"}}})
	web, _ := st.CreateService(model.Service{Name: "web", Image: "nginx", Port: 80})
	_, _ = st.UpdateService(db.ID, func(s *model.Service) { s.NodeID = "aaaaaaaaaaaa" })
	_, _ = st.UpdateService(web.ID, func(s *model.Service) { s.NodeID = "aaaaaaaaaaaa" })

	later := now.Add(time.Minute) // node a is silent, node b is alive
	_ = st.Touch("bbbbbbbbbbbb", later)
	mustReconcile(t, st, later)

	gotDB, _ := st.GetService(db.ID)
	gotWeb, _ := st.GetService(web.ID)
	if gotDB.NodeID != "aaaaaaaaaaaa" {
		t.Fatalf("volume service moved to %s and would start with empty storage", gotDB.NodeID)
	}
	if gotWeb.NodeID != "bbbbbbbbbbbb" {
		t.Fatalf("stateless service not failed over: %s", gotWeb.NodeID)
	}
	// An explicit reschedule (node lost for good) clears the pin.
	_, _ = st.UpdateService(db.ID, func(s *model.Service) { s.NodeID = "" })
	mustReconcile(t, st, later)
	if gotDB, _ = st.GetService(db.ID); gotDB.NodeID != "bbbbbbbbbbbb" {
		t.Fatalf("reschedule did not place the service: %q", gotDB.NodeID)
	}
}
