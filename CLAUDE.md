# Aether — Project Context for Claude

## What is Aether?
A personal knowledge engine. Users save URLs (YouTube, Instagram, articles, etc.) and AI extracts, transcribes, summarizes, and organizes the content into a searchable vault.

## Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Frontend    │────▶│  Backend API │────▶│  Worker      │
│  (React/    │     │  (Go/Gin)    │     │  (Python/    │
│   Capacitor) │     │              │     │   Celery)    │
└─────────────┘     └──────────────┘     └──────────────┘
       │                   │                    │
       │              ┌────┴────┐          ┌────┴────┐
       │              │Postgres │          │ Redis   │
       │              │pgvector │          │ (Queue) │
       │              └─────────┘          └─────────┘
       │
  ┌────┴────────────────┐
  │ iOS App (Capacitor)  │
  │ + AetherShare Ext    │
  │ Chrome Extension     │
  └──────────────────────┘
```

## Directory Structure

```
aether/
├── backend/          # Go API server (Gin framework)
│   ├── handlers/     # Route handlers (notes.go, users.go)
│   ├── middleware/    # Auth middleware (Firebase token validation)
│   ├── models/       # GORM models (note.go, user.go)
│   ├── database/     # DB connection
│   └── main.go       # Routes, CORS, server setup
├── frontend/         # React SPA + Capacitor iOS
│   ├── src/
│   │   ├── pages/    # VaultPage, EditorPage, SharePage, SettingsPage, LoginPage, SharedNotePage
│   │   ├── contexts/ # AuthContext (Firebase auth), LanguageContext (i18n)
│   │   ├── components/ # Sidebar, LabelManager, RichTextEditor
│   │   ├── i18n/     # en.js, tr.js translation files
│   │   ├── api.js    # API client with auth token
│   │   └── firebase.js # Firebase auth (popup for web, native plugin for iOS)
│   ├── ios/App/      # Xcode project
│   │   ├── App/      # Main app (AppDelegate.swift, Info.plist, Assets, entitlements)
│   │   ├── AetherShare/ # Share Extension (ShareViewController.swift)
│   │   └── CapApp-SPM/  # Swift Package Manager (Capacitor + plugins)
│   ├── capacitor.config.ts
│   └── vite.config.js
├── worker/           # Python Celery worker
│   └── tasks.py      # URL processing, AI summarization, embedding
├── extension/        # Chrome browser extension
├── landing/          # Static landing page (aether.relayhaus.org)
└── docker-compose.yml
```

## Domains & URLs

| Domain | Purpose |
|--------|---------|
| `aether.relayhaus.org` | Landing page (static nginx) |
| `app.aether.relayhaus.org` | Main web app + API |
| `app.aether.relayhaus.org/api/v1/*` | Backend API |
| `app.aether.relayhaus.org/s/:token` | Public shared note (OG tags → redirect to SPA) |
| `app.aether.relayhaus.org/shared/:token` | Public shared note (SPA render) |

**CRITICAL**: All API calls, CORS, Firebase auth domains, and frontend builds MUST use `app.aether.relayhaus.org`, NOT `aether.relayhaus.org`.

## Server & Deployment

- **Server**: `root@minis` (Tailscale IP: `159.146.67.222`)
- **Deploy**: GitHub Actions → rsync to minis → docker compose build/restart
- **Containers**: aether-api, aether-frontend, aether-worker, aether-landing, aether-postgres, aether-redis
- **NPM** (Nginx Proxy Manager): routes domains to containers
- **NPM config files**: `/root/npm/npm-data/nginx/proxy_host/9.conf` (landing), `10.conf` (app)

### After deploying code changes:
- **Frontend changes**: Must `docker compose build frontend && docker compose up -d frontend` on server
- **Backend changes**: Auto-rebuilt by deploy workflow
- **Worker changes**: Auto-rebuilt by deploy workflow
- **Landing changes**: Must `docker compose build landing && docker compose up -d landing` on server
- **Container IPs change on restart**: NPM configs use container names (aether-frontend, aether-api), not IPs

## iOS App — Critical Details

### Bundle IDs
- Main app: `com.bugra.aether`
- Share Extension: `com.bugra.aether.share`
- Team ID: `QCW5GHWW32`

### Auth Token Sharing (App ↔ Share Extension)
**USE App Groups UserDefaults, NOT Keychain.**
- App Group: `group.com.bugra.aether`
- AppDelegate saves token: `UserDefaults(suiteName: "group.com.bugra.aether").set(token, forKey: "authToken")`
- ShareViewController reads: `UserDefaults(suiteName: "group.com.bugra.aether").string(forKey: "authToken")`
- Entitlements: Both targets have `com.apple.security.application-groups` with `group.com.bugra.aether`
- **DO NOT use kSecAttrAccessGroup / Keychain sharing** — it requires Keychain Sharing entitlement which causes Xcode Cloud signing failures

### Firebase Auth on iOS
- `@capacitor-firebase/authentication` handles native Google Sign-In
- `skipNativeAuth: false` in capacitor.config.ts — native Firebase Auth signs in automatically
- **DO NOT call `signInWithCredential`** from JS SDK — it hangs in Capacitor WebView (`capacitor://` scheme blocks network requests)
- Instead: get token from native plugin via `FirebaseAuthentication.getIdToken()`
- Token refresh: AuthContext refreshes every 45min + on foreground via `visibilitychange`
- AppDelegate also writes token to App Group on auth state change

### Building for iOS
```bash
cd frontend
VITE_API_BASE_URL=https://app.aether.relayhaus.org/api/v1 \
VITE_FIREBASE_API_KEY=... \
[all VITE_ env vars] \
npm run build && npx cap sync ios
```
- **DO NOT set `DOCKER_BUILD=1`** for iOS builds — it externalizes `@capacitor-firebase/authentication`
- `DOCKER_BUILD=1` is ONLY for Docker/web builds (set in frontend/Dockerfile)

### External links on iOS
- `target="_blank"` does NOT work in Capacitor WebView
- Use `window.open(url, '_system')` to open in Safari
- Use `@capacitor/share` plugin for native share sheet

### Share Extension (AetherShare)
- Type: `com.apple.ui-services` (Action Extension — appears in share sheet action row)
- Activation Rule: `TRUEPREDICATE` (accepts all content types)
- Extracts URLs from: `UTType.url`, `UTType.plainText`, `attributedContentText`, `Data→String`
- Sends to: `POST https://app.aether.relayhaus.org/api/v1/share`
- Token source: App Group UserDefaults

## Worker — AI Pipeline

### URL Processing Flow
```
POST /api/v1/share → Create note (status: processing) → Redis queue → Celery worker
  1. extract_content_from_url()
     - YouTube: yt-dlp (subtitles + Gemini audio transcription)
     - Instagram: Apify scraper (carousel images) + Gemini vision OCR
     - Articles: BeautifulSoup scraping
  2. call_llm() → Claude CLI (primary) or Gemini (fallback)
  3. Embedding → sentence-transformers (384 dims, pgvector)
  4. Auto-label by source domain
```

### Instagram Processing
- Uses **Apify Instagram Scraper** (`APIFY_TOKEN` env var)
- Apify returns `201` (not 200) — check `status_code in (200, 201)`
- Carousel posts: `images[]` array has all slide URLs
- Reels/Video: `images[]` is empty, use `displayUrl` for thumbnail
- Downloaded images → Gemini 2.5 Flash vision for OCR
- Thumbnail → base64 data URI (Instagram CDN URLs expire in hours)

### YouTube Processing
- yt-dlp downloads subtitles (en, tr) first
- If no subtitles: downloads audio → Gemini 2.5 Flash transcription
- `GEMINI_API_KEY` must be set in worker container

### Domain Label Parsing
- `urlparse().netloc.replace("www.", "")` — strip only PREFIX subdomains
- **DO NOT use `.replace("m.", "")`** — it strips 'm' from 'instagram.com' → 'instagracom'
- Use startswith check: `if domain.startswith("m."): domain = domain[2:]`

## Environment Variables

### Server `.env` (root@minis:/root/aether/.env)
These override docker-compose.yml defaults. When adding new env vars:
1. Add to `docker-compose.yml` with `${VAR:-default}`
2. Add to server `.env`
3. Recreate container: `docker compose up -d <service>`

### Key env vars:
- `ALLOWED_ORIGINS`: Must include `https://app.aether.relayhaus.org`
- `VITE_API_BASE_URL`: Must be `https://app.aether.relayhaus.org/api/v1`
- `GEMINI_API_KEY`: For YouTube transcription + Instagram vision
- `APIFY_TOKEN`: For Instagram carousel scraping

## Frontend Build — Web vs iOS

| | Web (Docker) | iOS (local) |
|--|--|--|
| `DOCKER_BUILD` | `1` (set in Dockerfile) | not set |
| `@capacitor-firebase/authentication` | externalized (not bundled) | bundled (from node_modules) |
| `@capacitor/share` | externalized | bundled |
| API URL | from server `.env` | from shell env vars |
| Build command | `docker compose build frontend` | `npm run build && npx cap sync ios` |

## Database

- PostgreSQL 16 with pgvector extension
- `thumbnail_url` column: `text` type (not varchar) — stores base64 data URIs
- `share_token` column: partial unique index `WHERE share_token != ''`
- `ai_language` column: separate from `language` (UI language)

## Common Pitfalls — DO NOT REPEAT

1. **Never use `.replace("m.", "")` on domains** — breaks instagram.com
2. **Never use `kSecAttrAccessGroup` without Keychain Sharing entitlement** — causes Xcode Cloud exit code 70
3. **Never use `signInWithCredential` on iOS Capacitor** — hangs forever due to capacitor:// scheme
4. **Never use `target="_blank"` in Capacitor** — doesn't work, use `window.open(url, '_system')`
5. **Always check Apify returns 201, not just 200**
6. **Always rebuild frontend container after frontend code changes** — deploy workflow only syncs files
7. **Instagram CDN URLs expire** — always convert to base64 data URI for thumbnails
8. **`navigator.share`/`navigator.clipboard` don't work in Capacitor** — use `@capacitor/share` plugin
9. **Firebase `getRedirectResult()` hangs in Capacitor** — don't await it before `onAuthStateChanged`
10. **Token refresh is critical** — Firebase tokens expire in 1 hour, must auto-refresh
