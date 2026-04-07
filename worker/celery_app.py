"""
Aether AI Worker — Celery Application Configuration

Start the worker with:
    celery -A celery_app worker --loglevel=info
"""

import os
from celery import Celery
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ── Celery App ─────────────────────────────────────────
app = Celery(
    "aether-worker",
    broker=os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0"),
    backend=os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/1"),
    include=["tasks"],
)

# ── Configuration ──────────────────────────────────────
app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,           # Re-queue if worker crashes mid-task
    worker_prefetch_multiplier=1,  # One task at a time for LLM workloads
    result_expires=3600,           # Results expire after 1 hour
    beat_schedule={
        "backfill-relations-every-8h": {
            "task": "tasks.backfill_relations",
            "schedule": 8 * 3600,  # Every 8 hours
        },
    },
)

if __name__ == "__main__":
    app.start()
