const hubspot = require("@hubspot/api-client");

// Token storage — uses Redis when available, falls back to in-memory
const redisUrl = process.env.KV_REDIS_URL || process.env.KV_REST_API_URL;
const useRedis = !!redisUrl;
let redis;
if (useRedis) {
  const Redis = require("ioredis");
  redis = new Redis(redisUrl, { maxRetriesPerRequest: 2, lazyConnect: true });
  redis.connect().catch((err) => console.error("Redis connect error:", err.message));
}
const localStore = new Map();

async function storeTokens(portalId, tokens) {
  const data = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: Date.now() + tokens.expiresIn * 1000,
  };
  const key = `hs_tokens:${portalId}`;
  if (useRedis) {
    await redis.set(key, JSON.stringify(data), "EX", 60 * 60 * 24 * 90); // 90 day TTL
  } else {
    localStore.set(key, data);
  }
}

async function getTokens(portalId) {
  const key = `hs_tokens:${portalId}`;
  if (useRedis) {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  }
  return localStore.get(key) || null;
}

async function deleteTokens(portalId) {
  const key = `hs_tokens:${portalId}`;
  if (useRedis) {
    await redis.del(key);
  } else {
    localStore.delete(key);
  }
}

async function getClient(portalId) {
  const tokens = await getTokens(portalId);
  if (!tokens) {
    throw new Error(`No tokens found for portal ${portalId}. Please authorize first.`);
  }

  // Refresh if expired or expiring within 60s
  if (Date.now() > tokens.expiresAt - 60_000) {
    const client = new hubspot.Client();
    const result = await client.oauth.tokensApi.create(
      "refresh_token",
      undefined,
      undefined,
      process.env.HUBSPOT_CLIENT_ID,
      process.env.HUBSPOT_CLIENT_SECRET,
      tokens.refreshToken
    );
    await storeTokens(portalId, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
    });
    return new hubspot.Client({ accessToken: result.accessToken });
  }

  return new hubspot.Client({ accessToken: tokens.accessToken });
}

// --- HubSpot API Wrappers ---

async function getPipelineSummary(portalId) {
  const client = await getClient(portalId);

  const pipelinesResponse = await client.crm.pipelines.pipelinesApi.getAll("deals");
  const pipelines = pipelinesResponse.results;

  const summary = [];

  for (const pipeline of pipelines) {
    const stages = pipeline.stages.sort((a, b) => a.displayOrder - b.displayOrder);
    const stageData = [];

    for (const stage of stages) {
      const searchRequest = {
        filterGroups: [
          {
            filters: [
              { propertyName: "pipeline", operator: "EQ", value: pipeline.id },
              { propertyName: "dealstage", operator: "EQ", value: stage.id },
            ],
          },
        ],
        properties: ["amount"],
        limit: 100,
      };
      const result = await client.crm.deals.searchApi.doSearch(searchRequest);
      const deals = result.results || [];
      const totalValue = deals.reduce(
        (sum, d) => sum + (parseFloat(d.properties.amount) || 0),
        0
      );
      stageData.push({
        stageId: stage.id,
        stageName: stage.label,
        dealCount: result.total,
        totalValue,
      });
    }

    summary.push({
      pipelineId: pipeline.id,
      pipelineName: pipeline.label,
      stages: stageData,
    });
  }

  return summary;
}

async function getDeals(portalId, filters = {}) {
  const client = await getClient(portalId);

  const filterList = [];
  if (filters.stage) {
    filterList.push({ propertyName: "dealstage", operator: "EQ", value: filters.stage });
  }
  if (filters.owner) {
    filterList.push({ propertyName: "hubspot_owner_id", operator: "EQ", value: filters.owner });
  }
  if (filters.min_value) {
    filterList.push({ propertyName: "amount", operator: "GTE", value: String(filters.min_value) });
  }

  const searchRequest = {
    filterGroups: filterList.length > 0 ? [{ filters: filterList }] : [],
    properties: [
      "dealname", "dealstage", "amount", "hubspot_owner_id",
      "closedate", "createdate", "hs_lastmodifieddate",
      "pipeline", "notes_last_updated",
    ],
    sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
    limit: filters.limit || 20,
  };

  const result = await client.crm.deals.searchApi.doSearch(searchRequest);
  let deals = result.results || [];

  if (filters.stale_days) {
    const cutoff = Date.now() - filters.stale_days * 86400000;
    deals = deals.filter((d) => {
      const lastMod = new Date(d.properties.hs_lastmodifieddate).getTime();
      return lastMod < cutoff;
    });
  }

  const enriched = await Promise.all(
    deals.map(async (deal) => {
      try {
        const assoc = await client.crm.deals.associationsApi.getAll(deal.id, "contacts");
        const contactIds = (assoc.results || []).map((a) => a.toObjectId);
        const contacts = await Promise.all(
          contactIds.slice(0, 3).map(async (cid) => {
            const c = await client.crm.contacts.basicApi.getById(cid, [
              "firstname", "lastname", "email", "phone", "jobtitle", "company",
            ]);
            return c.properties;
          })
        );
        return { ...deal.properties, dealId: deal.id, contacts };
      } catch {
        return { ...deal.properties, dealId: deal.id, contacts: [] };
      }
    })
  );

  return enriched;
}

