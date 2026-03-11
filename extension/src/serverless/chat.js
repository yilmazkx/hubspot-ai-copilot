// Serverless function that proxies chat requests to the backend
const https = require("https");
const http = require("http");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3000";

exports.main = async (context = {}) => {
  const { messages, portalId, dealId } = context.parameters;

  const body = JSON.stringify({ messages, portalId, dealId });
  const url = new URL("/api/chat", BACKEND_URL);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  const data = await response.json();
  return { statusCode: 200, body: data };
};
