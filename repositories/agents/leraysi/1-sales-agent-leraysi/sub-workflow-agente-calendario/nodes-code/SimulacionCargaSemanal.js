// ============================================================================
// SIMULACIÓN: CARGA COMPLETA SEMANAL - 2 Trabajadoras
// ============================================================================
// Embeds the core AnalizarDisponibilidad algorithm to simulate progressive
// filling of a full work week. Outputs detailed booking log.
//
// HOW IT WORKS:
// 1. Starts with empty turnosExistentes[]
// 2. Iterates through 35 service requests
// 3. For each: runs collision detection → picks best slot → "books" it
// 4. Outputs: log of every booking + final week grid
// ============================================================================

// ============================================================================
// CONSTANTES (same as AnalizarDisponibilidad.js)
// ============================================================================
const JORNADA_INICIO = 540;   // 09:00
const JORNADA_FIN = 1140;     // 19:00
const TRABAJADORAS = ['Leraysi', 'Compañera'];
const STEP = 15;
const FASES_MUY_COMPLEJA = { activo_inicio: 180, proceso: 300, activo_fin: 120 };

// Servicios config (same as ParseInput.js)
const SERVICIOS_CONFIG = {
  'Corte mujer': { base_min: 60, complejidad: 'media', requiere_largo: true, precio_base: 8000 },
  'Alisado brasileño': { base_min: 600, complejidad: 'muy_compleja', requiere_largo: true, precio_base: 45000, activo_inicio: 180, proceso: 300, activo_fin: 120 },
  'Alisado keratina':  { base_min: 600, complejidad: 'muy_compleja', requiere_largo: true, precio_base: 55000, activo_inicio: 180, proceso: 300, activo_fin: 120 },
  'Mechas completas':  { base_min: 600, complejidad: 'muy_compleja', requiere_largo: true, precio_base: 35000, activo_inicio: 180, proceso: 300, activo_fin: 120 },
  'Tintura raíz': { base_min: 60, complejidad: 'compleja', requiere_largo: true, precio_base: 15000 },
  'Tintura completa':  { base_min: 600, complejidad: 'muy_compleja', requiere_largo: true, precio_base: 25000, activo_inicio: 180, proceso: 300, activo_fin: 120 },
  'Balayage':          { base_min: 600, complejidad: 'muy_compleja', requiere_largo: true, precio_base: 50000, activo_inicio: 180, proceso: 300, activo_fin: 120 },
  'Manicura simple': { base_min: 120, complejidad: 'media', requiere_largo: false, precio_base: 5000 },
  'Manicura semipermanente': { base_min: 180, complejidad: 'compleja', requiere_largo: false, precio_base: 8000 },
  'Pedicura': { base_min: 120, complejidad: 'media', requiere_largo: false, precio_base: 6000 },
  'Depilación cera piernas': { base_min: 120, complejidad: 'media', requiere_largo: false, precio_base: 10000 },
  'Depilación cera axilas': { base_min: 60, complejidad: 'simple', requiere_largo: false, precio_base: 4000 },
  'Depilación cera bikini': { base_min: 60, complejidad: 'simple', requiere_largo: false, precio_base: 6000 },
  'Depilación láser piernas': { base_min: 120, complejidad: 'media', requiere_largo: false, precio_base: 25000 },
  'Depilación láser axilas': { base_min: 60, complejidad: 'simple', requiere_largo: false, precio_base: 12000 }
};

// ============================================================================
// HELPERS (same as AnalizarDisponibilidad.js)
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

function solapan(a1, a2, b1, b2) {
  return a1 < b2 && b1 < a2;
}

