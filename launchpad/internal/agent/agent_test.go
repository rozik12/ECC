package agent

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"launchpad/internal/model"
)

type fakeRT struct {
	cs      []Container
	prepErr error
	started []string
	removed []string
	logs    map[string][]model.LogLine // by container name
	logCall []string
}

func (f *fakeRT) List(context.Context) ([]Container, error) { return f.cs, nil }
func (f *fakeRT) Prepare(_ context.Context, s model.Service) (string, string, error) {
	return "img", "c0ffee" + fmt.Sprint(s.Revision), f.prepErr
}
func (f *fakeRT) Logs(_ context.Context, name string, since time.Time, tail int) ([]model.LogLine, error) {
	f.logCall = append(f.logCall, fmt.Sprintf("%s since=%v tail=%d", name, !since.IsZero(), tail))
	var out []model.LogLine
	for _, l := range f.logs[name] {
		if since.IsZero() || !l.Time.Before(since) { // docker's --since is inclusive
			out = append(out, l)
		}
	}
	return out, nil
}
func (f *fakeRT) Start(_ context.Context, s model.Service, _ string) (Container, error) {
	n := fmt.Sprintf("lp-%s-%d", s.ID, s.Revision)
	f.started = append(f.started, n)
	c := Container{Name: n, ServiceID: s.ID, Revision: s.Revision, Running: true, HostPort: 40000 + s.Revision}
	f.cs = append(f.cs, c)
	return c, nil
}
func (f *fakeRT) Remove(_ context.Context, n string) error {
	f.removed = append(f.removed, n)
	kept := f.cs[:0]
	for _, c := range f.cs {
		if c.Name != n {
			kept = append(kept, c)
		}
	}
	f.cs = kept
	return nil
}

// harness wires a Reconciler to a fake runtime, a controllable clock and a
// set of ports that currently answer health checks.
type harness struct {
	rt      *fakeRT
	rec     *Reconciler
	now     time.Time
	healthy map[int]bool
}

func newHarness(cs ...Container) *harness {
	h := &harness{rt: &fakeRT{cs: cs}, now: time.Now(), healthy: map[int]bool{}}
	h.rec = NewReconciler(h.rt)
	h.rec.Now = func() time.Time { return h.now }
	h.rec.Probe = func(_ context.Context, port int, _ string) bool { return h.healthy[port] }
	return h
}

func (h *harness) run(svc ...model.Service) []model.Status {
	return h.rec.Reconcile(context.Background(), svc)
}

func removedOld(h *harness) bool {
	for _, n := range h.rt.removed {
		if n == "lp-abc-1" {
			return true
		}
	}
	return false
}

func stateOf(sts []model.Status, rev int) string {
	for _, s := range sts {
		if s.Revision == rev {
			return s.State
		}
	}
	return "absent"
}

func TestZeroDowntimeRedeploy(t *testing.T) {
	h := newHarness(Container{Name: "lp-abc-1", ServiceID: "abc", Revision: 1, Running: true, HostPort: 40001})
	h.healthy[40001] = true

	// Revision 2 is deployed but not healthy yet: rev 1 must keep running and be reported.
	sts := h.run(model.Service{ID: "abc", Revision: 2})
	if stateOf(sts, 2) != model.StateStarting || stateOf(sts, 1) != model.StateRunning {
		t.Fatalf("while starting: %+v", sts)
	}
	if removedOld(h) {
		t.Fatalf("old revision removed before new was healthy: %v", h.rt.removed)
	}

	// Revision 2 turns healthy: both reported (drain), nothing removed yet.
	h.healthy[40002] = true
	sts = h.run(model.Service{ID: "abc", Revision: 2})
	if stateOf(sts, 2) != model.StateRunning || stateOf(sts, 1) != model.StateRunning || removedOld(h) {
		t.Fatalf("during drain: %+v removed=%v", sts, h.rt.removed)
	}

	// After the drain grace the old revision goes away.
	h.now = h.now.Add(drainGrace + time.Second)
	sts = h.run(model.Service{ID: "abc", Revision: 2})
	if !removedOld(h) || stateOf(sts, 1) != "absent" {
		t.Fatalf("after drain: %+v removed=%v", sts, h.rt.removed)
	}
}

func TestUnhealthyRevisionKeepsOldServing(t *testing.T) {
	h := newHarness(Container{Name: "lp-abc-1", ServiceID: "abc", Revision: 1, Running: true, HostPort: 40001})
	h.healthy[40001] = true
	svc := model.Service{ID: "abc", Revision: 2}
	h.run(svc)
	h.now = h.now.Add(startupTimeout + time.Second)
	sts := h.run(svc)
	if stateOf(sts, 2) != model.StateFailed || stateOf(sts, 1) != model.StateRunning {
		t.Fatalf("%+v", sts)
	}
	if removedOld(h) {
		t.Fatal("healthy old revision was removed after the new one failed")
	}
}

