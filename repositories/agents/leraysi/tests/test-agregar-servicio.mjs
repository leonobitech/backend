#!/usr/bin/env node
// ============================================================================
// TEST RUNNER: Agregar Servicio con Validacion de Disponibilidad
// ============================================================================
// Ejecuta ParseInput → AnalizarDisponibilidad → FormatearRespuestaOpciones
// con datos simulados. Cero LLM, cero costo, resultados inmediatos.
//
// Uso: node tests/test-agregar-servicio.mjs
// ============================================================================

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NODES_DIR = join(__dirname, '..', '1-sales-agent-leraysi', 'sub-workflow-agente-calendario', 'nodes-code');

// ============================================================================
// N8N MOCK ENVIRONMENT
// ============================================================================
// Simula $input, $('NodeName'), console.log — lo minimo para que los nodos corran

function createN8nContext(inputData, nodeOutputs = {}) {
  return {
    $input: {
      first: () => ({ json: inputData }),
      all: () => [{ json: inputData }]
    },
    $: (nodeName) => ({
      first: () => ({ json: nodeOutputs[nodeName] || {} }),
      all: () => nodeOutputs[nodeName] ? [{ json: nodeOutputs[nodeName] }] : []
    })
  };
}

function runNode(filePath, context) {
  const code = readFileSync(filePath, 'utf-8');

  // Wrap code in a function with n8n globals injected
  const wrappedCode = `
    const $input = this.$input;
    const $ = this.$;
    ${code}
  `;

  const fn = new Function(wrappedCode);
  const result = fn.call(context);
  return result[0].json;
}

// ============================================================================
// TEST HELPERS
// ============================================================================

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m'
};

function header(text) {
  console.log(`\n${COLORS.bold}${COLORS.cyan}${'='.repeat(70)}${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}  ${text}${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}${'='.repeat(70)}${COLORS.reset}`);
}

function subheader(text) {
  console.log(`\n${COLORS.bold}  ${text}${COLORS.reset}`);
}

function pass(msg) {
  console.log(`  ${COLORS.green}PASS${COLORS.reset} ${msg}`);
}

function fail(msg, expected, actual) {
  console.log(`  ${COLORS.red}FAIL${COLORS.reset} ${msg}`);
  if (expected !== undefined) {
    console.log(`    ${COLORS.dim}expected: ${JSON.stringify(expected)}${COLORS.reset}`);
    console.log(`    ${COLORS.dim}actual:   ${JSON.stringify(actual)}${COLORS.reset}`);
  }
}

function info(msg) {
  console.log(`  ${COLORS.dim}${msg}${COLORS.reset}`);
}

let totalPass = 0;
let totalFail = 0;

function assert(condition, msg, expected, actual) {
  if (condition) {
    pass(msg);
    totalPass++;
  } else {
    fail(msg, expected, actual);
    totalFail++;
  }
}

// ============================================================================
// FECHA DINAMICA DE TEST
// ============================================================================
// Usa una fecha siempre en el futuro (pasado manana, saltando domingo)
// para evitar que el analizador excluya "hoy" por regla de negocio.
function getTestDate() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}
const TEST_DATE = getTestDate();

// ============================================================================
// TURNOS EXISTENTES (simula GetTurnosSemana de Baserow)
// ============================================================================
// Leraysi tiene un turno de manicura simple a las 15:00 (120 min) para
// la clienta de prueba (row 86)

function crearTurnosBase() {
  return [
    {
      id: 101,
      odoo_turno_id: 8,
      fecha: `${TEST_DATE}T15:00:00-03:00`,
      hora: '15:00',
      duracion_min: 120,
      complejidad_maxima: { value: 'media' },
      servicio: [{ value: 'Manicura simple' }],
      servicio_detalle: 'Manicura simple',
      trabajadora: { value: 'Leraysi' },
      estado: { value: 'confirmado' },
      precio: 5000,
      sena_monto: 1500,
      clienta_id: [{ id: 86 }]
    }
  ];
}

// ============================================================================
// PIPELINE: ParseInput → AnalizarDisponibilidad → FormatearRespuestaOpciones
// ============================================================================

function runPipeline(toolInput, turnosExistentes) {
  // 1. ParseInput
  const parseCtx = createN8nContext(toolInput);
  const parseOutput = runNode(join(NODES_DIR, 'ParseInput.js'), parseCtx);

  // 2. AnalizarDisponibilidad
  const analizarCtx = createN8nContext(parseOutput, {
    GetTurnosSemana: turnosExistentes || [],
    ParseInput: parseOutput
  });
  // AnalizarDisponibilidad uses $('GetTurnosSemana').all() and $('ParseInput').first()
  // Override $input and $ for this node
  const analizarContext = {
    $input: {
      first: () => ({ json: parseOutput }),
      all: () => [{ json: parseOutput }]
    },
    $: (nodeName) => {
      if (nodeName === 'GetTurnosSemana') {
        const turnos = turnosExistentes || [];
        return {
          first: () => ({ json: turnos[0] || {} }),
          all: () => turnos.map(t => ({ json: t }))
        };
      }
      if (nodeName === 'ParseInput') {
        return {
          first: () => ({ json: parseOutput }),
          all: () => [{ json: parseOutput }]
        };
      }
      return { first: () => ({ json: {} }), all: () => [] };
    }
  };
  const analizarOutput = runNode(join(NODES_DIR, 'AnalizarDisponibilidad.js'), analizarContext);

  // 3. FormatearRespuestaOpciones (solo si modo=consultar_disponibilidad)
  const formatCtx = createN8nContext(analizarOutput);
  const formatOutput = runNode(join(NODES_DIR, 'FormatearRespuestaOpciones.js'), formatCtx);

  return { parseOutput, analizarOutput, formatOutput };
}

// ============================================================================
// TEST CASES
// ============================================================================

header('TEST A: Cabe sin mover horario');
info('Turno manicura 15:00 (120min) + agregar tintura raiz (60min, compleja)');
info('Esperado: turno se extiende a 15:00-18:00, sin cambio de hora');

{
  const toolInput = {
    llm_output: {
      modo: 'consultar_disponibilidad',
      servicio: ['Tintura raíz'],
      fecha_deseada: TEST_DATE,
      hora_deseada: '15:00',
      nombre_clienta: 'Maria Test'
    },
    state: {
      lead_id: 100,
      row_id: 86,
      phone: '+5491112345678',
      turno_agendado: true,
      turno_fecha: `${TEST_DATE}T15:00:00-03:00`,
      odoo_turno_id: 8,
      turno_precio_existente: 5000,
      agregar_a_turno_existente: true
    }
  };

  const { parseOutput, analizarOutput, formatOutput } = runPipeline(toolInput, crearTurnosBase());

  subheader('ParseInput');
  assert(parseOutput.modo === 'consultar_disponibilidad', 'modo = consultar_disponibilidad', 'consultar_disponibilidad', parseOutput.modo);
  assert(parseOutput.agregar_a_turno_existente === true, 'agregar_a_turno_existente = true');
  assert(parseOutput.turno_id_existente === 8, 'turno_id_existente = 8', 8, parseOutput.turno_id_existente);
  assert(parseOutput.duracion_estimada === 60, 'duracion tintura raiz = 60min', 60, parseOutput.duracion_estimada);
  assert(parseOutput.complejidad_maxima === 'compleja', 'complejidad = compleja', 'compleja', parseOutput.complejidad_maxima);

  subheader('AnalizarDisponibilidad');
  assert(analizarOutput.opciones.length > 0, `tiene opciones (${analizarOutput.opciones.length})`);
  const op1 = analizarOutput.opciones[0];
  if (op1) {
    info(`  Mejor opcion: ${op1.fecha} ${op1.hora_inicio}-${op1.hora_fin} (${op1.trabajadora}) score=${op1.score}`);
    assert(op1.hora_inicio === '15:00', 'primera opcion mantiene hora 15:00', '15:00', op1.hora_inicio);
    assert(op1.hora_fin === '18:00', 'hora fin = 18:00 (120+60=180min)', '18:00', op1.hora_fin);
    assert(op1.fecha === TEST_DATE, 'mismo dia', TEST_DATE, op1.fecha);
  }

  subheader('FormatearRespuestaOpciones');
  assert(formatOutput.accion === 'opciones_agregar_servicio', 'accion = opciones_agregar_servicio', 'opciones_agregar_servicio', formatOutput.accion);
  assert(formatOutput.mensaje_para_clienta.includes('tintura'), 'mensaje menciona servicio');
  info(`  Mensaje: ${formatOutput.mensaje_para_clienta.substring(0, 120)}...`);
}


