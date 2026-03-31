#!/bin/bash
set -e

echo "📦 Installing Node.js dependencies..."
cd "$CI_PRIMARY_REPOSITORY_PATH/frontend"

# Install Node.js if not available
if ! command -v node &> /dev/null; then
    echo "Installing Node.js via brew..."
    brew install node
fi

echo "Node: $(node --version)"
echo "npm: $(npm --version)"

# Install dependencies
npm ci

# Build the frontend with production env vars
echo "🔨 Building frontend..."
DOCKER_BUILD=1 \
VITE_API_BASE_URL=https://app.aether.relayhaus.org/api/v1 \
VITE_FIREBASE_API_KEY=AIzaSyAtsugssSQD9A9GKj6rMQewJdpYpQCS1ro \
VITE_FIREBASE_AUTH_DOMAIN=aether-8717a.firebaseapp.com \
VITE_FIREBASE_PROJECT_ID=aether-8717a \
VITE_FIREBASE_STORAGE_BUCKET=aether-8717a.firebasestorage.app \
VITE_FIREBASE_MESSAGING_SENDER_ID=117818548162 \
VITE_FIREBASE_APP_ID=1:117818548162:web:2dc74ab18d417f30b5005b \
VITE_FIREBASE_MEASUREMENT_ID=G-FV4ZWFYN9C \
npm run build

# Sync Capacitor
echo "🔄 Syncing Capacitor iOS..."
npx cap sync ios

echo "✅ CI post-clone complete"
