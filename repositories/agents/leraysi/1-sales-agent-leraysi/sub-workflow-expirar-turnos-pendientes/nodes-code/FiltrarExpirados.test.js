// ============================================================================
// TEST: FiltrarExpirados v2
// Run: node FiltrarExpirados.test.js
// ============================================================================

// ── Mock n8n $input ─────────────────────────────────────────────────────────
let mockItems = [];
const $input = { all: () => mockItems };

// ── Wrapper: ejecuta el código del nodo con los items dados ─────────────────
function runFiltrarExpirados(items) {
  mockItems = items.map(i => ({ json: i }));

  // Inline del código del nodo (adaptado para test)
  const ahora = new Date();
  const expirados = [];

  for (const item of $input.all()) {
    const turno = item.json;

    if (!turno.expira_at) continue;

    const expiraAt = new Date(turno.expira_at);
    if (isNaN(expiraAt.getTime())) continue;
    if (expiraAt >= ahora) continue;

    let leadRowId = null;
    let nombreClienta = "";
    if (Array.isArray(turno.clienta_id) && turno.clienta_id.length > 0) {
      leadRowId = turno.clienta_id[0].id;
      nombreClienta = turno.clienta_id[0].value || "";
    }

    if (turno.mp_payment_id) {
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
  console.log(`  [ExpirarTurnos] ${expirados.length} turno(s) expirado(s): ${nuevos} nuevos, ${revertidos} servicio agregado`);
  return expirados;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const pastDate = new Date(Date.now() - 60 * 60 * 1000).toISOString();   // hace 1h
const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // en 1h

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ ${testName}`);
    failed++;
  }
}

// ============================================================================
// CASO 1: Turno nuevo sin pagar, expirado → tipo "expirar_turno_nuevo"
// ============================================================================
console.log('\n── CASO 1: Turno nuevo expirado (sin mp_payment_id) ──');
{
  const result = runFiltrarExpirados([{
    id: 101,
    expira_at: pastDate,
    mp_payment_id: null,
    odoo_turno_id: "55",
    clienta_id: [{ id: 73, value: "María López" }],
    servicio_detalle: "Manicura semipermanente",
    servicio: "manicura",
  }]);

  assert(result.length === 1, 'Devuelve 1 item');
  assert(result[0].json.tipo === 'expirar_turno_nuevo', 'Tipo = expirar_turno_nuevo');
  assert(result[0].json.turno_row_id === 101, 'turno_row_id = 101');
  assert(result[0].json.lead_row_id === 73, 'lead_row_id = 73');
  assert(result[0].json.odoo_turno_id === 55, 'odoo_turno_id = 55 (number)');
  assert(result[0].json.nombre_clienta === 'María López', 'nombre_clienta extraído');
  assert(result[0].json.servicio === 'Manicura semipermanente', 'servicio usa servicio_detalle');
  assert(!result[0].json.revertir, 'No tiene objeto revertir');
}

// ============================================================================
// CASO 2: Servicio agregado sin pagar, expirado → tipo "revertir_servicio_agregado"
// ============================================================================
console.log('\n── CASO 2: Servicio agregado expirado (con mp_payment_id) ──');
{
  const result = runFiltrarExpirados([{
    id: 102,
    expira_at: pastDate,
    mp_payment_id: "MP-12345678",
    odoo_turno_id: "60",
    clienta_id: [{ id: 80, value: "Ana García" }],
    servicio_detalle: "Manicura semipermanente + Pedicura",
    servicio: "manicura",
  }]);

  assert(result.length === 1, 'Devuelve 1 item');
  assert(result[0].json.tipo === 'revertir_servicio_agregado', 'Tipo = revertir_servicio_agregado');
  assert(result[0].json.turno_row_id === 102, 'turno_row_id = 102');
  assert(result[0].json.lead_row_id === 80, 'lead_row_id = 80');
  assert(result[0].json.odoo_turno_id === 60, 'odoo_turno_id = 60 (number)');
  assert(result[0].json.nombre_clienta === 'Ana García', 'nombre_clienta extraído');
  assert(result[0].json.servicio === 'Manicura semipermanente + Pedicura', 'servicio usa servicio_detalle combinado');

  // Verificar objeto revertir
  const rev = result[0].json.revertir;
  assert(rev !== undefined, 'Tiene objeto revertir');
  assert(rev.estado === 'confirmado', 'revertir.estado = confirmado');
  assert(rev.sena_pagada === true, 'revertir.sena_pagada = true');
  assert(rev.mp_link === '', 'revertir.mp_link vacío');
  assert(rev.mp_preference_id === '', 'revertir.mp_preference_id vacío');
  assert(rev.expira_at === '', 'revertir.expira_at vacío');
  assert(rev.notas.includes('Seña adicional expirada'), 'revertir.notas tiene mensaje');
  assert(rev.notas.includes('Turno original mantenido'), 'revertir.notas confirma turno original');
}

// ============================================================================
// CASO 3: Turno NO expirado (expira_at en el futuro) → no se incluye
// ============================================================================
console.log('\n── CASO 3: Turno aún no expirado (futuro) ──');
{
  const result = runFiltrarExpirados([{
    id: 103,
    expira_at: futureDate,
    mp_payment_id: null,
    odoo_turno_id: "70",
    clienta_id: [{ id: 90, value: "Laura Pérez" }],
    servicio: "corte",
  }]);

  assert(result.length === 0, 'Devuelve array vacío (no expirado)');
}

// ============================================================================
// CASO 4: Turno sin expira_at → se ignora
// ============================================================================
console.log('\n── CASO 4: Turno sin expira_at ──');
{
  const result = runFiltrarExpirados([{
    id: 104,
    expira_at: null,
    mp_payment_id: null,
    odoo_turno_id: "71",
    clienta_id: [{ id: 91, value: "Sofía Martínez" }],
    servicio: "tintura",
  }]);

  assert(result.length === 0, 'Devuelve array vacío (sin expira_at)');
}

// ============================================================================
// CASO 5: expira_at con fecha inválida → se ignora
// ============================================================================
console.log('\n── CASO 5: expira_at con fecha inválida ──');
{
  const result = runFiltrarExpirados([{
    id: 105,
    expira_at: "not-a-date",
    mp_payment_id: null,
    odoo_turno_id: "72",
    clienta_id: [{ id: 92, value: "Test" }],
    servicio: "corte",
  }]);

  assert(result.length === 0, 'Devuelve array vacío (fecha inválida)');
}

// ============================================================================
// CASO 6: Sin clienta_id → lead_row_id y nombre_clienta son null/vacío
// ============================================================================
console.log('\n── CASO 6: Turno expirado sin clienta_id ──');
{
  const result = runFiltrarExpirados([{
    id: 106,
    expira_at: pastDate,
    mp_payment_id: null,
    odoo_turno_id: "73",
    clienta_id: [],
    servicio: "pedicura",
  }]);

  assert(result.length === 1, 'Devuelve 1 item');
  assert(result[0].json.lead_row_id === null, 'lead_row_id = null');
  assert(result[0].json.nombre_clienta === '', 'nombre_clienta vacío');
}

// ============================================================================
// CASO 7: Sin odoo_turno_id → odoo_turno_id es null
// ============================================================================
console.log('\n── CASO 7: Turno expirado sin odoo_turno_id ──');
{
  const result = runFiltrarExpirados([{
    id: 107,
    expira_at: pastDate,
    mp_payment_id: null,
    odoo_turno_id: null,
    clienta_id: [{ id: 95, value: "Test" }],
    servicio: "manicura",
  }]);

  assert(result.length === 1, 'Devuelve 1 item');
  assert(result[0].json.odoo_turno_id === null, 'odoo_turno_id = null');
}

// ============================================================================
// CASO 8: Fallback servicio (sin servicio_detalle, usa servicio)
// ============================================================================
console.log('\n── CASO 8: Fallback a campo servicio (sin servicio_detalle) ──');
{
  const result = runFiltrarExpirados([{
    id: 108,
    expira_at: pastDate,
    mp_payment_id: null,
    odoo_turno_id: "74",
    clienta_id: [{ id: 96, value: "Test" }],
    servicio_detalle: "",
    servicio: "balayage",
  }]);

  assert(result.length === 1, 'Devuelve 1 item');
  assert(result[0].json.servicio === 'balayage', 'Fallback a campo servicio');
}

// ============================================================================
// CASO 9: Mix - varios turnos, algunos expirados, algunos no
// ============================================================================
console.log('\n── CASO 9: Mix de turnos (3 expirados de 5) ──');
{
  const result = runFiltrarExpirados([
    // Expirado - turno nuevo
    { id: 201, expira_at: pastDate, mp_payment_id: null, odoo_turno_id: "80", clienta_id: [{ id: 1, value: "A" }], servicio: "corte" },
    // NO expirado
    { id: 202, expira_at: futureDate, mp_payment_id: null, odoo_turno_id: "81", clienta_id: [{ id: 2, value: "B" }], servicio: "corte" },
    // Expirado - servicio agregado
    { id: 203, expira_at: pastDate, mp_payment_id: "MP-999", odoo_turno_id: "82", clienta_id: [{ id: 3, value: "C" }], servicio_detalle: "Corte + Tintura" },
    // Sin expira_at
    { id: 204, expira_at: null, mp_payment_id: null, odoo_turno_id: "83", clienta_id: [{ id: 4, value: "D" }], servicio: "pedicura" },
    // Expirado - turno nuevo
    { id: 205, expira_at: pastDate, mp_payment_id: null, odoo_turno_id: "84", clienta_id: [{ id: 5, value: "E" }], servicio: "manicura" },
  ]);

  assert(result.length === 3, 'Devuelve 3 items expirados de 5');

  const tipos = result.map(r => r.json.tipo);
  const nuevos = tipos.filter(t => t === 'expirar_turno_nuevo').length;
  const revertidos = tipos.filter(t => t === 'revertir_servicio_agregado').length;

  assert(nuevos === 2, '2 de tipo expirar_turno_nuevo');
  assert(revertidos === 1, '1 de tipo revertir_servicio_agregado');

  const ids = result.map(r => r.json.turno_row_id);
  assert(ids.includes(201), 'Incluye turno 201');
  assert(!ids.includes(202), 'No incluye turno 202 (no expirado)');
  assert(ids.includes(203), 'Incluye turno 203');
  assert(!ids.includes(204), 'No incluye turno 204 (sin expira_at)');
  assert(ids.includes(205), 'Incluye turno 205');
}

// ============================================================================
// CASO 10: mp_payment_id como string vacío → se trata como turno nuevo (falsy)
// ============================================================================
console.log('\n── CASO 10: mp_payment_id vacío (string "") → turno nuevo ──');
{
  const result = runFiltrarExpirados([{
    id: 109,
    expira_at: pastDate,
    mp_payment_id: "",
    odoo_turno_id: "75",
    clienta_id: [{ id: 97, value: "Test" }],
    servicio: "corte",
  }]);

  assert(result.length === 1, 'Devuelve 1 item');
  assert(result[0].json.tipo === 'expirar_turno_nuevo', 'mp_payment_id="" es falsy → expirar_turno_nuevo');
}

// ============================================================================
// CASO 11: Lista vacía → devuelve array vacío
// ============================================================================
console.log('\n── CASO 11: Sin turnos (input vacío) ──');
{
  const result = runFiltrarExpirados([]);
  assert(result.length === 0, 'Devuelve array vacío');
}

// ============================================================================
// RESULTADO FINAL
// ============================================================================
console.log('\n══════════════════════════════════════════════');
console.log(`  RESULTADO: ${passed} passed, ${failed} failed (total ${passed + failed})`);
console.log('══════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
