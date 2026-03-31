"""
Aether AI Worker — Task Definitions

These tasks are enqueued by the Go API server via Redis
and executed by the Celery worker.
"""

import os
import ssl
import subprocess
import logging
from datetime import datetime, timezone

import certifi
import requests
from bs4 import BeautifulSoup
from sqlalchemy import create_engine, text

# Fix SSL for macOS
os.environ.setdefault('SSL_CERT_FILE', certifi.where())
os.environ.setdefault('REQUESTS_CA_BUNDLE', certifi.where())
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv not required if env vars are set

from celery_app import app

logger = logging.getLogger(__name__)

# ── Database Connection ────────────────────────────────
DATABASE_URL = (
    f"postgresql://{os.getenv('POSTGRES_USER', 'aether')}"
    f":{os.getenv('POSTGRES_PASSWORD', 'aether_secret')}"
    f"@{os.getenv('POSTGRES_HOST', 'localhost')}"
    f":{os.getenv('POSTGRES_PORT', '5432')}"
    f"/{os.getenv('POSTGRES_DB', 'aether')}"
)
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

# ── LLM Configuration ─────────────────────────────────
LLM_API_URL = os.getenv("LLM_API_URL", "http://localhost:11434/api/generate")
LLM_MODEL = os.getenv("LLM_MODEL", "kimi-2.5")


def update_note_status(note_id: str, status: str, **kwargs):
    """Update a note's status and optional fields in PostgreSQL."""
    set_clauses = ["status = :status", "updated_at = :now"]
    params = {"note_id": note_id, "status": status, "now": datetime.now(timezone.utc)}

    for key, value in kwargs.items():
        set_clauses.append(f"{key} = :{key}")
        params[key] = value

    query = text(f"UPDATE notes SET {', '.join(set_clauses)} WHERE id = :note_id")
    with engine.begin() as conn:
        conn.execute(query, params)


def extract_content_from_url(url: str) -> dict:
    """Extract title and text content from a URL."""
    try:
        # Try yt-dlp for YouTube/video URLs
        if any(domain in url for domain in ["youtube.com", "youtu.be", "vimeo.com"]):
            return _extract_video(url)

        # Instagram: use yt-dlp for reels/videos, og tags for posts
        if "instagram.com" in url:
            return _extract_instagram(url)

        # Fall back to web scraping for articles
        return _extract_article(url)
    except Exception as e:
        logger.error(f"Content extraction failed for {url}: {e}")
        raise


def _extract_video(url: str) -> dict:
    """Extract video metadata and subtitles using yt-dlp."""
    import yt_dlp

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "writesubtitles": True,
        "writeautomaticsub": True,
        "subtitleslangs": ["en", "tr"],
        "skip_download": True,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)

    title = info.get("title", "Untitled Video")
    description = info.get("description", "")
    thumbnail = info.get("thumbnail", "")

    # We always prioritize transcribing raw audio via Gemini for high-quality verbatim text
    content = f"# {title}\n\n{description}"
    gemini_transcript = _transcribe_audio_with_gemini(url)
    if gemini_transcript:
        content += f"\n\n## Full Audio Transcript (Gemini)\n\n{gemini_transcript}"
    else:
        logger.warning("Gemini transcript failed, returning only title and description.")

    return {"title": title, "content": content, "thumbnail": thumbnail}


