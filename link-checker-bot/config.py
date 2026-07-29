"""
Link Checker Bot - Configuration
==================================
Production configuration for URL generation and checking.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ============== BOT TOKENS ==============
BOT_TOKEN = os.getenv('BOT_TOKEN', 'YOUR_BOT_TOKEN_HERE')
ADMIN_IDS = [int(x) for x in os.getenv('ADMIN_IDS', 'YOUR_ADMIN_ID').split(',') if x] if os.getenv('ADMIN_IDS') else []

# ============== URL CONFIGURATION ==============
BASE_URL = "https://serviceactivation.google.com/subscription/new/"
TOKEN_LENGTH = 256  # Length of the token in bytes before encoding
TOKEN_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_="

# ============== CHECKING CONFIGURATION ==============
DEFAULT_COUNT = 1000  # Default number of URLs to generate/check
MAX_COUNT_PER_RUN = 10000000  # Max 10 million per run (safety limit)
CONCURRENT_REQUESTS = 100  # Number of simultaneous HTTP requests
REQUEST_TIMEOUT = 10  # Seconds to wait for response
RETRY_COUNT = 2  # Times to retry failed requests

# ============== RATE LIMITING ==============
CHECKS_PER_MINUTE = 500  # Rate limit for URL checks
COOLDOWN_SECONDS = 60  # Cooldown between runs for non-admins

# ============== VALIDATION CRITERIA ==============
VALID_STATUS_CODES = [200]  # HTTP status codes that mean "working"
VALIDATION_KEYWORDS = [
    'subscription',
    'activation',
    'google',
    'service'
]  # Keywords that should appear in valid pages

# ============== STORAGE ==============
RESULTS_FILE = "results.txt"  # File to save working URLs
DATABASE_PATH = "link_checker.db"

# ============== RENDER COMPATIBILITY ==============
# Render free tier sleeps after 15 min - use webhook mode
USE_WEBHOOK = True  # Use webhook instead of polling (better for Render)
WEBHOOK_URL = os.getenv('WEBHOOK_URL', '')  # Set on Render
PORT = int(os.getenv('PORT', 8443))

# ============== MESSAGE TEMPLATES ==============
MESSAGES = {
    'welcome': """
🔗 **Link Checker Bot**

Generate & check URLs at lightning speed!

**Features:**
⚡ High-speed async checking (100+ concurrent)
📊 Real-time progress tracking
💾 Auto-save working links
🎯 Customizable count (up to 10M)

**Commands:**
/start - Start the bot
/check [count] - Start checking URLs
/status - View current progress
/results - Get working links
/stats - View statistics
/admin - Admin panel (admins only)

**Example:**
`/check 10000` - Check 10,000 URLs
    """,
    
    'checking': """
🚀 **Starting Link Check!**

📊 **Configuration:**
• Count: `{count:,}` URLs
• Concurrency: `{concurrent}` requests
• Timeout: `{timeout}s` per request

⏳ Generating and checking URLs...
Progress will update automatically!
    """,
    
    'progress': """
📊 **Live Progress**

✅ Checked: `{checked:,}`
⏳ Remaining: `{remaining:,}`
🎯 Working: `{working:,}`
❌ Failed: `{failed:,}`
📈 Success Rate: `{rate:.2f}%`

⏱️ Elapsed: `{elapsed}`
⚡ Speed: `{speed:,} URLs/sec`
    """,
    
    'complete': """
✅ **Check Complete!**

📊 **Final Results:**
• Total Checked: `{total:,}`
• ✅ Working: `{working:,}`
• ❌ Failed: `{failed:,}`
• 📈 Success Rate: `{rate:.2f}%`
• ⏱️ Total Time: `{time}`

💾 Results saved to file!
Send /results to get the list.
    """,
    
    'results': """
💾 **Working Links Found**

Total: `{count:,}` working URLs

**Latest {show_count}:**
{links}

*Use /download for full list*
    """,
    
    'admin_panel': """
⚙️ **Admin Panel**

👤 Admin: `{name}`

**Quick Stats:**
• Total Checks: `{total:,}`
• Total Found: `{found:,}`
• Active Sessions: `{sessions}`

**Admin Commands:**
/stop - Stop current check
/clear - Clear results
/broadcast - Send message
/settings - Configure bot
    """
}
