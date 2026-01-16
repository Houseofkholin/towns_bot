#!/bin/bash

# Quick Deployment Script for Wager Bot
# This script helps you deploy to Render.com

echo "🚀 Wager Bot Deployment Helper"
echo "================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "Please create .env with APP_PRIVATE_DATA and JWT_SECRET"
    exit 1
fi

# Check required variables
if ! grep -q "APP_PRIVATE_DATA=" .env || ! grep -q "JWT_SECRET=" .env; then
    echo "❌ Missing required variables in .env"
    echo "Required: APP_PRIVATE_DATA, JWT_SECRET"
    exit 1
fi

echo "✅ Environment check passed"
echo ""

# Check if git is initialized
if [ ! -d .git ]; then
    echo "📦 Initializing Git repository..."
    git init
    echo "✅ Git initialized"
    echo ""
fi

# Check if files are committed
if [ -z "$(git status --porcelain)" ]; then
    echo "✅ All files are committed"
else
    echo "📝 Uncommitted changes detected"
    echo "Would you like to commit them? (y/n)"
    read -r response
    if [ "$response" = "y" ]; then
        git add .
        git commit -m "Ready for deployment"
        echo "✅ Changes committed"
    fi
fi

echo ""
echo "🌐 Deployment Options:"
echo ""
echo "1. Render.com (Recommended - Easiest)"
echo "   - Go to: https://render.com"
echo "   - Create account and connect GitHub/GitLab"
echo "   - Create new Web Service"
echo "   - Build: bun install"
echo "   - Start: bun run start"
echo "   - Add env vars from .env file"
echo ""
echo "2. Railway"
echo "   - Go to: https://railway.app"
echo "   - Connect repo and deploy"
echo ""
echo "3. Fly.io"
echo "   - Run: fly launch"
echo "   - Set secrets: fly secrets set APP_PRIVATE_DATA=..."
echo ""
echo "📋 Next Steps:"
echo "1. Push your code to GitHub/GitLab"
echo "2. Choose a deployment platform"
echo "3. Connect your repository"
echo "4. Set environment variables (from .env)"
echo "5. Set webhook URL in Towns Developer Portal"
echo ""
echo "📖 See DEPLOYMENT.md for detailed instructions"

