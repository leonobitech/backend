const input = $input.first().json;

const output = input.output || "";
const leadId = $("UpdateLeadWithLead_Id").first().json.lead_id || 0;

// Texto plano para WhatsApp
let plainText = output.replace(/\\n/g, "\n");
plainText = plainText.replace(/\*\*(.*?)\*\*/g, "*$1*");
plainText = plainText.replace(/\n\* /g, "\n• ");
plainText = plainText.trim();
plainText = `⋆˚🧚‍♀️Leraysi:\n${plainText}`;

// Telegram: sin * como bullets (parse mode None)
const contentTelegram = plainText.replace(/^\* /gm, '• ');

// HTML para Odoo Discuss (párrafos separados + bold + bullets)
function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function whatsappToHtml(text) {
  if (!text) return "";
  const paragraphs = text.split(/\n\n+/);
  return paragraphs.map(p => {
    let html = escapeHtml(p);
    html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    html = html.replace(/\*(.+?)\*/g, '<b>$1</b>');
    html = html.replace(/^\• /gm, '• ');
    html = html.replace(/\n/g, '<br>');
    return `<p>${html}</p>`;
  }).join('');
}

const prefix = `<p><b>Leraysi⋆˚🧚‍♀️:</b></p>`;
const bodyContent = output.replace(/\\n/g, "\n").trim();
const htmlBody = prefix + whatsappToHtml(bodyContent);

return [
  {
    json: {
      body_html: htmlBody,
      content_whatsapp: plainText,
      content_telegram: contentTelegram,
      lead_id: leadId,
    },
  },
];
