export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
}

export interface ChatSummary {
  id: string;
  title: string;
  created_at: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  created_at: string;
  chats: ChatSummary[];
}
