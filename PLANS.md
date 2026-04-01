# CLAUDE.md

## PROJECT: Astra Docs

---

## Overview

Astra Docs is a Retrieval-Augmented Generation (RAG) system designed to centralize, index, and make searchable all Astra documentation, including:

- README.md files  
- PDF documents  
- .docx files  

Currently, documentation is organized in a hierarchical tree structure, and a script exists to generate a global PDF from all sources. However, this approach is not efficient for developers who need fast, contextual access to information.

**Objective:**  
Provide an intelligent conversational interface (RAG-based) that enables users to query documentation semantically and retrieve precise, contextual answers.

---

## Core Features

### 1. RAG System

- Ingest and index multiple document formats (Markdown, PDF, DOCX)
- Preserve document structure (hierarchy, sections, metadata)
- Semantic search using embeddings
- Context-aware answer generation
- Source attribution (references to documents and sections)

---

### 2. User Interface

The application is structured around two main panels:

#### Left Panel (Navigation / History)

- Displays chat history grouped by projects
- Projects are user-specific
- Users can:
  - Create projects
  - Delete projects
  - Delete chats
- Persistent storage of conversations

#### Right Panel (Chat / Responses)

- Displays conversation messages (similar to ChatGPT / Claude Code)
- Each chat maintains full history (context-aware)
- Supports:
  - Text input
  - Voice input

#### Layout

- Panels separated by a resizable splitter
- Default ratio: **1:3 (left:right)**

---

### 3. Authentication & Authorization

#### Authentication Methods

- HORIBA SSO  
- Gmail  
- Email-based authentication  

#### Authorization Workflow

- All new users must be validated by an administrator
- Only validated users can access chat features

#### User Roles

**USER**
- Access chat
- Manage personal projects only

**ADMIN**
- Validate user access requests
- Manage users
- Add / update / delete documents in the RAG system
- Trigger document re-indexing

---

### 4. Document Management (Admin)

Admins can:

- Upload new documents
- Organize documents within the hierarchy
- Update or delete documents
- Trigger re-indexing of the knowledge base

System requirements:

- Automatic document processing and chunking
- Optional but recommended versioning
- Consistency between source documents and embeddings

---

### 5. Chat Capabilities

- Natural language queries over documentation
- Multi-turn conversations (context retained)
- Voice-to-text input support
- Streaming responses (recommended)
- Ability to reference:
  - Specific files
  - Sections
  - Code snippets

---

### 6. Data & Indexing

#### Document Ingestion Pipeline

- Parsing (Markdown, PDF, DOCX)
- Chunking (semantic or structured)
- Embedding generation
- Storage in a vector database for retrieval

#### Metadata Indexing

- Document name
- Path in hierarchy
- Tags / categories

---

### 7. Non-Functional Requirements

- Fast response time (**< 2–3 seconds target**)
- Scalable indexing pipeline
- Secure role-based access control
- Auditability:
  - Track user queries (optional)
  - Track document updates
- High reliability for internal usage

---

## Future Extensions (Optional)

- Code-aware search (README + codebases)
- Integration with Git repositories
- Highlight answers directly in documents
- Feedback system (thumbs up/down)
- Fine-tuning or reranking for improved relevance

---

## Summary

Astra Docs transforms static documentation into an intelligent, conversational knowledge system. It enables developers to access information quickly, reduces time spent searching through documents, and improves overall productivity.