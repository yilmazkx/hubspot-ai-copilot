require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const chatRouter = require("./routes/chat");
const authRouter = require("./routes/auth");
const webhookRouter = require("./routes/webhooks");

const app = express();
app.use(cors());
app.use(express.json());

// Serve the standalone UI
app.use(express.static(path.join(__dirname, "public")));

app.use("/auth", authRouter);
app.use("/api", chatRouter);
app.use("/webhooks", webhookRouter);

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
  });
}

module.exports = app;
