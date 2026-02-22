"""
Data Pipeline Orchestrator
Manages the complete flow from county configuration to RAG-ready data

Flow:
1. Configure County (Manual - UI)
2. Generate Superset (Semi-automated with review)
3. Scrape Cases (Automated with sampling review)
4. Extract & Parse (Automated with confidence scoring)
5. Download PDFs (Automated)
6. Extract Text & Chunk (Automated)
7. Generate Embeddings (Automated)
8. Validate & Review (Manual for low confidence)
"""

from dataclasses import dataclass
from typing import List, Dict, Optional
import json
from pathlib import Path
from datetime import datetime
import asyncio

from playwright.async_api import async_playwright
from supabase import create_client
import openai


@dataclass
class PipelineConfig:
    """Pipeline configuration"""
    supabase_url: str
    supabase_key: str
    openai_api_key: str
    storage_path: Path
    confidence_threshold: float = 0.8  # Below this, queue for review
    sample_review_rate: float = 0.1  # Review 10% of cases randomly


class DataPipeline:
    def __init__(self, config: PipelineConfig):
        self.config = config
        self.supabase = create_client(config.supabase_url, config.supabase_key)
        openai.api_key = config.openai_api_key
        self.config.storage_path.mkdir(parents=True, exist_ok=True)
    
    # ========================================
    # STEP 1: Generate Superset
    # ========================================
    
    async def generate_superset(
        self,
        county_id: str,
        search_params: Dict,
        name: str = None
    ) -> str:
        """
        Run search and collect all matching case IDs
        
        Args:
            county_id: County to search
            search_params: Search criteria
            name: Human-readable name for this superset
        
        Returns:
            superset_id
        """
        
        # Create superset record
        superset = self.supabase.table('supersets').insert({
            'county_id': county_id,
            'name': name or f"Search {datetime.now().strftime('%Y-%m-%d')}",
            'search_params': search_params,
            'status': 'collecting'
        }).execute()
        
        superset_id = superset.data[0]['id']
        
        # Get scraper config
        config = self.supabase.table('scraper_configs')\
            .select('*')\
            .eq('county_id', county_id)\
            .eq('is_validated', True)\
            .order('created_at', desc=True)\
            .limit(1)\
            .execute()
        
        if not config.data:
            raise Exception(f"No validated scraper config for county {county_id}")
        
        scraper_config = config.data[0]
        
        # Run search and collect IDs
        case_ids = await self._run_search_collect_ids(
            scraper_config,
            search_params
        )
        
        # Update superset
        self.supabase.table('supersets').update({
            'case_ids': case_ids,
            'total_cases': len(case_ids),
            'status': 'complete'
        }).eq('id', superset_id).execute()
        
        print(f"✅ Superset created: {len(case_ids)} cases")
        
        # Queue case scraping tasks
        self._queue_case_scraping(superset_id, county_id, case_ids)
        
        return superset_id
    
    async def _run_search_collect_ids(
        self,
        scraper_config: Dict,
        search_params: Dict
    ) -> List[str]:
        """Execute search and extract all case IDs"""
        
        case_ids = []
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            
            # Execute navigation steps
            nav_steps = scraper_config['navigation_steps']
            for step in nav_steps:
                await self._execute_step(page, step, search_params)
            
            # Wait for results
            await page.wait_for_timeout(2000)
            
            # Extract case IDs from results table
            table_config = scraper_config['extraction_rules']['results_table']
            rows = await page.locator(table_config['row_selector']).all()
            
            for row in rows:
                case_id_cell = await row.locator(
                    table_config['case_id_selector']
                ).inner_text()
                case_ids.append(case_id_cell.strip())
            
            # Handle pagination if needed
            # TODO: Add pagination logic
            
            await browser.close()
        
        return case_ids
    
    # ========================================
    # STEP 2: Scrape Individual Cases
    # ========================================
    
    def _queue_case_scraping(
        self,
        superset_id: str,
        county_id: str,
        case_ids: List[str]
    ):
        """Queue all cases for scraping"""
        
        tasks = []
        for case_id in case_ids:
            tasks.append({
                'task_type': 'scrape_case',
                'county_id': county_id,
                'superset_id': superset_id,
                'task_data': {'case_id': case_id},
                'priority': 0
            })
        
        # Batch insert
        self.supabase.table('processing_queue').insert(tasks).execute()
        
        print(f"📋 Queued {len(tasks)} cases for scraping")
    
    async def scrape_case(self, task_id: str):
        """
        Scrape a single case
        
        Extracts:
        - Case metadata
        - Parties
        - Judge
        - Events
        - PDF links
        """
        
        # Get task
        task = self.supabase.table('processing_queue')\
            .select('*')\
            .eq('id', task_id)\
            .single()\
            .execute()
        
        task_data = task.data
        case_id = task_data['task_data']['case_id']
        county_id = task_data['county_id']
        
        # Update status
        self.supabase.table('processing_queue').update({
            'status': 'processing',
            'started_at': datetime.now().isoformat()
        }).eq('id', task_id).execute()
        
        try:
            # Get scraper config
            config = self.supabase.table('scraper_configs')\
                .select('*')\
                .eq('county_id', county_id)\
                .eq('is_validated', True)\
                .order('created_at', desc=True)\
                .limit(1)\
                .single()\
                .execute()
            
            scraper_config = config.data
            
            # Scrape case
            case_data = await self._scrape_case_details(
                scraper_config,
                case_id
            )
            
            # Parse and structure data
            structured_data = self._parse_case_data(case_data)
            
            # Calculate confidence score
            confidence = self._calculate_confidence(structured_data)
            
            # Save case
            case_record = self.supabase.table('cases').insert({
                'county_id': county_id,
                'superset_id': task_data['superset_id'],
                'case_number': case_id,
                **structured_data,
                'raw_data': case_data,
                'extraction_status': 'extracted',
                'needs_review': confidence < self.config.confidence_threshold
            }).execute()
            
            case_db_id = case_record.data[0]['id']
            
            # Queue PDF downloads
            for pdf_link in case_data.get('pdf_links', []):
                self._queue_pdf_download(case_db_id, pdf_link)
            
            # Queue for review if needed
            if confidence < self.config.confidence_threshold:
                self._queue_for_review(case_db_id, 'case_extraction', structured_data)
            
            # Update task
            self.supabase.table('processing_queue').update({
                'status': 'complete',
                'completed_at': datetime.now().isoformat(),
                'result': {'case_id': case_db_id, 'confidence': confidence}
            }).eq('id', task_id).execute()
            
            print(f"✅ Scraped case {case_id} (confidence: {confidence:.2f})")
            
        except Exception as e:
            # Mark as failed
            self.supabase.table('processing_queue').update({
                'status': 'failed',
                'error_message': str(e),
                'attempts': task_data['attempts'] + 1
            }).eq('id', task_id).execute()
            
            print(f"❌ Failed to scrape case {case_id}: {e}")
    
    # ========================================
    # STEP 3: Download & Process PDFs
    # ========================================
    
    def _queue_pdf_download(self, case_id: str, pdf_info: Dict):
        """Queue PDF for download"""
        
        self.supabase.table('processing_queue').insert({
            'task_type': 'download_pdf',
            'case_id': case_id,
            'task_data': pdf_info,
            'priority': 1
        }).execute()
    
    async def download_and_process_pdf(self, task_id: str):
        """
        Download PDF, extract text, chunk, and embed
        """
        
        task = self.supabase.table('processing_queue')\
            .select('*')\
            .eq('id', task_id)\
            .single()\
            .execute()
        
        task_data = task.data
        pdf_url = task_data['task_data']['url']
        case_id = task_data['case_id']
        
        try:
            # Download PDF
            pdf_path = await self._download_pdf(pdf_url, case_id)
            
            # Save document record
            doc = self.supabase.table('case_documents').insert({
                'case_id': case_id,
                'document_type': task_data['task_data'].get('type', 'Unknown'),
                'source_url': pdf_url,
                'storage_path': str(pdf_path),
                'status': 'downloaded'
            }).execute()
            
            doc_id = doc.data[0]['id']
            
            # Queue text extraction
            self.supabase.table('processing_queue').insert({
                'task_type': 'extract_text',
                'case_id': case_id,
                'document_id': doc_id,
                'task_data': {'pdf_path': str(pdf_path)},
                'priority': 2
            }).execute()
            
            # Mark complete
            self.supabase.table('processing_queue').update({
                'status': 'complete',
                'completed_at': datetime.now().isoformat()
            }).eq('id', task_id).execute()
            
        except Exception as e:
            self.supabase.table('processing_queue').update({
                'status': 'failed',
                'error_message': str(e)
            }).eq('id', task_id).execute()
    
    # ========================================
    # STEP 4: Extract Text & Generate Embeddings
    # ========================================
    
    async def extract_and_embed(self, task_id: str):
        """
        Extract text from PDF, chunk it, and generate embeddings
        """
        
        task = self.supabase.table('processing_queue')\
            .select('*')\
            .eq('id', task_id)\
            .single()\
            .execute()
        
        pdf_path = task.data['task_data']['pdf_path']
        doc_id = task.data['document_id']
        case_id = task.data['case_id']
        
        try:
            # Extract text (using PyPDF2, pdfplumber, or OCR)
            text = self._extract_pdf_text(pdf_path)
            
            # Update document
            self.supabase.table('case_documents').update({
                'extracted_text': text,
                'status': 'extracted'
            }).eq('id', doc_id).execute()
            
            # Chunk text
            chunks = self._chunk_text(text, chunk_size=1000, overlap=200)
            
            # Get case metadata for embedding metadata
            case = self.supabase.table('cases')\
                .select('*')\
                .eq('id', case_id)\
                .single()\
                .execute()
            
            case_data = case.data
            
            # Generate embeddings
            for i, chunk in enumerate(chunks):
                embedding = await self._generate_embedding(chunk)
                
                self.supabase.table('document_chunks').insert({
                    'document_id': doc_id,
                    'case_id': case_id,
                    'chunk_text': chunk,
                    'chunk_index': i,
                    'embedding': embedding,
                    'metadata': {
                        'case_number': case_data['case_number'],
                        'judge': case_data['judge'],
                        'case_type': case_data['case_type'],
                        'outcome': case_data['outcome'],
                        'filed_date': case_data['filed_date']
                    }
                }).execute()
            
            # Update document status
            self.supabase.table('case_documents').update({
                'status': 'chunked'
            }).eq('id', doc_id).execute()
            
            # Mark task complete
            self.supabase.table('processing_queue').update({
                'status': 'complete',
                'completed_at': datetime.now().isoformat()
            }).eq('id', task_id).execute()
            
            print(f"✅ Processed document {doc_id}: {len(chunks)} chunks")
            
        except Exception as e:
            self.supabase.table('processing_queue').update({
                'status': 'failed',
                'error_message': str(e)
            }).eq('id', task_id).execute()
    
    # ========================================
    # Helper Methods
    # ========================================
    
    def _parse_case_data(self, raw_data: Dict) -> Dict:
        """Parse raw scraped data into structured format"""
        
        # Parse parties (typically in format "PLAINTIFF vs DEFENDANT")
        parties_text = raw_data.get('parties', '')
        plaintiff = None
        defendant = None
        
        if ' vs ' in parties_text or ' v. ' in parties_text:
            parts = parties_text.replace(' vs ', '|').replace(' v. ', '|').split('|')
            if len(parts) >= 2:
                plaintiff = parts[0].strip()
                defendant = parts[1].strip()
        elif ', ' in parties_text:
            parts = parties_text.split(', ', 1)
            plaintiff = parts[0].strip()
            defendant = parts[1].strip() if len(parts) > 1 else None
        
        # Parse outcome (look for keywords in events or case status)
        outcome = None
        events = raw_data.get('nested_events', [])
        for event in events:
            event_type = event.get('type', '').lower()
            if 'final' in event_type or 'order' in event_type:
                outcome = event_type
                break
        
        return {
            'plaintiff': plaintiff,
            'defendant': defendant,
            'judge': raw_data.get('judge'),
            'case_type': raw_data.get('case_type_desc') or raw_data.get('case_type'),
            'outcome': outcome,
            'filed_date': raw_data.get('filed_date'),
            'case_status': raw_data.get('status')
        }
    
    def _calculate_confidence(self, structured_data: Dict) -> float:
        """Calculate confidence score for extracted data"""
        
        # Simple scoring: percentage of required fields populated
        required_fields = ['plaintiff', 'defendant', 'judge', 'case_type']
        populated = sum(1 for f in required_fields if structured_data.get(f))
        
        return populated / len(required_fields)
    
    def _queue_for_review(self, case_id: str, review_type: str, data: Dict):
        """Add item to review queue"""
        
        self.supabase.table('review_queue').insert({
            'review_type': review_type,
            'case_id': case_id,
            'data_to_review': data,
            'status': 'pending'
        }).execute()
    
    async def _generate_embedding(self, text: str) -> List[float]:
        """Generate OpenAI embedding"""
        
        response = await openai.embeddings.acreate(
            model="text-embedding-3-small",
            input=text
        )
        
        return response.data[0].embedding
    
    async def _download_pdf(self, pdf_url: str, case_id: str) -> Path:
        """Download PDF from URL"""
        
        import aiohttp
        import hashlib
        
        # Generate filename
        url_hash = hashlib.md5(pdf_url.encode()).hexdigest()[:8]
        filename = f"{case_id}_{url_hash}.pdf"
        pdf_path = self.config.storage_path / filename
        
        # Download
        async with aiohttp.ClientSession() as session:
            async with session.get(pdf_url) as response:
                if response.status == 200:
                    content = await response.read()
                    with open(pdf_path, 'wb') as f:
                        f.write(content)
                else:
                    raise Exception(f"Failed to download PDF: {response.status}")
        
        return pdf_path
    
    def _extract_pdf_text(self, pdf_path: str) -> str:
        """Extract text from PDF"""
        
        try:
            import pdfplumber
            
            text = ""
            with pdfplumber.open(pdf_path) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n\n"
            
            return text.strip()
        
        except Exception as e:
            print(f"Error extracting text: {e}")
            # Fall back to OCR if text extraction fails
            return self._extract_pdf_text_ocr(pdf_path)
    
    def _extract_pdf_text_ocr(self, pdf_path: str) -> str:
        """Extract text from PDF using OCR"""
        
        try:
            import pytesseract
            from pdf2image import convert_from_path
            
            images = convert_from_path(pdf_path)
            text = ""
            
            for image in images:
                page_text = pytesseract.image_to_string(image)
                text += page_text + "\n\n"
            
            return text.strip()
        
        except Exception as e:
            print(f"OCR failed: {e}")
            return ""
    
    def _chunk_text(
        self,
        text: str,
        chunk_size: int = 1000,
        overlap: int = 200
    ) -> List[str]:
        """Chunk text for embedding"""
        
        chunks = []
        start = 0
        
        while start < len(text):
            end = start + chunk_size
            chunk = text[start:end]
            
            # Try to break at sentence boundary
            if end < len(text):
                last_period = chunk.rfind('.')
                last_newline = chunk.rfind('\n')
                break_point = max(last_period, last_newline)
                
                if break_point > chunk_size * 0.5:  # At least 50% through
                    chunk = chunk[:break_point + 1]
                    end = start + break_point + 1
            
            chunks.append(chunk.strip())
            start = end - overlap  # Overlap for context
        
        return chunks
    
    async def _execute_step(self, page, step: Dict, params: Dict):
        """Execute a single navigation step"""
        
        # Get frame context
        if step.get('iframe'):
            frame_element = await page.locator(step['iframe']).first
            frame = await frame_element.content_frame()
        else:
            frame = page
        
        step_type = step['type']
        
        if step_type == 'navigate':
            url = step['url'].format(**params)
            await page.goto(url, wait_until='networkidle', timeout=60000)
        
        elif step_type == 'fill':
            value = step['value'].format(**params)
            await frame.locator(step['selector']).fill(value)
        
        elif step_type == 'click':
            await frame.locator(step['selector']).click()
        
        elif step_type == 'check':
            await frame.locator(step['selector']).check()
        
        elif step_type == 'wait':
            await page.wait_for_timeout(step['duration'])
    
    async def _scrape_case_details(
        self,
        scraper_config: Dict,
        case_id: str
    ) -> Dict:
        """Scrape details for a single case"""
        
        case_data = {}
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            
            # Get iframe selector if exists
            iframe_selector = scraper_config.get('results_table', {}).get('iframe')
            frame = None
            
            # Execute navigation steps to get to case detail
            nav_steps = scraper_config['navigation_steps']
            for step in nav_steps:
                await self._execute_step(page, step, {'case_id': case_id})
            
            # Set frame context
            if iframe_selector:
                frame_element = await page.locator(iframe_selector).first
                frame = await frame_element.content_frame()
            else:
                frame = page
            
            # Wait for content to load
            await page.wait_for_timeout(2000)
            
            # Extract data using extraction rules
            extraction_rules = scraper_config['extraction_rules']
            
            for field_name, rule in extraction_rules.items():
                if field_name in ['has_nested_table', 'expand_icon']:
                    continue
                
                try:
                    selector = rule['selector']
                    element = await frame.locator(selector).first
                    
                    if rule['type'] == 'text':
                        case_data[field_name] = await element.inner_text()
                    elif rule['type'] == 'href':
                        case_data[field_name] = await element.get_attribute('href')
                except:
                    case_data[field_name] = None
            
            # Handle nested tables (events, documents)
            if extraction_rules.get('has_nested_table'):
                expand_icon = extraction_rules.get('expand_icon', {}).get('selector')
                if expand_icon:
                    try:
                        await frame.locator(expand_icon).first.click()
                        await page.wait_for_timeout(1000)
                        
                        # Extract nested table data
                        case_data['nested_events'] = []
                    except:
                        pass
            
            # Collect PDF links
            pdf_links = []
            try:
                pdf_rule = extraction_rules.get('pdf_links', {})
                if pdf_rule:
                    pdf_elements = await frame.locator(pdf_rule['selector']).all()
                    for elem in pdf_elements:
                        href = await elem.get_attribute('href')
                        if href:
                            pdf_links.append({
                                'url': href,
                                'type': 'Document'
                            })
            except:
                pass
            
            case_data['pdf_links'] = pdf_links
            
            await browser.close()
        
        return case_data
    
    # ========================================
    # Pipeline Orchestration
    # ========================================
    
    async def process_queue(self, task_type: str = None, limit: int = 10):
        """
        Process queued tasks
        
        Args:
            task_type: Filter by task type (or None for all)
            limit: Max tasks to process in this batch
        """
        
        query = self.supabase.table('processing_queue')\
            .select('*')\
            .eq('status', 'queued')\
            .order('priority', desc=True)\
            .order('queued_at')\
            .limit(limit)
        
        if task_type:
            query = query.eq('task_type', task_type)
        
        tasks = query.execute()
        
        for task in tasks.data:
            task_type = task['task_type']
            task_id = task['id']
            
            if task_type == 'scrape_case':
                await self.scrape_case(task_id)
            elif task_type == 'download_pdf':
                await self.download_and_process_pdf(task_id)
            elif task_type == 'extract_text':
                await self.extract_and_embed(task_id)


# Example usage
if __name__ == "__main__":
    config = PipelineConfig(
        supabase_url="your-supabase-url",
        supabase_key="your-key",
        openai_api_key="your-openai-key",
        storage_path=Path("./data/pdfs")
    )
    
    pipeline = DataPipeline(config)
    
    # Generate superset
    # superset_id = await pipeline.generate_superset(
    #     county_id="cobb-ga",
    #     search_params={
    #         "party_name": "%",
    #         "date_from": "01/01/2020",
    #         "date_to": "12/31/2024"
    #     }
    # )
    
    # Process queue
    # await pipeline.process_queue(limit=100)
