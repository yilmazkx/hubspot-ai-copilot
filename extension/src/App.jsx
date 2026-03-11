import React, { useState, useCallback } from "react";
import {
  Flex,
  Text,
  Input,
  Button,
  Box,
  Divider,
  LoadingSpinner,
  Alert,
  Tag,
  hubspot,
} from "@hubspot/ui-extensions";

// The backend URL — use ngrok or deployed URL
const BACKEND_URL = "{{BACKEND_URL}}";

hubspot.extend(({ context, runServerlessFunction, actions }) => (
  <CopilotApp context={context} runServerlessFunction={runServerlessFunction} actions={actions} />
));

function CopilotApp({ context, runServerlessFunction, actions }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [toolSteps, setToolSteps] = useState([]);
  const [pendingActions, setPendingActions] = useState([]);
  const [error, setError] = useState(null);

  const portalId = context?.portal?.id || "demo";
  const objectId = context?.crm?.objectId || null;
  const objectType = context?.crm?.objectType || null;

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setToolSteps([]);
    setPendingActions([]);
    setError(null);

    try {
      const result = await runServerlessFunction({
        name: "chat",
        parameters: {
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          portalId,
          dealId: objectType === "DEAL" ? objectId : null,
        },
      });

      const data = result.response;
      if (data.error) {
        setError(data.error);
      } else {
        setMessages([...newMessages, { role: "assistant", content: data.response }]);
        setToolSteps(data.toolSteps || []);
        if (data.pendingActions?.length > 0) {
          setPendingActions(data.pendingActions);
        }
      }
    } catch (err) {
      setError("Failed to reach the backend. Check your configuration.");
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading, portalId, objectId, objectType, runServerlessFunction]);

  const handleConfirm = useCallback(async () => {
    setLoading(true);
    try {
      const result = await runServerlessFunction({
        name: "confirm",
        parameters: {
          portalId,
          actions: pendingActions.map((a) => ({ tool: a.tool, input: a.input })),
        },
      });
      const data = result.response;
      const summary = data.results
        .map((r) =>
          r.status === "success"
            ? `${r.tool}: Done`
            : `${r.tool}: Failed — ${r.error}`
        )
        .join("\n");
      setMessages((prev) => [...prev, { role: "assistant", content: `Actions executed:\n${summary}` }]);
      setPendingActions([]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Failed to execute actions." }]);
    } finally {
      setLoading(false);
    }
  }, [pendingActions, portalId, runServerlessFunction]);

  const handleDiscard = useCallback(() => {
    setPendingActions([]);
    setMessages((prev) => [...prev, { role: "assistant", content: "Actions discarded." }]);
  }, []);

  return (
    <Flex direction="column" gap="sm">
      {/* Header */}
      <Flex direction="row" align="center" gap="sm">
        <Tag variant="success">AI</Tag>
        <Text format={{ fontWeight: "bold" }}>CRM Copilot</Text>
      </Flex>

      <Divider />

      {/* Empty state */}
      {messages.length === 0 && !loading && (
        <Flex direction="column" gap="sm" align="center">
          <Text format={{ fontWeight: "bold" }}>Hi! I'm your CRM Copilot.</Text>
          <Text variant="microcopy">Try asking:</Text>
          {[
            "Show me my pipeline summary",
            "Find stale deals with no activity in 14 days",
            "Draft follow-up emails for Demo Done deals",
          ].map((s) => (
            <Button
              key={s}
              variant="secondary"
              size="sm"
              onClick={() => {
                setInput(s);
              }}
            >
              {s}
            </Button>
          ))}
        </Flex>
      )}

      {/* Messages */}
      {messages.map((msg, i) => (
        <Box key={i}>
          <Text variant="microcopy" format={{ fontWeight: "bold" }}>
            {msg.role === "user" ? "You" : "Copilot"}
          </Text>
          <Text>{msg.content}</Text>
        </Box>
      ))}

      {/* Tool steps */}
      {toolSteps.length > 0 && (
        <Alert variant="info" title="Actions taken">
          {toolSteps.map((s, i) => (
            <Text key={i} variant="microcopy">
              {s.status === "complete" ? "✓" : s.status === "error" ? "✗" : "⏳"}{" "}
              {s.tool}
            </Text>
          ))}
        </Alert>
      )}

      {/* Loading */}
      {loading && <LoadingSpinner label="Thinking..." />}

      {/* Error */}
      {error && <Alert variant="danger" title="Error">{error}</Alert>}

      {/* Pending actions */}
      {pendingActions.length > 0 && (
        <Alert variant="warning" title={`${pendingActions.length} action(s) need confirmation`}>
          {pendingActions.map((a, i) => (
            <Text key={i} variant="microcopy">
              {a.tool}: {a.input.to_email || a.input.title || a.input.new_stage || a.input.note_body?.substring(0, 50)}
            </Text>
          ))}
          <Flex direction="row" gap="sm">
            <Button variant="primary" size="sm" onClick={handleConfirm}>
              Confirm All
            </Button>
            <Button variant="secondary" size="sm" onClick={handleDiscard}>
              Discard
            </Button>
          </Flex>
        </Alert>
      )}

      <Divider />

      {/* Input */}
      <Flex direction="row" gap="sm">
        <Input
          name="chat-input"
          placeholder="Ask about deals, pipeline, contacts..."
          value={input}
          onChange={(val) => setInput(val)}
          onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
          readOnly={loading}
        />
        <Button variant="primary" onClick={sendMessage} disabled={loading || !input.trim()}>
          Send
        </Button>
      </Flex>
    </Flex>
  );
}
