// Mock HubSpot data for demo mode (no API keys needed)

const MOCK_CONTACTS = [
  { contactId: "101", firstname: "Sarah", lastname: "Chen", email: "sarah@acmecorp.com", phone: "+1-555-0101", jobtitle: "VP of Engineering", company: "Acme Corp" },
  { contactId: "102", firstname: "James", lastname: "Wilson", email: "james@globex.io", phone: "+1-555-0102", jobtitle: "CTO", company: "Globex Industries" },
  { contactId: "103", firstname: "Maria", lastname: "Garcia", email: "maria@initech.com", phone: "+1-555-0103", jobtitle: "Head of Product", company: "Initech" },
  { contactId: "104", firstname: "David", lastname: "Park", email: "david@umbrella.co", phone: "+1-555-0104", jobtitle: "Director of Ops", company: "Umbrella LLC" },
  { contactId: "105", firstname: "Emma", lastname: "Thompson", email: "emma@wayneent.com", phone: "+1-555-0105", jobtitle: "CEO", company: "Wayne Enterprises" },
];

const MOCK_DEALS = [
  { dealId: "1001", dealname: "Acme Corp — Platform License", dealstage: "appointmentscheduled", amount: "45000", hubspot_owner_id: "1", closedate: "2026-04-15", createdate: "2026-01-10", hs_lastmodifieddate: "2026-03-10", pipeline: "default", contacts: [MOCK_CONTACTS[0]] },
  { dealId: "1002", dealname: "Globex Industries — Annual Contract", dealstage: "qualifiedtobuy", amount: "120000", hubspot_owner_id: "1", closedate: "2026-05-01", createdate: "2026-02-01", hs_lastmodifieddate: "2026-03-09", pipeline: "default", contacts: [MOCK_CONTACTS[1]] },
  { dealId: "1003", dealname: "Initech — Pilot Program", dealstage: "presentationscheduled", amount: "25000", hubspot_owner_id: "1", closedate: "2026-03-30", createdate: "2026-01-20", hs_lastmodifieddate: "2026-02-20", pipeline: "default", contacts: [MOCK_CONTACTS[2]] },
  { dealId: "1004", dealname: "Umbrella LLC — Enterprise Suite", dealstage: "decisionmakerboughtin", amount: "200000", hubspot_owner_id: "1", closedate: "2026-04-30", createdate: "2026-02-15", hs_lastmodifieddate: "2026-02-15", pipeline: "default", contacts: [MOCK_CONTACTS[3]] },
  { dealId: "1005", dealname: "Wayne Enterprises — Custom Integration", dealstage: "closedwon", amount: "350000", hubspot_owner_id: "1", closedate: "2026-03-01", createdate: "2025-12-01", hs_lastmodifieddate: "2026-03-01", pipeline: "default", contacts: [MOCK_CONTACTS[4]] },
  { dealId: "1006", dealname: "Globex — Add-on Modules", dealstage: "presentationscheduled", amount: "35000", hubspot_owner_id: "1", closedate: "2026-04-10", createdate: "2026-02-10", hs_lastmodifieddate: "2026-02-10", pipeline: "default", contacts: [MOCK_CONTACTS[1]] },
];

const STAGES = [
  { id: "appointmentscheduled", label: "Appointment Scheduled", displayOrder: 0 },
  { id: "qualifiedtobuy", label: "Qualified to Buy", displayOrder: 1 },
  { id: "presentationscheduled", label: "Presentation Scheduled", displayOrder: 2 },
  { id: "decisionmakerboughtin", label: "Decision Maker Bought-In", displayOrder: 3 },
  { id: "contractsent", label: "Contract Sent", displayOrder: 4 },
  { id: "closedwon", label: "Closed Won", displayOrder: 5 },
  { id: "closedlost", label: "Closed Lost", displayOrder: 6 },
];

async function getPipelineSummary() {
  const stageData = STAGES.map((stage) => {
    const deals = MOCK_DEALS.filter((d) => d.dealstage === stage.id);
    return {
      stageId: stage.id,
      stageName: stage.label,
      dealCount: deals.length,
      totalValue: deals.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0),
    };
  });
  return [{ pipelineId: "default", pipelineName: "Sales Pipeline", stages: stageData }];
}

async function getDeals(_portalId, filters = {}) {
  let deals = [...MOCK_DEALS];
  if (filters.stage) {
    deals = deals.filter((d) => d.dealstage === filters.stage);
  }
  if (filters.min_value) {
    deals = deals.filter((d) => parseFloat(d.amount) >= filters.min_value);
  }
  if (filters.stale_days) {
    const cutoff = Date.now() - filters.stale_days * 86400000;
    deals = deals.filter((d) => new Date(d.hs_lastmodifieddate).getTime() < cutoff);
  }
  if (filters.limit) {
    deals = deals.slice(0, filters.limit);
  }
  return deals;
}

async function getDealDetail(_portalId, dealId) {
  const deal = MOCK_DEALS.find((d) => d.dealId === dealId);
  if (!deal) return { error: `Deal ${dealId} not found` };
  return {
    ...deal,
    recentActivity: [
      { type: "note", timestamp: "2026-03-08T14:30:00Z", body: "Had a productive call. They're interested in the premium tier." },
      { type: "note", timestamp: "2026-03-01T10:00:00Z", body: "Sent pricing proposal. Waiting for feedback from their finance team." },
      { type: "note", timestamp: "2026-02-20T09:15:00Z", body: "Initial discovery call completed. Key pain points: manual reporting, no CRM integration." },
    ],
  };
}

async function getStaleDeals(_portalId, days) {
  const cutoff = Date.now() - days * 86400000;
  return MOCK_DEALS.filter((d) => new Date(d.hs_lastmodifieddate).getTime() < cutoff).map((d) => ({
    dealId: d.dealId,
    dealname: d.dealname,
    dealstage: d.dealstage,
    amount: d.amount,
    hs_lastmodifieddate: d.hs_lastmodifieddate,
  }));
}

async function getContacts(_portalId, query) {
  const q = query.toLowerCase();
  return MOCK_CONTACTS.filter(
    (c) =>
      c.firstname.toLowerCase().includes(q) ||
      c.lastname.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.company.toLowerCase().includes(q)
  );
}

async function createDraftEmail(_portalId, dealId, toEmail, subject, body) {
  return { emailId: `mock-email-${Date.now()}`, status: "draft", subject, toEmail, dealId };
}

async function sendEmail(_portalId, dealId, toEmail, subject, body) {
  return { emailId: `mock-email-${Date.now()}`, status: "sent", subject, toEmail, dealId };
}

async function createTask(_portalId, dealId, title, dueDate, notes) {
  return { taskId: `mock-task-${Date.now()}`, title, dueDate, status: "created", dealId };
}

async function updateDealStage(_portalId, dealId, newStage) {
  return { dealId, newStage, status: "updated" };
}

async function addNote(_portalId, dealId, noteBody) {
  return { noteId: `mock-note-${Date.now()}`, status: "created", dealId };
}

module.exports = {
  getPipelineSummary,
  getDeals,
  getDealDetail,
  getStaleDeals,
  getContacts,
  createDraftEmail,
  sendEmail,
  createTask,
  updateDealStage,
  addNote,
};
