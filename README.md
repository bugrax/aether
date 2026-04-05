# Aether — Personal Knowledge Engine

*Where links become knowledge*

Save any URL — YouTube, Instagram, Twitter/X, articles, PDFs — and AI extracts, transcribes, summarizes, and organizes the content into a searchable vault with an AI chatbot assistant.

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
| **Database** | PostgreSQL + pgvector | Notes, labels, embeddings, chat history |
| **AI Chat** | Gemini 2.5 Flash | Vault-aware chatbot with SSE streaming |
| **AI Summary** | Claude CLI + Gemini | Content analysis and summarization |
| **Auth** | Firebase Auth | Google + Apple Sign-In |
| **Analytics** | Firebase Analytics | Web + native event tracking |
| **Push** | Firebase Cloud Messaging | Server-side push notifications |
| **Extension** | Chrome MV3 | Quick URL capture from browser |

## Features

### Core
- **Multi-platform URL capture** — iOS Share Extension, Android Share Intent, Chrome Extension, Web
- **AI Processing Pipeline** — YouTube transcription, Instagram OCR, Twitter/X scraping, PDF extraction, article parsing
- **AI Summaries** — Claude CLI generates structured Markdown with entity extraction, Gemini fallback
- **Community Insights** — YouTube/Instagram/Twitter comments analyzed by AI
- **Semantic Search** — pgvector 384-dim embeddings for intelligent search

### AI Assistant
- **Aether AI Chatbot** — Vault-aware chatbot powered by Gemini 2.5 Flash
- **SSE Streaming** — Real-time token-by-token response streaming
- **Note Linking** — AI references specific notes with clickable links
- **Conversation History** — Persistent chat sessions grouped by date

### Organization
- **Smart Topic Labels** — AI auto-generates 2-4 topic labels per note (i18n aware)
- **AI-Generated Titles** — Clean, descriptive titles from AI analysis
- **Label Filtering** — Filter vault by label, with translated label names

### UI/UX
- **Knowledge Dashboard** — Stats, topic distribution, recent notes
- **Onboarding** — 7-screen flow (Welcome, Language, AI, Assistant, Privacy, Tutorial, Notifications)
- **Splash Screen** — Code-generated halftone dot pattern animation
- **Pull-to-Refresh** — Native-feel gesture with animated indicator
- **Infinite Scroll** — Paginated vault (20 notes per page)
- **Compact List View** — Alternative list layout with thumbnails and labels
- **Glassmorphism Tab Bar** — Blur effect bottom navigation
- **Neon Heartbeat FAB** — Animated AI chatbot button with pulse rings
- **Notification Center** — Full-page notification list with history
- **Dark Obsidian Theme** — Premium dark UI with purple accents

### Platform
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
| iOS | Capacitor + native Share Extension | App Store |
| Android | Capacitor + Share Intent | APK / Play Store |
| Web | React SPA | app.aether.relayhaus.org |
| Chrome | MV3 Extension | Chrome Web Store |
| Landing | Static HTML | aether.relayhaus.org |

## Project Structure

```
aether/
├── backend/          # Go API server
│   ├── handlers/     # notes, users, chat, search, labels
│   ├── middleware/    # Firebase auth
│   ├── models/       # User, Note, ChatMessage, Label
│   ├── config/       # Environment config
│   └── database/     # DB connection & migrations
├── frontend/         # React SPA + Capacitor
│   ├── src/
│   │   ├── components/   # Sidebar, AetherChat, SplashScreen, LabelManager
│   │   ├── pages/        # Dashboard, Vault, Editor, Onboarding, Settings, Login
│   │   ├── contexts/     # Auth, Language providers
│   │   ├── i18n/         # en.js, tr.js translations
│   │   ├── analytics.js  # Firebase Analytics
│   │   └── api.js        # API client with SSE streaming
│   ├── ios/App/          # Xcode project + AetherShare extension
│   └── android/          # Android Studio project
├── worker/           # Python Celery worker
│   ├── tasks.py      # URL extraction, AI processing, FCM push
│   └── celery_app.py # Celery configuration
├── extension/        # Chrome extension (MV3)
├── landing/          # Static landing page
└── docker-compose.yml
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/notes?limit=20&offset=0` | List notes (paginated) |
| POST | `/api/v1/notes` | Create note |
| GET | `/api/v1/notes/:id` | Get note |
| PUT | `/api/v1/notes/:id` | Update note |
| DELETE | `/api/v1/notes/:id` | Delete note |
| PUT | `/api/v1/notes/:id/labels` | Update note labels |
| GET | `/api/v1/notes/:id/revisions` | Version history |
| POST | `/api/v1/notes/:id/share` | Toggle public share |
| GET | `/api/v1/notes/:id/stream` | SSE status stream |
| POST | `/api/v1/share` | Capture URL |
| GET | `/api/v1/search?q=` | Semantic search |
| POST | `/api/v1/chat` | AI chat (SSE streaming) |
| POST | `/api/v1/chat/:id/feedback` | Chat feedback |
| GET | `/api/v1/chat/sessions` | Chat history |
| GET | `/api/v1/chat/sessions/:id` | Session messages |
| GET | `/api/v1/labels` | List labels |
| POST | `/api/v1/labels` | Create label |
| PUT | `/api/v1/labels/:id` | Update label |
| DELETE | `/api/v1/labels/:id` | Delete label |
| GET | `/api/v1/user/settings` | Get settings |
| PATCH | `/api/v1/user/settings` | Update settings |
| DELETE | `/api/v1/user/account` | Delete account |
| POST | `/api/v1/user/fcm-token` | Register push token |
| GET | `/api/v1/shared/:token` | Public shared note |

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
# Manual deploy
rsync -avz backend/ root@minis:/root/aether/backend/
ssh root@minis "cd /root/aether && docker compose build api && docker compose up -d api"
```

## License

Private project.
