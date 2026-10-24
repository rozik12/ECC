package store

import (
	"crypto/rand"
	"encoding/hex"
	"errors"

	"launchpad/internal/model"
	"time"
)

var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("name already in use")
)

// Store is the control plane's state. Implementations must be safe for
// concurrent use; PG must also be safe across several control plane processes.
type Store interface {
	CreateService(model.Service) (model.Service, error)
	GetService(id string) (model.Service, error)
	ListServices() ([]model.Service, error)
	UpdateService(id string, fn func(*model.Service)) (model.Service, error)
	DeleteService(id string) error

	UpsertNode(model.Node) error
	Touch(nodeID string, now time.Time) error
	ListNodes() ([]model.Node, error)

	SetStatuses(nodeID string, sts []model.Status) error
	StatusesOf(serviceID string) ([]model.Status, error)
}

func NewID() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// Live picks the revision that should receive traffic: the newest revision
// that is healthy. While a new revision is still starting, the previous one
// keeps serving, which is what makes redeploys zero-downtime.
func Live(sts []model.Status) (model.Status, bool) {
	var best model.Status
	found := false
	for _, st := range sts {
		if st.State == model.StateRunning && (!found || st.Revision > best.Revision) {
			best, found = st, true
		}
	}
	return best, found
}
