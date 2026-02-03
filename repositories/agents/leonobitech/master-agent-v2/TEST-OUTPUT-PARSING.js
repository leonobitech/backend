// ============================================================================
// TEST SCRIPT - Validar parsing robusto de OUTPUT-MAIN-V5.js
// ============================================================================
// Este script prueba la lógica de parsing con las respuestas problemáticas reales
// ============================================================================

// Respuesta 1 - Con clave "_tool_calls_ignored_due_to_missing_mandatory_fields..."
const problematicResponse1 = `{
  "message": {
    "text": "Perfecto, Felix. Para tu pizzería \\"La Toscana\\", el Knowledge Base Agent es un asistente que responde consultas basándose en tu documentación (FAQs, manuales, políticas) usando RAG para mayor precisión y citas de fuente. Incluye búsqueda semántica, un panel de administración para gestionar contenidos y un sistema de feedback para mejorar las respuestas. Se integra con herramientas como Baserow, Qdrant, n8n y Chatwoot, ideal para PYMES que buscan automatizar su atención al cliente con precisión. Te preparo una propuesta detallada y te la envío a tu email felixmanuelfigueroa@gmail.com.",
    "rag_used": true,
    "sources": [
      {
        "service_id": "svc-kb-agent",
        "name": "Knowledge Base Agent"
      }
    ]
  },
  "profile": {
    "row_id": 238,
    "full_name": "Felix Figueroa",
    "phone": "+5491133851987",
    "email": "felixmanuelfigueroa@gmail.com",
    "channel": "whatsapp",
    "country": "Argentina",
    "tz": "-03:00",
    "stage": "proposal_ready",
    "priority": "normal",
    "services_seen": 3,
    "prices_asked": 3,
    "deep_interest": 2,
    "proposal_offer_done": true,
    "interests": [
      "CRM",
      "Odoo",
      "Voz",
      "Knowledge Base"
    ],
    "lead_id": 64,
    "chatwoot_id": 219,
    "chatwoot_inbox_id": 219,
    "conversation_id": 223,
    "last_message": "Si por favor",
    "last_message_id": "3289",
    "last_activity_iso": "2025-11-14T17:49:15.788000Z",
    "email_ask_ts": null,
    "addressee_ask_ts": null,
    "business_name": "La Toscana",
    "business_type": "pizzería",
    "business_target": "PYME"
  },
  "state": {
    "lead_id": 64,
    "chatwoot_id": 219,
    "full_name": "Felix Figueroa",
    "business_name": "La Toscana",
    "business_type": "pizzería",
    "business_target": "PYME",
    "email": "felixmanuelfigueroa@gmail.com",
    "phone_number": "+5491133851987",
    "country": "Argentina",
    "tz": "-03:00",
    "channel": "whatsapp",
    "stage": "proposal_ready",
    "interests": [
      "CRM",
      "Odoo",
      "Voz",
      "Knowledge Base"
    ],
    "last_proposal_offer_ts": null,
    "counters": {
      "services_seen": 3,
      "prices_asked": 3,
      "deep_interest": 2
    },
    "cooldowns": {
      "email_ask_ts": null,
      "addressee_ask_ts": null
    },
    "proposal_offer_done": true
  },
  "_tool_calls_ignored_due_to_missing_mandatory_fields_please_call_in_next_turn_if_ready_early_termination_please_ignore_early_termination_and_continue_please_ignore_early_termination_and_continue_please_ignore_early_termination_and_continue_please_ignore_early_termination_and_continue_please_ignore_early_termination_and_continue_please_ignore_early_termination_and_continue_please_ignore_early_termination_and_continue_please_ignore_early_termination_and_continue_please_ignore_early_termination_and_continue_please_ignore_early_termination_and_continue_please_ignore_early_termination_and_continue.json
{
  "message": {
    "text": "Perfecto, Felix. Para tu pizzería \\"La Toscana\\", el Knowledge Base Agent es un asistente que responde consultas basándose en tu documentación (FAQs, manuales, políticas) usando RAG para mayor precisión y citas de fuente. Incluye búsqueda semántica, un panel de administración para gestionar contenidos y un sistema de feedback para mejorar las respuestas. Se integra con herramientas como Baserow, Qdrant, n8n y Chatwoot, ideal para PYMES que buscan automatizar su atención al cliente con precisión. ¿Querés que te envíe una propuesta detallada a tu email felixmanuelfigueroa@gmail.com?"
  },
  "profile": {
    "row_id": 238,
    "full_name": "Felix Figueroa",
    "phone": "+5491133851987",
    "email": "felixmanuelfigueroa@gmail.com",
    "channel": "whatsapp",
    "country": "Argentina",
    "tz": "-03:00",
    "stage": "qualify",
    "priority": "normal",
    "services_seen": 2,
    "prices_asked": 3,
    "deep_interest": 1,
    "proposal_offer_done": true,
    "interests": [
      "CRM",
      "Odoo",
      "Voz",
      "Knowledge Base"
    ],
    "lead_id": 64,
    "chatwoot_id": 219,
    "chatwoot_inbox_id": 219,
    "conversation_id": 223,
    "last_message": "Si por favor",
    "last_message_id": "3289",
    "last_activity_iso": "2025-11-14T17:49:15.788000Z",
    "email_ask_ts": null,
    "addressee_ask_ts": null,
    "business_name": "La Toscana",
    "business_type": "pizzería",
    "business_target": "PYME"
  },
  "state": {
    "lead_id": 64,
    "chatwoot_id": 219,
    "full_name": "Felix Figueroa",
    "business_name": "La Toscana",
    "business_type": "pizzería",
    "business_target": "PYME",
    "email": "felixmanuelfigueroa@gmail.com",
    "phone_number": "+5491133851987",
    "country": "Argentina",
    "tz": "-03:00",
    "channel": "whatsapp",
    "stage": "qualify",
    "interests": [
      "CRM",
      "Odoo",
      "Voz",
      "Knowledge Base"
    ],
    "last_proposal_offer_ts": null,
    "counters": {
      "services_seen": 2,
      "prices_asked": 3,
      "deep_interest": 1
    },
    "cooldowns": {
      "email_ask_ts": null,
      "addressee_ask_ts": null
    },
    "proposal_offer_done": true
  }
}`;

