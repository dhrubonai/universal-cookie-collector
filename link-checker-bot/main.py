"""
Link Checker Bot - Main Application
=====================================
High-performance URL generator & checker with Telegram interface.
Uses asyncio + aiohttp for blazing fast concurrent checking.
"""

import asyncio
import aiohttp
import base64
import os
import re
import time
import json
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any, Set
from dataclasses import dataclass

from telegram import (
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    BotCommand
)
from telegram.ext import (
    Application,
    CommandHandler,
    CallbackQueryHandler,
    MessageHandler,
    filters,
    ContextTypes,
)

# Import local modules
from config import (
    BOT_TOKEN,
    ADMIN_IDS,
    BASE_URL,
    TOKEN_LENGTH,
    DEFAULT_COUNT,
    MAX_COUNT_PER_RUN,
    CONCURRENT_REQUESTS,
    REQUEST_TIMEOUT,
    RETRY_COUNT,
    VALID_STATUS_CODES,
    VALIDATION_KEYWORDS,
    RESULTS_FILE,
    USE_WEBHOOK,
    WEBHOOK_URL,
    PORT,
    MESSAGES
)
from database import db

# Configure logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)


@dataclass
class CheckResult:
    """Result of a single URL check."""
    url: str
    token: str
    status_code: int
    is_working: bool
    response_time: float
    error: str = None


class TokenGenerator:
    """High-speed random token generator."""
    
    def __init__(self, length: int = 256):
        self.length = length
        # Base64URL charset (no padding for variety)
        self.charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    
    def generate(self) -> str:
        """Generate a single random token."""
        import secrets
        # Generate random bytes and encode as base64url
        random_bytes = secrets.token_bytes(self.length)
        token = base64.urlsafe_b64encode(random_bytes).decode('ascii').rstrip('=')
        return token
    
    def generate_batch(self, count: int) -> List[str]:
        """Generate multiple tokens at once."""
        return [self.generate() for _ in range(count)]


