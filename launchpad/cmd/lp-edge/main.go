// lp-edge routes public traffic to services by Host header.
package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"time"

	"launchpad/internal/edge"
)

func main() {
	listen := flag.String("listen", ":80", "listen address")
	cp := flag.String("control-plane", "http://localhost:8080", "control plane URL")
	flag.Parse()
	tok := os.Getenv("LP_NODE_TOKEN")
	if tok == "" {
		log.Fatal("LP_NODE_TOKEN must be set")
	}
	e := &edge.Edge{URL: *cp, Token: tok, HTTP: &http.Client{Timeout: 10 * time.Second}}
	go e.Poll(context.Background())
	log.Fatal((&http.Server{Addr: *listen, Handler: e, ReadHeaderTimeout: 10 * time.Second}).ListenAndServe())
}
