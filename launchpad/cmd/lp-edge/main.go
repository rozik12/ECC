// lp-edge routes public traffic to services by Host header, optionally
// terminating TLS with automatic Let's Encrypt certificates.
package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"time"

	"golang.org/x/crypto/acme/autocert"

	"launchpad/internal/edge"
)

func main() {
	listen := flag.String("listen", ":80", "HTTP listen address")
	httpsListen := flag.String("https-listen", "", "HTTPS listen address (e.g. :443); enables automatic certificates")
	certDir := flag.String("cert-dir", "launchpad-certs", "where certificates are cached")
	email := flag.String("acme-email", "", "contact email for Let's Encrypt (recommended)")
	cp := flag.String("control-plane", "http://localhost:8080", "control plane URL")
	flag.Parse()
	tok := os.Getenv("LP_NODE_TOKEN")
	if tok == "" {
		log.Fatal("LP_NODE_TOKEN must be set")
	}
	e := &edge.Edge{URL: *cp, Token: tok, HTTP: &http.Client{Timeout: 10 * time.Second}}
	go e.Poll(context.Background())

	if *httpsListen == "" {
		log.Fatal(server(*listen, e).ListenAndServe())
	}
	m := &autocert.Manager{
		Prompt:     autocert.AcceptTOS,
		Cache:      autocert.DirCache(*certDir),
		Email:      *email,
		HostPolicy: e.HostPolicy,
	}
	tlsSrv := server(*httpsListen, e)
	tlsSrv.TLSConfig = m.TLSConfig()
	go func() { log.Fatal(tlsSrv.ListenAndServeTLS("", "")) }()
	// Port 80 answers ACME challenges and redirects everything else to HTTPS.
	log.Fatal(server(*listen, m.HTTPHandler(nil)).ListenAndServe())
}

func server(addr string, h http.Handler) *http.Server {
	return &http.Server{
		Addr: addr, Handler: h,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
}
