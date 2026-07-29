"""
Netflix Cookie Bot - Configuration
====================================
Professional-grade configuration management for production deployment.
"""

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# ============== BOT TOKENS & IDS ==============
BOT_TOKEN = os.getenv('BOT_TOKEN', 'YOUR_BOT_TOKEN_HERE')
ADMIN_IDS = [int(x) for x in os.getenv('ADMIN_IDS', 'YOUR_ADMIN_ID').split(',')] if os.getenv('ADMIN_IDS') else []

# ============== CHANNEL/GROUP REQUIREMENTS ==============
REQUIRED_CHANNEL_USERNAME = os.getenv('REQUIRED_CHANNEL', '@YourChannelName')  # Without @ is also fine
REQUIRED_CHANNEL_ID = int(os.getenv('CHANNEL_ID', '0'))  # Numeric channel ID

# ============== RATE LIMITING CONFIGURATION ==============
COOLDOWN_MINUTES = 10  # Cooldown between cookie requests
MAX_DAILY_COOKIES = 5  # Max cookies per user per day
RAPID_REQUEST_THRESHOLD = 3  # Number of rapid requests before ban
RAPID_REQUEST_WINDOW_SECONDS = 30  # Time window to detect rapid requests

# ============== COOKIE SETTINGS ==============
COOKIE_EXPIRY_HOURS = 24  # How long until a cookie is considered expired
MARK_USED_AFTER_CLAIM = True  # Mark cookies as used after first claim

# ============== SCREENSHOT VERIFICATION ==============
REQUIRE_SCREENSHOT = True  # Require screenshot for status reports
SCREENSHOT_TIMEOUT_MINUTES = 10  # Time to submit screenshot after claiming

# ============== BAN CONFIGURATION ==============
BAN_DURATION_DAYS = 7  # Default ban duration for violations
AUTO_BAN_RAPID_REQUESTS = True  # Auto-ban for rapid requests
AUTO_BAN_FAKE_SCREENSHOTS = True  # Auto-ban for fake screenshots

# ============== DATABASE CONFIGURATION ==============
DATABASE_PATH = os.getenv('DB_PATH', 'netflix_cookies.db')

# ============== MESSAGE TEMPLATES ==============
MESSAGES = {
    'welcome': """
🎬 **Welcome to Netflix Cookie Bot!**

Get fresh Netflix cookies instantly!

📋 **Rules:**
• Join our channel to use this bot
• Max {max_daily} cookies per day
• {cooldown} min cooldown between requests
• Report if cookie works or not
• Submit screenshot as proof

⚠️ Violation = Permanent Ban!
    """,
    
    'not_joined': """
❌ **Access Denied!**

You must join our channel first to use this bot.

👇 Click below to join:
    """,
    
    'banned': """
🚫 **You are BANNED!**

Reason: `{reason}`
Ban Expires: `{expires}`

Contact admin if you think this is a mistake.
    """,
    
    'cooldown': """
⏳ **Slow Down!**

Please wait `{remaining}` minutes before requesting another cookie.

Cooldown: {cooldown} minutes
    """,
    
    'daily_limit': """
📊 **Daily Limit Reached!**

You've claimed `{claimed}/{max}` cookies today.

Come back tomorrow for more! 🎬
    """,
    
    'select_device': """
📱 **Select Your Device:**

Choose the device type you want cookies for:
    """,
    
    'cookie_received': """
✅ **Cookie Received!**

📺 Device: `{device}`
🔗 **Click link below to open:**
`{cookie_link}`

⏰ You have `{timeout}` minutes to:
1️⃣ Test the cookie
2️⃣ Submit your screenshot
3️⃣ Report working/not working

**Buttons:**
✅ Working
❌ Not Working
📸 Submit Screenshot
    """,
    
    'status_reported': """
📝 **Status Recorded!**

Cookie ID: `{cookie_id}`
Your Report: `{status}`
{Screenshot: `{screenshot_url}`}

Thank you for your feedback! 🎉
    """,
    
    'admin_panel': """
⚙️ **Admin Panel**

👤 Admin: `{admin_name}`
📊 Stats:
• Total Users: `{total_users}`
• Total Cookies: `{total_cookies}`
• Available: `{available}`
• Used Today: `{used_today}`
• Banned Users: `{banned}`

**Commands:**
/upload - Upload JSON cookies
/stats - View detailed stats
/bans - Manage bans
/broadcast - Send message to users
    """,
    
    'upload_success': """
✅ **Upload Successful!**

Cookies Added: `{added}`
Duplicates Skipped: `{skipped}`
Invalid Entries: `{invalid}`

Total Available: `{total}`
    """
}

# Device types mapping
DEVICE_TYPES = {
    'mobile': {
        'emoji': '📱',
        'name': 'Mobile',
        'description': 'For Android/iOS browsers'
    },
    'pc': {
        'emoji': '💻',
        'name': 'PC',
        'description': 'For Windows/Mac browsers'
    },
    'tv': {
        'emoji': '📺',
        'name': 'TV',
        'description': 'For Smart TV browsers'
    }
}

# Status types
STATUS_TYPES = {
    'working': {'emoji': '✅', 'color': 'green'},
    'not_working': {'emoji': '❌', 'color': 'red'},
    'pending': {'emoji': '⏳', 'color': 'yellow'}
}
