const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY ?? "";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

/**
 * Rough token estimate for the current chat context.
 * Uses the ~4 chars/token heuristic plus a fixed overhead for the system
 * prompt and KB context (which vary per query but average ~2 000 tokens).
 */
export function estimateTokens(history: ChatMessage[], pendingInput = ""): number {
  const SYSTEM_OVERHEAD = 2_000; // system prompt + average KB context
  const historyChars = history.reduce((sum, m) => sum + m.text.length, 0);
  const inputChars   = pendingInput.length;
  return SYSTEM_OVERHEAD + Math.ceil((historyChars + inputChars) / 4);
}

interface KBSource { filename: string; documentDate: string | null; }

async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

async function fetchKnowledgeBaseContext(
  message: string,
  lang: string
): Promise<{ context: string; sources: KBSource[]; images: string[] }> {
  try {
    const res = await fetch("/api/knowledge-base/search", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: message, lang }),
    });
    if (!res.ok) return { context: "", sources: [], images: [] };
    const data = await res.json();
    if (!Array.isArray(data.chunks) || !data.chunks.length) return { context: "", sources: [], images: [] };
    const sources: KBSource[] = Array.isArray(data.sources) ? data.sources : [];
    const chunkFiles: (string | null)[] = Array.isArray(data.chunkFiles) ? data.chunkFiles : [];
    const chunkImages: string[][] = Array.isArray(data.chunkImages) ? data.chunkImages : [];
    const context = data.chunks.map((c: string, i: number) => {
      const label = chunkFiles[i];
      return label ? `[${label}]\n${c}` : c;
    }).join("\n---\n");
    // Collect images from the top 2 unique files in results (sorted by relevance).
    // Using only top-2 files avoids pulling in images from lower-ranked documents
    // (e.g. Examples.md sandbox screenshots) while still showing images from both
    // the primary and secondary relevant documents (e.g. Concept.md + Design.md).
    const seenFiles = new Set<string>();
    const topFiles: string[] = [];
    for (const f of chunkFiles) {
      if (f && !seenFiles.has(f)) { seenFiles.add(f); topFiles.push(f); }
      if (topFiles.length === 2) break;
    }
    const images = [
      ...new Set(chunkFiles.flatMap((f, i) => topFiles.includes(f ?? "") ? (chunkImages[i] ?? []) : []))
    ] as string[];
    return { context, sources, images };
  } catch {
    return { context: "", sources: [], images: [] };
  }
}

export async function sendToGemini(
  message: string,
  history: ChatMessage[],
  lang = "fr"
): Promise<{ text: string; images: string[] }> {
  const { context: kbContext, sources: kbSources, images } = await fetchKnowledgeBaseContext(message, lang);

  let system = "You are a smart documentation assistant for Astra Docs. Be concise and helpful. Format your answers using markdown (use **bold**, bullet lists, etc.) when appropriate.\n";

  if (kbContext) {
    system += `\nKnowledge base context (use this as primary source):\n${kbContext}\n`;
    if (kbSources.length) {
      system += "Each context passage is labeled with its source filename in brackets, e.g. [Block.md]. ";
      system += "When citing information, reference the document by its filename exactly as it appears in the label, e.g. \"as described in Block.md\" or \"(Block.md)\". Do not use numbered citations like [1] or [2]. ";
    }
    if (images.length) {
      system += `The relevant diagrams and images from the knowledge base are displayed automatically to the user. Do not say there are no images. `;
    }
    system += "If the answer is in the knowledge base, base your answer strictly on it. If not found, say so clearly.\n";
  }

  const conv = [...history, { role: "user" as const, text: message }]
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
    .join("\n");

  const text = await callGemini(system + conv + "\nAssistant:");
  return { text, images };
}
