# Plan : Dépasser le LLM-Wiki de Karpathy

> **Contexte** — Andrej Karpathy a publié un système de wiki maintenu par LLM :
> sources brutes → LLM génère des pages Markdown → wiki Obsidian interrogeable.
> Référence : https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
>
> Ce document planifie comment Astra Docs peut dépasser ce système sur chaque dimension.

---

## Analyse comparative

| Dimension | Karpathy LLM-Wiki | Astra Docs (état actuel) | Astra Docs (cible) |
|---|---|---|---|
| Stockage | Fichiers Markdown plats | Neo4j + SQLite | Neo4j + pages de synthèse auto |
| Recherche | BM25 optionnel (Qmd) | Semantic RAG (4 stratégies) | Hybrid BM25 + semantic |
| Embeddings | Aucun natif | Gemini (3072 dims) par chunk | Hiérarchiques (section → phrase) |
| Images | Non traitées | SVG/PNG stockées, référencées | Caption Gemini Vision |
| Liens entre docs | Non exploités | Non exploités | Graphe `REFERENCES` dans Neo4j |
| Wiki auto-maintenu | Oui (cœur du système) | Non | Pages de synthèse par domaine |
| Scale | ~100 docs | Illimité (Neo4j) | Illimité |
| Multi-utilisateurs | Non (local Obsidian) | Oui (LDAP, OAuth, email) | Oui |
| MCP / IDE | Non | Oui (VS Code) | Étendu |

---

## Axes d'amélioration

### AXE 1 — Indexation sémantique fine-grained

**Problème actuel**
Les embeddings sont calculés sur des chunks de 500 mots. Une question pointue
("quel est le paramètre exact `acquisitionTime` du bloc Andor ?") retrouve le bon
document mais pas forcément la ligne exacte.

**Solution**
Indexation hiérarchique à 3 niveaux :

```
KBDocument
  └── KBSection  (niveau H2/H3 du Markdown)
        └── KBChunk  (500 mots, overlap 50)
              └── KBSentence  (phrases clés extraites par LLM)
```

- Embedding + nœud Neo4j pour chaque niveau
- Retrieval : cherche d'abord au niveau `Section`, affine au niveau `Chunk`/`Sentence`
- Résultat : précision chirurgicale sur les paramètres techniques

