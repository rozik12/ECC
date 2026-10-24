// lp-controlplane is the brain: API, state, and scheduler.
package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"time"

	"launchpad/internal/api"
	"launchpad/internal/store"
)

func main() {
	addr := flag.String("addr", ":8080", "listen address")
	state := flag.String("state", "launchpad-state.json", "state file")
	domain := flag.String("domain", "localhost", "base domain; services get <name>.<domain>")
	flag.Parse()

	cfg := api.Config{
		APIToken:   os.Getenv("LP_API_TOKEN"),
		NodeToken:  os.Getenv("LP_NODE_TOKEN"),
		BaseDomain: *domain,
	}
	if cfg.APIToken == "" || cfg.NodeToken == "" {
		log.Fatal("LP_API_TOKEN and LP_NODE_TOKEN must be set")
	}
	st, err := store.Open(*state)
	if err != nil {
		log.Fatal(err)
	}
	srv := api.New(cfg, st)
	go srv.RunScheduler(make(chan struct{}))
	log.Printf("control plane on %s", *addr)
	log.Fatal((&http.Server{Addr: *addr, Handler: srv.Handler(), ReadHeaderTimeout: 10 * time.Second}).ListenAndServe())
}
