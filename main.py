"""
🎬 Netflix Cookie Collector - Backend API
Complete system to collect cookies from Telegram bots via web interface

Deployed on: Render.com
Access from: Any browser (Android/iOS/Desktop)
"""

import asyncio
import json
import os
import re
from datetime import datetime
from typing import List, Dict, Optional
from dataclasses import dataclass, field, asdict
from enum import Enum

from fastapi import FastAPI, HTTPException, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from pydantic import BaseModel
import uvicorn

# Telethon for Telegram automation
try:
    from telethon import TelegramClient, events
    from telethon.tl.types import InputPeerUser
    TELETHON_AVAILABLE = True
except ImportError:
    TELETHON_AVAILABLE = False
    print("⚠️ Telethon not installed. Install with: pip install telethon[cryptg]")


# ============== CONFIGURATION ==============
API_ID = 35469162  # Your API ID
API_HASH = "45a96f00fb85aadf074f67851d9ef261"  # Your API Hash
SESSION_NAME = "cookie_collector_session"

# Target bot
TARGET_BOT = "@lusuferchkbot"

# Cookie types mapping
COOKIE_TYPES = {
    "netflix": {"emoji": "🎬", "name": "Netflix", "button_text": ["nf", "netflix", "🎬"]},
    "hotstar": {"emoji": "📺", "name": "Jio Hotstar/Disney+", "button_text": ["hotstar", "disney", "hot", "📺"]},
    "prime": {"emoji": "📦", "name": "Amazon Prime Video", "button_text": ["prime", "amazon", "📦"]},
    "crunchyroll": {"emoji": "🍜", "name": "Crunchyroll", "button_text": ["crunchyroll", "crunchy", "anime", "🍜"]}
}


# ============== DATA MODELS ==============
class CookieType(str, Enum):
    NETFLIX = "netflix"
    HOTSTAR = "hotstar"
    PRIME = "prime"
    CRUNCHYROLL = "crunchyroll"


@dataclass
class CollectedCookie:
    """Single collected cookie/data entry"""
    id: int
    cookie_type: str
    data: str
    timestamp: str
    raw_message: str = ""
    
    def to_dict(self) -> dict:
        return asdict(self)


@dataclass 
class CollectionJob:
    """A collection job instance"""
    id: str
    cookie_type: str
    target_count: int
    collected_count: int = 0
    status: str = "pending"  # pending, running, completed, error, stopped
    cookies: List[CollectedCookie] = field(default_factory=list)
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error: Optional[str] = None
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "cookie_type": self.cookie_type,
            "target_count": self.target_count,
            "collected_count": self.collected_count,
            "status": self.status,
            "cookies": [c.to_dict() for c in self.cookies],
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "error": self.error,
            "progress": round((self.collected_count / max(self.target_count, 1)) * 100, 1)
        }


# ============== GLOBAL STATE ==============
app = FastAPI(title="🎬 Netflix Cookie Collector API", version="2.0.0")

# CORS middleware - allows web frontend to call API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Storage
active_jobs: Dict[str, CollectionJob] = {}
all_cookies: List[CollectedCookie] = []
job_counter = 0
client: Optional[TelegramClient] = None
is_client_connected = False
auth_state = {"status": "idle", "phone_hash": None}  # idle, sent_code, authenticated


# ============== TELETHON CLIENT MANAGEMENT ==============
async def get_telegram_client() -> Optional[TelegramClient]:
    """Get or create Telethon client"""
    global client, is_client_connected, auth_state
    
    if not TELETHON_AVAILABLE:
        return None
        
    if client and is_client_connected and auth_state["status"] == "authenticated":
        # Check if actually authorized
        if await client.is_user_authorized():
            return client
    
    try:
        # Create session directory if not exists
        os.makedirs("sessions", exist_ok=True)
        
        client = TelegramClient(
            f"sessions/{SESSION_NAME}",
            API_ID,
            API_HASH
        )
        
        await client.connect()
        
        # Check if already authorized (session exists)
        if await client.is_user_authorized():
            is_client_connected = True
            auth_state["status"] = "authenticated"
            print("✅ Telegram client connected and authorized!")
            return client
        else:
            is_client_connected = True  # Connected but not authorized
            auth_state["status"] = "needs_auth"
            print("⏳ Telegram connected - needs phone verification")
            return client
            
    except Exception as e:
        print(f"❌ Failed to connect Telegram client: {e}")
        is_client_connected = False
        return None


