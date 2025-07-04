"""
Database abstraction layer for AI Interview MVP
Supports both SQLite (development) and PostgreSQL (production/Heroku)
"""

import os
import sqlite3
import logging
from urllib.parse import urlparse

log = logging.getLogger("database")

# Check if we should use PostgreSQL (Heroku sets DATABASE_URL)
DATABASE_URL = os.getenv("DATABASE_URL")
USE_POSTGRESQL = DATABASE_URL is not None

if USE_POSTGRESQL:
    try:
        import psycopg2
        import psycopg2.extras
        log.info("Using PostgreSQL database")
    except ImportError:
        log.error("psycopg2 not installed, falling back to SQLite")
        USE_POSTGRESQL = False
        DATABASE_URL = None

# SQLite fallback
SQLITE_PATH = "users.db"


class DatabaseManager:
    def __init__(self):
        self.use_postgresql = USE_POSTGRESQL
        if self.use_postgresql:
            # Parse DATABASE_URL for PostgreSQL connection
            url = urlparse(DATABASE_URL)
            self.db_config = {
                'host': url.hostname,
                'port': url.port,
                'database': url.path[1:],  # Remove leading slash
                'user': url.username,
                'password': url.password,
            }
            log.info(f"PostgreSQL config: {url.hostname}:{url.port}/{url.path[1:]}")
        else:
            log.info(f"Using SQLite database: {SQLITE_PATH}")

    def get_connection(self):
        """Get database connection based on configuration"""
        if self.use_postgresql:
            return psycopg2.connect(**self.db_config)
        else:
            return sqlite3.connect(SQLITE_PATH)

    def init_database(self):
        """Initialize database tables"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()

            if self.use_postgresql:
                # PostgreSQL table creation
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS users (
                        id SERIAL PRIMARY KEY,
                        username VARCHAR(255) UNIQUE NOT NULL,
                        email VARCHAR(255) UNIQUE NOT NULL,
                        password_hash VARCHAR(255) NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        last_login TIMESTAMP,
                        is_active BOOLEAN DEFAULT TRUE,
                        is_blocked BOOLEAN DEFAULT FALSE
                    )
                """)

                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS token_usage (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER NOT NULL,
                        model_name VARCHAR(255) NOT NULL,
                        endpoint VARCHAR(255) NOT NULL,
                        input_tokens INTEGER DEFAULT 0,
                        output_tokens INTEGER DEFAULT 0,
                        total_tokens INTEGER NOT NULL,
                        cost_estimate DECIMAL(10,6) DEFAULT 0.0,
                        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        request_type VARCHAR(255),
                        FOREIGN KEY (user_id) REFERENCES users (id)
                    )
                """)

                # Create indexes for PostgreSQL
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_token_usage_user_time 
                    ON token_usage (user_id, timestamp)
                """)

                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_token_usage_model_time 
                    ON token_usage (model_name, timestamp)
                """)

            else:
                # SQLite table creation (original code)
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT UNIQUE NOT NULL,
                        email TEXT UNIQUE NOT NULL,
                        password_hash TEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        last_login TIMESTAMP,
                        is_active BOOLEAN DEFAULT 1,
                        is_blocked BOOLEAN DEFAULT 0
                    )
                """)

                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS token_usage (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        model_name TEXT NOT NULL,
                        endpoint TEXT NOT NULL,
                        input_tokens INTEGER DEFAULT 0,
                        output_tokens INTEGER DEFAULT 0,
                        total_tokens INTEGER NOT NULL,
                        cost_estimate REAL DEFAULT 0.0,
                        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        request_type TEXT,
                        FOREIGN KEY (user_id) REFERENCES users (id)
                    )
                """)

                # Create indexes for SQLite
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_token_usage_user_time 
                    ON token_usage (user_id, timestamp)
                """)

                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_token_usage_model_time 
                    ON token_usage (model_name, timestamp)
                """)

                # Add is_blocked column if it doesn't exist (SQLite migration)
                try:
                    cursor.execute("ALTER TABLE users ADD COLUMN is_blocked BOOLEAN DEFAULT 0")
                except sqlite3.OperationalError:
                    # Column already exists
                    pass

            conn.commit()
            conn.close()
            log.info(f"✅ Database initialized successfully ({'PostgreSQL' if self.use_postgresql else 'SQLite'})")

        except Exception as e:
            log.error(f"❌ Database initialization error: {e}")
            raise

    def execute_query(self, query, params=None, fetch=False):
        """Execute a query with proper parameter binding for both databases"""
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            
            if self.use_postgresql:
                # PostgreSQL uses %s for all parameter types
                if params:
                    cursor.execute(query, params)
                else:
                    cursor.execute(query)
            else:
                # SQLite uses ? for parameters
                if params:
                    cursor.execute(query, params)
                else:
                    cursor.execute(query)

            if fetch:
                if fetch == 'one':
                    result = cursor.fetchone()
                elif fetch == 'all':
                    result = cursor.fetchall()
                else:
                    result = cursor.fetchall()
            else:
                result = cursor.lastrowid

            conn.commit()
            return result

        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()

    def format_query(self, query):
        """Convert SQLite query format to PostgreSQL if needed"""
        if self.use_postgresql:
            # Replace SQLite-specific syntax with PostgreSQL
            query = query.replace("?", "%s")
            query = query.replace("AUTOINCREMENT", "")
            query = query.replace("datetime('now',", "NOW() - INTERVAL")
            query = query.replace("days')", "day")
        return query


# Global database manager instance
db_manager = DatabaseManager() 