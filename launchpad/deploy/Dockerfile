# Builds every Launchpad binary into one small image. Pick the component with
# the container command: lp-controlplane, lp-edge or lp-agent.
FROM golang:1.24 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/ ./cmd/...

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/ /usr/local/bin/
ENV PATH=/usr/local/bin
ENTRYPOINT ["lp-controlplane"]
