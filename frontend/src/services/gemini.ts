const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY ?? "";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
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
): Promise<{ context: string; sources: KBSource[] }> {
  try {
    const res = await fetch("/api/knowledge-base/search", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: message, lang }),
    });
    if (!res.ok) return { context: "", sources: [] };
    const data = await res.json();
    if (!Array.isArray(data.chunks) || !data.chunks.length) return { context: "", sources: [] };
    const sources: KBSource[] = Array.isArray(data.sources) ? data.sources : [];
    const chunkFiles: (string | null)[] = Array.isArray(data.chunkFiles) ? data.chunkFiles : [];
    const context = data.chunks.map((c: string, i: number) => {
      const label = chunkFiles[i] ?? `source ${i + 1}`;
      return `[${label}]\n${c}`;
    }).join("\n---\n");
    return { context, sources };
  } catch {
    return { context: "", sources: [] };
  }
}

export async function sendToGemini(
  message: string,
  history: ChatMessage[],
  lang = "fr"
): Promise<string> {
  const { context: kbContext, sources: kbSources } = await fetchKnowledgeBaseContext(message, lang);

  let system = "You are a smart documentation assistant for Astra Docs. Be concise and helpful. Format your answers using markdown (use **bold**, bullet lists, etc.) when appropriate.\n";

  if (kbContext) {
    system += `\nKnowledge base context (use this as primary source):\n${kbContext}\n`;
    if (kbSources.length) {
      const srcList = kbSources
        .map((s, i) => `[${i + 1}] "${s.filename}"${s.documentDate ? ` (${s.documentDate})` : ""}`)
        .join(", ");
      system += `Source documents: ${srcList}\n`;
      system += "When referencing the knowledge base, cite the source document by name. ";
    }
    system += "If the answer is in the knowledge base, base your answer strictly on it. If not found, say so clearly.\n";
  }

  const conv = [...history, { role: "user" as const, text: message }]
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
    .join("\n");

  return callGemini(system + conv + "\nAssistant:");
}