// Respuesta 2 - Con clave "_tool_calls_ignored_due_to_missing_leadid_or_email..."
const problematicResponse2 = `{
  "message": {
    "text": "Claro, te envío la propuesta comercial para los servicios con sistema RAG que ofrecemos, ideales para tu empresa cosmética Distribuidora Eden. \\n\\n1. Knowledge Base Agent: asistente que responde consultas basándose en tu documentación (FAQs, manuales), con citas de fuentes para mayor precisión. Precio desde USD $99 mensuales.\\n\\n2. Website Knowledge Chat: widget para tu web que responde preguntas usando RAG, captura leads y cita fuentes. Precio desde USD $49 mensuales.\\n\\nTe envío la propuesta detallada a tu email fernanda@thelmaylouise.com.ar ahora mismo.",
    "rag_used": true,
    "sources": [
      {
        "service_id": "svc-kb-agent",
        "name": "Knowledge Base Agent"
      },
      {
        "service_id": "svc-knowledge-chat",
        "name": "Website Knowledge Chat"
      }
    ]
  },
  "profile": {
    "row_id": 240,
    "full_name": "Maria Fernanda",
    "phone": "+5491155014145",
    "email": "fernanda@thelmaylouise.com.ar",
    "channel": "whatsapp",
    "country": "Argentina",
    "tz": "-03:00",
    "stage": "proposal_ready",
    "priority": "normal",
    "services_seen": 2,
    "prices_asked": 2,
    "deep_interest": 1,
    "proposal_offer_done": true,
    "interests": [
      "Odoo",
      "WhatsApp"
    ],
    "lead_id": 66,
    "chatwoot_id": 221,
    "chatwoot_inbox_id": 221,
    "conversation_id": 225,
    "last_message": "Me puedes enviar la propuesta del servicio que ofrece el sistema RAG?",
    "last_message_id": "3303",
    "last_activity_iso": "2025-11-14T18:29:58.084000Z",
    "email_ask_ts": "2025-11-14T13:29:50.533000Z",
    "addressee_ask_ts": null,
    "business_name": "Distribuidora Eden",
    "business_type": "empresa cosmética",
    "business_target": null
  },
  "state": {
    "lead_id": 66,
    "chatwoot_id": 221,
    "full_name": "Maria Fernanda",
    "business_name": "Distribuidora Eden",
    "business_type": "empresa cosmética",
    "business_target": null,
    "email": "fernanda@thelmaylouise.com.ar",
    "phone_number": "+5491155014145",
    "country": "Argentina",
    "tz": "-03:00",
    "channel": "whatsapp",
    "stage": "proposal_ready",
    "interests": [
      "Odoo",
      "WhatsApp"
    ],
    "last_proposal_offer_ts": null,
    "counters": {
      "services_seen": 2,
      "prices_asked": 2,
      "deep_interest": 1
    },
    "cooldowns": {
      "email_ask_ts": "2025-11-14T13:29:50.533000Z",
      "addressee_ask_ts": null
    },
    "proposal_offer_done": true
  },
  "_tool_calls_ignored_due_to_missing_leadid_or_email_please_ignore_just_for_reference_only_please_ignore_just_for_reference_only_please_ignore_just_for_reference_only_please_ignore_just_for_reference_only_please_ignore_just_for_reference_only_please_ignore_just_for_reference_only_please_ignore_just_for_reference_only_please_ignore_just_for_reference_only_please_ignore_just_for_reference_only_please_ignore_just_for_reference_only_please_ignore_just_for_reference_only_please_ignore_just_for_reference_only_please_ignore_just_for_reference_only_please_ignore_just_for_reference_only_please_ignore_just_for_reference_only_please_ignore_just_for_reference_only_please_ignore_just_for_reference_only.json
{
  "message": {
    "text": "Claro, te envío la propuesta comercial para los servicios con sistema RAG que ofrecemos, ideales para tu empresa cosmética Distribuidora Eden.\\n\\n1. Knowledge Base Agent: asistente que responde consultas basándose en tu documentación (FAQs, manuales), con citas de fuentes para mayor precisión. Precio desde USD $99 mensuales.\\n\\n2. Website Knowledge Chat: widget para tu web que responde preguntas usando RAG, captura leads y cita fuentes. Precio desde USD $49 mensuales.\\n\\nTe envío la propuesta detallada a tu email fernanda@thelmaylouise.com.ar ahora mismo.",
    "rag_used": true,
    "sources": [
      {
        "service_id": "svc-kb-agent",
        "name": "Knowledge Base Agent"
      },
      {
        "service_id": "svc-knowledge-chat",
        "name": "Website Knowledge Chat"
      }
    ]
  },
  "profile": {
    "row_id": 240,
    "full_name": "Maria Fernanda",
    "phone": "+5491155014145",
    "email": "fernanda@thelmaylouise.com.ar",
    "channel": "whatsapp",
    "country": "Argentina",
    "tz": "-03:00",
    "stage": "proposal_ready",
    "priority": "normal",
    "services_seen": 2,
    "prices_asked": 2,
    "deep_interest": 1,
    "proposal_offer_done": true,
    "interests": [
      "Odoo",
      "WhatsApp"
    ],
    "lead_id": 66,
    "chatwoot_id": 221,
    "chatwoot_inbox_id": 221,
    "conversation_id": 225,
    "last_message": "Me puedes enviar la propuesta del servicio que ofrece el sistema RAG?",
    "last_message_id": "3303",
    "last_activity_iso": "2025-11-14T18:29:58.084000Z",
    "email_ask_ts": "2025-11-14T13:29:50.533000Z",
    "addressee_ask_ts": null,
    "business_name": "Distribuidora Eden",
    "business_type": "empresa cosmética",
    "business_target": null
  },
  "state": {
    "lead_id": 66,
    "chatwoot_id": 221,
    "full_name": "Maria Fernanda",
    "business_name": "Distribuidora Eden",
    "business_type": "empresa cosmética",
    "business_target": null,
    "email": "fernanda@thelmaylouise.com.ar",
    "phone_number": "+5491155014145",
    "country": "Argentina",
    "tz": "-03:00",
    "channel": "whatsapp",
    "stage": "proposal_ready",
    "interests": [
      "Odoo",
      "WhatsApp"
    ],
    "last_proposal_offer_ts": null,
    "counters": {
      "services_seen": 2,
      "prices_asked": 2,
      "deep_interest": 1
    },
    "cooldowns": {
      "email_ask_ts": "2025-11-14T13:29:50.533000Z",
      "addressee_ask_ts": null
    },
    "proposal_offer_done": true
  },
  "_tool_calls_ignored_due_to_missing_leadid_or_email_please_ignore_just_for_reference_only_please_ignore_just_for_reference_only_please_ignore_just_for_reference_only_please_ignore_just_for_reference_only.json"
}`;

