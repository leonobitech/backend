// WA_VerifyToken — Validate Meta webhook verification request
// Input:  GET ?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=CHALLENGE
// Output: { challenge: "CHALLENGE_STRING" }

const VERIFY_TOKEN = "{{ $env.WA_VERIFY_TOKEN }}";

const query = $input.first().json.query;
const mode = query["hub.mode"];
const token = query["hub.verify_token"];
const challenge = query["hub.challenge"];

if (mode !== "subscribe") {
  throw new Error("Invalid hub.mode: " + mode);
}

if (token !== VERIFY_TOKEN) {
  throw new Error("Invalid verify token");
}

return [{ json: { challenge } }];
