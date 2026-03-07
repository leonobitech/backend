// WA_Normalize — Convert WhatsApp Meta API payload → Telegram-compatible structure
// Input:  $json.body  = Meta webhook POST body
// Output: $json.body.message = normalized message (same shape as Telegram)

const body = $input.first().json.body;
const entry = body?.entry?.[0];
const change = entry?.changes?.[0]?.value;
const msg = change?.messages?.[0];
const contact = change?.contacts?.[0];

// Skip non-message events (delivery status, read receipts, etc.)
if (!msg) return [];

const nameParts = (contact?.profile?.name || '').split(' ');
const first_name = nameParts[0] || '';
const last_name = nameParts.slice(1).join(' ') || '';

const text  = msg.type === 'text'  ? msg.text?.body           : undefined;
const voice = msg.type === 'audio' ? { file_id: msg.audio?.id } : undefined;
const photo = msg.type === 'image' ? [{ file_id: msg.image?.id }] : undefined;

return [{
  json: {
    body: {
      message: {
        message_id: msg.id,
        from: {
          id: msg.from,          // phone number (e164 without +)
          first_name,
          last_name,
          language_code: 'es'
        },
        chat: {
          id: msg.from,          // phone number as chat ID
          type: 'private'
        },
        date: parseInt(msg.timestamp),
        text,
        voice,
        photo,
        // WhatsApp-specific extras (used by Normalize_Inbound)
        _channel: 'whatsapp',
        _wa_phone: msg.from,
        _wa_message_id: msg.id
      }
    }
  }
}];
