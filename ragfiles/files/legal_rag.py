#!/usr/bin/env python3
"""
Legal RAG System - Cloud Implementation
Uses OpenAI embeddings + Qdrant + Claude API

Cost: ~$20-30/month for moderate usage
Setup time: ~2 hours
"""

import os
import json
from typing import List, Dict, Optional
from pathlib import Path
from datetime import datetime
import re

# pip install openai qdrant-client anthropic pymupdf
from openai import OpenAI
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue
import anthropic
import fitz  # PyMuPDF


class LegalDocumentProcessor:
    """Extract and chunk legal documents intelligently"""
    
    def __init__(self):
        self.citation_pattern = r'\b\d+\s+[A-Z][a-z]*\.?\s*(?:\d+d?\s+)?\d+\b'
        
    def extract_pdf_text(self, pdf_path: str) -> Dict:
        """Extract text and metadata from PDF"""
        doc = fitz.open(pdf_path)
        
        full_text = ""
        for page in doc:
            full_text += page.get_text()
        
        metadata = {
            'filename': Path(pdf_path).name,
            'page_count': len(doc),
            'extraction_date': datetime.now().isoformat()
        }
        
        doc.close()
        return {'text': full_text, 'metadata': metadata}
    
    def extract_case_metadata(self, text: str, filename: str) -> Dict:
        """Extract case-specific metadata from text"""
        metadata = {'filename': filename}
        
        # Extract case citation (first one found)
        citations = re.findall(self.citation_pattern, text[:2000])
        if citations:
            metadata['citation'] = citations[0]
        
        # Extract case name (usually at the top, format: "Party v. Party")
        case_name_match = re.search(r'([A-Z][A-Za-z\s&,\.]+)\s+v\.?\s+([A-Z][A-Za-z\s&,\.]+)', text[:1000])
        if case_name_match:
            metadata['case_name'] = f"{case_name_match.group(1)} v. {case_name_match.group(2)}"
            metadata['plaintiff'] = case_name_match.group(1).strip()
            metadata['defendant'] = case_name_match.group(2).strip()
        
        # Extract date (various formats)
        date_patterns = [
            r'(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}',
            r'\d{1,2}/\d{1,2}/\d{4}',
            r'\d{4}-\d{2}-\d{2}'
        ]
        for pattern in date_patterns:
            date_match = re.search(pattern, text[:2000])
            if date_match:
                metadata['date_filed'] = date_match.group(0)
                break
        
        # Detect court type (simple heuristic)
        if 'Supreme Court' in text[:500]:
            metadata['court'] = 'Supreme Court'
        elif 'Circuit' in text[:500]:
            metadata['court'] = 'Circuit Court'
        elif 'District' in text[:500]:
            metadata['court'] = 'District Court'
        
        return metadata
    
    def smart_chunk_text(self, text: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
        """
        Chunk text intelligently, trying to preserve paragraph boundaries
        """
        # Split by double newlines (paragraphs)
        paragraphs = text.split('\n\n')
        
        chunks = []
        current_chunk = ""
        
        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
            
            # If adding this paragraph would exceed chunk size
            if len(current_chunk) + len(para) > chunk_size and current_chunk:
                chunks.append(current_chunk)
                # Keep overlap from previous chunk
                overlap_text = current_chunk[-overlap:] if len(current_chunk) > overlap else current_chunk
                current_chunk = overlap_text + "\n\n" + para
            else:
                current_chunk += ("\n\n" + para if current_chunk else para)
        
        # Add the last chunk
        if current_chunk:
            chunks.append(current_chunk)
        
        return chunks
    
    def process_document(self, pdf_path: str, chunk_size: int = 1000) -> List[Dict]:
        """Process a PDF into chunks with metadata"""
        # Extract text
        doc_data = self.extract_pdf_text(pdf_path)
        text = doc_data['text']
        
        # Extract metadata
        metadata = self.extract_case_metadata(text, doc_data['metadata']['filename'])
        metadata.update(doc_data['metadata'])
        
        # Chunk text
        chunks = self.smart_chunk_text(text, chunk_size=chunk_size)
        
        # Create chunk objects
        chunk_objects = []
        for i, chunk_text in enumerate(chunks):
            chunk_obj = {
                'text': chunk_text,
                'chunk_id': i,
                'total_chunks': len(chunks),
                'metadata': metadata.copy()
            }
            chunk_objects.append(chunk_obj)
        
        return chunk_objects


class LegalRAG:
    """RAG system for legal documents using cloud services"""
    
    def __init__(
        self,
        openai_api_key: str,
        anthropic_api_key: str,
        qdrant_url: str = ":memory:",  # Use ":memory:" for local, or provide URL for cloud
        collection_name: str = "legal_cases"
    ):
        self.openai_client = OpenAI(api_key=openai_api_key)
        self.anthropic_client = anthropic.Anthropic(api_key=anthropic_api_key)
        self.qdrant_client = QdrantClient(url=qdrant_url)
        self.collection_name = collection_name
        self.processor = LegalDocumentProcessor()
        
        # Embedding model configuration
        self.embedding_model = "text-embedding-3-small"
        self.embedding_dimension = 1536
        
        self._ensure_collection_exists()
    
    def _ensure_collection_exists(self):
        """Create collection if it doesn't exist"""
        collections = self.qdrant_client.get_collections().collections
        collection_names = [c.name for c in collections]
        
        if self.collection_name not in collection_names:
            self.qdrant_client.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(
                    size=self.embedding_dimension,
                    distance=Distance.COSINE
                )
            )
            print(f"Created collection: {self.collection_name}")
    
    def embed_text(self, text: str) -> List[float]:
        """Generate embedding for text"""
        response = self.openai_client.embeddings.create(
            input=text,
            model=self.embedding_model
        )
        return response.data[0].embedding
    
    def index_document(self, pdf_path: str, chunk_size: int = 1000):
        """Process and index a legal document"""
        print(f"Processing: {pdf_path}")
        
        # Process document into chunks
        chunks = self.processor.process_document(pdf_path, chunk_size=chunk_size)
        print(f"Created {len(chunks)} chunks")
        
        # Generate embeddings and upload to Qdrant
        points = []
        for i, chunk in enumerate(chunks):
            # Generate embedding
            embedding = self.embed_text(chunk['text'])
            
            # Create point for Qdrant
            point = PointStruct(
                id=hash(f"{chunk['metadata']['filename']}_{i}") % (2**63),  # Generate unique ID
                vector=embedding,
                payload={
                    'text': chunk['text'],
                    'chunk_id': chunk['chunk_id'],
                    'total_chunks': chunk['total_chunks'],
                    **chunk['metadata']
                }
            )
            points.append(point)
            
            if (i + 1) % 10 == 0:
                print(f"  Embedded {i + 1}/{len(chunks)} chunks")
        
        # Upload to Qdrant
        self.qdrant_client.upsert(
            collection_name=self.collection_name,
            points=points
        )
        print(f"✓ Indexed {len(chunks)} chunks from {Path(pdf_path).name}")
    
    def index_directory(self, directory: str, pattern: str = "*.pdf"):
        """Index all PDFs in a directory"""
        pdf_files = list(Path(directory).glob(pattern))
        print(f"Found {len(pdf_files)} PDF files")
        
        for pdf_file in pdf_files:
            try:
                self.index_document(str(pdf_file))
            except Exception as e:
                print(f"Error processing {pdf_file}: {e}")
    
    def search(
        self,
        query: str,
        top_k: int = 5,
        court_filter: Optional[str] = None,
        date_after: Optional[str] = None
    ) -> List[Dict]:
        """Search for relevant document chunks"""
        
        # Generate query embedding
        query_embedding = self.embed_text(query)
        
        # Build filters
        filters = []
        if court_filter:
            filters.append(FieldCondition(
                key="court",
                match=MatchValue(value=court_filter)
            ))
        
        search_filter = Filter(must=filters) if filters else None
        
        # Search Qdrant
        results = self.qdrant_client.search(
            collection_name=self.collection_name,
            query_vector=query_embedding,
            limit=top_k,
            query_filter=search_filter
        )
        
        # Format results
        formatted_results = []
        for result in results:
            formatted_results.append({
                'text': result.payload['text'],
                'score': result.score,
                'metadata': {
                    'case_name': result.payload.get('case_name', 'Unknown'),
                    'citation': result.payload.get('citation', 'N/A'),
                    'court': result.payload.get('court', 'Unknown'),
                    'date_filed': result.payload.get('date_filed', 'Unknown'),
                    'filename': result.payload.get('filename', 'Unknown')
                }
            })
        
        return formatted_results
    
    def ask(
        self,
        question: str,
        top_k: int = 5,
        court_filter: Optional[str] = None,
        model: str = "claude-sonnet-4-20250514"
    ) -> Dict:
        """Ask a question and get an answer with citations"""
        
        # Search for relevant chunks
        results = self.search(query=question, top_k=top_k, court_filter=court_filter)
        
        if not results:
            return {
                'answer': "I couldn't find any relevant information in the indexed cases.",
                'sources': []
            }
        
        # Build context from results
        context_parts = []
        for i, result in enumerate(results, 1):
            context_parts.append(
                f"[Source {i}] {result['metadata']['case_name']} "
                f"({result['metadata']['citation']}, {result['metadata']['court']})\n"
                f"{result['text']}\n"
            )
        
        context = "\n---\n".join(context_parts)
        
        # Build prompt
        prompt = f"""You are a legal research assistant. Answer the following question based ONLY on the provided case excerpts. 

Always cite your sources using [Source X] notation. If the information isn't in the provided excerpts, say so.

Question: {question}

Case Excerpts:
{context}

Provide a clear, well-reasoned answer with specific citations."""
        
        # Query Claude
        response = self.anthropic_client.messages.create(
            model=model,
            max_tokens=2000,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
        
        answer = response.content[0].text
        
        return {
            'answer': answer,
            'sources': [r['metadata'] for r in results],
            'num_sources': len(results)
        }


def main():
    """Example usage"""
    
    # Configuration
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "your-openai-key-here")
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "your-anthropic-key-here")
    
    if OPENAI_API_KEY == "your-openai-key-here" or ANTHROPIC_API_KEY == "your-anthropic-key-here":
        print("ERROR: Please set your API keys!")
        print("Set environment variables OPENAI_API_KEY and ANTHROPIC_API_KEY")
        print("Or edit them in the script")
        return
    
    # Initialize RAG system (using in-memory Qdrant for demo)
    rag = LegalRAG(
        openai_api_key=OPENAI_API_KEY,
        anthropic_api_key=ANTHROPIC_API_KEY,
        qdrant_url=":memory:",  # Use ":memory:" for local, or "http://localhost:6333" for Qdrant server
        collection_name="legal_cases"
    )
    
    # Index documents
    # Example 1: Index a single document
    # rag.index_document("path/to/case.pdf")
    
    # Example 2: Index a directory
    # rag.index_directory("courtlistener_downloads/")
    
    # Example queries
    print("\n" + "="*60)
    print("LEGAL RAG SYSTEM - READY")
    print("="*60)
    
    # Example 1: Simple question
    result = rag.ask("What is the legal standard for qualified immunity?")
    print("\nQuestion: What is the legal standard for qualified immunity?")
    print(f"\nAnswer:\n{result['answer']}")
    print(f"\nSources used: {result['num_sources']}")
    
    # Example 2: Filtered search
    result = rag.ask(
        "How do courts analyze Fourth Amendment searches?",
        court_filter="Supreme Court"
    )
    print("\n" + "="*60)
    print("\nQuestion: How do courts analyze Fourth Amendment searches?")
    print(f"\nAnswer:\n{result['answer']}")
    
    # Example 3: Direct search (no LLM)
    results = rag.search("habeas corpus", top_k=3)
    print("\n" + "="*60)
    print("\nDirect search results for 'habeas corpus':")
    for i, r in enumerate(results, 1):
        print(f"\n{i}. {r['metadata']['case_name']} (Score: {r['score']:.3f})")
        print(f"   {r['text'][:200]}...")


if __name__ == "__main__":
    main()