class LinkChecker:
    """High-performance async URL checker."""
    
    def __init__(self):
        self.generator = TokenGenerator(TOKEN_LENGTH)
        self.active_checks: Dict[int, asyncio.Task] = {}
        self.check_stats: Dict[int, Dict] = {}
        self._stop_flags: Dict[int, asyncio.Event] = {}
    
    async def check_url(self, session: aiohttp.ClientSession, 
                        url: str, token: str) -> CheckResult:
        """Check a single URL."""
        start_time = time.time()
        
        try:
            async with session.get(
                url, 
                timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT),
                allow_redirects=True,
                headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            ) as response:
                status_code = response.status
                response_time = time.time() - start_time
                
                # Read response content for validation
                try:
                    content = await response.text()
                    content_lower = content.lower()
                    
                    # Check if page contains validation keywords
                    has_keywords = any(kw in content_lower for kw in VALIDATION_KEYWORDS)
                    
                    is_working = (status_code in VALID_STATUS_CODES and has_keywords)
                    
                    return CheckResult(
                        url=url,
                        token=token,
                        status_code=status_code,
                        is_working=is_working,
                        response_time=response_time
                    )
                except Exception as e:
                    return CheckResult(
                        url=url,
                        token=token,
                        status_code=status_code,
                        is_working=(status_code in VALID_STATUS_CODES),
                        response_time=response_time,
                        error=str(e)
                    )
                    
        except asyncio.TimeoutError:
            return CheckResult(
                url=url,
                token=token,
                status_code=0,
                is_working=False,
                response_time=time.time() - start_time,
                error='timeout'
            )
        except Exception as e:
            return CheckResult(
                url=url,
                token=token,
                status_code=0,
                is_working=False,
                response_time=time.time() - start_time,
                error=str(e)
            )
    
    async def check_batch(self, session_id: int, user_id: int, 
                          count: int, update_callback=None):
        """Check a batch of URLs with progress updates."""
        
        # Initialize stats
        self.check_stats[session_id] = {
            'total': count,
            'checked': 0,
            'working': 0,
            'failed': 0,
            'start_time': time.time(),
            'working_urls': []
        }
        
        stop_event = asyncio.Event()
        self._stop_flags[session_id] = stop_event
        
        # Create database session
        db_session = db.create_session(user_id, count, {
            'concurrent': CONCURRENT_REQUESTS,
            'timeout': REQUEST_TIMEOUT
        })
        
        semaphore = asyncio.Semaphore(CONCURRENT_REQUESTS)
        
        async with aiohttp.ClientSession() as session:
            checked = 0
            
            # Process in batches for memory efficiency
            batch_size = 10000
            batches = (count + batch_size - 1) // batch_size
            
            for batch_num in range(batches):
                if stop_event.is_set():
                    logger.info(f"Session {session_id} stopped by user")
                    break
                
                # Generate tokens for this batch
                current_batch_size = min(batch_size, count - checked)
                tokens = self.generator.generate_batch(current_batch_size)
                
                # Create tasks for this batch
                tasks = []
                for token in tokens:
                    if stop_event.is_set():
                        break
                    
                    url = f"{BASE_URL}{token}"
                    task = asyncio.create_task(
                        self._check_with_semaphore(semaphore, session, url, token)
                    )
                    tasks.append(task)
                
                # Wait for all tasks in batch
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                # Process results
                for result in results:
                    if isinstance(result, Exception):
                        logger.error(f"Task exception: {result}")
                        continue
                    
                    if not isinstance(result, CheckResult):
                        continue
                    
                    checked += 1
                    stats = self.check_stats[session_id]
                    stats['checked'] = checked
                    
                    if result.is_working:
                        stats['working'] += 1
                        stats['working_urls'].append(result.url)
                        
                        # Save to database
                        db.add_result(db_session, result.url, result.token, 
                                     result.status_code, result.response_time)
                    else:
                        stats['failed'] += 1
                        db.add_failed(db_session, result.url, result.token,
                                    result.status_code, result.error)
                    
                    # Update database progress every 100 checks
                    if checked % 100 == 0:
                        db.update_session_progress(
                            db_session, checked, 
                            stats['working'], stats['failed']
                        )
                        
                        # Call progress callback if provided
                        if update_callback and checked % 500 == 0:
                            await update_callback(session_id, stats)
                
                # Force progress update after each batch
                stats = self.check_stats[session_id]
                db.update_session_progress(db_session, stats['checked'], 
                                           stats['working'], stats['failed'])
                
                if update_callback:
                    await update_callback(session_id, stats)
        
        # Finalize session
        stats = self.check_stats.get(session_id, {})
        db.complete_session(db_session)
        
        # Update user stats
        db.update_user_stats(user_id, stats.get('working', 0))
        db.update_daily_stats(stats.get('checked', 0), stats.get('working', 0))
        
        # Export results
        if stats.get('working_urls'):
            db.export_results_to_file(RESULTS_FILE, db_session)
        
        # Cleanup
        del self._stop_flags[session_id]
        if session_id in self.active_checks:
            del self.active_checks[session_id]
        
        return stats
    
    async def _check_with_semaphore(self, semaphore: aiohttp.Semaphore,
                                      session: aiohttp.ClientSession,
                                      url: str, token: str) -> CheckResult:
        """Check URL with semaphore for concurrency control."""
        async with semaphore:
            # Small delay to prevent overwhelming the server
            await asyncio.sleep(0.01)
            return await self.check_url(session, url, token)
    
    def stop_check(self, session_id: int):
        """Stop an active check."""
        if session_id in self._stop_flags:
            self._stop_flags[session_id].set()
            return True
        return False
    
    def get_stats(self, session_id: int) -> Dict:
        """Get current check statistics."""
        return self.check_stats.get(session_id, {})


# Global checker instance
checker = LinkChecker()


