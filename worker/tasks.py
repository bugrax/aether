"""
Aether AI Worker — Task Definitions

These tasks are enqueued by the Go API server via Redis
and executed by the Celery worker.
"""

import os
import ssl
import json
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
    from urllib.parse import urlparse

    # Basic URL validation
    try:
        parsed = urlparse(url)
        if not parsed.scheme or not parsed.netloc or parsed.scheme not in ("http", "https"):
            raise ValueError(f"Invalid URL: {url}")
    except Exception:
        raise ValueError(f"Invalid URL format: {url}")

    # Quick reachability check (HEAD request, 10s timeout)
    try:
        head = requests.head(url, timeout=10, allow_redirects=True,
                            headers={"User-Agent": "Mozilla/5.0"},
                            verify=certifi.where())
        content_type = head.headers.get("content-type", "").lower()

        # PDF support
        if "application/pdf" in content_type or url.lower().endswith(".pdf"):
            return _extract_pdf(url)

    except requests.exceptions.ConnectionError:
        raise ValueError(f"URL unreachable: {url}")
    except requests.exceptions.Timeout:
        raise ValueError(f"URL timed out: {url}")
    except Exception:
        pass  # Continue anyway, some sites block HEAD requests

    try:
        # Try yt-dlp for YouTube/video URLs
        if any(domain in url for domain in ["youtube.com", "youtu.be", "vimeo.com"]):
            return _extract_video(url)

        # Instagram
        if "instagram.com" in url:
            return _extract_instagram(url)

        # Twitter / X
        if any(domain in url for domain in ["twitter.com", "x.com"]):
            return _extract_twitter(url)

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
    video_url = ""

    # Step 1: Apify Instagram Scraper — get full post data + carousel images
    if APIFY_TOKEN:
        try:
            logger.info(f"📸 Calling Apify Instagram scraper for {url}")
            resp = requests.post(
                f"https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token={APIFY_TOKEN}",
                json={"directUrls": [url], "resultsType": "posts", "resultsLimit": 1},
                timeout=120,
            )
            if resp.status_code in (200, 201):
                posts = resp.json()
                if posts and len(posts) > 0:
                    post = posts[0]
                    # Check for Apify errors
                    if post.get("error"):
                        logger.warning(f"📸 Apify error: {post.get('error')} — {post.get('errorDescription', '')}")
                        if post["error"] == "restricted_page":
                            content = f"This Instagram post has restricted access and could not be fully extracted. URL: {url}"
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
                    # Thumbnail / display image
                    if post.get("displayUrl"):
                        thumbnail = post["displayUrl"]
                        if thumbnail not in image_urls:
                            image_urls.append(thumbnail)
                    # All carousel image URLs
                    for img in post.get("images", []):
                        if img and img not in image_urls:
                            image_urls.append(img)
                    # Video URL for reels
                    video_url = post.get("videoUrl") or post.get("video_url") or ""
                    logger.info(f"📸 Apify returned {len(image_urls)} images, video={'yes' if video_url else 'no'}, caption={len(content)} chars")
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

        # Convert first image to data URI for persistent thumbnail
        try:
            import base64
            with open(downloaded_files[0], "rb") as f:
                img_data = f.read()
            if len(img_data) < 500_000:
                b64 = base64.b64encode(img_data).decode()
                thumbnail = f"data:image/jpeg;base64,{b64}"
        except Exception:
            pass

    shutil.rmtree(tmp_dir, ignore_errors=True)

    # Step 3: If it's a reel/video, transcribe the audio
    # Try Apify videoUrl first, then fall back to yt-dlp download
    if not video_url:
        # Try yt-dlp for any Instagram video (reel or video post)
        video_url = _download_instagram_video_ytdlp(url)

    if video_url:
        if video_url.startswith("/tmp/"):
            # Local file from yt-dlp
            audio_transcript = _transcribe_local_video(video_url)
        else:
            # Remote URL from Apify
            audio_transcript = _transcribe_instagram_video(video_url)
        if audio_transcript:
            content = content + "\n\n--- Audio/Video Transcript ---\n" + audio_transcript if content else audio_transcript

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


def _extract_twitter(url: str) -> dict:
    """Extract Twitter/X post content using Apify Tweet Scraper."""
    APIFY_TOKEN = os.getenv("APIFY_TOKEN", "")
    if not APIFY_TOKEN:
        logger.warning("No APIFY_TOKEN set, falling back to article scraper for Twitter")
        return _extract_article(url)

    logger.info(f"🐦 Calling Apify Tweet Scraper for {url}")
    title = "Tweet"
    content = ""
    thumbnail = ""

    try:
        resp = requests.post(
            f"https://api.apify.com/v2/acts/apidojo~tweet-scraper/run-sync-get-dataset-items?token={APIFY_TOKEN}",
            json={"startUrls": [url], "maxItems": 1, "sort": "Top"},
            timeout=120,
        )
        if resp.status_code in (200, 201):
            tweets = resp.json()
            if isinstance(tweets, list) and len(tweets) > 0:
                tweet = tweets[0]
                # Skip noResults responses
                if tweet.get("noResults"):
                    logger.warning("🐦 Apify returned noResults, falling back to OG scraper")
                    return _extract_twitter_og(url)

                # Try multiple field names for author
                author = tweet.get("author", {}) or {}
                author_name = (author.get("name") or author.get("userName") or
                               tweet.get("user", {}).get("name", "") or
                               tweet.get("user_name", "") or "")
                author_handle = (author.get("userName") or author.get("screen_name") or
                                 tweet.get("user", {}).get("screen_name", "") or
                                 tweet.get("screen_name", "") or "")
                text = tweet.get("text") or tweet.get("full_text") or ""

                if author_name:
                    title = f"{author_name} (@{author_handle}) on X"
                elif author_handle:
                    title = f"@{author_handle} on X"
                if text:
                    content = text

                # Engagement stats
                likes = tweet.get("likeCount") or tweet.get("favorite_count") or 0
                retweets = tweet.get("retweetCount") or tweet.get("retweet_count") or 0
                replies = tweet.get("replyCount") or tweet.get("reply_count") or 0
                views = tweet.get("viewCount") or tweet.get("views") or 0
                if any([likes, retweets, replies, views]):
                    content += f"\n\n---\nLikes: {likes} | Retweets: {retweets} | Replies: {replies} | Views: {views}"

                # Quote tweet
                qt = tweet.get("quotedTweet") or tweet.get("quoted_status")
                if qt:
                    qt_author = (qt.get("author", {}) or {}).get("userName", "") or qt.get("user", {}).get("screen_name", "")
                    qt_text = qt.get("text") or qt.get("full_text") or ""
                    if qt_text:
                        content += f"\n\n--- Quoted Tweet from @{qt_author} ---\n{qt_text}"

                # Media thumbnail
                for media_field in ["extendedEntities", "extended_entities", "entities"]:
                    media_obj = tweet.get(media_field, {})
                    if isinstance(media_obj, dict):
                        for m in media_obj.get("media", []):
                            url_key = m.get("media_url_https") or m.get("media_url")
                            if url_key and not thumbnail:
                                thumbnail = url_key
                                break

                if not thumbnail and author.get("profileImageUrl"):
                    thumbnail = author["profileImageUrl"]

                logger.info(f"🐦 Tweet extracted: @{author_handle}, {len(content)} chars")
            else:
                logger.warning("🐦 Apify returned empty or invalid response")
                return _extract_twitter_og(url)
        else:
            logger.warning(f"Apify Tweet Scraper returned {resp.status_code}")
            return _extract_twitter_og(url)
    except Exception as e:
        logger.warning(f"Apify Tweet Scraper failed: {e}")
        return _extract_twitter_og(url)

    if not content:
        return _extract_twitter_og(url)

    if len(title) > 450:
        title = title[:450] + "..."

    return {"title": title, "content": content, "thumbnail": thumbnail}


