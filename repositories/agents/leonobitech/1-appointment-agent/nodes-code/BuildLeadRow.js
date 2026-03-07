// Build Lead Row — mapea profile_base + event → fila Baserow (create/update-safe)
// Tabla: LeadsLeraysi
// Entrada esperada: { profile_base:{...}, event:{...} } (desde Buf_FinalizePayload)
// Salida: { keys, row_on_create, row_always, row_upsert }

function toLocalIso(isoUtc, tzOff){
  if (!isoUtc) return null;
  const d = new Date(isoUtc);
  const sign = tzOff?.startsWith('-') ? -1 : 1;
  const [h,m] = String(tzOff||'-03:00').slice(1).split(':').map(Number);
  const offMin = sign * (h*60 + m);
  return new Date(d.getTime() + offMin*60000).toISOString().replace('Z', tzOff||'-03:00');
}

const out = [];
for (const it of items) {
  const pb = it.json.profile_base || {};
  const ev = it.json.event || {};

  const country   = pb.country || 'Desconocido';
  const tz        = pb.tz || '-03:00';
  const channel   = pb.channel || 'whatsapp';
  const nickName  = pb.nick_name || '';
  const fullName  = pb.full_name ?? "";
  const phone     = pb.phone_e164 || '';
  const email     = pb.email ?? "";

  const channelUserId  = pb.channel_user_id ?? null;
  const conversationId = pb.conversation_id ?? null;

  const msgId      = ev.message_id ?? null;
  const msgText    = String(ev.message_text || '').trim();
  const msgIsoUtc  = ev.msg_created_iso || null;
  const nowIsoUtc  = ev.now_iso_utc || new Date().toISOString();

  // Locales (para first_interaction en create)
  const msgIsoLocal = msgIsoUtc ? toLocalIso(msgIsoUtc, tz) : null;

  // Claves para upsert (channel_user_id es unico por canal)
  const keys = {
    channel_user_id: channelUserId,
    phone_number: phone
  };

  // Campos que se setean SOLO en create
  const row_on_create = {
    channel_user_id: channelUserId,
    conversation_id: conversationId,
    nick_name: nickName,
    full_name: fullName,
    phone_number: phone,
    email: email,
    country: country,
    tz: tz,
    channel: channel,
    first_interaction: msgIsoLocal,
    first_interaction_utc: msgIsoUtc,
    last_message: msgText,
    last_message_id: msgId,
    last_activity_iso: nowIsoUtc,
    // Estado conversacional (defaults)
    stage: 'explore',
    priority: 'normal',
    servicio_interes: '',
    interests: [],
    // Flags del salon
    foto_recibida: false,
    presupuesto_dado: false,
    turno_agendado: false,
    turno_fecha: null,
    sena_pagada: false,
    waiting_image: false,
    // Contadores
    services_seen: 0,
    prices_asked: 0,
    deep_interest: 0,
    // Cooldowns
    email_ask_ts: null,
    fullname_ask_ts: null,
    // CRM
    lead_id: 0
  };

  // Campos seguros para actualizar SIEMPRE (update)
  const row_always = {
    channel: channel,
    last_message: msgText,
    last_message_id: msgId,
    last_activity_iso: nowIsoUtc
  };

  // Paquete para upsert
  const row_upsert = { ...row_on_create, ...row_always };

  out.push({ json: { keys, row_on_create, row_always, row_upsert } });
}
return out;
