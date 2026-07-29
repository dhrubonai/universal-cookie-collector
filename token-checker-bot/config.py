"""
Token Generator & Checker Bot - Configuration
================================================
Educational tool demonstrating URL token generation and validation.
For learning purposes only.
"""

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# ============== BOT TOKENS & IDS ==============
BOT_TOKEN = os.getenv('BOT_TOKEN', 'YOUR_BOT_TOKEN_HERE')
ADMIN_IDS = [int(x) for x in os.getenv('ADMIN_IDS', 'YOUR_ADMIN_ID').split(',')] if os.getenv('ADMIN_IDS') else []

# ============== URL PATTERNS ==============
# Base URL pattern for Google-style service activation links
BASE_URL_PATTERN = "https://serviceactivation.google.com/subscription/new/"

# Alternative patterns for educational testing
TEST_PATTERNS = {
    'google_service': "https://serviceactivation.google.com/subscription/new/",
    'example_test': "https://example.com/test/token/",
    'demo_pattern': "https://demo.api.example.com/activate/"
}

# ============== TOKEN GENERATION SETTINGS ==============
TOKEN_LENGTH_BYTES = 64  # Length of random bytes before base64 encoding
USE_URL_SAFE_BASE64 = True  # Use URL-safe base64 (with - and _ instead of + and /)

# ============== CHECKING SETTINGS ==============
MAX_CONCURRENT_CHECKS = 10  # Maximum simultaneous URL checks
CHECK_TIMEOUT_SECONDS = 10  # Timeout for each URL check
VALID_STATUS_CODES = [200, 201, 202, 203, 204, 301, 302, 303, 307, 308]  # Considered "working"

# Rate limiting for users
USER_CHECK_LIMIT_PER_HOUR = 100  # Max checks per user per hour
ADMIN_CHECK_LIMIT_PER_HOUR = 1000  # Higher limit for admins

# Batch processing settings
DEFAULT_BATCH_SIZE = 100  # Default number of tokens to generate
MAX_BATCH_SIZE = 10000  # Maximum batch size per request
PREMIUM_BATCH_SIZE = 1000000  # For "1 million" requests (will queue)

# ============== DATABASE CONFIGURATION ==============
DATABASE_PATH = os.getenv('DB_PATH', 'token_checker.db')

# ============== MESSAGE TEMPLATES ==============
MESSAGES = {
    'welcome': """
🔐 **Token Generator & Checker Bot**

Educational tool for understanding URL token systems.

📋 **Features:**
• Generate random tokens (base64 encoded)
• Check if URLs are valid/working
• Batch processing support
• Statistics tracking

⚠️ **For Educational Purposes Only**

Use the buttons below to get started!
    """,
    
    'admin_panel': """
⚙️ **Admin Panel**

👤 Admin: `{admin_name}`

**Quick Stats:**
• Total Checks: `{total_checks:,}`
• Working URLs Found: `{working_count:,}`
• Failed Checks: `{failed_count:,}`
• Active Users: `{active_users}`

**Commands:**
/generate - Generate tokens
/check - Check specific URL
/batch - Start batch job
/stats - View detailed stats
/settings - Configure settings
    """,
    
    'generating': """
⚙️ **Generating Tokens...**

📊 Configuration:
• Count: `{count:,}` tokens
• Pattern: `{pattern}`
• Token length: `{length}` bytes

⏳ Processing... Please wait!
    """,
    
    'batch_complete': """
✅ **Batch Complete!**

📊 **Results:**
• Generated: `{total:,}` tokens
• Working: `{working:,}` ✅
• Failed: `{failed:,}` ❌
• Error: `{error:,}` ⚠️

⏱️ Time taken: `{time:.2f}` seconds

{working_links_section}
    """,
    
    'single_check_result': """
🔍 **Check Result**

URL: `{url}`
Status: `{status}`
Response Time: `{time:.2f}s`
{details}
    """,
    
    'rate_limited': """
⏳ **Rate Limit Reached!**

You've made `{current}/{limit}` checks this hour.

Please wait or contact admin for increased limits.

⏰ Resets in: `{reset_time} minutes`
    """
}

# Token generation methods
GENERATION_METHODS = {
    'random_base64': {
        'name': 'Random Base64',
        'description': 'Purely random base64-encoded bytes'
    },
    'google_style': {
        'name': 'Google-Style',
        'description': 'Mimics Google service activation token format'
    },
    'custom_pattern': {
        'name': 'Custom Pattern',
        'description': 'User-defined character set and format'
    }
}
