/**
 * kb.js — re-export facade
 * All logic has been split into:
 *   ingestion/   — extraction, chunking, image resolution, enrichment, embedding, pipeline
 *   retrieval/   — strategies, merger, expander, translator, query pipeline
 *   graph/       — driver, schema, Cypher queries
 *   utils/       — config, logger
 */

export { SUPPORTED_EXTS }                    from "./utils/config.js";
export { KB_IMAGES_DIR }                     from "./ingestion/image_resolver.js";
export { getDriver, closeDriver }            from "./graph/driver.js";
export { initSchema as initKnowledgeBase }   from "./graph/schema.js";
export { listDocuments, deleteDocument }     from "./graph/queries/document.js";
export { ingestDocument }                    from "./ingestion/pipeline.js";
export { searchKnowledgeBase, translateChunks } from "./retrieval/query_pipeline.js";
export { extractText }                       from "./ingestion/extractor.js";
