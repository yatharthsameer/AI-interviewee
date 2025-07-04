#!/bin/bash

# Free Heroku Deployment Script for AI Interview MVP
# Run this script to deploy your backend for FREE on Heroku

set -e  # Exit on any error

echo "🆓 Deploying AI Interview MVP to Heroku for FREE..."
echo

# Check if Heroku CLI is installed
if ! command -v heroku &> /dev/null; then
    echo "❌ Error: Heroku CLI is not installed."
    echo "Install it with: brew tap heroku/brew && brew install heroku"
    exit 1
fi

# Check if we're in the right directory
if [[ ! -f "server.py" || ! -f "Procfile" ]]; then
    echo "❌ Error: Please run this script from the electronbackend directory"
    exit 1
fi

# Login to Heroku
echo "🔐 Logging into Heroku..."
heroku auth:whoami 2>/dev/null || heroku login

# Use existing app name "cluemore"
APP_NAME="cluemore"
echo "Using existing Heroku app: $APP_NAME"

# Check if app exists, create if not
echo "🚀 Creating/checking Heroku app: $APP_NAME"
if heroku apps:info $APP_NAME &>/dev/null; then
    echo "✅ App $APP_NAME already exists, using it"
else
    heroku create $APP_NAME
    echo "✅ Created new app: $APP_NAME"
fi

# Add PostgreSQL addon
echo "🗄️ Adding free PostgreSQL database..."
heroku addons:create heroku-postgresql:mini -a $APP_NAME 2>/dev/null || echo "✅ PostgreSQL already exists"

# Generate JWT secret
echo "🔐 Generating secure JWT secret..."
JWT_SECRET=$(python -c "import secrets; print(secrets.token_hex(32))")

# Set environment variables
echo "⚙️ Setting environment variables..."
heroku config:set NODE_ENV=production -a $APP_NAME
heroku config:set JWT_SECRET=$JWT_SECRET -a $APP_NAME

# Prompt for API keys
echo
echo "🔑 Please enter your API keys:"
read -p "Gemini API Key: " GEMINI_KEY
read -p "ChatGPT API Key (optional, press enter to skip): " CHATGPT_KEY

heroku config:set GEMINI_API_KEY=$GEMINI_KEY -a $APP_NAME
if [[ -n "$CHATGPT_KEY" ]]; then
    heroku config:set CHATGPT_API_KEY=$CHATGPT_KEY -a $APP_NAME
fi

# Set CORS for Heroku domain
heroku config:set ALLOWED_ORIGINS=https://$APP_NAME.herokuapp.com -a $APP_NAME

# Use Heroku-specific requirements
echo "📦 Switching to Heroku requirements..."
cp requirements.txt requirements.txt.backup
cp heroku_requirements.txt requirements.txt

# Initialize git if needed
if [[ ! -d ".git" ]]; then
    echo "📁 Initializing git repository..."
    git init
fi

# Add Heroku remote if not exists
if ! git remote get-url heroku &>/dev/null; then
    heroku git:remote -a $APP_NAME
fi

# Deploy to Heroku
echo "🚀 Deploying to Heroku..."
git add .
git commit -m "Deploy to Heroku" 2>/dev/null || echo "No changes to commit"
git push heroku main

# Restore original requirements
mv requirements.txt.backup requirements.txt

echo
echo "✅ Deployment complete!"
echo
echo "🎉 Your app is live at: https://$APP_NAME.herokuapp.com"
echo "🔧 Admin dashboard at: https://$APP_NAME.herokuapp.com/admin"
echo
echo "Next steps:"
echo "1. Test your API: curl https://$APP_NAME.herokuapp.com/api/admin/stats"
echo "2. Update electronapp/main.js with your Heroku URL"
echo "3. Build DMG with: cd ../electronapp && ./build.sh"
echo
echo "💰 Cost: FREE (just API usage ~\$1-10/month)"
echo
echo "🔍 View logs: heroku logs --tail -a $APP_NAME"
echo "⚙️ View config: heroku config -a $APP_NAME" 