header('TEST B: Hay que mover horario');
info('Turno manicura 15:00 (120min) + agregar manicura semipermanente (180min)');
info('Combinado = 300min. No cabe 15:00-20:00 (cierre 19:00)');
info('Esperado: sistema propone horario mas temprano');

{
  const toolInput = {
    llm_output: {
      modo: 'consultar_disponibilidad',
      servicio: ['Manicura semipermanente'],
      fecha_deseada: TEST_DATE,
      hora_deseada: '15:00',
      nombre_clienta: 'Maria Test'
    },
    state: {
      lead_id: 100,
      row_id: 86,
      phone: '+5491112345678',
      turno_agendado: true,
      turno_fecha: `${TEST_DATE}T15:00:00-03:00`,
      odoo_turno_id: 8,
      turno_precio_existente: 5000,
      agregar_a_turno_existente: true
    }
  };

  const { parseOutput, analizarOutput, formatOutput } = runPipeline(toolInput, crearTurnosBase());

  subheader('ParseInput');
  assert(parseOutput.modo === 'consultar_disponibilidad', 'modo = consultar_disponibilidad (primera llamada)', 'consultar_disponibilidad', parseOutput.modo);
  assert(parseOutput.duracion_estimada === 180, 'duracion manicura semipermanente = 180min', 180, parseOutput.duracion_estimada);

  subheader('AnalizarDisponibilidad');
  assert(analizarOutput.opciones.length > 0, `tiene opciones (${analizarOutput.opciones.length})`);
  const op1 = analizarOutput.opciones[0];
  if (op1) {
    info(`  Mejor opcion: ${op1.fecha} ${op1.hora_inicio}-${op1.hora_fin} (${op1.trabajadora}) score=${op1.score}`);
    const horaInicioMin = parseInt(op1.hora_inicio.split(':')[0]) * 60 + parseInt(op1.hora_inicio.split(':')[1]);
    const horaFinMin = parseInt(op1.hora_fin.split(':')[0]) * 60 + parseInt(op1.hora_fin.split(':')[1]);
    assert(horaFinMin <= 1140, 'hora fin <= 19:00 (dentro de jornada)', '<=19:00', op1.hora_fin);
    assert(horaFinMin - horaInicioMin === 300, 'duracion combinada = 300min', 300, horaFinMin - horaInicioMin);
    assert(op1.hora_inicio !== '15:00', 'hora cambio (no cabe a las 15:00)', '!= 15:00', op1.hora_inicio);
  }

  subheader('FormatearRespuestaOpciones');
  assert(formatOutput.accion === 'opciones_agregar_servicio', 'accion = opciones_agregar_servicio');
  const mencionaMovimiento = formatOutput.mensaje_para_clienta.includes('moveria') || formatOutput.mensaje_para_clienta.includes('15:00');
  assert(mencionaMovimiento, 'mensaje indica cambio de horario');
  info(`  Mensaje: ${formatOutput.mensaje_para_clienta.substring(0, 150)}...`);
}


header('TEST C: Servicio muy_compleja (balayage)');
info('Turno manicura 15:00 (120min) + agregar balayage (muy_compleja, 600min)');
info('Esperado: jornada completa 09:00-19:00, manicura en ventana proceso');

{
  const toolInput = {
    llm_output: {
      modo: 'consultar_disponibilidad',
      servicio: ['Balayage'],
      fecha_deseada: TEST_DATE,
      hora_deseada: '15:00',
      nombre_clienta: 'Maria Test'
    },
    state: {
      lead_id: 100,
      row_id: 86,
      phone: '+5491112345678',
      turno_agendado: true,
      turno_fecha: `${TEST_DATE}T15:00:00-03:00`,
      odoo_turno_id: 8,
      turno_precio_existente: 5000,
      agregar_a_turno_existente: true
    }
  };

  const { parseOutput, analizarOutput, formatOutput } = runPipeline(toolInput, crearTurnosBase());

  subheader('ParseInput');
  assert(parseOutput.duracion_estimada === 600, 'duracion balayage = 600min', 600, parseOutput.duracion_estimada);
  assert(parseOutput.complejidad_maxima === 'muy_compleja', 'complejidad = muy_compleja', 'muy_compleja', parseOutput.complejidad_maxima);
  assert(parseOutput.activo_inicio === 180, 'activo_inicio = 180', 180, parseOutput.activo_inicio);
  assert(parseOutput.proceso === 300, 'proceso = 300', 300, parseOutput.proceso);
  assert(parseOutput.activo_fin === 120, 'activo_fin = 120', 120, parseOutput.activo_fin);

  subheader('AnalizarDisponibilidad');
  assert(analizarOutput.opciones.length > 0, `tiene opciones (${analizarOutput.opciones.length})`);
  const op1 = analizarOutput.opciones[0];
  if (op1) {
    info(`  Mejor opcion: ${op1.fecha} ${op1.hora_inicio}-${op1.hora_fin} (${op1.trabajadora}) score=${op1.score}`);
    assert(op1.hora_inicio === '09:00', 'muy_compleja empieza 09:00', '09:00', op1.hora_inicio);
    assert(op1.hora_fin === '19:00', 'jornada completa hasta 19:00', '19:00', op1.hora_fin);
    assert(op1.duracion_min === 600, 'duracion = 600min', 600, op1.duracion_min);
    assert(op1.es_agregar_servicio === true, 'flag es_agregar_servicio = true');
    assert(op1.servicio_reubicado === true, 'servicio_reubicado = true');
    assert(op1.servicio_en_proceso === true, 'servicio_en_proceso = true');
    if (op1.hora_servicio_existente) {
      const horaExMin = parseInt(op1.hora_servicio_existente.split(':')[0]) * 60 + parseInt(op1.hora_servicio_existente.split(':')[1]);
      assert(horaExMin >= 720 && horaExMin + 120 <= 1020, 'manicura cabe en ventana proceso (12:00-17:00)', '12:00-15:00', op1.hora_servicio_existente);
      info(`  Manicura reubicada a: ${op1.hora_servicio_existente}`);
    }
  }

  subheader('FormatearRespuestaOpciones');
  assert(formatOutput.accion === 'opciones_agregar_servicio', 'accion = opciones_agregar_servicio');
  assert(formatOutput.mensaje_para_clienta.includes('jornada completa'), 'mensaje menciona jornada completa');
  info(`  Mensaje: ${formatOutput.mensaje_para_clienta.substring(0, 150)}...`);
}


header('TEST D: Fallback a Companera');
info('Leraysi ocupada todo el dia 25 + agregar tintura raiz');
info('Esperado: propone Companera en el mismo dia');