async def send_phone_code(phone: str) -> dict:
    """Send verification code to phone number"""
    global client, auth_state
    
    tg_client = await get_telegram_client()
    
    if not tg_client:
        return {"success": False, "error": "Cannot connect to Telegram"}
    
    try:
        result = await tg_client.send_code_request(phone)
        auth_state["status"] = "sent_code"
        auth_state["phone_hash"] = result.phone_code_hash
        auth_state["phone"] = phone
        
        return {
            "success": True,
            "message": f"Code sent to {phone}",
            "phone_code_hash": result.phone_code_hash
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


async def verify_code(code: str) -> dict:
    """Verify the code received on phone"""
    global client, auth_state, is_client_connected
    
    if not client or auth_state.get("status") != "sent_code":
        return {"success": False, "error": "No pending verification. Send phone first."}
    
    try:
        await client.sign_in(phone=auth_state.get("phone"), code=code, phone_code_hash=auth_state.get("phone_hash"))
        auth_state["status"] = "authenticated"
        is_client_connected = True
        
        # Save session
        await client.session.save()
        
        return {
            "success": True,
            "message": "✅ Successfully authenticated!",
            "user": (await client.get_me()).first_name
        }
    except Exception as e:
        error_msg = str(e)
        if "PHONE_CODE_INVALID" in error_msg:
            return {"success": False, "error": "Invalid code. Try again."}
        elif "PHONE_CODE_EXPIRED" in error_msg:
            return {"success": False, "error": "Code expired. Send new code."}
        else:
            return {"success": False, "error": error_msg}


async def disconnect_client():
    """Disconnect Telegram client"""
    global is_client_connected
    if client:
        try:
            await client.disconnect()
            is_client_connected = False
            print("✅ Telegram client disconnected")
        except:
            pass


# ============== COOKIE EXTRACTION LOGIC ==============
def extract_cookie_from_message(message_text: str, cookie_type: str) -> Optional[str]:
    """
    Extract cookie/data from message based on type
    Different patterns for different services
    """
    if not message_text:
        return None
    
    text = message_text.strip()
    
    # Patterns based on cookie type
    patterns = {
        "netflix": [
            r'(NetflixId=[^;]+;\s*SecureNetflixId=[^;]+)',
            r'(NetflixId=\S+)',
            r'([a-zA-Z0-9]{20,}={0,2})',  # Long base64-like strings
        ],
        "hotstar": [
            r'(st=[^;]+)',
            r'(hotstar[^;]*;[^;]*)',
            r'([a-zA-Z0-9]{30,})',
        ],
        "prime": [
            r'(prime-[a-zA-Z0-9.-]+)',
            r'(at-main[\s\S]*?at-cookie)',
            r'([a-zA-Z0-9]{40,})',
        ],
        "crunchyroll": [
            r'(etp_rt=[^;]+)',
            r'(session_id=[^;]+)',
            r'([a-zA-Z0-9]{30,})',
        ]
    }
    
    # Generic fallback pattern
    generic_patterns = [
        r'```([^`]+)```',  # Code blocks
        r'([a-zA-Z0-9+/=]{50,})',  # Long encoded strings
        r'(\{[^{}]+\})',  # JSON-like
    ]
    
    # Try type-specific patterns first
    for pattern in patterns.get(cookie_type, []):
        match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if match:
            return match.group(1).strip()
    
    # Fallback to generic patterns
    for pattern in generic_patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if match:
            return match.group(1).strip()
    
    # If no pattern matches but message is long enough, return it
    if len(text) > 30 and not text.startswith('/'):
        return text[:500]  # Limit length
    
    return None


# ============== COLLECTION ENGINE ==============
async def run_collection_job(job_id: str):
    """Background task that runs the actual collection"""
    global job_counter
    
    job = active_jobs.get(job_id)
    if not job:
        return
    
    job.status = "running"
    job.started_at = datetime.now().isoformat()
    
    tg_client = await get_telegram_client()
    
    if not tg_client:
        job.status = "error"
        job.error = "Telegram client not available. Check API credentials."
        job.completed_at = datetime.now().isoformat()
        return
    
    try:
        # Get target bot entity
        target_bot = await tg_client.get_entity(TARGET_BOT)
        print(f"✅ Connected to target bot: @{target_bot.username}")
        
        # Send /start to initiate conversation
        await tg_client.send_message(target_bot, "/start")
        print("📤 Sent /start command")
        await asyncio.sleep(3)  # Wait for response
        
        # Click appropriate button based on cookie type
        type_info = COOKIE_TYPES.get(job.cookie_type, {})
        button_keywords = type_info.get("button_text", [job.cookie_type])
        
        # Get last message and click buttons
        clicked_correct_button = False
        
        while job.collected_count < job.target_count and job.status == "running":
            # Get latest messages
            messages = []
            async for msg in tg_client.iter_messages(target_bot, limit=5):
                messages.append(msg)
            
            if not messages:
                print("⏳ Waiting for response...")
                await asyncio.sleep(5)
                continue
            
            latest_msg = messages[0]
            
            # Check if this message contains a cookie
            cookie_data = extract_cookie_from_message(latest_msg.text or "", job.cookie_type)
            
            if cookie_data:
                # Save the cookie
                job.collected_count += 1
                new_cookie = CollectedCookie(
                    id=len(all_cookies) + 1,
                    cookie_type=job.cookie_type,
                    data=cookie_data,
                    timestamp=datetime.now().isoformat(),
                    raw_message=(latest_msg.text or "")[:300]
                )
                job.cookies.append(new_cookie)
                all_cookies.append(new_cookie)
                
                print(f"✅ Collected cookie #{job.collected_count}/{job.target_count}")
                
                # Also save to file
                save_cookie_to_file(new_cookie)
            
            # Look for buttons to click (Next, More, etc.)
            if latest_msg.buttons:
                button_clicked = False
                
                # Priority keywords for next cookie
                next_keywords = ["next", "get another", "more", "➡️", "▶️", "→", "again"]
                
                # First time: look for cookie-type-specific buttons
                if not clicked_correct_button:
                    for keyword in button_keywords:
                        for row in latest_msg.buttons:
                            for btn in row:
                                if keyword.lower() in btn.text.lower():
                                    print(f"🖱️ Clicking: {btn.text}")
                                    await btn.click()
                                    button_clicked = True
                                    clicked_correct_button = True
                                    break
                            if button_clicked:
                                break
                        if button_clicked:
                            break
                
                # If already selected type, look for "next" buttons
                else:
                    for keyword in next_keywords:
                        for row in latest_msg.buttons:
                            for btn in row:
                                if keyword.lower() in btn.text.lower():
                                    print(f"🖱️ Clicking Next: {btn.text}")
                                    await btn.click()
                                    button_clicked = True
                                    break
                            if button_clicked:
                                break
                        if button_clicked:
                            break
                    
                    # If no "next" found, click first button
                    if not button_clicked:
                        try:
                            first_btn = latest_msg.buttons[0][0]
                            print(f"🖱️ Clicking first button: {first_btn.text}")
                            await first_btn.click()
                            button_clicked = True
                        except:
                            pass
            
            # Wait before next iteration
            await asyncio.sleep(2)
        
        # Mark as completed
        if job.collected_count >= job.target_count:
            job.status = "completed"
        elif job.status == "running":
            job.status = "completed"  # Stopped by user or other reason
        
        job.completed_at = datetime.now().isoformat()
        print(f"\n🎉 Job {job_id} completed! Collected {job.collected_count} cookies")
        
    except Exception as e:
        print(f"❌ Job failed: {e}")
        job.status = "error"
        job.error = str(e)
        job.completed_at = datetime.now().isoformat()


def save_cookie_to_file(cookie: CollectedCookie):
    """Save cookie to persistent storage file"""
    try:
        with open("collected_data.json", "a", encoding="utf-8") as f:
            f.write(json.dumps(cookie.to_dict()) + "\n")
    except:
        pass


# ============== API ENDPOINTS ==============

@app.get("/")
async def root():
    """Root endpoint - returns info"""
    global auth_state
    return {
        "service": "🎬 Netflix Cookie Collector",
        "version": "2.0.0",
        "status": "running",
        "telegram_connected": is_client_connected,
        "auth_status": auth_state.get("status", "idle"),
        "endpoints": {
            "dashboard": "/dashboard (HTML page)",
            "start_collection": "POST /api/collect",
            "job_status": "GET /api/job/{job_id}",
            "all_jobs": "GET /api/jobs",
            "all_cookies": "GET /api/cookies",
            "stop_job": "POST /api/job/{job_id}/stop",
            "cookie_types": "GET /api/types",
            "auth_send_phone": "POST /api/auth/send-code",
            "auth_verify": "POST /api/auth/verify",
            "auth_status": "GET /api/auth/status"
        }
    }


# ============== AUTHENTICATION ENDPOINTS ==============
@app.post("/api/auth/send-code")
async def send_code_endpoint(phone: str = Query(..., description="Phone number with country code (+880...)")):
    """Send verification code to phone"""
    result = await send_phone_code(phone)
    return result


@app.post("/api/auth/verify")
async def verify_code_endpoint(code: str = Query(..., description="Verification code from Telegram")):
    """Verify the received code"""
    result = await verify_code(code)
    return result


@app.get("/api/auth/status")
async def auth_status():
    """Get current authentication status"""
    global auth_state
    return {
        "status": auth_state.get("status", "idle"),
        "telegram_connected": is_client_connected,
        "telethon_available": TELETHON_AVAILABLE
    }


@app.get("/dashboard")
async def dashboard():
    """Return the HTML dashboard"""
    html_content = generate_dashboard_html()
    return HTMLResponse(content=html_content)


@app.get("/api/types")
async def get_cookie_types():
    """Get available cookie types"""
    return {
        "types": {
            k: v for k, v in COOKIE_TYPES.items()
        },
        "default": "netflix"
    }


@app.post("/api/collect")
async def start_collection(
    background_tasks: BackgroundTasks,
    cookie_type: str = Query(..., description="Cookie type: netflix, hotstar, prime, crunchyroll"),
    count: int = Query(..., ge=1, le=1000, description="Number of cookies to collect (1-1000)")
):
    """Start a new collection job"""
    global job_counter
    job_counter += 1
    
    # Validate cookie type
    if cookie_type not in COOKIE_TYPES:
        raise HTTPException(status_code=400, detail={
            "error": f"Invalid cookie type. Choose from: {list(COOKIE_TYPES.keys())}"
        })
    
    # Create job
    job_id = f"job_{job_counter}_{datetime.now().strftime('%H%M%S')}"
    
    job = CollectionJob(
        id=job_id,
        cookie_type=cookie_type,
        target_count=count,
        status="pending"
    )
    
    active_jobs[job_id] = job
    
    # Start background collection
    background_tasks.add_task(run_collection_job, job_id)
    
    return {
        "success": True,
        "job_id": job_id,
        "message": f"Collection started for {COOKIE_TYPES[cookie_type]['name']}",
        "target_count": count,
        "status_url": f"/api/job/{job_id}",
        "websocket_hint": "Poll this URL for updates every 2 seconds"
    }


@app.get("/api/job/{job_id}")
async def get_job_status(job_id: str):
    """Get status of a specific job"""
    job = active_jobs.get(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail={"error": "Job not found"})
    
    return job.to_dict()


@app.get("/api/jobs")
async def get_all_jobs():
    """Get all jobs"""
    return {
        "jobs": [j.to_dict() for j in active_jobs.values()],
        "total": len(active_jobs),
        "active": sum(1 for j in active_jobs.values() if j.status == "running")
    }


@app.post("/api/job/{job_id}/stop")
async def stop_job(job_id: str):
    """Stop a running job"""
    job = active_jobs.get(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail={"error": "Job not found"})
    
    if job.status != "running":
        raise HTTPException(status_code=400, detail={"error": "Job is not running"})
    
    job.status = "stopped"
    job.completed_at = datetime.now().isoformat()
    
    return {
        "success": True,
        "message": "Job stopped",
        "collected_so_far": job.collected_count
    }


@app.get("/api/cookies")
async def get_all_cookies(
    cookie_type: Optional[str] = None,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0)
):
    """Get all collected cookies with filtering"""
    cookies = all_cookies
    
    # Filter by type
    if cookie_type and cookie_type in COOKIE_TYPES:
        cookies = [c for c in cookies if c.cookie_type == cookie_type]
    
    # Paginate
    total = len(cookies)
    cookies_page = cookies[offset:offset+limit]
    
    return {
        "cookies": [c.to_dict() for c in cookies_page],
        "total": total,
        "showing": len(cookies_page),
        "offset": offset,
        "limit": limit
    }


