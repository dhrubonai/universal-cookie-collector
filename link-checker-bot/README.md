# 🔗 Link Checker Bot - High-Performance URL Generator & Checker

A **production-grade** Telegram bot that generates and checks URLs at lightning speed using async Python. Capable of checking **millions of URLs** with real-time progress tracking!

## ⚡ Features

### 🚀 **Performance**
- **100+ concurrent HTTP requests** (asyncio + aiohttp)
- **Up to 10 million URLs per run**
- **Real-time progress updates**
- **Auto-save working URLs**

### 🎯 **Functionality**
- Generates random base64url tokens matching Google service activation pattern
- Checks each URL for validity (HTTP status + content validation)
- Saves working URLs to database and file
- Telegram interface with live statistics

### 📊 **Statistics**
- Total checked/working/failed counts
- Success rate percentage
- Speed (URLs per second)
- Elapsed time tracking
- Daily/historical stats

## 🚀 Quick Start

### 1. Get Bot Token
1. Open Telegram → @BotFather
2. Send `/newbot`
3. Name it "Link Checker" or similar
4. Copy the token

### 2. Deploy to Render (Free)

#### Option A: GitHub Push (Recommended)
```bash
cd link-checker-bot
git init
git add .
git commit -m "Link Checker Bot"
# Push to GitHub, then deploy on Render
```

1. Go to [render.com](https://render.com)
2. New → Web Service
3. Connect GitHub repo
4. Configure:
   - Runtime: Python
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `python main.py`
5. Add environment variables:
   ```
   BOT_TOKEN=your_token_here
   ADMIN_IDS=your_telegram_id
   WEBHOOK_URL=https://your-app.onrender.com
   PORT=8443
   ```
6. Deploy! ✅

#### Option B: Direct Upload
1. Zip all files
2. Go to Render Dashboard
3. Create new service
4. Upload zip file
5. Set env vars as above

### 3. Start Using!
Once deployed:

```
/start          → Open main menu
/check 1000     → Check 1,000 URLs
/check 1000000  → Check 1 MILLION URLs!
/status         → View live progress
/results        → See found working URLs
/download       → Get full results file
/stats          → View statistics
```

## 📁 Project Structure

```
link-checker-bot/
├── main.py           # Main bot application (async, high-performance)
├── database.py       # SQLite database layer
├── config.py         # Configuration & settings
├── requirements.txt  # Dependencies
├── Dockerfile        # Docker support
├── render.yaml       # Render deployment config
├── .env.example      # Environment template
├── README.md         # This file
└── results.txt       # Output file (auto-generated)
```

## 🎮 Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/start` | Main menu | `/start` |
| `/check [count]` | Start checking URLs | `/check 1000000` |
| `/status` | View progress | `/status` |
| `/results` | View working URLs | `/results` |
| `/download` | Get results file | `/download` |
| `/stats` | Statistics | `/stats` |
| `/admin` | Admin panel | `/admin` |

## 🔧 Configuration

Edit `config.py` to customize:

```python
# URL Generation
BASE_URL = "https://serviceactivation.google.com/subscription/new/"
TOKEN_LENGTH = 256  # Token size in bytes

# Performance
CONCURRENT_REQUESTS = 100  # Simultaneous checks
REQUEST_TIMEOUT = 10  # Seconds per request
DEFAULT_COUNT = 1000  # Default URLs per check
MAX_COUNT_PER_RUN = 10000000  # Max 10M per run

# Validation
VALID_STATUS_CODES = [200]  # What counts as "working"
VALIDATION_KEYWORDS = ['subscription', 'activation', 'google', 'service']
```

## 📊 How It Works

```
User sends /check 1000000
           ↓
    Generate 1M random tokens
    (base64url encoded, 256 bytes each)
           ↓
    Construct full URLs:
    https://serviceactivation.google.com/subscription/new/{token}
           ↓
    Async HTTP requests (100 concurrent):
    ┌─────────────────┐
    │ Request 1      │ → Working ✅
    │ Request 2      │ → Failed ❌
    │ Request 3      │ → Working ✅
    │ ...             │
    │ Request 100    │ → Failed ❌
    └─────────────────┘
           ↓
    Save working URLs to DB + file
           ↓
    Report results to user:
    ✅ 15 working URLs found!
    📥 Download results
```

## 🌐 Deployment Options

### Render.com (Free Tier) ✅
- **Works even though it sleeps!** 
- Uses webhook mode instead of polling
- Auto-restarts when accessed
- Free tier available

### Other Platforms:
- **Railway** - Good free tier
- **Fly.io** - VM-based
- **Koyeb** - Docker support
- **justrunmy.app** - Built for bots (24/7)

## 💾 Results Format

Working URLs are saved to `results.txt`:
```
https://serviceactivation.google.com/subscription/new/AQCpiIFlyE476c...
https://serviceactivation.google.com/subscription/new/BxRm29sKl...
...
```

Also accessible via:
- `/download` command in bot
- Database queries
- Telegram document send

## ⚙️ Technical Details

### Performance Optimization
- **AsyncIO**: Non-blocking I/O
- **aiohttp**: Fast async HTTP client
- **Semaphore**: Concurrency control (100 parallel)
- **Batch processing**: Memory-efficient (10K batches)
- **Connection pooling**: Reuse HTTP connections

### Token Generation
- Uses `secrets.token_bytes()` for cryptographic randomness
- Base64URL encoding (URL-safe)
- Configurable length (default 256 bytes)
- Unique tokens every time

### Validation Logic
1. HTTP status code must be in VALID_STATUS_CODES (default: 200)
2. Page content must contain validation keywords
3. Response time recorded for analysis
4. Errors logged for debugging

## 🔒 Safety Features

- **Max count limit**: Prevents abuse (10M max)
- **Rate limiting**: Built-in cooldowns
- **Error handling**: Graceful failure recovery
- **Stop functionality**: Users can cancel long runs
- **Admin controls**: Broadcast, clear, stop all

## 📈 Scaling

| Count | Estimated Time* | Memory Usage |
|-------|------------------|--------------|
| 1,000 | ~30 seconds | ~50MB |
| 10,000 | ~5 minutes | ~100MB |
| 100,000 | ~45 minutes | ~250MB |
| 1,000,000 | ~7 hours | ~1GB |
| 10,000,000 | ~70 hours | ~5GB |

*Times vary based on network speed and server response times.

## 🐛 Troubleshooting

### Bot not responding?
- Check BOT_TOKEN is correct
- Verify webhook URL is set (for Render)
- Check logs on Render dashboard

### No working URLs found?
- Try increasing count
- Adjust VALIDATION_KEYWORDS in config.py
- Check if target server is blocking requests

### Memory issues?
- Reduce CONCURRENT_REQUESTS
- Use smaller batch sizes
- Clear old results with /clear (admin)

### Render sleeping?
- Webhook mode handles this automatically
- Bot restarts when message received
- No data lost (saved to SQLite)

## 📝 License

Educational/Research purposes only.

## 🤝 Support

For issues or questions, contact admin via Telegram.

---

**Built with ⚡ using asyncio + aiohttp + python-telegram-bot**