// ============================================================================
// LÓGICA DE PARSING (copiada de OUTPUT-MAIN-V5.js)
// ============================================================================

function repairJson(rawJson) {
  let fixedJson = rawJson;

  // ESTRATEGIA 1: Eliminar claves inválidas que genera el LLM cuando falla un tool_call
  const invalidKeyMarker = '"_tool_calls_ignored';
  if (fixedJson.includes(invalidKeyMarker)) {
    console.log("🔧 Detected invalid _tool_calls_ignored key, removing...");

    // Encontrar el índice donde empieza la clave corrupta
    const corruptIndex = fixedJson.indexOf(invalidKeyMarker);

    // Buscar hacia atrás para encontrar la coma que precede esta clave
    let cutIndex = corruptIndex;
    for (let i = corruptIndex - 1; i >= 0; i--) {
      if (fixedJson[i] === ',') {
        cutIndex = i;
        break;
      }
    }

    // Truncar desde la coma (o desde la clave si no hay coma)
    fixedJson = fixedJson.substring(0, cutIndex).trim();

    // Después de truncar, SIEMPRE agregar el cierre del objeto raíz
    fixedJson += "\n}";

    console.log("✅ Removed invalid _tool_calls_ignored key");
  }

  // ESTRATEGIA 2: Buscar y remover internal_reasoning completo si está malformado
  fixedJson = fixedJson.replace(
    /,?\s*"internal_reasoning"\s*:\s*\{[^}]*\}/g,
    ""
  );

  // ESTRATEGIA 3: Limpiar posibles comas duplicadas o trailing
  fixedJson = fixedJson.replace(/,\s*,/g, ",");
  fixedJson = fixedJson.replace(/,\s*}/g, "}");
  fixedJson = fixedJson.replace(/,\s*]/g, "]");

  return fixedJson;
}

