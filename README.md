# Aether — Personal Knowledge Engine

*Where links become knowledge*

Save any URL — YouTube, Instagram, Twitter/X, articles, PDFs — and AI extracts, transcribes, summarizes, and organizes the content into a searchable, multi-vault knowledge base with an AI chatbot assistant, knowledge graph, and entity extraction.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend   │────▶│   Backend   │────▶│   Worker    │
│ React/Capacitor│   │   Go/Gin    │     │  Python/    │
│ iOS/Android/Web│   │   :8080     │     │  Celery     │
└─────────────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                    │
  ┌────┴────────┐   ┌──────┴──────┐      ┌──────┴──────┐
  │ iOS App     │   │  PostgreSQL │      │    Redis    │
  │ Android App │   │  (pgvector) │      │   (queue)   │
  │ Chrome Ext  │   └─────────────┘      └─────────────┘
  └─────────────┘
```

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Frontend** | React 19, Vite, Capacitor | SPA + native iOS/Android apps |
| **Backend** | Go, Gin, GORM | REST API, SSE streaming, Firebase Auth |
| **Worker** | Python, Celery, Redis | AI processing pipeline |
| **Database** | PostgreSQL + pgvector | Notes, labels, embeddings, entities, relations |
| **AI Chat** | Gemini 2.5 Flash | Vault-aware chatbot with SSE streaming |
| **AI Summary** | Claude CLI + Gemini | Content analysis, summarization, entity extraction |
| **Auth** | Firebase Auth | Google + Apple Sign-In |
| **Analytics** | Firebase Analytics | Web + native event tracking |
| **Push** | Firebase Cloud Messaging | Server-side push notifications |
| **Extension** | Chrome MV3 | Quick URL capture from browser |

## Features

### Core
- **Multi-Vault** — Organize notes into separate vaults; all content (notes, labels, entities, relations) is vault-scoped via the `X-Vault-Id` header
- **Multi-platform URL capture** — iOS Share Extension, Android Share Intent, Chrome Extension, Web
- **AI Processing Pipeline** — YouTube transcription, Instagram OCR, Twitter/X scraping, PDF extraction, article parsing
- **AI Summaries** — Claude CLI generates structured Markdown with entity extraction, Gemini fallback
- **Community Insights** — YouTube/Instagram/Twitter comments analyzed by AI
- **Semantic Search** — pgvector 384-dim embeddings for intelligent search

### Knowledge Engine (LLM Wiki)
- **Entity Extraction** — AI extracts people, concepts, tools, books, films, locations, etc. from every note
- **Entity Graph** — Entities become hub nodes connecting notes that mention the same person/concept/tool
- **Entity Browser** — Browse all entities by type, search, click through to related notes
- **Cross-Reference & Note Linking** — pgvector similarity finds related notes, creates bidirectional links
- **Knowledge Graph** — Interactive force-directed visualization with dual mode (Similarity / Entities)
- **Activity Log** — Tracks note processing, relation discovery, entity extraction
- **AI Rules** — Custom user instructions for how AI processes content

### AI Assistant
- **Aether AI Chatbot** — Vault-aware chatbot powered by Gemini 2.5 Flash
- **SSE Streaming** — Real-time token-by-token response streaming
- **Note Linking** — AI references specific notes with clickable links
- **Conversation History** — Persistent chat sessions grouped by date
- **Save to Vault** — Save chat insights as new notes

### Organization
- **Smart Topic Labels** — AI auto-generates 2-4 topic labels per note (i18n aware)
- **AI-Generated Titles** — Clean, descriptive titles from AI analysis
- **Source Labels** — Auto-labels by domain (YouTube, Instagram, Twitter/X, etc.)
- **Label Filtering** — Filter vault by label, with translated label names

### UI/UX
- **Knowledge Dashboard** — Stats, topic distribution, entities, recent notes, activity log
- **Onboarding** — 7-screen flow (Welcome, Language, AI, Assistant, Privacy, Tutorial, Notifications)
- **Splash Screen** — Code-generated halftone dot pattern animation
- **Infinite Scroll** — Paginated vault (20 notes per page)
- **Compact List View** — Alternative list layout with thumbnails and labels
- **Glassmorphism Tab Bar** — Blur effect bottom navigation
- **Neon Heartbeat FAB** — Animated AI chatbot button with pulse rings
- **Notification Center** — Full-page notification list with history
- **Dark Obsidian Theme** — Premium dark UI with purple accents

### Platform
- **Admin Panel** — Owner-only (`ADMIN_EMAIL`) dashboard at `/admin`: all users, what they've saved, global stats & recent feed (read-only)
- **System Monitoring** — `scripts/aether-monitor.sh` (cron) → ntfy alerts on container down, disk full, Redis/Postgres down, worker wedge, stuck notes, error spikes
- **Sign in with Apple + Google** — Both providers on iOS/web
- **Account Deletion** — Full GDPR-compliant data removal
- **Push Notifications** — FCM server-side push when processing completes
- **Bilingual** — Full English/Turkish support (UI + AI + labels)
- **Firebase Analytics** — 14 custom events, screen tracking, platform detection

## Design System

- **Theme:** Dark Obsidian (#0e0e0e) with purple accent (#b79fff)
- **Logo:** Halftone dot pattern — circular grid with radial size gradient
- **Fonts:** Space Grotesk (headlines/labels), Manrope (body)
- **Design Tool:** Google Stitch (MCP integrated)

## Platforms

| Platform | Technology | Distribution |
|----------|-----------|-------------|
| macOS | Tauri 2.0 (8.7MB .dmg) | GitHub Releases |
| Windows | Tauri 2.0 (MSI + EXE) | GitHub Releases |
| Linux | Tauri 2.0 (deb + AppImage) | GitHub Releases |
| iOS | Capacitor + native Share Extension | [TestFlight](https://testflight.apple.com/join/MtrvyubQ) |
| Android | Capacitor + Share Intent | APK / GitHub Releases |
| Web | React SPA | [app.aether.relayhaus.org](https://app.aether.relayhaus.org) |
| Chrome | MV3 Extension | Chrome Web Store |

## Project Structure

```
aether/
├── backend/          # Go API server
│   ├── handlers/     # notes, users, vaults, chat, search, labels, graph, entities, activity, sse, desktop_auth
│   ├── middleware/    # Firebase auth + VaultResolver (X-Vault-Id)
│   ├── models/       # User, Vault, Note, NoteRevision, Label, Entity, NoteEntity, NoteRelation, ChatMessage, ActivityLog
│   ├── config/       # Environment config
│   └── database/     # DB connection & migrations
├── frontend/         # React SPA + Capacitor
│   ├── src/
│   │   ├── components/   # Sidebar, AetherChat, SplashScreen, LabelManager, VaultManager, VaultSwitcher, MobileVaultSheet, editor/ (TipTap)
│   │   ├── pages/        # Dashboard, Vault, Editor, Graph, Entities, EntityDetail, Chat, Activity, DesktopAuth, Onboarding, Settings, Login
│   │   ├── contexts/     # Auth, Language, Vault providers
│   │   ├── i18n/         # en.js, tr.js translations
│   │   ├── analytics.js  # Firebase Analytics
│   │   └── api.js        # API client with SSE streaming
│   ├── src-tauri/        # Tauri 2.0 desktop app (macOS/Windows/Linux)
│   │   ├── src/          # Rust backend (menus, plugins, setup)
│   │   ├── capabilities/ # Tauri permissions
│   │   ├── icons/        # Desktop app icons
│   │   └── tauri.conf.json
│   ├── ios/App/          # Xcode project + AetherShare extension
│   └── android/          # Android Studio project
├── worker/           # Python Celery worker
│   ├── tasks.py      # URL extraction, AI processing, entity extraction, FCM push
│   └── celery_app.py # Celery configuration + Beat schedule
├── extension/        # Chrome extension (MV3)
├── landing/          # Static landing page
└── docker-compose.yml
```

## AI Processing Pipeline

```
POST /api/v1/share → Create note (status: processing) → Redis → Celery worker
  1. extract_content_from_url()     — YouTube/Instagram/Twitter/article extraction
  2. call_llm()                     — Claude CLI (primary) or Gemini (fallback)
  3. extract_comments()             — YouTube/Instagram/Twitter comments
  4. generate_community_insights()  — AI analysis of community discussion
  5. generate_title()               — Clean AI-generated title
  6. update note status → ready
  7. generate_embedding()           — sentence-transformers → pgvector
  8. auto_label_source()            — Label by source domain
  9. auto_label_topics()            — AI extracts 2-4 topic labels
 10. find_related_notes()           — pgvector similarity → note_relations (powers Graph)
 11. extract_entities()             — AI extracts people, concepts, tools, etc. (powers Entities)
 12. send_push_notification()       — FCM push to user
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/notes` | List notes (paginated) |
| POST | `/api/v1/notes` | Create note |
| GET | `/api/v1/notes/:id` | Get note |
| PUT | `/api/v1/notes/:id` | Update note |
| DELETE | `/api/v1/notes/:id` | Delete note |
| PUT | `/api/v1/notes/:id/labels` | Update note labels |
| GET | `/api/v1/notes/:id/revisions` | Version history |
| GET | `/api/v1/notes/:id/related` | Related notes (cross-references) |
| POST | `/api/v1/notes/:id/share` | Toggle public share |
| GET | `/api/v1/notes/:id/stream` | SSE status stream |
| POST | `/api/v1/share` | Capture URL (triggers AI pipeline) |
| GET | `/api/v1/notes/stats` | Vault stats (totals, this week) |
| POST | `/api/v1/notes/:id/move` | Move note to another vault |
| GET | `/api/v1/vaults` | List vaults |
| POST | `/api/v1/vaults` | Create vault |
| PUT | `/api/v1/vaults/:id` | Update vault |
| DELETE | `/api/v1/vaults/:id` | Delete vault (cascade) |
| POST | `/api/v1/vaults/:id/default` | Set default vault |
| GET | `/api/v1/search?q=` | Semantic search (pgvector) |
| GET | `/api/v1/graph` | Knowledge graph (similarity-based) |
| GET | `/api/v1/graph/entities` | Knowledge graph (entity-based) |
| GET | `/api/v1/entities` | List entities (type/search filter) |
| GET | `/api/v1/entities/:id` | Entity detail with linked notes |
| GET | `/api/v1/activity` | Activity log |
| GET | `/api/v1/admin/stats` | Admin: global counts (owner-only) |
| GET | `/api/v1/admin/users` | Admin: all users + note counts |
| GET | `/api/v1/admin/users/:id/notes` | Admin: a user's notes |
| GET | `/api/v1/admin/feed` | Admin: recent notes across all users |
| GET | `/api/v1/admin/notes/:id` | Admin: any note's full content |
| POST | `/api/v1/chat` | AI chat (SSE streaming) |
| POST | `/api/v1/chat/:id/feedback` | Chat feedback |
| GET | `/api/v1/chat/sessions` | Chat history |
| GET | `/api/v1/chat/sessions/:id` | Session messages |
| GET | `/api/v1/labels` | List labels |
| POST | `/api/v1/labels` | Create label |
| PUT | `/api/v1/labels/:id` | Update label |
| DELETE | `/api/v1/labels/:id` | Delete label |
| GET | `/api/v1/user/settings` | Get settings |
| PATCH | `/api/v1/user/settings` | Update settings (language, AI rules) |
| DELETE | `/api/v1/user/account` | Delete account |
| POST | `/api/v1/user/fcm-token` | Register push token |
| POST | `/api/v1/auth/desktop/session` | Create desktop auth session |
| GET | `/api/v1/auth/desktop/poll` | Poll for desktop auth token |
| POST | `/api/v1/auth/desktop/complete` | Complete desktop auth (protected) |
| GET | `/api/v1/shared/:token` | Public shared note |

## Database Models

| Model | Table | Purpose |
|-------|-------|---------|
| User | users | Firebase auth, settings, AI rules |
| Vault | vaults | Multi-vault containers (vault_id scopes all content) |
| Note | notes | Content, AI insight, embedding, status |
| NoteRevision | note_revisions | Version history snapshots |
| Label | labels | Topic/source labels with colors |
| Entity | entities | Extracted entities (person, concept, tool, etc.) |
| NoteEntity | note_entities | Note-entity junction with context |
| NoteRelation | note_relations | Bidirectional note links with similarity score |
| ChatMessage | chat_messages | AI chat history |
| ActivityLog | activity_logs | Processing / relation / entity events |

## Environment Variables

| Variable | Service | Purpose |
|----------|---------|---------|
| `POSTGRES_*` | API, Worker | Database connection |
| `REDIS_URL` | API, Worker | Celery broker |
| `FIREBASE_PROJECT_ID` | API, Worker | Firebase project |
| `GEMINI_API_KEY` | API, Worker | Gemini AI (chat + processing) |
| `APIFY_TOKEN` | Worker | Instagram/Twitter scraping |
| `ALLOWED_ORIGINS` | API | CORS origins |
| `VITE_FIREBASE_*` | Frontend | Firebase config (build-time) |
| `VITE_FIREBASE_MEASUREMENT_ID` | Frontend | Analytics |

## Deployment

**Server:** Self-hosted Linux (Docker Compose) via Tailscale  
**Proxy:** Nginx Proxy Manager  
**CI/CD:** GitHub Actions → rsync → docker compose build/restart

```bash
# Server deploy
rsync -avz backend/ root@minis:/root/aether/backend/
rsync -avz worker/ root@minis:/root/aether/worker/
rsync -avz frontend/ root@minis:/root/aether/frontend/
ssh root@minis "cd /root/aether && docker compose build api worker frontend && docker compose up -d api worker frontend"

# Desktop release (triggers GitHub Actions)
git tag v1.x.x && git push origin v1.x.x
# → Builds macOS (ARM + Intel), Linux (deb + AppImage), Windows (MSI + EXE)
# → Creates GitHub Release with all artifacts

# Local desktop build
cd frontend && npm run build && npm run build:desktop
# → Output: src-tauri/target/release/bundle/dmg/Aether_*.dmg
```

## License

Private project.