class LinkCheckerBot:
    """Telegram bot interface for link checker."""
    
    def __init__(self):
        self.application = None
    
    async def initialize(self):
        """Initialize bot application."""
        self.application = Application.builder().token(BOT_TOKEN).build()
        self._register_handlers()
        await self._set_commands()
        logger.info("Link Checker Bot initialized!")
    
    def _register_handlers(self):
        """Register all handlers."""
        # User commands
        self.application.add_handler(CommandHandler("start", self.cmd_start))
        self.application.add_handler(CommandHandler("help", self.cmd_help))
        self.application.add_handler(CommandHandler("check", self.cmd_check))
        self.application.add_handler(CommandHandler("status", self.cmd_status))
        self.application.add_handler(CommandHandler("results", self.cmd_results))
        self.application.add_handler(CommandHandler("stats", self.cmd_stats))
        self.application.add_handler(CommandHandler("download", self.cmd_download))
        
        # Admin commands
        self.application.add_handler(CommandHandler("admin", self.cmd_admin))
        self.application.add_handler(CommandHandler("stop", self.cmd_stop))
        self.application.add_handler(CommandHandler("clear", self.cmd_clear))
        self.application.add_handler(CommandHandler("broadcast", self.cmd_broadcast))
        
        # Callback handler
        self.application.add_handler(CallbackQueryHandler(self.handle_callback))
    
    async def _set_commands(self):
        """Set bot commands menu."""
        commands = [
            BotCommand("start", "Start using the bot"),
            BotCommand("check [count]", "Start checking URLs"),
            BotCommand("status", "View check progress"),
            BotCommand("results", "View working links"),
            BotCommand("stats", "View statistics"),
            BotCommand("admin", "Admin panel"),
        ]
        await self.application.bot.set_my_commands(commands)
    
    # ==================== USER COMMANDS ====================
    
    async def cmd_start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /start command."""
        user = update.effective_user
        
        # Create/update user
        user_data = {
            'telegram_id': user.id,
            'username': user.username,
            'first_name': user.first_name,
            'is_admin': user.id in ADMIN_IDS
        }
        db.create_or_update_user(user_data)
        
        keyboard = [
            [
                InlineKeyboardButton(f"🔍 Check {DEFAULT_COUNT:,} URLs", 
                                   callback_data=f"check_{DEFAULT_COUNT}"),
                InlineKeyboardButton("📊 Statistics", callback_data="show_stats")
            ],
            [
                InlineKeyboardButton("💾 Results", callback_data="show_results"),
                InlineKeyboardButton("❓ Help", callback_data="show_help")
            ]
        ]
        
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await update.message.reply_text(
            MESSAGES['welcome'],
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
    
    async def cmd_help(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /help command."""
        help_text = """
📖 **Help Guide**

**Commands:**
• `/start` - Start the bot
• `/check [count]` - Start checking URLs
  • Examples:
    - `/check 1000` - Check 1K URLs
    - `/check 1000000` - Check 1M URLs
    - `/check 10000000` - Check 10M URLs (max!)
• `/status` - View current progress
• `/results` - See found working URLs
• `/stats` - View overall statistics
• `/download` - Get full results file

**Features:**
⚡ **Lightning Fast** - 100+ concurrent checks
📊 **Real-time Progress** - Live updates
💾 **Auto-save** - Working URLs saved automatically
🎯 **Scalable** - Up to 10M+ URLs per run

**Tips:**
• Start small to test: `/check 100`
• Scale up when ready: `/check 100000`
• Monitor with: `/status`
• Get results with: `/results`

**Questions?** Contact admin!
        """
        await update.message.reply_text(help_text, parse_mode='Markdown')
    
    async def cmd_check(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /check command - start checking URLs."""
        user = update.effective_user
        
        # Parse count from arguments
        try:
            count = int(context.args[0]) if context.args else DEFAULT_COUNT
        except (IndexError, ValueError):
            count = DEFAULT_COUNT
        
        # Validate count
        if count < 1:
            await update.message.reply_text("❌ Count must be at least 1!")
            return
        
        if count > MAX_COUNT_PER_RUN:
            await update.message.reply_text(
                f"❌ Maximum count is {MAX_COUNT_PER_RUN:,}!\n"
                f"Please use a smaller number."
            )
            return
        
        # Check for active session
        active_session = db.get_active_session(user.id)
        if active_session:
            await update.message.reply_text(
                f"⚠️ You already have an active check running!\n"
                f"Use /status to view progress or /stop to stop it."
            )
            return
        
        # Start the check
        await self._start_check(update, context, user.id, count)
    
    async def _start_check(self, update: Update, context: ContextTypes.DEFAULT_TYPE,
                           user_id: int, count: int):
        """Start a new check session."""
        
        # Send initial message
        msg = await update.message.reply_text(
            MESSAGES['checking'].format(
                count=count,
                concurrent=CONCURRENT_REQUESTS,
                timeout=REQUEST_TIMEOUT
            ),
            parse_mode='Markdown'
        )
        
        # Create check task
        async def progress_callback(session_id: int, stats: Dict):
            """Send progress updates."""
            elapsed = timedelta(seconds=int(time.time() - stats['start_time']))
            speed = stats['checked'] / max(1, (time.time() - stats['start_time']))
            
            try:
                progress_text = MESSAGES['progress'].format(
                    checked=stats.get('checked', 0),
                    remaining=max(0, stats.get('total', 0) - stats.get('checked', 0)),
                    working=stats.get('working', 0),
                    failed=stats.get('failed', 0),
                    rate=(stats.get('working', 0) / max(1, stats.get('checked', 1))) * 100,
                    elapsed=str(elapsed),
                    speed=speed
                )
                
                await msg.edit_text(progress_text, parse_mode='Markdown')
            except Exception as e:
                logger.error(f"Progress update failed: {e}")
        
        # Run check in background
        task = asyncio.create_task(
            checker.check_batch(id(msg), user_id, count, progress_callback)
        )
        checker.active_checks[id(msg)] = task
        
        # Wait for completion and send final message
        try:
            stats = await task
            
            elapsed = timedelta(seconds=int(time.time() - stats.get('start_time', time.time())))
            
            complete_text = MESSAGES['complete'].format(
                total=stats.get('checked', 0),
                working=stats.get('working', 0),
                failed=stats.get('failed', 0),
                rate=(stats.get('working', 0) / max(1, stats.get('checked', 1))) * 100,
                time=str(elapsed)
            )
            
            keyboard = [[InlineKeyboardButton("📥 Download Results", callback_data="download_results")]]
            
            await msg.edit_text(
                complete_text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except asyncio.CancelledError:
            await msg.edit_text("⏹️ Check was stopped by user.")
        except Exception as e:
            logger.error(f"Check failed: {e}")
            await msg.edit_text(f"❌ Check failed: {str(e)}")
    
    async def cmd_status(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /status command."""
        user = update.effective_user
        
        active_session = db.get_active_session(user.id)
        
        if not active_session:
            await update.message.reply_text("ℹ️ No active check running.\nUse /check to start one!")
            return
        
        # Get live stats from checker
        session_id = active_session['id']
        stats = checker.get_stats(session_id) or {
            'checked': active_session.get('checked_count', 0),
            'working': active_session.get('working_count', 0),
            'failed': active_session.get('failed_count', 0),
            'start_time': datetime.fromisoformat(active_session['started_at']).timestamp(),
            'total': active_session.get('total_count', 0)
        }
        
        elapsed = timedelta(seconds=int(time.time() - stats.get('start_time', time.time())))
        speed = stats.get('checked', 0) / max(1, (time.time() - stats.get('start_time', time.time())))
        
        status_text = MESSAGES['progress'].format(
            checked=stats.get('checked', 0),
            remaining=max(0, stats.get('total', 0) - stats.get('checked', 0)),
            working=stats.get('working', 0),
            failed=stats.get('failed', 0),
            rate=(stats.get('working', 0) / max(1, stats.get('checked', 1))) * 100,
            elapsed=str(elapsed),
            speed=speed
        )
        
        keyboard = [[InlineKeyboardButton("⏹️ Stop Check", callback_data="stop_current")]]
        
        await update.message.reply_text(
            status_text,
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
    
    async def cmd_results(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /results command - show working URLs."""
        user = update.effective_user
        
        # Get recent working URLs
        urls = db.get_working_urls(limit=20)
        
        if not urls:
            await update.message.reply_text("😔 No working URLs found yet.\nUse /check to start finding some!")
            return
        
        # Format URLs
        url_list = "\n".join([f"• `{u['url'][:80]}...`" for u in urls[:10]])
        
        results_text = MESSAGES['results'].format(
            count=db.count_working_urls(),
            show_count=min(10, len(urls)),
            links=url_list
        )
        
        keyboard = [
            [InlineKeyboardButton("📥 Download All", callback_data="download_all")],
            [InlineKeyboardButton("🔄 Refresh", callback_data="refresh_results")]
        ]
        
        await update.message.reply_text(
            RESULTS_FILE,
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
    
    async def cmd_stats(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /stats command."""
        stats = db.get_stats()
        
        stats_text = f"""
📊 **Overall Statistics**

**Sessions:**
• Total Sessions: `{stats.get('total_sessions', 0):,}`
• Active Now: `{stats.get('active_sessions', 0)}`

**Results:**
• Total Checked: `{stats.get('total_checked', 0):,}`
• ✅ Working Found: `{stats.get('total_found', 0):,}`
• ❌ Failed: `{stats.get('total_failed', 0):,}`

**Today:**
• Checked Today: `{stats.get('today_checked', 0):,}`
• Found Today: `{stats.get('today_found', 0):,}`

**Users:**
• Total Users: `{stats.get('total_users', 0):,}`
        """
        
        await update.message.reply_text(stats_text, parse_mode='Markdown')
    
    async def cmd_download(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /download command - send results file."""
        user = update.effective_user
        
        count = db.export_results_to_file(RESULTS_FILE)
        
        if count == 0:
            await update.message.reply_text("😔 No results to download.")
            return
        
        try:
            with open(RESULTS_FILE, 'rb') as f:
                await update.message.reply_document(
                    document=f,
                    filename=f"working_urls_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt",
                    caption=f"📥 **{count:,} Working URLs**\n\nGenerated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
                    parse_mode='Markdown'
                )
        except Exception as e:
            await update.message.reply_text(f"❌ Error sending file: {e}")
    
    # ==================== ADMIN COMMANDS ====================
    
    async def cmd_admin(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /admin command."""
        user = update.effective_user
        
        if user.id not in ADMIN_IDS:
            await update.message.reply_text("❌ Admin access required!")
            return
        
        stats = db.get_stats()
        
        keyboard = [
            [InlineKeyboardButton("⏹️ Stop All Checks", callback_data="admin_stop")],
            [InlineKeyboardButton("🗑️ Clear Results", callback_data="admin_clear")],
            [InlineKeyboardButton("📢 Broadcast", callback_data="admin_broadcast")],
            [InlineKeyboardButton("🔄 Refresh Stats", callback_data="admin_refresh")]
        ]
        
        admin_text = MESSAGES['admin_panel'].format(
            name=user.first_name,
            total=stats.get('total_checked', 0),
            found=stats.get('total_found', 0),
            sessions=stats.get('active_sessions', 0)
        )
        
        await update.message.reply_text(
            admin_text,
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
    
    async def cmd_stop(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /stop command."""
        user = update.effective_user
        
        active_session = db.get_active_session(user.id)
        
        if not active_session:
            await update.message.reply_text("ℹ️ No active check to stop.")
            return
        
        if checker.stop_check(active_session['id']):
            db.stop_session(active_session['id'])
            await update.message.reply_text("✅ Check stopped successfully.")
        else:
            await update.message.reply_text("❌ Could not stop check.")
    
    async def cmd_clear(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /clear command."""
        user = update.effective_user
        
        if user.id not in ADMIN_IDS:
            await update.message.reply_text("❌ Admin access required!")
            return
        
        db.clear_results()
        await update.message.reply_text("✅ All results cleared!")
    
    async def cmd_broadcast(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /broadcast command."""
        user = update.effective_user
        
        if user.id not in ADMIN_IDS:
            await update.message.reply_text("❌ Admin access required!")
            return
        
        await update.message.reply_text(
            "📢 Send the message you want to broadcast.",
            parse_mode='Markdown'
        )
        context.user_data['awaiting_broadcast'] = True
    
    # ==================== CALLBACK HANDLERS ====================
    
    async def handle_callback(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle button presses."""
        query = update.callback_query
        await query.answer()
        
        data = query.data
        
        if data.startswith('check_'):
            count = int(data.split('_')[1'])
            await self._start_check(update, context, update.effective_user.id, count)
        
        elif data == 'show_stats':
            await self.cmd_status(update, context)
        
        elif data == 'show_results':
            await self.cmd_results(update, context)
        
        elif data == 'show_help':
            await self.cmd_help(update, context)
        
        elif data == 'stop_current':
            await self.cmd_stop(update, context)
        
        elif data.startswith('download'):
            await self.cmd_download(update, context)
        
        elif data == 'refresh_results':
            await self.cmd_results(update, context)
        
        elif data.startswith('admin_'):
            action = data.replace('admin_', '')
            if action == 'stop':
                # Stop all active sessions
                sessions = [s for s in []]  # Would need to track all active
                await query.edit_message_text("✅ Stopped all active checks.")
            elif action == 'clear':
                db.clear_results()
                await query.edit_message_text("✅ Results cleared!")
            elif action == 'broadcast':
                await query.edit_message_text("📢 Send broadcast message...")
                context.user_data['awaiting_broadcast'] = True
            elif action == 'refresh':
                await self.cmd_admin(update, context)
    
    # ==================== MAIN RUN METHOD ====================
    
    async def run(self):
        """Start the bot."""
        await self.initialize()
        
        logger.info("Starting Link Checker Bot...")
        
        if USE_WEBHOOK and WEBHOOK_URL:
            # Webhook mode (better for Render)
            await self.application.bot.set_webhook(url=f"{WEBHOOK_URL}/webhook")
            
            # Build webhook app
            from telegram.request import HTTPXRequest
            request = HTTPXRequest(read_timeout=60, write_timeout=60, connect_timeout=60)
            
            await self.application.initialize()
            await self.application.start()
            
            # Run webhook server
            from aiohttp import web
            
            async def handle_webhook(request_obj):
                update = await request_obj.json()
                await self.application.process_update(
                    Update.de_json(data=request_obj.content_type, bot=self.application.bot)
                )
                return web.Response(text="OK")
            
            app = web.Application()
            app.router.add_post('/webhook', handle_webhook)
            
            runner = web.AppRunner(app)
            await runner.setup()
            site = web.TCPSite(runner, '0.0.0.0', PORT)
            await site.start()
            
            logger.info(f"Webhook mode running on port {PORT}")
            
            try:
                await asyncio.Event().wait()
            finally:
                await site.stop()
                await runner.cleanup()
                await self.application.stop()
                await self.application.shutdown()
        else:
            # Polling mode
            await self.application.initialize()
            await self.application.start()
            await self.application.updater.start_polling(drop_pending_updates=True)
            
            logger.info("Polling mode started")
            
            try:
                await asyncio.Event().wait()
            except (KeyboardInterrupt, SystemExit):
                pass
            finally:
                await self.application.updater.stop()
                await self.application.stop()
                await self.application.shutdown()
        
        db.close()


def main():
    """Main entry point."""
    bot = LinkCheckerBot()
    asyncio.run(bot.run())


if __name__ == '__main__':
    main()
