"""
Aether Embedding Sidecar — FastAPI server for vector embeddings.

Runs on port 8100. Used by:
- Worker: to generate note embeddings after processing
- Go API: to generate query embeddings for semantic search

Model: all-MiniLM-L6-v2 (384 dimensions, ~80MB, runs locally)
"""

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

# ── Model Loading ─────────────────────────────────────
MODEL_NAME = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
model = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    logger.info(f"Loading embedding model: {MODEL_NAME}")
    model = SentenceTransformer(MODEL_NAME)
    logger.info(f"✅ Model loaded ({model.get_sentence_embedding_dimension()} dims)")
    yield
    logger.info("Shutting down embedding server")


app = FastAPI(title="Aether Embeddings", lifespan=lifespan)


# ── Request/Response Models ───────────────────────────

class EmbedRequest(BaseModel):
    text: str


class EmbedBatchRequest(BaseModel):
    texts: list[str]


class EmbedResponse(BaseModel):
    embedding: list[float]
    dimensions: int


class EmbedBatchResponse(BaseModel):
    embeddings: list[list[float]]
    dimensions: int


# ── Endpoints ─────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_NAME, "dimensions": 384}


@app.post("/embed", response_model=EmbedResponse)
def embed_text(req: EmbedRequest):
    """Generate embedding for a single text."""
    vec = model.encode(req.text, normalize_embeddings=True).tolist()
    return EmbedResponse(embedding=vec, dimensions=len(vec))


@app.post("/embed/batch", response_model=EmbedBatchResponse)
def embed_batch(req: EmbedBatchRequest):
    """Generate embeddings for multiple texts."""
    vecs = model.encode(req.texts, normalize_embeddings=True).tolist()
    return EmbedBatchResponse(embeddings=vecs, dimensions=len(vecs[0]) if vecs else 0)


# ── Run ───────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("EMBEDDING_PORT", "8100"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
