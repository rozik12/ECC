// lp-agent runs on each node and executes what the control plane assigns.
package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"time"

	"launchpad/internal/agent"
)

func main() {
	cp := flag.String("control-plane", "http://localhost:8080", "control plane URL")
	name := flag.String("name", hostname(), "node name")
	addr := flag.String("addr", "", "address the edge uses to reach this node (required)")
	registry := flag.String("registry", "", "image registry (host:port) shared by nodes; built images are pushed here so other nodes can pull them")
	flag.Parse()
	tok := os.Getenv("LP_NODE_TOKEN")
	if tok == "" || *addr == "" {
		log.Fatal("LP_NODE_TOKEN and --addr are required")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	a := &agent.Agent{URL: *cp, Token: tok, Name: *name, Addr: *addr,
		HTTP: &http.Client{Timeout: 10 * time.Second}, Rec: agent.NewReconciler(agent.Docker{Registry: *registry})}
	a.Run(ctx)
}

func hostname() string { h, _ := os.Hostname(); return h }