def _transcribe_audio_with_gemini(url: str) -> str:
    """Download audio via yt-dlp and transcribe using Gemini 1.5 Flash."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.warning("No GEMINI_API_KEY set, skipping audio transcription fallback.")
        return ""
        
    import yt_dlp
    import google.generativeai as genai
    import uuid
    import time
    
    genai.configure(api_key=api_key)
    
    tmp_path = f"/tmp/aether_{uuid.uuid4().hex}.m4a"
    dl_opts = {
        "format": "bestaudio[ext=m4a]/bestaudio",
        "outtmpl": tmp_path,
        "quiet": True,
        "no_warnings": True,
    }
    
    logger.info(f"🎧 Downloading audio fallback for {url}")
    try:
        with yt_dlp.YoutubeDL(dl_opts) as ydl:
            ydl.download([url])
            
        if not os.path.exists(tmp_path):
            raise FileNotFoundError("Audio file was not created by yt-dlp.")
            
        logger.info(f"📤 Uploading audio to Gemini: {tmp_path}")
        audio_file = genai.upload_file(path=tmp_path, mime_type="audio/mp4")
        
        while audio_file.state.name == "PROCESSING":
            time.sleep(2)
            audio_file = genai.get_file(audio_file.name)
            
        if audio_file.state.name == "FAILED":
            raise ValueError("Gemini failed to process the audio file.")
            
        logger.info("🤖 Requesting Gemini 2.5 Flash transcription...")
        model = genai.GenerativeModel("gemini-2.5-flash")
        
        # Relax safety filters for transcription — we're just converting speech to text
        safety_settings = [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_ONLY_HIGH"},
        ]
        
        response = model.generate_content([
            audio_file,
            "You are a verbatim transcription assistant. Please listen to this audio file and transcribe EVERYTHING spoken in it accurately in its native language. Do not summarize. Just provide the raw transcript."
        ], safety_settings=safety_settings)
        
        genai.delete_file(audio_file.name)
        
        # Handle blocked/empty responses from safety filters
        if not response.candidates:
            block_reason = getattr(response.prompt_feedback, 'block_reason', 'UNKNOWN')
            logger.warning(f"⚠️ Gemini transcription blocked by safety filter: {block_reason}")
            return ""
        
        return response.text
        
    except Exception as e:
        logger.warning(f"⚠️ Gemini transcription fallback failed: {e}")
        return ""
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def _extract_instagram(url: str) -> dict:
    """Extract Instagram post/reel content using Apify scraper + Gemini vision."""
    import uuid as _uuid
    import shutil

    APIFY_TOKEN = os.getenv("APIFY_TOKEN", "")
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    }

    title = "Instagram Post"
    content = ""
    thumbnail = ""
    image_urls = []

    # Step 1: Apify Instagram Scraper — get full post data + carousel images
    if APIFY_TOKEN:
        try:
            logger.info(f"📸 Calling Apify Instagram scraper for {url}")
            resp = requests.post(
                f"https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token={APIFY_TOKEN}",
                json={"directUrls": [url], "resultsType": "posts", "resultsLimit": 1},
                timeout=120,
            )
            if resp.status_code == 200:
                posts = resp.json()
                if posts and len(posts) > 0:
                    post = posts[0]
                    # Caption
                    if post.get("caption"):
                        content = post["caption"]
                    # Title from owner
                    owner = post.get("ownerUsername", "")
                    if owner:
                        title = f"{owner} on Instagram"
                        if content:
                            first_line = content.split("\n")[0][:100]
                            title = f'{owner}: "{first_line}"'
                    # Thumbnail
                    if post.get("displayUrl"):
                        thumbnail = post["displayUrl"]
                    # All carousel image URLs
                    for img in post.get("images", []):
                        if img and img not in image_urls:
                            image_urls.append(img)
                    logger.info(f"📸 Apify returned {len(image_urls)} images, caption={len(content)} chars")
        except Exception as e:
            logger.warning(f"Apify Instagram scraper failed: {e}")

    # Step 1b: Fallback to og tags if Apify didn't work
    if not content:
        try:
            response = requests.get(url, headers=headers, timeout=15, verify=certifi.where())
            soup = BeautifulSoup(response.text, "html.parser")
            og_title = soup.find("meta", property="og:title")
            if og_title and og_title.get("content"):
                title = og_title["content"]
            og_desc = soup.find("meta", property="og:description")
            if og_desc and og_desc.get("content"):
                content = og_desc["content"]
            og_image = soup.find("meta", property="og:image")
            if og_image and og_image.get("content"):
                thumbnail = og_image["content"]
                if not image_urls:
                    image_urls.append(thumbnail)
        except Exception as e:
            logger.warning(f"Instagram og tag fallback failed: {e}")

    # Step 2: Download carousel images and analyze with Gemini vision
    tmp_dir = f"/tmp/aether_ig_{_uuid.uuid4().hex}"
    os.makedirs(tmp_dir, exist_ok=True)
    downloaded_files = []

    for i, img_url in enumerate(image_urls[:15]):
        try:
            resp = requests.get(img_url, headers=headers, timeout=15, verify=certifi.where())
            if resp.status_code == 200 and len(resp.content) > 1000:
                ext = "jpg"
                ct = resp.headers.get("content-type", "")
                if "png" in ct: ext = "png"
                elif "webp" in ct: ext = "webp"
                elif "heic" in ct: ext = "jpg"  # PIL can't read heic, but CDN usually serves jpg
                path = f"{tmp_dir}/{i:03d}.{ext}"
                with open(path, "wb") as f:
                    f.write(resp.content)
                downloaded_files.append(path)
        except Exception:
            continue

    logger.info(f"📸 Instagram: downloaded {len(downloaded_files)} of {len(image_urls)} images")

    if downloaded_files:
        vision_text = _analyze_images_with_gemini(downloaded_files[:10])
        if vision_text:
            content = content + "\n\n--- Image Analysis ---\n" + vision_text if content else vision_text

    shutil.rmtree(tmp_dir, ignore_errors=True)

    if not content:
        content = f"Instagram post: {url}"

    if len(title) > 450:
        title = title[:450] + "..."

    return {"title": title, "content": content, "thumbnail": thumbnail}


def _analyze_images_with_gemini(image_paths: list) -> str:
    """Analyze images using Gemini vision to extract text and describe content."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.warning("No GEMINI_API_KEY set, skipping image analysis.")
        return ""

    import google.generativeai as genai
    from PIL import Image

    genai.configure(api_key=api_key)

    try:
        model = genai.GenerativeModel("gemini-2.5-flash")

        # Load images
        images = []
        for path in image_paths:
            try:
                img = Image.open(path)
                images.append(img)
            except Exception:
                continue

        if not images:
            return ""

        logger.info(f"🔍 Analyzing {len(images)} images with Gemini vision...")

        safety_settings = [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_ONLY_HIGH"},
        ]

        prompt = (
            "You are analyzing images from a social media post. These may be infographics, "
            "collages, lists, or carousel slides.\n\n"
            "For EACH image, meticulously:\n"
            "1. **OCR**: Extract EVERY piece of visible text — titles, names, labels, captions, "
            "dates, numbers, hashtags. Miss nothing.\n"
            "2. **Items/Entities**: If the image is a collage or grid (e.g. movies, books, albums, "
            "people, products), list EVERY item shown with its name/title. Use the format:\n"
            "   - Item Name (any additional context like year, author)\n"
            "3. **Structure**: Note the overall theme, time period, category, or heading "
            "(e.g. '1900s', 'Top 10', 'Best of 2024').\n\n"
            "Output a COMPLETE structured extraction per image. "
            "Do NOT summarize or skip items — list everything visible."
        )

        response = model.generate_content(
            [prompt] + images,
            safety_settings=safety_settings,
        )

        if not response.candidates:
            return ""

        return response.text

    except Exception as e:
        logger.warning(f"⚠️ Gemini vision analysis failed: {e}")
        return ""