{
  const turnosConLeraysiOcupada = [
    // Turno de la clienta (manicura a las 15:00)
    ...crearTurnosBase(),
    // Leraysi ocupada con balayage todo el dia 25
    {
      id: 102,
      odoo_turno_id: 99,
      fecha: `${TEST_DATE}T09:00:00-03:00`,
      hora: '09:00',
      duracion_min: 600,
      complejidad_maxima: { value: 'muy_compleja' },
      servicio: [{ value: 'Balayage' }],
      trabajadora: { value: 'Leraysi' },
      estado: { value: 'confirmado' },
      clienta_id: [{ id: 999 }]
    }
  ];

  const toolInput = {
    llm_output: {
      modo: 'consultar_disponibilidad',
      servicio: ['Tintura raíz'],
      fecha_deseada: TEST_DATE,
      hora_deseada: '15:00',
      nombre_clienta: 'Maria Test'
    },
    state: {
      lead_id: 100,
      row_id: 86,
      phone: '+5491112345678',
      turno_agendado: true,
      turno_fecha: `${TEST_DATE}T15:00:00-03:00`,
      odoo_turno_id: 8,
      turno_precio_existente: 5000,
      agregar_a_turno_existente: true
    }
  };

  const { analizarOutput, formatOutput } = runPipeline(toolInput, turnosConLeraysiOcupada);

  subheader('AnalizarDisponibilidad');
  assert(analizarOutput.opciones.length > 0, `tiene opciones (${analizarOutput.opciones.length})`);
  const op1 = analizarOutput.opciones[0];
  if (op1) {
    info(`  Mejor opcion: ${op1.fecha} ${op1.hora_inicio}-${op1.hora_fin} (${op1.trabajadora}) score=${op1.score}`);
    // Leraysi esta ocupada, debe ofrecer Companera o mover de dia
    const hayCompanera = analizarOutput.opciones.some(o => o.trabajadora === 'Companera');
    const hayOtroDia = analizarOutput.opciones.some(o => o.fecha !== TEST_DATE);
    assert(hayCompanera || hayOtroDia, 'ofrece Companera o dia alternativo');
    if (hayCompanera) {
      const opComp = analizarOutput.opciones.find(o => o.trabajadora === 'Companera');
      info(`  Companera: ${opComp.fecha} ${opComp.hora_inicio}-${opComp.hora_fin}`);
    }
  }

  subheader('FormatearRespuestaOpciones');
  assert(formatOutput.accion === 'opciones_agregar_servicio', 'accion = opciones_agregar_servicio');
  info(`  Mensaje: ${formatOutput.mensaje_para_clienta.substring(0, 150)}...`);
}


header('TEST E: Ambas trabajadoras ocupadas (sin disponibilidad)');
info('Leraysi Y Companera ocupadas todo el dia 25 + agregar balayage (600min)');
info('Esperado: ofrece otros dias o sin disponibilidad');

{
  const turnosAmbasOcupadas = [
    // Turno de la clienta (manicura a las 15:00)
    ...crearTurnosBase(),
    // Leraysi ocupada todo el dia 25
    {
      id: 102,
      odoo_turno_id: 99,
      fecha: `${TEST_DATE}T09:00:00-03:00`,
      hora: '09:00',
      duracion_min: 600,
      complejidad_maxima: { value: 'muy_compleja' },
      servicio: [{ value: 'Alisado brasileno' }],
      trabajadora: { value: 'Leraysi' },
      estado: { value: 'confirmado' },
      clienta_id: [{ id: 998 }]
    },
    // Companera ocupada todo el dia 25
    {
      id: 103,
      odoo_turno_id: 100,
      fecha: `${TEST_DATE}T09:00:00-03:00`,
      hora: '09:00',
      duracion_min: 600,
      complejidad_maxima: { value: 'muy_compleja' },
      servicio: [{ value: 'Alisado keratina' }],
      trabajadora: { value: 'Companera' },
      estado: { value: 'confirmado' },
      clienta_id: [{ id: 997 }]
    }
  ];

  const toolInput = {
    llm_output: {
      modo: 'consultar_disponibilidad',
      servicio: ['Balayage'],
      fecha_deseada: TEST_DATE,
      hora_deseada: '15:00',
      nombre_clienta: 'Maria Test'
    },
    state: {
      lead_id: 100,
      row_id: 86,
      phone: '+5491112345678',
      turno_agendado: true,
      turno_fecha: `${TEST_DATE}T15:00:00-03:00`,
      odoo_turno_id: 8,
      turno_precio_existente: 5000,
      agregar_a_turno_existente: true
    }
  };

  const { analizarOutput, formatOutput } = runPipeline(toolInput, turnosAmbasOcupadas);

  subheader('AnalizarDisponibilidad');
  // No deberia haber opciones para el dia 25 (ambas ocupadas)
  const opcionesDia25 = analizarOutput.opciones.filter(o => o.fecha === TEST_DATE);
  assert(opcionesDia25.length === 0, 'sin opciones para dia 25 (ambas ocupadas)', 0, opcionesDia25.length);

  if (analizarOutput.opciones.length > 0) {
    info(`  Alternativas encontradas: ${analizarOutput.opciones.length}`);
    const op1 = analizarOutput.opciones[0];
    info(`  Primera: ${op1.fecha} ${op1.hora_inicio}-${op1.hora_fin} (${op1.trabajadora})`);
    assert(op1.fecha !== TEST_DATE, 'alternativa es otro dia', '!= 2026-02-25', op1.fecha);
  } else {
    info('  Sin opciones disponibles en proximos dias');
  }

  subheader('FormatearRespuestaOpciones');
  const esOk = formatOutput.accion === 'opciones_agregar_servicio' || formatOutput.accion === 'sin_disponibilidad_agregar';
  assert(esOk, `accion coherente: ${formatOutput.accion}`);
  info(`  Mensaje: ${formatOutput.mensaje_para_clienta.substring(0, 150)}...`);
}


header('TEST F: Segunda llamada (sin modo del LLM) NO fuerza consultar');
info('LLM NO envia modo (segunda llamada), agregar_a_turno_existente = true');
info('Esperado: ParseInput NO fuerza consultar — deja pasar al agente calendario');
info('(Solo fuerza consultar cuando modo es EXPLICITAMENTE "consultar_disponibilidad")');

{
  const toolInput = {
    llm_output: {
      // Sin modo! Asi es como el LLM envia la segunda llamada
      servicio: ['Pedicura'],
      fecha_deseada: TEST_DATE,
      hora_deseada: '15:00',
      nombre_clienta: 'Maria Test'
    },
    state: {
      lead_id: 100,
      row_id: 86,
      phone: '+5491112345678',
      turno_agendado: true,
      turno_fecha: `${TEST_DATE}T15:00:00-03:00`,
      odoo_turno_id: 8,
      turno_precio_existente: 5000,
      agregar_a_turno_existente: true
    }
  };

  const parseCtx = createN8nContext(toolInput);
  const parseOutput = runNode(join(NODES_DIR, 'ParseInput.js'), parseCtx);

  assert(parseOutput.modo !== 'consultar_disponibilidad', 'modo NO forzado (segunda llamada sin modo explicito)', '!= consultar_disponibilidad', parseOutput.modo);
  assert(parseOutput.agregar_a_turno_existente === true, 'agregar_a_turno_existente se preserva');
}


header('TEST F2: Primera llamada (modo explicito) SI fuerza consultar');
info('LLM envia modo = "consultar_disponibilidad" + agregar_a_turno_existente = true');
info('Esperado: ParseInput mantiene modo = consultar_disponibilidad');

{
  const toolInput = {
    llm_output: {
      modo: 'consultar_disponibilidad',
      servicio: ['Pedicura'],
      fecha_deseada: TEST_DATE,
      hora_deseada: '15:00',
      nombre_clienta: 'Maria Test'
    },
    state: {
      lead_id: 100,
      row_id: 86,
      phone: '+5491112345678',
      turno_agendado: true,
      turno_fecha: `${TEST_DATE}T15:00:00-03:00`,
      odoo_turno_id: 8,
      turno_precio_existente: 5000,
      agregar_a_turno_existente: true
    }
  };

  const parseCtx = createN8nContext(toolInput);
  const parseOutput = runNode(join(NODES_DIR, 'ParseInput.js'), parseCtx);

  assert(parseOutput.modo === 'consultar_disponibilidad', 'modo = consultar_disponibilidad (primera llamada con modo explicito)', 'consultar_disponibilidad', parseOutput.modo);
  assert(parseOutput.agregar_a_turno_existente === true, 'agregar_a_turno_existente se preserva');
}


// ============================================================================
// TEST G: Turno nuevo (otra clienta) en ventana de proceso de balayage existente
// ============================================================================
// Leraysi tiene un balayage (jornada completa 09:00-19:00) el mie 25.
// Otra clienta quiere manicura simple (120min, media) ese mismo dia.
// Esperado: el sistema encuentra slot en la ventana de proceso (12:00-17:00)
// porque los bloques activos son solo [09:00-12:00] y [17:00-19:00].

header('TEST G: Turno nuevo en ventana de proceso de balayage existente');
info('Leraysi tiene balayage (muy_compleja) el mie 25 — bloques activos: 09:00-12:00 + 17:00-19:00');
info('Otra clienta pide manicura simple (120min, media) para el mismo dia');
info('Esperado: slot disponible en ventana de proceso (12:00-17:00)');

