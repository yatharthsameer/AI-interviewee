"""
Authentication module for the Electron app backend
Handles user registration, login, JWT tokens, and user management
"""

import sqlite3
import bcrypt
import jwt
import json
import os
from datetime import datetime, timedelta
from functools import wraps
from flask import request, jsonify, current_app

# JWT Secret key - in production, this should be in environment variables
JWT_SECRET = os.getenv(
    "JWT_SECRET", "your-super-secret-jwt-key-change-this-in-production"
)
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Database file path
DB_PATH = "users.db"


class AuthManager:
    def __init__(self):
        self.init_database()

    def init_database(self):
        """Initialize the SQLite database with users table"""
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()

            # Create users table if it doesn't exist
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_login TIMESTAMP,
                    is_active BOOLEAN DEFAULT 1
                )
            """
            )

            conn.commit()
            conn.close()
            print("✅ Database initialized successfully")

        except Exception as e:
            print(f"❌ Database initialization error: {e}")

    def hash_password(self, password):
        """Hash a password using bcrypt"""
        salt = bcrypt.gensalt()
        return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

    def verify_password(self, password, password_hash):
        """Verify a password against its hash"""
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))

    def generate_jwt_token(self, user_id, username):
        """Generate a JWT token for a user"""
        payload = {
            "user_id": user_id,
            "username": username,
            "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS),
            "iat": datetime.utcnow(),
        }
        return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

    def verify_jwt_token(self, token):
        """Verify and decode a JWT token"""
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            return payload
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None

    def register_user(self, username, email, password):
        """Register a new user"""
        try:
            # Validate input
            if not username or not email or not password:
                return {"success": False, "error": "All fields are required"}

            if len(username) < 3:
                return {
                    "success": False,
                    "error": "Username must be at least 3 characters",
                }

            if len(password) < 6:
                return {
                    "success": False,
                    "error": "Password must be at least 6 characters",
                }

            # Check if user already exists
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()

            cursor.execute(
                "SELECT id FROM users WHERE username = ? OR email = ?",
                (username, email),
            )
            existing_user = cursor.fetchone()

            if existing_user:
                conn.close()
                return {"success": False, "error": "Username or email already exists"}

            # Hash password and create user
            password_hash = self.hash_password(password)

            cursor.execute(
                """
                INSERT INTO users (username, email, password_hash)
                VALUES (?, ?, ?)
            """,
                (username, email, password_hash),
            )

            user_id = cursor.lastrowid
            conn.commit()
            conn.close()

            # Generate JWT token
            token = self.generate_jwt_token(user_id, username)

            return {
                "success": True,
                "token": token,
                "user": {"id": user_id, "username": username, "email": email},
            }

        except Exception as e:
            return {"success": False, "error": f"Registration failed: {str(e)}"}

    def login_user(self, username, password):
        """Login a user"""
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()

            # Find user by username or email
            cursor.execute(
                """
                SELECT id, username, email, password_hash, is_active 
                FROM users 
                WHERE (username = ? OR email = ?) AND is_active = 1
            """,
                (username, username),
            )

            user = cursor.fetchone()

            if not user:
                conn.close()
                return {"success": False, "error": "Invalid username/email or password"}

            user_id, user_username, email, password_hash, is_active = user

            # Verify password
            if not self.verify_password(password, password_hash):
                conn.close()
                return {"success": False, "error": "Invalid username/email or password"}

            # Update last login
            cursor.execute(
                "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?",
                (user_id,),
            )
            conn.commit()
            conn.close()

            # Generate JWT token
            token = self.generate_jwt_token(user_id, user_username)

            return {
                "success": True,
                "token": token,
                "user": {"id": user_id, "username": user_username, "email": email},
            }

        except Exception as e:
            return {"success": False, "error": f"Login failed: {str(e)}"}

    def get_user_from_token(self, token):
        """Get user information from JWT token"""
        try:
            payload = self.verify_jwt_token(token)
            if not payload:
                return None

            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()

            cursor.execute(
                """
                SELECT id, username, email, is_active 
                FROM users 
                WHERE id = ? AND is_active = 1
            """,
                (payload["user_id"],),
            )

            user = cursor.fetchone()
            conn.close()

            if user:
                return {
                    "id": user[0],
                    "username": user[1],
                    "email": user[2],
                    "is_active": user[3],
                }

            return None

        except Exception as e:
            print(f"Error getting user from token: {e}")
            return None


# Global auth manager instance
auth_manager = AuthManager()


def token_required(f):
    """Decorator to require authentication for API endpoints"""

    @wraps(f)
    def decorated(*args, **kwargs):
        token = None

        # Get token from Authorization header
        if "Authorization" in request.headers:
            auth_header = request.headers["Authorization"]
            try:
                token = auth_header.split(" ")[1]  # Bearer TOKEN
            except IndexError:
                return jsonify({"error": "Invalid token format"}), 401

        if not token:
            return jsonify({"error": "Token is missing"}), 401

        # Verify token and get user
        user = auth_manager.get_user_from_token(token)
        if not user:
            return jsonify({"error": "Token is invalid or expired"}), 401

        # Add user to request context
        request.current_user = user
        return f(*args, **kwargs)

    return decorated