const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const diasNombre = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// ============================================================================
// SEMANA SIMULADA: Feb 24 (Lun) → Mar 1 (Sáb) 2026
// ============================================================================
// Hoy = 2026-02-23 (Lun). El algoritmo excluye hoy, busca desde mañana.
// Feb 24=Mar, 25=Mié, 26=Jue, 27=Vie, 28=Sáb. Mar 1=Dom (cerrado), Mar 2=Lun
// NOTA: Generamos días fijos para reproducibilidad
const SEMANA = [
  { fecha: '2026-02-24', nombre_dia: 'Martes',    diaSemana: 2 },
  { fecha: '2026-02-25', nombre_dia: 'Miércoles', diaSemana: 3 },
  { fecha: '2026-02-26', nombre_dia: 'Jueves',    diaSemana: 4 },
  { fecha: '2026-02-27', nombre_dia: 'Viernes',   diaSemana: 5 },
  { fecha: '2026-02-28', nombre_dia: 'Sábado',    diaSemana: 6 },
  { fecha: '2026-03-02', nombre_dia: 'Lunes',     diaSemana: 1 },
];

// ============================================================================
// 35 SOLICITUDES PROGRESIVAS — Llenado realista de la semana
// ============================================================================
// Estrategia:
// - Primero: muy_compleja que ocupan jornadas completas (bloquean trabajadora)
// - Segundo: servicios medianos que llenan huecos
// - Tercero: servicios cortos que aprovechan ventanas de proceso
// - Final: solicitudes que DEBERÍAN ser rechazadas (salon lleno)
const SOLICITUDES = [
  // ── RONDA 1: Jornadas completas (muy_compleja) ──
  // Cada una ocupa 1 trabajadora todo el día (pero libera 5h de proceso)
  { id: 1, servicio: 'Alisado brasileño',  fecha: '2026-02-24', hora: '09:00', nota: 'Leraysi martes, jornada completa' },
  { id: 2, servicio: 'Mechas completas',   fecha: '2026-02-24', hora: null,    nota: 'Compañera martes, jornada completa' },
  { id: 3, servicio: 'Balayage',           fecha: '2026-02-25', hora: '09:00', nota: 'Leraysi miércoles, jornada completa' },
  { id: 4, servicio: 'Tintura completa',   fecha: '2026-02-25', hora: null,    nota: 'Compañera miércoles, jornada completa' },
  { id: 5, servicio: 'Alisado keratina',   fecha: '2026-02-26', hora: '09:00', nota: 'Leraysi jueves, jornada completa' },
  { id: 6, servicio: 'Mechas completas',   fecha: '2026-02-26', hora: null,    nota: 'Compañera jueves, jornada completa' },

  // ── RONDA 2: Ventanas de proceso — servicios que caben en las 5h libres ──
  // Martes: ambas tienen proceso 12:00-17:00
  { id: 7,  servicio: 'Manicura simple',          fecha: '2026-02-24', hora: '12:00', nota: 'En proceso Leraysi martes 12:00-14:00' },
  { id: 8,  servicio: 'Pedicura',                 fecha: '2026-02-24', hora: '14:00', nota: 'En proceso Leraysi martes 14:00-16:00' },
  { id: 9,  servicio: 'Depilación cera axilas',   fecha: '2026-02-24', hora: '16:00', nota: 'En proceso Leraysi martes 16:00-17:00 (justo!)' },
  { id: 10, servicio: 'Manicura semipermanente',  fecha: '2026-02-24', hora: '12:00', nota: 'En proceso Compañera martes 12:00-15:00' },
  { id: 11, servicio: 'Pedicura',                 fecha: '2026-02-24', hora: '15:00', nota: 'En proceso Compañera martes 15:00-17:00' },

  // Miércoles: ambas tienen proceso 12:00-17:00
  { id: 12, servicio: 'Depilación cera piernas',  fecha: '2026-02-25', hora: '12:00', nota: 'En proceso Leraysi miércoles 12:00-14:00' },
  { id: 13, servicio: 'Corte mujer',              fecha: '2026-02-25', hora: '14:00', nota: 'En proceso Leraysi miércoles 14:00-15:00' },
  { id: 14, servicio: 'Depilación cera bikini',   fecha: '2026-02-25', hora: '15:00', nota: 'En proceso Leraysi miércoles 15:00-16:00' },
  { id: 15, servicio: 'Depilación cera axilas',   fecha: '2026-02-25', hora: '16:00', nota: 'En proceso Leraysi miércoles 16:00-17:00' },
  { id: 16, servicio: 'Manicura simple',          fecha: '2026-02-25', hora: '12:00', nota: 'En proceso Compañera miércoles 12:00-14:00' },
  { id: 17, servicio: 'Depilación láser piernas', fecha: '2026-02-25', hora: '14:00', nota: 'En proceso Compañera miércoles 14:00-16:00' },
  { id: 18, servicio: 'Depilación cera axilas',   fecha: '2026-02-25', hora: '16:00', nota: 'En proceso Compañera miércoles 16:00-17:00' },

  // Jueves: ambas tienen proceso 12:00-17:00
  { id: 19, servicio: 'Manicura semipermanente',  fecha: '2026-02-26', hora: '12:00', nota: 'En proceso Leraysi jueves 12:00-15:00' },
  { id: 20, servicio: 'Pedicura',                 fecha: '2026-02-26', hora: '15:00', nota: 'En proceso Leraysi jueves 15:00-17:00' },
  { id: 21, servicio: 'Corte mujer',              fecha: '2026-02-26', hora: '12:00', nota: 'En proceso Compañera jueves 12:00-13:00' },
  { id: 22, servicio: 'Manicura simple',          fecha: '2026-02-26', hora: '13:00', nota: 'En proceso Compañera jueves 13:00-15:00' },
  { id: 23, servicio: 'Depilación cera bikini',   fecha: '2026-02-26', hora: '15:00', nota: 'En proceso Compañera jueves 15:00-16:00' },
  { id: 24, servicio: 'Tintura raíz',             fecha: '2026-02-26', hora: '16:00', nota: 'En proceso Compañera jueves 16:00-17:00' },

  // ── RONDA 3: Viernes y Sábado sin muy_compleja — servicios medianos ──
  // Viernes: llenar con servicios regulares (no jornada completa)
  { id: 25, servicio: 'Manicura semipermanente',  fecha: '2026-02-27', hora: '09:00', nota: 'Leraysi viernes 09:00-12:00' },
  { id: 26, servicio: 'Depilación cera piernas',  fecha: '2026-02-27', hora: '12:00', nota: 'Leraysi viernes 12:00-14:00' },
  { id: 27, servicio: 'Pedicura',                 fecha: '2026-02-27', hora: '14:00', nota: 'Leraysi viernes 14:00-16:00' },
  { id: 28, servicio: 'Manicura simple',          fecha: '2026-02-27', hora: '16:00', nota: 'Leraysi viernes 16:00-18:00' },
  { id: 29, servicio: 'Depilación láser piernas', fecha: '2026-02-27', hora: '09:00', nota: 'Compañera viernes 09:00-11:00' },
  { id: 30, servicio: 'Manicura semipermanente',  fecha: '2026-02-27', hora: '11:00', nota: 'Compañera viernes 11:00-14:00' },
  { id: 31, servicio: 'Corte mujer',              fecha: '2026-02-27', hora: '14:00', nota: 'Compañera viernes 14:00-15:00' },
  { id: 32, servicio: 'Depilación cera piernas',  fecha: '2026-02-27', hora: '15:00', nota: 'Compañera viernes 15:00-17:00' },

  // Sábado: llenar también
  { id: 33, servicio: 'Alisado brasileño',  fecha: '2026-02-28', hora: '09:00', nota: 'Leraysi sábado, jornada completa' },
  { id: 34, servicio: 'Balayage',           fecha: '2026-02-28', hora: '09:00', nota: 'Compañera sábado, jornada completa' },
  { id: 35, servicio: 'Manicura simple',    fecha: '2026-02-28', hora: '12:00', nota: 'En proceso Leraysi sábado 12:00-14:00' },
  { id: 36, servicio: 'Pedicura',           fecha: '2026-02-28', hora: '14:00', nota: 'En proceso Leraysi sábado 14:00-16:00' },
  { id: 37, servicio: 'Corte mujer',        fecha: '2026-02-28', hora: '12:00', nota: 'En proceso Compañera sábado 12:00-13:00' },
  { id: 38, servicio: 'Manicura simple',    fecha: '2026-02-28', hora: '13:00', nota: 'En proceso Compañera sábado 13:00-15:00' },

  // ── RONDA 4: Huecos pequeños — llenar lo que quede ──
  { id: 39, servicio: 'Depilación cera axilas',  fecha: '2026-02-27', hora: '18:00', nota: 'Leraysi viernes 18:00-19:00 (última hora)' },
  { id: 40, servicio: 'Depilación cera axilas',  fecha: '2026-02-27', hora: '17:00', nota: 'Compañera viernes 17:00-18:00' },
  { id: 41, servicio: 'Depilación cera bikini',  fecha: '2026-02-27', hora: '18:00', nota: 'Compañera viernes 18:00-19:00 (última hora)' },

  // ── RONDA 5: OVERFLOW — Estas deberían ser rechazadas o ir al lunes siguiente ──
  { id: 42, servicio: 'Corte mujer',              fecha: '2026-02-24', hora: '10:00', nota: '⚠️ Martes lleno, debería buscar alternativa' },
  { id: 43, servicio: 'Alisado brasileño',         fecha: '2026-02-25', hora: '09:00', nota: '⚠️ Miércoles lleno, debería buscar alternativa' },
  { id: 44, servicio: 'Manicura semipermanente',   fecha: '2026-02-27', hora: '09:00', nota: '⚠️ Viernes lleno, debería buscar alternativa' },
  { id: 45, servicio: 'Pedicura',                  fecha: null,         hora: null,    nota: '⚠️ Sin preferencia, semana llena → lunes Mar 2' },

  // ── RONDA 6: PASO 6 — Agregar servicio en ventana de proceso (misma clienta) ──
  { id: 46, servicio: 'Depilación cera axilas', fecha: '2026-02-28', hora: null,
    agregar_a_turno_existente: true, turno_fecha: '2026-02-28',
    nota: 'PASO6: agregar en proceso Leraysi sábado (16:00-17:00 libre) → en_proceso' },
  { id: 47, servicio: 'Pedicura', fecha: '2026-02-28', hora: null,
    agregar_a_turno_existente: true, turno_fecha: '2026-02-28',
    nota: 'PASO6: agregar en proceso Compañera sábado (15:00-17:00 libre) → en_proceso' },
  { id: 48, servicio: 'Manicura semipermanente', fecha: '2026-02-24', hora: null,
    agregar_a_turno_existente: true, turno_fecha: '2026-02-24',
    nota: 'PASO6: ventana martes LLENA → fallback a algoritmo general (Lun Mar 2)' },

  // ── RONDA 7: Llenar Lunes Mar 2 (preparar rechazo) ──
  { id: 49, servicio: 'Depilación cera axilas', fecha: '2026-03-02', hora: '09:00',
    nota: 'Llenar Leraysi lunes 09:00-10:00' },

  // ── RONDA 8: CASO NEGATIVO — solapamiento con activo_fin ──
  { id: 50, servicio: 'Manicura semipermanente', fecha: '2026-03-02', hora: '15:00',
    nota: 'NEGATIVO: 15:00+180min=18:00 pisa activo_fin 17:00 → NO debe bookear 15:00' },

  // ── RONDA 9: Llenar último hueco de Lunes Mar 2 ──
  { id: 51, servicio: 'Manicura simple', fecha: '2026-03-02', hora: '12:00',
    nota: 'Llenar Compañera proceso lunes 12:00-14:00 (último hueco)' },

  // ── RONDA 10: RECHAZO TOTAL — toda la semana llena ──
  { id: 52, servicio: 'Corte mujer', fecha: '2026-03-02', hora: '10:00',
    nota: 'RECHAZO: Lunes lleno, no hay más días → RECHAZADO' },
  { id: 53, servicio: 'Pedicura', fecha: null, hora: null,
    nota: 'RECHAZO: Sin preferencia, toda la semana llena → RECHAZADO' },
];