def _download_instagram_video_ytdlp(url: str) -> str:
    """Try to download Instagram reel video using yt-dlp. Returns local file path or empty string."""
    import yt_dlp
    import uuid

    tmp_path = f"/tmp/aether_ig_reel_{uuid.uuid4().hex}.mp4"
    logger.info(f"🎬 Trying yt-dlp to download Instagram reel...")

    try:
        ydl_opts = {
            "format": "best[ext=mp4]/best",
            "outtmpl": tmp_path,
            "quiet": True,
            "no_warnings": True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        if os.path.exists(tmp_path) and os.path.getsize(tmp_path) > 1000:
            logger.info(f"🎬 yt-dlp downloaded Instagram reel: {os.path.getsize(tmp_path) / 1024 / 1024:.1f}MB")
            return tmp_path
    except Exception as e:
        logger.warning(f"⚠️ yt-dlp Instagram download failed: {e}")
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    return ""


def _transcribe_local_video(file_path: str) -> str:
    """Transcribe a local video/audio file with Gemini."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return ""

    import time
    import google.generativeai as genai
    genai.configure(api_key=api_key)

    try:
        logger.info(f"📤 Uploading local video to Gemini: {file_path}")
        video_file = genai.upload_file(path=file_path, mime_type="video/mp4")

        while video_file.state.name == "PROCESSING":
            time.sleep(2)
            video_file = genai.get_file(video_file.name)

        if video_file.state.name == "FAILED":
            raise ValueError("Gemini failed to process the video.")

        logger.info("🤖 Requesting Gemini transcription for video...")
        model = genai.GenerativeModel("gemini-2.5-flash")

        safety_settings = [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_ONLY_HIGH"},
        ]

        response = model.generate_content([
            video_file,
            "You are analyzing this video. Please:\n"
            "1. Transcribe ALL spoken words accurately in their native language.\n"
            "2. Describe what is happening visually in the video.\n"
            "3. Note any on-screen text, captions, or graphics.\n"
            "Provide a complete, detailed analysis."
        ], safety_settings=safety_settings)

        genai.delete_file(video_file.name)

        if not response.candidates:
            return ""

        logger.info(f"🎬 Video transcribed: {len(response.text)} chars")
        return response.text

    except Exception as e:
        logger.warning(f"⚠️ Local video transcription failed: {e}")
        return ""
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)


def _transcribe_instagram_video(video_url: str) -> str:
    """Download Instagram reel/video audio and transcribe with Gemini."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return ""

    import uuid
    import time

    logger.info(f"🎬 Downloading Instagram video for transcription...")
    tmp_path = f"/tmp/aether_ig_video_{uuid.uuid4().hex}.mp4"

    try:
        # Download video
        headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
        resp = requests.get(video_url, headers=headers, timeout=60, verify=certifi.where(), stream=True)
        if resp.status_code != 200:
            logger.warning(f"Failed to download Instagram video: {resp.status_code}")
            return ""

        with open(tmp_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)

        file_size = os.path.getsize(tmp_path)
        if file_size < 1000:
            logger.warning("Instagram video too small, skipping transcription")
            return ""

        logger.info(f"🎬 Instagram video downloaded: {file_size / 1024 / 1024:.1f}MB")

        # Upload to Gemini and transcribe (same as YouTube)
        import google.generativeai as genai
        genai.configure(api_key=api_key)

        logger.info("📤 Uploading Instagram video to Gemini...")
        video_file = genai.upload_file(path=tmp_path, mime_type="video/mp4")

        while video_file.state.name == "PROCESSING":
            time.sleep(2)
            video_file = genai.get_file(video_file.name)

        if video_file.state.name == "FAILED":
            raise ValueError("Gemini failed to process the video file.")

        logger.info("🤖 Requesting Gemini transcription for Instagram video...")
        model = genai.GenerativeModel("gemini-2.5-flash")

        safety_settings = [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_ONLY_HIGH"},
        ]

        response = model.generate_content([
            video_file,
            "You are analyzing this video. Please:\n"
            "1. Transcribe ALL spoken words accurately in their native language.\n"
            "2. Describe what is happening visually in the video.\n"
            "3. Note any on-screen text, captions, or graphics.\n"
            "Provide a complete, detailed analysis."
        ], safety_settings=safety_settings)

        genai.delete_file(video_file.name)

        if not response.candidates:
            block_reason = getattr(response.prompt_feedback, 'block_reason', 'UNKNOWN')
            logger.warning(f"⚠️ Gemini video analysis blocked: {block_reason}")
            return ""

        logger.info(f"🎬 Instagram video transcribed: {len(response.text)} chars")
        return response.text

    except Exception as e:
        logger.warning(f"⚠️ Instagram video transcription failed: {e}")
        return ""
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def _extract_twitter_og(url: str) -> dict:
    """Fallback: extract Twitter/X content via OG meta tags and nitter/fxtwitter."""
    logger.info(f"🐦 Falling back to OG/fxtwitter for {url}")
    import re

    title = "Tweet"
    content = ""
    thumbnail = ""

    # Try fxtwitter API (returns OG-friendly data)
    try:
        fx_url = re.sub(r'(twitter\.com|x\.com)', 'api.fxtwitter.com', url)
        fx_url = re.sub(r'\?.*$', '', fx_url)  # strip query params
        resp = requests.get(fx_url, timeout=15, verify=certifi.where())
        if resp.status_code == 200:
            data = resp.json()
            tweet = data.get("tweet", {})
            if tweet:
                author_name = tweet.get("author", {}).get("name", "")
                author_handle = tweet.get("author", {}).get("screen_name", "")
                text = tweet.get("text", "")
                if author_name:
                    title = f"{author_name} (@{author_handle}) on X"
                if text:
                    content = text
                likes = tweet.get("likes", 0)
                retweets = tweet.get("retweets", 0)
                replies = tweet.get("replies", 0)
                if any([likes, retweets, replies]):
                    content += f"\n\n---\nLikes: {likes} | Retweets: {retweets} | Replies: {replies}"
                media = tweet.get("media", {})
                if media and media.get("photos"):
                    thumbnail = media["photos"][0].get("url", "")
                elif tweet.get("author", {}).get("avatar_url"):
                    thumbnail = tweet["author"]["avatar_url"]
                logger.info(f"🐦 fxtwitter extracted: @{author_handle}, {len(content)} chars")
    except Exception as e:
        logger.warning(f"fxtwitter fallback failed: {e}")

    # Final fallback: standard article scraper
    if not content:
        try:
            return _extract_article(url)
        except Exception:
            pass

    if len(title) > 450:
        title = title[:450] + "..."
    return {"title": title, "content": content or f"Tweet: {url}", "thumbnail": thumbnail}


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
    content = article.get_text(separator="\n", strip=True) if article else ""

    # Detect JS-required sites (very little text content)
    if len(content.strip()) < 100:
        # Try og:description as fallback
        og_desc = soup.find("meta", property="og:description") or soup.find("meta", attrs={"name": "description"})
        if og_desc and og_desc.get("content"):
            content = og_desc["content"]
        og_title = soup.find("meta", property="og:title")
        if og_title and og_title.get("content"):
            title = og_title["content"]

    if len(content.strip()) < 30:
        content = f"This page requires JavaScript to load content. URL: {url}"

    # Fix encoding issues
    try:
        content = content.encode('utf-8', errors='replace').decode('utf-8')
        title = title.encode('utf-8', errors='replace').decode('utf-8')
    except Exception:
        pass

    return {"title": title, "content": content, "thumbnail": thumbnail}


def _extract_pdf(url: str) -> dict:
    """Extract text content from a PDF URL."""
    logger.info(f"📄 Extracting PDF content from {url}")

    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}

    try:
        resp = requests.get(url, headers=headers, timeout=60, verify=certifi.where(), stream=True)
        resp.raise_for_status()

        # Check file size (limit to 20MB)
        content_length = int(resp.headers.get('content-length', 0))
        if content_length > 20 * 1024 * 1024:
            raise ValueError("PDF too large (>20MB)")

        import io
        pdf_bytes = io.BytesIO(resp.content)

        # Try PyPDF2 first
        try:
            import PyPDF2
            reader = PyPDF2.PdfReader(pdf_bytes)
            pages = []
            for i, page in enumerate(reader.pages[:50]):  # Max 50 pages
                text = page.extract_text()
                if text:
                    pages.append(text)
            content = "\n\n".join(pages)
            title = reader.metadata.title if reader.metadata and reader.metadata.title else ""
        except ImportError:
            # Fallback: try pdfplumber
            try:
                import pdfplumber
                pdf = pdfplumber.open(pdf_bytes)
                pages = []
                for i, page in enumerate(pdf.pages[:50]):
                    text = page.extract_text()
                    if text:
                        pages.append(text)
                content = "\n\n".join(pages)
                title = ""
                pdf.close()
            except ImportError:
                raise ValueError("No PDF library available (install PyPDF2 or pdfplumber)")

        if not title:
            # Derive title from URL
            from urllib.parse import urlparse, unquote
            path = urlparse(url).path
            title = unquote(path.split("/")[-1].replace(".pdf", "").replace("_", " ").replace("-", " ")).strip()
            if not title:
                title = "PDF Document"

        if not content or len(content.strip()) < 30:
            content = f"PDF could not be parsed. URL: {url}"

        # Extract thumbnail from first page (not implemented, use empty)
        thumbnail = ""

        logger.info(f"📄 PDF extracted: {title[:50]}, {len(content)} chars")
        return {"title": title, "content": content, "thumbnail": thumbnail}

    except ValueError as e:
        raise
    except Exception as e:
        logger.error(f"PDF extraction failed: {e}")
        raise ValueError(f"Failed to extract PDF: {e}")


