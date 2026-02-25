// ============================================================================
// FILTRAR TURNOS EXPIRADOS v2
// Recibe turnos con estado=pendiente_pago, filtra los que tienen expira_at < now
//
// DOS TIPOS DE EXPIRACIÓN:
// 1. Turno nuevo sin pagar (mp_payment_id = null) → expirar completamente
// 2. Servicio agregado sin pagar (mp_payment_id existe) → revertir a confirmado
//    (los datos originales están intactos gracias a separación de responsabilidades v3)
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

  if (turno.mp_payment_id) {
    // CASO 2: Servicio agregado sin pagar.
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
        // Tipo de expiración: revertir a confirmado (no expirar completamente)
        tipo: 'revertir_servicio_agregado',
        // Campos a restaurar en Baserow
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
console.log(`[ExpirarTurnos] ${expirados.length} turno(s) expirado(s): ${nuevos} nuevos, ${revertidos} servicio agregado`);
return expirados;
