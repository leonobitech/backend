const http = require("http");
const crypto = require("crypto");

const APP_SECRET = process.env.WA_APP_SECRET;
const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN;
const N8N_TARGET = process.env.N8N_TARGET || "http://n8n_main:5678";
const PORT = parseInt(process.env.PORT || "3100", 10);
const FORWARD_TIMEOUT = 15000; // 15s timeout for n8n forwarding
const RATE_WINDOW = 60000; // 1 minute window
const RATE_MAX = 30; // max 30 requests per minute per IP

if (!APP_SECRET || !VERIFY_TOKEN) {
  console.error("Missing WA_APP_SECRET or WA_VERIFY_TOKEN");
  process.exit(1);
}

// Simple in-memory rate limiter per IP
const rateBuckets = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.start > RATE_WINDOW) {
    bucket = { start: now, count: 0 };
    rateBuckets.set(ip, bucket);
  }
  bucket.count++;
  return bucket.count > RATE_MAX;
}

// Cleanup stale buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of rateBuckets) {
    if (now - bucket.start > RATE_WINDOW * 2) rateBuckets.delete(ip);
  }
}, 300000);

const server = http.createServer((req, res) => {
  const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
    || req.headers["cf-connecting-ip"]
    || req.socket.remoteAddress;

  // Health check endpoint
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  // Rate limit check
  if (isRateLimited(clientIp)) {
    console.warn(`[WA-Proxy] Rate limited: ${clientIp}`);
    res.writeHead(429);
    res.end("Too Many Requests");
    return;
  }

  // GET — Meta webhook verification (hub.challenge)
  if (req.method === "GET") {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    // Ignore probe/healthcheck GETs without query params (Cloudflare, etc.)
    if (!mode && !token) {
      res.writeHead(200);
      res.end("OK");
      return;
    }

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("[WA-Proxy] Verification OK");
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(challenge);
    } else {
      console.warn(`[WA-Proxy] Verification FAILED — mode=${mode} token=${token ? "present" : "missing"}`);
      res.writeHead(403);
      res.end("Forbidden");
    }
    return;
  }

  // POST — Validate HMAC, then forward to n8n
  if (req.method === "POST") {
    const chunks = [];

    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const rawBody = Buffer.concat(chunks);
      const signature = req.headers["x-hub-signature-256"] || "";

      console.log(`[WA-Proxy] POST ${req.url} — ${rawBody.length} bytes — sig=${signature ? "present" : "missing"} — ip=${clientIp}`);

      if (!signature) {
        console.warn("[WA-Proxy] Missing signature header");
        res.writeHead(401);
        res.end("Missing signature");
        return;
      }

      const expected =
        "sha256=" +
        crypto
          .createHmac("sha256", APP_SECRET)
          .update(rawBody)
          .digest("hex");

      if (
        !crypto.timingSafeEqual(
          Buffer.from(signature),
          Buffer.from(expected)
        )
      ) {
        console.warn(`[WA-Proxy] Invalid signature — ip=${clientIp}`);
        res.writeHead(403);
        res.end("Invalid signature");
        return;
      }

      console.log("[WA-Proxy] Signature valid");

      // Drop status webhooks (sent/delivered/read) — only forward actual messages
      try {
        const payload = JSON.parse(rawBody.toString());
        const changes = payload?.entry?.[0]?.changes?.[0]?.value;
        if (changes && changes.statuses && !changes.messages) {
          console.log(`[WA-Proxy] Dropped status webhook: ${changes.statuses[0]?.status} — not forwarding`);
          res.writeHead(200);
          res.end("OK");
          return;
        }
      } catch (_) {
        // If JSON parse fails, forward anyway and let n8n handle it
      }

      console.log("[WA-Proxy] Forwarding message to n8n");

      // Signature valid — forward to n8n (same path)
      const targetUrl = new URL(req.url, N8N_TARGET);
      const proxyReq = http.request(
        targetUrl,
        {
          method: "POST",
          timeout: FORWARD_TIMEOUT,
          headers: {
            "content-type": req.headers["content-type"] || "application/json",
            "content-length": rawBody.length,
            "x-hub-signature-256": signature,
            "user-agent": req.headers["user-agent"] || "",
            "x-wa-proxy-verified": "true",
          },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res);
        }
      );

      proxyReq.on("timeout", () => {
        console.error("[WA-Proxy] Forward timeout (15s)");
        proxyReq.destroy();
        res.writeHead(504);
        res.end("Gateway Timeout");
      });

      proxyReq.on("error", (err) => {
        console.error("[WA-Proxy] Forward error:", err.message);
        if (!res.headersSent) {
          res.writeHead(502);
          res.end("Bad Gateway");
        }
      });

      proxyReq.end(rawBody);
    });
    return;
  }

  res.writeHead(405);
  res.end("Method Not Allowed");
});

server.listen(PORT, () => {
  console.log(`[WA-Proxy] Listening on :${PORT}`);
  console.log(`[WA-Proxy] Forwarding to ${N8N_TARGET}`);
  console.log(`[WA-Proxy] Rate limit: ${RATE_MAX} req/min per IP`);
});
