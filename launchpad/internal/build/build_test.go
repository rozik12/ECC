package build

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func tree(t *testing.T, files map[string]string) string {
	t.Helper()
	dir := t.TempDir()
	for name, body := range files {
		p := filepath.Join(dir, name)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

func mustPlan(t *testing.T, files map[string]string) Plan {
	t.Helper()
	p, err := Detect(tree(t, files))
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func TestOwnDockerfileWins(t *testing.T) {
	p := mustPlan(t, map[string]string{"Dockerfile": "FROM scratch", "package.json": "{}"})
	if p.Kind != "dockerfile" || p.Dockerfile != "" {
		t.Fatalf("%+v", p)
	}
}

func TestNode(t *testing.T) {
	p := mustPlan(t, map[string]string{"package.json": `{"scripts":{"start":"node server.js","build":"tsc"}}`, "package-lock.json": "{}"})
	for _, want := range []string{"FROM node:22-slim", "npm ci --include=dev", "RUN npm run build", "npm prune --omit=dev", `CMD ["npm","start"]`} {
		if !strings.Contains(p.Dockerfile, want) {
			t.Errorf("missing %q in:\n%s", want, p.Dockerfile)
		}
	}
	p = mustPlan(t, map[string]string{"package.json": `{"main":"src/index.js"}`})
	if !strings.Contains(p.Dockerfile, `CMD ["node","src/index.js"]`) || strings.Contains(p.Dockerfile, "run build") {
		t.Errorf("main fallback:\n%s", p.Dockerfile)
	}
	p = mustPlan(t, map[string]string{"package.json": `{"scripts":{"start":"x"}}`, "pnpm-lock.yaml": ""})
	if !strings.Contains(p.Dockerfile, "pnpm install --frozen-lockfile") || !strings.Contains(p.Dockerfile, `"pnpm","start"`) {
		t.Errorf("pnpm:\n%s", p.Dockerfile)
	}
}

func TestNodeRejectsUnsafeMainAndMissingStart(t *testing.T) {
	if _, err := Detect(tree(t, map[string]string{"package.json": `{"main":"../../etc/x; rm -rf /"}`})); err == nil {
		t.Fatal("unsafe main accepted")
	}
	if _, err := Detect(tree(t, map[string]string{"package.json": `{}`})); err == nil {
		t.Fatal("no start accepted")
	}
}

func TestProcfileCommandIsQuoted(t *testing.T) {
	p := mustPlan(t, map[string]string{"package.json": `{}`, "Procfile": "worker: x\nweb: node a.js --flag \"q\"\n"})
	if !strings.Contains(p.Dockerfile, `CMD ["sh","-c","node a.js --flag \"q\""]`) {
		t.Fatalf("%s", p.Dockerfile)
	}
}

func TestPython(t *testing.T) {
	p := mustPlan(t, map[string]string{"requirements.txt": "flask", "app.py": ""})
	if !strings.Contains(p.Dockerfile, "pip install -r requirements.txt") || !strings.Contains(p.Dockerfile, `CMD ["python","app.py"]`) {
		t.Fatalf("%s", p.Dockerfile)
	}
	if _, err := Detect(tree(t, map[string]string{"requirements.txt": "flask"})); err == nil {
		t.Fatal("python with no entrypoint accepted")
	}
}

func TestGo(t *testing.T) {
	p := mustPlan(t, map[string]string{"go.mod": "module x\n\ngo 1.22.3\n", "main.go": "package main\nfunc main(){}\n"})
	if !strings.Contains(p.Dockerfile, "FROM golang:1.22 AS build") || !strings.Contains(p.Dockerfile, "go build -o /out/app .\n") {
		t.Fatalf("%s", p.Dockerfile)
	}
	p = mustPlan(t, map[string]string{"go.mod": "module x\n", "cmd/server/main.go": "package main\n", "lib.go": "package x\n"})
	if !strings.Contains(p.Dockerfile, "./cmd/server") {
		t.Fatalf("%s", p.Dockerfile)
	}
	if _, err := Detect(tree(t, map[string]string{"go.mod": "module x\n", "cmd/a/main.go": "package main\n", "cmd/b/main.go": "package main\n"})); err == nil {
		t.Fatal("ambiguous cmd/ accepted")
	}
}

func TestStaticAndUnknown(t *testing.T) {
	if p := mustPlan(t, map[string]string{"index.html": "<h1>x"}); p.Kind != "static" {
		t.Fatalf("%+v", p)
	}
	if _, err := Detect(tree(t, map[string]string{"README.md": ""})); err != ErrUnknown {
		t.Fatalf("got %v", err)
	}
}
