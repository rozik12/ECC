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
	return Container{Name: n, ServiceID: s.ID, Revision: s.Revision, Running: true, HostPort: 40000}, nil
}
func (f *fakeRT) Remove(_ context.Context, n string) error {
	f.removed = append(f.removed, n)
	return nil
}

func TestStartsNewRevisionThenRemovesOld(t *testing.T) {
	rt := &fakeRT{cs: []Container{{Name: "lp-abc-1", ServiceID: "abc", Revision: 1, Running: true, HostPort: 1}}}
	r := NewReconciler(rt)
	sts := r.Reconcile(context.Background(), []model.Service{{ID: "abc", Revision: 2}})
	if len(sts) != 1 || sts[0].State != model.StateRunning || sts[0].HostPort != 40000 {
		t.Fatalf("status: %+v", sts)
	}
	if len(rt.started) != 1 || rt.started[0] != "lp-abc-2" {
		t.Fatalf("started: %v", rt.started)
	}
	found := false
	for _, n := range rt.removed {
		found = found || n == "lp-abc-1"
	}
	if !found {
		t.Fatalf("old revision not removed: %v", rt.removed)
	}
}

func TestRemovesOrphans(t *testing.T) {
	rt := &fakeRT{cs: []Container{{Name: "lp-gone-1", ServiceID: "gone", Revision: 1, Running: true}}}
	NewReconciler(rt).Reconcile(context.Background(), nil)
	if len(rt.removed) != 1 || rt.removed[0] != "lp-gone-1" {
		t.Fatalf("removed: %v", rt.removed)
	}
}

func TestFailureBacksOff(t *testing.T) {
	rt := &fakeRT{prepErr: errors.New("build broke")}
	r := NewReconciler(rt)
	now := time.Now()
	r.Now = func() time.Time { return now }
	svc := []model.Service{{ID: "abc", Revision: 1}}
	if s := r.Reconcile(context.Background(), svc); s[0].State != model.StateFailed {
		t.Fatalf("%+v", s)
	}
	rt.prepErr = nil
	if s := r.Reconcile(context.Background(), svc); s[0].State != model.StateFailed || len(rt.started) != 0 {
		t.Fatal("retried before backoff elapsed")
	}
	now = now.Add(2 * time.Minute)
	if s := r.Reconcile(context.Background(), svc); s[0].State != model.StateRunning {
		t.Fatalf("no retry after backoff: %+v", s)
	}
}