// ============================================================================
// ESTADO DE SIMULACIÓN
// ============================================================================
const turnosBookeados = []; // Simula TurnosBaserow
const resultados = [];      // Log de resultados

// ============================================================================
// CORE ALGORITHM — AnalizarDisponibilidad (embedded)
// ============================================================================
function buscarSlots(turnosExistentes, solicitud) {
  const bloquesPorDiaTrabajadora = {};
  const ventanasProcesoPorDia = {};

  function inicializarDia(fecha) {
    if (!bloquesPorDiaTrabajadora[fecha]) {
      bloquesPorDiaTrabajadora[fecha] = {};
      for (const t of TRABAJADORAS) {
        bloquesPorDiaTrabajadora[fecha][t] = [];
      }
      ventanasProcesoPorDia[fecha] = [];
    }
  }

  // Construir bloques desde turnos existentes
  turnosExistentes.forEach(turno => {
    const fecha = turno.fecha;
    if (!fecha) return;
    inicializarDia(fecha);

    const trabajadora = turno.trabajadora || 'Leraysi';
    const horaInicio = horaToMinutos(turno.hora || '09:00');
    const duracion = Number(turno.duracion_min) || 60;
    const complejidad = turno.complejidad_maxima || 'media';

    if (complejidad === 'muy_compleja') {
      const ai = FASES_MUY_COMPLEJA.activo_inicio;
      const pr = FASES_MUY_COMPLEJA.proceso;
      const af = FASES_MUY_COMPLEJA.activo_fin;
      bloquesPorDiaTrabajadora[fecha][trabajadora].push(
        { start: horaInicio, end: horaInicio + ai },
        { start: horaInicio + ai + pr, end: horaInicio + ai + pr + af }
      );
      ventanasProcesoPorDia[fecha].push({
        trabajadora,
        inicio: horaInicio + ai,
        fin: horaInicio + ai + pr
      });
    } else {
      bloquesPorDiaTrabajadora[fecha][trabajadora].push({
        start: horaInicio,
        end: horaInicio + duracion
      });
    }
  });

  // Parámetros del servicio solicitado
  const config = SERVICIOS_CONFIG[solicitud.servicio];
  if (!config) return { opciones: [], motivo: 'Servicio no encontrado' };

  const duracionNueva = config.base_min;
  const complejidadNueva = config.complejidad;
  const esMuyCompleja = complejidadNueva === 'muy_compleja' && config.activo_inicio != null;

  const nuevoActivoInicio = config.activo_inicio || 0;
  const nuevoProceso = config.proceso || 0;
  const nuevoActivoFin = config.activo_fin || 0;

  const fechaSolicitada = solicitud.fecha || '';
  const horaDeseada = solicitud.hora ? horaToMinutos(solicitud.hora) : null;

  function bloquesActivosNuevoServicio(horaInicio) {
    if (esMuyCompleja) {
      return [
        { start: horaInicio, end: horaInicio + nuevoActivoInicio },
        { start: horaInicio + nuevoActivoInicio + nuevoProceso, end: horaInicio + nuevoActivoInicio + nuevoProceso + nuevoActivoFin }
      ];
    }
    return [{ start: horaInicio, end: horaInicio + duracionNueva }];
  }

  function dentroDeJornada(bloques) {
    return bloques.every(b => b.start >= JORNADA_INICIO && b.end <= JORNADA_FIN);
  }

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

  // Buscar candidatos
  const candidatos = [];

  // Priorizar fecha solicitada
  let diasBusqueda = [...SEMANA];
  if (fechaSolicitada) {
    const idx = diasBusqueda.findIndex(d => d.fecha === fechaSolicitada);
    if (idx > 0) {
      const [dia] = diasBusqueda.splice(idx, 1);
      diasBusqueda.unshift(dia);
    }
  }

  for (const dia of diasBusqueda) {
    if (candidatos.length >= 12) break;
    inicializarDia(dia.fecha);
    const bloquesDia = bloquesPorDiaTrabajadora[dia.fecha];

    for (let startMin = JORNADA_INICIO; startMin < JORNADA_FIN; startMin += STEP) {
      const bloquesNuevos = bloquesActivosNuevoServicio(startMin);
      if (!dentroDeJornada(bloquesNuevos)) continue;

      for (const trabajadora of TRABAJADORAS) {
        if (!sinConflictos(bloquesNuevos, bloquesDia[trabajadora])) continue;

        const esFechaDeseada = dia.fecha === fechaSolicitada;
        let score = 0;
        if (horaDeseada !== null && startMin === horaDeseada) score += 10;
        if (esFechaDeseada) score += 8;
        if (horaDeseada !== null && Math.abs(startMin - horaDeseada) <= 60) score += 2;
        if (trabajadora === 'Leraysi') score += 1;

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

  // PASO 6: Agregar servicio en ventana de proceso (misma clienta)
  if (solicitud.agregar_a_turno_existente && solicitud.turno_fecha) {
    const turnoFecha = solicitud.turno_fecha;
    const ventanas = ventanasProcesoPorDia[turnoFecha] || [];

    for (const ventana of ventanas) {
      if (esMuyCompleja) continue;
      const ventanaDuracion = ventana.fin - ventana.inicio;
      if (duracionNueva > ventanaDuracion) continue;

      const bloquesVentanaTrabajadora = (bloquesPorDiaTrabajadora[turnoFecha] || {})[ventana.trabajadora] || [];

      for (let start = ventana.inicio; start + duracionNueva <= ventana.fin; start += STEP) {
        const nuevoBloque = [{ start: start, end: start + duracionNueva }];
        if (sinConflictos(nuevoBloque, bloquesVentanaTrabajadora)) {
          candidatos.unshift({
            trabajadora: ventana.trabajadora,
            fecha: turnoFecha,
            hora_inicio: minutosToHora(start),
            hora_fin: minutosToHora(start + duracionNueva),
            nombre_dia: diasNombre[new Date(turnoFecha + 'T12:00:00').getDay()],
            duracion_min: duracionNueva,
            score: 20,
            es_fecha_alternativa: false,
            en_proceso: true
          });
          break;
        }
      }
    }
  }

  // Deduplicar y ordenar
  const vistos = new Set();
  const unicos = [];
  for (const c of candidatos) {
    const key = `${c.fecha}-${c.hora_inicio}`;
    if (!vistos.has(key)) {
      vistos.add(key);
      unicos.push(c);
    }
  }
  unicos.sort((a, b) => b.score - a.score);

  // Seleccionar 3 opciones significativamente distintas
  // Misma día+trabajadora: mínimo 60min de separación
  const elegidos = [];
  for (const c of unicos) {
    const cercano = elegidos.some(e =>
      e.fecha === c.fecha &&
      e.trabajadora === c.trabajadora &&
      Math.abs(horaToMinutos(e.hora_inicio) - horaToMinutos(c.hora_inicio)) < 60
    );
    if (!cercano) elegidos.push(c);
    if (elegidos.length >= 3) break;
  }

  const opciones = elegidos.map((s, i) => {
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
      en_proceso: s.en_proceso,
      score: s.score
    };
  });

  return {
    opciones,
    total_candidatos: unicos.length,
    motivo: opciones.length === 0 ? 'Sin disponibilidad — agenda completa' : null
  };
}

// ============================================================================
// EJECUTAR SIMULACIÓN
// ============================================================================
for (const sol of SOLICITUDES) {
  const resultado = buscarSlots(turnosBookeados, sol);

  if (resultado.opciones.length > 0) {
    const elegido = resultado.opciones[0]; // Siempre bookear el mejor slot

    // "Bookear" — agregar a turnosExistentes para la siguiente iteración
    const config = SERVICIOS_CONFIG[sol.servicio];
    turnosBookeados.push({
      fecha: elegido.fecha,
      hora: elegido.hora_inicio,
      trabajadora: elegido.trabajadora,
      servicio: sol.servicio,
      duracion_min: config.base_min,
      complejidad_maxima: config.complejidad,
      estado: 'pendiente_pago'
    });

    resultados.push({
      solicitud_id: sol.id,
      servicio: sol.servicio,
      nota: sol.nota,
      resultado: '✅ BOOKED',
      asignado: `${elegido.trabajadora} | ${elegido.fecha} ${elegido.hora_inicio}-${elegido.hora_fin}`,
      score: elegido.score,
      fecha_solicitada: sol.fecha || 'sin preferencia',
      es_alternativa: elegido.es_fecha_alternativa,
      candidatos_totales: resultado.total_candidatos,
      opciones_ofrecidas: resultado.opciones.map(o =>
        `Op${o.opcion}: ${o.trabajadora} ${o.fecha} ${o.hora_inicio} (score:${o.score})`
      ).join(' | ')
    });
  } else {
    resultados.push({
      solicitud_id: sol.id,
      servicio: sol.servicio,
      nota: sol.nota,
      resultado: '❌ RECHAZADO',
      asignado: null,
      score: null,
      fecha_solicitada: sol.fecha || 'sin preferencia',
      es_alternativa: null,
      candidatos_totales: 0,
      opciones_ofrecidas: resultado.motivo
    });
  }
}

// ============================================================================
// GENERAR GRID VISUAL DE LA SEMANA
// ============================================================================
function generarGrid() {
  const grid = {};
  for (const dia of SEMANA) {
    grid[dia.fecha] = { nombre: dia.nombre_dia, Leraysi: [], Compañera: [] };
  }

  for (const turno of turnosBookeados) {
    const dia = grid[turno.fecha];
    if (!dia) continue;
    const config = SERVICIOS_CONFIG[turno.servicio];
    const emoji = config?.complejidad === 'muy_compleja' ? '🔴' : (config?.complejidad === 'compleja' ? '🟡' : '🟢');
    dia[turno.trabajadora].push(
      `${turno.hora} ${emoji} ${turno.servicio} (${turno.duracion_min}min)`
    );
  }

  const lineas = ['═══ GRID SEMANAL ═══'];
  for (const dia of SEMANA) {
    const d = grid[dia.fecha];
    lineas.push(`\n📅 ${d.nombre} ${dia.fecha}`);
    lineas.push(`  👩 Leraysi:`);
    if (d.Leraysi.length === 0) lineas.push(`    (libre)`);
    else d.Leraysi.sort().forEach(t => lineas.push(`    ${t}`));
    lineas.push(`  👩 Compañera:`);
    if (d.Compañera.length === 0) lineas.push(`    (libre)`);
    else d.Compañera.sort().forEach(t => lineas.push(`    ${t}`));
  }
  return lineas.join('\n');
}

// ============================================================================
// ESTADÍSTICAS
// ============================================================================
const booked = resultados.filter(r => r.resultado === '✅ BOOKED').length;
const rechazados = resultados.filter(r => r.resultado === '❌ RECHAZADO').length;
const alternativas = resultados.filter(r => r.es_alternativa === true).length;
const minutosTotales = turnosBookeados.reduce((sum, t) => sum + (Number(t.duracion_min) || 0), 0);
const capacidadTotal = SEMANA.length * 2 * (JORNADA_FIN - JORNADA_INICIO); // 6 días × 2 trabajadoras × 600 min

const stats = {
  total_solicitudes: SOLICITUDES.length,
  booked,
  rechazados,
  redirigidos_a_alternativa: alternativas,
  minutos_ocupados: minutosTotales,
  capacidad_total_min: capacidadTotal,
  ocupacion_pct: Math.round((minutosTotales / capacidadTotal) * 100) + '%'
};

// ============================================================================
// OUTPUT — Cada resultado como item separado + resumen al final
// ============================================================================
const items = resultados.map(r => ({ json: r }));

// Agregar resumen y grid como últimos items
items.push({ json: { tipo: 'ESTADÍSTICAS', ...stats } });
items.push({ json: { tipo: 'GRID_SEMANAL', grid: generarGrid() } });

return items;
