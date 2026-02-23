// ============================================================================
// ANALIZAR DISPONIBILIDAD - Agente Calendario Leraysi v2
// ============================================================================
// INPUT: ParseInput (datos del turno) + GetTurnosSemana (turnos existentes)
// OUTPUT: Opciones disponibles con trabajadora asignada
// ============================================================================
// MODELO: 2 trabajadoras (A, B), bloques activos continuos,
// servicios muy_compleja con 3 fases (activo_inicio + proceso + activo_fin).
// Durante la fase de proceso la trabajadora queda LIBRE para atender otras clientas.
// ============================================================================

const turnosRaw = $('GetTurnosSemana').all();
const turnos = turnosRaw.length > 0 ? turnosRaw.map(item => item.json) : [];
const input = $('ParseInput').first().json;

// ============================================================================
// CONSTANTES
// ============================================================================
const JORNADA_INICIO = 540;   // 09:00 en minutos desde medianoche
const JORNADA_FIN = 1140;     // 19:00 en minutos desde medianoche
const TRABAJADORAS = ['Leraysi', 'Compañera'];
const STEP = 15;              // Granularidad de búsqueda en minutos

// Fases estándar para todos los servicios muy_compleja
const FASES_MUY_COMPLEJA = { activo_inicio: 180, proceso: 300, activo_fin: 120 };

// ============================================================================
// HELPERS
// ============================================================================
function horaToMinutos(horaStr) {
  if (!horaStr) return JORNADA_INICIO;
  const parts = horaStr.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1] || '0');
}

