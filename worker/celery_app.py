"""
Aether AI Worker — Celery Application Configuration

Start the worker with:
    celery -A celery_app worker --loglevel=info
"""

import os
from celery import Celery
from celery.schedules import crontab
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

KNOWLEDGE_ENABLED = os.getenv("KNOWLEDGE_ENABLED", "true").lower() == "true"

# ── Celery App ─────────────────────────────────────────
app = Celery(
    "aether-worker",
    broker=os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0"),
    backend=os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/1"),
    include=["tasks"],
)

beat_schedule = {
    "backfill-relations": {
        "task": "tasks.backfill_relations",
        "schedule": 90,  # Every 90 seconds
    },
}
if KNOWLEDGE_ENABLED:
    beat_schedule["weekly-synthesis"] = {
        "task": "tasks.generate_weekly_synthesis",
        "schedule": crontab(hour=3, minute=0, day_of_week=0),  # Sunday 3am UTC
    }
    beat_schedule["rebuild-synthesis"] = {
        "task": "tasks.rebuild_synthesis_pages",
        "schedule": crontab(hour=4, minute=0),  # Daily at 4am UTC
    }

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
    beat_schedule=beat_schedule,
)

if __name__ == "__main__":
    app.start()
