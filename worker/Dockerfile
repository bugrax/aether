FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ curl openssh-client ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install sentence-transformers + FastAPI for embedding server
RUN pip install --no-cache-dir \
    sentence-transformers==4.1.0 \
    fastapi==0.115.12 \
    uvicorn[standard]==0.34.2 \
    python-dotenv==1.1.0

# Pre-download the embedding model during build
RUN python3 -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

# Local speech-to-text fallback when Gemini is unavailable (see _transcribe_with_whisper).
# The model is baked in so the first transcription doesn't download ~480MB.
RUN pip install --no-cache-dir faster-whisper==1.2.1 \
    && python3 -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')"


COPY . .

# Start script runs both embedding server + celery worker
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 8100

CMD ["/app/entrypoint.sh"]
