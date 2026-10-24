package store

import (
	"context"
	"errors"
	"os"
	"sync"
	"testing"
	"time"

	"launchpad/internal/model"
)

// backends returns every Store implementation to test. Postgres runs only when
// LP_TEST_DATABASE_URL is set, e.g. postgres://postgres@localhost:5432/lp.
func backends(t *testing.T) map[string]func(t *testing.T) Store {
	m := map[string]func(t *testing.T) Store{
		"file": func(t *testing.T) Store {
			s, err := Open("")
			if err != nil {
				t.Fatal(err)
			}
			return s
		},
	}
	if url := os.Getenv("LP_TEST_DATABASE_URL"); url != "" {
		m["postgres"] = func(t *testing.T) Store {
			p, err := OpenPG(context.Background(), url)
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { p.Close() })
			for _, tbl := range []string{"statuses", "services", "nodes"} {
				if _, err := p.db.Exec("delete from " + tbl); err != nil {
					t.Fatal(err)
				}
			}
			return p
		}
	}
	return m
}

func TestStoreContract(t *testing.T) {
	for name, mk := range backends(t) {
		t.Run(name, func(t *testing.T) {
			st := mk(t)
			a, err := st.CreateService(model.Service{Name: "web", Image: "nginx", Port: 80, Env: map[string]string{"A": "1"}})
			if err != nil || a.Revision != 1 || a.ID == "" {
				t.Fatalf("create: %+v %v", a, err)
			}
			if _, err := st.CreateService(model.Service{Name: "web", Image: "x", Port: 1}); !errors.Is(err, ErrConflict) {
				t.Fatalf("duplicate name: %v", err)
			}
			if _, err := st.GetService("nope"); !errors.Is(err, ErrNotFound) {
				t.Fatalf("get missing: %v", err)
			}
			got, _ := st.GetService(a.ID)
			if got.Env["A"] != "1" {
				t.Fatalf("env lost: %+v", got)
			}

			// UpdateService must be atomic: concurrent increments may not be lost.
			var wg sync.WaitGroup
			for i := 0; i < 20; i++ {
				wg.Add(1)
				go func() {
					defer wg.Done()
					if _, err := st.UpdateService(a.ID, func(s *model.Service) { s.Revision++ }); err != nil {
						t.Error(err)
					}
				}()
			}
			wg.Wait()
			got, _ = st.GetService(a.ID)
			if got.Revision != 21 {
				t.Fatalf("lost updates: revision %d, want 21", got.Revision)
			}

			now := time.Now().UTC().Truncate(time.Millisecond)
			_ = st.UpsertNode(model.Node{ID: "aaaaaaaaaaaa", Name: "a", Addr: "10.0.0.1", LastSeen: now})
			if err := st.Touch("zzzzzzzzzzzz", now); !errors.Is(err, ErrNotFound) {
				t.Fatalf("touch unknown node: %v", err)
			}
			later := now.Add(time.Minute)
			if err := st.Touch("aaaaaaaaaaaa", later); err != nil {
				t.Fatal(err)
			}
			nodes, _ := st.ListNodes()
			if len(nodes) != 1 || !nodes[0].LastSeen.Equal(later) {
				t.Fatalf("nodes: %+v", nodes)
			}

			// Statuses count only from the node the service is assigned to.
			_, _ = st.UpdateService(a.ID, func(s *model.Service) { s.NodeID = "aaaaaaaaaaaa" })
			_ = st.SetStatuses("bbbbbbbbbbbb", []model.Status{{ServiceID: a.ID, Revision: 21, State: model.StateRunning, HostPort: 9}})
			if sts, _ := st.StatusesOf(a.ID); len(sts) != 0 {
				t.Fatalf("foreign node status accepted: %+v", sts)
			}
			_ = st.SetStatuses("aaaaaaaaaaaa", []model.Status{
				{ServiceID: a.ID, Revision: 20, State: model.StateRunning, HostPort: 1},
				{ServiceID: a.ID, Revision: 21, State: model.StateStarting, HostPort: 2}})
			sts, _ := st.StatusesOf(a.ID)
			if live, ok := Live(sts); len(sts) != 2 || !ok || live.Revision != 20 {
				t.Fatalf("statuses %+v live %+v", sts, live)
			}
			// A report replaces the previous one (rev 20 container is gone).
			_ = st.SetStatuses("aaaaaaaaaaaa", []model.Status{{ServiceID: a.ID, Revision: 21, State: model.StateRunning, HostPort: 2}})
			sts, _ = st.StatusesOf(a.ID)
			if len(sts) != 1 || sts[0].Revision != 21 {
				t.Fatalf("report did not replace: %+v", sts)
			}
			// Moving the service to another node hides the old node's statuses.
			_, _ = st.UpdateService(a.ID, func(s *model.Service) { s.NodeID = "bbbbbbbbbbbb" })
			if sts, _ := st.StatusesOf(a.ID); len(sts) != 0 {
				t.Fatalf("status from previous node still visible: %+v", sts)
			}

			if err := st.DeleteService(a.ID); err != nil {
				t.Fatal(err)
			}
			if err := st.DeleteService(a.ID); !errors.Is(err, ErrNotFound) {
				t.Fatalf("double delete: %v", err)
			}
		})
	}
}

func TestPostgresLeaderElection(t *testing.T) {
	url := os.Getenv("LP_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("LP_TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	a, err := OpenPG(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	b, err := OpenPG(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer b.Close()
	if !a.IsLeader(ctx) {
		t.Fatal("first replica should lead")
	}
	if b.IsLeader(ctx) {
		t.Fatal("two leaders at once")
	}
	if !a.IsLeader(ctx) {
		t.Fatal("leader lost leadership while healthy")
	}
	a.Close() // replica dies -> lock released
	if !b.IsLeader(ctx) {
		t.Fatal("standby did not take over")
	}
}
