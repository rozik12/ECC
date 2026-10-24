// Package cli implements the `lp` command: a thin client for the control plane API.
package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"text/tabwriter"
	"time"

	"launchpad/internal/model"
)

const usage = `lp - Launchpad command line

Usage: lp [--url URL] [--token TOKEN] <command> [args]

Environment: LP_URL (default http://localhost:8080), LP_API_TOKEN

Commands:
  ls                              list services
  nodes                           list nodes
  deploy <name> --image I | --git URL   create a service
        [--ref R] [--port N] [--health /path] [-e K=V]... [--memory MB] [--cpus N] [--volume name:/path]...
  status <service>                show one service
  logs <service> [-f] [-n N]      print logs (-f follows)
  env <service> [K=V ...]         show variables, or set/merge them and redeploy
  env <service> --unset K ...     remove variables and redeploy
  redeploy <service>              rebuild and roll out the current config
  rollback <service> <revision>   go back to an earlier revision
  domains <service> [add|rm <domain>]
  webhook <service>               print the GitHub webhook URL and secret
  rm <service>                    delete a service

<service> is a name or an id.`

// App holds what a command needs; tests construct it directly.
type App struct {
	BaseURL string
	Token   string
	HTTP    *http.Client
	Out     io.Writer
	Err     io.Writer
	Poll    time.Duration // log follow interval
}

type stringList []string

func (s *stringList) String() string     { return strings.Join(*s, ",") }
func (s *stringList) Set(v string) error { *s = append(*s, v); return nil }

