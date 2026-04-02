import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Mic } from "lucide-react";
import { Card } from "../ui/Card";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";
import { cn, t } from "../../utils";
import type { ChatSummary, ChatMessage } from "../../types";

export function ChatPanel({
  chat,
  messages,
  lang,
  isThinking,
  input,
  onInputChange,
  onSend,
}: {
  chat: ChatSummary | null;
  messages: ChatMessage[];
  lang: string;
  isThinking: boolean;
  input: string;
  onInputChange: (v: string) => void;
  onSend: (text?: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const speech = useSpeechRecognition(lang);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isThinking]);

  return (
    <Card className="chatCard">
      <div className="chatHeader">
        <div className="chatTitle">{chat?.title ?? "Contextual Knowledge System"}</div>
        <div className="chatSub">Ask anything. Get everything.</div>
      </div>

      <div className="chatBody">
        <div className="chatScroll" ref={scrollRef}>
          {messages.length === 0 && !isThinking && (
            <div className="msgRow msgRowAsst">
              <div className="msgMeta"><span className="msgRole">ASSISTANT</span></div>
              <div className="msgBubble msgBubbleAsst">
                {t(lang).welcome}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={cn("msgRow", m.role === "user" ? "msgRowUser" : "msgRowAsst")}>
              <div className="msgMeta">
                <span className="msgRole">{m.role === "user" ? "YOU" : "ASSISTANT"}</span>
                <span className="msgTime">
                  {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div className={cn("msgBubble", m.role === "user" ? "msgBubbleUser" : "msgBubbleAsst")}>
                {m.role === "assistant"
                  ? <div className="mdContent"><ReactMarkdown>{m.text}</ReactMarkdown></div>
                  : m.text}
                {m.role === "assistant" && m.images && m.images.length > 0 && (
                  <div className="msgImages">
                    {m.images.map((url) => (
                      <img key={url} src={url} alt="" className="msgImage" />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isThinking && (
            <div className="msgRow msgRowAsst">
              <div className="msgMeta"><span className="msgRole">ASSISTANT</span></div>
              <div className="msgBubble msgBubbleAsst msgBubbleThinking">
                <span className="thinkingDot" /><span className="thinkingDot" /><span className="thinkingDot" />
              </div>
            </div>
          )}
        </div>

        <div className="chatInputRow">
          <input
            className="chatInput"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && input.trim()) onSend(); }}
            placeholder="Type your question…"
            disabled={isThinking}
          />
          {input.trim() ? (
            <button className="chatInputIconBtn" onClick={() => onSend()} disabled={isThinking} title="Send">
              <img src="/send.png" alt="Send" className="chatInputIcon" />
            </button>
          ) : (
            <button
              className={cn("chatInputIconBtn", speech.isRecording && "chatMicRecording")}
              title={speech.supported ? (speech.isRecording ? "Release to send" : "Hold to speak") : "Voice not supported"}
              onPointerDown={(e) => { e.preventDefault(); speech.start((text) => onSend(text)); }}
              onPointerUp={(e) => { e.preventDefault(); speech.stop(); }}
              onPointerLeave={(e) => { e.preventDefault(); if (speech.isRecording) speech.stop(); }}
              onPointerCancel={(e) => { e.preventDefault(); if (speech.isRecording) speech.stop(); }}
              disabled={!speech.supported}
            >
              {speech.isRecording
                ? <Mic className="chatInputIcon" style={{ color: "#e53e3e" }} />
                : <img src="/microphone.png" alt="Mic" className="chatInputIcon" />}
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}
