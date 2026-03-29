#!/bin/bash
set -e

echo "🚀 Starting Aether Worker Services..."

# Start embedding server in background
echo "📡 Starting embedding server on port 8100..."
python3 embedding_server.py &
EMBED_PID=$!

# Wait for embedding server to be ready
sleep 3
echo "✅ Embedding server started (PID: $EMBED_PID)"

# Start Celery worker
echo "⚙️  Starting Celery worker..."
celery -A celery_app worker \
    --loglevel=info \
    --pool=threads \
    --concurrency=4 \
    -n aether-worker@%h

# If celery exits, kill embedding server too
kill $EMBED_PID 2>/dev/null
