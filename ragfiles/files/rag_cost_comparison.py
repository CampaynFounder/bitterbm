#!/usr/bin/env python3
"""
RAG System Cost & Performance Comparison
Compare cloud vs local approaches for legal document RAG
"""

import time
from typing import Dict, List
from dataclasses import dataclass

@dataclass
class RAGConfig:
    name: str
    embedding_provider: str
    embedding_cost_per_1m_tokens: float
    vector_db: str
    vector_db_cost_per_gb_month: float
    llm_provider: str
    llm_cost_per_1k_tokens: float
    hardware_cost: float
    setup_complexity: str  # "Easy", "Medium", "Hard"
    privacy_level: str  # "Cloud", "Hybrid", "Local"


# Define different configurations
CONFIGS = {
    "cloud_premium": RAGConfig(
        name="Cloud Premium (Best Quality)",
        embedding_provider="OpenAI text-embedding-3-large",
        embedding_cost_per_1m_tokens=0.13,
        vector_db="Pinecone",
        vector_db_cost_per_gb_month=70.0,
        llm_provider="Claude Sonnet 4",
        llm_cost_per_1k_tokens=0.003,
        hardware_cost=0,
        setup_complexity="Easy",
        privacy_level="Cloud"
    ),
    
    "cloud_budget": RAGConfig(
        name="Cloud Budget (Best Value)",
        embedding_provider="OpenAI text-embedding-3-small",
        embedding_cost_per_1m_tokens=0.02,
        vector_db="Qdrant Cloud",
        vector_db_cost_per_gb_month=25.0,
        llm_provider="GPT-4o-mini",
        llm_cost_per_1k_tokens=0.00015,
        hardware_cost=0,
        setup_complexity="Easy",
        privacy_level="Cloud"
    ),
    
    "hybrid": RAGConfig(
        name="Hybrid (Privacy + Cloud LLM)",
        embedding_provider="Local (bge-large-en-v1.5)",
        embedding_cost_per_1m_tokens=0.0,
        vector_db="Qdrant Local",
        vector_db_cost_per_gb_month=0.0,
        llm_provider="Claude Sonnet 4",
        llm_cost_per_1k_tokens=0.003,
        hardware_cost=800,  # One-time GPU cost
        setup_complexity="Medium",
        privacy_level="Hybrid"
    ),
    
    "fully_local": RAGConfig(
        name="Fully Local (Maximum Privacy)",
        embedding_provider="Local (bge-large-en-v1.5)",
        embedding_cost_per_1m_tokens=0.0,
        vector_db="ChromaDB Local",
        vector_db_cost_per_gb_month=0.0,
        llm_provider="Local (Mistral 7B via Ollama)",
        llm_cost_per_1k_tokens=0.0,
        hardware_cost=800,  # One-time GPU cost
        setup_complexity="Hard",
        privacy_level="Local"
    ),
}


def estimate_costs(
    config: RAGConfig,
    num_documents: int,
    avg_pages_per_doc: int,
    queries_per_month: int,
    months: int = 12
) -> Dict:
    """
    Estimate costs for a RAG system
    
    Assumptions:
    - ~500 tokens per page
    - 3 chunks retrieved per query
    - 500 tokens per query + 1500 tokens retrieved context = 2000 tokens total to LLM
    - Database size: num_docs * avg_pages * 500 tokens * 1.5 bytes/token ≈ 0.75 KB per page
    """
    
    # Calculate document processing (one-time)
    total_pages = num_documents * avg_pages_per_doc
    total_tokens = total_pages * 500  # ~500 tokens per page
    
    embedding_cost = (total_tokens / 1_000_000) * config.embedding_cost_per_1m_tokens
    
    # Calculate storage
    db_size_gb = (total_tokens * 1.5) / (1024 ** 3)  # rough estimate
    storage_cost_monthly = db_size_gb * config.vector_db_cost_per_gb_month
    storage_cost_total = storage_cost_monthly * months
    
    # Calculate query costs
    tokens_per_query = 2000  # Query + context + response
    total_query_tokens = queries_per_month * tokens_per_query * months
    query_cost = (total_query_tokens / 1_000) * config.llm_cost_per_1k_tokens
    
    # Total costs
    setup_cost = embedding_cost + config.hardware_cost
    monthly_cost = storage_cost_monthly + (queries_per_month * tokens_per_query / 1_000 * config.llm_cost_per_1k_tokens)
    total_cost = setup_cost + storage_cost_total + query_cost
    
    return {
        'config_name': config.name,
        'setup_cost': setup_cost,
        'monthly_recurring': monthly_cost,
        'total_cost_year': setup_cost + (monthly_cost * 12),
        'breakdown': {
            'embedding_cost_onetime': embedding_cost,
            'hardware_cost_onetime': config.hardware_cost,
            'storage_cost_monthly': storage_cost_monthly,
            'query_cost_monthly': queries_per_month * tokens_per_query / 1_000 * config.llm_cost_per_1k_tokens,
        },
        'privacy_level': config.privacy_level,
        'setup_complexity': config.setup_complexity
    }


