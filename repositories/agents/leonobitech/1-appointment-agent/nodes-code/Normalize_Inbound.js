// Normalize_Inbound — Unified structure for both WhatsApp and Telegram

function toLocalIso(isoUtc, tzOff) {
  const d = new Date(isoUtc);
  const sign = tzOff.startsWith('-') ? -1 : 1;
  const [h, m] = tzOff.slice(1).split(':').map(Number);
  const offMin = sign * (h * 60 + m);
  const localMs = d.getTime() + offMin * 60000;
  return new Date(localMs).toISOString().replace('Z', tzOff);
}

const msg = $input.first().json.body.message;
const from = msg.from;
const chat = msg.chat;
const channel = msg._channel || 'unknown';

const tz = '-03:00';
const nowIsoUtc = new Date().toISOString();
const nowIsoLocal = toLocalIso(nowIsoUtc, tz);
const msgCreatedIso = msg.date
  ? new Date(msg.date * 1000).toISOString()
  : nowIsoUtc;

const fullName = [from.first_name, from.last_name].filter(Boolean).join(' ');

// Channel-specific identifiers
const channelUserId = String(chat.id);
const phoneE164 = channel === 'whatsapp' ? `+${msg._wa_phone}` : null;

const profile_base = {
  nick_name: fullName || 'Unknown',
  phone_e164: phoneE164,
  email: null,
  country: 'Argentina',
  tz,
  channel,
  channel_user_id: channelUserId,
  conversation_id: channelUserId
};

const event = {
  message_id: String(msg.message_id || msg._wa_message_id || ''),
  message_text: msg.text || (msg.voice ? '[audio]' : (msg.photo ? '[imagen]' : '')),
  msg_created_iso: msgCreatedIso,
  now_iso_utc: nowIsoUtc,
  now_iso_local: nowIsoLocal
};

return [{ json: { profile_base, event } }];
