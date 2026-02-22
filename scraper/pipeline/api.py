"""
FastAPI Pipeline Service
Runs the data pipeline in the background

Run with:
uvicorn scraper.pipeline.api:app --reload --port 8000
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, List
import asyncio
from pathlib import Path
import os

from .data_pipeline import DataPipeline, PipelineConfig
from .codegen_converter import CodegenConverter

app = FastAPI(title="Data Pipeline API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize pipeline
config = PipelineConfig(
    supabase_url=os.getenv("NEXT_PUBLIC_SUPABASE_URL"),
    supabase_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
    openai_api_key=os.getenv("OPENAI_API_KEY"),
    storage_path=Path("./data/pdfs")
)

pipeline = DataPipeline(config)


# ========================================
# Request/Response Models
# ========================================

class GenerateSupersetRequest(BaseModel):
    superset_id: str
    county_id: str
    search_params: Dict


class ConvertCodegenRequest(BaseModel):
    code: str
    county_id: str


class ProcessQueueRequest(BaseModel):
    task_type: Optional[str] = None
    limit: int = 10


# ========================================
# Endpoints
# ========================================

@app.get("/")
async def root():
    return {
        "service": "Data Pipeline API",
        "version": "1.0.0",
        "status": "running"
    }


@app.post("/pipeline/generate-superset")
async def generate_superset(
    request: GenerateSupersetRequest,
    background_tasks: BackgroundTasks
):
    """
    Generate superset (run search and collect case IDs)
    
    Runs in background to avoid timeout
    """
    
    async def run_generation():
        try:
            await pipeline.generate_superset(
                county_id=request.county_id,
                search_params=request.search_params
            )
        except Exception as e:
            # Update superset with error
            pipeline.supabase.table('supersets').update({
                'status': 'failed',
                'error_log': {'error': str(e)}
            }).eq('id', request.superset_id).execute()
    
    # Run in background
    background_tasks.add_task(run_generation)
    
    return {
        'success': True,
        'message': 'Superset generation started',
        'superset_id': request.superset_id
    }


@app.post("/pipeline/convert-codegen")
async def convert_codegen(request: ConvertCodegenRequest):
    """
    Convert Playwright codegen output to structured config
    """
    
    try:
        converter = CodegenConverter(request.code)
        config = converter.convert()
        
        return {
            'success': True,
            'config': config,
            'needs_review': [
                'extraction_rules',
                'search_form field mappings',
                'results_table structure'
            ]
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/pipeline/process-queue")
async def process_queue(
    request: ProcessQueueRequest,
    background_tasks: BackgroundTasks
):
    """
    Process queued tasks
    """
    
    async def run_processing():
        await pipeline.process_queue(
            task_type=request.task_type,
            limit=request.limit
        )
    
    # Run in background
    background_tasks.add_task(run_processing)
    
    return {
        'success': True,
        'message': f'Processing {request.limit} tasks',
        'task_type': request.task_type
    }


@app.post("/pipeline/scrape-case/{task_id}")
async def scrape_case(task_id: str, background_tasks: BackgroundTasks):
    """
    Scrape a single case
    """
    
    async def run_scraping():
        await pipeline.scrape_case(task_id)
    
    background_tasks.add_task(run_scraping)
    
    return {'success': True, 'message': 'Scraping started'}


@app.post("/pipeline/download-pdf/{task_id}")
async def download_pdf(task_id: str, background_tasks: BackgroundTasks):
    """
    Download and process PDF
    """
    
    async def run_download():
        await pipeline.download_and_process_pdf(task_id)
    
    background_tasks.add_task(run_download)
    
    return {'success': True, 'message': 'PDF download started'}


@app.post("/pipeline/extract-text/{task_id}")
async def extract_text(task_id: str, background_tasks: BackgroundTasks):
    """
    Extract text and generate embeddings
    """
    
    async def run_extraction():
        await pipeline.extract_and_embed(task_id)
    
    background_tasks.add_task(run_extraction)
    
    return {'success': True, 'message': 'Text extraction started'}


@app.get("/pipeline/health")
async def health_check():
    """
    Health check endpoint
    """
    
    # Check Supabase connection
    try:
        pipeline.supabase.table('counties').select('id', count='exact', head=True).execute()
        supabase_status = 'connected'
    except:
        supabase_status = 'disconnected'
    
    return {
        'status': 'healthy',
        'supabase': supabase_status,
        'timestamp': pipeline.config.storage_path.exists()
    }


# ========================================
# Worker Process (Optional)
# ========================================

@app.on_event("startup")
async def startup_event():
    """
    Start background worker
    """
    
    # Option 1: Continuous processing
    # asyncio.create_task(continuous_worker())
    
    # Option 2: Cron-style (every 5 minutes)
    # asyncio.create_task(scheduled_worker())
    
    pass


async def continuous_worker():
    """
    Continuously process queue
    """
    
    while True:
        try:
            await pipeline.process_queue(limit=10)
        except Exception as e:
            print(f"Worker error: {e}")
        
        await asyncio.sleep(10)  # Wait 10 seconds between batches


async def scheduled_worker():
    """
    Process queue every 5 minutes
    """
    
    while True:
        try:
            await pipeline.process_queue(limit=100)
        except Exception as e:
            print(f"Worker error: {e}")
        
        await asyncio.sleep(300)  # 5 minutes


# ========================================
# Development
# ========================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