// Main parses global flags and runs a command, returning the exit code.
func Main(ctx context.Context, args []string, out, errOut io.Writer) int {
	a := &App{BaseURL: envOr("LP_URL", "http://localhost:8080"), Token: os.Getenv("LP_API_TOKEN"),
		HTTP: &http.Client{Timeout: 30 * time.Second}, Out: out, Err: errOut, Poll: time.Second}
	g := flag.NewFlagSet("lp", flag.ContinueOnError)
	g.SetOutput(io.Discard)
	g.StringVar(&a.BaseURL, "url", a.BaseURL, "")
	g.StringVar(&a.Token, "token", a.Token, "")
	if err := g.Parse(args); err != nil || g.NArg() == 0 {
		fmt.Fprintln(errOut, usage)
		return 2
	}
	if err := a.Run(ctx, g.Arg(0), g.Args()[1:]); err != nil {
		fmt.Fprintln(errOut, "error:", err)
		return 1
	}
	return 0
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

// Run executes one command.
func (a *App) Run(ctx context.Context, cmd string, args []string) error {
	if a.Token == "" {
		return errors.New("no API token: set LP_API_TOKEN or pass --token")
	}
	switch cmd {
	case "ls":
		return a.ls(ctx)
	case "nodes":
		return a.nodes(ctx)
	case "deploy":
		return a.deploy(ctx, args)
	case "status":
		return a.status(ctx, args)
	case "logs":
		return a.logs(ctx, args)
	case "env":
		return a.env(ctx, args)
	case "redeploy":
		return a.simple(ctx, args, "redeploy", "POST", "/redeploy", "redeploying")
	case "rollback":
		return a.rollback(ctx, args)
	case "domains":
		return a.domains(ctx, args)
	case "webhook":
		return a.webhook(ctx, args)
	case "rm":
		return a.rm(ctx, args)
	}
	return fmt.Errorf("unknown command %q\n\n%s", cmd, usage)
}

// call performs a request and decodes the JSON response into out (if non-nil).
func (a *App) call(ctx context.Context, method, path string, body, out any) error {
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(a.BaseURL, "/")+"/api/v1"+path, rd)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+a.Token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := a.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		var e struct{ Error string }
		_ = json.NewDecoder(resp.Body).Decode(&e)
		if e.Error == "" {
			e.Error = resp.Status
		}
		return errors.New(e.Error)
	}
	if out == nil || resp.StatusCode == http.StatusNoContent {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// view mirrors the API's service view.
type view struct {
	model.Service
	State           string `json:"state"`
	Error           string `json:"error"`
	ServingRevision int    `json:"serving_revision"`
	NodeName        string `json:"node_name"`
}

// resolve turns a name or id into a service view.
func (a *App) resolve(ctx context.Context, ref string) (view, error) {
	var all []view
	if err := a.call(ctx, "GET", "/services", nil, &all); err != nil {
		return view{}, err
	}
	for _, s := range all {
		if s.Name == ref || s.ID == ref {
			return s, nil
		}
	}
	return view{}, fmt.Errorf("no service named %q", ref)
}

func (a *App) one(ctx context.Context, args []string, cmd string) (view, error) {
	if len(args) != 1 {
		return view{}, fmt.Errorf("usage: lp %s <service>", cmd)
	}
	return a.resolve(ctx, args[0])
}

// parseInterspersed lets flags appear before or after positional arguments.
func parseInterspersed(fs *flag.FlagSet, args []string) ([]string, error) {
	var pos []string
	for {
		if err := fs.Parse(args); err != nil {
			return nil, err
		}
		if fs.NArg() == 0 {
			return pos, nil
		}
		pos = append(pos, fs.Arg(0))
		args = fs.Args()[1:]
	}
}

func newFlags(name string) *flag.FlagSet {
	fs := flag.NewFlagSet(name, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	return fs
}

func (a *App) ls(ctx context.Context) error {
	var all []view
	if err := a.call(ctx, "GET", "/services", nil, &all); err != nil {
		return err
	}
	w := tabwriter.NewWriter(a.Out, 0, 4, 2, ' ', 0)
	fmt.Fprintln(w, "NAME\tSTATE\tREV\tNODE\tDOMAIN")
	for _, s := range all {
		rev := strconv.Itoa(s.Revision)
		if s.ServingRevision != 0 {
			rev += " (serving " + strconv.Itoa(s.ServingRevision) + ")"
		}
		fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\n", s.Name, s.State, rev, dash(s.NodeName), s.Domain)
	}
	return w.Flush()
}

func (a *App) nodes(ctx context.Context) error {
	var ns []struct {
		model.Node
		Healthy  bool `json:"healthy"`
		Services int  `json:"services"`
	}
	if err := a.call(ctx, "GET", "/nodes", nil, &ns); err != nil {
		return err
	}
	w := tabwriter.NewWriter(a.Out, 0, 4, 2, ' ', 0)
	fmt.Fprintln(w, "NAME\tADDRESS\tSTATUS\tSERVICES")
	for _, n := range ns {
		st := "down"
		if n.Healthy {
			st = "healthy"
		}
		fmt.Fprintf(w, "%s\t%s\t%s\t%d\n", n.Name, n.Addr, st, n.Services)
	}
	return w.Flush()
}

func dash(s string) string {
	if s == "" {
		return "-"
	}
	return s
}

func (a *App) deploy(ctx context.Context, args []string) error {
	fs := newFlags("deploy")
	var env, vols stringList
	image := fs.String("image", "", "")
	git := fs.String("git", "", "")
	ref := fs.String("ref", "", "")
	port := fs.Int("port", 0, "")
	health := fs.String("health", "", "")
	mem := fs.Int("memory", 0, "")
	cpus := fs.Float64("cpus", 0, "")
	fs.Var(&env, "e", "")
	fs.Var(&vols, "volume", "")
	pos, err := parseInterspersed(fs, args)
	if err != nil || len(pos) != 1 {
		return errors.New("usage: lp deploy <name> (--image I | --git URL) [--ref R] [--port N] [--health /p] [-e K=V]... [--memory MB] [--cpus N] [--volume name:/path]...")
	}
	envMap, err := parseKV(env)
	if err != nil {
		return err
	}
	body := map[string]any{"name": pos[0], "env": envMap}
	set := func(k string, v any, ok bool) {
		if ok {
			body[k] = v
		}
	}
	set("image", *image, *image != "")
	set("git_url", *git, *git != "")
	set("git_ref", *ref, *ref != "")
	set("port", *port, *port != 0)
	set("health_path", *health, *health != "")
	set("memory_mb", *mem, *mem != 0)
	set("cpus", *cpus, *cpus != 0)
	var vs []model.Volume
	for _, v := range vols {
		name, path, ok := strings.Cut(v, ":")
		if !ok {
			return fmt.Errorf("bad --volume %q, want name:/path", v)
		}
		vs = append(vs, model.Volume{Name: name, Path: path})
	}
	set("volumes", vs, len(vs) > 0)
	var s view
	if err := a.call(ctx, "POST", "/services", body, &s); err != nil {
		return err
	}
	fmt.Fprintf(a.Out, "created %s (%s)\nurl: %s\n", s.Name, s.ID, s.Domain)
	if s.WebhookSecret != "" {
		fmt.Fprintf(a.Out, "deploy on push: lp webhook %s\n", s.Name)
	}
	return nil
}

func parseKV(items []string) (map[string]string, error) {
	m := map[string]string{}
	for _, kv := range items {
		k, v, ok := strings.Cut(kv, "=")
		if !ok || k == "" {
			return nil, fmt.Errorf("bad variable %q, want KEY=value", kv)
		}
		m[k] = v
	}
	return m, nil
}

func (a *App) status(ctx context.Context, args []string) error {
	s, err := a.one(ctx, args, "status")
	if err != nil {
		return err
	}
	w := tabwriter.NewWriter(a.Out, 0, 4, 2, ' ', 0)
	fmt.Fprintf(w, "name\t%s\nid\t%s\nstate\t%s\n", s.Name, s.ID, s.State)
	if s.Error != "" {
		fmt.Fprintf(w, "error\t%s\n", s.Error)
	}
	rev := strconv.Itoa(s.Revision)
	if s.ServingRevision != 0 {
		rev += " (traffic on revision " + strconv.Itoa(s.ServingRevision) + ")"
	}
	src := s.Image
	if s.GitURL != "" {
		src = s.GitURL + " @ " + dash(s.GitRef)
		if s.PinCommit != "" {
			src += " (pinned " + short(s.PinCommit) + ")"
		}
	}
	fmt.Fprintf(w, "revision\t%s\nsource\t%s\nnode\t%s\nurl\t%s\n", rev, src, dash(s.NodeName), s.Domain)
	if len(s.CustomDomains) > 0 {
		fmt.Fprintf(w, "custom domains\t%s\n", strings.Join(s.CustomDomains, ", "))
	}
	if err := w.Flush(); err != nil {
		return err
	}
	if len(s.History) > 0 {
		fmt.Fprintln(a.Out, "\nrecent revisions:")
		for i := len(s.History) - 1; i >= 0 && i >= len(s.History)-5; i-- {
			r := s.History[i]
			fmt.Fprintf(a.Out, "  %d  %s  %s  %s\n", r.Revision, r.At.Format("2006-01-02 15:04"), r.Note, short(r.Commit))
		}
	}
	return nil
}

func short(c string) string {
	if len(c) > 7 {
		return c[:7]
	}
	return c
}

func (a *App) logs(ctx context.Context, args []string) error {
	fs := newFlags("logs")
	follow := fs.Bool("f", false, "")
	n := fs.Int("n", 100, "")
	pos, err := parseInterspersed(fs, args)
	if err != nil || len(pos) != 1 {
		return errors.New("usage: lp logs <service> [-f] [-n N]")
	}
	s, err := a.resolve(ctx, pos[0])
	if err != nil {
		return err
	}
	var after int64
	limit := *n
	for {
		var res struct {
			Lines []model.LogLine `json:"lines"`
			Next  int64           `json:"next"`
		}
		if err := a.call(ctx, "GET", fmt.Sprintf("/services/%s/logs?after=%d&limit=%d", s.ID, after, limit), nil, &res); err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return err
		}
		for _, l := range res.Lines {
			fmt.Fprintf(a.Out, "%s r%d %s\n", l.Time.Local().Format("15:04:05"), l.Revision, l.Text)
		}
		after, limit = res.Next, 1000
		if !*follow {
			return nil
		}
		select {
		case <-ctx.Done():
			return nil
		case <-time.After(a.Poll):
		}
	}
}

func (a *App) env(ctx context.Context, args []string) error {
	fs := newFlags("env")
	var unset stringList
	fs.Var(&unset, "unset", "")
	pos, err := parseInterspersed(fs, args)
	if err != nil || len(pos) < 1 {
		return errors.New("usage: lp env <service> [K=V ...] [--unset K]...")
	}
	s, err := a.resolve(ctx, pos[0])
	if err != nil {
		return err
	}
	if len(pos) == 1 && len(unset) == 0 {
		keys := make([]string, 0, len(s.Env))
		for k := range s.Env {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			fmt.Fprintf(a.Out, "%s=%s\n", k, s.Env[k])
		}
		return nil
	}
	set, err := parseKV(pos[1:])
	if err != nil {
		return err
	}
	merged := map[string]string{}
	for k, v := range s.Env {
		merged[k] = v
	}
	for _, k := range unset {
		delete(merged, k)
	}
	for k, v := range set {
		merged[k] = v
	}
	if err := a.call(ctx, "PUT", "/services/"+s.ID+"/env", merged, nil); err != nil {
		return err
	}
	fmt.Fprintln(a.Out, "saved; a new revision is deploying")
	return nil
}

func (a *App) simple(ctx context.Context, args []string, cmd, method, suffix, msg string) error {
	s, err := a.one(ctx, args, cmd)
	if err != nil {
		return err
	}
	if err := a.call(ctx, method, "/services/"+s.ID+suffix, struct{}{}, nil); err != nil {
		return err
	}
	fmt.Fprintln(a.Out, msg)
	return nil
}

func (a *App) rollback(ctx context.Context, args []string) error {
	if len(args) != 2 {
		return errors.New("usage: lp rollback <service> <revision>")
	}
	rev, err := strconv.Atoi(args[1])
	if err != nil {
		return fmt.Errorf("bad revision %q", args[1])
	}
	s, err := a.resolve(ctx, args[0])
	if err != nil {
		return err
	}
	if err := a.call(ctx, "POST", "/services/"+s.ID+"/rollback", map[string]int{"revision": rev}, nil); err != nil {
		return err
	}
	fmt.Fprintf(a.Out, "rolling back to revision %d\n", rev)
	return nil
}

func (a *App) domains(ctx context.Context, args []string) error {
	if len(args) != 1 && len(args) != 3 {
		return errors.New("usage: lp domains <service> [add|rm <domain>]")
	}
	s, err := a.resolve(ctx, args[0])
	if err != nil {
		return err
	}
	if len(args) == 1 {
		fmt.Fprintf(a.Out, "%s (platform)\n", s.Domain)
		for _, d := range s.CustomDomains {
			fmt.Fprintln(a.Out, d)
		}
		return nil
	}
	switch args[1] {
	case "add":
		if err := a.call(ctx, "POST", "/services/"+s.ID+"/domains", map[string]string{"domain": args[2]}, nil); err != nil {
			return err
		}
		fmt.Fprintf(a.Out, "added. At your DNS provider, point a CNAME for %s to %s\n", args[2], s.Domain)
	case "rm":
		if err := a.call(ctx, "DELETE", "/services/"+s.ID+"/domains/"+url.PathEscape(strings.ToLower(args[2])), nil, nil); err != nil {
			return err
		}
		fmt.Fprintln(a.Out, "removed")
	default:
		return errors.New("usage: lp domains <service> [add|rm <domain>]")
	}
	return nil
}

func (a *App) webhook(ctx context.Context, args []string) error {
	s, err := a.one(ctx, args, "webhook")
	if err != nil {
		return err
	}
	if s.WebhookSecret == "" {
		return errors.New("only git services have a webhook")
	}
	fmt.Fprintf(a.Out, "payload URL: %s/hooks/github/%s\ncontent type: application/json\nsecret: %s\nevent: push\n",
		strings.TrimRight(a.BaseURL, "/"), s.ID, s.WebhookSecret)
	return nil
}

func (a *App) rm(ctx context.Context, args []string) error {
	s, err := a.one(ctx, args, "rm")
	if err != nil {
		return err
	}
	if err := a.call(ctx, "DELETE", "/services/"+s.ID, nil, nil); err != nil {
		return err
	}
	fmt.Fprintf(a.Out, "deleted %s\n", s.Name)
	return nil
}
