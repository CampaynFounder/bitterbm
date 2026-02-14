# Building a RAG System for Court Cases: Cost-Effective Guide

## TL;DR - Best Approach for Most Use Cases

**Recommended Stack:**
- **Embeddings**: OpenAI `text-embedding-3-small` ($0.02/1M tokens) or Voyage AI
- **Vector DB**: Qdrant (local/free) or Pinecone (free tier: 1GB)
- **LLM**: Claude Sonnet 4 via API (best quality/cost) or GPT-4o-mini (cheapest)
- **Framework**: LlamaIndex or LangChain
- **Document Processing**: Unstructured.io or PyMuPDF

**Why this works:**
- ✅ Extremely cost-effective (~$5-20/month for thousands of documents)
- ✅ Production-ready with minimal infrastructure
- ✅ Can run locally for sensitive data
- ✅ Easy to maintain and iterate

## Detailed Approach Comparison

### Option 1: Cloud RAG (Recommended for Most)
**Cost**: ~$10-50/month for moderate usage
**Best for**: Most users, production apps, teams

**Pros:**
- No infrastructure management
- Scales automatically
- Best embeddings quality
- Easy deployment

**Cons:**
- Data leaves your infrastructure
- Ongoing API costs
- Vendor lock-in

### Option 2: Hybrid Local RAG
**Cost**: $0/month (after GPU purchase) or ~$100-300/month cloud GPU
**Best for**: Sensitive data, high query volume, cost optimization

**Pros:**
- Complete data privacy
- No ongoing API costs after setup
- Full control
- Can fine-tune models

**Cons:**
- Requires GPU (~$500-2000 for RTX 3060-4090)
- More technical complexity
- Slower inference than cloud APIs

### Option 3: Fully Local Small Model
**Cost**: $0/month (CPU only possible)
**Best for**: Maximum privacy, offline use, learning

**Pros:**
- Zero ongoing costs
- Complete privacy
- Works offline
- Educational value

**Cons:**
- Lower quality responses
- Slower
- More setup complexity

## Implementation Guide

### OPTION 1: Cloud RAG (Easiest Start)

This uses cloud embeddings + vector DB + Claude/GPT for generation.

#### Cost Breakdown
- Embeddings: ~$0.02-0.10 per 1M tokens (one-time per document)
- Vector storage: $0-25/month (Pinecone free tier or Qdrant Cloud)
- LLM queries: ~$0.003 per query (Claude Sonnet) or $0.0001 (GPT-4o-mini)

**For 10,000 court cases:**
- Embedding cost: ~$20-50 one-time
- Storage: Free to $25/month
- 1000 queries/month: ~$3-10/month
- **Total: ~$30/month after initial setup**

#### Document Processing Strategy

Legal documents need special handling:

1. **PDF Extraction** - Preserve structure
2. **Chunking** - Smart splitting (by section, not arbitrary)
3. **Metadata** - Extract court, date, citation, judges
4. **Embedding** - Generate vectors
5. **Storage** - Vector DB with metadata filters

### OPTION 2: Hybrid Local RAG

Use local embeddings + local vector DB + cloud LLM.

#### Cost Breakdown
- Embeddings: $0 (local model)
- Vector storage: $0 (local Qdrant/Chroma)
- LLM queries: ~$0.003 per query (Claude API)
- Hardware: $500-2000 one-time GPU cost

**For 10,000 court cases:**
- Initial hardware: $500-2000
- Monthly cost: ~$3-10 for LLM queries only
- **Total: ~$5-10/month ongoing**

#### Recommended Local Models
- **Embeddings**: `bge-large-en-v1.5` or `e5-large-v2` (free, SOTA)
- **Vector DB**: Qdrant (local mode) or ChromaDB
- **Generation**: Claude API (best) or local Mixtral 8x7B

### OPTION 3: Fully Local

Everything runs on your hardware.

#### Hardware Requirements
- **Minimum**: 16GB RAM, 8GB VRAM (RTX 3060 12GB)
- **Recommended**: 32GB RAM, 12GB+ VRAM (RTX 4070+)
- **Optimal**: 64GB RAM, 24GB VRAM (RTX 4090)

#### Model Recommendations
- **Small/Fast**: Mistral 7B, Phi-3-mini (3.8B)
- **Medium**: Mixtral 8x7B (needs ~40GB VRAM quantized)
- **Large/Best**: Qwen2.5 32B, Command-R+ (needs ~80GB VRAM)

## Key Architecture Decisions

### 1. Chunking Strategy for Legal Documents

**Don't use naive chunking!** Legal docs need smart splitting:

```python
# BAD: Arbitrary character splits
chunks = split_text(doc, chunk_size=1000)

# GOOD: Semantic/structural splits
chunks = split_by_sections(doc)  # I., II., A., B., etc.
chunks = split_by_paragraphs_with_overlap(doc)
```

