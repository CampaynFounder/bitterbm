#!/bin/bash

# Data Pipeline Setup Script
# Run: chmod +x setup.sh && ./setup.sh

set -e

echo "🚀 Setting up Legal Data Pipeline..."
echo ""

# Check Python version
echo "📋 Checking Python version..."
python3 --version || {
    echo "❌ Python 3 not found. Please install Python 3.9+"
    exit 1
}

# Check Node version
echo "📋 Checking Node version..."
node --version || {
    echo "❌ Node.js not found. Please install Node.js 18+"
    exit 1
}

# Install Python dependencies
echo ""
echo "📦 Installing Python dependencies..."
cd scraper
pip install -r requirements.txt

# Install Playwright browsers
echo ""
echo "🌐 Installing Playwright browsers..."
python3 -m playwright install chromium

# Install Node dependencies
echo ""
echo "📦 Installing Node dependencies..."
cd ..
npm install

# Create data directory
echo ""
echo "📁 Creating data directories..."
mkdir -p data/pdfs
mkdir -p scraper/builder/recordings

# Check for .env.local
if [ ! -f .env.local ]; then
    echo ""
    echo "⚠️  No .env.local found. Creating template..."
    cat > .env.local << EOF
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI
OPENAI_API_KEY=sk-your-api-key

# Pipeline
PIPELINE_STORAGE_PATH=./data/pdfs
PIPELINE_CONFIDENCE_THRESHOLD=0.8
PIPELINE_SAMPLE_REVIEW_RATE=0.1
EOF
    echo "✅ Template created at .env.local"
    echo "⚠️  Please update with your actual keys!"
else
    echo "✅ .env.local already exists"
fi

# Optional: Check for Tesseract (for OCR)
echo ""
echo "📋 Checking for Tesseract (optional, for PDF OCR)..."
if command -v tesseract &> /dev/null; then
    echo "✅ Tesseract installed"
else
    echo "⚠️  Tesseract not found. Install with:"
    echo "   macOS: brew install tesseract poppler"
    echo "   Ubuntu: sudo apt-get install tesseract-ocr poppler-utils"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "📚 Next steps:"
echo ""
echo "1. Update .env.local with your API keys"
echo ""
echo "2. Run database migrations:"
echo "   supabase db push"
echo ""
echo "3. Start the pipeline service:"
echo "   cd scraper/pipeline"
echo "   uvicorn api:app --reload --port 8000"
echo ""
echo "4. Start Next.js dev server (in a new terminal):"
echo "   npm run dev"
echo ""
echo "5. Open admin dashboard:"
echo "   http://localhost:3000/admin/data-pipeline"
echo ""
echo "📖 Full documentation: docs/PIPELINE_SETUP.md"
echo ""
