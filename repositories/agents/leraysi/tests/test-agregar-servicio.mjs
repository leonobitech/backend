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
// TURNOS EXISTENTES (simula GetTurnosSemana de Baserow)
// ============================================================================
// Configuracion base: manana (martes 25 feb 2026) Leraysi tiene un turno
// de manicura simple a las 15:00 (120 min) para la clienta de prueba (row 86)

function crearTurnosBase() {
  return [
    {
      id: 101,
      odoo_turno_id: 8,
      fecha: '2026-02-25T15:00:00-03:00',
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
      fecha_deseada: '2026-02-25',
      hora_deseada: '15:00',
      nombre_clienta: 'Maria Test'
    },
    state: {
      lead_id: 100,
      row_id: 86,
      phone: '+5491112345678',
      turno_agendado: true,
      turno_fecha: '2026-02-25T15:00:00-03:00',
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
    assert(op1.fecha === '2026-02-25', 'mismo dia', '2026-02-25', op1.fecha);
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
      servicio: ['Manicura semipermanente'],
      fecha_deseada: '2026-02-25',
      hora_deseada: '15:00',
      nombre_clienta: 'Maria Test'
    },
    state: {
      lead_id: 100,
      row_id: 86,
      phone: '+5491112345678',
      turno_agendado: true,
      turno_fecha: '2026-02-25T15:00:00-03:00',
      odoo_turno_id: 8,
      turno_precio_existente: 5000,
      agregar_a_turno_existente: true
    }
  };

  const { parseOutput, analizarOutput, formatOutput } = runPipeline(toolInput, crearTurnosBase());

  subheader('ParseInput');
  assert(parseOutput.modo === 'consultar_disponibilidad', 'modo forzado a consultar_disponibilidad (por agregar_a_turno_existente)', 'consultar_disponibilidad', parseOutput.modo);
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
      servicio: ['Balayage'],
      fecha_deseada: '2026-02-25',
      hora_deseada: '15:00',
      nombre_clienta: 'Maria Test'
    },
    state: {
      lead_id: 100,
      row_id: 86,
      phone: '+5491112345678',
      turno_agendado: true,
      turno_fecha: '2026-02-25T15:00:00-03:00',
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
      fecha: '2026-02-25T09:00:00-03:00',
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
      servicio: ['Tintura raíz'],
      fecha_deseada: '2026-02-25',
      hora_deseada: '15:00',
      nombre_clienta: 'Maria Test'
    },
    state: {
      lead_id: 100,
      row_id: 86,
      phone: '+5491112345678',
      turno_agendado: true,
      turno_fecha: '2026-02-25T15:00:00-03:00',
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
    const hayOtroDia = analizarOutput.opciones.some(o => o.fecha !== '2026-02-25');
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
      fecha: '2026-02-25T09:00:00-03:00',
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
      fecha: '2026-02-25T09:00:00-03:00',
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
      servicio: ['Balayage'],
      fecha_deseada: '2026-02-25',
      hora_deseada: '15:00',
      nombre_clienta: 'Maria Test'
    },
    state: {
      lead_id: 100,
      row_id: 86,
      phone: '+5491112345678',
      turno_agendado: true,
      turno_fecha: '2026-02-25T15:00:00-03:00',
      odoo_turno_id: 8,
      turno_precio_existente: 5000,
      agregar_a_turno_existente: true
    }
  };

  const { analizarOutput, formatOutput } = runPipeline(toolInput, turnosAmbasOcupadas);

  subheader('AnalizarDisponibilidad');
  // No deberia haber opciones para el dia 25 (ambas ocupadas)
  const opcionesDia25 = analizarOutput.opciones.filter(o => o.fecha === '2026-02-25');
  assert(opcionesDia25.length === 0, 'sin opciones para dia 25 (ambas ocupadas)', 0, opcionesDia25.length);

  if (analizarOutput.opciones.length > 0) {
    info(`  Alternativas encontradas: ${analizarOutput.opciones.length}`);
    const op1 = analizarOutput.opciones[0];
    info(`  Primera: ${op1.fecha} ${op1.hora_inicio}-${op1.hora_fin} (${op1.trabajadora})`);
    assert(op1.fecha !== '2026-02-25', 'alternativa es otro dia', '!= 2026-02-25', op1.fecha);
  } else {
    info('  Sin opciones disponibles en proximos dias');
  }

  subheader('FormatearRespuestaOpciones');
  const esOk = formatOutput.accion === 'opciones_agregar_servicio' || formatOutput.accion === 'sin_disponibilidad_agregar';
  assert(esOk, `accion coherente: ${formatOutput.accion}`);
  info(`  Mensaje: ${formatOutput.mensaje_para_clienta.substring(0, 150)}...`);
}


header('TEST F: modo forzado por ParseInput (sin modo del LLM)');
info('LLM NO envia modo, pero agregar_a_turno_existente = true');
info('Esperado: ParseInput fuerza modo = consultar_disponibilidad');

{
  const toolInput = {
    llm_output: {
      // Sin modo! El LLM no lo envio
      servicio: ['Pedicura'],
      fecha_deseada: '2026-02-25',
      hora_deseada: '15:00',
      nombre_clienta: 'Maria Test'
    },
    state: {
      lead_id: 100,
      row_id: 86,
      phone: '+5491112345678',
      turno_agendado: true,
      turno_fecha: '2026-02-25T15:00:00-03:00',
      odoo_turno_id: 8,
      turno_precio_existente: 5000,
      agregar_a_turno_existente: true
    }
  };

  const parseCtx = createN8nContext(toolInput);
  const parseOutput = runNode(join(NODES_DIR, 'ParseInput.js'), parseCtx);

  assert(parseOutput.modo === 'consultar_disponibilidad', 'modo forzado a consultar_disponibilidad (el fix clave!)', 'consultar_disponibilidad', parseOutput.modo);
  assert(parseOutput.agregar_a_turno_existente === true, 'agregar_a_turno_existente se preserva');
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