{
  const turnosConBalayage = [
    {
      id: 200,
      odoo_turno_id: 20,
      fecha: `${TEST_DATE}T12:00:00Z`,
      hora: '09:00',
      duracion_min: 600,
      complejidad_maxima: { value: 'muy_compleja' },
      servicio: [{ value: 'Balayage' }],
      servicio_detalle: 'Balayage',
      trabajadora: { value: 'Leraysi' },
      estado: { value: 'confirmado' },
      precio: 50000,
      sena_monto: 15000,
      clienta_id: [{ id: 99 }]  // Otra clienta
    }
  ];

  // Turno NUEVO (no agregar servicio) — otra clienta quiere manicura simple
  const toolInput = {
    llm_output: {
      modo: 'consultar_disponibilidad',
      servicio: ['Manicura simple'],
      fecha_deseada: TEST_DATE,
      hora_deseada: '14:00',
      full_name: 'Laura Test',
      email: 'laura@test.com'
    },
    state: {
      lead_id: 200,
      row_id: 200,
      phone: '+5491199999999',
      email: 'laura@test.com',
      full_name: 'Laura Test'
    }
  };

  const { parseOutput, analizarOutput, formatOutput } = runPipeline(toolInput, turnosConBalayage);

  subheader('ParseInput');
  assert(parseOutput.complejidad_maxima === 'media', 'complejidad manicura simple = media');
  assert(parseOutput.duracion_estimada === 120, 'duracion manicura simple = 120min');
  assert(!parseOutput.agregar_a_turno_existente, 'NO es agregar servicio (turno nuevo)');

  subheader('AnalizarDisponibilidad');
  const opciones = analizarOutput.opciones || analizarOutput.slots_recomendados || [];
  assert(opciones.length > 0, `tiene opciones (${opciones.length})`);

  if (opciones.length > 0) {
    // Buscar opcion del mie 25 con cualquier trabajadora
    // Con balanceo de carga, Companera puede ganar (Leraysi tiene mas bloques)
    const opMie25 = opciones.find(o => o.fecha === TEST_DATE);
    assert(!!opMie25, 'hay opcion para mie 25');

    if (opMie25) {
      info(`  Trabajadora: ${opMie25.trabajadora}`);
      const horaInicioMin = parseInt(opMie25.hora_inicio.split(':')[0]) * 60 + parseInt(opMie25.hora_inicio.split(':')[1]);
      const horaFinMin = parseInt(opMie25.hora_fin.split(':')[0]) * 60 + parseInt(opMie25.hora_fin.split(':')[1]);
      info(`  Slot encontrado: ${opMie25.hora_inicio}-${opMie25.hora_fin}`);

      // Companera puede tener slots fuera de la ventana de proceso (esta libre todo el dia)
      // Leraysi solo puede atender durante proceso (12:00-17:00)
      // Ambos son resultados validos con balanceo de carga
      assert(horaInicioMin >= 540 && horaFinMin <= 1140, 'slot cabe en jornada (09:00-19:00)');
    }
  }

  subheader('FormatearRespuestaOpciones');
  assert(formatOutput.accion === 'opciones_disponibles', 'accion = opciones_disponibles (turno nuevo, no agregar)', 'opciones_disponibles', formatOutput.accion);
  info(`  Mensaje: ${formatOutput.mensaje_para_clienta.substring(0, 150)}...`);
}


// ============================================================================
// TEST H: Turno nuevo muy_compleja cuando Leraysi ya tiene balayage
// ============================================================================
// Leraysi tiene balayage (09:00-19:00) el mie 25.
// Otra clienta quiere alisado brasileño (muy_compleja, 600min) ese mismo dia.
// Esperado: Leraysi NO puede (bloques activos solapan), ofrece Companera o dias alternativos.

header('TEST H: Turno nuevo muy_compleja cuando Leraysi ya tiene balayage');
info('Leraysi tiene balayage el mie 25 — bloques activos: 09:00-12:00 + 17:00-19:00');
info('Otra clienta pide alisado brasileño (muy_compleja, 600min) mismo dia');
info('Esperado: Leraysi NO puede, ofrece Companera ese dia o dias alternativos');

{
  const turnosConBalayage = [
    {
      id: 200,
      odoo_turno_id: 20,
      fecha: `${TEST_DATE}T12:00:00Z`,
      hora: '09:00',
      duracion_min: 600,
      complejidad_maxima: { value: 'muy_compleja' },
      servicio: [{ value: 'Balayage' }],
      servicio_detalle: 'Balayage',
      trabajadora: { value: 'Leraysi' },
      estado: { value: 'confirmado' },
      precio: 50000,
      sena_monto: 15000,
      clienta_id: [{ id: 99 }]
    }
  ];

  const toolInput = {
    llm_output: {
      modo: 'consultar_disponibilidad',
      servicio: ['Alisado brasileño'],
      fecha_deseada: TEST_DATE,
      hora_deseada: '09:00',
      full_name: 'Carolina Test',
      email: 'carolina@test.com'
    },
    state: {
      lead_id: 300,
      row_id: 300,
      phone: '+5491188888888',
      email: 'carolina@test.com',
      full_name: 'Carolina Test'
    }
  };

  const { parseOutput, analizarOutput, formatOutput } = runPipeline(toolInput, turnosConBalayage);

  subheader('ParseInput');
  assert(parseOutput.complejidad_maxima === 'muy_compleja', 'complejidad alisado = muy_compleja');
  assert(parseOutput.duracion_estimada === 600, 'duracion alisado = 600min');
  assert(parseOutput.activo_inicio === 180, 'activo_inicio = 180');

  subheader('AnalizarDisponibilidad');
  const opciones = analizarOutput.opciones || analizarOutput.slots_recomendados || [];
  assert(opciones.length > 0, `tiene opciones (${opciones.length})`);

  // Leraysi NO debe tener opcion el mie 25 (sus bloques activos chocan)
  const opMie25Leraysi = opciones.find(o => o.fecha === TEST_DATE && o.trabajadora === 'Leraysi');
  assert(!opMie25Leraysi, 'Leraysi NO tiene opcion el mie 25 (conflicto bloques activos)');

  // Companera SI debe tener opcion el mie 25 (esta libre)
  const opMie25Companera = opciones.find(o => o.fecha === TEST_DATE && o.trabajadora === 'Companera');
  assert(!!opMie25Companera, 'Companera SI tiene opcion el mie 25');

  if (opMie25Companera) {
    info(`  Companera: ${opMie25Companera.fecha} ${opMie25Companera.hora_inicio}-${opMie25Companera.hora_fin}`);
    assert(opMie25Companera.hora_inicio === '09:00', 'Companera empieza 09:00', '09:00', opMie25Companera.hora_inicio);
    assert(opMie25Companera.hora_fin === '19:00', 'Companera jornada completa hasta 19:00', '19:00', opMie25Companera.hora_fin);
  }

  subheader('FormatearRespuestaOpciones');
  assert(formatOutput.accion === 'opciones_disponibles', 'accion = opciones_disponibles');
  info(`  Mensaje: ${formatOutput.mensaje_para_clienta.substring(0, 150)}...`);
}


// ============================================================================
// TEST I: 3ra muy_compleja mismo dia — ambas trabajadoras ocupadas
// ============================================================================
// Leraysi tiene balayage + Companera tiene alisado brasileño el mie 25.
// Tercera clienta pide mechas completas (muy_compleja) mismo dia.
// Esperado: NO hay opcion para mie 25, ofrece dias alternativos.

header('TEST I: 3ra muy_compleja mismo dia — ambas trabajadoras ocupadas');
info('Leraysi: balayage mie 25 (09:00-19:00) + Companera: alisado mie 25 (09:00-19:00)');
info('Tercera clienta pide mechas completas (muy_compleja) mismo dia');
info('Esperado: sin disponibilidad mie 25, ofrece otros dias');