def _extract_article(url: str) -> dict:
    """Extract article content using BeautifulSoup."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }
    response = requests.get(url, headers=headers, timeout=30, verify=certifi.where())
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    # Remove scripts, styles, nav, footer
    for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
        tag.decompose()

    title = soup.title.string.strip() if soup.title and soup.title.string else "Untitled"

    # Extract og:image thumbnail
    thumbnail = ""
    og_image = soup.find("meta", property="og:image") or soup.find("meta", attrs={"name": "og:image"})
    if og_image and og_image.get("content"):
        thumbnail = og_image["content"]
    else:
        # Fallback: twitter:image
        tw_image = soup.find("meta", attrs={"name": "twitter:image"}) or soup.find("meta", property="twitter:image")
        if tw_image and tw_image.get("content"):
            thumbnail = tw_image["content"]

    # Try to find main article content
    article = soup.find("article") or soup.find("main") or soup.find("body")
    content = article.get_text(separator="\n", strip=True)
    return {"title": title, "content": content, "thumbnail": thumbnail}


# ── Claude CLI Configuration ──────────────────────────
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "sonnet")
CLAUDE_CLI = os.getenv("CLAUDE_CLI_PATH", "claude")


def call_llm(content: str, instruction: str = "Summarize", language: str = "en") -> str:
    """Call Claude CLI for summarization, with Gemini as fallback."""
    lang_instruction = "English"
    if language == "tr":
        lang_instruction = "Turkish"

    prompt = f"""You are an advanced Aether Knowledge Engine assistant. {instruction} the following content natively in a highly structured, comprehensive Markdown format.

