import React from "react";

const TOOL_LABELS = {
  get_pipeline_summary: "Fetching pipeline summary",
  get_deals: "Searching deals",
  get_deal_detail: "Loading deal details",
  get_stale_deals: "Finding stale deals",
  get_contacts: "Searching contacts",
  create_draft_email: "Creating draft email",
  send_email: "Sending email",
  create_task: "Creating task",
  update_deal_stage: "Updating deal stage",
  add_note: "Adding note",
};

const STATUS_ICONS = {
  executing: "\u{1F50D}",
  complete: "\u2705",
  error: "\u274C",
  pending_confirmation: "\u23F3",
};

export default function ToolStatus({ steps }) {
  if (!steps || steps.length === 0) return null;

  return (
    <div style={styles.container}>
      {steps.map((step, i) => (
        <div key={i} style={styles.step}>
          <span style={styles.icon}>{STATUS_ICONS[step.status] || "\u{1F504}"}</span>
          <span style={styles.label}>
            {TOOL_LABELS[step.tool] || step.tool}
          </span>
          {step.status === "error" && (
            <span style={styles.error}> — {step.error}</span>
          )}
        </div>
      ))}
    </div>
  );
}

const styles = {
  container: {
    padding: "8px 12px",
    backgroundColor: "#eaf0f6",
    borderRadius: 8,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  step: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: "#33475b",
  },
  icon: {
    fontSize: 14,
    width: 20,
    textAlign: "center",
  },
  label: {
    fontWeight: 500,
  },
  error: {
    color: "#d94c53",
    fontSize: 12,
  },
};