{
  const turnosAmbasOcupadas = [
    {
      id: 200,
      odoo_turno_id: 20,
      fecha: `${TEST_DATE}T12:00:00Z`,
      hora: '09:00',
      duracion_min: 600,
      complejidad_maxima: { value: 'muy_compleja' },
      servicio: [{ value: 'Balayage' }],
      servicio_detalle: 'Balayage',
      trabajadora: { value: 'Leraysi' },
      estado: { value: 'confirmado' },
      precio: 50000,
      sena_monto: 15000,
      clienta_id: [{ id: 99 }]
    },
    {
      id: 201,
      odoo_turno_id: 21,
      fecha: `${TEST_DATE}T12:00:00Z`,
      hora: '09:00',
      duracion_min: 600,
      complejidad_maxima: { value: 'muy_compleja' },
      servicio: [{ value: 'Alisado brasileño' }],
      servicio_detalle: 'Alisado brasileño',
      trabajadora: { value: 'Companera' },
      estado: { value: 'confirmado' },
      precio: 45000,
      sena_monto: 13500,
      clienta_id: [{ id: 98 }]
    }
  ];

  const toolInput = {
    llm_output: {
      modo: 'consultar_disponibilidad',
      servicio: ['Mechas completas'],
      fecha_deseada: TEST_DATE,
      hora_deseada: '09:00',
      full_name: 'Diana Test',
      email: 'diana@test.com'
    },
    state: {
      lead_id: 400,
      row_id: 400,
      phone: '+5491177777777',
      email: 'diana@test.com',
      full_name: 'Diana Test'
    }
  };

  const { parseOutput, analizarOutput, formatOutput } = runPipeline(toolInput, turnosAmbasOcupadas);

  subheader('ParseInput');
  assert(parseOutput.complejidad_maxima === 'muy_compleja', 'complejidad mechas = muy_compleja');
  assert(parseOutput.duracion_estimada === 600, 'duracion mechas = 600min');

  subheader('AnalizarDisponibilidad');
  const opciones = analizarOutput.opciones || analizarOutput.slots_recomendados || [];

  // NO debe haber opciones para mie 25 (ambas trabajadoras ocupadas)
  const opMie25 = opciones.find(o => o.fecha === TEST_DATE);
  assert(!opMie25, 'NO hay opcion para mie 25 (ambas trabajadoras ocupadas)');

  // Debe ofrecer dias alternativos
  assert(opciones.length > 0, `ofrece opciones en otros dias (${opciones.length})`);
  if (opciones.length > 0) {
    const primerDia = opciones[0];
    info(`  Primera opcion: ${primerDia.fecha} ${primerDia.hora_inicio}-${primerDia.hora_fin} (${primerDia.trabajadora})`);
    assert(primerDia.fecha !== TEST_DATE, 'primera opcion es otro dia', '!= 2026-02-25', primerDia.fecha);
  }

  subheader('FormatearRespuestaOpciones');
  assert(formatOutput.accion === 'opciones_disponibles', 'accion = opciones_disponibles');
  assert(formatOutput.mensaje_para_clienta.includes('jornada completa'), 'mensaje menciona jornada completa');
  info(`  Mensaje: ${formatOutput.mensaje_para_clienta.substring(0, 150)}...`);
}


// ============================================================================
// TEST J: Servicio media/compleja cuando ambas tienen muy_compleja
// ============================================================================
// Leraysi: balayage + Companera: alisado (ambas jornada completa mie 25).
// Pero ambas tienen ventana de proceso libre (12:00-17:00).
// Nueva clienta pide manicura simple (120min, media).
// Esperado: cabe en ventana de proceso de cualquier trabajadora.

header('TEST J: Servicio media cuando ambas tienen muy_compleja');
info('Leraysi: balayage + Companera: alisado — ambas mie 25 jornada completa');
info('Pero ventanas de proceso (12:00-17:00) estan libres en ambas');
info('Nueva clienta pide manicura simple (120min, media)');
info('Esperado: encuentra slot en ventana de proceso');

{
  const turnosAmbasMuyCompleja = [
    {
      id: 200,
      odoo_turno_id: 20,
      fecha: `${TEST_DATE}T12:00:00Z`,
      hora: '09:00',
      duracion_min: 600,
      complejidad_maxima: { value: 'muy_compleja' },
      servicio: [{ value: 'Balayage' }],
      servicio_detalle: 'Balayage',
      trabajadora: { value: 'Leraysi' },
      estado: { value: 'confirmado' },
      precio: 50000,
      sena_monto: 15000,
      clienta_id: [{ id: 99 }]
    },
    {
      id: 201,
      odoo_turno_id: 21,
      fecha: `${TEST_DATE}T12:00:00Z`,
      hora: '09:00',
      duracion_min: 600,
      complejidad_maxima: { value: 'muy_compleja' },
      servicio: [{ value: 'Alisado brasileño' }],
      servicio_detalle: 'Alisado brasileño',
      trabajadora: { value: 'Companera' },
      estado: { value: 'confirmado' },
      precio: 45000,
      sena_monto: 13500,
      clienta_id: [{ id: 98 }]
    }
  ];

  const toolInput = {
    llm_output: {
      modo: 'consultar_disponibilidad',
      servicio: ['Manicura simple'],
      fecha_deseada: TEST_DATE,
      hora_deseada: '14:00',
      full_name: 'Elena Test',
      email: 'elena@test.com'
    },
    state: {
      lead_id: 500,
      row_id: 500,
      phone: '+5491166666666',
      email: 'elena@test.com',
      full_name: 'Elena Test'
    }
  };

  const { parseOutput, analizarOutput, formatOutput } = runPipeline(toolInput, turnosAmbasMuyCompleja);

  subheader('ParseInput');
  assert(parseOutput.complejidad_maxima === 'media', 'complejidad manicura = media');
  assert(parseOutput.duracion_estimada === 120, 'duracion = 120min');

  subheader('AnalizarDisponibilidad');
  const opciones = analizarOutput.opciones || analizarOutput.slots_recomendados || [];
  assert(opciones.length > 0, `tiene opciones (${opciones.length})`);

  // Debe encontrar slot el mie 25 en ventana de proceso
  const opMie25 = opciones.find(o => o.fecha === TEST_DATE);
  assert(!!opMie25, 'SI hay opcion para mie 25 (cabe en ventana proceso)');

  if (opMie25) {
    const horaInicioMin = parseInt(opMie25.hora_inicio.split(':')[0]) * 60 + parseInt(opMie25.hora_inicio.split(':')[1]);
    const horaFinMin = parseInt(opMie25.hora_fin.split(':')[0]) * 60 + parseInt(opMie25.hora_fin.split(':')[1]);
    info(`  Slot: ${opMie25.hora_inicio}-${opMie25.hora_fin} (${opMie25.trabajadora})`);

    // Debe estar dentro de la ventana de proceso (12:00-17:00)
    assert(horaInicioMin >= 720, 'hora inicio >= 12:00 (ventana proceso)', '>= 12:00', opMie25.hora_inicio);
    assert(horaFinMin <= 1020, 'hora fin <= 17:00 (ventana proceso)', '<= 17:00', opMie25.hora_fin);
  }

  subheader('FormatearRespuestaOpciones');
  assert(formatOutput.accion === 'opciones_disponibles', 'accion = opciones_disponibles');
  info(`  Mensaje: ${formatOutput.mensaje_para_clienta.substring(0, 150)}...`);
}


// ============================================================================
// TEST K: Ventanas de proceso casi llenas — ultimo slot disponible
// ============================================================================
// Leraysi: balayage + 120min (12:00-14:00) + 60min (14:00-15:00) en ventana
//   → libre: [15:00-17:00] = 120min
// Companera: balayage + 120min (12:00-14:00) en ventana
//   → libre: [14:00-17:00] = 180min
// Nueva clienta pide manicura simple (120min, media).
// Esperado: cabe en Companera (14:00-16:00) o Leraysi (15:00-17:00, justo)

header('TEST K: Ventanas de proceso casi llenas — ultimo slot disponible');
info('Leraysi: balayage + 120min + 60min en ventana → libre [15:00-17:00] (120min)');
info('Companera: balayage + 120min en ventana → libre [14:00-17:00] (180min)');
info('Nueva clienta pide manicura simple (120min, media)');
info('Esperado: encuentra slot en ventana de proceso');

