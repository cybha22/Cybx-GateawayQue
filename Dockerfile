FROM golang:1.22-alpine AS backend-builder
WORKDIR /src
COPY Backend/go.mod Backend/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download
COPY Backend/ ./
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/kiro-go .

FROM oven/bun:1.1-alpine AS dashboard-deps
WORKDIR /app
COPY Dashboard/package.json Dashboard/bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.1-alpine AS dashboard-builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_OUTPUT_STANDALONE=true
COPY --from=dashboard-deps /app/node_modules ./node_modules
COPY Dashboard/ ./
RUN bun run build

FROM node:20-alpine AS runner
RUN apk --no-cache add ca-certificates tini su-exec \
    && addgroup -S app \
    && adduser -S -G app app
WORKDIR /app

COPY --from=backend-builder /out/kiro-go /app/backend/kiro-go
COPY Backend/context-filtes /app/backend/context-filtes

COPY --from=dashboard-builder /app/.next/standalone /app/dashboard
COPY --from=dashboard-builder /app/.next/static /app/dashboard/.next/static
COPY --from=dashboard-builder /app/public /app/dashboard/public

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh /app/backend/kiro-go \
    && mkdir -p /app/backend/data \
    && chown -R app:app /app

ENV BACKEND_PORT=8085 \
    DASHBOARD_PORT=8084 \
    NEXT_PUBLIC_API_URL=http://127.0.0.1:8085 \
    CONFIG_PATH=/app/backend/data/config.json \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0

EXPOSE 8084 8085
VOLUME ["/app/backend/data"]

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
