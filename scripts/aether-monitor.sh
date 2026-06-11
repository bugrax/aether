#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Aether system monitor → ntfy alerts
#
# Run via cron every ~2 min. Alerts ONLY on state transitions (OK→FAIL) plus a
# periodic re-alert while still failing, and sends a "recovered" note on FAIL→OK.
# Covers: container down, disk full, Redis/Postgres down, worker wedge / queue
# backlog, notes stuck in 'processing', and error-log spikes.
#
# Config (in /root/aether/.env, NOT committed):
#   NTFY_URL=https://ntfy.sh/your-topic         # or self-hosted .../topic
#   NTFY_TOKEN=tk_xxx                            # optional, for protected topics
#
# Install:  crontab -e  →  */2 * * * * /root/aether/scripts/aether-monitor.sh >> /var/log/aether-monitor.log 2>&1
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

APP_DIR=/root/aether
STATE_DIR=/root/.aether-monitor           # outside APP_DIR so deploy rsync --delete won't wipe it
REALERT_EVERY=15                          # re-alert every N failing cycles (~30 min at 2-min cadence)
mkdir -p "$STATE_DIR"
cd "$APP_DIR" || exit 1

NTFY_URL="$(grep -E '^NTFY_URL=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
NTFY_TOKEN="$(grep -E '^NTFY_TOKEN=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"

dc() { docker compose "$@"; }

send() { # title body priority tags
  [ -z "$NTFY_URL" ] && { echo "$(date '+%F %T') NTFY_URL unset, would send: $1 — $2"; return; }
  local auth=()
  [ -n "$NTFY_TOKEN" ] && auth=(-H "Authorization: Bearer $NTFY_TOKEN")
  curl -s --max-time 10 "${auth[@]}" \
    -H "Title: $1" -H "Priority: ${3:-high}" -H "Tags: ${4:-warning}" \
    -d "$2" "$NTFY_URL" >/dev/null 2>&1
}

# notify <key> <FAIL|OK> <title> <body> [priority] [tags]
notify() {
  local key="$1" status="$2" title="$3" body="$4" prio="${5:-high}" tags="${6:-warning}"
  local sf="$STATE_DIR/$key.state" cf="$STATE_DIR/$key.cnt"
  local prev="OK"; [ -f "$sf" ] && prev="$(cat "$sf")"
  if [ "$status" = "FAIL" ]; then
    local cnt=0; [ -f "$cf" ] && cnt="$(cat "$cf")"
    if [ "$prev" = "OK" ] || [ $((cnt % REALERT_EVERY)) -eq 0 ]; then
      send "$title" "$body" "$prio" "$tags"
    fi
    echo "FAIL" > "$sf"; echo $((cnt + 1)) > "$cf"
  else
    [ "$prev" = "FAIL" ] && send "✅ Aether recovered — $key" "$body" default white_check_mark
    echo "OK" > "$sf"; rm -f "$cf"
  fi
}

# ── 1. Containers running ───────────────────────────────────────────────────
EXPECTED="aether-api aether-frontend aether-worker aether-landing aether-postgres aether-redis"
down=""
for c in $EXPECTED; do
  st="$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null || echo missing)"
  [ "$st" != "running" ] && down="$down $c=$st"
done
if [ -n "$down" ]; then
  notify containers FAIL "🔴 Aether container down" "Not running:$down" urgent rotating_light
else
  notify containers OK "" "all containers running"
fi

# ── 2. Disk space (root) ────────────────────────────────────────────────────
use="$(df --output=pcent / 2>/dev/null | tail -1 | tr -dc '0-9')"
if [ "${use:-0}" -ge 88 ]; then
  notify disk FAIL "🟠 Aether disk ${use}%" "Root filesystem at ${use}%. Free space now — a full disk previously broke Redis AOF and wedged the worker." urgent floppy_disk
else
  notify disk OK "" "disk ${use:-?}%"
fi

# ── 3. Redis writable (catches MISCONF / AOF failures) ──────────────────────
if dc exec -T redis redis-cli set __mon__ 1 >/dev/null 2>&1 && dc exec -T redis redis-cli del __mon__ >/dev/null 2>&1; then
  notify redis OK "" "redis writable"
else
  notify redis FAIL "🔴 Aether Redis" "Redis not writable (MISCONF/down). Worker cannot consume tasks → notes stuck in processing." urgent rotating_light
fi

# ── 4. Postgres ready ───────────────────────────────────────────────────────
if dc exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
  notify postgres OK "" "postgres ready"
else
  notify postgres FAIL "🔴 Aether Postgres" "pg_isready failed — database unreachable." urgent rotating_light
fi

# ── 5a. Worker wedge: Celery queue backlog ──────────────────────────────────
qlen="$(dc exec -T redis redis-cli llen celery 2>/dev/null | tr -dc '0-9')"
if [ "${qlen:-0}" -ge 25 ]; then
  notify queue FAIL "🟠 Aether queue backlog" "Celery queue length=${qlen}. Worker may be wedged / not consuming." high hourglass
else
  notify queue OK "" "queue ${qlen:-0}"
fi

# ── 5b. Notes stuck in 'processing' > 20 min ────────────────────────────────
stuck="$(dc exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -c "SELECT count(*) FROM notes WHERE deleted_at IS NULL AND status='"'"'processing'"'"' AND (updated_at IS NULL OR updated_at < NOW() - INTERVAL '"'"'20 minutes'"'"')"' 2>/dev/null | tr -dc '0-9')"
if [ "${stuck:-0}" -ge 3 ]; then
  notify stuck FAIL "🟠 Aether notes stuck" "${stuck} notes stuck in 'processing' >20min. Pipeline likely broken (worker/Apify/LLM)." high warning
else
  notify stuck OK "" "stuck ${stuck:-0}"
fi

# ── 6. Error-log spike (last 3 min) ─────────────────────────────────────────
errs="$(dc logs --since 3m worker api 2>&1 | grep -icE 'ERROR|CRITICAL|Traceback|No space left|MISCONF')"
if [ "${errs:-0}" -ge 15 ]; then
  sample="$(dc logs --since 3m worker api 2>&1 | grep -iE 'ERROR|CRITICAL|No space left|MISCONF' | tail -3 | cut -c1-160)"
  notify errors FAIL "🟠 Aether error spike" "${errs} errors in last 3min:
$sample" high warning
else
  notify errors OK "" "errors ${errs:-0}"
fi

echo "$(date '+%F %T') monitor ok — disk=${use:-?}% queue=${qlen:-?} stuck=${stuck:-?} errs=${errs:-?} down='${down}'"
