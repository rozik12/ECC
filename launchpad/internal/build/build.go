// Package build decides how to turn a source tree into an image. A repo with
// its own Dockerfile is built as-is; otherwise a Dockerfile is generated for
// the detected language. Generated Dockerfiles are passed to `docker build -f`
// from outside the source tree, so the repo is never modified.
package build

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type Plan struct {
	Kind       string // dockerfile | node | python | go | static
	Dockerfile string // generated content; empty when the repo has its own
}

var ErrUnknown = errors.New("cannot detect how to build this repository: add a Dockerfile, or a package.json / requirements.txt / go.mod / index.html")

func exists(dir, name string) bool {
	_, err := os.Stat(filepath.Join(dir, name))
	return err == nil
}

// Detect inspects dir (a checked-out repository).
func Detect(dir string) (Plan, error) {
	switch {
	case exists(dir, "Dockerfile"):
		return Plan{Kind: "dockerfile"}, nil
	case exists(dir, "package.json"):
		return node(dir)
	case exists(dir, "requirements.txt") || exists(dir, "pyproject.toml"):
		return python(dir)
	case exists(dir, "go.mod"):
		return golang(dir)
	case exists(dir, "index.html"):
		return Plan{Kind: "static", Dockerfile: "FROM nginx:alpine\nCOPY . /usr/share/nginx/html\n"}, nil
	}
	return Plan{}, ErrUnknown
}

// procfileWeb returns the `web:` command of a Procfile, if any.
func procfileWeb(dir string) string {
	f, err := os.Open(filepath.Join(dir, "Procfile"))
	if err != nil {
		return ""
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		if cmd, ok := strings.CutPrefix(strings.TrimSpace(sc.Text()), "web:"); ok {
			cmd = strings.TrimSpace(cmd)
			if len(cmd) <= 1000 {
				return cmd
			}
		}
	}
	return ""
}

// cmdLine renders a shell command as a JSON-array CMD (valid Dockerfile syntax).
func shellCmd(cmd string) string {
	b, _ := json.Marshal([]string{"sh", "-c", cmd})
	return "CMD " + string(b)
}

func execCmd(args ...string) string {
	b, _ := json.Marshal(args)
	return "CMD " + string(b)
}

var safeFile = regexp.MustCompile(`^[A-Za-z0-9._/-]{1,100}$`)

func node(dir string) (Plan, error) {
	raw, err := os.ReadFile(filepath.Join(dir, "package.json"))
	if err != nil {
		return Plan{}, err
	}
	var pkg struct {
		Main    string            `json:"main"`
		Scripts map[string]string `json:"scripts"`
	}
	if err := json.Unmarshal(raw, &pkg); err != nil {
		return Plan{}, fmt.Errorf("package.json: %w", err)
	}
	pm, install := "npm", "if [ -f package-lock.json ]; then npm ci --include=dev; else npm install --include=dev; fi"
	switch {
	case exists(dir, "pnpm-lock.yaml"):
		pm, install = "pnpm", "corepack enable && pnpm install --frozen-lockfile"
	case exists(dir, "yarn.lock"):
		pm, install = "yarn", "corepack enable && yarn install --frozen-lockfile"
	}
	var start string
	switch web := procfileWeb(dir); {
	case web != "":
		start = shellCmd(web)
	case pkg.Scripts["start"] != "":
		start = execCmd(pm, "start")
	case pkg.Main != "" && safeFile.MatchString(pkg.Main) && !strings.Contains(pkg.Main, ".."):
		start = execCmd("node", pkg.Main)
	default:
		return Plan{}, errors.New(`node project has no "start" script, "main" file or Procfile web: line`)
	}
	var b strings.Builder
	b.WriteString("FROM node:22-slim\nWORKDIR /app\n")
	if pm != "npm" {
		// corepack needs the manifest first; lockfile copy keeps the install layer cacheable.
		b.WriteString("COPY package.json " + lockfile(pm) + " ./\n")
	} else {
		b.WriteString("COPY package*.json ./\n")
	}
	b.WriteString("RUN " + install + "\nCOPY . .\n")
	if pkg.Scripts["build"] != "" {
		b.WriteString("RUN " + pm + " run build\n")
	}
	if pm == "npm" {
		b.WriteString("RUN npm prune --omit=dev\n")
	}
	b.WriteString("ENV NODE_ENV=production\n" + start + "\n")
	return Plan{Kind: "node", Dockerfile: b.String()}, nil
}

func lockfile(pm string) string {
	if pm == "pnpm" {
		return "pnpm-lock.yaml"
	}
	return "yarn.lock"
}

func python(dir string) (Plan, error) {
	var start string
	switch web := procfileWeb(dir); {
	case web != "":
		start = shellCmd(web)
	case exists(dir, "app.py"):
		start = execCmd("python", "app.py")
	case exists(dir, "main.py"):
		start = execCmd("python", "main.py")
	default:
		return Plan{}, errors.New("python project needs app.py, main.py or a Procfile web: line")
	}
	var b strings.Builder
	b.WriteString("FROM python:3.12-slim\nWORKDIR /app\nENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1\n")
	if exists(dir, "requirements.txt") {
		b.WriteString("COPY requirements.txt ./\nRUN pip install -r requirements.txt\nCOPY . .\n")
	} else {
		b.WriteString("COPY . .\nRUN pip install .\n")
	}
	b.WriteString(start + "\n")
	return Plan{Kind: "python", Dockerfile: b.String()}, nil
}

var goVersionRe = regexp.MustCompile(`(?m)^go\s+(\d+\.\d+)(?:\.\d+)?\s*$`)

func golang(dir string) (Plan, error) {
	ver := "1.24"
	if mod, err := os.ReadFile(filepath.Join(dir, "go.mod")); err == nil {
		if m := goVersionRe.FindSubmatch(mod); m != nil {
			ver = string(m[1])
		}
	}
	pkg, err := goMainPackage(dir)
	if err != nil {
		return Plan{}, err
	}
	d := fmt.Sprintf(`FROM golang:%s AS build
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/app %s
FROM gcr.io/distroless/static-debian12
COPY --from=build /out/app /app
CMD ["/app"]
`, ver, pkg)
	return Plan{Kind: "go", Dockerfile: d}, nil
}

// goMainPackage finds what to build: the root package if it is `main`, else
// the only directory under cmd/.
func goMainPackage(dir string) (string, error) {
	if hasMain(dir) {
		return ".", nil
	}
	entries, err := os.ReadDir(filepath.Join(dir, "cmd"))
	if err == nil {
		var found []string
		for _, e := range entries {
			if e.IsDir() && hasMain(filepath.Join(dir, "cmd", e.Name())) {
				found = append(found, e.Name())
			}
		}
		if len(found) == 1 && safeFile.MatchString(found[0]) {
			return "./cmd/" + found[0], nil
		}
		if len(found) > 1 {
			return "", errors.New("several main packages under cmd/: add a Dockerfile to choose one")
		}
	}
	return "", errors.New("no main package in the repository root or under cmd/")
}

func hasMain(dir string) bool {
	files, _ := filepath.Glob(filepath.Join(dir, "*.go"))
	for _, f := range files {
		if strings.HasSuffix(f, "_test.go") {
			continue
		}
		b, err := os.ReadFile(f)
		if err == nil && regexp.MustCompile(`(?m)^package main\b`).Match(b) {
			return true
		}
	}
	return false
}