@app.delete("/api/cookies")
async def clear_cookies():
    """Clear all collected cookies"""
    global all_cookies
    count = len(all_cookies)
    all_cookies = []
    
    # Clear file too
    try:
        with open("collected_data.json", "w") as f:
            f.write("")
    except:
        pass
    
    return {
        "success": True,
        "message": f"Cleared {count} cookies"
    }


@app.get("/api/stats")
async def get_stats():
    """Get collection statistics"""
    type_counts = {}
    for ct in COOKIE_TYPES.keys():
        type_counts[ct] = sum(1 for c in all_cookies if c.cookie_type == ct)
    
    return {
        "total_cookies": len(all_cookies),
        "by_type": type_counts,
        "total_jobs": len(active_jobs),
        "active_jobs": sum(1 for j in active_jobs.values() if j.status == "running"),
        "completed_jobs": sum(1 for j in active_jobs.values() if j.status == "completed"),
        "telegram_connected": is_client_connected,
        "uptime": datetime.now().isoformat()
    }


# ============== DASHBOARD HTML GENERATOR ==============
def generate_dashboard_html() -> str:
    """Generate the complete HTML dashboard"""
    return '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🎬 Universal Cookie Collector</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
            color: #fff;
            min-height: 100vh;
            padding: 10px;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        
        /* Header */
        header { 
            text-align: center; 
            padding: 25px 15px;
            background: rgba(255,255,255,0.05);
            border-radius: 20px;
            margin-bottom: 20px;
            border: 1px solid rgba(255,255,255,0.1);
        }
        h1 { font-size: 1.8em; margin-bottom: 8px; }
        .gradient-text {
            background: linear-gradient(90deg, #e50914, #ff6b6b, #ffd700);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .subtitle { color: #888; font-size: 0.95em; }
        
        /* Stats Bar */
        .stats-bar {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 12px;
            margin-bottom: 20px;
        }
        .stat-card {
            background: rgba(255,255,255,0.08);
            padding: 18px 12px;
            border-radius: 14px;
            text-align: center;
            border: 1px solid rgba(255,255,255,0.08);
        }
        .stat-number { font-size: 1.8em; font-weight: bold; color: #e50914; }
        .stat-label { color: #888; font-size: 0.82em; margin-top: 4px; }
        
        /* Main Grid */
        .main-grid {
            display: grid;
            grid-template-columns: 400px 1fr;
            gap: 20px;
        }
        @media (max-width: 900px) {
            .main-grid { grid-template-columns: 1fr; }
        }
        
        /* Control Panel */
        .control-panel {
            background: rgba(255,255,255,0.06);
            padding: 22px;
            border-radius: 18px;
            border: 1px solid rgba(255,255,255,0.1);
            height: fit-content;
        }
        .panel-title { 
            font-size: 1.25em; 
            margin-bottom: 18px; 
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .form-group { margin-bottom: 16px; }
        .form-label { 
            display: block; 
            margin-bottom: 7px; 
            color: #aaa; 
            font-size: 0.88em;
            font-weight: 500;
        }
        
        /* Cookie Type Selector */
        .type-selector {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }
        .type-option {
            background: rgba(0,0,0,0.3);
            border: 2px solid transparent;
            border-radius: 13px;
            padding: 14px 10px;
            cursor: pointer;
            transition: all 0.3s;
            text-align: center;
        }
        .type-option:hover { background: rgba(255,255,255,0.08); }
        .type-option.selected {
            border-color: #e50914;
            background: rgba(229, 9, 20, 0.15);
        }
        .type-emoji { font-size: 2em; display: block; margin-bottom: 6px; }
        .type-name { font-size: 0.92em; font-weight: 600; }
        
        /* Inputs & Buttons */
        input[type="number"], select {
            width: 100%;
            padding: 13px 15px;
            background: rgba(0,0,0,0.35);
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 11px;
            color: white;
            font-size: 1em;
        }
        input:focus, select:focus {
            outline: none;
            border-color: #e50914;
        }
        
        .btn-primary {
            width: 100%;
            padding: 16px;
            background: linear-gradient(135deg, #e50914, #b81d24);
            border: none;
            color: white;
            border-radius: 12px;
            font-size: 1.08em;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }
        .btn-primary:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 7px 25px rgba(229, 9, 20, 0.45);
        }
        .btn-primary:disabled {
            opacity: 0.55;
            cursor: not-allowed;
        }
        .btn-secondary {
            width: 100%;
            padding: 12px;
            background: transparent;
            border: 2px solid rgba(255,255,255,0.15);
            color: white;
            border-radius: 11px;
            font-size: 0.95em;
            cursor: pointer;
            transition: all 0.3s;
            margin-bottom: 8px;
        }
        .btn-secondary:hover { background: rgba(255,255,255,0.06); }
        .btn-danger {
            border-color: #f44336;
            color: #f44336;
        }
        .btn-danger:hover { background: rgba(244, 67, 54, 0.1); }
        
        /* Progress Bar */
        .progress-container {
            margin: 18px 0;
            display: none;
        }
        .progress-container.active { display: block; }
        .progress-bar-bg {
            height: 28px;
            background: rgba(0,0,0,0.35);
            border-radius: 14px;
            overflow: hidden;
            position: relative;
        }
        .progress-bar-fill {
            height: 100%;
            background: linear-gradient(90deg, #e50914, #ff6b6b);
            border-radius: 14px;
            transition: width 0.4s ease;
            position: relative;
        }
        .progress-text {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 0.82em;
            font-weight: bold;
            z-index: 1;
        }
        
        /* Cookies Display */
        .cookies-panel {
            background: rgba(255,255,255,0.06);
            padding: 22px;
            border-radius: 18px;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .cookies-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 18px;
            padding-bottom: 14px;
            border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        
        .cookie-item {
            background: rgba(0,0,0,0.32);
            padding: 16px;
            border-radius: 13px;
            margin-bottom: 13px;
            border-left: 4px solid #e50914;
            position: relative;
        }
        .cookie-item.hotstar { border-left-color: #0066cc; }
        .cookie-item.prime { border-left-color: #ff9900; }
        .cookie-item.crunchyroll { border-left-color: #f47521; }
        
        .cookie-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        .cookie-badge {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.78em;
            font-weight: bold;
        }
        .badge-netflix { background: #e50914; }
        .badge-hotstar { background: #0066cc; }
        .badge-prime { background: #ff9900; }
        .badge-crunchyroll { background: #f47521; }
        
        .cookie-time { color: #666; font-size: 0.82em; }
        .cookie-data {
            font-family: 'Courier New', monospace;
            font-size: 0.87em;
            word-break: break-all;
            color: #ccc;
            max-height: 110px;
            overflow-y: auto;
            background: rgba(0,0,0,0.25);
            padding: 12px;
            border-radius: 9px;
            line-height: 1.5;
        }
        .copy-btn {
            background: linear-gradient(135deg, #e50914, #b81d24);
            border: none;
            color: white;
            padding: 9px 17px;
            border-radius: 9px;
            cursor: pointer;
            font-size: 0.86em;
            margin-top: 10px;
            transition: opacity 0.3s;
        }
        .copy-btn:hover { opacity: 0.85; }
        
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #666;
        }
        .empty-icon { font-size: 4.5em; margin-bottom: 18px; }
        
        /* Status Badge */
        .status-badge {
            display: inline-block;
            padding: 6px 16px;
            border-radius: 20px;
            font-size: 0.84em;
            font-weight: bold;
        }
        .status-idle { background: #666; }
        .status-running { 
            background: #4caf50; 
            animation: pulse 1.5s infinite;
        }
        .status-completed { background: #2196f3; }
        .status-error { background: #f44336; }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.65; }
        }
        
        /* Log Area */
        .log-area {
            background: rgba(0,0,0,0.35);
            border-radius: 11px;
            padding: 14px;
            margin-top: 16px;
            max-height: 180px;
            overflow-y: auto;
            font-family: monospace;
            font-size: 0.82em;
            color: #aaa;
            display: none;
        }
        .log-area.active { display: block; }
        .log-entry { margin-bottom: 5px; }
        .log-info { color: #64b5f6; }
        .log-success { color: #81c784; }
        .log-error { color: #e57373; }
        
        /* Login Modal */
        .login-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.85);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 20px;
            backdrop-filter: blur(10px);
        }
        .login-box {
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            border-radius: 20px;
            padding: 30px;
            max-width: 420px;
            width: 100%;
            border: 1px solid rgba(255,255,255,0.1);
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }
        .login-header {
            text-align: center;
            margin-bottom: 25px;
        }
        .login-icon {
            font-size: 3.5em;
            display: block;
            margin-bottom: 12px;
        }
        .login-header h2 {
            font-size: 1.4em;
            margin-bottom: 8px;
            color: #fff;
        }
        .login-header p {
            color: #888;
            font-size: 0.9em;
        }
        .auth-step {
            margin-bottom: 20px;
        }
        .auth-step input[type="tel"],
        .auth-step input[type="text"] {
            width: 100%;
            padding: 15px;
            background: rgba(0,0,0,0.4);
            border: 2px solid rgba(255,255,255,0.1);
            border-radius: 12px;
            color: white;
            font-size: 1.1em;
            margin-bottom: 15px;
            text-align: center;
        }
        .auth-step input:focus {
            outline: none;
            border-color: #e50914;
        }
        .error-msg {
            background: rgba(244,67,54,0.15);
            border: 1px solid #f44336;
            color: #f44336;
            padding: 12px;
            border-radius: 10px;
            text-align: center;
            font-size: 0.9em;
            margin-top: 15px;
        }
        
        footer {
            text-align: center;
            padding: 25px;
            color: #555;
            margin-top: 25px;
            font-size: 0.88em;
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <header>
            <h1><span class="gradient-text">🎬 Universal Cookie Collector</span></h1>
            <p class="subtitle">Collect Netflix, Hotstar, Prime & Crunchyroll cookies automatically!</p>
            <span id="connection-status" class="status-badge status-idle">Connecting...</span>
        </header>
        
        <!-- Stats -->
        <div class="stats-bar">
            <div class="stat-card">
                <div class="stat-number" id="total-cookies">0</div>
                <div class="stat-label">Total Cookies</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="nf-count">0</div>
                <div class="stat-label">🎬 Netflix</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="hs-count">0</div>
                <div class="stat-label">📺 Hotstar</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="pr-count">0</div>
                <div class="stat-label">📦 Prime</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="cr-count">0</div>
                <div class="stat-label">🍜 Crunchyroll</div>
            </div>
        </div>
        
        <!-- Login Modal (shows when not authenticated) -->
        <div id="login-modal" class="login-overlay" style="display: none;">
            <div class="login-box">
                <div class="login-header">
                    <span class="login-icon">📱</span>
                    <h2>Telegram Login Required</h2>
                    <p>Connect your Telegram account to start collecting cookies!</p>
                </div>
                
                <!-- Step 1: Phone Number -->
                <div id="step-phone" class="auth-step">
                    <label class="form-label">Phone Phone Number (with country code)</label>
                    <input type="tel" id="phone-input" placeholder="+8801XXXXXXXXX" value="">
                    <button class="btn-primary" onclick="sendCode()">Send Send Code</button>
                </div>
                
                <!-- Step 2: Verification Code -->
                <div id="step-code" class="auth-step" style="display: none;">
                    <label class="form-label">Key Verification Code</label>
                    <p id="code-hint" style="color: #888; font-size: 0.85em; margin-bottom: 10px;">Check your Telegram app for the code</p>
                    <input type="text" id="code-input" placeholder="Enter 5-digit code" maxlength="5">
                    <button class="btn-primary" onclick="verifyCode()">[OK] Verify</button>
                    <button class="btn-secondary" onclick="resendCode()" style="margin-top: 8px;">Re Resend Code</button>
                </div>
                
                <!-- Step 3: Success -->
                <div id="step-success" class="auth-step" style="display: none;">
                    <div style="text-align: center; padding: 20px;">
                        <span style="font-size: 4em;">[OK]</span>
                        <h3 style="margin-top: 15px; color: #4caf50;">Connected Successfully!</h3>
                        <p id="user-name" style="color: #888;"></p>
                        <button class="btn-primary" onclick="closeLoginModal()" style="margin-top: 20px;">>> Start Collecting!</button>
                    </div>
                </div>
                
                <div id="login-error" class="error-msg" style="display: none;"></div>
            </div>
        </div>
        
        <!-- Main Content -->
        <div class="main-grid">
            <!-- Control Panel -->
            <div class="control-panel">
                <h2 class="panel-title">⚙ Controls</h2>
                
                <!-- Cookie Type Selection -->
                <div class="form-group">
                    <label class="form-label">Select Cookie Type:</label>
                    <div class="type-selector" id="type-selector">
                        <div class="type-option selected" data-type="netflix" onclick="selectType(this)">
                            <span class="type-emoji">🎬</span>
                            <span class="type-name">Netflix</span>
                        </div>
                        <div class="type-option" data-type="hotstar" onclick="selectType(this)">
                            <span class="type-emoji">📺</span>
                            <span class="type-name">Hotstar</span>
                        </div>
                        <div class="type-option" data-type="prime" onclick="selectType(this)">
                            <span class="type-emoji">📦</span>
                            <span class="type-name">Prime</span>
                        </div>
                        <div class="type-option" data-type="crunchyroll" onclick="selectType(this)">
                            <span class="type-emoji">🍜</span>
                            <span class="type-name">Crunchyroll</span>
                        </div>
                    </div>
                </div>
                
                <!-- Quantity -->
                <div class="form-group">
                    <label class="form-label">How many cookies?</label>
                    <input type="number" id="cookie-count" value="10" min="1" max="500" placeholder="Enter quantity (1-500)">
                </div>
                
                <!-- Start Button -->
                <button class="btn-primary" id="start-btn" onclick="startCollection()">
                    >> Start Collection
                </button>
                
                <button class="btn-secondary" id="stop-btn" onclick="stopCollection()" style="display:none;">
                    [||] Stop
                </button>
                
                <!-- Progress -->
                <div class="progress-container" id="progress-container">
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" id="progress-fill" style="width: 0%">
                        </div>
                        <span class="progress-text" id="progress-text">0%</span>
                    </div>
                </div>
                
                <!-- Action Buttons -->
                <button class="btn-secondary" onclick="copyAllCookies()">
                    [clip] Copy All Cookies
                </button>
                <button class="btn-secondary" onclick="exportJSON()">
                    [save] Export JSON
                </button>
                <button class="btn-secondary btn-danger" onclick="clearAll()">
                    [del] Clear All
                </button>
                
                <!-- Log -->
                <div class="log-area" id="log-area"></div>
            </div>
            
            <!-- Cookies Display -->
            <div class="cookies-panel">
                <div class="cookies-header">
                    <h2 class="panel-title">[clip] Collected Cookies</h2>
                    <button class="copy-btn" onclick="copyAllCookies()">Copy All</button>
                </div>
                <div id="cookies-list">
                    <div class="empty-state">
                        <div class="empty-icon">cookie</div>
                        <p>No cookies yet</p>
                        <p style="font-size: 0.88em; margin-top: 10px;">Choose type, set quantity, then Start!</p>
                    </div>
                </div>
            </div>
        </div>
        
        <footer>
            <p>Universal Cookie Collector v2.0 | Educational Purpose Only</p>
            <p style="margin-top: 6px;">Works on Android - iOS - Desktop</p>
        </footer>
    </div>

    <script>
        // State
        let currentJobId = null;
        let selectedType = 'netflix';
        let pollInterval = null;
        let allCookies = [];
        let isAuthenticated = false;
        
        // Type emoji map (using text to avoid encoding issues)
        const typeEmojis = {
            netflix: 'NF',
            hotstar: 'HS',
            prime: 'PR',
            crunchyroll: 'CR'
        };
        
        // ============== AUTHENTICATION FUNCTIONS ==============
        
        // Check authentication status on load
        async function checkAuthStatus() {
            try {
                const res = await fetch('/api/auth/status');
                const data = await res.json();
                
                console.log('Auth status:', data);
                
                if (data.status === 'authenticated') {
                    isAuthenticated = true;
                    updateStatusBadge('authenticated');
                    hideLoginModal();
                    log('[OK] Telegram connected!', 'success');
                } else if (data.status === 'needs_auth' || data.status === 'idle') {
                    isAuthenticated = false;
                    showLoginModal();
                    updateStatusBadge('idle');
                    log('... Telegram login required', 'info');
                } else if (data.status === 'sent_code') {
                    showCodeStep();
                }
            } catch (err) {
                console.error('Auth check error:', err);
                showLoginModal();
            }
        }
        
        // Show login modal
        function showLoginModal() {
            document.getElementById('login-modal').style.display = 'flex';
            document.getElementById('step-phone').style.display = 'block';
            document.getElementById('step-code').style.display = 'none';
            document.getElementById('step-success').style.display = 'none';
            document.getElementById('login-error').style.display = 'none';
        }
        
        // Hide login modal
        function hideLoginModal() {
            document.getElementById('login-modal').style.display = 'none';
        }
        
        // Close login modal and start
        function closeLoginModal() {
            hideLoginModal();
            log('Ready to collect cookies! Choose type and click Start.', 'success');
        }
        
        // Send code to phone
        async function sendCode() {
            const phone = document.getElementById('phone-input').value.trim();
            
            if (!phone || phone.length < 10) {
                showLoginError('Please enter a valid phone number with country code');
                return;
            }
            
            try {
                const btn = event.target;
                btn.disabled = true;
                btn.innerHTML = '... Sending...';
                
                const res = await fetch(`/api/auth/send-code?phone=${encodeURIComponent(phone)}`, {
                    method: 'POST'
                });
                const data = await res.json();
                
                if (data.success) {
                    showCodeStep();
                    log(`Code sent to ${phone}`, 'success');
                } else {
                    showLoginError(data.error || 'Failed to send code');
                    btn.disabled = false;
                    btn.innerHTML = 'Send Send Code';
                }
            } catch (err) {
                showLoginError('Network error. Try again.');
                console.error(err);
            }
        }
        
        // Show code input step
        function showCodeStep() {
            document.getElementById('step-phone').style.display = 'none';
            document.getElementById('step-code').style.display = 'block';
            document.getElementById('login-error').style.display = 'none';
        }
        
        // Verify the code
        async function verifyCode() {
            const code = document.getElementById('code-input').value.trim();
            
            if (!code || code.length < 4) {
                showLoginError('Please enter the verification code');
                return;
            }
            
            try {
                const btn = event.target;
                btn.disabled = true;
                btn.innerHTML = '... Verifying...';
                
                const res = await fetch(`/api/auth/verify?code=${encodeURIComponent(code)}`, {
                    method: 'POST'
                });
                const data = await res.json();
                
                if (data.success) {
                    // Show success step
                    document.getElementById('step-code').style.display = 'none';
                    document.getElementById('step-success').style.display = 'block';
                    document.getElementById('user-name').textContent = `Welcome, ${data.user || 'User'}!`;
                    document.getElementById('login-error').style.display = 'none';
                    
                    isAuthenticated = true;
                    updateStatusBadge('authenticated');
                    log(`[OK] Logged in as ${data.user || 'User'}!`, 'success');
                } else {
                    showLoginError(data.error || 'Verification failed');
                    btn.disabled = false;
                    btn.innerHTML = '[OK] Verify';
                }
            } catch (err) {
                showLoginError('Network error. Try again.');
                console.error(err);
            }
        }
        
        // Resend code
        async function resendCode() {
            const phone = document.getElementById('phone-input').value;
            if (phone) {
                document.getElementById('step-phone').style.display = 'block';
                document.getElementById('step-code').style.display = 'none';
                sendCode();
            }
        }
        
        // Show login error
        function showLoginError(msg) {
            const el = document.getElementById('login-error');
            el.textContent = msg;
            el.style.display = 'block';
        }
        
        // Select cookie type
        function selectType(el) {
            document.querySelectorAll('.type-option').forEach(opt => opt.classList.remove('selected'));
            el.classList.add('selected');
            selectedType = el.dataset.type;
            log(`Selected: ${typeEmojis[selectedType]} ${selectedType.toUpperCase()}`, 'info');
        }
        
        // Start collection
        async function startCollection() {
            // Check if authenticated first
            if (!isAuthenticated) {
                showLoginModal();
                log('[!] Please login with Telegram first!', 'error');
                return;
            }
            
            const count = parseInt(document.getElementById('cookie-count').value);
            
            if (!count || count < 1 || count > 500) {
                alert('Please enter a valid number (1-500)');
                return;
            }
            
            // Update UI
            const startBtn = document.getElementById('start-btn');
            const stopBtn = document.getElementById('stop-btn');
            const progressContainer = document.getElementById('progress-container');
            const logArea = document.getElementById('log-area');
            
            startBtn.disabled = true;
            startBtn.innerHTML = '... Starting...';
            stopBtn.style.display = 'block';
            progressContainer.classList.add('active');
            logArea.classList.add('active');
            
            log(`Starting collection of ${count} ${selectedType} cookies...`, 'info');
            
            try {
                const res = await fetch(`/api/collect?cookie_type=${selectedType}&count=${count}`, {
                    method: 'POST'
                });
                const data = await res.json();
                
                if (data.success) {
                    currentJobId = data.job_id;
                    log(`Job started: ${data.job_id}`, 'success');
                    
                    // Start polling
                    pollInterval = setInterval(pollJobStatus, 2000);
                } else {
                    throw new Error(data.error || 'Failed to start');
                }
            } catch (err) {
                log(`Error: ${err.message}`, 'error');
                resetUI();
            }
        }
        
        // Poll job status
        async function pollJobStatus() {
            if (!currentJobId) return;
            
            try {
                const res = await fetch(`/api/job/${currentJobId}`);
                const job = await res.json();
                
                // Update progress
                const fill = document.getElementById('progress-fill');
                const text = document.getElementById('progress-text');
                fill.style.width = `${job.progress}%`;
                text.textContent = `${job.collected_count}/${job.target_count} (${Math.round(job.progress)}%)`;
                
                // Update status badge
                updateStatusBadge(job.status);
                
                // If new cookies, refresh list
                if (job.cookies && job.cookies.length > 0) {
                    allCookies = job.cookies;
                    renderCookies();
                    updateStats();
                }
                
                // Check if complete
                if (job.status === 'completed' || job.status === 'error' || job.status === 'stopped') {
                    clearInterval(pollInterval);
                    pollInterval = null;
                    
                    if (job.status === 'completed') {
                        log(`[OK] Complete! Collected ${job.collected_count} cookies`, 'success');
                    } else if (job.status === 'error') {
                        log(`[X] Error: ${job.error || 'Unknown error'}`, 'error');
                    } else {
                        log(`[||] Stopped at ${job.collected_count} cookies`, 'info');
                    }
                    
                    resetUI();
                }
            } catch (err) {
                console.error('Poll error:', err);
            }
        }
        
        // Stop collection
        async function stopCollection() {
            if (!currentJobId) return;
            
            try {
                await fetch(`/api/job/${currentJobId}/stop`, { method: 'POST' });
                log('Stopping...', 'info');
            } catch (err) {
                console.error('Stop error:', err);
            }
        }
        
        // Reset UI after job completes
        function resetUI() {
            const startBtn = document.getElementById('start-btn');
            const stopBtn = document.getElementById('stop-btn');
            
            startBtn.disabled = false;
            startBtn.innerHTML = '>> Start Collection';
            stopBtn.style.display = 'none';
        }
        
        // Update status badge
        function updateStatusBadge(status) {
            const el = document.getElementById('connection-status');
            const statusMap = {
                'idle': { class: 'status-idle', text: 'NOT CONNECTED' },
                'connecting': { class: 'status-running', text: 'CONNECTING...' },
                'running': { class: 'status-running', text: 'RUNNING' },
                'completed': { class: 'status-completed', text: 'COMPLETED' },
                'error': { class: 'status-error', text: 'ERROR' },
                'authenticated': { class: 'status-completed', text: '[OK] CONNECTED' },
                'stopped': { class: 'status-idle', text: 'STOPPED' }
            };
            
            const s = statusMap[status] || statusMap['idle'];
            el.className = `status-badge ${s.class}`;
            el.textContent = s.text;
        }
        
        // Render cookies list
        function renderCookies() {
            const container = document.getElementById('cookies-list');
            
            if (!allCookies || allCookies.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">cookie</div>
                        <p>No cookies yet</p>
                    </div>
                `;
                return;
            }
            
            container.innerHTML = allCookies.map((cookie, i) => `
                <div class="cookie-item ${cookie.cookie_type}">
                    <div class="cookie-header">
                        <span class="cookie-badge badge-${cookie.cookie_type}">
                            ${typeEmojis[cookie.cookie_type]} ${cookie.cookie_type.toUpperCase()}
                        </span>
                        <span class="cookie-time">#${i + 1} - ${new Date(cookie.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div class="cookie-data">${escapeHtml(cookie.data)}</div>
                    <button class="copy-btn" onclick="copyCookie(${i})">[clip] Copy This Cookie</button>
                </div>
            `).join('');
        }
        
        // Update stats
        async function updateStats() {
            try {
                const res = await fetch('/api/cookies');
                const data = await res.json();
                
                document.getElementById('total-cookies').textContent = data.total;
                document.getElementById('nf-count').textContent = data.cookies.filter(c => c.cookie_type === 'netflix').length;
                document.getElementById('hs-count').textContent = data.cookies.filter(c => c.cookie_type === 'hotstar').length;
                document.getElementById('pr-count').textContent = data.cookies.filter(c => c.cookie_type === 'prime').length;
                document.getElementById('cr-count').textContent = data.cookies.filter(c => c.cookie_type === 'crunchyroll').length;
            } catch (err) {
                console.error('Stats error:', err);
            }
        }
        
        // Copy single cookie
        async function copyCookie(index) {
            const cookie = allCookies[index];
            try {
                await navigator.clipboard.writeText(cookie.data);
                log(`Copied cookie #${index + 1}!`, 'success');
            } catch (err) {
                // Fallback
                const textarea = document.createElement('textarea');
                textarea.value = cookie.data;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                log(`Copied cookie #${index + 1}!`, 'success');
            }
        }
        
        // Copy all cookies
        async function copyAllCookies() {
            if (!allCookies || allCookies.length === 0) {
                alert('No cookies to copy!');
                return;
            }
            
            const allText = allCookies.map((c, i) => 
                `### ${typeEmojis[c.cookie_type]} ${c.cookie_type.toUpperCase()} #${i+1} ###\n${c.data}`
            ).join('\n\n---\n\n');
            
            try {
                await navigator.clipboard.writeText(allText);
                log(`Copied ${allCookies.length} cookies to clipboard!`, 'success');
                alert(`[OK] Copied ${allCookies.length} cookies!`);
            } catch (err) {
                console.error('Copy error:', err);
            }
        }
        
        // Export JSON
        function exportJSON() {
            if (!allCookies || allCookies.length === 0) {
                alert('No cookies to export!');
                return;
            }
            
            const data = {
                export_time: new Date().toISOString(),
                total: allCookies.length,
                cookies: allCookies
            };
            
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cookies-${Date.now()}.json`;
            a.click();
            log('Exported to JSON!', 'success');
        }
        
        // Clear all
        async function clearAll() {
            if (!confirm('Clear ALL cookies?')) return;
            
            try {
                await fetch('/api/cookies', { method: 'DELETE' });
                allCookies = [];
                renderCookies();
                updateStats();
                log('Cleared all cookies!', 'info');
            } catch (err) {
                console.error('Clear error:', err);
            }
        }
        
        // Log helper
        function log(msg, type = 'info') {
            const area = document.getElementById('log-area');
            const entry = document.createElement('div');
            entry.className = `log-entry log-${type}`;
            entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
            area.appendChild(entry);
            area.scrollTop = area.scrollHeight;
        }
        
        // Escape HTML
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
            updateStats();
            // Check authentication status first
            checkAuthStatus();
        });
    </script>
</body>
</html>'''


# ============== MAIN ENTRY POINT ==============
if __name__ == "__main__":
    print("""
╔══════════════════════════════════════════════════╗
║                                                  ║
║   🎬 Universal Cookie Collector v2.0             ║
║   Deploy to Render.com                          ║
║   Access from ANY browser!                      ║
║                                                  ║
╚══════════════════════════════════════════════════╝
""")
    
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
