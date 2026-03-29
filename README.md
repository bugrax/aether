# Aether

AI-powered note-taking platform. Capture URLs, extract content with AI, organize with labels, and search semantically.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend   │────▶│   Backend   │────▶│   Worker    │
│  React/Vite  │     │   Go/Gin    │     │   Python    │
│   (nginx)    │     │   :8080     │     │   Celery    │
└─────────────┘     └──────┬──────┘     └──────┬──────┘
                           │                    │
                    ┌──────┴──────┐      ┌──────┴──────┐
                    │  PostgreSQL │      │    Redis    │
                    │  (pgvector) │      │   (queue)   │
                    └─────────────┘      └─────────────┘
```

| Service | Tech | Purpose |
|---------|------|---------|
| **Frontend** | React 19, Vite, Tiptap | SPA with rich text editor, dark theme |
| **Backend** | Go, Gin, GORM | REST API, Firebase Auth, SSE |
| **Worker** | Python, Celery | URL extraction, AI summarization |
| **Database** | PostgreSQL + pgvector | Notes, labels, vector embeddings |
| **Queue** | Redis | Celery task broker |
| **Extension** | Chrome MV3 | Quick URL capture from browser |
| **Mobile** | Capacitor (iOS) | Native iOS wrapper |

## Features

- Rich text editor (Tiptap) with slash commands and bubble toolbar
- URL capture with AI content extraction and summarization
- Semantic search via pgvector embeddings
- Label-based organization
- Version history with revision snapshots
- Real-time processing status via SSE
- Firebase Authentication (Google sign-in)
- Dark theme UI with responsive mobile layout
- Chrome extension for quick URL sharing
- i18n support (English, Turkish)

## Project Structure

```
aether/
├── backend/          # Go API server
│   ├── handlers/     # HTTP handlers (notes, labels, search, SSE)
│   ├── middleware/    # Firebase auth middleware
│   ├── models/       # GORM models
│   ├── config/       # Configuration
│   └── database/     # DB connection & migrations
├── frontend/         # React SPA
│   └── src/
│       ├── components/
│       │   ├── editor/       # Tiptap rich text editor
│       │   ├── Sidebar.jsx   # Navigation (desktop + mobile)
│       │   └── LabelManager.jsx
│       ├── pages/            # VaultPage, EditorPage, SharePage, etc.
│       ├── contexts/         # Auth, Language providers
│       ├── i18n/             # Translations (en, tr)
│       └── index.css         # Design system
├── worker/           # Python Celery worker
│   ├── tasks.py      # URL extraction & AI processing
│   └── celery_app.py # Celery configuration
├── extension/        # Chrome extension (MV3)
├── infrastructure/   # Additional compose configs
└── docker-compose.yml
```

## Local Development

### Prerequisites

- Docker & Docker Compose
- Node.js 22+ (for frontend dev)
- Go 1.25+ (for backend dev)
- Firebase project with Authentication enabled

### Setup

```bash
# 1. Clone
git clone git@github.com:bugrax/aether.git
cd aether

# 2. Configure environment
cp .env.example .env
# Edit .env with your Firebase credentials and secrets

# 3. Start all services
docker compose up -d --build

# 4. Access
# Frontend: http://localhost (via nginx)
# API: http://localhost:8080/api/v1
```

### Frontend Dev (hot reload)

```bash
cd frontend
npm install
npm run dev    # Vite dev server on :5173
```

### Backend Dev

```bash
cd backend
go run .       # API server on :8080
```

## Deployment

Deployed to `minis` server (Ubuntu 24.04) via Tailscale, managed with Docker Compose.

### Manual Deploy

```bash
# From local machine
rsync -avz --delete frontend/src/ root@minis:/root/aether/frontend/src/
ssh root@minis "cd /root/aether && docker compose up -d --build frontend"
```

### CI/CD Deploy

Push to `main` branch triggers automatic deployment via GitHub Actions.
See `.github/workflows/deploy.yml`.

Required GitHub Secrets:
| Secret | Description |
|--------|-------------|
| `TAILSCALE_OAUTH_CLIENT_ID` | Tailscale OAuth client ID |
| `TAILSCALE_OAUTH_SECRET` | Tailscale OAuth secret |
| `SSH_PRIVATE_KEY` | SSH key for root@minis |

## Environment Variables

See `.env.example` for all available configuration options.

Key variables:
- `POSTGRES_*` — Database connection
- `REDIS_URL` — Celery broker
- `FIREBASE_*` — Authentication
- `VITE_*` — Frontend Firebase config (build-time)
- `GEMINI_API_KEY` — AI processing
- `ALLOWED_ORIGINS` — CORS origins

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/notes` | List notes (filterable by label_id, q) |
| POST | `/api/v1/notes` | Create note |
| GET | `/api/v1/notes/:id` | Get note |
| PUT | `/api/v1/notes/:id` | Update note |
| DELETE | `/api/v1/notes/:id` | Delete note |
| PUT | `/api/v1/notes/:id/labels` | Update note labels |
| GET | `/api/v1/notes/:id/revisions` | Get version history |
| GET | `/api/v1/notes/:id/stream` | SSE status stream |
| GET | `/api/v1/search?q=` | Semantic search |
| POST | `/api/v1/share` | Capture URL |
| GET | `/api/v1/labels` | List labels |
| POST | `/api/v1/labels` | Create label |
| PUT | `/api/v1/labels/:id` | Update label |
| DELETE | `/api/v1/labels/:id` | Delete label |

All endpoints (except health) require `Authorization: Bearer <firebase-token>` header.
