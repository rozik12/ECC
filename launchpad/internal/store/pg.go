package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	_ "github.com/jackc/pgx/v5/stdlib"

	"launchpad/internal/model"
)

// schema is applied on every start; every statement is idempotent.
const schema = `
create table if not exists nodes (
  id text primary key, name text not null, addr text not null, last_seen timestamptz not null);
create table if not exists services (
  id text primary key, name text not null unique, data jsonb not null, created_at timestamptz not null);
create table if not exists statuses (
  service_id text not null, revision int not null, node_id text not null, data jsonb not null,
  primary key (service_id, revision));
`

const leaderLockKey = 0x4c50 // "LP"

// PG keeps state in Postgres so several control plane replicas can run at once.
// Only one of them (the advisory-lock holder, see IsLeader) runs the scheduler.
type PG struct {
	db *sql.DB

	mu   sync.Mutex
	lock *sql.Conn
}

func OpenPG(ctx context.Context, url string) (*PG, error) {
	db, err := sql.Open("pgx", url)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(10)
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, err
	}
	if _, err := db.ExecContext(ctx, schema); err != nil {
		db.Close()
		return nil, err
	}
	return &PG{db: db}, nil
}

func (p *PG) Close() error {
	p.mu.Lock()
	if p.lock != nil {
		_, _ = p.lock.ExecContext(context.Background(), "select pg_advisory_unlock($1)", leaderLockKey)
		p.lock.Close()
		p.lock = nil
	}
	p.mu.Unlock()
	return p.db.Close()
}

// IsLeader reports whether this process holds the cluster-wide scheduler lock,
// acquiring it if free. The lock lives as long as its dedicated connection, so
// a crashed replica releases it automatically and another takes over.
func (p *PG) IsLeader(ctx context.Context) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.lock != nil {
		if p.lock.PingContext(ctx) == nil {
			return true
		}
		p.lock.Close()
		p.lock = nil
	}
	c, err := p.db.Conn(ctx)
	if err != nil {
		return false
	}
	var ok bool
	if err := c.QueryRowContext(ctx, "select pg_try_advisory_lock($1)", leaderLockKey).Scan(&ok); err != nil || !ok {
		c.Close()
		return false
	}
	p.lock = c
	return true
}

func (p *PG) CreateService(svc model.Service) (model.Service, error) {
	svc.ID = NewID()
	svc.Revision = 1
	svc.CreatedAt = time.Now().UTC()
	b, _ := json.Marshal(svc)
	_, err := p.db.Exec("insert into services(id,name,data,created_at) values($1,$2,$3,$4)",
		svc.ID, svc.Name, b, svc.CreatedAt)
	var pe *pgconn.PgError
	if errors.As(err, &pe) && pe.Code == "23505" {
		return model.Service{}, ErrConflict
	}
	return svc, err
}

func scanService(b []byte) (model.Service, error) {
	var s model.Service
	err := json.Unmarshal(b, &s)
	return s, err
}

func (p *PG) GetService(id string) (model.Service, error) {
	var b []byte
	err := p.db.QueryRow("select data from services where id=$1", id).Scan(&b)
	if errors.Is(err, sql.ErrNoRows) {
		return model.Service{}, ErrNotFound
	}
	if err != nil {
		return model.Service{}, err
	}
	return scanService(b)
}

func (p *PG) ListServices() ([]model.Service, error) {
	rows, err := p.db.Query("select data from services order by created_at, id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.Service
	for rows.Next() {
		var b []byte
		if err := rows.Scan(&b); err != nil {
			return nil, err
		}
		s, err := scanService(b)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// UpdateService applies fn under a row lock, so concurrent replicas cannot
// lose each other's edits (e.g. two Revision++ in a row both count).
func (p *PG) UpdateService(id string, fn func(*model.Service)) (model.Service, error) {
	tx, err := p.db.Begin()
	if err != nil {
		return model.Service{}, err
	}
	defer tx.Rollback()
	var b []byte
	err = tx.QueryRow("select data from services where id=$1 for update", id).Scan(&b)
	if errors.Is(err, sql.ErrNoRows) {
		return model.Service{}, ErrNotFound
	}
	if err != nil {
		return model.Service{}, err
	}
	svc, err := scanService(b)
	if err != nil {
		return model.Service{}, err
	}
	fn(&svc)
	nb, _ := json.Marshal(svc)
	if _, err := tx.Exec("update services set data=$2 where id=$1", id, nb); err != nil {
		return model.Service{}, err
	}
	return svc, tx.Commit()
}

func (p *PG) DeleteService(id string) error {
	tx, err := p.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	res, err := tx.Exec("delete from services where id=$1", id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	if _, err := tx.Exec("delete from statuses where service_id=$1", id); err != nil {
		return err
	}
	return tx.Commit()
}

func (p *PG) UpsertNode(n model.Node) error {
	_, err := p.db.Exec(`insert into nodes(id,name,addr,last_seen) values($1,$2,$3,$4)
		on conflict (id) do update set name=$2, addr=$3, last_seen=$4`, n.ID, n.Name, n.Addr, n.LastSeen)
	return err
}

func (p *PG) Touch(nodeID string, now time.Time) error {
	res, err := p.db.Exec("update nodes set last_seen=$2 where id=$1", nodeID, now)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (p *PG) ListNodes() ([]model.Node, error) {
	rows, err := p.db.Query("select id,name,addr,last_seen from nodes order by id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.Node
	for rows.Next() {
		var n model.Node
		if err := rows.Scan(&n.ID, &n.Name, &n.Addr, &n.LastSeen); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

func (p *PG) SetStatuses(nodeID string, sts []model.Status) error {
	byService := map[string][]model.Status{}
	for _, st := range sts {
		byService[st.ServiceID] = append(byService[st.ServiceID], st)
	}
	if len(byService) == 0 {
		return nil
	}
	tx, err := p.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for id, list := range byService {
		// Only the node the service is assigned to may report on it.
		var owner sql.NullString
		err := tx.QueryRow("select data->>'node_id' from services where id=$1", id).Scan(&owner)
		if errors.Is(err, sql.ErrNoRows) || (err == nil && owner.String != nodeID) {
			continue
		}
		if err != nil {
			return err
		}
		if _, err := tx.Exec("delete from statuses where service_id=$1", id); err != nil {
			return err
		}
		for _, st := range list {
			b, _ := json.Marshal(st)
			if _, err := tx.Exec("insert into statuses(service_id,revision,node_id,data) values($1,$2,$3,$4)",
				id, st.Revision, nodeID, b); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

func (p *PG) StatusesOf(id string) ([]model.Status, error) {
	rows, err := p.db.Query(`select s.data from statuses s join services v on v.id = s.service_id
		where s.service_id=$1 and s.node_id = coalesce(v.data->>'node_id','') order by s.revision`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.Status
	for rows.Next() {
		var b []byte
		if err := rows.Scan(&b); err != nil {
			return nil, err
		}
		var st model.Status
		if err := json.Unmarshal(b, &st); err != nil {
			return nil, err
		}
		out = append(out, st)
	}
	return out, rows.Err()
}