func TestRemovesOrphans(t *testing.T) {
	h := newHarness(Container{Name: "lp-gone-1", ServiceID: "gone", Revision: 1, Running: true})
	h.run()
	if len(h.rt.removed) != 1 || h.rt.removed[0] != "lp-gone-1" {
		t.Fatalf("removed: %v", h.rt.removed)
	}
}

func TestBuildFailureBacksOff(t *testing.T) {
	h := newHarness()
	h.rt.prepErr = errors.New("build broke")
	svc := model.Service{ID: "abc", Revision: 1}
	if s := h.run(svc); stateOf(s, 1) != model.StateFailed {
		t.Fatalf("%+v", s)
	}
	h.rt.prepErr = nil
	if s := h.run(svc); stateOf(s, 1) != model.StateFailed || len(h.rt.started) != 0 {
		t.Fatal("retried before backoff elapsed")
	}
	h.now = h.now.Add(2 * time.Minute)
	if s := h.run(svc); stateOf(s, 1) != model.StateStarting || len(h.rt.started) != 1 {
		t.Fatalf("no retry after backoff: %+v", s)
	}
}

func TestVolumeServiceStopsOldBeforeStartingNew(t *testing.T) {
	h := newHarness(Container{Name: "lp-abc-1", ServiceID: "abc", Revision: 1, Running: true, HostPort: 40001})
	h.healthy[40001] = true
	svc := model.Service{ID: "abc", Revision: 2, Volumes: []model.Volume{{Name: "data", Path: "/data"}}}
	sts := h.run(svc)
	if !removedOld(h) {
		t.Fatal("old revision still running next to the new one: two writers on one volume")
	}
	if stateOf(sts, 1) != "absent" {
		t.Fatalf("removed revision still reported: %+v", sts)
	}
}

func TestReportsCommitOfBuiltRevision(t *testing.T) {
	h := newHarness()
	h.healthy[40001] = true
	sts := h.run(model.Service{ID: "abc", Revision: 1, GitURL: "https://x/y"})
	if sts[0].Commit != "c0ffee1" {
		t.Fatalf("%+v", sts)
	}
}

func TestCollectLogsShipsOnlyNewLines(t *testing.T) {
	h := newHarness()
	h.healthy[40001] = true
	t0 := h.now.Add(-time.Minute)
	h.run(model.Service{ID: "abc", Revision: 1})
	h.rt.logs = map[string][]model.LogLine{"lp-abc-1": {
		{Time: t0, Text: "boot"}, {Time: t0.Add(time.Second), Text: "ready"}}}

	b := h.rec.CollectLogs(context.Background())
	if len(b) != 1 || len(b[0].Lines) != 2 || b[0].ServiceID != "abc" || b[0].Revision != 1 {
		t.Fatalf("first collect: %+v", b)
	}
	// Docker's --since is inclusive, so the last line comes back; it must not be shipped twice.
	h.rt.logs["lp-abc-1"] = append(h.rt.logs["lp-abc-1"], model.LogLine{Time: t0.Add(2 * time.Second), Text: "request"})
	b = h.rec.CollectLogs(context.Background())
	if len(b) != 1 || len(b[0].Lines) != 1 || b[0].Lines[0].Text != "request" {
		t.Fatalf("second collect: %+v", b)
	}
	if b = h.rec.CollectLogs(context.Background()); len(b) != 0 {
		t.Fatalf("nothing new, got %+v", b)
	}
}

func TestParseLogs(t *testing.T) {
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	out := "2026-01-01T10:00:00.123456789Z hello world\n2026-01-01T10:00:01Z \nno timestamp here\n\xff\xfebad utf8\n"
	ls := ParseLogs(out, now)
	if len(ls) != 4 {
		t.Fatalf("%d lines: %+v", len(ls), ls)
	}
	if ls[0].Text != "hello world" || ls[0].Time.Nanosecond() != 123456789 {
		t.Fatalf("%+v", ls[0])
	}
	if ls[2].Text != "no timestamp here" || !ls[2].Time.Equal(ls[1].Time) {
		t.Fatalf("untimestamped line should inherit previous time: %+v", ls[2])
	}
	if !strings.HasSuffix(ls[3].Text, "bad utf8") {
		t.Fatalf("%q", ls[3].Text)
	}
	long := ParseLogs("2026-01-01T10:00:00Z "+strings.Repeat("x", 10000), now)
	if len(long[0].Text) > model.MaxLogLineBytes+4 {
		t.Fatalf("line not truncated: %d", len(long[0].Text))
	}
}
