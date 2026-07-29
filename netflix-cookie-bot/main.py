"""
Netflix Cookie Bot - Main Application
=======================================
Professional-grade Telegram bot for Netflix cookie distribution.
Features:
- Channel join verification
- Device-specific cookie distribution (Mobile/PC/TV)
- Rate limiting & anti-abuse system
- Screenshot verification
- Admin panel with JSON upload
- 24/7 ready for free hosting
"""

import asyncio
import json
import os
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any

from telegram import (
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    ForceReply,
    BotCommand
)
from telegram.ext import (
    Application,
    CommandHandler,
    CallbackQueryHandler,
    MessageHandler,
    ConversationHandler,
    filters,
    ContextTypes,
)

# Import local modules
from config import (
    BOT_TOKEN,
    ADMIN_IDS,
    REQUIRED_CHANNEL_USERNAME,
    REQUIRED_CHANNEL_ID,
    COOLDOWN_MINUTES,
    MAX_DAILY_COOKIES,
    RAPID_REQUEST_THRESHOLD,
    RAPID_REQUEST_WINDOW_SECONDS,
    DEVICE_TYPES,
    STATUS_TYPES,
    MESSAGES,
    REQUIRE_SCREENSHOT,
    BAN_DURATION_DAYS,
    AUTO_BAN_RAPID_REQUESTS,
    AUTO_BAN_FAKE_SCREENSHOTS
)
from database import db

# Configure logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Conversation states
(
    SELECTING_DEVICE,
    AWAITING_SCREENSHOT,
    UPLOADING_COOKIES,
    BROADCASTING_MESSAGE,
) = range(4)