# ── Claude CLI Configuration ──────────────────────────
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "sonnet")
CLAUDE_CLI = os.getenv("CLAUDE_CLI_PATH", "claude")


def generate_title(raw_title: str, ai_summary: str, language: str = "en") -> str:
    """Generate a clean, descriptive title from the raw title and AI summary."""
    if not ai_summary or len(ai_summary) < 50:
        return ""

    lang_name = "Turkish" if language == "tr" else "English"
    prompt = f"""Generate a short, clear, descriptive title for this content. The title should explain what the content is about in 5-10 words.

Rules:
- Write in {lang_name}
- No quotes, no hashtags, no emojis, no special characters
- No "username:" prefix
- Just a clear description of the topic
- Maximum 60 characters

Current title: {raw_title[:100]}
Content summary: {ai_summary[:300]}

Return ONLY the title, nothing else."""

    result = _call_claude_cli(prompt)
    if result.startswith("⚠️"):
        gemini_key = os.getenv("GEMINI_API_KEY")
        if gemini_key:
            result = _call_gemini_api(prompt, gemini_key)

    # Clean the result
    title = result.strip().strip('"').strip("'").strip()
    if title.startswith("⚠️") or len(title) > 80 or len(title) < 3:
        return ""

    logger.info(f"📝 AI title: '{raw_title[:30]}...' → '{title}'")
    return title


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


# ── AI Topic Labeling ──────────────────────────────────

TOPIC_LABEL_COLORS = {
    "technology": "#4285F4",
    "teknoloji": "#4285F4",
    "science": "#34A853",
    "bilim": "#34A853",
    "cinema": "#E1306C",
    "sinema": "#E1306C",
    "film": "#E1306C",
    "music": "#1DB954",
    "müzik": "#1DB954",
    "art": "#FF6B6B",
    "sanat": "#FF6B6B",
    "economics": "#FF9500",
    "ekonomi": "#FF9500",
    "finance": "#FF9500",
    "finans": "#FF9500",
    "sports": "#00C853",
    "spor": "#00C853",
    "health": "#00BCD4",
    "sağlık": "#00BCD4",
    "education": "#9C27B0",
    "eğitim": "#9C27B0",
    "politics": "#FF5722",
    "siyaset": "#FF5722",
    "food": "#8D6E63",
    "yemek": "#8D6E63",
    "travel": "#26C6DA",
    "seyahat": "#26C6DA",
    "gaming": "#7C4DFF",
    "oyun": "#7C4DFF",
    "fashion": "#F06292",
    "moda": "#F06292",
    "history": "#795548",
    "tarih": "#795548",
    "philosophy": "#607D8B",
    "felsefe": "#607D8B",
    "ai": "#b79fff",
    "yapay zeka": "#b79fff",
    "programming": "#00ACC1",
    "programlama": "#00ACC1",
    "business": "#FF6F00",
    "iş": "#FF6F00",
    "startup": "#FF6F00",
    "design": "#62fae3",
    "tasarım": "#62fae3",
    "psychology": "#CE93D8",
    "psikoloji": "#CE93D8",
    "literature": "#A1887F",
    "edebiyat": "#A1887F",
}


def auto_label_topics(note_id: str, title: str, ai_insight: str, language: str = "en"):
    """Use LLM to extract topic labels from content and assign them."""
    if not ai_insight or len(ai_insight) < 50:
        return

    try:
        # Get user_id for this note
        with engine.begin() as conn:
            row = conn.execute(
                text("SELECT user_id FROM notes WHERE id = :nid"),
                {"nid": note_id}
            ).fetchone()
            if not row:
                return
            user_id = str(row[0])

        if language == "tr":
            label_examples = "teknoloji, sinema, ekonomi, sanat, müzik, spor, sağlık, eğitim, bilim, siyaset, tarih, felsefe, yapay zeka, programlama, tasarım, psikoloji, edebiyat, yemek, seyahat, oyun, moda, iş, girişim"
        else:
            label_examples = "technology, cinema, economics, art, music, sports, health, education, science, politics, history, philosophy, ai, programming, design, psychology, literature, food, travel, gaming, fashion, business, startup"

        # Ask LLM for topic labels (lightweight prompt, short response)
        prompt = f"""Analyze this content and return 2-4 topic labels that best categorize it.
Return ONLY a JSON array of lowercase label strings, nothing else.
Use single-word or two-word labels like: {label_examples}

Title: {title[:200]}
Content summary: {ai_insight[:500]}

Response (JSON array only):"""

        result = _call_claude_cli(prompt)
        if result.startswith("⚠️"):
            gemini_key = os.getenv("GEMINI_API_KEY")
            if gemini_key:
                result = _call_gemini_api(prompt, gemini_key)

        # Parse JSON array from response
        import re
        match = re.search(r'\[([^\]]+)\]', result)
        if not match:
            return

        labels_raw = json.loads(f"[{match.group(1)}]")
        labels = [l.strip().lower() for l in labels_raw if isinstance(l, str) and len(l.strip()) < 30]

        if not labels:
            return

        logger.info(f"🏷️ AI topic labels for {note_id}: {labels}")

        for label_name in labels[:4]:
            # Determine color
            color = TOPIC_LABEL_COLORS.get(label_name, "#9093ff")
            # Capitalize for display
            display_name = label_name.capitalize()

            # Find or create label
            with engine.begin() as conn:
                existing = conn.execute(
                    text("SELECT id FROM labels WHERE user_id = :uid AND LOWER(name) = :name AND deleted_at IS NULL"),
                    {"uid": user_id, "name": label_name}
                ).fetchone()

                if existing:
                    label_id = str(existing[0])
                else:
                    result_row = conn.execute(
                        text("INSERT INTO labels (id, user_id, name, color, created_at, updated_at) "
                             "VALUES (gen_random_uuid(), :uid, :name, :color, NOW(), NOW()) RETURNING id"),
                        {"uid": user_id, "name": display_name, "color": color}
                    )
                    label_id = str(result_row.fetchone()[0])

            # Assign to note (avoid duplicates)
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

    except Exception as e:
        logger.warning(f"⚠️ AI topic labeling failed for {note_id}: {e}")


