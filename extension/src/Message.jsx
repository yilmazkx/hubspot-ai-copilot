import React from "react";

export default function Message({ role, content }) {
  const isUser = role === "user";

  return (
    <div style={{ ...styles.row, justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div style={isUser ? styles.userBubble : styles.assistantBubble}>
        {!isUser && <div style={styles.label}>Copilot</div>}
        <div style={styles.content}>
          {content.split("\n").map((line, i) => (
            <React.Fragment key={i}>
              {formatLine(line)}
              {i < content.split("\n").length - 1 && <br />}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatLine(line) {
  // Bold: **text**
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

const styles = {
  row: {
    display: "flex",
    width: "100%",
  },
  userBubble: {
    maxWidth: "85%",
    padding: "10px 14px",
    borderRadius: "16px 16px 4px 16px",
    backgroundColor: "#ff7a59",
    color: "#fff",
    fontSize: 14,
    lineHeight: 1.5,
  },
  assistantBubble: {
    maxWidth: "85%",
    padding: "10px 14px",
    borderRadius: "16px 16px 16px 4px",
    backgroundColor: "#fff",
    border: "1px solid #cbd6e2",
    color: "#33475b",
    fontSize: 14,
    lineHeight: 1.5,
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: "#516f90",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  content: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
};
