"""
Netflix Cookie Bot - Database Layer
=====================================
Professional SQLite database management with connection pooling,
migrations, and optimized queries.
"""

import sqlite3
import json
import os
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
from contextlib import contextmanager
import threading

class DatabaseManager:
    """Thread-safe database manager with connection pooling."""
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls, db_path: str = 'netflix_cookies.db'):
        """Singleton pattern for database manager."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self, db_path: str = 'netflix_cookies.db'):
        """Initialize database connection and create tables."""
        if self._initialized:
            return
        
        self.db_path = db_path
        self._local = threading.local()
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(db_path) if os.path.dirname(db_path) else '.', exist_ok=True)
        
        # Initialize tables
        self._create_tables()
        self._initialized = True
    
    @property
    def conn(self) -> sqlite3.Connection:
        """Get thread-local database connection."""
        if not hasattr(self._local, 'conn') or self._local.conn is None:
            self._local.conn = sqlite3.connect(
                self.db_path,
                check_same_thread=False,
                timeout=30
            )
            self._local.conn.row_factory = sqlite3.Row
            # Enable WAL mode for better concurrent performance
            self._local.conn.execute('PRAGMA journal_mode=WAL')
            # Foreign keys support
            self._local.conn.execute('PRAGMA foreign_keys=ON')
        return self._local.conn
    
    @contextmanager
    def get_cursor(self):
        """Context manager for database cursor."""
        cursor = self.conn.cursor()
        try:
            yield cursor
            self.conn.commit()
        except Exception as e:
            self.conn.rollback()
            raise e
        finally:
            cursor.close()
    
    def _create_tables(self):
        """Create all necessary database tables."""
        with self.get_cursor() as cursor:
            # Users table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY,
                    telegram_id INTEGER UNIQUE NOT NULL,
                    username TEXT,
                    first_name TEXT,
                    last_name TEXT,
                    is_admin INTEGER DEFAULT 0,
                    is_banned INTEGER DEFAULT 0,
                    ban_reason TEXT,
                    ban_until TIMESTAMP,
                    joined_channel INTEGER DEFAULT 0,
                    cookies_claimed_today INTEGER DEFAULT 0,
                    last_claim_date DATE,
                    last_claim_time TIMESTAMP,
                    total_claims INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Cookies table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS cookies (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cookie_data TEXT NOT NULL,
                    device_type TEXT NOT NULL CHECK(device_type IN ('mobile', 'pc', 'tv')),
                    cookie_link TEXT,
                    is_used INTEGER DEFAULT 0,
                    used_by INTEGER,
                    used_at TIMESTAMP,
                    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'working', 'not_working')),
                    reported_by INTEGER,
                    screenshot_url TEXT,
                    uploaded_by INTEGER NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP,
                    FOREIGN KEY (used_by) REFERENCES users(id),
                    FOREIGN KEY (reported_by) REFERENCES users(id),
                    FOREIGN KEY (uploaded_by) REFERENCES users(id)
                )
            """)
            
            # Claims/Requests log table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS claims (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    cookie_id INTEGER NOT NULL,
                    device_type TEXT,
                    claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    status_reported INTEGER DEFAULT 0,
                    screenshot_submitted INTEGER DEFAULT 0,
                    FOREIGN KEY (user_id) REFERENCES users(id),
                    FOREIGN KEY (cookie_id) REFERENCES cookies(id)
                )
            """)
            
            # Rate limiting table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS rate_limits (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    request_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    request_type TEXT DEFAULT 'claim',
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            """)
            
            # Ban history table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS ban_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    reason TEXT NOT NULL,
                    banned_by INTEGER,
                    banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    unbanned_at TIMESTAMP,
                    is_active INTEGER DEFAULT 1,
                    FOREIGN KEY (user_id) REFERENCES users(id),
                    FOREIGN KEY (banned_by) REFERENCES users(id)
                )
            """)
            
            # Create indexes for performance
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_cookies_device ON cookies(device_type)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_cookies_status ON cookies(status)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_cookies_used ON cookies(is_used)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_claims_user ON claims(user_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_rate_limits_user ON rate_limits(user_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_ban_history_user ON ban_history(user_id)")
    
    # ==================== USER METHODS ====================
    
    def create_or_update_user(self, user_data: Dict[str, Any]) -> int:
        """Create or update user record. Returns user ID."""
        with self.get_cursor() as cursor:
            # Check if user exists
            cursor.execute(
                "SELECT id FROM users WHERE telegram_id = ?",
                (user_data['telegram_id'],)
            )
            result = cursor.fetchone()
            
            now = datetime.now().isoformat()
            
            if result:
                # Update existing user
                cursor.execute("""
                    UPDATE users SET 
                        username = ?,
                        first_name = ?,
                        last_name = ?,
                        updated_at = ?
                    WHERE telegram_id = ?
                """, (
                    user_data.get('username'),
                    user_data.get('first_name'),
                    user_data.get('last_name'),
                    now,
                    user_data['telegram_id']
                ))
                return result['id']
            else:
                # Create new user
                cursor.execute("""
                    INSERT INTO users (
                        telegram_id, username, first_name, last_name,
                        is_admin, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    user_data['telegram_id'],
                    user_data.get('username'),
                    user_data.get('first_name'),
                    user_data.get('last_name'),
                    int(user_data.get('is_admin', False)),
                    now,
                    now
                ))
                return cursor.lastrowid
    
    def get_user(self, telegram_id: int) -> Optional[Dict]:
        """Get user by Telegram ID."""
        with self.get_cursor() as cursor:
            cursor.execute("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,))
            row = cursor.fetchone()
            return dict(row) if row else None
    
    def get_user_by_id(self, user_id: int) -> Optional[Dict]:
        """Get user by internal ID."""
        with self.get_cursor() as cursor:
            cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
            row = cursor.fetchone()
            return dict(row) if row else None
    
    def set_ban_status(self, user_id: int, banned: bool, reason: str = '', 
                       duration_days: int = 7, admin_id: int = None):
        """Set or remove ban on user."""
        with self.get_cursor() as cursor:
            now = datetime.now()
            
            if banned:
                ban_until = now + timedelta(days=duration_days)
                
                # Update user record
                cursor.execute("""
                    UPDATE users SET 
                        is_banned = 1,
                        ban_reason = ?,
                        ban_until = ?
                    WHERE id = ?
                """, (reason, ban_until.isoformat(), user_id))
                
                # Add to ban history
                cursor.execute("""
                    INSERT INTO ban_history (user_id, reason, banned_by, banned_at, is_active)
                    VALUES (?, ?, ?, ?, 1)
                """, (user_id, reason, admin_id, now.isoformat()))
            else:
                # Remove ban
                cursor.execute("""
                    UPDATE users SET 
                        is_banned = 0,
                        ban_reason = NULL,
                        ban_until = NULL
                    WHERE id = ?
                """, (user_id,))
                
                # Deactivate ban history
                cursor.execute("""
                    UPDATE ban_history SET 
                        is_active = 0,
                        unbanned_at = ?
                    WHERE user_id = ? AND is_active = 1
                """, (now.isoformat(), user_id))
    
    def update_channel_join_status(self, user_id: int, joined: bool):
        """Update whether user has joined required channel."""
        with self.get_cursor() as cursor:
            cursor.execute(
                "UPDATE users SET joined_channel = ? WHERE id = ?",
                (int(joined), user_id)
            )
    
    def reset_daily_counters(self):
        """Reset daily claim counters for new day."""
        with self.get_cursor() as cursor:
            today = datetime.now().date().isoformat()
            cursor.execute(
                """
                UPDATE users SET 
                    cookies_claimed_today = 0,
                    last_claim_date = ?
                WHERE last_claim_date IS NULL OR last_claim_date < ?
                """,
                (today, today)
            )
    
    def increment_daily_claims(self, user_id: int) -> int:
        """Increment daily claim count. Returns new count."""
        with self.get_cursor() as cursor:
            today = datetime.now().date().isoformat()
            now = datetime.now().isoformat()
            
            # Check if it's a new day
            cursor.execute(
                "SELECT last_claim_date FROM users WHERE id = ?",
                (user_id,)
            )
            result = cursor.fetchone()
            
            if not result or result['last_claim_date'] != today:
                # New day - reset counter
                cursor.execute(
                    """
                    UPDATE users SET 
                        cookies_claimed_today = 1,
                        last_claim_date = ?,
                        last_claim_time = ?,
                        total_claims = total_claims + 1
                    WHERE id = ?
                    """,
                    (today, now, user_id)
                )
                return 1
            else:
                # Same day - increment
                cursor.execute(
                    """
                    UPDATE users SET 
                        cookies_claimed_today = cookies_claimed_today + 1,
                        last_claim_time = ?,
                        total_claims = total_claims + 1
                    WHERE id = ?
                    """,
                    (now, user_id)
                )
                
                cursor.execute(
                    "SELECT cookies_claimed_today FROM users WHERE id = ?",
                    (user_id,)
                )
                return cursor.fetchone()['cookies_claimed_today']
    
    # ==================== COOKIE METHODS ====================
    
    def add_cookie(self, cookie_data: str, device_type: str, 
                   uploader_id: int, cookie_link: str = None) -> int:
        """Add new cookie to database. Returns cookie ID."""
        with self.get_cursor() as cursor:
            now = datetime.now()
            expires_at = now + timedelta(hours=24)
            
            cursor.execute("""
                INSERT INTO cookies (
                    cookie_data, device_type, cookie_link, 
                    uploaded_by, created_at, expires_at
                ) VALUES (?, ?, ?, ?, ?, ?)
            """, (
                json.dumps(cookie_data) if isinstance(cookie_data, dict) else cookie_data,
                device_type,
                cookie_link,
                uploader_id,
                now.isoformat(),
                expires_at.isoformat()
            ))
            
            return cursor.lastrowid
    
    def add_cookies_batch(self, cookies: List[Dict], uploader_id: int) -> Dict[str, int]:
        """Add multiple cookies at once. Returns stats."""
        stats = {'added': 0, 'skipped': 0, 'invalid': 0}
        
        with self.get_cursor() as cursor:
            now = datetime.now()
            expires_at = now + timedelta(hours=24)
            
            for cookie in cookies:
                try:
                    # Validate required fields
                    if not cookie.get('data') or not cookie.get('device'):
                        stats['invalid'] += 1
                        continue
                    
                    device_type = cookie['device'].lower()
                    if device_type not in ['mobile', 'pc', 'tv']:
                        stats['invalid'] += 1
                        continue
                    
                    # Check for duplicates (simple hash check)
                    cookie_str = json.dumps(cookie['data']) if isinstance(cookie['data'], dict) else cookie['data']
                    
                    cursor.execute("""
                        INSERT INTO cookies (
                            cookie_data, device_type, cookie_link,
                            uploaded_by, created_at, expires_at
                        ) VALUES (?, ?, ?, ?, ?, ?)
                    """, (
                        cookie_str,
                        device_type,
                        cookie.get('link'),
                        uploader_id,
                        now.isoformat(),
                        expires_at.isoformat()
                    ))
                    
                    stats['added'] += 1
                    
                except Exception as e:
                    print(f"Error adding cookie: {e}")
                    stats['invalid'] += 1
        
        return stats
    
    def get_available_cookie(self, device_type: str) -> Optional[Dict]:
        """Get next available unused cookie for device type."""
        with self.get_cursor() as cursor:
            now = datetime.now().isoformat()
            
            cursor.execute("""
                SELECT * FROM cookies 
                WHERE device_type = ? 
                AND is_used = 0 
                AND (expires_at IS NULL OR expires_at > ?)
                ORDER BY created_at ASC
                LIMIT 1
            """, (device_type, now))
            
            row = cursor.fetchone()
            return dict(row) if row else None
    
    def claim_cookie(self, cookie_id: int, user_id: int) -> bool:
        """Mark cookie as claimed by user."""
        with self.get_cursor() as cursor:
            now = datetime.now().isoformat()
            
            cursor.execute("""
                UPDATE cookies SET 
                    is_used = 1,
                    used_by = ?,
                    used_at = ?
                WHERE id = ? AND is_used = 0
            """, (user_id, now, cookie_id))
            
            # Log the claim
            cursor.execute("""
                INSERT INTO claims (user_id, cookie_id, claimed_at)
                VALUES (?, ?, ?)
            """, (user_id, cookie_id, now))
            
            return cursor.rowcount > 0
    
    def report_cookie_status(self, cookie_id: int, user_id: int, 
                             status: str, screenshot_url: str = None) -> bool:
        """Report cookie as working/not working."""
        with self.get_cursor() as cursor:
            cursor.execute("""
                UPDATE cookies SET 
                    status = ?,
                    reported_by = ?,
                    screenshot_url = ?
                WHERE id = ?
            """, (status, user_id, screenshot_url, cookie_id))
            
            # Update claim record
            cursor.execute("""
                UPDATE claims SET 
                    status_reported = 1,
                    screenshot_submitted = 1 if ? else screenshot_submitted
                WHERE cookie_id = ? AND user_id = ?
            """, (screenshot_url is not None, cookie_id, user_id))
            
            return cursor.rowcount > 0
    
    def get_cookie(self, cookie_id: int) -> Optional[Dict]:
        """Get cookie by ID."""
        with self.get_cursor() as cursor:
            cursor.execute("SELECT * FROM cookies WHERE id = ?", (cookie_id,))
            row = cursor.fetchone()
            return dict(row) if row else None
    
    # ==================== RATE LIMITING METHODS ====================
    
    def log_request(self, user_id: int, request_type: str = 'claim'):
        """Log a request for rate limiting."""
        with self.get_cursor() as cursor:
            cursor.execute("""
                INSERT INTO rate_limits (user_id, request_time, request_type)
                VALUES (?, CURRENT_TIMESTAMP, ?)
            """, (user_id, request_type))
    
    def get_recent_requests(self, user_id: int, window_seconds: int = 30) -> List[Dict]:
        """Get recent requests within time window."""
        with self.get_cursor() as cursor:
            cursor.execute("""
                SELECT * FROM rate_limits 
                WHERE user_id = ?
                AND request_time >= datetime('now', '-' || || ' seconds')
                ORDER BY request_time DESC
            """, (user_id, window_seconds))
            
            return [dict(row) for row in cursor.fetchall()]
    
    def cleanup_old_requests(self, days: int = 7):
        """Clean up old rate limit records."""
        with self.get_cursor() as cursor:
            cursor.execute("""
                DELETE FROM rate_limits 
                WHERE request_time < datetime('now', '-' || || ' days')
            """, (days,))
    
    # ==================== STATISTICS METHODS ====================
    
    def get_stats(self) -> Dict[str, Any]:
        """Get overall bot statistics."""
        with self.get_cursor() as cursor:
            stats = {}
            
            # User stats
            cursor.execute("SELECT COUNT(*) as count FROM users")
            stats['total_users'] = cursor.fetchone()['count']
            
            cursor.execute("SELECT COUNT(*) as count FROM users WHERE is_banned = 1")
            stats['banned_users'] = cursor.fetchone()['count']
            
            cursor.execute("SELECT COUNT(*) as count FROM users WHERE joined_channel = 1")
            stats['channel_members'] = cursor.fetchone()['count']
            
            # Cookie stats
            cursor.execute("SELECT COUNT(*) as count FROM cookies")
            stats['total_cookies'] = cursor.fetchone()['count']
            
            cursor.execute("SELECT COUNT(*) as count FROM cookies WHERE is_used = 0")
            stats['available_cookies'] = cursor.fetchone()['count']
            
            cursor.execute("SELECT COUNT(*) as count FROM cookies WHERE is_used = 1")
            stats['used_cookies'] = cursor.fetchone()['count']
            
            cursor.execute("SELECT COUNT(*) as count FROM cookies WHERE status = 'working'")
            stats['working_cookies'] = cursor.fetchone()['count']
            
            cursor.execute("SELECT COUNT(*) as count FROM cookies WHERE status = 'not_working'")
            stats['not_working_cookies'] = cursor.fetchone()['count']
            
            # Today's activity
            today = datetime.now().date().isoformat()
            cursor.execute("""
                SELECT COUNT(*) as count FROM claims 
                WHERE date(claimed_at) = ?
            """, (today,))
            stats['claims_today'] = cursor.fetchone()['count']
            
            # Device distribution
            for device in ['mobile', 'pc', 'tv']:
                cursor.execute("""
                    SELECT COUNT(*) as count FROM cookies 
                    WHERE device_type = ? AND is_used = 0
                """, (device,))
                stats[f'{device}_available'] = cursor.fetchone()['count']
            
            return stats
    
    def get_user_stats(self, user_id: int) -> Dict[str, Any]:
        """Get statistics for specific user."""
        with self.get_cursor() as cursor:
            cursor.execute("""
                SELECT * FROM users WHERE id = ?
            """, (user_id,))
            user = dict(cursor.fetchone())
            
            cursor.execute("""
                SELECT COUNT(*) as count FROM claims WHERE user_id = ?
            """, (user_id,))
            total_claims = cursor.fetchone()['count']
            
            cursor.execute("""
                SELECT COUNT(*) as count FROM claims 
                WHERE user_id = ? AND status_reported = 1
            """, (user_id,))
            reports_submitted = cursor.fetchone()['count']
            
            return {
                **user,
                'total_claims': total_claims,
                'reports_submitted': reports_submitted
            }
    
    def get_all_users(self, page: int = 1, per_page: int = 50) -> List[Dict]:
        """Get paginated list of users."""
        with self.get_cursor() as cursor:
            offset = (page - 1) * per_page
            cursor.execute("""
                SELECT * FROM users 
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            """, (per_page, offset))
            
            return [dict(row) for row in cursor.fetchall()]
    
    def get_banned_users(self) -> List[Dict]:
        """Get all currently banned users."""
        with self.get_cursor() as cursor:
            cursor.execute("""
                SELECT * FROM users 
                WHERE is_banned = 1
                ORDER BY ban_until DESC
            """)
            
            return [dict(row) for row in cursor.fetchall()]
    
    # ==================== MAINTENANCE METHODS ====================
    
    def expire_old_cookies(self):
        """Mark expired cookies as used."""
        with self.get_cursor() as cursor:
            now = datetime.now().isoformat()
            cursor.execute("""
                UPDATE cookies SET is_used = 1, status = 'expired'
                WHERE expires_at < ? AND is_used = 0
            """, (now,))
    
    def cleanup_expired_bans(self):
        """Remove expired bans."""
        with self.get_cursor() as cursor:
            now = datetime.now().isoformat()
            
            # Find expired bans
            cursor.execute("""
                SELECT id, user_id FROM users 
                WHERE is_banned = 1 AND ban_until < ?
            """, (now,))
            
            expired_bans = cursor.fetchall()
            
            # Remove bans
            for ban in expired_bans:
                self.set_ban_status(ban['user_id'], False, "Ban expired")
    
    def close(self):
        """Close database connection."""
        if hasattr(self._local, 'conn') and self._local.conn:
            self._local.conn.close()
            self._local.conn = None


# Global database instance
db = DatabaseManager()