# ── Push Notifications (FCM) ───────────────────────────

def send_push_notification(note_id: str, title: str, status: str):
    """Send FCM push notification to the note's owner."""
    try:
        # Get user's FCM token
        with engine.begin() as conn:
            row = conn.execute(
                text("""
                    SELECT u.fcm_token, u.language FROM users u
                    JOIN notes n ON n.user_id = u.id
                    WHERE n.id = :nid AND u.fcm_token IS NOT NULL AND u.fcm_token != ''
                """),
                {"nid": note_id}
            ).fetchone()

        if not row or not row[0]:
            return

        fcm_token = row[0]
        lang = row[1] or "en"

        if status == "ready":
            body = f"✅ {title}" if lang != "tr" else f"✅ {title} hazır"
        else:
            body = "❌ Processing failed" if lang != "tr" else "❌ İşlem başarısız"

        # Use FCM v1 API with service account
        import google.auth.transport.requests
        from google.oauth2 import service_account

        sa_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "/app/firebase-service-account.json")
        project_id = os.getenv("FIREBASE_PROJECT_ID", "aether-8717a")

        if not os.path.exists(sa_path):
            logger.warning("Firebase service account not found, skipping push")
            return

        credentials = service_account.Credentials.from_service_account_file(
            sa_path, scopes=["https://www.googleapis.com/auth/firebase.messaging"]
        )
        credentials.refresh(google.auth.transport.requests.Request())

        resp = requests.post(
            f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send",
            headers={
                "Authorization": f"Bearer {credentials.token}",
                "Content-Type": "application/json",
            },
            json={
                "message": {
                    "token": fcm_token,
                    "notification": {
                        "title": "Aether",
                        "body": body,
                    },
                    "data": {
                        "note_id": note_id,
                        "status": status,
                    },
                    "apns": {
                        "payload": {
                            "aps": {"sound": "default"}
                        }
                    },
                }
            },
            timeout=10,
        )
        logger.info(f"📲 Push sent: {resp.status_code}")
    except Exception as e:
        logger.warning(f"⚠️ Push notification failed: {e}")


# ── Activity Logging ───────────────────────────────────

def log_activity(note_id: str, action: str, title: str, description: str = ""):
    """Log an activity event for the note's owner."""
    try:
        with engine.begin() as conn:
            row = conn.execute(text("SELECT user_id FROM notes WHERE id = :nid"), {"nid": note_id}).fetchone()
            if not row:
                return
            conn.execute(
                text("""INSERT INTO activity_logs (id, user_id, action, title, description, note_id, created_at)
                        VALUES (gen_random_uuid(), :uid, :action, :title, :desc, :nid, NOW())"""),
                {"uid": str(row[0]), "action": action, "title": title, "desc": description, "nid": note_id}
            )
    except Exception:
        pass  # Non-critical


# ── Note Relations (Cross-Reference) ───────────────────

def find_related_notes(note_id: str):
    """Find semantically related notes and create relation entries."""
    try:
        with engine.begin() as conn:
            row = conn.execute(
                text("SELECT user_id, embedding FROM notes WHERE id = :nid AND embedding IS NOT NULL"),
                {"nid": note_id}
            ).fetchone()
            if not row or not row[1]:
                return
            user_id = str(row[0])

        # Find top 5 most similar notes using pgvector
        with engine.begin() as conn:
            similar = conn.execute(
                text("""
                    SELECT id, title, 1 - (embedding <=> (SELECT embedding FROM notes WHERE id = :nid)) as similarity
                    FROM notes
                    WHERE user_id = :uid AND id != :nid AND embedding IS NOT NULL AND deleted_at IS NULL
                    ORDER BY embedding <=> (SELECT embedding FROM notes WHERE id = :nid)
                    LIMIT 5
                """),
                {"nid": note_id, "uid": user_id}
            ).fetchall()

        if not similar:
            return

        linked = 0
        for sim_row in similar:
            sim_id = str(sim_row[0])
            sim_title = sim_row[1] or ""
            similarity = float(sim_row[2]) if sim_row[2] else 0

            # Only link if similarity > 0.3 (meaningful relation)
            if similarity < 0.3:
                continue

            # Check if relation already exists
            with engine.begin() as conn:
                exists = conn.execute(
                    text("""SELECT 1 FROM note_relations
                            WHERE (note_id_a = :a AND note_id_b = :b) OR (note_id_a = :b AND note_id_b = :a)"""),
                    {"a": note_id, "b": sim_id}
                ).fetchone()
                if exists:
                    continue

            # Determine relation type based on similarity score
            if similarity > 0.7:
                rel_type = "related"
                desc = f"Highly related content (similarity: {similarity:.0%})"
            elif similarity > 0.5:
                rel_type = "related"
                desc = f"Related content (similarity: {similarity:.0%})"
            else:
                rel_type = "related"
                desc = f"Loosely related (similarity: {similarity:.0%})"

            with engine.begin() as conn:
                conn.execute(
                    text("""INSERT INTO note_relations (id, note_id_a, note_id_b, relation_type, description, score, created_at)
                            VALUES (gen_random_uuid(), :a, :b, :type, :desc, :score, NOW())"""),
                    {"a": note_id, "b": sim_id, "type": rel_type, "desc": desc, "score": similarity}
                )
                linked += 1

        if linked > 0:
            logger.info(f"🔗 Linked note {note_id} to {linked} related notes")
            log_activity(note_id, "relation_found", f"{linked} related notes found", f"Cross-referenced with {linked} similar notes")

    except Exception as e:
        logger.warning(f"⚠️ Note relation detection failed: {e}")


# ── Synthesis Pages ────────────────────────────────────

def update_synthesis_pages(note_id: str, ai_summary: str, language: str = "en"):
    """Create or update synthesis pages based on the note's topic labels."""
    if not ai_summary or len(ai_summary) < 100:
        return

    try:
        # Get user_id and note's labels
        with engine.begin() as conn:
            row = conn.execute(
                text("SELECT user_id, title FROM notes WHERE id = :nid"),
                {"nid": note_id}
            ).fetchone()
            if not row:
                return
            user_id = str(row[0])
            note_title = row[1] or ""

            # Get this note's labels (topic labels, not source labels)
            labels = conn.execute(
                text("""
                    SELECT l.name FROM labels l
                    JOIN note_labels nl ON nl.label_id = l.id
                    WHERE nl.note_id = :nid
                    AND LOWER(l.name) NOT IN ('youtube', 'instagram', 'twitter/x', 'reddit', 'github', 'medium', 'wikipedia', 'arxiv', 'stackoverflow', 'hacker news')
                """),
                {"nid": note_id}
            ).fetchall()

        if not labels:
            return

        # For each topic label, update or create a synthesis page
        for label_row in labels[:3]:  # Max 3 topics per note
            topic = label_row[0]
            _update_single_synthesis(user_id, note_id, note_title, topic, ai_summary, language)

    except Exception as e:
        logger.warning(f"⚠️ Synthesis page update failed: {e}")


