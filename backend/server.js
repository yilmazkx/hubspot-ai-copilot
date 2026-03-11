require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const { requireApiKey, validateOrigin } = require("./middleware/auth");
const chatRouter = require("./routes/chat");
const authRouter = require("./routes/auth");
const webhookRouter = require("./routes/webhooks");

const app = express();

// CORS — restrict to HubSpot + own domain in production
const ALLOWED_ORIGINS = [
  /^https:\/\/.*\.hubspot\.com$/,
  /^https:\/\/.*\.hubspotusercontent\.com$/,
  /^https:\/\/.*\.hsappstatic\.net$/,
  /^https:\/\/hubspot-ai-copilot-backend\.vercel\.app$/,
  /^https:\/\/hubspot-ai-copilot-backend-.*\.vercel\.app$/,
];

if (process.env.ALLOWED_ORIGIN) {
  ALLOWED_ORIGINS.push(new RegExp(`^${process.env.ALLOWED_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
}

app.use(cors(
  process.env.VERCEL
    ? {
        origin: (origin, callback) => {
          // Allow requests with no origin (server-to-server, mobile, etc.)
          if (!origin) return callback(null, true);
          if (ALLOWED_ORIGINS.some((p) => p.test(origin))) return callback(null, true);
          callback(new Error("CORS: origin not allowed"));
        },
        credentials: true,
      }
    : {} // Allow all origins in local dev
));

app.use(express.json());

// Origin validation for all routes
app.use(validateOrigin);

// Serve the standalone UI (public, no auth needed)
app.use(express.static(path.join(__dirname, "public")));

// Auth routes — public (OAuth flow needs browser access)
app.use("/auth", authRouter);

// Webhook routes — validated by HubSpot signature, not API key
app.use("/webhooks", webhookRouter);

// API routes — protected by API key
app.use("/api", requireApiKey, chatRouter);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// Only listen when running locally (not on Vercel)
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  const DEMO_MODE = !process.env.ANTHROPIC_API_KEY;
  app.listen(PORT, () => {
    console.log(`HubSpot Copilot backend running on port ${PORT}`);
    if (DEMO_MODE) {
      console.log("DEMO MODE — no API keys detected, using mock data and scripted responses");
      console.log("Set ANTHROPIC_API_KEY and HUBSPOT_CLIENT_ID/SECRET in .env for real mode");
    }
    if (!process.env.COPILOT_API_KEY) {
      console.log("WARNING: No COPILOT_API_KEY set — API endpoints are unprotected");
    }
  });
}

module.exports = app;
