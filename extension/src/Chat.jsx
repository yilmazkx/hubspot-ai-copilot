import React, { useState, useRef, useEffect } from "react";
import Message from "./Message";
import ToolStatus from "./ToolStatus";
import ActionConfirm from "./ActionConfirm";

export default function Chat({ portalId, dealId, backendUrl }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [toolSteps, setToolSteps] = useState([]);
  const [pendingActions, setPendingActions] = useState([]);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, toolSteps]);

  async function sendMessage(e) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setToolSteps([]);
    setPendingActions([]);

    try {
      const res = await fetch(`${backendUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          portalId,
          dealId,
        }),
      });

      const data = await res.json();

      if (data.error) {
        setMessages([...newMessages, { role: "assistant", content: `Error: ${data.error}` }]);
      } else {
        setMessages([...newMessages, { role: "assistant", content: data.response }]);
        setToolSteps(data.toolSteps || []);
        if (data.pendingActions?.length > 0) {
          setPendingActions(data.pendingActions);
        }
      }
    } catch (err) {
      setMessages([
        ...newMessages,
        { role: "assistant", content: "Failed to reach the backend. Is the server running?" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(actions) {
    setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/chat/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portalId, actions }),
      });
      const data = await res.json();

      const summary = data.results
        .map((r) => {
          if (r.status === "success") return `${r.tool}: Done`;
          return `${r.tool}: Failed — ${r.error}`;
        })
        .join("\n");

      setMessages((prev) => [...prev, { role: "assistant", content: `Actions executed:\n${summary}` }]);
      setPendingActions([]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Failed to execute actions." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleDiscard() {
    setPendingActions([]);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "Actions discarded." },
    ]);
  }

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerIcon}>AI</span>
        <span style={styles.headerTitle}>CRM Copilot</span>
      </div>

      {/* Messages area */}
      <div style={styles.messagesArea}>
        {messages.length === 0 && (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>Hi! I'm your CRM Copilot.</p>
            <p style={styles.emptyHint}>Try asking:</p>
            <div style={styles.suggestions}>
              {[
                "Show me my pipeline summary",
                "Find deals with no activity in 14 days",
                "Draft follow-up emails for Demo Done deals",
              ].map((s) => (
                <button
                  key={s}
                  style={styles.suggestion}
                  onClick={() => {
                    setInput(s);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <Message key={i} role={msg.role} content={msg.content} />
        ))}

        {/* Tool status feed */}
        {loading && toolSteps.length > 0 && <ToolStatus steps={toolSteps} />}

        {/* Loading indicator */}
        {loading && toolSteps.length === 0 && (
          <div style={styles.thinking}>
            <span style={styles.dot1}>.</span>
            <span style={styles.dot2}>.</span>
            <span style={styles.dot3}>.</span>
            <span style={{ marginLeft: 4, color: "#516f90", fontSize: 13 }}>Thinking</span>
          </div>
        )}

        {/* Action confirmation */}
        {pendingActions.length > 0 && (
          <ActionConfirm
            actions={pendingActions}
            onConfirm={handleConfirm}
            onDiscard={handleDiscard}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form onSubmit={sendMessage} style={styles.inputArea}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your deals, pipeline, contacts..."
          style={styles.input}
          disabled={loading}
        />
        <button type="submit" style={styles.sendBtn} disabled={loading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

const styles = {
  wrapper: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 400,
    backgroundColor: "#f5f8fa",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 16px",
    borderBottom: "1px solid #cbd6e2",
    backgroundColor: "#fff",
  },
  headerIcon: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "#ff7a59",
    color: "#fff",
    fontSize: 11,
    fontWeight: 700,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: "#33475b",
  },
  messagesArea: {
    flex: 1,
    overflowY: "auto",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  emptyState: {
    textAlign: "center",
    padding: "32px 16px",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "#33475b",
    marginBottom: 4,
  },
  emptyHint: {
    fontSize: 13,
    color: "#516f90",
    marginBottom: 12,
  },
  suggestions: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    alignItems: "center",
  },
  suggestion: {
    padding: "8px 16px",
    border: "1px solid #cbd6e2",
    borderRadius: 20,
    backgroundColor: "#fff",
    color: "#33475b",
    fontSize: 13,
    cursor: "pointer",
    maxWidth: 320,
    width: "100%",
  },
  thinking: {
    display: "flex",
    alignItems: "center",
    padding: "8px 12px",
  },
  dot1: { color: "#516f90", fontSize: 24, animation: "pulse 1.4s infinite 0s" },
  dot2: { color: "#516f90", fontSize: 24, animation: "pulse 1.4s infinite 0.2s" },
  dot3: { color: "#516f90", fontSize: 24, animation: "pulse 1.4s infinite 0.4s" },
  inputArea: {
    display: "flex",
    gap: 8,
    padding: "12px 16px",
    borderTop: "1px solid #cbd6e2",
    backgroundColor: "#fff",
  },
  input: {
    flex: 1,
    padding: "10px 12px",
    border: "1px solid #cbd6e2",
    borderRadius: 6,
    fontSize: 14,
    outline: "none",
  },
  sendBtn: {
    padding: "10px 20px",
    backgroundColor: "#ff7a59",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
};