def _update_single_synthesis(user_id: str, note_id: str, note_title: str, topic: str, ai_summary: str, language: str):
    """Update or create a single synthesis page for a topic."""
    import time as _time

    # Check if synthesis page exists for this topic
    with engine.begin() as conn:
        existing = conn.execute(
            text("SELECT id, content, note_count FROM synthesis_pages WHERE user_id = :uid AND LOWER(topic) = LOWER(:topic) AND deleted_at IS NULL"),
            {"uid": user_id, "topic": topic}
        ).fetchone()

    lang_name = "Turkish" if language == "tr" else "English"

    if existing:
        page_id = str(existing[0])
        old_content = existing[1] or ""
        note_count = existing[2] or 0

        # Check if note already linked
        with engine.begin() as conn:
            already_linked = conn.execute(
                text("SELECT 1 FROM synthesis_notes WHERE synthesis_page_id = :pid AND note_id = :nid"),
                {"pid": page_id, "nid": note_id}
            ).fetchone()
        if already_linked:
            return

        # Update existing synthesis page
        prompt = f"""Update this knowledge synthesis about "{topic}" with a new note. Output ONLY the updated markdown, no commentary.

EXISTING SYNTHESIS ({note_count} notes):
{old_content[:2000]}

NEW NOTE: "{note_title}"
{ai_summary[:1000]}

Write entirely in {lang_name}. Keep existing insights, add new ones. Note contradictions. Update the sources list. Output ONLY markdown content."""

        result = _call_claude_cli(prompt)
        if result.startswith("⚠️"):
            gemini_key = os.getenv("GEMINI_API_KEY")
            if gemini_key:
                result = _call_gemini_api(prompt, gemini_key)

        if result and not result.startswith("⚠️"):
            with engine.begin() as conn:
                conn.execute(
                    text("UPDATE synthesis_pages SET content = :content, note_count = :nc, updated_at = NOW() WHERE id = :pid"),
                    {"content": result, "nc": note_count + 1, "pid": page_id}
                )
                conn.execute(
                    text("INSERT INTO synthesis_notes (synthesis_page_id, note_id) VALUES (:pid, :nid)"),
                    {"pid": page_id, "nid": note_id}
                )
            logger.info(f"📚 Updated synthesis '{topic}' ({note_count + 1} notes)")
    else:
        # Create new synthesis page
        prompt = f"""Write a knowledge synthesis about "{topic}" based on this note. Output ONLY the markdown content, no meta-commentary.

NOTE: "{note_title}"
{ai_summary[:1500]}

Write entirely in {lang_name}. Use this structure:

## Overview
Brief topic summary based on this note.

## Key Insights
Main takeaways as bullet points.

## Sources
- {note_title}

Output ONLY the synthesis content. Do not ask questions or add commentary."""

        result = _call_claude_cli(prompt)
        if result.startswith("⚠️"):
            gemini_key = os.getenv("GEMINI_API_KEY")
            if gemini_key:
                result = _call_gemini_api(prompt, gemini_key)

        if result and not result.startswith("⚠️"):
            title = f"{topic}: Knowledge Synthesis" if language != "tr" else f"{topic}: Bilgi Sentezi"
            with engine.begin() as conn:
                page_result = conn.execute(
                    text("""INSERT INTO synthesis_pages (id, user_id, topic, title, content, note_count, created_at, updated_at)
                            VALUES (gen_random_uuid(), :uid, :topic, :title, :content, 1, NOW(), NOW()) RETURNING id"""),
                    {"uid": user_id, "topic": topic, "title": title, "content": result}
                )
                page_id = str(page_result.fetchone()[0])
                conn.execute(
                    text("INSERT INTO synthesis_notes (synthesis_page_id, note_id) VALUES (:pid, :nid)"),
                    {"pid": page_id, "nid": note_id}
                )
            logger.info(f"📚 Created synthesis '{topic}' (1 note)")


# ── Entity Extraction ──────────────────────────────────

ENTITY_TYPE_MAP = {
    "📚": "book",
    "🎬": "film",
    "🎵": "music",
    "👤": "person",
    "🌐": "website",
    "🔧": "tool",
    "💡": "concept",
    "📍": "location",
    "🏢": "organization",
    "📅": "event",
}


def extract_entities(note_id: str, ai_insight: str, language: str = "en"):
    """Extract structured entities from AI insight and store them in the database."""
    if not ai_insight or len(ai_insight) < 100:
        return

    try:
        # Get user_id for this note
        with engine.begin() as conn:
            row = conn.execute(
                text("SELECT user_id FROM notes WHERE id = :nid"),
                {"nid": note_id}
            ).fetchone()
            if not row:
                return
            user_id = str(row[0])

        lang_name = "Turkish" if language == "tr" else "English"

        prompt = f"""Extract all named entities from this content. Return ONLY a JSON array of objects with "name", "type", and "description" fields.

Entity types: person, concept, tool, book, film, music, website, location, organization, event

Rules:
- "name" should be the proper name (e.g., "Elon Musk", "PostgreSQL", "The Matrix")
- "type" must be one of the listed types
- "description" should be a brief 1-sentence description in {lang_name}
- Extract 3-15 entities maximum
- Only extract entities that are clearly mentioned, not vague references

Content:
{ai_insight[:4000]}

Response (JSON array only):"""

        result = _call_claude_cli(prompt)
        if result.startswith("⚠️"):
            gemini_key = os.getenv("GEMINI_API_KEY")
            if gemini_key:
                result = _call_gemini_api(prompt, gemini_key)

        if result.startswith("⚠️"):
            return

        # Parse JSON array from response
        import re
        match = re.search(r'\[[\s\S]*\]', result)
        if not match:
            return

        entities_raw = json.loads(match.group(0))
        if not isinstance(entities_raw, list):
            return

        valid_types = set(ENTITY_TYPE_MAP.values())
        count = 0

        for ent in entities_raw[:15]:
            if not isinstance(ent, dict):
                continue
            name = str(ent.get("name", "")).strip()
            etype = str(ent.get("type", "")).strip().lower()
            desc = str(ent.get("description", "")).strip()[:500]

            if not name or not etype or len(name) < 2 or len(name) > 200:
                continue
            if etype not in valid_types:
                continue

            # Find or create entity (deduplicate by name + type per user)
            with engine.begin() as conn:
                existing = conn.execute(
                    text("""SELECT id FROM entities
                            WHERE user_id = :uid AND LOWER(name) = LOWER(:name) AND type = :type AND deleted_at IS NULL"""),
                    {"uid": user_id, "name": name, "type": etype}
                ).fetchone()

                if existing:
                    entity_id = str(existing[0])
                    # Update note count
                    conn.execute(
                        text("UPDATE entities SET note_count = note_count + 1, updated_at = NOW() WHERE id = :eid"),
                        {"eid": entity_id}
                    )
                else:
                    result_row = conn.execute(
                        text("""INSERT INTO entities (id, user_id, name, type, description, note_count, created_at, updated_at)
                                VALUES (gen_random_uuid(), :uid, :name, :type, :desc, 1, NOW(), NOW()) RETURNING id"""),
                        {"uid": user_id, "name": name, "type": etype, "desc": desc}
                    )
                    entity_id = str(result_row.fetchone()[0])

            # Link entity to note (avoid duplicates)
            with engine.begin() as conn:
                exists = conn.execute(
                    text("SELECT 1 FROM note_entities WHERE note_id = :nid AND entity_id = :eid"),
                    {"nid": note_id, "eid": entity_id}
                ).fetchone()
                if not exists:
                    conn.execute(
                        text("""INSERT INTO note_entities (id, note_id, entity_id, context, created_at)
                                VALUES (gen_random_uuid(), :nid, :eid, :ctx, NOW())"""),
                        {"nid": note_id, "eid": entity_id, "ctx": desc[:300]}
                    )
                    count += 1

        if count > 0:
            logger.info(f"🧬 Extracted {count} entities for note {note_id}")
            log_activity(note_id, "entities_extracted", f"{count} entities found", f"Extracted {count} entities from content")

    except Exception as e:
        logger.warning(f"⚠️ Entity extraction failed for {note_id}: {e}")