async function getDealDetail(portalId, dealId) {
  const client = await getClient(portalId);

  const deal = await client.crm.deals.basicApi.getById(dealId, [
    "dealname", "dealstage", "amount", "hubspot_owner_id",
    "closedate", "createdate", "hs_lastmodifieddate", "pipeline",
    "description", "notes_last_updated",
  ]);

  let contacts = [];
  try {
    const assoc = await client.crm.deals.associationsApi.getAll(dealId, "contacts");
    const contactIds = (assoc.results || []).map((a) => a.toObjectId);
    contacts = await Promise.all(
      contactIds.map(async (cid) => {
        const c = await client.crm.contacts.basicApi.getById(cid, [
          "firstname", "lastname", "email", "phone", "jobtitle", "company",
        ]);
        return { contactId: c.id, ...c.properties };
      })
    );
  } catch {}

  let engagements = [];
  try {
    const notesResult = await client.crm.objects.searchApi.doSearch("notes", {
      filterGroups: [
        {
          filters: [
            { propertyName: "associations.deal", operator: "EQ", value: dealId },
          ],
        },
      ],
      properties: ["hs_timestamp", "hs_note_body", "hs_body_preview"],
      sorts: [{ propertyName: "hs_timestamp", direction: "DESCENDING" }],
      limit: 10,
    });
    engagements = (notesResult.results || []).map((n) => ({
      type: "note",
      timestamp: n.properties.hs_timestamp,
      body: n.properties.hs_note_body || n.properties.hs_body_preview,
    }));
  } catch {}

  return { dealId, ...deal.properties, contacts, recentActivity: engagements };
}

async function getStaleDeals(portalId, days) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const client = await getClient(portalId);

  const searchRequest = {
    filterGroups: [
      {
        filters: [
          { propertyName: "hs_lastmodifieddate", operator: "LT", value: cutoff },
        ],
      },
    ],
    properties: [
      "dealname", "dealstage", "amount", "hubspot_owner_id",
      "hs_lastmodifieddate", "closedate",
    ],
    sorts: [{ propertyName: "hs_lastmodifieddate", direction: "ASCENDING" }],
    limit: 50,
  };

  const result = await client.crm.deals.searchApi.doSearch(searchRequest);
  return (result.results || []).map((d) => ({ dealId: d.id, ...d.properties }));
}

async function getContacts(portalId, query) {
  const client = await getClient(portalId);

  const searchRequest = {
    query,
    properties: [
      "firstname", "lastname", "email", "phone",
      "jobtitle", "company", "lifecyclestage",
    ],
    limit: 20,
  };

  const result = await client.crm.contacts.searchApi.doSearch(searchRequest);
  return (result.results || []).map((c) => ({ contactId: c.id, ...c.properties }));
}

async function getCompanyDetail(portalId, companyId) {
  const client = await getClient(portalId);

  const company = await client.crm.companies.basicApi.getById(companyId, [
    "name", "domain", "industry", "numberofemployees", "annualrevenue",
    "city", "state", "country", "description", "website", "phone",
    "linkedin_company_page", "createdate", "hs_lastmodifieddate",
    "hubspot_owner_id", "type", "hs_lead_status",
  ]);

  // Get associated contacts
  let contacts = [];
  try {
    const assoc = await client.crm.companies.associationsApi.getAll(companyId, "contacts");
    contacts = await Promise.all(
      (assoc.results || []).slice(0, 10).map(async (a) => {
        const c = await client.crm.contacts.basicApi.getById(a.toObjectId, [
          "firstname", "lastname", "email", "jobtitle", "phone",
        ]);
        return { contactId: c.id, ...c.properties };
      })
    );
  } catch {}

  // Get associated deals
  let deals = [];
  try {
    const assoc = await client.crm.companies.associationsApi.getAll(companyId, "deals");
    deals = await Promise.all(
      (assoc.results || []).slice(0, 10).map(async (a) => {
        const d = await client.crm.deals.basicApi.getById(a.toObjectId, [
          "dealname", "dealstage", "amount", "closedate",
        ]);
        return { dealId: d.id, ...d.properties };
      })
    );
  } catch {}

  return { type: "company", companyId, ...company.properties, contacts, deals };
}

