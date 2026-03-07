// WA_ValidateSignature — Defense-in-depth validation for WhatsApp webhooks
// Layer 1: HMAC-SHA256 already validated by wa_signature_proxy (raw body bytes)
// Layer 2: Proxy header check (confirms request went through proxy)
// Layer 3: Structural validation (confirms payload is a real WhatsApp event)
// Layer 4: Meta User-Agent check

const item = $input.first();
const headers = item.json.headers || {};
const body = item.json.body;

// Layer 2: Verify request came through wa_signature_proxy
if (headers["x-wa-proxy-verified"] !== "true") {
  throw new Error("Request not verified by WA signature proxy");
}

// Layer 3: Verify WhatsApp payload structure
if (body?.object !== "whatsapp_business_account") {
  throw new Error("Invalid payload: not a WhatsApp Business Account event");
}
const entry = body?.entry?.[0];
if (!entry?.id || !Array.isArray(entry?.changes)) {
  throw new Error("Invalid payload: missing entry/changes structure");
}

// Layer 4: Verify User-Agent from Meta
const ua = (headers["user-agent"] || "").toLowerCase();
if (!ua.includes("facebookexternalua") && !ua.includes("facebookplatform")) {
  throw new Error("Invalid User-Agent: not from Meta platform");
}

return $input.all();