# ── Comment Extraction ─────────────────────────────────

def extract_comments(url: str) -> list:
    """Extract comments from YouTube, Instagram, or Twitter URLs. Returns normalized list."""
    try:
        if any(domain in url for domain in ["youtube.com", "youtu.be"]):
            return _extract_youtube_comments(url)
        if "instagram.com" in url:
            return _extract_instagram_comments(url)
        if any(domain in url for domain in ["twitter.com", "x.com"]):
            return _extract_twitter_replies(url)
    except Exception as e:
        logger.warning(f"⚠️ Comment extraction failed for {url}: {e}")
    return []


def _extract_youtube_comments(url: str) -> list:
    """Extract top YouTube comments using yt-dlp."""
    import yt_dlp

    logger.info(f"💬 Extracting YouTube comments for {url}")
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "getcomments": True,
        "extractor_args": {
            "youtube": {
                "max_comments": ["500", "200", "5", "3"],
                "comment_sort": ["top"],
            }
        },
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        raw_comments = info.get("comments", [])
        if not raw_comments:
            logger.info("💬 No YouTube comments found")
            return []

        comments = []
        for c in raw_comments:
            comments.append({
                "author": c.get("author", "Unknown"),
                "text": c.get("text", ""),
                "like_count": c.get("like_count", 0) or 0,
                "is_pinned": c.get("is_pinned", False),
            })

        # Sort by likes
        comments.sort(key=lambda x: x["like_count"], reverse=True)
        logger.info(f"💬 Extracted {len(comments)} YouTube comments")
        return comments

    except Exception as e:
        logger.warning(f"⚠️ YouTube comment extraction failed: {e}")
        return []


def _extract_instagram_comments(url: str) -> list:
    """Extract Instagram comments using Apify Instagram Comment Scraper."""
    APIFY_TOKEN = os.getenv("APIFY_TOKEN", "")
    if not APIFY_TOKEN:
        return []

    logger.info(f"💬 Extracting Instagram comments for {url}")
    try:
        resp = requests.post(
            f"https://api.apify.com/v2/acts/apify~instagram-comment-scraper/run-sync-get-dataset-items?token={APIFY_TOKEN}",
            json={"directUrls": [url], "resultsLimit": 200},
            timeout=120,
        )
        if resp.status_code not in (200, 201):
            logger.warning(f"Apify comment scraper returned {resp.status_code}")
            return []

        raw = resp.json()
        comments = []
        for c in raw:
            comments.append({
                "author": c.get("ownerUsername", "Unknown"),
                "text": c.get("text", ""),
                "like_count": c.get("likesCount", 0) or 0,
                "is_pinned": False,
            })

        comments.sort(key=lambda x: x["like_count"], reverse=True)
        logger.info(f"💬 Extracted {len(comments)} Instagram comments")
        return comments

    except Exception as e:
        logger.warning(f"⚠️ Instagram comment extraction failed: {e}")
        return []


def _extract_twitter_replies(url: str) -> list:
    """Extract Twitter/X replies using Apify Tweet Scraper."""
    import re
    APIFY_TOKEN = os.getenv("APIFY_TOKEN", "")
    if not APIFY_TOKEN:
        return []

    match = re.search(r'/status/(\d+)', url)
    if not match:
        return []
    tweet_id = match.group(1)

    # Extract author handle from URL for search
    handle_match = re.search(r'(?:twitter\.com|x\.com)/(\w+)/status', url)
    handle = handle_match.group(1) if handle_match else ""

    logger.info(f"🐦 Extracting Twitter replies for tweet {tweet_id}")
    comments = []

    # Method 1: conversationIds
    try:
        resp = requests.post(
            f"https://api.apify.com/v2/acts/apidojo~tweet-scraper/run-sync-get-dataset-items?token={APIFY_TOKEN}",
            json={"conversationIds": [tweet_id], "maxItems": 200, "sort": "Top"},
            timeout=120,
        )
        if resp.status_code in (200, 201):
            tweets = resp.json()
            if isinstance(tweets, list):
                for t in tweets:
                    if t.get("noResults"):
                        continue
                    if str(t.get("id")) == tweet_id:
                        continue
                    author = t.get("author", {}) or {}
                    text = t.get("text") or t.get("full_text") or ""
                    if not text:
                        continue
                    comments.append({
                        "author": author.get("userName") or author.get("screen_name") or "Unknown",
                        "text": text,
                        "like_count": t.get("likeCount") or t.get("favorite_count") or 0,
                        "is_pinned": False,
                    })
    except Exception as e:
        logger.warning(f"⚠️ Twitter conversationIds failed: {e}")

    # Method 2: if conversationIds returned nothing, try search for replies
    if not comments and handle:
        try:
            resp = requests.post(
                f"https://api.apify.com/v2/acts/apidojo~tweet-scraper/run-sync-get-dataset-items?token={APIFY_TOKEN}",
                json={"searchTerms": [f"to:{handle}"], "maxItems": 100, "sort": "Top"},
                timeout=120,
            )
            if resp.status_code in (200, 201):
                tweets = resp.json()
                if isinstance(tweets, list):
                    for t in tweets:
                        if t.get("noResults"):
                            continue
                        author = t.get("author", {}) or {}
                        text = t.get("text") or t.get("full_text") or ""
                        if not text:
                            continue
                        comments.append({
                            "author": author.get("userName") or author.get("screen_name") or "Unknown",
                            "text": text,
                            "like_count": t.get("likeCount") or t.get("favorite_count") or 0,
                            "is_pinned": False,
                        })
        except Exception as e:
            logger.warning(f"⚠️ Twitter search replies failed: {e}")

    comments.sort(key=lambda x: x["like_count"], reverse=True)
    logger.info(f"🐦 Extracted {len(comments)} Twitter replies")
    return comments


def generate_community_insights(comments: list, language: str = "en") -> str:
    """Analyze community comments and return a Markdown section."""
    if len(comments) < 5:
        return ""

    lang_name = "Turkish" if language == "tr" else "English"

    formatted = "\n".join([
        f"- @{c['author']} ({c['like_count']} likes): {c['text'][:300]}"
        for c in comments[:80]
    ])

    prompt = f"""Analyze these community comments from a video/post. Write your analysis entirely in {lang_name}.

Comments:
{formatted}

Provide a structured Markdown analysis with EXACTLY this format:

## 💬 Community Insights

### Overall Sentiment
(Positive/Negative/Mixed — brief 1-2 sentence explanation)

### Key Discussion Themes
(3-5 bullet points summarizing what the community is talking about)

### Notable Perspectives
(2-3 interesting or highly-liked comments that add value, paraphrased — not direct quotes)

### Community Consensus
(What does the community generally agree or disagree on?)

Keep it concise, insightful, and written entirely in {lang_name}. Do not add conversational filler."""

    result = _call_claude_cli(prompt)
    if result.startswith("⚠️"):
        gemini_key = os.getenv("GEMINI_API_KEY")
        if gemini_key:
            result = _call_gemini_api(prompt, gemini_key)
    return result


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

        # Step 4: Extract comments
        comments = extract_comments(url)
        if comments:
            update_note_status(note_id, "processing",
                               community_comments=json.dumps(comments, ensure_ascii=False))
            community_section = generate_community_insights(comments, language)
            if community_section and not community_section.startswith("⚠️"):
                ai_summary = ai_summary + "\n\n---\n\n" + community_section

        # Step 5: Generate a clean AI title
        ai_title = generate_title(extracted["title"], ai_summary, language)
        if ai_title:
            update_fields["title"] = ai_title

        # Step 6: Mark as ready with AI insight
        update_note_status(note_id, "ready", ai_insight=ai_summary, title=update_fields.get("title", extracted["title"]))

        # Step 6: Generate embedding for semantic search
        generate_embedding(note_id, extracted["title"], extracted["content"], ai_summary)

        # Step 7: Auto-label based on source URL
        auto_label_source(note_id, url)

        # Step 8: AI-based topic labels from content
        auto_label_topics(note_id, extracted["title"], ai_summary, language)

        # Step 9: Find and link related notes
        find_related_notes(note_id)

        # Step 10: Update or create synthesis pages for this note's topics
        update_synthesis_pages(note_id, ai_summary, language)

        # Step 11: Extract entities from AI insight
        extract_entities(note_id, ai_summary, language)

        logger.info(f"✅ Note {note_id} processed successfully")
        log_activity(note_id, "note_processed", update_fields.get("title", extracted["title"]), "AI processing complete")
        send_push_notification(note_id, update_fields.get("title", extracted["title"]), "ready")
        return {"status": "success", "note_id": note_id}

    except ValueError as exc:
        # Known errors (invalid URL, unreachable, etc.) — don't retry
        logger.error(f"❌ Note {note_id} failed (no retry): {exc}")
        error_msg = str(exc)[:200]
        update_note_status(note_id, "error", ai_insight=f"⚠️ {error_msg}")
        send_push_notification(note_id, "Processing failed", "error")
        return {"status": "error", "note_id": note_id, "error": error_msg}

    except Exception as exc:
        logger.error(f"❌ Failed to process note {note_id}: {exc}")
        if self.request.retries >= self.max_retries:
            error_msg = str(exc)[:200]
            update_note_status(note_id, "error", ai_insight=f"⚠️ {error_msg}")
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
        if self.request.retries >= self.max_retries:
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


