import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import client from "prom-client";
import net from "net";

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;
const newsApiKey = process.env.NEWSAPI_KEY;
const newsBase = process.env.NEWSAPI_URL || "https://newsapi.org/v2/top-headlines?country=us";
const color = process.env.COLOR || "unknown";

// ---------------- Prometheus ----------------
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "path", "status", "color"]
});
const newsApiCallsTotal = new client.Counter({
  name: "news_api_calls_total",
  help: "Total NewsAPI calls",
  labelNames: ["status", "country", "color"]
});
const newsApiResponseTime = new client.Histogram({
  name: "news_api_response_time_seconds",
  help: "NewsAPI response time in seconds",
  labelNames: ["status", "country", "color"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5]
});
const activeConnections = new client.Gauge({
  name: "active_connections",
  help: "Active TCP connections to this backend pod",
  labelNames: ["color"]
});

register.registerMetric(httpRequestsTotal);
register.registerMetric(newsApiCallsTotal);
register.registerMetric(newsApiResponseTime);
register.registerMetric(activeConnections);

// track active connections using the Node server handle
let serverRef = null;
let currentConnections = 0;
const connectionSet = new Set();
function attachConnectionTracker(server) {
  server.on("connection", socket => {
    currentConnections++;
    connectionSet.add(socket);
    activeConnections.set({ color }, currentConnections);
    socket.on("close", () => {
      currentConnections = Math.max(0, currentConnections - 1);
      connectionSet.delete(socket);
      activeConnections.set({ color }, currentConnections);
    });
  });
}

// ------------- App middleware -------------
app.use(cors());
app.use(express.json());
app.use(morgan("combined"));

// request metrics middleware
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const path = req.route?.path || req.path || "unknown";
    const status = String(res.statusCode);
    httpRequestsTotal.inc({ method: req.method, path, status, color });

    // observe total request latency as well if you want (optional)
    // const durSec = Number(process.hrtime.bigint() - start) / 1e9;
    // requestDuration.observe({ method: req.method, path, status, color }, durSec);
  });
  next();
});

// Health: just tells if process is alive
app.get("/health", (req, res) => {
  res.json({ ok: true, ts: Date.now(), color });
});

// Readiness: checks NewsAPI reachability and optional DB TCP ping
// Readiness: lightweight check - don't call external APIs on every probe!
app.get("/ready", async (req, res) => {
  try {
    // Just check if NewsAPI key is configured
    if (!newsApiKey) throw new Error("NEWSAPI_KEY not set");
    
    // Optional: Only check DB if configured
    const dbHost = process.env.DB_HOST;
    const dbPort = process.env.DB_PORT ? Number(process.env.DB_PORT) : null;
    if (dbHost && dbPort) {
      await new Promise((resolve, reject) => {
        const sock = net.connect({ host: dbHost, port: dbPort, timeout: 2000 }, () => {
          sock.end(); 
          resolve();
        });
        sock.on("error", reject);
        sock.on("timeout", () => { 
          sock.destroy(); 
          reject(new Error("DB TCP timeout")); 
        });
      });
    }

    res.json({ ready: true, color, newsapi: "configured", db: dbHost && dbPort ? "ok" : "skipped" });
  } catch (e) {
    res.status(503).json({ ready: false, error: e.message, color });
  }
});

// Prometheus scrape
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// API: proxy NewsAPI
app.get("/api/news", async (req, res) => {
  const q = (req.query.q || "").toString().trim();
  const country = q ? "na" : (new URL(newsBase).searchParams.get("country") || "na");

  if (!newsApiKey) return res.status(500).json({ error: "NEWSAPI_KEY not configured" });

  const url = q ? `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}`
                : newsBase;

  const endTimer = newsApiResponseTime.startTimer({ country, color });
  try {
    const r = await fetch(url, { headers: { "X-Api-Key": newsApiKey } });
    const data = await r.json();
    const statusLbl = r.ok ? "success" : `http_${r.status}`;
    newsApiCallsTotal.inc({ status: statusLbl, country, color });
    endTimer({ status: statusLbl });
    res.status(r.status).json(data);
  } catch (err) {
    newsApiCallsTotal.inc({ status: "error", country, color });
    endTimer({ status: "error" });
    res.status(500).json({ error: "fetch_failed", details: err.message });
  }
});

// start
const server = app.listen(port, () => {
  console.log(`Backend listening on ${port} color=${color}`);
});
serverRef = server;
attachConnectionTracker(serverRef);
