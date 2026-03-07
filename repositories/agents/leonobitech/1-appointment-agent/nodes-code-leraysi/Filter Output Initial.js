// ============================================================================
// Filter Output Initial — Mensaje de Bienvenida Hardcodeado
// ============================================================================

const leadId = $("UpdateLeadWithLead_Id").first().json.lead_id || 0;

// ── Mensaje de bienvenida ──
const welcome = `
¡Hola hermosa! 🦋

Bienvenida a *Estilos Leraysi* ⋆˚🧚‍♀️

Los Creadores de tu Propio Estilo ✨

En qué te puedo ayudar, mi amor? 💕`;

// Telegram (sin * bold)
const contentTelegram = welcome.replace(/\*(.+?)\*/g, "$1");

// HTML para Odoo Discuss
const htmlBody = `
<p>¡Hola hermosa! 🦋</p>
<p>Bienvenida a <strong>Estilos Leraysi</strong> ⋆˚🧚‍♀️</p>
<p>Los Creadores de tu Propio Estilo ✨</p>
<p>En qué te puedo ayudar, mi amor? 💕</p>`;

return [
  {
    json: {
      body_html: htmlBody,
      content_whatsapp: welcome,
      content_telegram: contentTelegram,
      lead_id: leadId,
    },
  },
];
