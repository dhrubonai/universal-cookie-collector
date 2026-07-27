#!/bin/bash
# Quick Start Script - Universal Cookie Collector
# Run this to set up and test locally

set -e

echo "╔══════════════════════════════════════════════════╗"
echo "║   🎬 Universal Cookie Collector - Setup         ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install it first."
    exit 1
fi

# Create virtual environment
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate
source venv/bin/activate

# Install dependencies
echo "📥 Installing dependencies..."
pip install -q --upgrade pip
pip install -q -r requirements.txt

# Create necessary directories
mkdir -p sessions data

echo ""
echo "✅ Setup complete!"
echo ""
echo "To run locally:"
echo "  source venv/bin/activate"
echo "  python main.py"
echo ""
echo "Then open: http://localhost:8000/dashboard"
echo ""
echo "Or deploy to Render:"
echo "  1. Push this folder to GitHub"
echo "  2. Go to render.com → New +"
echo "  3. Connect this repo"
echo "  4. It auto-deploys from render.yaml!"
echo ""

# Ask if user wants to run now
read -p "Start server now? [y/N]: " choice
if [[ $choice =~ ^[Yy]$ ]]; then
    echo "🚀 Starting server..."
    echo "Open http://localhost:8000/dashboard in your browser!"
    python main.py
fi