**Recommended:**
- Chunk by legal sections when possible
- Use 512-1024 token chunks with 128 token overlap
- Preserve headers and structure in metadata
- Keep related content together (e.g., holding + reasoning)

### 2. Metadata is Critical

Extract and index:
- Court name
- Case citation
- Date filed
- Judge(s)
- Case type
- Parties
- Legal topics/keywords

This enables:
- Filtered searches ("Show me 9th Circuit cases after 2020")
- Better retrieval (metadata boosting)
- Citation tracking
- Temporal analysis

### 3. Retrieval Strategy

**Hybrid search performs best:**
1. **Dense retrieval** (embeddings) - semantic similarity
2. **Sparse retrieval** (BM25) - keyword matching (citations, party names)
3. **Metadata filtering** - court, date, type

**Reranking:**
After initial retrieval, use a reranker like:
- `cohere-rerank-english-v3.0` (API, very good)
- `bge-reranker-large` (local, free, good)

This dramatically improves precision.

### 4. Embedding Model Choice

**Cloud (Best Quality):**
- OpenAI `text-embedding-3-small` - $0.02/1M tokens, 1536 dims
- Voyage AI `voyage-law-2` - Legal-specific, $0.12/1M tokens
- Cohere `embed-english-v3` - $0.10/1M tokens

**Local (Free):**
- `bge-large-en-v1.5` - 1024 dims, excellent quality
- `e5-large-v2` - 1024 dims, very good
- `gte-large` - 1024 dims, good speed/quality

For legal documents, domain-specific matters:
- Voyage Law is trained on legal text (best but pricey)
- General models work well but may miss legal nuances
- Consider fine-tuning if you have budget

### 5. Vector Database

**Local:**
- **Qdrant** - Best features, fast, Docker/local mode
- **ChromaDB** - Simplest, embedded database
- **Milvus** - Enterprise features, more complex

**Cloud:**
- **Pinecone** - Easiest, free tier (1GB), $70/month for 5GB
- **Qdrant Cloud** - Good pricing, $0.35/GB/month
- **Weaviate Cloud** - Free tier available

For legal RAG: Use Qdrant (local or cloud). Best filtering + fast.

## Cost Optimization Tips

1. **Batch embed documents** - Don't re-embed unnecessarily
2. **Cache queries** - Store common Q&A pairs
3. **Use smaller context windows** - Retrieve 3-5 chunks, not 10+
4. **Implement query routing** - Simple questions → GPT-4o-mini, complex → Claude
5. **Compress prompts** - Remove unnecessary tokens
6. **Use metadata filtering aggressively** - Reduces embedding search scope

## Special Considerations for Legal RAG

### Citation Extraction & Linking
Legal docs are heavily cross-referenced. Build:
- Citation parser (Regex or NLP)
- Citation graph (which cases cite which)
- Automatic retrieval of cited cases

### Judicial Opinion Structure
Understand document parts:
- Syllabus (summary)
- Facts
- Holdings
- Reasoning
- Dissents/Concurrences

Index these separately for better retrieval.

### Hallucination Prevention
Legal AI must be accurate. Implement:
- **Citation grounding** - Require citations for claims
- **Confidence scoring** - Flag uncertain answers
- **Source display** - Always show which case/page
- **Fact checking** - Verify dates, citations, holdings

### Privacy & Compliance
If handling sealed/sensitive cases:
- Use local deployment
- Implement access controls
- Audit query logs
- Consider data retention policies

## Implementation Complexity

**Easiest → Hardest:**
1. LangChain + OpenAI embeddings + Pinecone + Claude API (1-2 days)
2. LlamaIndex + local embeddings + Qdrant + Claude API (2-3 days)
3. Custom pipeline + local embeddings + ChromaDB + local LLM (5-10 days)
4. Production system with fine-tuning, reranking, eval (2-4 weeks)

## Recommendations by Use Case

**Solo Lawyer / Small Firm:**
→ Option 1 (Cloud RAG) with GPT-4o-mini
- Simple, cheap, works immediately
- ~$20-30/month

**Law Firm with Sensitive Cases:**
→ Option 2 (Hybrid) or Option 3 (Fully Local)
- Data stays on-premises
- One-time GPU investment
- ~$500-2000 setup, minimal ongoing

**Legal Tech Startup:**
→ Option 1 with production features
- Scale as you grow
- Use Voyage Law embeddings
- Add reranking + caching
- ~$100-500/month depending on usage

**Researcher / Learning:**
→ Option 3 (Fully Local)
- Free ongoing
- Full control
- Educational

## Next Steps

Would you like me to build:
1. Complete working code for any of these options?
2. A comparison script to test different approaches?
3. A production-ready RAG system with evaluation?

I can also help with:
- Document processing pipeline
- Chunking strategy for legal docs
- Citation extraction
- Evaluation framework