class NetflixCookieBot:
    """Main bot class with all business logic."""
    
    def __init__(self):
        self.application = None
    
    async def initialize(self):
        """Initialize and configure the bot application."""
        # Build application
        self.application = Application.builder().token(BOT_TOKEN).build()
        
        # Add handlers
        self._register_handlers()
        
        # Set bot commands
        await self._set_commands()
        
        logger.info("Bot initialized successfully!")
    
    def _register_handlers(self):
        """Register all command and message handlers."""
        # User commands
        self.application.add_handler(CommandHandler("start", self.cmd_start))
        self.application.add_handler(CommandHandler("help", self.cmd_help))
        self.application.add_handler(CommandHandler("rules", self.cmd_rules))
        self.application.add_handler(CommandHandler("status", self.cmd_status))
        
        # Admin commands
        self.application.add_handler(CommandHandler("admin", self.cmd_admin))
        self.application.add_handler(CommandHandler("upload", self.cmd_upload))
        self.application.add_handler(CommandHandler("stats", self.cmd_stats))
        self.application.add_handler(CommandHandler("bans", self.cmd_bans))
        self.application.add_handler(CommandHandler("broadcast", self.cmd_broadcast))
        self.application.add_handler(CommandHandler("unban", self.cmd_unban))
        
        # Callback query handler (button presses)
        self.application.add_handler(CallbackQueryHandler(self.handle_callback))
        
        # Message handler for file uploads and text
        self.application.add_handler(
            MessageHandler(filters.Document.ALL, self.handle_document)
        )
    
    async def _set_commands(self):
        """Set bot commands menu."""
        commands = [
            BotCommand("start", "Start using the bot"),
            BotCommand("help", "Show help information"),
            BotCommand("rules", "View bot rules"),
            BotCommand("status", "Check your status"),
            BotCommand("admin", "Admin panel (admins only)"),
        ]
        await self.application.bot.set_my_commands(commands)
    
    # ==================== USER COMMANDS ====================
    
    async def cmd_start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /start command."""
        user = update.effective_user
        
        # Create/update user in database
        user_data = {
            'telegram_id': user.id,
            'username': user.username,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'is_admin': user.id in ADMIN_IDS
        }
        
        db_user_id = db.create_or_update_user(user_data)
        context.user_data['db_user_id'] = db_user_id
        
        # Check if banned
        db_user = db.get_user_by_id(db_user_id)
        if db_user.get('is_banned'):
            await self._send_banned_message(update, db_user)
            return
        
        # Check channel join status
        is_joined = await self._check_channel_membership(update, context)
        
        if not is_joined:
            await self._send_join_required_message(update)
            return
        
        # Update join status in DB
        db.update_channel_join_status(db_user_id, True)
        
        # Send welcome message with main menu
        await self._send_welcome_message(update)
    
    async def cmd_help(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /help command."""
        help_text = """
📖 **Help & Guide**

**How to use this bot:**

1️⃣ **Start:** Send /start to begin
2️⃣ **Join Channel:** Join our required channel
3️⃣ **Generate:** Click Generate button
4️⃣ **Select Device:** Choose Mobile/PC/TV
5️⃣ **Use Cookie:** Click the link provided
6️⃣ **Report Status:** Tell us if it works

**Commands:**
• `/start` - Start/restart the bot
• `/help` - Show this help message
• `/rules` - View all rules
• `/status` - Check your account status

**Need help?** Contact @admin
        """
        await update.message.reply_text(help_text, parse_mode='Markdown')
    
    async def cmd_rules(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /rules command."""
        rules_text = """
📜 **Bot Rules**

✅ **Allowed:**
• Claim up to {max} cookies per day
• Report accurate status
• Submit valid screenshots
• Be respectful to others

❌ **Forbidden:**
• Spamming requests
• Sharing cookies externally
• Submitting fake screenshots
• Using multiple accounts
• Bypassing rate limits

⚠️ **Consequences:**
• First offense: Warning + 24h ban
• Second offense: 7 day ban
• Third offense: Permanent ban

**Questions?** Ask admin!
        """.format(max=MAX_DAILY_COOKIES)
        
        await update.message.reply_text(rules_text, parse_mode='Markdown')
    
    async def cmd_status(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /status command - show user's current status."""
        user = update.effective_user
        db_user = db.get_user(user.id)
        
        if not db_user:
            await update.message.reply_text("❌ Please start the bot first with /start")
            return
        
        # Get user stats
        user_stats = db.get_user_stats(db_user['id'])
        
        # Calculate cooldown remaining
        cooldown_remaining = 0
        if db_user.get('last_claim_time'):
            last_claim = datetime.fromisoformat(db_user['last_claim_time'])
            next_allowed = last_claim + timedelta(minutes=COOLDOWN_MINUTES)
            if datetime.now() < next_allowed:
                cooldown_remaining = int((next_allowed - datetime.now()).total_seconds() / 60)
        
        # Format status message
        status_text = f"""
👤 **Your Status**

🆔 User ID: `{user.id}`
📊 Cookies Today: `{db_user.get('cookies_claimed_today', 0)}/{MAX_DAILY_COOKIES}`
📈 Total Claims: `{user_stats.get('total_claims', 0)}`
📝 Reports Submitted: `{user_stats.get('reports_submitted', 0)}`
{'⏳ Cooldown: `' + str(cooldown_remaining) + ' minutes`' if cooldown_remaining > 0 else '✅ Ready to claim!'}
📺 Channel Joined: {'✅ Yes' if db_user.get('joined_channel') else '❌ No'}
🚫 Banned: {'Yes' if db_user.get('is_banned') else 'No'}
        """
        
        await update.message.reply_text(status_text, parse_mode='Markdown')
    
    # ==================== ADMIN COMMANDS ====================
    
    async def cmd_admin(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /admin command - admin panel."""
        user = update.effective_user
        
        if user.id not in ADMIN_IDS:
            await update.message.reply_text("❌ You don't have admin access!")
            return
        
        # Get statistics
        stats = db.get_stats()
        
        keyboard = [
            [InlineKeyboardButton("📤 Upload Cookies", callback_data="admin_upload")],
            [InlineKeyboardButton("📊 Statistics", callback_data="admin_stats")],
            [InlineKeyboardButton("🚫 Manage Bans", callback_data="admin_bans")],
            [InlineKeyboardButton("📢 Broadcast", callback_data="admin_broadcast")],
            [InlineKeyboardButton("🔄 Refresh", callback_data="admin_refresh")]
        ]
        
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        admin_text = f"""
⚙️ **Admin Panel**

👤 Welcome, {user.first_name}!

**Quick Stats:**
• Total Users: `{stats['total_users']:,}`
• Active Cookies: `{stats['available_cookies']:,}`
• Used Today: `{stats['claims_today']:,}`
• Banned Users: `{stats['banned_users']:,}`

Select an option below 👇
        """
        
        await update.message.reply_text(admin_text, reply_markup=reply_markup, parse_mode='Markdown')
    
    async def cmd_upload(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /upload command - start cookie upload process."""
        user = update.effective_user
        
        if user.id not in ADMIN_IDS:
            await update.message.reply_text("❌ Admin access required!")
            return
        
        instructions = """
📤 **Upload Cookies**

Please send a **JSON file** with cookies in this format:

```json
[
  {
    "data": {"cookie_string": "..."},
    "device": "mobile",
    "link": "https://..."
  },
  {
    "data": {"cookie_string": "..."},
    "device": "pc",
    "link": "https://..."
  }
]
```

**Device types:** `mobile`, `pc`, `tv`

Or just paste JSON directly as text message.
        """
        
        await update.message.reply_text(instructions, parse_mode='Markdown')
        context.user_data['awaiting_upload'] = True
    
    async def cmd_stats(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /stats command - detailed statistics."""
        user = update.effective_user
        
        if user.id not in ADMIN_IDS:
            await update.message.reply_text("❌ Admin access required!")
            return
        
        stats = db.get_stats()
        
        stats_text = f"""
📊 **Detailed Statistics**

**Users:**
• Total Users: `{stats['total_users']:,}`
• Channel Members: `{stats['channel_members']:,}`
• Banned Users: `{stats['banned_users']:,}`

**Cookies:**
• Total Uploaded: `{stats['total_cookies']:,}`
• Available: `{stats['available_cookies']:,}`
• Used: `{stats['used_cookies']:,}`
• Working: `{stats['working_cookies']:,}`
• Not Working: `{stats['not_working_cookies']:,}`

**Today's Activity:**
• Claims Today: `{stats['claims_today']:,}`

**By Device:**
• 📱 Mobile Available: `{stats.get('mobile_available', 0):,}`
• 💻 PC Available: `{stats.get('pc_available', 0):,}`
• 📺 TV Available: `{stats.get('tv_available', 0):,}`
        """
        
        await update.message.reply_text(stats_text, parse_mode='Markdown')
    
    async def cmd_bans(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /bans command - manage bans."""
        user = update.effective_user
        
        if user.id not in ADMIN_IDS:
            await update.message.reply_text("❌ Admin access required!")
            return
        
        banned_users = db.get_banned_users()
        
        if not banned_users:
            await update.message.reply_text("✅ No banned users!")
            return
        
        text = "🚫 **Banned Users**\n\n"
        for bu in banned_users[:10]:  # Show first 10
            ban_until = bu.get('ban_until', 'Permanent')
            text += f"• `{bu.get('telegram_id')}` - {bu.get('ban_reason', 'No reason')}\n"
            text += f"  Until: `{ban_until}`\n\n"
        
        if len(banned_users) > 10:
            text += f"...and {len(banned_users) - 10} more"
        
        keyboard = [[InlineKeyboardButton("Unban User", callback_data="admin_unban_menu")]]
        
        await update.message.reply_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
    
    async def cmd_broadcast(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /broadcast command - broadcast message to all users."""
        user = update.effective_user
        
        if user.id not in ADMIN_IDS:
            await update.message.reply_text("❌ Admin access required!")
            return
        
        await update.message.reply_text(
            "📢 **Broadcast Mode**\n\nSend the message you want to broadcast to all users.",
            parse_mode='Markdown'
        )
        context.user_data['awaiting_broadcast'] = True
    
    async def cmd_unban(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /unban command."""
        user = update.effective_user
        
        if user.id not in ADMIN_IDS:
            await update.message.reply_text("❌ Admin access required!")
            return
        
        if not context.args:
            await update.message.reply_text("Usage: /unban <user_id>")
            return
        
        try:
            target_user_id = int(context.args[0])
            db.set_ban_status(target_user_id, False, "Unbanned by admin")
            await update.message.reply_text(f"✅ User {target_user_id} has been unbanned!")
        except ValueError:
            await update.message.reply_text("❌ Invalid user ID!")
    
    # ==================== CALLBACK HANDLERS ====================
    
    async def handle_callback(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle inline button presses."""
        query = update.callback_query
        await query.answer()
        
        data = query.data
        
        # Handle different callback types
        if data.startswith('join_check'):
            await self._callback_join_check(update, context)
        elif data.startswith('generate_'):
            await self._callback_generate(update, context, data)
        elif data.startswith('device_'):
            await self._callback_device_select(update, context, data)
        elif data.startswith('status_'):
            await self._callback_status_report(update, context, data)
        elif data.startswith('screenshot_'):
            await self._callback_screenshot(update, context, data)
        elif data.startswith('admin_'):
            await self._callback_admin(update, context, data)
    
    async def _callback_join_check(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle join check button press."""
        is_joined = await self._check_channel_membership(update, context)
        
        if is_joined:
            user = update.effective_user
            db_user = db.get_user(user.id)
            if db_user:
                db.update_channel_join_status(db_user['id'], True)
            
            await query.edit_message_text("✅ **Verified!** You can now use the bot.\n\nClick /start to begin!", parse_mode='Markdown')
        else:
            await query.answer("❌ You haven't joined yet!", show_alert=True)
    
    async def _callback_generate(self, update: Update, context: ContextTypes.DEFAULT_TYPE, data: str):
        """Handle generate button press."""
        user = update.effective_user
        db_user = db.get_user(user.id)
        
        if not db_user or db_user.get('is_banned'):
            await self._send_banned_message(update, db_user)
            return
        
        # Check channel membership
        is_joined = await self._check_channel_membership(update, context)
        if not is_joined:
            await self._send_join_required_message(update)
            return
        
        # Check cooldown
        if db_user.get('last_claim_time'):
            last_claim = datetime.fromisoformat(db_user['last_claim_time'])
            next_allowed = last_claim + timedelta(minutes=COOLDOWN_MINUTES)
            if datetime.now() < next_allowed:
                remaining = int((next_allowed - datetime.now()).total_seconds() / 60)
                await query.answer(f"⏳ Wait {remaining} minutes!", show_alert=True)
                return
        
        # Check daily limit
        if db_user.get('cookies_claimed_today', 0) >= MAX_DAILY_COOKIES:
            await query.answer(f"📊 Daily limit reached!", show_alert=True)
            return
        
        # Check for rapid requests (anti-abuse)
        recent_requests = db.get_recent_requests(db_user['id'], RAPID_REQUEST_WINDOW_SECONDS)
        if len(recent_requests) >= RAPID_REQUEST_THRESHOLD:
            # Auto-ban for rapid requests
            if AUTO_BAN_RAPID_REQUESTS:
                db.set_ban_status(
                    db_user['id'], 
                    True, 
                    f"Rapid requests ({RAPID_REQUEST_THRESHOLD} in {RAPID_REQUEST_WINDOW_SECONDS}s)",
                    BAN_DURATION_DAYS
                )
                await query.answer("🚫 Banned for rapid spamming!", show_alert=True)
                return
        
        # Log this request
        db.log_request(db_user['id'])
        
        # Show device selection keyboard
        keyboard = [
            [
                InlineKeyboardButton(f"📱 Mobile ({self._get_available_count('mobile')})", 
                                    callback_data="device_mobile"),
                InlineKeyboardButton(f"💻 PC ({self._get_available_count('pc')})", 
                                    callback_data="device_pc")
            ],
            [
                InlineKeyboardButton(f"📺 TV ({self._get_available_count('tv')})", 
                                    callback_data="device_tv")
            ]
        ]
        
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        try:
            await query.edit_message_text(
                MESSAGES['select_device'],
                reply_markup=reply_markup,
                parse_mode='Markdown'
            )
        except Exception:
            pass  # Message might be same
    
    async def _callback_device_select(self, update: Update, context: ContextTypes.DEFAULT_TYPE, data: str):
        """Handle device selection."""
        device_type = data.replace('device_', '')
        user = update.effective_user
        db_user = db.get_user(user.id)
        
        if not db_user:
            await query.answer("❌ Error! Try /start again", show_alert=True)
            return
        
        # Get available cookie for this device
        cookie = db.get_available_cookie(device_type)
        
        if not cookie:
            await query.edit_message_text(
                f"😔 **No {DEVICE_TYPES[device_type]['name']} cookies available right now!**\n\n"
                "Try again later or select a different device.",
                parse_mode='Markdown'
            )
            return
        
        # Claim the cookie
        claimed = db.claim_cookie(cookie['id'], db_user['id'])
        
        if not claimed:
            await query.edit_message_text("❌ Error claiming cookie. Try again.")
            return
        
        # Increment daily counter
        new_count = db.increment_daily_claims(db_user['id'])
        
        # Store current cookie info for status reporting
        context.user_data['current_cookie_id'] = cookie['id']
        context.user_data['current_cookie_device'] = device_type
        
        # Parse cookie data
        try:
            cookie_data = json.loads(cookie['cookie_data']) if isinstance(cookie['cookie_data'], str) else cookie['cookie_data']
            cookie_link = cookie.get('cookie_link') or cookie_data.get('link') or cookie_data.get('url', 'N/A')
        except:
            cookie_link = cookie.get('cookie_link', 'N/A')
        
        # Create status report buttons
        keyboard = [
            [
                InlineKeyboardButton("✅ Working", callback_data=f"status_working_{cookie['id']}"),
                InlineKeyboardButton("❌ Not Working", callback_data=f"status_notworking_{cookie['id']}")
            ],
            [
                InlineKeyboardButton("📸 Submit Screenshot", callback_data=f"screenshot_{cookie['id']}"),
                InlineKeyboardButton("🔄 Get Another", callback_data="generate_new")
            ]
        ]
        
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        device_info = DEVICE_TYPES[device_type]
        message = f"""
✅ **Cookie Generated!**

📺 Device: **{device_info['emoji']} {device_info['name']}**
🆔 Cookie ID: `{cookie['id']}`
📊 Your claims today: `{new_count}/{MAX_DAILY_COOKIES}`

🔗 **Click below to open:**
{cookie_link}

⏰ **Important:**
• Test the cookie now
• Report if it works or not
• Submit screenshot as proof
• Cooldown: **{COOLDOWN_MINUTES} minutes**
        """
        
        try:
            await query.edit_message_text(message, reply_markup=reply_markup, parse_mode='Markdown')
        except Exception:
            await update.effective_message.reply_text(message, reply_markup=reply_markup, parse_mode='Markdown')
    
    async def _callback_status_report(self, update: Update, context: ContextTypes.DEFAULT_TYPE, data: str):
        """Handle working/not working status report."""
        parts = data.split('_')
        status = parts[1]
        cookie_id = int(parts[2])
        
        user = update.effective_user
        db_user = db.get_user(user.id)
        
        if not db_user:
            return
        
        # Record the status
        db.report_cookie_status(cookie_id, db_user['id'], status)
        
        status_emoji = STATUS_TYPES.get(status, {}).get('emoji', '❓')
        status_name = "Working ✅" if status == 'working' else "Not Working ❌"
        
        # If reporting not working without screenshot, warn/ban
        if status == 'not_working' and REQUIRE_SCREENSHOT:
            # Give them chance to submit screenshot
            keyboard = [[InlineKeyboardButton("📸 Upload Screenshot Now", 
                                             callback_data=f"screenshot_{cookie_id}")]]
            
            message = f"""
{status_emoji} **Status Recorded: {status_name}**

Thank you for reporting!

⚠️ **Please submit a screenshot** to avoid being flagged for fake reports.

Cookie ID: `{cookie_id}`
            """
            
            await query.edit_message_text(message, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
        else:
            message = f"""
{status_emoji} **Status Recorded: {status_name}**

Thank you for your feedback!

Cookie ID: `{cookie_id}`
Your report helps improve our service 🎉
            """
            
            await query.edit_message_text(message, parse_mode='Markdown')
    
    async def _callback_screenshot(self, update: Update, context: ContextTypes.DEFAULT_TYPE, data: str):
        """Handle screenshot button - prompt for photo upload."""
        cookie_id = int(data.split('_')[1])
        
        context.user_data['awaiting_screenshot_for'] = cookie_id
        
        keyboard = [[InlineKeyboardButton("Skip Screenshot", callback_data=f"skip_screenshot_{cookie_id}")]]
        
        message = """
📸 **Submit Screenshot**

Please send a **screenshot/photo** showing whether the cookie worked or not.

This helps us verify reports and maintain quality!
        """
        
        await query.edit_message_text(message, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
    
    async def _callback_admin(self, update: Update, context: ContextTypes.DEFAULT_TYPE, data: str):
        """Handle admin panel callbacks."""
        action = data.replace('admin_', '')
        
        if action == 'upload':
            await self.cmd_upload(update, context)
        elif action == 'stats':
            await self.cmd_stats(update, context)
        elif action == 'bans':
            await self.cmd_bans(update, context)
        elif action == 'broadcast':
            await self.cmd_broadcast(update, context)
        elif action == 'refresh':
            await self.cmd_admin(update, context)
        elif action == 'unban_menu':
            await query.message.reply_text(
                "Send `/unban <user_id>` to unban a specific user.\n\nUse /bans to see list of banned users.",
                parse_mode='Markdown'
            )
    
    # ==================== MESSAGE HANDLERS ====================
    
    async def handle_document(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle document/file uploads."""
        user = update.effective_user
        
        # Only admins can upload
        if user.id not in ADMIN_IDS:
            return
        
        # Check if we're expecting upload
        if not context.user_data.get('awaiting_upload'):
            return
        
        document = update.message.document
        
        # Accept only JSON files
        if not document.file_name.endswith('.json'):
            await update.message.reply_text("❌ Please send a `.json` file only!")
            return
        
        # Download and process file
        try:
            file = await document.get_file()
            json_content = await file.download_as_bytearray()
            cookies_data = json.loads(json_content.decode('utf-8'))
            
            # Process cookies
            db_user = db.get_user(user.id)
            stats = db.add_cookies_batch(cookies_data, db_user['id'])
            
            result_message = f"""
✅ **Upload Complete!**

📊 **Results:**
• Added: `{stats['added']}`
• Skipped (duplicates): `{stats['skipped']}`
• Invalid: `{stats['invalid']}`

Total available cookies: `{db.get_stats()['available_cookies']}`
            """
            
            await update.message.reply_text(result_message, parse_mode='Markdown')
            context.user_data['awaiting_upload'] = False
            
        except json.JSONDecodeError:
            await update.message.reply_text("❌ Invalid JSON format! Please check the file.")
        except Exception as e:
            logger.error(f"Error processing upload: {e}")
            await update.message.reply_text(f"❌ Error processing file: {str(e)}")
    
    async def handle_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle regular text messages."""
        user = update.effective_user
        text = update.message.text
        
        # Handle JSON paste for uploads
        if context.user_data.get('awaiting_upload') and user.id in ADMIN_IDS:
            try:
                cookies_data = json.loads(text)
                db_user = db.get_user(user.id)
                stats = db.add_cookies_batch(cookies_data, db_user['id'])
                
                result_message = f"""
✅ **Upload Complete!**

📊 **Results:**
• Added: `{stats['added']}`
• Skipped: `{stats['skipped']}`
• Invalid: `{stats['invalid']}`

Total available cookies: `{db.get_stats()['available_cookies']}`
                """
                
                await update.message.reply_text(result_message, parse_mode='Markdown')
                context.user_data['awaiting_upload'] = False
                
            except json.JSONDecodeError:
                await update.message.reply_text("❌ Invalid JSON! Please send valid JSON.")
            return
        
        # Handle broadcast messages
        if context.user_data.get('awaiting_broadcast') and user.id in ADMIN_IDS:
            await self._execute_broadcast(update, context, text)
            return
        
        # Handle screenshot uploads
        if context.user_data.get('awaiting_screenshot_for'):
            cookie_id = context.user_data['awaiting_screenshot_for']
            # This would handle if they sent text instead of photo
            await update.message.reply_text("📸 Please send a photo/screenshot, not text.")
            return
    
    async def handle_photo(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle photo uploads (screenshots)."""
        if not context.user_data.get('awaiting_screenshot_for'):
            return
        
        cookie_id = context.user_data['awaiting_screenshot_for']
        user = update.effective_user
        db_user = db.get_user(user.id)
        
        # Download photo
        photo = update.message.photo[-1]  # Get largest size
        file = await photo.get_file()
        
        # Save screenshot reference (in production, you'd save to cloud storage)
        screenshot_url = f"photo_{file.file_id}"
        
        # Update cookie record with screenshot
        db.report_cookie_status(cookie_id, db_user['id'], None, screenshot_url)
        
        await update.message.reply_text(
            "✅ **Screenshot received!**\n\nThank you for verifying! 🎉",
            parse_mode='Markdown'
        )
        
        context.user_data['awaiting_screenshot_for'] = None
    
    # ==================== HELPER METHODS ====================
    
    async def _check_channel_membership(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
        """Check if user is a member of required channel."""
        user = update.effective_user
        
        try:
            if REQUIRED_CHANNEL_ID:
                chat_member = await context.bot.get_chat_member(REQUIRED_CHANNEL_ID, user.id)
                status = chat_member.status
                
                # Valid statuses: member, administrator, creator
                return status in ['member', 'administrator', 'creator']
            elif REQUIRED_CHANNEL_USERNAME:
                chat_member = await context.bot.get_chat_member(REQUIRED_CHANNEL_USERNAME, user.id)
                status = chat_member.status
                return status in ['member', 'administrator', 'creator']
            else:
                return True  # No channel requirement configured
        except Exception as e:
            logger.error(f"Error checking channel membership: {e}")
            return False
    
    async def _send_welcome_message(self, update: Update):
        """Send welcome message with main menu."""
        keyboard = [
            [InlineKeyboardButton("🎬 Generate Cookie", callback_data="generate_new")],
            [InlineKeyboardButton("📊 My Status", callback_data="my_status")],
            [InlineKeyboardButton("📜 Rules", callback_data="show_rules")],
            [InlineKeyboardButton("❓ Help", callback_data="show_help")]
        ]
        
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        welcome_text = MESSAGES['welcome'].format(
            max_daily=MAX_DAILY_COOKIES,
            cooldown=COOLDOWN_MINUTES
        )
        
        if update.message:
            await update.message.reply_text(welcome_text, reply_markup=reply_markup, parse_mode='Markdown')
        else:
            await update.effective_message.reply_text(welcome_text, reply_markup=reply_markup, parse_mode='Markdown')
    
    async def _send_join_required_message(self, update: Update):
        """Send message prompting user to join channel."""
        keyboard = [
            [InlineKeyboardButton("✅ I've Joined! Check Again", callback_data="join_check")],
            [InlineKeyboardButton("📺 Open Channel", url=f"https://t.me/{REQUIRED_CHANNEL_USERNAME.lstrip('@')}")]
        ]
        
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        join_text = MESSAGES['not_joined']
        
        if update.message:
            await update.message.reply_text(join_text, reply_markup=reply_markup, parse_mode='Markdown')
        else:
            await update.effective_message.reply_text(join_text, reply_markup=reply_markup, parse_mode='Markdown')
    
    async def _send_banned_message(self, update: Update, db_user: Dict):
        """Send banned user message."""
        ban_reason = db_user.get('ban_reason', 'Unknown reason')
        ban_until = db_user.get('ban_until', 'Permanent')
        
        ban_text = MESSAGES['banned'].format(
            reason=ban_reason,
            expires=ban_until
        )
        
        if update.message:
            await update.message.reply_text(ban_text, parse_mode='Markdown')
        else:
            await update.effective_message.reply_text(ban_text, parse_mode='Markdown')
    
    def _get_available_count(self, device_type: str) -> int:
        """Get count of available cookies for device type."""
        stats = db.get_stats()
        return stats.get(f'{device_type}_available', 0)
    
    async def _execute_broadcast(self, update: Update, context: ContextTypes.DEFAULT_TYPE, message: str):
        """Execute broadcast to all users."""
        users = db.get_all_users(per_page=1000)  # Get first 1000 users
        sent_count = 0
        failed_count = 0
        
        await update.message.reply_text(f"📢 Broadcasting to {len(users)} users...")
        
        for user in users:
            try:
                await context.bot.send_message(
                    chat_id=user['telegram_id'],
                    text=f"📢 **Broadcast from Admin**\n\n{message}",
                    parse_mode='Markdown'
                )
                sent_count += 1
                await asyncio.sleep(0.05)  # Avoid rate limits
            except Exception as e:
                failed_count += 1
                logger.error(f"Failed to send to {user['telegram_id']}: {e}")
        
        result = f"""
✅ **Broadcast Complete!**

📊 **Results:**
• Sent: `{sent_count}`
• Failed: `{failed_count}`
• Total: `{len(users)}`
        """
        
        await update.message.reply_text(result, parse_mode='Markdown')
        context.user_data['awaiting_broadcast'] = False
    
    # ==================== MAINTENANCE TASKS ====================
    
    async def run_maintenance(self):
        """Run periodic maintenance tasks."""
        while True:
            try:
                # Reset daily counters
                db.reset_daily_counters()
                
                # Expire old cookies
                db.expire_old_cookies()
                
                # Cleanup expired bans
                db.cleanup_expired_bans()
                
                # Clean old rate limit records
                db.cleanup_old_requests()
                
                logger.info("Maintenance tasks completed")
                
            except Exception as e:
                logger.error(f"Maintenance error: {e}")
            
            # Run every hour
            await asyncio.sleep(3600)
    
    # ==================== MAIN RUN METHOD ====================
    
    async def run(self):
        """Start the bot."""
        await self.initialize()
        
        # Start maintenance task
        maintenance_task = asyncio.create_task(self.run_maintenance())
        
        # Start polling
        logger.info("Starting bot polling...")
        await self.application.initialize()
        await self.application.start()
        await self.application.updater.start_polling(drop_pending_updates=True)
        
        # Keep running
        logger.info("Bot is running! Press Ctrl+C to stop.")
        
        try:
            await asyncio.Event().wait()
        except (KeyboardInterrupt, SystemExit):
            pass
        finally:
            maintenance_task.cancel()
            await self.application.updater.stop()
            await self.application.stop()
            await self.application.shutdown()
            db.close()


# ==================== ENTRY POINT ====================

def main():
    """Main entry point."""
    bot = NetflixCookieBot()
    asyncio.run(bot.run())


if __name__ == '__main__':
    main()
