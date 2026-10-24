package agent

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"launchpad/internal/build"
	"launchpad/internal/model"
)

// Docker drives the local engine through the docker CLI. Arguments are passed
// as an argv, never through a shell; user-controlled fields are validated in
// model.Service.Validate.
type Docker struct {
	// Registry (host:port, optional) is where built images are pushed so that
	// another node can pull instead of rebuilding after a failover.
	Registry string
	// BuildTimeout bounds clone + build; 0 means 15 minutes.
	BuildTimeout time.Duration
}

var (
	portRe      = regexp.MustCompile(`:(\d+)->`)
	publishRe   = regexp.MustCompile(`:(\d+)\s*$`)
	containerRe = regexp.MustCompile(`^lp-([a-f0-9]{12})-(\d+)$`)
)

func run(ctx context.Context, env []string, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	if env != nil {
		cmd.Env = append(os.Environ(), env...)
	}
	out, err := cmd.CombinedOutput()
	if err != nil {
		tail := strings.TrimSpace(string(out))
		if len(tail) > 800 {
			tail = tail[len(tail)-800:]
		}
		return "", fmt.Errorf("%s %s: %w: %s", name, args[0], err, tail)
	}
	return strings.TrimSpace(string(out)), nil
}

func (Docker) List(ctx context.Context) ([]Container, error) {
	out, err := run(ctx, nil, "docker", "ps", "-a", "--filter", "label=lp.managed=true", "--format",
		`{{.Names}}|{{.Label "lp.service"}}|{{.Label "lp.rev"}}|{{.State}}|{{.Ports}}`)
	if err != nil || out == "" {
		return nil, err
	}
	var cs []Container
	for _, line := range strings.Split(out, "\n") {
		f := strings.SplitN(line, "|", 5)
		if len(f) != 5 {
			continue
		}
		rev, _ := strconv.Atoi(f[2])
		c := Container{Name: f[0], ServiceID: f[1], Revision: rev, Running: f[3] == "running"}
		if m := portRe.FindStringSubmatch(f[4]); m != nil {
			c.HostPort, _ = strconv.Atoi(m[1])
		}
		cs = append(cs, c)
	}
	return cs, nil
}

func imageTag(s model.Service) string { return fmt.Sprintf("lp/%s:%d", s.ID, s.Revision) }

