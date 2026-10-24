package store

import (
	"context"
	"errors"
	"fmt"
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
			for _, tbl := range []string{"statuses", "services", "nodes", "domains", "logs"} {
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

			// History starts with the "created" release and survives updates.
			if len(got.History) != 1 || got.History[0].Revision != 1 || got.History[0].Note != "created" {
				t.Fatalf("history: %+v", got.History)
			}
			_, _ = st.UpdateService(a.ID, func(s *model.Service) { s.Bump("again", time.Now()); s.SetCommit(s.Revision, "abc1234") })
			got, _ = st.GetService(a.ID)
			if len(got.History) != 2 || got.History[1].Commit != "abc1234" || got.History[1].Env["A"] != "1" {
				t.Fatalf("history after bump: %+v", got.History)
			}
			// Mutating a returned copy must not corrupt stored state.
			got.History[0].Env["A"] = "tampered"
			got.Env["A"] = "tampered"
			if again, _ := st.GetService(a.ID); again.Env["A"] != "1" || again.History[0].Env["A"] != "1" {
				t.Fatal("store returned aliased maps")
			}

			// Custom domains belong to one service at a time.
			b, _ := st.CreateService(model.Service{Name: "api", Image: "x", Port: 1})
			if err := st.ClaimDomain("shop.example.org", a.ID); err != nil {
				t.Fatal(err)
			}
			if err := st.ClaimDomain("shop.example.org", a.ID); err != nil {
				t.Fatalf("re-claim by owner: %v", err)
			}
			if err := st.ClaimDomain("shop.example.org", b.ID); !errors.Is(err, ErrConflict) {
				t.Fatalf("domain stolen: %v", err)
			}
			if err := st.ReleaseDomain("shop.example.org", b.ID); err != nil {
				t.Fatal(err)
			}
			if err := st.ClaimDomain("shop.example.org", b.ID); !errors.Is(err, ErrConflict) {
				t.Fatalf("non-owner release freed the domain: %v", err)
			}
			if err := st.ClaimDomain("x.example.org", "nope"); !errors.Is(err, ErrNotFound) {
				t.Fatalf("claim for missing service: %v", err)
			}

			// Logs: increasing seq, cursor reads, limit keeps the newest, cap enforced.
			for i := 0; i < 5; i++ {
				_ = st.AppendLogs(a.ID, []model.LogLine{{Time: now, Revision: 1, Text: fmt.Sprint("line", i)}})
			}
			all, _ := st.Logs(a.ID, 0, 100)
			if len(all) != 5 || all[0].Text != "line0" || all[4].Text != "line4" || all[0].Seq >= all[4].Seq {
				t.Fatalf("logs: %+v", all)
			}
			rest, _ := st.Logs(a.ID, all[2].Seq, 100)
			if len(rest) != 2 || rest[0].Text != "line3" {
				t.Fatalf("after cursor: %+v", rest)
			}
			if last2, _ := st.Logs(a.ID, 0, 2); len(last2) != 2 || last2[0].Text != "line3" {
				t.Fatalf("limit should keep newest: %+v", last2)
			}
			big := make([]model.LogLine, MaxLogLines+50)
			for i := range big {
				big[i] = model.LogLine{Time: now, Text: fmt.Sprint("b", i)}
			}
			_ = st.AppendLogs(a.ID, big)
			capped, _ := st.Logs(a.ID, 0, MaxLogLines*2)
			if len(capped) != MaxLogLines || capped[len(capped)-1].Text != fmt.Sprint("b", len(big)-1) {
				t.Fatalf("cap: %d lines, last %q", len(capped), capped[len(capped)-1].Text)
			}
			if err := st.AppendLogs("nope", big[:1]); !errors.Is(err, ErrNotFound) {
				t.Fatalf("logs for missing service: %v", err)
			}

			if err := st.DeleteService(a.ID); err != nil {
				t.Fatal(err)
			}
			if err := st.ClaimDomain("shop.example.org", b.ID); err != nil {
				t.Fatalf("domain not released with its service: %v", err)
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
