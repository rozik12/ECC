package agent

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"

	"launchpad/internal/model"
)

// Docker drives the local engine through the docker CLI. Arguments are passed
// as an argv, never through a shell; user-controlled fields are validated in
// model.Service.Validate.
type Docker struct{}

var portRe = regexp.MustCompile(`:(\d+)->`)

func run(ctx context.Context, name string, args ...string) (string, error) {
	out, err := exec.CommandContext(ctx, name, args...).CombinedOutput()
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
	out, err := run(ctx, "docker", "ps", "-a", "--filter", "label=lp.managed=true", "--format",
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

func (Docker) Prepare(ctx context.Context, s model.Service) (string, error) {
	if s.Image != "" {
		_, err := run(ctx, "docker", "pull", s.Image)
		return s.Image, err
	}
	dir, err := os.MkdirTemp("", "lp-build-")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(dir)
	args := []string{"clone", "--depth", "1"}
	if s.GitRef != "" {
		args = append(args, "--branch", s.GitRef)
	}
	args = append(args, "--", s.GitURL, dir)
	if _, err := run(ctx, "git", args...); err != nil {
		return "", err
	}
	tag := fmt.Sprintf("lp/%s:%d", s.ID, s.Revision)
	_, err = run(ctx, "docker", "build", "-t", tag, dir)
	return tag, err
}

func (Docker) Start(ctx context.Context, s model.Service, image string) (Container, error) {
	name := fmt.Sprintf("lp-%s-%d", s.ID, s.Revision)
	args := []string{"run", "-d", "--name", name,
		"--label", "lp.managed=true", "--label", "lp.service=" + s.ID, "--label", "lp.rev=" + strconv.Itoa(s.Revision),
		"--restart", "unless-stopped", "--memory", "512m", "--cpus", "1",
		"-p", strconv.Itoa(s.Port), "-e", "PORT=" + strconv.Itoa(s.Port)}
	for k, v := range s.Env {
		args = append(args, "-e", k+"="+v)
	}
	args = append(args, image)
	if _, err := run(ctx, "docker", args...); err != nil {
		return Container{}, err
	}
	out, err := run(ctx, "docker", "port", name, strconv.Itoa(s.Port))
	if err != nil {
		return Container{}, err
	}
	m := regexp.MustCompile(`:(\d+)\s*$`).FindStringSubmatch(strings.Split(out, "\n")[0])
	if m == nil {
		return Container{}, fmt.Errorf("cannot parse published port from %q", out)
	}
	hp, _ := strconv.Atoi(m[1])
	return Container{Name: name, ServiceID: s.ID, Revision: s.Revision, Running: true, HostPort: hp}, nil
}

func (Docker) Remove(ctx context.Context, name string) error {
	_, err := run(ctx, "docker", "rm", "-f", name)
	return err
}
