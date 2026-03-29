# ── Build Stage ────────────────────────────────
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Install dependencies
RUN apk add --no-cache gcc musl-dev

# Copy module files first (cache layer)
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /aether-api .

# ── Runtime Stage ──────────────────────────────
FROM alpine:3.21

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=builder /aether-api .

# Optional: copy firebase credentials at runtime
# COPY firebase-service-account.json .

EXPOSE 8080

ENV GIN_MODE=release
ENV API_PORT=8080

CMD ["./aether-api"]
