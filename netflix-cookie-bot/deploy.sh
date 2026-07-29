#!/bin/bash

# Netflix Cookie Bot - Quick Start Script
# ========================================
# This script helps you deploy to any free 24/7 hosting platform

set -e

echo "🎬 Netflix Cookie Bot - Deployment Helper"
echo "========================================="
echo ""

# Check if required files exist
if [ ! -f "main.py" ]; then
    echo "❌ Error: main.py not found!"
    exit 1
fi

if [ ! -f "requirements.txt" ]; then
    echo "❌ Error: requirements.txt not found!"
    exit 1
fi

echo "✅ All required files found"
echo ""

# Display menu
echo "🚀 Choose your hosting platform:"
echo ""
echo "1) justrunmy.app     (RECOMMENDED - Easiest, 24/7, Free)"
echo "2) TeleBotHost       (Easy, 24/7, Free)"
echo "3) fps.ms            (Simple, 24/7, Free)"
echo "4) pella.app         (Professional, 24/7, Free)"
echo "5) Koyeb             (Enterprise, $5.50/mo free)"
echo "6) Oracle Cloud      (Advanced, Always Free VM)"
echo "7) Local testing     (Run on your computer)"
echo ""
read -p "Enter choice (1-7): " choice

case $choice in
    1)
        echo ""
        echo "🥇 Deploying to justrunmy.app..."
        echo ""
        echo "Steps:"
        echo "1. Go to https://justrunmy.app"
        echo "2. Sign up for free account"
        echo "3. Click 'New Service' or 'Deploy'"
        echo "4. Upload this folder or connect GitHub"
        echo "5. Set these environment variables:"
        echo ""
        echo "   BOT_TOKEN=YOUR_BOT_TOKEN"
        echo "   ADMIN_IDS=YOUR_TELEGRAM_ID"
        echo "   REQUIRED_CHANNEL_USERNAME=YourChannel"
        echo "   CHANNEL_ID=-1001234567890"
        echo ""
        echo "6. Click DEPLOY and you're done! 🎉"
        echo ""
        echo "Opening browser..."
        if command -v xdg-open &> /dev/null; then
            xdg-open "https://justrunmy.app" 2>/dev/null &
        elif command -v open &> /dev/null; then
            open "https://justrunmy.app" 2>/dev/null &
        fi
        ;;
    
    2)
        echo ""
        echo "🥈 Deploying to TeleBotHost..."
        echo ""
        echo "Steps:"
        echo "1. Go to https://telebothost.com"
        echo "2. Create free account"
        echo "3. Click 'Deploy New Bot'"
        echo "4. Upload bot files"
        echo "5. Configure environment variables"
        echo "6. Launch! ✅"
        echo ""
        echo "Opening browser..."
        if command -v xdg-open &> /dev/null; then
            xdg-open "https://telebothost.com" 2>/dev/null &
        elif command -v open &> /dev/null; then
            open "https://telebothost.com" 2>/dev/null &
        fi
        ;;
    
    3)
        echo ""
        echo "🥉 Deploying to fps.ms..."
        echo ""
        echo "Steps:"
        echo "1. Go to https://fps.ms"
        echo "2. Register (no credit card needed)"
        echo "3. Create new project"
        echo "4. Upload main.py and requirements.txt"
        echo "5. Set env vars in dashboard"
        echo "6. Start service ✅"
        echo ""
        echo "Opening browser..."
        if command -v xdg-open &> /dev/null; then
            xdg-open "https://fps.ms" 2>/dev/null &
        elif command -v open &> /dev/null; then
            open "https://fps.ms" 2>/dev/null &
        fi
        ;;
    
    4)
        echo ""
        echo "Deploying to pella.app..."
        echo ""
        echo "Opening browser..."
        if command -v xdg-open &> /dev/null; then
            xdg-open "https://www.pella.app/free-telegram-bot-hosting" 2>/dev/null &
        elif command -v open &> /dev/null; then
            open "https://www.pella.app/free-telegram-bot-hosting" 2>/dev/null &
        fi
        ;;
    
    5)
        echo ""
        echo "Deploying to Koyeb..."
        echo ""
        echo "Opening browser..."
        if command -v xdg-open &> /dev/null; then
            xdg-open "https://www.koyeb.com" 2>/dev/null &
        elif command -v open &> /dev/null; then
            open "https://www.koyeb.com" 2>/dev/null &
        fi
        ;;
    
    6)
        echo ""
        echo "Deploying to Oracle Cloud (Advanced)..."
        echo ""
        echo "⚠️ This requires more technical knowledge"
        echo "See full guide in DEPLOYMENT_OPTIONS.md"
        echo ""
        echo "Opening browser..."
        if command -v xdg-open &> /dev/null; then
            xdg-open "https://cloud.oracle.com" 2>/dev/null &
        elif command -v open &> /dev/null; then
            open "https://cloud.oracle.com" 2>/dev/null &
        fi
        ;;
    
    7)
        echo ""
        echo "🧪 Running locally for testing..."
        echo ""
        
        # Check if .env file exists
        if [ ! -f ".env" ]; then
            echo "⚠️ No .env file found. Creating from template..."
            cp .env.example .env
            echo ""
            echo "⚠️ Please edit .env file with your values before running!"
            exit 1
        fi
        
        # Check if python is installed
        if ! command -v python3 &> /dev/null; then
            echo "❌ Python 3 not found. Please install Python 3."
            exit 1
        fi
        
        # Install dependencies
        echo "📦 Installing dependencies..."
        pip install -r requirements.txt
        
        # Run bot
        echo ""
        echo "🤖 Starting bot locally..."
        echo "Press Ctrl+C to stop"
        echo ""
        python3 main.py
        ;;
    
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "✅ Done! Your bot should be running 24/7! 🎬"
