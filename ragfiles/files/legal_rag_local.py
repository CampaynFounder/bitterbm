#!/usr/bin/env python3
"""
Legal RAG System - Fully Local Implementation
Uses local embeddings + ChromaDB + local LLM (via Ollama)

Cost: $0/month (after hardware)
Privacy: Complete - nothing leaves your machine
"""

import os
from typing import List, Dict, Optional
from pathlib import Path
import json

# pip install chromadb sentence-transformers pymupdf ollama
import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer
import fitz  # PyMuPDF
try:
    import ollama
    OLLAMA_AVAILABLE = True
except ImportError:
    OLLAMA_AVAILABLE = False
    print("Warning: ollama not installed. Install with: pip install ollama")


class LocalLegalRAG:
    """
    Fully local RAG system for legal documents
    
    Requirements:
    1. Install Ollama: https://ollama.ai/
    2. Pull a model: ollama pull mistral (or qwen2.5, mixtral, etc.)
    3. pip install chromadb sentence-transformers pymupdf ollama
    """
    
    def __init__(
        self,
        persist_directory: str = "./chroma_db",
        collection_name: str = "legal_cases",
        embedding_model: str = "BAAI/bge-large-en-v1.5",
        llm_model: str = "mistral"  # or "qwen2.5", "mixtral", "llama3.1"
    ):
        """
        Initialize local RAG system
        
        Embedding models (ranked by quality):
        - BAAI/bge-large-en-v1.5 (1024d, best quality, slower)
        - BAAI/bge-base-en-v1.5 (768d, good balance)
        - all-MiniLM-L6-v2 (384d, fastest, lower quality)
        
        LLM models (via Ollama):
        - mistral (7B, fast, good quality)
        - qwen2.5 (7B/14B/32B, excellent quality)
        - mixtral (8x7B, very good but slower)
        - llama3.1 (8B/70B, excellent)
        """
        
        # Initialize embedding model
        print(f"Loading embedding model: {embedding_model}")
        self.embedding_model = SentenceTransformer(embedding_model)
        self.embedding_dimension = self.embedding_model.get_sentence_embedding_dimension()
        print(f"Embedding dimension: {self.embedding_dimension}")
        
        # Initialize ChromaDB
        self.chroma_client = chromadb.PersistentClient(
            path=persist_directory,
            settings=Settings(anonymized_telemetry=False)
        )
        
        # Get or create collection
        self.collection = self.chroma_client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"}
        )
        
        self.llm_model = llm_model
        
        # Verify Ollama is running
        if OLLAMA_AVAILABLE:
            try:
                ollama.list()
                print(f"✓ Ollama connected, using model: {llm_model}")
            except Exception as e:
                print(f"⚠ Ollama not running: {e}")
                print("Start Ollama with: ollama serve")
                print(f"Pull model with: ollama pull {llm_model}")
    
    def embed_text(self, text: str) -> List[float]:
        """Generate embedding for text using local model"""
        embedding = self.embedding_model.encode(text, normalize_embeddings=True)
        return embedding.tolist()
    
    def process_pdf(self, pdf_path: str) -> Dict:
        """Extract text and metadata from PDF"""
        doc = fitz.open(pdf_path)
        
        full_text = ""
        for page in doc:
            full_text += page.get_text()
        
        metadata = {
            'filename': Path(pdf_path).name,
            'page_count': len(doc),
            'source': str(pdf_path)
        }
        
        doc.close()
        
        # Try to extract case name and citation
        lines = full_text[:2000].split('\n')
        for line in lines:
            if ' v. ' in line or ' v ' in line:
                metadata['case_name'] = line.strip()
                break
        
        return {'text': full_text, 'metadata': metadata}
    
    def chunk_text(self, text: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
        """Chunk text with overlap"""
        chunks = []
        start = 0
        
        while start < len(text):
            end = start + chunk_size
            chunk = text[start:end]
            
            # Try to end at sentence boundary
            if end < len(text):
                last_period = chunk.rfind('.')
                last_newline = chunk.rfind('\n')
                boundary = max(last_period, last_newline)
                if boundary > start + chunk_size // 2:  # Only if in second half
                    end = start + boundary + 1
                    chunk = text[start:end]
            
            chunks.append(chunk.strip())
            start = end - overlap
        
        return chunks
    
    def index_document(self, pdf_path: str, chunk_size: int = 1000):
        """Index a PDF document"""
        print(f"\nProcessing: {pdf_path}")
        
        # Extract text
        doc_data = self.process_pdf(pdf_path)
        text = doc_data['text']
        metadata = doc_data['metadata']
        
        # Chunk text
        chunks = self.chunk_text(text, chunk_size=chunk_size)
        print(f"Created {len(chunks)} chunks")
        
        # Prepare for ChromaDB
        ids = []
        embeddings = []
        documents = []
        metadatas = []
        
        for i, chunk in enumerate(chunks):
            # Generate unique ID
            doc_id = f"{metadata['filename']}_{i}"
            ids.append(doc_id)
            
            # Generate embedding
            embedding = self.embed_text(chunk)
            embeddings.append(embedding)
            
            # Store chunk text
            documents.append(chunk)
            
            # Store metadata
            chunk_metadata = metadata.copy()
            chunk_metadata['chunk_id'] = i
            chunk_metadata['total_chunks'] = len(chunks)
            metadatas.append(chunk_metadata)
            
            if (i + 1) % 10 == 0:
                print(f"  Embedded {i + 1}/{len(chunks)} chunks")
        
        # Add to ChromaDB
        self.collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=documents,
            metadatas=metadatas
        )
        
        print(f"✓ Indexed {len(chunks)} chunks from {metadata['filename']}")
    
    def index_directory(self, directory: str, pattern: str = "*.pdf"):
        """Index all PDFs in a directory"""
        pdf_files = list(Path(directory).glob(pattern))
        print(f"Found {len(pdf_files)} PDF files")
        
        for pdf_file in pdf_files:
            try:
                self.index_document(str(pdf_file))
            except Exception as e:
                print(f"Error processing {pdf_file}: {e}")
    
    def search(self, query: str, top_k: int = 5) -> List[Dict]:
        """Search for relevant chunks"""
        
        # Generate query embedding
        query_embedding = self.embed_text(query)
        
        # Search ChromaDB
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k
        )
        
        # Format results
        formatted_results = []
        for i in range(len(results['ids'][0])):
            formatted_results.append({
                'text': results['documents'][0][i],
                'distance': results['distances'][0][i],
                'metadata': results['metadatas'][0][i]
            })
        
        return formatted_results
    
    def ask(
        self,
        question: str,
        top_k: int = 5,
        temperature: float = 0.1,
        max_tokens: int = 2000
    ) -> Dict:
        """Ask a question using local LLM"""
        
        if not OLLAMA_AVAILABLE:
            return {
                'answer': "Ollama not available. Install with: pip install ollama",
                'sources': []
            }
        
        # Search for relevant context
        results = self.search(query=question, top_k=top_k)
        
        if not results:
            return {
                'answer': "No relevant information found in indexed documents.",
                'sources': []
            }
        
        # Build context
        context_parts = []
        for i, result in enumerate(results, 1):
            case_name = result['metadata'].get('case_name', 'Unknown Case')
            context_parts.append(
                f"[Source {i}] {case_name}\n{result['text']}\n"
            )
        
        context = "\n---\n".join(context_parts)
        
        # Build prompt
        system_prompt = """You are a legal research assistant. Answer questions based ONLY on the provided case excerpts. 
Always cite your sources using [Source X] notation. 
Be precise and quote relevant passages when appropriate.
If the information isn't in the provided excerpts, clearly state that."""
        
        user_prompt = f"""Question: {question}

Case Excerpts:
{context}

Provide a clear answer with specific citations to the sources."""
        
        # Query local LLM via Ollama
        try:
            print(f"\nQuerying {self.llm_model}...")
            response = ollama.chat(
                model=self.llm_model,
                messages=[
                    {'role': 'system', 'content': system_prompt},
                    {'role': 'user', 'content': user_prompt}
                ],
                options={
                    'temperature': temperature,
                    'num_predict': max_tokens
                }
            )
            
            answer = response['message']['content']
            
        except Exception as e:
            answer = f"Error querying LLM: {e}\n\nMake sure Ollama is running: ollama serve\nAnd model is pulled: ollama pull {self.llm_model}"
        
        return {
            'answer': answer,
            'sources': [r['metadata'] for r in results],
            'num_sources': len(results)
        }
    
    def get_stats(self) -> Dict:
        """Get database statistics"""
        count = self.collection.count()
        
        return {
            'total_chunks': count,
            'collection_name': self.collection.name,
            'embedding_model': self.embedding_model.get_sentence_embedding_dimension()
        }