def print_comparison(scenarios: List[Dict]):
    """Print cost comparison table"""
    
    print("\n" + "="*100)
    print("RAG SYSTEM COST COMPARISON (1 YEAR)")
    print("="*100)
    
    print(f"\n{'Configuration':<30} {'Setup Cost':<15} {'Monthly Cost':<15} {'Total (1yr)':<15} {'Privacy':<10} {'Setup':<10}")
    print("-"*100)
    
    for scenario in scenarios:
        print(
            f"{scenario['config_name']:<30} "
            f"${scenario['setup_cost']:>12,.2f}  "
            f"${scenario['monthly_recurring']:>12,.2f}  "
            f"${scenario['total_cost_year']:>12,.2f}  "
            f"{scenario['privacy_level']:<10} "
            f"{scenario['setup_complexity']:<10}"
        )
    
    print("\n" + "="*100)
    print("COST BREAKDOWN")
    print("="*100)
    
    for scenario in scenarios:
        print(f"\n{scenario['config_name']}:")
        print(f"  One-time embedding cost: ${scenario['breakdown']['embedding_cost_onetime']:.2f}")
        print(f"  One-time hardware cost: ${scenario['breakdown']['hardware_cost_onetime']:.2f}")
        print(f"  Monthly storage cost: ${scenario['breakdown']['storage_cost_monthly']:.2f}")
        print(f"  Monthly query cost: ${scenario['breakdown']['query_cost_monthly']:.2f}")


def main():
    """Run cost analysis"""
    
    # Define usage scenarios
    scenarios = [
        {
            'name': 'Small Firm',
            'num_documents': 1000,
            'avg_pages_per_doc': 20,
            'queries_per_month': 500
        },
        {
            'name': 'Medium Firm',
            'num_documents': 10000,
            'avg_pages_per_doc': 25,
            'queries_per_month': 2000
        },
        {
            'name': 'Large Firm',
            'num_documents': 50000,
            'avg_pages_per_doc': 30,
            'queries_per_month': 10000
        },
    ]
    
    for scenario in scenarios:
        print("\n" + "#"*100)
        print(f"SCENARIO: {scenario['name'].upper()}")
        print(f"Documents: {scenario['num_documents']:,} | Avg pages: {scenario['avg_pages_per_doc']} | Queries/month: {scenario['queries_per_month']:,}")
        print("#"*100)
        
        results = []
        for config_name, config in CONFIGS.items():
            result = estimate_costs(
                config,
                num_documents=scenario['num_documents'],
                avg_pages_per_doc=scenario['avg_pages_per_doc'],
                queries_per_month=scenario['queries_per_month'],
                months=12
            )
            results.append(result)
        
        print_comparison(results)
    
    # Print recommendations
    print("\n" + "#"*100)
    print("RECOMMENDATIONS")
    print("#"*100)
    
    recommendations = """
    
1. SMALL FIRM (< 2,000 documents, < 1,000 queries/month)
   → Cloud Budget (OpenAI + Qdrant Cloud + GPT-4o-mini)
   - Total cost: ~$20-40/month
   - Easy setup, minimal maintenance
   - Good quality for most use cases
   
2. MEDIUM FIRM (2,000-20,000 documents, 1,000-5,000 queries/month)
   → Cloud Premium OR Hybrid
   - Cloud Premium: ~$100-300/month, best quality
   - Hybrid: ~$50-100/month after $800 GPU, better privacy
   
3. LARGE FIRM (20,000+ documents, 5,000+ queries/month)
   → Hybrid or Fully Local
   - Initial investment: $800-2,000 for GPU
   - Monthly cost: $0-100 (depending on cloud LLM usage)
   - ROI breakeven: 6-12 months
   - Required for maximum privacy
   
4. SENSITIVE/CLASSIFIED CASES
   → Fully Local ONLY
   - Zero data leaves your infrastructure
   - One-time setup: $800-2,000
   - Ongoing: $0/month
   
5. RESEARCH/LEARNING
   → Fully Local
   - Learn the stack
   - Experiment freely
   - No ongoing costs

COST OPTIMIZATION TIPS:

1. Cache common queries - Reduce LLM costs by 30-50%
2. Use hybrid approach - Local embedding + cloud LLM for best balance
3. Batch embedding - Embed documents in bulk during setup
4. Smart chunking - Larger chunks = fewer embeddings = lower cost
5. Aggressive metadata filtering - Reduce retrieval scope before embedding search
6. Use cheaper LLMs for simple queries - Route based on complexity
7. Implement query classification - Skip RAG for factual questions

QUALITY CONSIDERATIONS:

Embedding Quality (Best → Worst):
1. Voyage AI voyage-law-2 (legal-specific, expensive)
2. OpenAI text-embedding-3-large
3. OpenAI text-embedding-3-small
4. Local bge-large-en-v1.5
5. Local all-MiniLM-L6-v2

LLM Quality (Best → Worst):
1. Claude Opus 4
2. Claude Sonnet 4
3. GPT-4o
4. GPT-4o-mini
5. Local Mixtral 8x7B
6. Local Mistral 7B

For legal work, quality matters. Don't skimp on the LLM if accuracy is critical.
"""
    
    print(recommendations)


if __name__ == "__main__":
    main()