@app.task(bind=True, max_retries=1)
def backfill_topic_labels(self):
    """Backfill AI topic labels for all notes that have AI insights."""
    import time as _time
    logger.info("🏷️ Starting topic label backfill...")

    query = text("SELECT id, title, ai_insight FROM notes WHERE deleted_at IS NULL AND length(ai_insight) > 50")
    with engine.begin() as conn:
        rows = conn.execute(query).fetchall()

    count = 0
    for row in rows:
        try:
            auto_label_topics(str(row[0]), row[1] or "", row[2] or "")
            count += 1
            logger.info(f"🏷️ Labeled {count}/{len(rows)}: {row[1][:50]}")
            _time.sleep(1)  # Rate limit LLM calls
        except Exception as e:
            logger.warning(f"Topic label failed for {row[0]}: {e}")

    logger.info(f"🏷️ Topic label backfill complete: {count}/{len(rows)} notes labeled")
    return {"embedded": count, "total": len(rows)}


@app.task(bind=True, max_retries=1)
def backfill_titles(self):
    """Backfill AI-generated titles for all notes."""
    import time as _time
    logger.info("📝 Starting title backfill...")

    query = text("""
        SELECT n.id, n.title, n.ai_insight,
               COALESCE(u.ai_language, u.language, 'en') as lang
        FROM notes n
        JOIN users u ON n.user_id = u.id
        WHERE n.deleted_at IS NULL AND length(n.ai_insight) > 50
    """)
    with engine.begin() as conn:
        rows = conn.execute(query).fetchall()

    count = 0
    for row in rows:
        try:
            note_id = str(row[0])
            old_title = row[1] or ""
            ai_insight = row[2] or ""
            lang = row[3] or "en"

            new_title = generate_title(old_title, ai_insight, lang)
            if new_title:
                with engine.begin() as conn:
                    conn.execute(
                        text("UPDATE notes SET title = :title, updated_at = :now WHERE id = :nid"),
                        {"title": new_title, "now": datetime.now(timezone.utc), "nid": note_id}
                    )
                count += 1
                logger.info(f"📝 {count}/{len(rows)}: '{old_title[:30]}' → '{new_title}'")
            _time.sleep(1)
        except Exception as e:
            logger.warning(f"Title backfill failed for {row[0]}: {e}")

    logger.info(f"📝 Title backfill complete: {count}/{len(rows)}")
    return {"updated": count, "total": len(rows)}


@app.task(bind=True, max_retries=1)
def backfill_synthesis(self):
    """Backfill synthesis pages for all notes not yet linked to any synthesis."""
    import time as _time
    logger.info("📚 Starting synthesis backfill...")

    # Get notes that have AI insight + topic labels but no synthesis link
    query = text("""
        SELECT n.id, n.ai_insight,
               COALESCE(u.ai_language, u.language, 'en') as lang
        FROM notes n
        JOIN users u ON n.user_id = u.id
        WHERE n.deleted_at IS NULL
        AND length(n.ai_insight) > 100
        AND n.id NOT IN (SELECT note_id FROM synthesis_notes)
        ORDER BY n.created_at DESC
    """)
    with engine.begin() as conn:
        rows = conn.execute(query).fetchall()

    logger.info(f"📚 Found {len(rows)} notes without synthesis")
    count = 0
    for row in rows:
        try:
            note_id = str(row[0])
            ai_summary = row[1] or ""
            lang = row[2] or "en"
            update_synthesis_pages(note_id, ai_summary, lang)
            count += 1
            if count % 10 == 0:
                logger.info(f"📚 Synthesis backfill progress: {count}/{len(rows)}")
            _time.sleep(2)  # Rate limit LLM calls
        except Exception as e:
            logger.warning(f"Synthesis backfill failed for {row[0]}: {e}")

    logger.info(f"📚 Synthesis backfill complete: {count}/{len(rows)}")
    return {"processed": count, "total": len(rows)}


@app.task(bind=True, max_retries=1)
def generate_weekly_synthesis(self):
    """Generate a weekly knowledge synthesis for each user. Runs Sunday 3am."""
    logger.info("📊 Starting weekly synthesis generation...")

    # Get all users with notes from the last 7 days
    query = text("""
        SELECT DISTINCT u.id, u.language, u.ai_language
        FROM users u
        JOIN notes n ON n.user_id = u.id
        WHERE n.deleted_at IS NULL
        AND n.created_at > NOW() - INTERVAL '7 days'
        AND n.status = 'ready'
    """)
    with engine.begin() as conn:
        users = conn.execute(query).fetchall()

    logger.info(f"📊 Found {len(users)} users with recent notes")

    for user_row in users:
        user_id = str(user_row[0])
        lang = user_row[2] or user_row[1] or "en"
        lang_name = "Turkish" if lang == "tr" else "English"

        try:
            # Get this week's notes
            with engine.begin() as conn:
                notes = conn.execute(
                    text("""
                        SELECT title, substring(ai_insight from 1 for 200) as insight
                        FROM notes
                        WHERE user_id = :uid AND deleted_at IS NULL
                        AND created_at > NOW() - INTERVAL '7 days' AND status = 'ready'
                        ORDER BY created_at DESC LIMIT 20
                    """),
                    {"uid": user_id}
                ).fetchall()

            if len(notes) < 2:
                continue

            note_list = "\n".join([f"- {n[0]}: {n[1]}" for n in notes])
            week_str = datetime.now(timezone.utc).strftime("%B %d, %Y")

            prompt = f"""Create a weekly knowledge synthesis for the week ending {week_str}. Write entirely in {lang_name}. Output ONLY markdown.

Notes saved this week ({len(notes)} notes):
{note_list}

Structure:
## Weekly Overview
Brief summary of what was explored this week.

## Key Themes
Group the notes by topic and highlight patterns.

## Cross-Topic Connections
Any interesting connections between different topics.

## Suggested Explorations
Based on interests shown, suggest 2-3 areas to explore next.

Be concise and insightful."""

            result = _call_claude_cli(prompt)
            if result.startswith("⚠️"):
                gemini_key = os.getenv("GEMINI_API_KEY")
                if gemini_key:
                    result = _call_gemini_api(prompt, gemini_key)

            if result and not result.startswith("⚠️"):
                title = f"Weekly Synthesis: {week_str}" if lang != "tr" else f"Haftalık Sentez: {week_str}"
                with engine.begin() as conn:
                    conn.execute(
                        text("""INSERT INTO notes (id, user_id, title, content, ai_insight, status, source_url, created_at, updated_at)
                                VALUES (gen_random_uuid(), :uid, :title, :content, :insight, 'ready', '', NOW(), NOW())"""),
                        {"uid": user_id, "title": title, "content": result, "insight": result}
                    )
                logger.info(f"📊 Weekly synthesis created for user {user_id}")

        except Exception as e:
            logger.warning(f"Weekly synthesis failed for {user_id}: {e}")

    logger.info("📊 Weekly synthesis generation complete")
    return {"users_processed": len(users)}


