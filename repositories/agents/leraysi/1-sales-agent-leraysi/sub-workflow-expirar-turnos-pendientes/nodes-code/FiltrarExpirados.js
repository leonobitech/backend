// ============================================================================
// FILTRAR TURNOS EXPIRADOS v3
// Recibe turnos con estado=pendiente_pago, filtra los que tienen expira_at < now
//
// TRES TIPOS DE EXPIRACIÓN:
// 1. Turno nuevo sin pagar (mp_payment_id = null) → expirar completamente
// 2. Servicio agregado sin pagar (mp_payment_id existe, sin turno_padre_id) → revertir a confirmado
//    (los datos originales están intactos gracias a separación de responsabilidades v3)
// 3. Turno adicional sin pagar (turno_padre_id existe) → expirar fila hija, padre intacto
//    (fila independiente creada para otra trabajadora, el turno original no se tocó)
// ============================================================================

const items = $input.all();
const ahora = new Date();
const expirados = [];

for (const item of items) {
  const turno = item.json;

  if (!turno.expira_at) continue;

  const expiraAt = new Date(turno.expira_at);
  if (isNaN(expiraAt.getTime())) continue;
  if (expiraAt >= ahora) continue;

  // Extraer lead_row_id del campo clienta_id (link_row en Baserow)
  let leadRowId = null;
  let nombreClienta = "";
  if (Array.isArray(turno.clienta_id) && turno.clienta_id.length > 0) {
    leadRowId = turno.clienta_id[0].id;
    nombreClienta = turno.clienta_id[0].value || "";
  }

  // Detectar turno_padre_id (puede ser número, string, o link_row)
  const tieneTurnoPadre = turno.turno_padre_id != null && turno.turno_padre_id !== '' && turno.turno_padre_id !== 0;

  if (tieneTurnoPadre) {
    // CASO 3: Turno adicional sin pagar.
    // Fila hija creada para otra trabajadora. El turno padre (fila original)
    // está intacto — nunca se modificó. Solo expirar/borrar esta fila hija.
    // Si el hijo tiene hora_pre_reubicacion, el padre fue reubicado y necesita revert
    const horaPreReubicacion = turno.hora_pre_reubicacion || '';
    expirados.push({
      json: {
        turno_row_id: turno.id,
        lead_row_id: leadRowId,
        odoo_turno_id: turno.odoo_turno_id ? Number(turno.odoo_turno_id) : null,
        turno_padre_id: turno.turno_padre_id,
        nombre_clienta: nombreClienta,
        servicio: turno.servicio_detalle || turno.servicio || "",
        expira_at: turno.expira_at,
        tipo: 'expirar_turno_adicional',
        // Revert hora padre si fue reubicado al crear este turno adicional
        revertir_hora_padre: horaPreReubicacion ? {
          row_id: turno.turno_padre_id,
          hora_original: horaPreReubicacion,
          fecha_original: turno.fecha_pre_reubicacion || null,
        } : null,
      },
    });
  } else if (turno.mp_payment_id) {
    // CASO 2: Servicio agregado sin pagar (misma trabajadora, UPDATE).
    // El turno ya fue pagado antes (mp_payment_id existe).
    // Con la separación de responsabilidades v3, los datos originales
    // (servicio, hora, precio, duracion, complejidad) están intactos en Baserow.
    // Solo necesitamos revertir el estado pendiente → confirmado.
    expirados.push({
      json: {
        turno_row_id: turno.id,
        lead_row_id: leadRowId,
        odoo_turno_id: turno.odoo_turno_id ? Number(turno.odoo_turno_id) : null,
        nombre_clienta: nombreClienta,
        servicio: turno.servicio_detalle || turno.servicio || "",
        expira_at: turno.expira_at,
        tipo: 'revertir_servicio_agregado',
        revertir: {
          estado: 'confirmado',
          sena_pagada: true,
          mp_link: '',
          mp_preference_id: '',
          expira_at: '',
          notas: `Seña adicional expirada el ${ahora.toLocaleDateString('es-AR')}. Turno original mantenido.`,
        }
      },
    });
  } else {
    // CASO 1: Turno nuevo sin pagar → expirar completamente
    expirados.push({
      json: {
        turno_row_id: turno.id,
        lead_row_id: leadRowId,
        odoo_turno_id: turno.odoo_turno_id ? Number(turno.odoo_turno_id) : null,
        nombre_clienta: nombreClienta,
        servicio: turno.servicio_detalle || turno.servicio || "",
        expira_at: turno.expira_at,
        tipo: 'expirar_turno_nuevo',
      },
    });
  }
}

if (expirados.length === 0) {
  return [];
}

const nuevos = expirados.filter(e => e.json.tipo === 'expirar_turno_nuevo').length;
const revertidos = expirados.filter(e => e.json.tipo === 'revertir_servicio_agregado').length;
const adicionales = expirados.filter(e => e.json.tipo === 'expirar_turno_adicional').length;
console.log(`[ExpirarTurnos] ${expirados.length} turno(s) expirado(s): ${nuevos} nuevos, ${revertidos} servicio agregado, ${adicionales} turno adicional`);
return expirados;