func (d Docker) Prepare(ctx context.Context, s model.Service) (string, string, error) {
	if s.Image != "" {
		_, err := run(ctx, nil, "docker", "pull", s.Image)
		return s.Image, "", err
	}
	tag := imageTag(s)
	remote := ""
	if d.Registry != "" {
		remote = d.Registry + "/" + tag
		if _, err := run(ctx, nil, "docker", "pull", remote); err == nil {
			return remote, "", nil // built elsewhere (e.g. before a failover)
		}
	}
	timeout := d.BuildTimeout
	if timeout == 0 {
		timeout = 15 * time.Minute
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	dir, err := os.MkdirTemp("", "lp-build-")
	if err != nil {
		return "", "", err
	}
	defer os.RemoveAll(dir)
	src := filepath.Join(dir, "src")
	commit, err := fetch(ctx, s.GitURL, s.BuildRef(), src)
	if err != nil {
		return "", "", err
	}
	plan, err := build.Detect(src)
	if err != nil {
		return "", "", err
	}
	args := []string{"build", "--memory", "2g", "-t", tag}
	if plan.Dockerfile != "" {
		// Generated Dockerfiles live outside the source tree.
		df := filepath.Join(dir, "Dockerfile.generated")
		if err := os.WriteFile(df, []byte(plan.Dockerfile), 0o600); err != nil {
			return "", "", err
		}
		args = append(args, "-f", df)
	}
	if _, err := run(ctx, nil, "docker", append(args, src)...); err != nil {
		return "", "", err
	}
	if remote != "" {
		// Best effort: a failed push only costs a rebuild after failover.
		if _, err := run(ctx, nil, "docker", "tag", tag, remote); err == nil {
			_, _ = run(ctx, nil, "docker", "push", remote)
		}
	}
	return tag, commit, nil
}

// fetch checks out ref (branch, tag or commit SHA; empty = default branch) at
// depth 1 into dir and returns the resolved commit. Hooks, submodules and
// credential prompts are disabled.
func fetch(ctx context.Context, url, ref, dir string) (string, error) {
	if ref == "" {
		ref = "HEAD"
	} else if !model.ValidRef(ref) {
		return "", fmt.Errorf("invalid git ref")
	}
	env := []string{"GIT_TERMINAL_PROMPT=0", "GIT_CONFIG_NOSYSTEM=1"}
	steps := [][]string{
		{"init", "-q", dir},
		{"-C", dir, "remote", "add", "origin", url},
		{"-C", dir, "-c", "core.hooksPath=/dev/null", "fetch", "-q", "--depth", "1", "--no-tags", "--no-recurse-submodules", "origin", ref},
		{"-C", dir, "-c", "core.hooksPath=/dev/null", "checkout", "-q", "FETCH_HEAD"},
	}
	for _, a := range steps {
		if _, err := run(ctx, env, "git", a...); err != nil {
			return "", err
		}
	}
	return run(ctx, env, "git", "-C", dir, "rev-parse", "HEAD")
}

func (Docker) Start(ctx context.Context, s model.Service, image string) (Container, error) {
	name := fmt.Sprintf("lp-%s-%d", s.ID, s.Revision)
	args := []string{"run", "-d", "--name", name,
		"--label", "lp.managed=true", "--label", "lp.service=" + s.ID, "--label", "lp.rev=" + strconv.Itoa(s.Revision),
		"--restart", "unless-stopped",
		"--memory", strconv.Itoa(s.Memory()) + "m", "--cpus", strconv.FormatFloat(s.CPU(), 'f', -1, 64),
		"--pids-limit", "1024", "--security-opt", "no-new-privileges",
		"--log-opt", "max-size=10m", "--log-opt", "max-file=3",
		"-p", strconv.Itoa(s.Port), "-e", "PORT=" + strconv.Itoa(s.Port)}
	for _, v := range s.Volumes {
		args = append(args, "-v", fmt.Sprintf("lp-%s-%s:%s", s.ID, v.Name, v.Path))
	}
	for k, v := range s.Env {
		args = append(args, "-e", k+"="+v)
	}
	args = append(args, image)
	if _, err := run(ctx, nil, "docker", args...); err != nil {
		return Container{}, err
	}
	out, err := run(ctx, nil, "docker", "port", name, strconv.Itoa(s.Port))
	if err != nil {
		return Container{}, err
	}
	m := publishRe.FindStringSubmatch(strings.Split(out, "\n")[0])
	if m == nil {
		return Container{}, fmt.Errorf("cannot parse published port from %q", out)
	}
	hp, _ := strconv.Atoi(m[1])
	return Container{Name: name, ServiceID: s.ID, Revision: s.Revision, Running: true, HostPort: hp}, nil
}

func (Docker) Remove(ctx context.Context, name string) error {
	_, err := run(ctx, nil, "docker", "rm", "-f", name)
	if err != nil && strings.Contains(err.Error(), "No such container") {
		err = nil
	}
	if err == nil {
		// Best effort: free the disk used by that revision's build.
		if m := containerRe.FindStringSubmatch(name); m != nil {
			_, _ = run(ctx, nil, "docker", "rmi", fmt.Sprintf("lp/%s:%s", m[1], m[2]))
		}
	}
	return err
}

func (Docker) Logs(ctx context.Context, name string, since time.Time, tail int) ([]model.LogLine, error) {
	args := []string{"logs", "--timestamps"}
	if !since.IsZero() {
		args = append(args, "--since", since.UTC().Format(time.RFC3339Nano))
	} else if tail > 0 {
		args = append(args, "--tail", strconv.Itoa(tail))
	}
	out, err := run(ctx, nil, "docker", append(args, name)...)
	if err != nil || out == "" {
		return nil, err
	}
	return ParseLogs(out, time.Now()), nil
}

// ParseLogs parses `docker logs --timestamps` output. Lines without a valid
// timestamp keep the previous line's time (or now), so multi-line output stays ordered.
func ParseLogs(out string, now time.Time) []model.LogLine {
	var lines []model.LogLine
	last := now
	for _, raw := range strings.Split(out, "\n") {
		if raw == "" {
			continue
		}
		ts, text := last, raw
		if i := strings.IndexByte(raw, ' '); i > 0 {
			if t, err := time.Parse(time.RFC3339Nano, raw[:i]); err == nil {
				ts, text = t, raw[i+1:]
			}
		}
		last = ts
		text = strings.ToValidUTF8(text, "?")
		if len(text) > model.MaxLogLineBytes {
			text = strings.ToValidUTF8(text[:model.MaxLogLineBytes], "") + "…"
		}
		lines = append(lines, model.LogLine{Time: ts, Text: text})
	}
	return lines
}