async function createDraftEmail(portalId, dealId, toEmail, subject, body) {
  const client = await getClient(portalId);

  const emailObj = {
    properties: {
      hs_timestamp: new Date().toISOString(),
      hs_email_direction: "EMAIL",
      hs_email_subject: subject,
      hs_email_text: body,
      hs_email_status: "DRAFT",
      hs_email_to_email: toEmail,
    },
    associations: [
      {
        to: { id: dealId },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 214 }],
      },
    ],
  };

  const result = await client.crm.objects.emails.basicApi.create(emailObj);
  return { emailId: result.id, status: "draft", subject, toEmail };
}

async function sendEmail(portalId, dealId, toEmail, subject, body) {
  const client = await getClient(portalId);

  const emailObj = {
    properties: {
      hs_timestamp: new Date().toISOString(),
      hs_email_direction: "EMAIL",
      hs_email_subject: subject,
      hs_email_text: body,
      hs_email_status: "SENT",
      hs_email_to_email: toEmail,
    },
    associations: [
      {
        to: { id: dealId },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 214 }],
      },
    ],
  };

  const result = await client.crm.objects.emails.basicApi.create(emailObj);
  return { emailId: result.id, status: "sent", subject, toEmail };
}

async function createTask(portalId, dealId, title, dueDate, notes) {
  const client = await getClient(portalId);

  const taskObj = {
    properties: {
      hs_task_subject: title,
      hs_task_body: notes || "",
      hs_task_status: "NOT_STARTED",
      hs_task_priority: "MEDIUM",
      hs_timestamp: new Date().toISOString(),
      hs_task_due_date: new Date(dueDate).toISOString(),
    },
    associations: [
      {
        to: { id: dealId },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 216 }],
      },
    ],
  };

  const result = await client.crm.objects.tasks.basicApi.create(taskObj);
  return { taskId: result.id, title, dueDate, status: "created" };
}

async function updateDealStage(portalId, dealId, newStage) {
  const client = await getClient(portalId);
  await client.crm.deals.basicApi.update(dealId, {
    properties: { dealstage: newStage },
  });
  return { dealId, newStage, status: "updated" };
}

async function addNote(portalId, dealId, noteBody) {
  const client = await getClient(portalId);

  const noteObj = {
    properties: {
      hs_timestamp: new Date().toISOString(),
      hs_note_body: noteBody,
    },
    associations: [
      {
        to: { id: dealId },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 214 }],
      },
    ],
  };

  const result = await client.crm.objects.notes.basicApi.create(noteObj);
  return { noteId: result.id, status: "created" };
}

// --- User identity storage ---

async function storeUserInfo(portalId, userInfo) {
  const key = `hs_user:${portalId}`;
  if (useRedis) {
    await redis.set(key, JSON.stringify(userInfo), "EX", 60 * 60 * 24 * 90);
  } else {
    localStore.set(key, userInfo);
  }
}

async function getUserInfo(portalId) {
  const key = `hs_user:${portalId}`;
  if (useRedis) {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  }
  return localStore.get(key) || null;
}

// --- Per-user memory storage ---

async function getUserMemory(ownerId) {
  const key = `memory:${ownerId}`;
  if (useRedis) {
    return (await redis.get(key)) || "";
  }
  return localStore.get(key) || "";
}

async function setUserMemory(ownerId, content) {
  const key = `memory:${ownerId}`;
  if (useRedis) {
    await redis.set(key, content, "EX", 60 * 60 * 24 * 365); // 1 year TTL
  } else {
    localStore.set(key, content);
  }
}

// --- Get owners list ---

async function getOwners(portalId) {
  const client = await getClient(portalId);
  const response = await client.crm.owners.ownersApi.getPage();
  return (response.results || []).map((o) => ({
    ownerId: o.id,
    email: o.email,
    firstName: o.firstName,
    lastName: o.lastName,
    userId: o.userId,
  }));
}

module.exports = {
  storeTokens,
  getTokens,
  deleteTokens,
  getClient,
  storeUserInfo,
  getUserInfo,
  getUserMemory,
  setUserMemory,
  getOwners,
  getPipelineSummary,
  getDeals,
  getDealDetail,
  getStaleDeals,
  getContacts,
  getCompanyDetail,
  createDraftEmail,
  sendEmail,
  createTask,
  updateDealStage,
  addNote,
};