@app.task(bind=True, max_retries=1)
def translate_notes_to_english(self, user_email: str):
    """Translate all AI insights and titles to English for a specific user."""
    import time as _time
    logger.info(f"🌐 Starting translation to English for {user_email}...")

    query = text("""
        SELECT n.id, n.title, n.ai_insight FROM notes n
        JOIN users u ON n.user_id = u.id
        WHERE u.email = :email AND n.deleted_at IS NULL AND length(n.ai_insight) > 100
        ORDER BY n.created_at DESC
    """)
    with engine.begin() as conn:
        rows = conn.execute(query, {"email": user_email}).fetchall()

    logger.info(f"🌐 Found {len(rows)} notes to translate")
    count = 0
    for row in rows:
        try:
            note_id = str(row[0])
            old_title = row[1] or ""
            old_insight = row[2] or ""

            # Translate AI insight
            prompt = f"""Translate the following AI insight to English. Output ONLY the translated text, nothing else. Keep all markdown formatting, links, and structure intact.

{old_insight[:3000]}"""

            new_insight = _call_claude_cli(prompt)
            if new_insight.startswith("⚠️"):
                gemini_key = os.getenv("GEMINI_API_KEY")
                if gemini_key:
                    new_insight = _call_gemini_api(prompt, gemini_key)

            if new_insight and not new_insight.startswith("⚠️"):
                # Also translate title
                title_prompt = f"Translate this title to English. Output ONLY the translated title, nothing else: {old_title}"
                new_title = _call_claude_cli(title_prompt)
                if new_title.startswith("⚠️"):
                    new_title = old_title

                new_title = new_title.strip().strip('"').strip("'")
                if len(new_title) > 200 or len(new_title) < 3:
                    new_title = old_title

                with engine.begin() as conn:
                    conn.execute(
                        text("UPDATE notes SET ai_insight = :insight, title = :title, updated_at = NOW() WHERE id = :nid"),
                        {"insight": new_insight, "title": new_title, "nid": note_id}
                    )
                count += 1
                logger.info(f"🌐 Translated {count}/{len(rows)}: {old_title[:40]} → {new_title[:40]}")

            _time.sleep(2)
        except Exception as e:
            logger.warning(f"Translation failed for {row[0]}: {e}")

    logger.info(f"🌐 Translation complete: {count}/{len(rows)}")
    return {"translated": count, "total": len(rows)}


@app.task(bind=True, max_retries=1)
def backfill_relations(self):
    """Periodic task: find missing note relations across all users. Runs every 8 hours."""
    logger.info("🔗 Starting relation backfill...")

    # Get all notes with embeddings, grouped by user
    query = text("""
        SELECT id, user_id FROM notes
        WHERE embedding IS NOT NULL AND deleted_at IS NULL
        ORDER BY user_id, created_at DESC
    """)
    with engine.begin() as conn:
        all_notes = conn.execute(query).fetchall()

    # Group by user
    from collections import defaultdict
    user_notes = defaultdict(list)
    for row in all_notes:
        user_notes[str(row[1])].append(str(row[0]))

    total_linked = 0
    total_checked = 0

    for user_id, note_ids in user_notes.items():
        # For each note, check if it has < 3 relations — if so, try to find more
        for note_id in note_ids:
            with engine.begin() as conn:
                existing_count = conn.execute(
                    text("SELECT COUNT(*) FROM note_relations WHERE note_id_a = :nid OR note_id_b = :nid"),
                    {"nid": note_id}
                ).scalar()

            if existing_count >= 3:
                continue  # Already has enough relations

            total_checked += 1

            # Find similar notes
            try:
                with engine.begin() as conn:
                    similar = conn.execute(
                        text("""
                            SELECT id, 1 - (embedding <=> (SELECT embedding FROM notes WHERE id = :nid)) as similarity
                            FROM notes
                            WHERE user_id = :uid AND id != :nid AND embedding IS NOT NULL AND deleted_at IS NULL
                            ORDER BY embedding <=> (SELECT embedding FROM notes WHERE id = :nid)
                            LIMIT 5
                        """),
                        {"nid": note_id, "uid": user_id}
                    ).fetchall()

                for sim_row in similar:
                    sim_id = str(sim_row[0])
                    similarity = float(sim_row[1]) if sim_row[1] else 0

                    if similarity < 0.3:
                        continue

                    # Check if relation exists
                    with engine.begin() as conn:
                        exists = conn.execute(
                            text("""SELECT 1 FROM note_relations
                                    WHERE (note_id_a = :a AND note_id_b = :b) OR (note_id_a = :b AND note_id_b = :a)"""),
                            {"a": note_id, "b": sim_id}
                        ).fetchone()
                        if exists:
                            continue

                    if similarity > 0.7:
                        desc = f"Highly related (similarity: {similarity:.0%})"
                    elif similarity > 0.5:
                        desc = f"Related (similarity: {similarity:.0%})"
                    else:
                        desc = f"Loosely related (similarity: {similarity:.0%})"

                    with engine.begin() as conn:
                        conn.execute(
                            text("""INSERT INTO note_relations (id, note_id_a, note_id_b, relation_type, description, score, created_at)
                                    VALUES (gen_random_uuid(), :a, :b, 'related', :desc, :score, NOW())"""),
                            {"a": note_id, "b": sim_id, "desc": desc, "score": similarity}
                        )
                        total_linked += 1

            except Exception as e:
                logger.warning(f"Relation backfill failed for {note_id}: {e}")

    logger.info(f"🔗 Relation backfill complete: {total_linked} new relations, {total_checked} notes checked")
    return {"linked": total_linked, "checked": total_checked}


@app.task(bind=True, max_retries=1)
def backfill_entities(self):
    """Backfill entity extraction for all notes that don't have entities yet."""
    import time as _time
    logger.info("🧬 Starting entity backfill...")

    query = text("""
        SELECT n.id, n.ai_insight,
               COALESCE(u.ai_language, u.language, 'en') as lang
        FROM notes n
        JOIN users u ON n.user_id = u.id
        WHERE n.deleted_at IS NULL
        AND length(n.ai_insight) > 100
        AND n.id NOT IN (SELECT DISTINCT note_id FROM note_entities)
        ORDER BY n.created_at DESC
    """)
    with engine.begin() as conn:
        rows = conn.execute(query).fetchall()

    logger.info(f"🧬 Found {len(rows)} notes without entities")
    count = 0
    for row in rows:
        try:
            note_id = str(row[0])
            ai_insight = row[1] or ""
            lang = row[2] or "en"
            extract_entities(note_id, ai_insight, lang)
            count += 1
            if count % 10 == 0:
                logger.info(f"🧬 Entity backfill progress: {count}/{len(rows)}")
            _time.sleep(2)  # Rate limit LLM calls
        except Exception as e:
            logger.warning(f"Entity backfill failed for {row[0]}: {e}")

    logger.info(f"🧬 Entity backfill complete: {count}/{len(rows)}")
    return {"processed": count, "total": len(rows)}