def main():
    """Example usage"""
    
    print("="*60)
    print("LOCAL LEGAL RAG SYSTEM")
    print("="*60)
    
    # Initialize local RAG
    rag = LocalLegalRAG(
        persist_directory="./legal_chroma_db",
        collection_name="legal_cases",
        embedding_model="BAAI/bge-base-en-v1.5",  # Good balance of speed/quality
        llm_model="mistral"  # Change to qwen2.5, mixtral, llama3.1, etc.
    )
    
    # Index documents
    # Example 1: Single document
    # rag.index_document("path/to/case.pdf")
    
    # Example 2: Directory
    # rag.index_directory("courtlistener_downloads/")
    
    # Get stats
    stats = rag.get_stats()
    print(f"\nDatabase stats:")
    print(f"  Total chunks indexed: {stats['total_chunks']}")
    
    # Example queries
    if stats['total_chunks'] > 0:
        print("\n" + "="*60)
        print("EXAMPLE QUERY")
        print("="*60)
        
        # Simple search
        results = rag.search("qualified immunity", top_k=3)
        print("\nSearch results for 'qualified immunity':")
        for i, r in enumerate(results, 1):
            print(f"\n{i}. {r['metadata'].get('case_name', 'Unknown')}")
            print(f"   Distance: {r['distance']:.3f}")
            print(f"   {r['text'][:200]}...")
        
        # Ask question with LLM
        if OLLAMA_AVAILABLE:
            print("\n" + "="*60)
            result = rag.ask("What is the legal standard for qualified immunity?")
            print("\nQuestion: What is the legal standard for qualified immunity?")
            print(f"\nAnswer:\n{result['answer']}")
            print(f"\nSources used: {result['num_sources']}")
    else:
        print("\nNo documents indexed yet. Use:")
        print("  rag.index_document('path/to/case.pdf')")
        print("  rag.index_directory('path/to/cases/')")
    
    print("\n" + "="*60)
    print("SETUP INSTRUCTIONS")
    print("="*60)
    print("""
1. Install Ollama:
   - Visit https://ollama.ai/
   - Download and install for your OS
   
2. Pull a model:
   ollama pull mistral
   
   Other options:
   - ollama pull qwen2.5:7b (excellent quality)
   - ollama pull mixtral (larger, better quality)
   - ollama pull llama3.1:8b (very good)
   
3. Start Ollama (if not auto-started):
   ollama serve
   
4. Run this script!
""")


if __name__ == "__main__":
    main()