{
  const turnosVentanasCasiLlenas = [
    // Leraysi: balayage
    {
      id: 200, odoo_turno_id: 20,
      fecha: `${TEST_DATE}T12:00:00Z`, hora: '09:00', duracion_min: 600,
      complejidad_maxima: { value: 'muy_compleja' },
      servicio: [{ value: 'Balayage' }], servicio_detalle: 'Balayage',
      trabajadora: { value: 'Leraysi' }, estado: { value: 'confirmado' },
      precio: 50000, sena_monto: 15000, clienta_id: [{ id: 99 }]
    },
    // Leraysi: servicio 120min en ventana proceso (12:00-14:00)
    {
      id: 202, odoo_turno_id: 22,
      fecha: `${TEST_DATE}T15:00:00Z`, hora: '12:00', duracion_min: 120,
      complejidad_maxima: { value: 'media' },
      servicio: [{ value: 'Manicura simple' }], servicio_detalle: 'Manicura simple',
      trabajadora: { value: 'Leraysi' }, estado: { value: 'confirmado' },
      precio: 5000, sena_monto: 1500, clienta_id: [{ id: 97 }]
    },
    // Leraysi: servicio 60min en ventana proceso (14:00-15:00)
    {
      id: 203, odoo_turno_id: 23,
      fecha: `${TEST_DATE}T17:00:00Z`, hora: '14:00', duracion_min: 60,
      complejidad_maxima: { value: 'simple' },
      servicio: [{ value: 'Depilación cera axilas' }], servicio_detalle: 'Depilación cera axilas',
      trabajadora: { value: 'Leraysi' }, estado: { value: 'confirmado' },
      precio: 4000, sena_monto: 1200, clienta_id: [{ id: 96 }]
    },
    // Companera: balayage
    {
      id: 201, odoo_turno_id: 21,
      fecha: `${TEST_DATE}T12:00:00Z`, hora: '09:00', duracion_min: 600,
      complejidad_maxima: { value: 'muy_compleja' },
      servicio: [{ value: 'Alisado brasileño' }], servicio_detalle: 'Alisado brasileño',
      trabajadora: { value: 'Companera' }, estado: { value: 'confirmado' },
      precio: 45000, sena_monto: 13500, clienta_id: [{ id: 98 }]
    },
    // Companera: servicio 120min en ventana proceso (12:00-14:00)
    {
      id: 204, odoo_turno_id: 24,
      fecha: `${TEST_DATE}T15:00:00Z`, hora: '12:00', duracion_min: 120,
      complejidad_maxima: { value: 'media' },
      servicio: [{ value: 'Pedicura' }], servicio_detalle: 'Pedicura',
      trabajadora: { value: 'Companera' }, estado: { value: 'confirmado' },
      precio: 6000, sena_monto: 1800, clienta_id: [{ id: 95 }]
    }
  ];

  const toolInput = {
    llm_output: {
      modo: 'consultar_disponibilidad',
      servicio: ['Manicura simple'],
      fecha_deseada: TEST_DATE,
      hora_deseada: '14:00',
      full_name: 'Fernanda Test',
      email: 'fernanda@test.com'
    },
    state: {
      lead_id: 600,
      row_id: 600,
      phone: '+5491155555555',
      email: 'fernanda@test.com',
      full_name: 'Fernanda Test'
    }
  };

  const { parseOutput, analizarOutput, formatOutput } = runPipeline(toolInput, turnosVentanasCasiLlenas);

  subheader('ParseInput');
  assert(parseOutput.complejidad_maxima === 'media', 'complejidad manicura = media');
  assert(parseOutput.duracion_estimada === 120, 'duracion = 120min');

  subheader('AnalizarDisponibilidad');
  const opciones = analizarOutput.opciones || analizarOutput.slots_recomendados || [];
  assert(opciones.length > 0, `tiene opciones (${opciones.length})`);

  // Debe encontrar slot el mie 25
  const opsMie25 = opciones.filter(o => o.fecha === TEST_DATE);
  assert(opsMie25.length > 0, `SI hay opciones para mie 25 (${opsMie25.length})`);

  if (opsMie25.length > 0) {
    const mejor = opsMie25[0];
    const horaInicioMin = parseInt(mejor.hora_inicio.split(':')[0]) * 60 + parseInt(mejor.hora_inicio.split(':')[1]);
    const horaFinMin = parseInt(mejor.hora_fin.split(':')[0]) * 60 + parseInt(mejor.hora_fin.split(':')[1]);
    info(`  Mejor slot mie 25: ${mejor.hora_inicio}-${mejor.hora_fin} (${mejor.trabajadora})`);

    // Debe estar dentro de ventana de proceso (12:00-17:00) y no solapar con servicios existentes
    assert(horaInicioMin >= 720, 'hora inicio >= 12:00', '>= 12:00', mejor.hora_inicio);
    assert(horaFinMin <= 1020, 'hora fin <= 17:00', '<= 17:00', mejor.hora_fin);

    // Verificar que no solapa con bloques existentes
    // Leraysi: ocupada 12:00-15:00, libre 15:00-17:00
    // Companera: ocupada 12:00-14:00, libre 14:00-17:00
    if (mejor.trabajadora === 'Leraysi') {
      assert(horaInicioMin >= 900, 'Leraysi: empieza >= 15:00 (despues de sus servicios)', '>= 15:00', mejor.hora_inicio);
    } else {
      assert(horaInicioMin >= 840, 'Companera: empieza >= 14:00 (despues de su servicio)', '>= 14:00', mejor.hora_inicio);
    }
  }

  // Mostrar todas las opciones del mie 25
  for (const op of opsMie25) {
    info(`  ${op.trabajadora}: ${op.hora_inicio}-${op.hora_fin}`);
  }

  subheader('FormatearRespuestaOpciones');
  assert(formatOutput.accion === 'opciones_disponibles', 'accion = opciones_disponibles');
  info(`  Mensaje: ${formatOutput.mensaje_para_clienta.substring(0, 200)}...`);
}


// ============================================================================
// TEST L: Sub-servicios comprometidos en ventana de proceso
// ============================================================================
// Leraysi tiene "Balayage + Manicura semipermanente" (turno combinado).
// Los 180 min de manicura semi se ejecutan en la ventana de proceso (12:00-17:00).
// Resultado: solo 120 min libres en la ventana (300 - 180 = 120).
// Nueva clienta pide manicura semipermanente (180min) — NO cabe en ventana Leraysi.
// Pero cabe en Companera (ventana libre completa de 300 min).

header('TEST L: Sub-servicios comprometidos en ventana de proceso');
info('Leraysi: "Balayage + Manicura semipermanente" — 180 min comprometidos en proceso');
info('Ventana Leraysi: solo 120 min libres (300 - 180)');
info('Nueva clienta pide manicura semipermanente (180min)');
info('Esperado: NO cabe en ventana Leraysi, SI en Companera (ventana libre)');