**Impact** : élevé  
**Effort** : moyen (modifier le pipeline d'ingestion + schéma Neo4j)

---

### AXE 2 — Exploitation des images (Gemini Vision)

**Problème actuel**
Les images (diagrammes de blocs Astra, schémas SVG, captures d'écran) sont
stockées et affichées mais leur **contenu** n'est pas indexé. Une question sur
"l'architecture du bloc OPCUA" ne retrouve pas les schémas UML.

**Solution**
À l'ingestion de chaque image :

1. Appel Gemini Vision → génère une **caption structurée** :
   ```json
   {
     "description": "Diagramme de classes du AstraOPCUAServerBlock...",
     "entities": ["AstraOPCUAServerBlock", "AstraOPCUAController"],
     "type": "class_diagram"
   }
   ```
2. Caption stockée dans le nœud `KBChunk` lié à l'image
3. Caption embeddie et indexée comme n'importe quel texte

**Impact** : très élevé (les docs Astra sont remplis de diagrammes)  
**Effort** : faible (ajouter un appel Gemini Vision dans `image_resolver.js`)

---

### AXE 3 — Navigation structurée (graphe de liens Markdown)

**Problème actuel**
Les liens Markdown (`[voir Design](./Block/Design.md)`) sont ignorés lors du parsing.
La relation "ce document référence cet autre document" est perdue.

**Solution**
Parser les liens Markdown à l'ingestion → créer des arêtes Neo4j :

```cypher
(doc1:KBDocument)-[:REFERENCES { anchor: "Design" }]->(doc2:KBDocument)
```

Nouvelles stratégies de retrieval :
- **Forward navigation** : "quels docs sont référencés par ce résultat ?"
- **Backlinks** : "quels docs pointent vers ce concept ?"
- Traversée 2 hops → surface des documents connexes non trouvés par similarité

**Impact** : élevé (la doc Astra est fortement liée entre fichiers)  
**Effort** : moyen (modifier le Markdown parser + ajouter stratégie de retrieval)

---

### AXE 4 — Hybrid retrieval (BM25 + semantic)

**Problème actuel**
La recherche est full-sémantique. Les identifiants techniques exacts
(`Astra.Block.Device.Detector.Andor`, `AstraInstanceId`, `readI2C`)
sont mal retrouvés si la formulation de la question diffère légèrement.

**Solution**
Retrieval en deux passes :

```
Query
  ├── BM25 (exact keyword match) ──────────┐
  └── Semantic (embedding cosine sim) ─────┤
                                           ▼
                              Reciprocal Rank Fusion (RRF)
                                           ▼
                                     Top-K chunks reclassés
```

- BM25 : excellent sur les noms de types, noms de paramètres, numéros de version
- Semantic : excellent sur les questions en langage naturel
- RRF : combine les deux scores sans paramètre de pondération à calibrer

**Impact** : élevé  
**Effort** : moyen (ajouter index full-text Neo4j + RRF dans le retrieval)

---

### AXE 5 — Wiki auto-maintenu (inspiré Karpathy, version GraphRAG)

**Problème actuel**
Astra Docs répond aux questions à la volée mais ne **capitalise pas** les synthèses
produites. Karpathy maintient des pages Markdown qui s'enrichissent avec le temps.

**Solution**
Après chaque ingestion de document, un agent LLM met à jour des **pages de synthèse**
par domaine fonctionnel :

```
Domaines détectés automatiquement :
  Astra.Block.Device.*     → page "Device Blocks"
  Astra.Block.Control.*    → page "Control Blocks"
  Astra.Block.Signal.*     → page "Signal Processing"
  Astra.MiddleWare.*       → page "Middleware Concepts"
```

Chaque page de synthèse = nœud `KBSynthesis` dans Neo4j :
- Contenu LLM-généré : liste des blocs, relations, paramètres clés
- Mis à jour incrémentalement (pas régénéré depuis zéro)
- Interrogeable directement par le pipeline RAG

Différence avec Karpathy : **automatique, structuré dans le graphe, multi-utilisateurs**.

**Impact** : très élevé (répond aux questions de haut niveau "quels blocs device existe-t-il ?")  
**Effort** : élevé (nouveau composant agent + schéma Neo4j étendu)

---

## Feuille de route

| Priorité | Axe | Effort | Impact | Prérequis |
|:---:|---|:---:|:---:|---|
| 1 | **AXE 2** — Captions images (Gemini Vision) | Faible | Très élevé | Aucun |
| 2 | **AXE 4** — Hybrid retrieval BM25 + semantic | Moyen | Élevé | Index full-text Neo4j |
| 3 | **AXE 3** — Graphe de liens Markdown | Moyen | Élevé | Aucun |
| 4 | **AXE 1** — Indexation hiérarchique | Moyen | Élevé | AXE 3 recommandé avant |
| 5 | **AXE 5** — Wiki auto-maintenu | Élevé | Très élevé | AXE 1 + 2 + 3 |

---

## AXE 2 — Spécification technique détaillée (premier à implémenter)

### Fichiers à modifier

| Fichier | Modification |
|---|---|
| `backend/ingestion/image_resolver.js` | Ajouter appel Gemini Vision après `saveImage()` |
| `backend/ingestion/pipeline.js` | Passer la caption au chunker / enricher |
| `backend/graph/neo4j_writer.js` | Stocker `imageCaption` sur le nœud `KBChunk` |
| `backend/retrieval/query.js` | Inclure `imageCaption` dans le texte embeddi |

### Schéma du nœud KBChunk enrichi

```cypher
(c:KBChunk {
  id: "...",
  text: "...",           // texte original
  enrichedText: "...",   // texte LLM-enrichi
  images: ["url1"],      // URLs images
  imageCaptions: [       // NOUVEAU
    {
      url: "url1",
      description: "Diagramme de classes AstraOPCUAServerBlock",
      entities: ["AstraOPCUAServerBlock"],
      type: "class_diagram"
    }
  ]
})
```

### Prompt Gemini Vision (par image)

```
Analyse ce diagramme technique extrait de la documentation HORIBA Astra.
Retourne un JSON avec :
- "description" : description en 1-2 phrases du contenu
- "entities" : liste des noms de classes / composants / blocs visibles
- "type" : "class_diagram" | "dataflow" | "block_diagram" | "screenshot" | "other"
Réponds uniquement avec le JSON, sans markdown.
```

---

## Références

- Karpathy LLM-Wiki : https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- Architecture actuelle : `docs/ARCHITECTURE.md`
- Pipeline d'ingestion : `docs/RAG_PIPELINE.md`
- Schéma Neo4j : `docs/NEO4J_SCHEMA.md`
- Roadmap produit : `PLANS.md` § Future Extensions