Focus on extracting DEEP knowledge, not just surface-level summaries. Your response MUST include:
1. A concise overview of the core topic.
2. The most critical insights and actionable takeaways.
3. Explicit extraction of any specific entities mentioned. For EACH entity, you MUST prefix its name with a type emoji to indicate what kind of entity it is. Use these prefixes consistently:
   - 📚 for books/novels/written works
   - 🎬 for films/movies/series/documentaries
   - 🎵 for music/songs/albums/composers
   - 👤 for people (directors, authors, scientists, etc.)
   - 🌐 for websites/platforms/channels
   - 🔧 for tools/frameworks/software
   - 💡 for concepts/theories/ideas
   - 📍 for locations/places
   Example: | 📚 Traumnovelle | Arthur Schnitzler's novella... |
   If no entities exist, skip this section.

IMPORTANT: YOUR ENTIRE RESPONSE OR SUMMARY MUST BE WRITTEN IN {lang_instruction.upper()}.

Content:
{content[:30000]}

Provide your response entirely in rich Markdown format. Do not add conversational filler."""

    # Primary: Claude CLI
    result = _call_claude_cli(prompt)
    if not result.startswith("⚠️"):
        return result

    logger.warning(f"Claude CLI failed, trying Gemini fallback...")

    # Fallback: Gemini API
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        return _call_gemini_api(prompt, gemini_key)

    return result  # Return the Claude error if no fallback available


def _call_gemini_api(prompt: str, api_key: str) -> str:
    """Call Gemini API as fallback for summarization."""
    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)

        model = genai.GenerativeModel("gemini-2.5-flash")
        logger.info("🧠 Calling Gemini API (gemini-2.5-flash) as fallback...")
        
        # Relax safety filters — we process diverse web content
        safety_settings = [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_ONLY_HIGH"},
        ]
        
        response = model.generate_content(prompt, safety_settings=safety_settings)

        # Handle blocked/empty responses from safety filters
        if not response.candidates:
            block_reason = getattr(response.prompt_feedback, 'block_reason', 'UNKNOWN')
            logger.warning(f"⚠️ Gemini blocked by safety filter: {block_reason}")
            return f"⚠️ AI content was blocked by safety filters (reason: {block_reason}). The raw content has been saved — you can read it directly."

        result = response.text.strip()
        if not result:
            return "⚠️ AI returned empty response"

        logger.info(f"🧠 Gemini generated {len(result)} chars")
        return result

    except Exception as e:
        logger.error(f"Gemini API error: {e}")
        return f"⚠️ AI unavailable: {e}"

def _call_claude_cli(prompt: str) -> str:
    """Call Claude via CLI subprocess (local dev with OAuth auth)."""
    import subprocess
    try:
        logger.info(f"🧠 Calling Claude CLI ({CLAUDE_MODEL})...")
        cmd = CLAUDE_CLI.split() + ["-p"]
        
        result = subprocess.run(
            cmd,
            input=prompt,
            capture_output=True,
            text=True,
            timeout=300,
        )

        if result.returncode != 0:
            err = (result.stderr or result.stdout).strip()
            logger.error(f"Claude error: {err[:300]}")
            return f"⚠️ AI failed: {err[:200]}"

        response = result.stdout.strip()
        if not response:
            return "⚠️ AI returned empty response"

        logger.info(f"🧠 Claude generated {len(response)} chars")
        return response

    except subprocess.TimeoutExpired:
        return "⚠️ AI timed out (300s)"
    except FileNotFoundError:
        return "⚠️ Claude CLI not found. Install: npm i -g @anthropic-ai/claude-code"
    except Exception as e:
        logger.error(f"Claude error: {e}")
        return f"⚠️ AI unavailable: {e}"

# ── Embedding Configuration ──────────────────────────
EMBEDDING_URL = os.getenv("EMBEDDING_URL", "http://localhost:8100")


def generate_embedding(note_id: str, title: str, content: str, ai_insight: str = ""):
    """Generate and store vector embedding for a note."""
    # Combine text fields for a rich embedding
    combined = f"{title}\n\n{content[:4000]}\n\n{ai_insight[:2000]}"
    
    try:
        resp = requests.post(
            f"{EMBEDDING_URL}/embed",
            json={"text": combined},
            timeout=30,
        )
        resp.raise_for_status()
        embedding = resp.json()["embedding"]
        
        # Store embedding in pgvector
        vec_str = "[" + ",".join(str(v) for v in embedding) + "]"
        query = text("UPDATE notes SET embedding = :vec WHERE id = :note_id")
        with engine.begin() as conn:
            conn.execute(query, {"vec": vec_str, "note_id": note_id})
        
        logger.info(f"📐 Embedding stored for note {note_id} ({len(embedding)} dims)")
    except Exception as e:
        logger.warning(f"⚠️ Embedding generation failed for {note_id}: {e}")
        # Non-fatal — note still works without embedding


# ── Auto-Label from Source URL ───────────────────────
SOURCE_LABEL_MAP = {
    "youtube.com": ("YouTube", "#FF0000"),
    "youtu.be": ("YouTube", "#FF0000"),
    "instagram.com": ("Instagram", "#E1306C"),
    "wikipedia.org": ("Wikipedia", "#636466"),
    "github.com": ("GitHub", "#8B5CF6"),
    "medium.com": ("Medium", "#00AB6C"),
    "twitter.com": ("Twitter/X", "#1DA1F2"),
    "x.com": ("Twitter/X", "#1DA1F2"),
    "reddit.com": ("Reddit", "#FF4500"),
    "arxiv.org": ("arXiv", "#B31B1B"),
    "stackoverflow.com": ("StackOverflow", "#F48024"),
    "news.ycombinator.com": ("Hacker News", "#FF6600"),
}


def auto_label_source(note_id: str, url: str):
    """Auto-create and assign a label based on the source URL domain."""
    from urllib.parse import urlparse
    try:
        raw_domain = urlparse(url).netloc.lower()
        # Strip common subdomains (only from start)
        for prefix in ("www.", "m.", "mobile."):
            if raw_domain.startswith(prefix):
                raw_domain = raw_domain[len(prefix):]
        domain = raw_domain

        label_name = None
        label_color = "#9093ff"  # default

        for pattern, (name, color) in SOURCE_LABEL_MAP.items():
            if pattern in domain:
                label_name = name
                label_color = color
                break

        if not label_name:
            # Use domain as label name for unknown sources
            label_name = domain.split(".")[0].capitalize()

        # Get the user_id for this note
        with engine.begin() as conn:
            row = conn.execute(
                text("SELECT user_id FROM notes WHERE id = :nid"),
                {"nid": note_id}
            ).fetchone()
            if not row:
                return
            user_id = str(row[0])

        # Find or create the label
        with engine.begin() as conn:
            existing = conn.execute(
                text("SELECT id FROM labels WHERE user_id = :uid AND name = :name AND deleted_at IS NULL"),
                {"uid": user_id, "name": label_name}
            ).fetchone()

            if existing:
                label_id = str(existing[0])
            else:
                result = conn.execute(
                    text("INSERT INTO labels (id, user_id, name, color, created_at, updated_at) "
                         "VALUES (gen_random_uuid(), :uid, :name, :color, NOW(), NOW()) RETURNING id"),
                    {"uid": user_id, "name": label_name, "color": label_color}
                )
                label_id = str(result.fetchone()[0])
                logger.info(f"🏷️ Created label '{label_name}' ({label_color})")

        # Assign label to note (avoid duplicates)
        with engine.begin() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM note_labels WHERE note_id = :nid AND label_id = :lid"),
                {"nid": note_id, "lid": label_id}
            ).fetchone()
            if not exists:
                conn.execute(
                    text("INSERT INTO note_labels (note_id, label_id) VALUES (:nid, :lid)"),
                    {"nid": note_id, "lid": label_id}
                )
                logger.info(f"🏷️ Labeled note {note_id} as '{label_name}'")

    except Exception as e:
        logger.warning(f"⚠️ Auto-labeling failed for {note_id}: {e}")


# ═══════════════════════════════════════════════════════
# CELERY TASKS
# ═══════════════════════════════════════════════════════


@app.task(bind=True, max_retries=3, default_retry_delay=60)
def process_url(self, note_id: str, url: str, language: str = "en"):
    """
    Main pipeline task:
    1. Extract content from URL (article/video)
    2. Send to Claude for auto-summarization
    3. Generate vector embedding for semantic search
    4. Update the note in PostgreSQL with results
    """
    logger.info(f"📥 Processing URL for note {note_id}: {url}")

    try:
        # Step 1: Extract content
        update_note_status(note_id, "processing")
        extracted = extract_content_from_url(url)

        # Step 2: Update note with extracted content + thumbnail
        update_fields = {
            "title": extracted["title"],
            "content": extracted["content"],
        }
        if extracted.get("thumbnail"):
            update_fields["thumbnail_url"] = extracted["thumbnail"]
        update_note_status(note_id, "processing", **update_fields)

        # Step 3: Generate AI summary
        ai_summary = call_llm(extracted["content"], instruction="Summarize", language=language)

        # Step 4: Mark as ready with AI insight
        update_note_status(note_id, "ready", ai_insight=ai_summary)

        # Step 5: Generate embedding for semantic search
        generate_embedding(note_id, extracted["title"], extracted["content"], ai_summary)

        # Step 6: Auto-label based on source URL
        auto_label_source(note_id, url)

        logger.info(f"✅ Note {note_id} processed successfully")
        return {"status": "success", "note_id": note_id}

    except Exception as exc:
        logger.error(f"❌ Failed to process note {note_id}: {exc}")
        update_note_status(note_id, "error")
        raise self.retry(exc=exc)


@app.task(bind=True, max_retries=2, default_retry_delay=30)
def generate_summary(self, note_id: str, content: str):
    """
    Standalone summarization task for manually created notes.
    Called when a user requests AI insight on existing content.
    """
    logger.info(f"🧠 Generating summary for note {note_id}")

    try:
        update_note_status(note_id, "processing")
        ai_summary = call_llm(content)
        update_note_status(note_id, "ready", ai_insight=ai_summary)

        # Generate embedding
        generate_embedding(note_id, "", content, ai_summary)

        logger.info(f"✅ Summary generated for note {note_id}")
        return {"status": "success", "note_id": note_id}

    except Exception as exc:
        logger.error(f"❌ Summary generation failed for note {note_id}: {exc}")
        update_note_status(note_id, "error")
        raise self.retry(exc=exc)


@app.task(bind=True, max_retries=1)
def backfill_embeddings(self):
    """Backfill embeddings for all notes that don't have one."""
    logger.info("📐 Starting embedding backfill...")

    query = text("SELECT id, title, content, ai_insight FROM notes WHERE embedding IS NULL AND deleted_at IS NULL")
    with engine.begin() as conn:
        rows = conn.execute(query).fetchall()

    count = 0
    for row in rows:
        try:
            generate_embedding(str(row[0]), row[1] or "", row[2] or "", row[3] or "")
            count += 1
        except Exception as e:
            logger.warning(f"Backfill failed for {row[0]}: {e}")

    logger.info(f"📐 Backfill complete: {count}/{len(rows)} notes embedded")
    return {"embedded": count, "total": len(rows)}