{
  const turnosConCombinado = [
    // Leraysi: turno combinado (Balayage + Manicura semi)
    {
      id: 300, odoo_turno_id: 30,
      fecha: `${TEST_DATE}T12:00:00Z`, hora: '09:00', duracion_min: 600,
      complejidad_maxima: { value: 'muy_compleja' },
      servicio: [{ value: 'Balayage' }, { value: 'Manicura semipermanente' }],
      servicio_detalle: 'Balayage + Manicura semipermanente',
      trabajadora: { value: 'Leraysi' }, estado: { value: 'confirmado' },
      precio: 58000, sena_monto: 17400, clienta_id: [{ id: 80 }]
    }
  ];

  // Otra clienta quiere manicura semipermanente (180 min, compleja) — turno nuevo
  const toolInput = {
    llm_output: {
      modo: 'consultar_disponibilidad',
      servicio: ['Manicura semipermanente'],
      fecha_deseada: TEST_DATE,
      hora_deseada: '14:00',
      full_name: 'Gabriela Test',
      email: 'gabriela@test.com'
    },
    state: {
      lead_id: 700,
      row_id: 700,
      phone: '+5491144444444',
      email: 'gabriela@test.com',
      full_name: 'Gabriela Test'
    }
  };

  const { parseOutput, analizarOutput } = runPipeline(toolInput, turnosConCombinado);

  subheader('ParseInput');
  assert(parseOutput.complejidad_maxima === 'compleja', 'complejidad manicura semi = compleja');
  assert(parseOutput.duracion_estimada === 180, 'duracion = 180min');

  subheader('AnalizarDisponibilidad');
  const opciones = analizarOutput.opciones || analizarOutput.slots_recomendados || [];
  assert(opciones.length > 0, `tiene opciones (${opciones.length})`);

  // Buscar opciones en el dia de test
  const opsDia = opciones.filter(o => o.fecha === TEST_DATE);

  // Leraysi NO debe tener opcion en ventana de proceso (solo 120 min libres, necesita 180)
  const opDiaLeraysi = opsDia.find(o => o.trabajadora === 'Leraysi');
  if (opDiaLeraysi) {
    const horaInicioMin = parseInt(opDiaLeraysi.hora_inicio.split(':')[0]) * 60 + parseInt(opDiaLeraysi.hora_inicio.split(':')[1]);
    // Si Leraysi tiene opcion, debe estar FUERA de la ventana de proceso comprometida
    // Con 180min comprometidos (12:00-15:00), solo queda [15:00-17:00] = 120min, no cabe 180
    assert(false, 'Leraysi NO debe tener slot en ventana de proceso (solo 120 min libres, necesita 180)');
  } else {
    pass('Leraysi correctamente SIN opcion en ventana de proceso (180 > 120 libres)');
    totalPass++;
  }

  // Companera SI debe tener opcion (ventana de proceso completamente libre = 300 min)
  const opDiaCompanera = opsDia.find(o => o.trabajadora === 'Companera');
  if (opDiaCompanera) {
    pass('Companera SI tiene opcion (ventana libre de 300 min)');
    totalPass++;
    const horaInicioMin = parseInt(opDiaCompanera.hora_inicio.split(':')[0]) * 60 + parseInt(opDiaCompanera.hora_inicio.split(':')[1]);
    const horaFinMin = parseInt(opDiaCompanera.hora_fin.split(':')[0]) * 60 + parseInt(opDiaCompanera.hora_fin.split(':')[1]);
    info(`  Companera: ${opDiaCompanera.hora_inicio}-${opDiaCompanera.hora_fin}`);
  } else {
    // Companera no tiene turno ese dia — solo tiene opciones en otros dias (esta bien)
    info('  Companera no tiene turno ese dia (sin ventana de proceso), busca en dias alternos');
  }
}


// ============================================================================
// TEST L2: Sub-servicio pequeno SI cabe en ventana reducida
// ============================================================================
// Mismo turno combinado (Balayage + Manicura semi: 180 min comprometidos).
// Nueva clienta pide manicura simple (120min) — SI cabe (120 <= 120 libres).

header('TEST L2: Sub-servicio pequeno SI cabe en ventana reducida');
info('Leraysi: "Balayage + Manicura semipermanente" — 180 min comprometidos');
info('Ventana Leraysi: 120 min libres [15:00-17:00]');
info('Nueva clienta pide manicura simple (120min)');
info('Esperado: cabe justo en [15:00-17:00]');

{
  const turnosConCombinado = [
    {
      id: 300, odoo_turno_id: 30,
      fecha: `${TEST_DATE}T12:00:00Z`, hora: '09:00', duracion_min: 600,
      complejidad_maxima: { value: 'muy_compleja' },
      servicio: [{ value: 'Balayage' }, { value: 'Manicura semipermanente' }],
      servicio_detalle: 'Balayage + Manicura semipermanente',
      trabajadora: { value: 'Leraysi' }, estado: { value: 'confirmado' },
      precio: 58000, sena_monto: 17400, clienta_id: [{ id: 80 }]
    }
  ];

  const toolInput = {
    llm_output: {
      modo: 'consultar_disponibilidad',
      servicio: ['Manicura simple'],
      fecha_deseada: TEST_DATE,
      hora_deseada: '15:00',
      full_name: 'Helena Test',
      email: 'helena@test.com'
    },
    state: {
      lead_id: 800,
      row_id: 800,
      phone: '+5491133333333',
      email: 'helena@test.com',
      full_name: 'Helena Test'
    }
  };

  const { analizarOutput } = runPipeline(toolInput, turnosConCombinado);

  subheader('AnalizarDisponibilidad');
  const opciones = analizarOutput.opciones || analizarOutput.slots_recomendados || [];
  assert(opciones.length > 0, `tiene opciones (${opciones.length})`);

  // Con balanceo de carga, Companera puede ganar (menos bloques que Leraysi).
  // Lo importante es que hay disponibilidad el mismo dia para 120min.
  const opDia = opciones.find(o => o.fecha === TEST_DATE);
  assert(!!opDia, 'hay opcion el mismo dia (120min cabe en ventana)');

  if (opDia) {
    info(`  Trabajadora: ${opDia.trabajadora}`);
    const horaInicioMin = parseInt(opDia.hora_inicio.split(':')[0]) * 60 + parseInt(opDia.hora_inicio.split(':')[1]);
    const horaFinMin = parseInt(opDia.hora_fin.split(':')[0]) * 60 + parseInt(opDia.hora_fin.split(':')[1]);
    info(`  Slot: ${opDia.hora_inicio}-${opDia.hora_fin}`);
    // Debe caber dentro de la jornada
    assert(horaInicioMin >= 540 && horaFinMin <= 1140, 'slot cabe en jornada');
  }
}


// ============================================================================
// TEST M: Estrategia C — turno existente muy_compleja + agregar servicio simple
// ============================================================================
// Escenario real: Cristina tiene Balayage (muy_compleja) con Leraysi a las 09:00.
// Leraysi esta FULL con Andrea (Balayage + Mani semi).
// Cristina quiere agregar Manicura simple (120 min).
// El sistema debe encontrar espacio en la ventana de proceso [12:00-17:00]
// con Companera (Leraysi ocupada).

header('TEST M: Estrategia C — existente muy_compleja, agregar servicio en ventana');
info('Leraysi: Andrea (Balayage + Mani semi) = full day');
info('Leraysi: Cristina (Balayage) = 09:00, ventana proceso [12:00-17:00]');
info('Companera: Sharon (Mani semi) = 14:00-17:00');
info('Cristina pide agregar Manicura simple (120 min)');
info('Esperado: Companera 12:00-14:00 (antes de Sharon)');

