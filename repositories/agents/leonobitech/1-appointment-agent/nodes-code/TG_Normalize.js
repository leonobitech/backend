// TG_Normalize — Pass through Telegram payload with channel tag
// Telegram already arrives in the target format, just tag it

const msg = $input.first().json.body?.message;

if (!msg) return [];

msg._channel = 'telegram';

return [{
  json: {
    body: {
      message: msg
    }
  }
}];