function minutosToHora(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Detectar solapamiento entre dos intervalos [a1,a2) y [b1,b2)
function solapan(a1, a2, b1, b2) {
  return a1 < b2 && b1 < a2;
}

const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const diasNombre = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// ============================================================================
// PASO 1: CONSTRUIR BLOQUES ACTIVOS POR TRABAJADORA POR DÍA
// ============================================================================
// Para cada turno existente en Baserow, calcular sus bloques de tiempo activo:
//   - muy_compleja: DOS bloques [inicio, inicio+180] y [inicio+480, inicio+600]
//   - Otros: UN bloque continuo [inicio, inicio+duracion]
// Turnos sin campo "trabajadora" se asignan a "A" por defecto (legacy).

const bloquesPorDiaTrabajadora = {};  // { "2026-02-24": { "A": [...], "B": [...] } }
const ventanasProcesoPorDia = {};     // { "2026-02-24": [{ trabajadora, inicio, fin, turno_id }] }

function inicializarDia(fecha) {
  if (!bloquesPorDiaTrabajadora[fecha]) {
    bloquesPorDiaTrabajadora[fecha] = { 'A': [], 'B': [] };
    ventanasProcesoPorDia[fecha] = [];
  }
}

turnos.forEach(turno => {
  const fecha = turno.fecha?.split('T')[0];
  if (!fecha) return;

  // Filtrar estados inválidos
  const estado = turno.estado?.value || turno.estado || '';
  if (estado === 'cancelado' || estado === 'expirado') return;

  inicializarDia(fecha);

  const trabajadora = turno.trabajadora?.value || turno.trabajadora || 'Leraysi';
  const horaInicio = horaToMinutos(turno.hora || '09:00');
  const duracion = Number(turno.duracion_min) || 60;
  const complejidad = turno.complejidad_maxima?.value || turno.complejidad_maxima || 'media';

  if (complejidad === 'muy_compleja') {
    // 3 fases: activo_inicio (180min) + proceso (300min) + activo_fin (120min)
    const ai = FASES_MUY_COMPLEJA.activo_inicio;
    const pr = FASES_MUY_COMPLEJA.proceso;
    const af = FASES_MUY_COMPLEJA.activo_fin;

    bloquesPorDiaTrabajadora[fecha][trabajadora].push(
      { start: horaInicio, end: horaInicio + ai },
      { start: horaInicio + ai + pr, end: horaInicio + ai + pr + af }
    );

    // Registrar ventana de proceso (trabajadora LIBRE durante este tiempo)
    ventanasProcesoPorDia[fecha].push({
      trabajadora,
      inicio: horaInicio + ai,
      fin: horaInicio + ai + pr,
      turno_id: turno.odoo_turno_id || turno.id
    });
  } else {
    // Bloque continuo
    bloquesPorDiaTrabajadora[fecha][trabajadora].push({
      start: horaInicio,
      end: horaInicio + duracion
    });
  }
});

// ============================================================================
// PASO 2: GENERAR DÍAS DE BÚSQUEDA
// ============================================================================
// Próximos 30 días, excluir domingos y hoy (regla de negocio: mínimo mañana)
const hoy = new Date();
const ahoraArgentina = new Date(hoy.getTime() - 3 * 60 * 60 * 1000);
const hoyStr = ahoraArgentina.toISOString().split('T')[0];

const diasDisponibles = [];
for (let i = 1; i <= 30; i++) {
  const fecha = new Date(hoy);
  fecha.setDate(hoy.getDate() + i);
  const fechaStr = fecha.toISOString().split('T')[0];
  const diaSemana = fecha.getDay();
  if (diaSemana === 0) continue; // Domingo cerrado
  diasDisponibles.push({
    fecha: fechaStr,
    nombre_dia: diasNombre[diaSemana],
    fechaObj: fecha
  });
}

// ============================================================================
// PASO 3: PARÁMETROS DEL NUEVO SERVICIO
// ============================================================================
const duracionNueva = input.duracion_estimada || 60;
const complejidadNueva = input.complejidad_maxima || 'media';
const esMuyCompleja = complejidadNueva === 'muy_compleja' && input.activo_inicio != null;

const nuevoActivoInicio = input.activo_inicio || 0;
const nuevoProceso = input.proceso || 0;
const nuevoActivoFin = input.activo_fin || 0;

// Fecha y hora deseadas
const fechaSolicitadaRaw = input.fecha_deseada || '';
const fechaSolicitada = fechaSolicitadaRaw.includes('T')
  ? fechaSolicitadaRaw.split('T')[0]
  : fechaSolicitadaRaw.split(' ')[0];
const horaDeseada = input.hora_deseada ? horaToMinutos(input.hora_deseada) : null;
const preferenciaHorario = input.preferencia_horario || null;

// ============================================================================
// PASO 4: FUNCIONES DE CÁLCULO DE BLOQUES
// ============================================================================

// Retorna los bloques activos que el nuevo servicio ocuparía si empieza en horaInicio
function bloquesActivosNuevoServicio(horaInicio) {
  if (esMuyCompleja) {
    return [
      { start: horaInicio, end: horaInicio + nuevoActivoInicio },
      { start: horaInicio + nuevoActivoInicio + nuevoProceso, end: horaInicio + nuevoActivoInicio + nuevoProceso + nuevoActivoFin }
    ];
  }
  return [{ start: horaInicio, end: horaInicio + duracionNueva }];
}

// Verificar que todos los bloques están dentro de la jornada
function dentroDeJornada(bloques) {
  return bloques.every(b => b.start >= JORNADA_INICIO && b.end <= JORNADA_FIN);
}

// Verificar que ningún bloque nuevo solapa con bloques existentes
function sinConflictos(bloquesNuevos, bloquesExistentes) {
  for (const nuevo of bloquesNuevos) {
    for (const existente of bloquesExistentes) {
      if (solapan(nuevo.start, nuevo.end, existente.start, existente.end)) {
        return false;
      }
    }
  }
  return true;
}

// ============================================================================
// PASO 5: BUSCAR SLOTS DISPONIBLES
// ============================================================================
const candidatos = [];

// Priorizar la fecha solicitada
let diasBusqueda = [...diasDisponibles];
if (fechaSolicitada) {
  const idxReq = diasBusqueda.findIndex(d => d.fecha === fechaSolicitada);
  if (idxReq > 0) {
    const [diaReq] = diasBusqueda.splice(idxReq, 1);
    diasBusqueda.unshift(diaReq);
  }
}

// Limitar búsqueda a 14 días
diasBusqueda = diasBusqueda.slice(0, 14);

for (const dia of diasBusqueda) {
  if (candidatos.length >= 12) break;

  inicializarDia(dia.fecha);
  const bloquesDia = bloquesPorDiaTrabajadora[dia.fecha];

  for (let startMin = JORNADA_INICIO; startMin < JORNADA_FIN; startMin += STEP) {
    const bloquesNuevos = bloquesActivosNuevoServicio(startMin);

    // Verificar que cabe en la jornada
    if (!dentroDeJornada(bloquesNuevos)) continue;

    // Probar con cada trabajadora (A primero por prioridad de desempate)
    for (const trabajadora of TRABAJADORAS) {
      if (!sinConflictos(bloquesNuevos, bloquesDia[trabajadora])) continue;

      // Slot válido — calcular score
      const esFechaDeseada = dia.fecha === fechaSolicitada;
      let score = 0;

      // +10 si coincide con hora exacta deseada
      if (horaDeseada !== null && startMin === horaDeseada) score += 10;

      // +8 si es la fecha solicitada
      if (esFechaDeseada) score += 8;

      // +5 si encaja en preferencia horaria
      if (preferenciaHorario === 'manana' && startMin < 12 * 60) score += 5;
      else if (preferenciaHorario === 'tarde' && startMin >= 13 * 60) score += 5;

      // +2 cercanía a hora deseada (≤60min de distancia)
      if (horaDeseada !== null && Math.abs(startMin - horaDeseada) <= 60) score += 2;

      // +1 Leraysi tiene prioridad (desempate)
      if (trabajadora === 'Leraysi') score += 1;

      // Hora fin para display (tiempo total de la clienta en el salón)
      const horaFinMin = esMuyCompleja
        ? startMin + nuevoActivoInicio + nuevoProceso + nuevoActivoFin
        : startMin + duracionNueva;

      candidatos.push({
        trabajadora,
        fecha: dia.fecha,
        hora_inicio: minutosToHora(startMin),
        hora_fin: minutosToHora(horaFinMin),
        nombre_dia: dia.nombre_dia,
        duracion_min: esMuyCompleja ? (nuevoActivoInicio + nuevoProceso + nuevoActivoFin) : duracionNueva,
        score,
        es_fecha_alternativa: !esFechaDeseada,
        en_proceso: false
      });
    }
  }
}

// ============================================================================
// PASO 6: CASO ESPECIAL — AGREGAR SERVICIO EN VENTANA DE PROCESO
// ============================================================================
// Si la clienta tiene un turno muy_compleja existente y quiere agregar un servicio,
// el nuevo servicio puede caber dentro de la ventana de proceso (5h libre).
// La misma trabajadora lo atiende durante el tiempo de espera del químico.

if (input.agregar_a_turno_existente && input.turno_fecha) {
  const turnoFecha = input.turno_fecha.includes('T')
    ? input.turno_fecha.split('T')[0]
    : input.turno_fecha.split(' ')[0];

  const ventanas = ventanasProcesoPorDia[turnoFecha] || [];

  for (const ventana of ventanas) {
    // Solo servicios NO muy_compleja pueden meterse en una ventana de proceso
    if (esMuyCompleja) continue;

    const ventanaDuracion = ventana.fin - ventana.inicio;
    if (duracionNueva > ventanaDuracion) continue;

    // Verificar que no haya otros servicios ya en esta ventana
    const bloquesVentanaTrabajadora = (bloquesPorDiaTrabajadora[turnoFecha] || {})[ventana.trabajadora] || [];
    const nuevoBloque = [{ start: ventana.inicio, end: ventana.inicio + duracionNueva }];

    if (sinConflictos(nuevoBloque, bloquesVentanaTrabajadora)) {
      candidatos.unshift({
        trabajadora: ventana.trabajadora,
        fecha: turnoFecha,
        hora_inicio: minutosToHora(ventana.inicio),
        hora_fin: minutosToHora(ventana.inicio + duracionNueva),
        nombre_dia: diasNombre[new Date(turnoFecha + 'T12:00:00').getDay()],
        duracion_min: duracionNueva,
        score: 20,  // Máxima prioridad: reutilizar ventana de proceso del mismo día
        es_fecha_alternativa: false,
        en_proceso: true
      });
    }
  }
}

// ============================================================================
// PASO 7: DEDUPLICAR Y SELECCIONAR TOP 3
// ============================================================================
// No repetir misma fecha+hora (quedarse con el de mayor score)
const vistos = new Set();
const candidatosUnicos = [];
for (const c of candidatos) {
  const key = `${c.fecha}-${c.hora_inicio}`;
  if (!vistos.has(key)) {
    vistos.add(key);
    candidatosUnicos.push(c);
  }
}

// Ordenar por score descendente
candidatosUnicos.sort((a, b) => b.score - a.score);

const opciones = candidatosUnicos.slice(0, 3).map((s, i) => {
  const fechaObj = new Date(s.fecha + 'T12:00:00');
  return {
    opcion: i + 1,
    trabajadora: s.trabajadora,
    fecha: s.fecha,
    hora_inicio: s.hora_inicio,
    hora_fin: s.hora_fin,
    nombre_dia: s.nombre_dia,
    fecha_humana: `${s.nombre_dia.toLowerCase()} ${fechaObj.getDate()} de ${meses[fechaObj.getMonth()]}`,
    duracion_min: s.duracion_min,
    es_fecha_alternativa: s.es_fecha_alternativa,
    en_proceso: s.en_proceso
  };
});

// ============================================================================
// PASO 8: DETERMINAR DISPONIBILIDAD
// ============================================================================
const disponible = opciones.length > 0;
let motivoNoDisponible = null;

if (!disponible) {
  motivoNoDisponible = `No hay disponibilidad para ${input.servicio_detalle || 'el servicio solicitado'} en los próximos días. Ambas trabajadoras tienen la agenda completa.`;
}

// ============================================================================
// PASO 9: EXTRAER DATOS DE TURNO EXISTENTE (reprogramación/agregar servicio)
// ============================================================================
let turnoServicioExistente = null;
let turnoIdExistente = null;
let turnoPrecioExistente = null;
let turnoDuracionExistente = null;
let turnoComplejidadExistente = null;
let turnoSenaPagada = null;
let turnoTrabajadoraExistente = null;

if (input.turno_agendado && input.lead_row_id) {
  const turnoUsuaria = turnos.find(t => {
    let turnoClientaRowId = null;
    if (Array.isArray(t.clienta_id) && t.clienta_id.length > 0) {
      turnoClientaRowId = t.clienta_id[0]?.id;
    } else if (t.clienta_id && typeof t.clienta_id === 'object') {
      turnoClientaRowId = t.clienta_id.id || t.clienta_id.value;
    } else {
      turnoClientaRowId = t.clienta_id;
    }
    return turnoClientaRowId && String(turnoClientaRowId) === String(input.lead_row_id);
  });

  if (turnoUsuaria) {
    let servicioValue = null;
    if (turnoUsuaria.servicio_detalle) {
      servicioValue = turnoUsuaria.servicio_detalle;
    } else if (Array.isArray(turnoUsuaria.servicio) && turnoUsuaria.servicio.length > 0) {
      servicioValue = turnoUsuaria.servicio.map(s => s?.value || s).join(' + ');
    } else if (turnoUsuaria.servicio?.value) {
      servicioValue = turnoUsuaria.servicio.value;
    } else {
      servicioValue = turnoUsuaria.servicio;
    }
    turnoServicioExistente = servicioValue || null;
    turnoIdExistente = turnoUsuaria.odoo_turno_id || null;
    turnoPrecioExistente = turnoUsuaria.precio ? Number(turnoUsuaria.precio) : null;
    turnoDuracionExistente = turnoUsuaria.duracion_min ? Number(turnoUsuaria.duracion_min) : null;
    turnoComplejidadExistente = turnoUsuaria.complejidad_maxima?.value || turnoUsuaria.complejidad_maxima || null;
    turnoSenaPagada = turnoUsuaria.sena_monto ? Number(turnoUsuaria.sena_monto) : null;
    turnoTrabajadoraExistente = turnoUsuaria.trabajadora?.value || turnoUsuaria.trabajadora || 'Leraysi';
  }
}

// ============================================================================
// PASO 10: RESUMEN PARA BUILDAGENTPROMPT
// ============================================================================
const resumen = opciones.length > 0
  ? opciones.map(o => `Opción ${o.opcion}: ${o.fecha_humana} ${o.hora_inicio}-${o.hora_fin} (Trabajadora ${o.trabajadora})`).join('\n')
  : 'Sin disponibilidad en los próximos días';

// ============================================================================
// OUTPUT — Compatible con BuildAgentPrompt y FormatearRespuestaOpciones
// ============================================================================
return [{
  json: {
    ...input,

    // Nuevo modelo de disponibilidad
    disponible,
    opciones,
    mensaje_no_disponible: motivoNoDisponible,

    // Alias para compatibilidad con FormatearRespuestaOpciones (lee slots_recomendados)
    slots_recomendados: opciones,

    // Compatibilidad con BuildAgentPrompt
    fecha_disponible: opciones.some(o => !o.es_fecha_alternativa),
    fecha_solicitada: fechaSolicitadaRaw,
    motivo_no_disponible: motivoNoDisponible,
    resumen_disponibilidad: resumen,

    // Alternativas (días sin slot en fecha deseada)
    alternativas: opciones.filter(o => o.es_fecha_alternativa).map(o => ({
      fecha: o.fecha,
      nombre_dia: o.nombre_dia
    })),

    // Turno existente (para reprogramación/agregar servicio)
    turno_servicio_existente: turnoServicioExistente,
    turno_id_existente: turnoIdExistente,
    turno_precio_existente: turnoPrecioExistente,
    turno_duracion_existente: turnoDuracionExistente,
    turno_complejidad_existente: turnoComplejidadExistente,
    turno_sena_pagada: turnoSenaPagada,
    turno_trabajadora_existente: turnoTrabajadoraExistente,

    // Acción explícita
    accion: input.accion || null,

    // Metadata
    turnos_existentes: turnos.length
  }
}];
