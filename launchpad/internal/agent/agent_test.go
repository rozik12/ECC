package agent

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"launchpad/internal/model"
)

type fakeRT struct {
	cs      []Container
	prepErr error
	started []string
	removed []string
}

func (f *fakeRT) List(context.Context) ([]Container, error) { return f.cs, nil }
func (f *fakeRT) Prepare(_ context.Context, s model.Service) (string, error) {
	return "img", f.prepErr
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
