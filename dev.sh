#!/bin/bash

# Development Start Script
# Starts both pipeline service and Next.js dev server
# Run: chmod +x dev.sh && ./dev.sh

echo "🚀 Starting Data Pipeline Development Servers..."
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "❌ .env.local not found!"
    echo "Run ./setup.sh first or create .env.local manually"
    exit 1
fi

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down services..."
    kill $PIPELINE_PID $NEXTJS_PID 2>/dev/null
    exit
}

trap cleanup INT TERM

# Start pipeline service
echo "📡 Starting Pipeline Service (port 8000)..."
cd scraper/pipeline
uvicorn api:app --reload --port 8000 > ../../logs/pipeline.log 2>&1 &
PIPELINE_PID=$!
cd ../..

# Wait for pipeline to be ready
echo "⏳ Waiting for pipeline service..."
sleep 3

# Check if pipeline is running
if ! curl -s http://localhost:8000/ > /dev/null; then
    echo "❌ Pipeline service failed to start"
    echo "Check logs/pipeline.log for errors"
    exit 1
fi

echo "✅ Pipeline service running at http://localhost:8000"
echo "   API docs: http://localhost:8000/docs"
echo ""

# Start Next.js dev server
echo "🌐 Starting Next.js Dev Server (port 3000)..."
npm run dev > logs/nextjs.log 2>&1 &
NEXTJS_PID=$!

echo "⏳ Waiting for Next.js..."
sleep 5

echo ""
echo "✅ Development servers running!"
echo ""
echo "📊 Admin Dashboard: http://localhost:3000/admin/data-pipeline"
echo "🔧 Pipeline API: http://localhost:8000/docs"
echo ""
echo "📝 Logs:"
echo "   - Pipeline: logs/pipeline.log"
echo "   - Next.js: logs/nextjs.log"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Keep script running
wait
