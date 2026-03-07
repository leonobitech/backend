// TG_ValidateSecret — Verify Telegram secret token header
// Rejects request if header is missing or invalid

const TG_SECRET = $env.TG_SECRET;

const item = $input.first();
const secret = item.json.headers?.["x-telegram-bot-api-secret-token"] || "";

if (!secret) {
  throw new Error("Missing X-Telegram-Bot-Api-Secret-Token header");
}

if (secret !== TG_SECRET) {
  throw new Error("Invalid Telegram secret token");
}

return $input.all();
