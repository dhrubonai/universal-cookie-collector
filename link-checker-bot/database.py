"""
Link Checker Bot - Database Layer
===================================
SQLite database for storing results, sessions, and statistics.
"""

import sqlite3
import os
import json
import time
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
from contextlib import contextmanager
import threading


class DatabaseManager:
    """Thread-safe database manager for link checker."""
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls, db_path: str = 'link_checker.db'):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self, db_path: str = 'link_checker.db'):
        if self._initialized:
            return
        
        self.db_path = db_path
        self._local = threading.local()
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(db_path) if os.path.dirname(db_path) else '.', exist_ok=True)
        
        self._create_tables()
        self._initialized = True
    
    @property
    def conn(self) -> sqlite3.Connection:
        if not hasattr(self._local, 'conn') or self._local.conn is None:
            self._local.conn = sqlite3.connect(
                self.db_path,
                check_same_thread=False,
                timeout=30
            )
            self._local.conn.row_factory = sqlite3.Row
            self._local.conn.execute('PRAGMA journal_mode=WAL')
            self._local.conn.execute('PRAGMA foreign_keys=ON')
        return self._local.conn
    
    @contextmanager
    def get_cursor(self):
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
        with self.get_cursor() as cursor:
            # Check sessions table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS check_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    total_count INTEGER NOT NULL,
                    checked_count INTEGER DEFAULT 0,
                    working_count INTEGER DEFAULT 0,
                    failed_count INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'running',
                    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    completed_at TIMESTAMP,
                    config_json TEXT
                )
            """)
            
            # Results table (working URLs)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS results (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL,
                    url TEXT NOT NULL UNIQUE,
                    token TEXT,
                    status_code INTEGER,
                    response_time REAL,
                    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (session_id) REFERENCES check_sessions(id)
                )
            """)
            
            # Failed URLs table (for analysis)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS failed_urls (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER,
                    url TEXT NOT NULL,
                    token TEXT,
                    status_code INTEGER,
                    error_type TEXT,
                    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (session_id) REFERENCES check_sessions(id)
                )
            """)
            
            # Statistics table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS statistics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date DATE DEFAULT CURRENT_DATE,
                    total_checks INTEGER DEFAULT 0,
                    total_found INTEGER DEFAULT 0,
                    unique_users INTEGER DEFAULT 0,
                    avg_response_time REAL
                )
            """)
            
            # Users table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    telegram_id INTEGER UNIQUE NOT NULL,
                    username TEXT,
                    first_name TEXT,
                    is_admin INTEGER DEFAULT 0,
                    total_checks INTEGER DEFAULT 0,
                    total_found INTEGER DEFAULT 0,
                    last_check TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Create indexes
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_results_url ON results(url)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_results_session ON results(session_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_failed_session ON failed_urls(session_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user ON check_sessions(user_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_status ON check_sessions(status)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_statistics_date ON statistics(date)")
    
    # ==================== SESSION METHODS ====================
    
    def create_session(self, user_id: int, count: int, config: Dict = None) -> int:
        """Create a new checking session."""
        with self.get_cursor() as cursor:
            cursor.execute("""
                INSERT INTO check_sessions 
                (user_id, total_count, status, config_json)
                VALUES (?, ?, 'running', ?)
            """, (user_id, count, json.dumps(config) if config else None))
            return cursor.lastrowid
    
    def update_session_progress(self, session_id: int, checked: int, 
                                 working: int, failed: int):
        """Update session progress."""
        with self.get_cursor() as cursor:
            cursor.execute("""
                UPDATE check_sessions SET
                    checked_count = ?,
                    working_count = ?,
                    failed_count = ?
                WHERE id = ?
            """, (checked, working, failed, session_id))
    
    def complete_session(self, session_id: int):
        """Mark session as complete."""
        with self.get_cursor() as cursor:
            now = datetime.now().isoformat()
            cursor.execute("""
                UPDATE check_sessions SET
                    status = 'completed',
                    completed_at = ?
                WHERE id = ?
            """, (now, session_id))
    
    def stop_session(self, session_id: int):
        """Stop a session."""
        with self.get_cursor() as cursor:
            cursor.execute("""
                UPDATE check_sessions SET status = 'stopped'
                WHERE id = ?
            """, (session_id,))
    
    def get_active_session(self, user_id: int) -> Optional[Dict]:
        """Get active session for user."""
        with self.get_cursor() as cursor:
            cursor.execute("""
                SELECT * FROM check_sessions 
                WHERE user_id = ? AND status = 'running'
                ORDER BY started_at DESC LIMIT 1
            """, (user_id,))
            row = cursor.fetchone()
            return dict(row) if row else None
    
    def get_session(self, session_id: int) -> Optional[Dict]:
        """Get session by ID."""
        with self.get_cursor() as cursor:
            cursor.execute("SELECT * FROM check_sessions WHERE id = ?", (session_id,))
            row = cursor.fetchone()
            return dict(row) if row else None
    
    # ==================== RESULT METHODS ====================
    
    def add_result(self, session_id: int, url: str, token: str, 
                   status_code: int, response_time: float) -> bool:
        """Add a working URL result."""
        with self.get_cursor() as cursor:
            try:
                cursor.execute("""
                    INSERT OR IGNORE INTO results 
                    (session_id, url, token, status_code, response_time)
                    VALUES (?, ?, ?, ?, ?)
                """, (session_id, url, token, status_code, response_time))
                return cursor.rowcount > 0
            except Exception:
                return False
    
    def add_failed(self, session_id: int, url: str, token: str,
                   status_code: int = None, error_type: str = None):
        """Add a failed URL."""
        with self.get_cursor() as cursor:
            cursor.execute("""
                INSERT INTO failed_urls 
                (session_id, url, token, status_code, error_type)
                VALUES (?, ?, ?, ?, ?)
            """, (session_id, url, token, status_code, error_type))
    
    def get_working_urls(self, session_id: int = None, limit: int = 100) -> List[Dict]:
        """Get working URLs."""
        with self.get_cursor() as cursor:
            if session_id:
                cursor.execute("""
                    SELECT * FROM results WHERE session_id = ?
                    ORDER BY checked_at DESC LIMIT ?
                """, (session_id, limit))
            else:
                cursor.execute("""
                    SELECT * FROM results 
                    ORDER BY checked_at DESC LIMIT ?
                """, (limit,))
            
            return [dict(row) for row in cursor.fetchall()]
    
    def get_all_working_urls(self) -> List[str]:
        """Get all working URLs as list."""
        with self.get_cursor() as cursor:
            cursor.execute("SELECT url FROM results ORDER BY checked_at DESC")
            return [row['url'] for row in cursor.fetchall()]
    
    def count_working_urls(self, session_id: int = None) -> int:
        """Count working URLs."""
        with self.get_cursor() as cursor:
            if session_id:
                cursor.execute("SELECT COUNT(*) as count FROM results WHERE session_id = ?", (session_id,))
            else:
                cursor.execute("SELECT COUNT(*) as count FROM results")
            return cursor.fetchone()['count']
    
    def clear_results(self, session_id: int = None):
        """Clear results."""
        with self.get_cursor() as cursor:
            if session_id:
                cursor.execute("DELETE FROM results WHERE session_id = ?", (session_id,))
                cursor.execute("DELETE FROM failed_urls WHERE session_id = ?", (session_id,))
            else:
                cursor.execute("DELETE FROM results")
                cursor.execute("DELETE FROM failed_urls")
    
    # ==================== USER METHODS ====================
    
    def create_or_update_user(self, user_data: Dict) -> int:
        """Create or update user."""
        with self.get_cursor() as cursor:
            cursor.execute(
                "SELECT id FROM users WHERE telegram_id = ?",
                (user_data['telegram_id'],)
            )
            result = cursor.fetchone()
            
            if result:
                cursor.execute("""
                    UPDATE users SET username = ?, first_name = ?
                    WHERE telegram_id = ?
                """, (
                    user_data.get('username'),
                    user_data.get('first_name'),
                    user_data['telegram_id']
                ))
                return result['id']
            else:
                cursor.execute("""
                    INSERT INTO users (telegram_id, username, first_name, is_admin)
                    VALUES (?, ?, ?, ?)
                """, (
                    user_data['telegram_id'],
                    user_data.get('username'),
                    user_data.get('first_name'),
                    int(user_data.get('is_admin', False))
                ))
                return cursor.lastrowid
    
    def get_user(self, telegram_id: int) -> Optional[Dict]:
        """Get user by Telegram ID."""
        with self.get_cursor() as cursor:
            cursor.execute("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,))
            row = cursor.fetchone()
            return dict(row) if row else None
    
    def update_user_stats(self, user_id: int, found: int):
        """Update user statistics."""
        with self.get_cursor() as cursor:
            now = datetime.now().isoformat()
            cursor.execute("""
                UPDATE users SET
                    total_checks = total_checks + 1,
                    total_found = total_found + ?,
                    last_check = ?
                WHERE id = ?
            """, (found, now, user_id))
    
    # ==================== STATISTICS METHODS ====================
    
    def get_stats(self) -> Dict[str, Any]:
        """Get overall statistics."""
        with self.get_cursor() as cursor:
            stats = {}
            
            # Sessions
            cursor.execute("SELECT COUNT(*) as count FROM check_sessions")
            stats['total_sessions'] = cursor.fetchone()['count']
            
            cursor.execute("SELECT COUNT(*) as count FROM check_sessions WHERE status = 'running'")
            stats['active_sessions'] = cursor.fetchone()['count']
            
            # Results
            cursor.execute("SELECT COUNT(*) as count FROM results")
            stats['total_found'] = cursor.fetchone()['count']
            
            cursor.execute("SELECT COUNT(*) as count FROM failed_urls")
            stats['total_failed'] = cursor.fetchone()['count']
            
            cursor.execute("SELECT SUM(checked_count) as total FROM check_sessions")
            result = cursor.fetchone()['total']
            stats['total_checked'] = result or 0
            
            # Users
            cursor.execute("SELECT COUNT(*) as count FROM users")
            stats['total_users'] = cursor.fetchone()['count']
            
            # Today's stats
            today = datetime.now().date().isoformat()
            cursor.execute("""
                SELECT COALESCE(SUM(checked_count), 0) as today_checked,
                       COALESCE(SUM(working_count), 0) as today_found
                FROM check_sessions WHERE date(started_at) = ?
            """, (today,))
            today_stats = cursor.fetchone()
            stats['today_checked'] = today_stats['today_checked']
            stats['today_found'] = today_stats['today_found']
            
            return stats
    
    def update_daily_stats(self, checks: int, found: int):
        """Update daily statistics."""
        with self.get_cursor() as cursor:
            today = datetime.now().date().isoformat()
            
            cursor.execute("""
                INSERT INTO statistics (date, total_checks, total_found)
                VALUES (?, ?, ?)
                ON CONFLICT(date) DO UPDATE SET
                    total_checks = total_checks + excluded.total_checks,
                    total_found = total_found + excluded.total_found
            """, (today, checks, found))
    
    # ==================== EXPORT METHODS ====================
    
    def export_results_to_file(self, filepath: str, session_id: int = None) -> int:
        """Export results to file. Returns count exported."""
        urls = self.get_all_working_urls() if not session_id else [
            r['url'] for r in self.get_working_urls(session_id, limit=1000000)
        ]
        
        with open(filepath, 'w') as f:
            for url in urls:
                f.write(url + '\n')
        
        return len(urls)
    
    def close(self):
        """Close connection."""
        if hasattr(self._local, 'conn') and self._local.conn:
            self._local.conn.close()
            self._local.conn = None


# Global instance
db = DatabaseManager()