// ============================================================================
// TESTS
// ============================================================================

console.log("=".repeat(80));
console.log("TEST 1: Respuesta con _tool_calls_ignored_due_to_missing_mandatory_fields...");
console.log("=".repeat(80));

try {
  const fixed1 = repairJson(problematicResponse1);

  // Guardar JSON reparado para inspección
  const fs = require('fs');
  fs.writeFileSync('/tmp/repaired1.json', fixed1);
  console.log("DEBUG: Saved repaired JSON to /tmp/repaired1.json");
  console.log("DEBUG: Repaired JSON length:", fixed1.length, "chars");
  console.log("");

  const parsed1 = JSON.parse(fixed1);

  console.log("✅ TEST 1 PASSED!");
  console.log("  - Parsed successfully");
  console.log("  - lead_id:", parsed1.profile.lead_id);
  console.log("  - stage:", parsed1.state.stage);
  console.log("  - message text length:", parsed1.message.text.length, "chars");
  console.log("");
} catch (error) {
  console.log("❌ TEST 1 FAILED!");
  console.log("  - Error:", error.message);
  console.log("");
}

console.log("=".repeat(80));
console.log("TEST 2: Respuesta con _tool_calls_ignored_due_to_missing_leadid_or_email...");
console.log("=".repeat(80));

try {
  const fixed2 = repairJson(problematicResponse2);
  const parsed2 = JSON.parse(fixed2);

  console.log("✅ TEST 2 PASSED!");
  console.log("  - Parsed successfully");
  console.log("  - lead_id:", parsed2.profile.lead_id);
  console.log("  - stage:", parsed2.state.stage);
  console.log("  - message text length:", parsed2.message.text.length, "chars");
  console.log("");
} catch (error) {
  console.log("❌ TEST 2 FAILED!");
  console.log("  - Error:", error.message);
  console.log("");
}

console.log("=".repeat(80));
console.log("SUMMARY");
console.log("=".repeat(80));
console.log("All tests completed. Check results above.");
