# CLAUDE.md

## PROJECT: Astra Docs

---

# 1. PURPOSE

This document defines:
- Coding standards
- Project architecture
- Development rules

It is **mandatory** for all contributors and for Claude Code generation.

Goal: ensure **clean, scalable, production-grade code** aligned with AI/RAG systems.

---

# 2. GLOBAL PRINCIPLES

## 2.1 General Philosophy

- Write **simple, readable, maintainable code**
- Avoid over-engineering
- Prefer **explicit over implicit**
- Follow **modular architecture**
- Every component must have a **single responsibility**

---

## 2.2 Naming Conventions

| Element        | Convention            | Example                     |
|----------------|----------------------|-----------------------------|
| Variables      | snake_case           | user_query                  |
| Functions      | snake_case           | generate_embedding          |
| Classes        | PascalCase           | DocumentProcessor           |
| Constants      | UPPER_CASE           | MAX_TOKENS                  |
| Files          | snake_case           | vector_store.py             |
| Folders        | kebab-case or snake  | document-processing/        |

---

## 2.3 Code Style

### Python
- Follow **PEP8**
- Max line length: **100–120**
- Use **type hints everywhere**
- Use **dataclasses / pydantic models**

### TypeScript (Frontend)
- Strict mode enabled
- Use interfaces/types explicitly
- Avoid `any`
- Prefer functional components

---

## 2.4 Comments & Documentation

- Use comments only when needed
- Explain **WHY**, not WHAT
- All public functions must have docstrings:

```python
def embed_text(text: str) -> list[float]:
    """
    Generate embedding vector from text.

    Args:
        text: Input text

    Returns:
        Embedding vector
    """
    