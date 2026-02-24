// ============================================================================
// FILTRAR TURNOS EXPIRADOS
// Recibe turnos con estado=pendiente_pago, filtra los que tienen expira_at < now
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

  expirados.push({
    json: {
      turno_row_id: turno.id,
      lead_row_id: leadRowId,
      odoo_turno_id: turno.odoo_turno_id ? Number(turno.odoo_turno_id) : null,
      nombre_clienta: nombreClienta,
      servicio: turno.servicio_detalle || turno.servicio || "",
      expira_at: turno.expira_at,
    },
  });
}

if (expirados.length === 0) {
  return [];
}

console.log(`[ExpirarTurnos] ${expirados.length} turno(s) expirado(s)`);
return expirados;
