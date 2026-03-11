import React, { useState } from "react";

const ACTION_LABELS = {
  create_draft_email: "Draft Email",
  send_email: "Send Email",
  create_task: "Create Task",
  update_deal_stage: "Move Deal Stage",
  add_note: "Add Note",
};

export default function ActionConfirm({ actions, onConfirm, onDiscard }) {
  const [expanded, setExpanded] = useState(null);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.headerIcon}>{"\u26A0\uFE0F"}</span>
        <span style={styles.headerText}>
          {actions.length} action{actions.length > 1 ? "s" : ""} pending confirmation
        </span>
      </div>

      <div style={styles.actionList}>
        {actions.map((action, i) => (
          <div key={i} style={styles.actionItem}>
            <div
              style={styles.actionHeader}
              onClick={() => setExpanded(expanded === i ? null : i)}
            >
              <span style={styles.actionLabel}>
                {ACTION_LABELS[action.tool] || action.tool}
              </span>
              {action.input.to_email && (
                <span style={styles.actionMeta}>{action.input.to_email}</span>
              )}
              {action.input.title && (
                <span style={styles.actionMeta}>{action.input.title}</span>
              )}
              <span style={styles.expandIcon}>{expanded === i ? "\u25B2" : "\u25BC"}</span>
            </div>

            {expanded === i && (
              <div style={styles.actionDetail}>
                {action.input.subject && (
                  <div><strong>Subject:</strong> {action.input.subject}</div>
                )}
                {action.input.body && (
                  <div style={styles.bodyPreview}>
                    <strong>Body:</strong>
                    <div style={styles.bodyText}>{action.input.body}</div>
                  </div>
                )}
                {action.input.new_stage && (
                  <div><strong>New Stage:</strong> {action.input.new_stage}</div>
                )}
                {action.input.due_date && (
                  <div><strong>Due:</strong> {action.input.due_date}</div>
                )}
                {action.input.note_body && (
                  <div style={styles.bodyPreview}>
                    <strong>Note:</strong>
                    <div style={styles.bodyText}>{action.input.note_body}</div>
                  </div>
                )}
                <div style={{ marginTop: 4, fontSize: 12, color: "#7c98b6" }}>
                  Deal ID: {action.input.deal_id}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={styles.buttons}>
        <button
          style={styles.confirmBtn}
          onClick={() => onConfirm(actions.map((a) => ({ tool: a.tool, input: a.input })))}
        >
          Confirm All
        </button>
        <button style={styles.discardBtn} onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    border: "1px solid #f5c26b",
    borderRadius: 8,
    backgroundColor: "#fffbf2",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    backgroundColor: "#fff3cd",
    borderBottom: "1px solid #f5c26b",
  },
  headerIcon: {
    fontSize: 16,
  },
  headerText: {
    fontSize: 13,
    fontWeight: 600,
    color: "#33475b",
  },
  actionList: {
    padding: "8px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  actionItem: {
    border: "1px solid #e5e5e5",
    borderRadius: 6,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  actionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    cursor: "pointer",
    fontSize: 13,
  },
  actionLabel: {
    fontWeight: 600,
    color: "#33475b",
  },
  actionMeta: {
    color: "#516f90",
    fontSize: 12,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  expandIcon: {
    fontSize: 10,
    color: "#7c98b6",
  },
  actionDetail: {
    padding: "8px 12px",
    borderTop: "1px solid #eee",
    fontSize: 13,
    color: "#33475b",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  bodyPreview: {
    marginTop: 4,
  },
  bodyText: {
    marginTop: 4,
    padding: 8,
    backgroundColor: "#f5f8fa",
    borderRadius: 4,
    fontSize: 12,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    maxHeight: 150,
    overflowY: "auto",
  },
  buttons: {
    display: "flex",
    gap: 8,
    padding: "10px 14px",
    borderTop: "1px solid #f5c26b",
  },
  confirmBtn: {
    flex: 1,
    padding: "8px 16px",
    backgroundColor: "#00bda5",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  discardBtn: {
    flex: 1,
    padding: "8px 16px",
    backgroundColor: "#fff",
    color: "#516f90",
    border: "1px solid #cbd6e2",
    borderRadius: 4,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
};
