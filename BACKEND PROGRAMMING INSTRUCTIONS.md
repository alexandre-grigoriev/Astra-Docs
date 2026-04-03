Read CLAUDE.md, then read docs/ARCHITECTURE.md, docs/RAG_PIPELINE.md, docs/NEO4J_SCHEMA.md, and docs/CODING_STANDARDS.md in full before writing any code.

Your task is to implement the RAG backend by refactoring the existing kb.js and creating new modules. Do not touch any file inside frontend/.

Work in this exact order:

1. backend/utils/config.js
   - Centralise all process.env access
   - Validate required vars at startup, throw descriptive error if missing

2. backend/utils/logger.js
   - Structured logger, human-readable in development, JSON in production
   - Detect via process.env.NODE_ENV

3. backend/graph/driver.js
   - Neo4j driver singleton
   - Export readQuery() and writeQuery() helpers

4. backend/graph/schema.js
   - Create chunk_embedding_index and entity_embedding_index (3072 dims, cosine)
   - Create unique constraints for KBDocument, KBChunk, KBEntity
   - Run once at server startup, use IF NOT EXISTS

5. backend/graph/queries/document.js
6. backend/graph/queries/chunk.js
7. backend/graph/queries/entity.js
   - All Cypher queries as named exported functions
   - Always MERGE, never CREATE alone
   - Never interpolate variables into Cypher strings

8. backend/ingestion/extractor.js
   - PDF via pdf-parse, MD via regex (strip YAML front matter + syntax, inject IMAGE_REF tokens), DOCX via mammoth

9. backend/ingestion/chunker.js
   - 500-word chunks, 50-word overlap
   - IMAGE_REF tokens must never be split across chunks

10. backend/ingestion/image_resolver.js
    - Resolve IMAGE_REF tokens to disk at uploads/kb-images/<docId>/<relative-path>
    - Return cleanText (tokens removed) and images[] (public URLs)

11. backend/ingestion/enricher.js
    - Single Gemini call per chunk using the exact prompt in RAG_PIPELINE.md
    - On JSON parse failure: return cleanText as enrichedText, empty entities and relations

12. backend/ingestion/embedder.js
    - gemini-embedding-001, 3 retries with exponential backoff
    - RETRIEVAL_DOCUMENT for ingestion, RETRIEVAL_QUERY for queries

13. backend/ingestion/pipeline.js
    - Orchestrate steps 1-8 in the exact order specified in RAG_PIPELINE.md
    - Sequential chunk processing (never parallel Gemini calls)
    - A single chunk failure must not abort the pipeline

14. backend/ingestion/batch_processor.js
    - ZIP extraction, imageMap construction
    - SSE events: processing, file_done, file_error, done
    - A single file failure must not abort the batch

15. backend/retrieval/strategies.js
    - 4 retrieval functions with the exact Cypher from RAG_PIPELINE.md

16. backend/retrieval/merger.js
    - Deduplicate by chunkId, keep highest score, sort descending

17. backend/retrieval/expander.js
    - Fetch PREV/NEXT neighbors for top chunks not already in results
    - Cap at topK + 2

18. backend/retrieval/translator.js
    - Skip if target language is 'fr'
    - Single batched Gemini call for all FR chunks
    - On failure: keep original text, never throw

19. backend/retrieval/query_pipeline.js
    - Orchestrate query steps 1-10 from RAG_PIPELINE.md
    - Run 4 retrieval strategies in parallel
    - Return { text, images }

20. Refactor backend/kb.js
    - Replace all inline extraction/chunking/enrichment/embedding logic
    - kb.js becomes a thin orchestrator that calls pipeline.js and query_pipeline.js

21. Update backend/routes/knowledgeBase.js
    - Wire upload handler to pipeline.js
    - Add SSE batch-progress endpoint using batch_processor.js
    - Preserve all existing endpoint shapes exactly

After each file, confirm what was written and flag any assumption you made.
Do not proceed to the next file until the current one compiles without errors.