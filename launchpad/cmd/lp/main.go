// lp is the Launchpad command line client.
package main

import (
	"context"
	"os"
	"os/signal"

	"launchpad/internal/cli"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	os.Exit(cli.Main(ctx, os.Args[1:], os.Stdout, os.Stderr))
}
