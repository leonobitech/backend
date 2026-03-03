// ============================================================================
// Filter Output Initial — Mensaje de Bienvenida Hardcodeado
// ============================================================================

const leadId = $("UpdateLeadWithLead_Id").first().json.lead_id || 0;

// ── Mensaje de bienvenida ──
const welcome = `⋆˚🧚‍♀️Leraysi:
Hola hermosa! Bienvenida a *Estilos Leraysi* ✨

Soy la asistente virtual de Leraysi y estoy aquí para que agendar tu cita sea fácil y rápido, mi amor 💕

Preguntame lo que necesites, estoy disponible 24/7 para ti ✅

_Estilos Leraysi — Los Creadores de tu Propio Estilo_ 💫`;

// Telegram (sin * bold)
const contentTelegram = welcome.replace(/\*(.+?)\*/g, '$1');

// HTML para Odoo Discuss
const htmlBody = `<p><b>Leraysi⋆˚🧚‍♀️:</b></p>
<p>Hola hermosa! Bienvenida a <b>Estilos Leraysi</b> ✨</p>
<p>Soy la asistente virtual de Leraysi y estoy aquí para que agendar tu cita sea fácil y rápido, mi amor 💕</p>
<p>Preguntame lo que necesites, estoy disponible 24/7 para ti ✅</p>
<p><i>Estilos Leraysi — Los Creadores de tu Propio Estilo</i> 💫</p>`;

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