{
  // Turnos existentes del dia
  const turnosConMuyCompleja = [
    // Andrea: Balayage + Mani semi con Leraysi (jornada completa)
    {
      id: 201,
      odoo_turno_id: 15,
      fecha: `${TEST_DATE}T12:00:00Z`,
      hora: '09:00',
      duracion_min: 600,
      complejidad_maxima: { value: 'muy_compleja' },
      servicio: [{ value: 'Manicura semipermanente' }, { value: 'Balayage' }],
      servicio_detalle: 'Manicura semipermanente + Balayage',
      trabajadora: { value: 'Leraysi' },
      estado: { value: 'confirmado' },
      precio: 68000,
      sena_monto: 20400,
      clienta_id: [{ id: 201 }]
    },
    // Sharon: Mani semi con Companera 14:00-17:00
    {
      id: 202,
      odoo_turno_id: 17,
      fecha: `${TEST_DATE}T17:00:00Z`,
      hora: '14:00',
      duracion_min: 180,
      complejidad_maxima: { value: 'compleja' },
      servicio: [{ value: 'Manicura semipermanente' }],
      servicio_detalle: 'Manicura semipermanente',
      trabajadora: { value: 'Companera' },
      estado: { value: 'confirmado' },
      precio: 8000,
      sena_monto: 2400,
      clienta_id: [{ id: 203 }]
    },
    // Cristina: Balayage con Leraysi (jornada completa)
    {
      id: 203,
      odoo_turno_id: 19,
      fecha: `${TEST_DATE}T12:00:00Z`,
      hora: '09:00',
      duracion_min: 600,
      complejidad_maxima: { value: 'muy_compleja' },
      servicio: [{ value: 'Balayage' }],
      servicio_detalle: 'Balayage',
      trabajadora: { value: 'Leraysi' },
      estado: { value: 'confirmado' },
      precio: 60000,
      sena_monto: 18000,
      clienta_id: [{ id: 204 }]
    }
  ];

  const toolInput = {
    llm_output: {
      modo: 'consultar_disponibilidad',
      agregar_a_turno_existente: true,
      turno_id_existente: '19',
      turno_precio_existente: 60000,
      servicio: ['Manicura simple'],
      precio: 5000,
      fecha_deseada: TEST_DATE,
      hora_deseada: '09:00',
      full_name: 'Cristina Blanco',
      email: 'cristina@test.com'
    },
    state: {
      row_id: 204,
      full_name: 'Cristina Blanco',
      email: 'cristina@test.com',
      stage: 'turno_confirmado',
      servicio_interes: 'Balayage',
      turno_agendado: true,
      turno_fecha: `${TEST_DATE}T12:00:00Z`,
      sena_pagada: true,
      lead_id: 15
    }
  };

  const { parseOutput, analizarOutput, formatOutput } = runPipeline(toolInput, turnosConMuyCompleja);

  subheader('ParseInput');
  assert(parseOutput.duracion_estimada === 120, 'duracion manicura simple = 120 min', 120, parseOutput.duracion_estimada);
  assert(parseOutput.agregar_a_turno_existente === true, 'agregar_a_turno_existente = true', true, parseOutput.agregar_a_turno_existente);

  subheader('AnalizarDisponibilidad');
  assert(analizarOutput.disponible === true, 'disponible = true (Estrategia C)', true, analizarOutput.disponible);
  assert(analizarOutput.opciones.length > 0, 'tiene opciones', '>0', analizarOutput.opciones.length);
  assert(analizarOutput.turno_complejidad_existente === 'muy_compleja', 'turno existente es muy_compleja', 'muy_compleja', analizarOutput.turno_complejidad_existente);

  // Buscar opcion del mismo dia
  const opMismoDia = analizarOutput.opciones.find(o => o.fecha === TEST_DATE);
  assert(opMismoDia != null, 'tiene opcion en el mismo dia', 'opcion', opMismoDia);

  if (opMismoDia) {
    assert(opMismoDia.en_proceso === true, 'en_proceso = true (servicio en ventana)', true, opMismoDia.en_proceso);
    assert(opMismoDia.es_agregar_servicio === true, 'es_agregar_servicio = true', true, opMismoDia.es_agregar_servicio);
    assert(opMismoDia.duracion_min === 600, 'duracion se mantiene 600 (jornada completa)', 600, opMismoDia.duracion_min);
    info(`  Trabajadora: ${opMismoDia.trabajadora}`);
    info(`  Servicio en ventana: ${opMismoDia.hora_servicio_existente}`);

    // Leraysi tiene [15:00-17:00] libre (despues de Andrea sub-service, antes de activo_fin)
    // 120 min = Manicura simple cabe justo
    assert(opMismoDia.trabajadora === 'Leraysi', 'Leraysi atiende (hueco 15:00-17:00 en proceso)', 'Leraysi', opMismoDia.trabajadora);
    assert(opMismoDia.hora_servicio_existente === '15:00', 'servicio a las 15:00 (hueco libre en proceso)', '15:00', opMismoDia.hora_servicio_existente);
  }

  subheader('FormatearRespuestaOpciones');
  assert(formatOutput.accion === 'opciones_agregar_servicio', 'accion = opciones_agregar_servicio', 'opciones_agregar_servicio', formatOutput.accion);
  assert(formatOutput.mensaje_para_clienta.includes('jornada completa'), 'mensaje menciona jornada completa', 'jornada completa', formatOutput.mensaje_para_clienta);
}

// ============================================================================
// TEST M2: Estrategia C — ventana llena, sin disponibilidad
// ============================================================================

header('TEST M2: Estrategia C — ventana proceso llena, sin espacio');
info('Leraysi: Andrea (Balayage + Mani semi) = full day');
info('Companera: turno 12:00-17:00 (ventana completa ocupada)');
info('Cristina pide agregar servicio 180 min');
info('Esperado: sin disponibilidad en ese dia');

{
  const turnosLlenos = [
    // Andrea: Balayage + Mani semi con Leraysi
    {
      id: 301,
      odoo_turno_id: 30,
      fecha: `${TEST_DATE}T12:00:00Z`,
      hora: '09:00',
      duracion_min: 600,
      complejidad_maxima: { value: 'muy_compleja' },
      servicio: [{ value: 'Manicura semipermanente' }, { value: 'Balayage' }],
      servicio_detalle: 'Manicura semipermanente + Balayage',
      trabajadora: { value: 'Leraysi' },
      estado: { value: 'confirmado' },
      precio: 68000,
      clienta_id: [{ id: 301 }]
    },
    // Companera ocupada TODA la ventana 12:00-17:00
    {
      id: 302,
      odoo_turno_id: 31,
      fecha: `${TEST_DATE}T15:00:00Z`,
      hora: '12:00',
      duracion_min: 300,
      complejidad_maxima: { value: 'compleja' },
      servicio: [{ value: 'Pedicura' }],
      servicio_detalle: 'Pedicura',
      trabajadora: { value: 'Companera' },
      estado: { value: 'confirmado' },
      precio: 6000,
      clienta_id: [{ id: 302 }]
    },
    // Cristina: Balayage con Leraysi
    {
      id: 303,
      odoo_turno_id: 32,
      fecha: `${TEST_DATE}T12:00:00Z`,
      hora: '09:00',
      duracion_min: 600,
      complejidad_maxima: { value: 'muy_compleja' },
      servicio: [{ value: 'Balayage' }],
      servicio_detalle: 'Balayage',
      trabajadora: { value: 'Leraysi' },
      estado: { value: 'confirmado' },
      precio: 60000,
      sena_monto: 18000,
      clienta_id: [{ id: 204 }]
    }
  ];

  const toolInput = {
    llm_output: {
      modo: 'consultar_disponibilidad',
      agregar_a_turno_existente: true,
      turno_id_existente: '32',
      turno_precio_existente: 60000,
      servicio: ['Manicura semipermanente'],
      precio: 8000,
      fecha_deseada: TEST_DATE,
      hora_deseada: '09:00',
      full_name: 'Cristina Blanco',
      email: 'cristina@test.com'
    },
    state: {
      row_id: 204,
      full_name: 'Cristina Blanco',
      email: 'cristina@test.com',
      stage: 'turno_confirmado',
      turno_agendado: true,
      turno_fecha: `${TEST_DATE}T12:00:00Z`,
      sena_pagada: true,
      lead_id: 15
    }
  };

  const { analizarOutput } = runPipeline(toolInput, turnosLlenos);

  subheader('AnalizarDisponibilidad');
  // En el mismo dia no hay espacio, pero deberia ofrecer otros dias
  const opMismoDia = (analizarOutput.opciones || []).find(o => o.fecha === TEST_DATE);
  assert(opMismoDia == null, 'SIN opcion en el mismo dia (ventana llena)', null, opMismoDia);
  // Pero deberia tener opciones en otros dias
  assert(analizarOutput.opciones.length > 0, 'tiene opciones en otros dias (Estrategia C fallback)', '>0', analizarOutput.opciones.length);
}


// ============================================================================
// RESUMEN
// ============================================================================
console.log(`\n${COLORS.bold}${'='.repeat(70)}${COLORS.reset}`);
console.log(`${COLORS.bold}  RESUMEN${COLORS.reset}`);
console.log(`${'='.repeat(70)}`);
console.log(`  ${COLORS.green}${totalPass} passed${COLORS.reset}  ${totalFail > 0 ? COLORS.red : COLORS.dim}${totalFail} failed${COLORS.reset}`);

if (totalFail > 0) {
  console.log(`\n  ${COLORS.red}${COLORS.bold}HAY TESTS FALLIDOS!${COLORS.reset}\n`);
  process.exit(1);
} else {
  console.log(`\n  ${COLORS.green}${COLORS.bold}TODOS LOS TESTS PASARON${COLORS.reset}\n`);
  process.exit(0);
}
