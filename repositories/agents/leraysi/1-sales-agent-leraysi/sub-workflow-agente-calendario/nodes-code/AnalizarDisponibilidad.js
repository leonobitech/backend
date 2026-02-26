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
const TRABAJADORAS = ['Leraysi', 'Companera'];
const STEP = 15;              // Granularidad de busqueda en minutos

// Fases estandar para todos los servicios muy_compleja
const FASES_MUY_COMPLEJA = { activo_inicio: 180, proceso: 300, activo_fin: 120 };

// Lookup: base_min por servicio (para calcular tiempo comprometido en ventana de proceso)
const SERVICIOS_BASE_MIN = {
  'Corte mujer': 60,
  'Alisado brasileño': 600, 'Alisado keratina': 600,
  'Mechas completas': 600, 'Tintura completa': 600, 'Balayage': 600,
  'Tintura raíz': 60,
  'Manicura simple': 120, 'Manicura semipermanente': 180, 'Pedicura': 120,
  'Depilación cera piernas': 120, 'Depilación cera axilas': 60, 'Depilación cera bikini': 60,
  'Depilación láser piernas': 120, 'Depilación láser axilas': 60,
};

// Servicios muy_compleja (NO consumen ventana de proceso — son la fuente de la ventana)
const SERVICIOS_MUY_COMPLEJA = new Set([
  'Alisado brasileño', 'Alisado keratina', 'Mechas completas',
  'Tintura completa', 'Balayage'
]);

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
const diasNombre = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

// ============================================================================
// PASO 1: CONSTRUIR BLOQUES ACTIVOS POR TRABAJADORA POR DIA
// ============================================================================
// Para cada turno existente en Baserow, calcular sus bloques de tiempo activo:
//   - muy_compleja: DOS bloques [inicio, inicio+180] y [inicio+480, inicio+600]
//   - Otros: UN bloque continuo [inicio, inicio+duracion]
// Turnos sin campo "trabajadora" se asignan a "A" por defecto (legacy).

const bloquesPorDiaTrabajadora = {};  // { "2026-02-24": { "A": [...], "B": [...] } }
const ventanasProcesoPorDia = {};     // { "2026-02-24": [{ trabajadora, inicio, fin, turno_id }] }

function inicializarDia(fecha) {
  if (!bloquesPorDiaTrabajadora[fecha]) {
    bloquesPorDiaTrabajadora[fecha] = {};
    for (const t of TRABAJADORAS) {
      bloquesPorDiaTrabajadora[fecha][t] = [];
    }
    ventanasProcesoPorDia[fecha] = [];
  }
}

// Normalizar nombre de trabajadora al valor exacto en TRABAJADORAS
function normalizarTrabajadora(raw) {
  if (!raw) return 'Leraysi';
  const val = (typeof raw === 'object' ? raw.value : raw) || 'Leraysi';
  // Buscar coincidencia case-insensitive
  const match = TRABAJADORAS.find(t => t.toLowerCase() === val.toLowerCase().trim());
  return match || 'Leraysi';
}

turnos.forEach(turno => {
  const fecha = turno.fecha?.split('T')[0];
  if (!fecha) return;

  // Filtrar estados invalidos
  const estado = turno.estado?.value || turno.estado || '';
  if (estado === 'cancelado' || estado === 'expirado') return;

  // Filtrar pendiente_pago con hold vencido (slot libre en tiempo real)
  if (estado === 'pendiente_pago' && turno.expira_at) {
    const expiraAt = new Date(turno.expira_at);
    if (expiraAt < new Date()) return;
  }

  inicializarDia(fecha);

  const trabajadora = normalizarTrabajadora(turno.trabajadora);
  const horaInicio = horaToMinutos(turno.hora || '09:00');
  const duracion = Number(turno.duracion_min) || 60;
  const complejidad = turno.complejidad_maxima?.value || turno.complejidad_maxima || 'media';

  const turnoId = turno.odoo_turno_id || turno.id || null;

  if (complejidad === 'muy_compleja') {
    // 3 fases: activo_inicio (180min) + proceso (300min) + activo_fin (120min)
    const ai = FASES_MUY_COMPLEJA.activo_inicio;
    const pr = FASES_MUY_COMPLEJA.proceso;
    const af = FASES_MUY_COMPLEJA.activo_fin;

    bloquesPorDiaTrabajadora[fecha][trabajadora].push(
      { start: horaInicio, end: horaInicio + ai, turno_id: turnoId },
      { start: horaInicio + ai + pr, end: horaInicio + ai + pr + af, turno_id: turnoId }
    );

    // Registrar ventana de proceso (trabajadora LIBRE durante este tiempo)
    ventanasProcesoPorDia[fecha].push({
      trabajadora,
      inicio: horaInicio + ai,
      fin: horaInicio + ai + pr,
      turno_id: turnoId
    });

    // Sub-servicios comprometidos en ventana de proceso
    // Si el turno combina servicios (ej: "Balayage + Manicura semipermanente"),
    // los sub-servicios no-quimicos ocupan tiempo dentro de la ventana.
    // Se crea un bloque al INICIO de la ventana para reservar ese tiempo.
    let subServicios = [];
    if (turno.servicio_detalle && turno.servicio_detalle.includes('+')) {
      subServicios = turno.servicio_detalle.split('+').map(s => s.trim());
    } else if (Array.isArray(turno.servicio) && turno.servicio.length > 1) {
      subServicios = turno.servicio.map(s => s?.value || s);
    }

    if (subServicios.length > 1) {
      let tiempoComprometido = 0;
      for (const srv of subServicios) {
        if (!SERVICIOS_MUY_COMPLEJA.has(srv)) {
          tiempoComprometido += (SERVICIOS_BASE_MIN[srv] || 60);
        }
      }
      if (tiempoComprometido > 0) {
        const procesoInicio = horaInicio + ai;
        bloquesPorDiaTrabajadora[fecha][trabajadora].push({
          start: procesoInicio,
          end: Math.min(procesoInicio + tiempoComprometido, procesoInicio + pr),
          turno_id: turnoId
        });
      }
    }
  } else {
    // Bloque continuo
    bloquesPorDiaTrabajadora[fecha][trabajadora].push({
      start: horaInicio,
      end: horaInicio + duracion,
      turno_id: turnoId
    });
  }
});

// ============================================================================
// PASO 2: GENERAR DIAS DE BUSQUEDA
// ============================================================================
// Proximos 30 dias, excluir domingos y hoy (regla de negocio: minimo manana)
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
// PASO 3: PARAMETROS DEL NUEVO SERVICIO
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
// PASO 4: FUNCIONES DE CALCULO DE BLOQUES
// ============================================================================

// Retorna los bloques activos que el nuevo servicio ocuparia si empieza en horaInicio
function bloquesActivosNuevoServicio(horaInicio) {
  if (esMuyCompleja) {
    return [
      { start: horaInicio, end: horaInicio + nuevoActivoInicio },
      { start: horaInicio + nuevoActivoInicio + nuevoProceso, end: horaInicio + nuevoActivoInicio + nuevoProceso + nuevoActivoFin }
    ];
  }
  return [{ start: horaInicio, end: horaInicio + duracionNueva }];
}

// Verificar que todos los bloques estan dentro de la jornada
function dentroDeJornada(bloques) {
  return bloques.every(b => b.start >= JORNADA_INICIO && b.end <= JORNADA_FIN);
}

// Verificar que ningun bloque nuevo solapa con bloques existentes
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
// PASO 4b: EXTRAER DATOS DE TURNO EXISTENTE (antes de buscar slots)
// ============================================================================
// Necesitamos estos datos antes del Paso 5 para:
// - Excluir bloques del turno actual en agregar servicio (se reorganiza)
// - Calcular duracion combinada
let turnoServicioExistente = null;
let turnoIdExistente = null;
let turnoPrecioExistente = null;
let turnoDuracionExistente = null;
let turnoComplejidadExistente = null;
let turnoSenaPagada = null;
let turnoTrabajadoraExistente = null;
let turnoHoraExistente = null;

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
    turnoTrabajadoraExistente = normalizarTrabajadora(turnoUsuaria.trabajadora);
    turnoHoraExistente = turnoUsuaria.hora || null;
  }
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

// Limitar busqueda a 14 dias
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

      // Slot valido - calcular score
      const esFechaDeseada = dia.fecha === fechaSolicitada;
      let score = 0;

      // +10 si coincide con hora exacta deseada
      if (horaDeseada !== null && startMin === horaDeseada) score += 10;

      // +8 si es la fecha solicitada
      if (esFechaDeseada) score += 8;

      // +5 si encaja en preferencia horaria
      if (preferenciaHorario === 'manana' && startMin < 12 * 60) score += 5;
      else if (preferenciaHorario === 'tarde' && startMin >= 13 * 60) score += 5;

      // +2 cercania a hora deseada (<=60min de distancia)
      if (horaDeseada !== null && Math.abs(startMin - horaDeseada) <= 60) score += 2;

      // Balanceo de carga: penalizar trabajadora con mas bloques en el dia
      // Esto evita sobrecargar a una sola trabajadora
      const cargaDia = (bloquesDia[trabajadora] || []).length;
      score -= cargaDia * 2;

      // Hora fin para display (tiempo total de la clienta en el salon)
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
// La misma trabajadora lo atiende durante el tiempo de espera del quimico.

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

    // Buscar el primer hueco libre DENTRO de la ventana de proceso
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
          score: 20,  // Maxima prioridad: reutilizar ventana de proceso del mismo dia
          es_fecha_alternativa: false,
          en_proceso: true
        });
        break; // Primer hueco libre encontrado
      }
    }
  }
}

// ============================================================================
// PASO 6b: AGREGAR SERVICIO CON VALIDACION DE DISPONIBILIDAD
// ============================================================================
// Cuando se agrega un servicio a un turno existente, verificar que la duracion
// combinada cabe en el horario. Dos estrategias:
//   A) simple/media/compleja: bloque continuo fusionado
//   B) muy_compleja: 3 fases a las 9:00, existente en ventana de proceso

if (input.agregar_a_turno_existente && turnoIdExistente) {
  // Limpiar candidatos del Paso 5 (eran para servicio nuevo solo, sin contexto de turno existente)
  candidatos.length = 0;

  const trabajadoraActual = turnoTrabajadoraExistente || 'Leraysi';
  const duracionExistente = turnoDuracionExistente || 60;
  const turnoFechaExistente = input.turno_fecha
    ? (input.turno_fecha.includes('T') ? input.turno_fecha.split('T')[0] : input.turno_fecha.split(' ')[0])
    : fechaSolicitada;
  const horaOriginalMin = turnoHoraExistente ? horaToMinutos(turnoHoraExistente) : (horaDeseada || JORNADA_INICIO);

  // Funcion auxiliar: filtrar bloques excluyendo el turno actual
  function bloquesSinTurnoActual(bloquesArr) {
    return bloquesArr.filter(b => b.turno_id == null || String(b.turno_id) !== String(turnoIdExistente));
  }

  // Buscar en el dia del turno existente primero, luego alternativas
  const diasBusquedaAgregar = [];
  const diaExistente = diasDisponibles.find(d => d.fecha === turnoFechaExistente);
  // Incluir el dia del turno incluso si no esta en diasDisponibles (puede ser hoy+1)
  if (diaExistente) {
    diasBusquedaAgregar.push(diaExistente);
  } else if (turnoFechaExistente) {
    const fechaObj = new Date(turnoFechaExistente + 'T12:00:00');
    if (fechaObj.getDay() !== 0) { // No domingo
      diasBusquedaAgregar.push({
        fecha: turnoFechaExistente,
        nombre_dia: diasNombre[fechaObj.getDay()],
        fechaObj
      });
    }
  }
  // Agregar dias alternativos
  for (const dia of diasDisponibles) {
    if (dia.fecha !== turnoFechaExistente) {
      diasBusquedaAgregar.push(dia);
    }
    if (diasBusquedaAgregar.length >= 14) break;
  }

  if (esMuyCompleja) {
    // ── ESTRATEGIA B: muy_compleja a las 9:00 + existente en ventana proceso ──
    // El servicio muy_compleja SIEMPRE empieza a las 9:00 (unico slot donde cabe)
    // El servicio existente se reubica en la ventana de proceso (12:00-17:00)

    const ventanaInicio = JORNADA_INICIO + FASES_MUY_COMPLEJA.activo_inicio; // 720 = 12:00
    const ventanaFin = ventanaInicio + FASES_MUY_COMPLEJA.proceso; // 1020 = 17:00

    // Verificar que el servicio existente cabe en la ventana de proceso
    if (duracionExistente <= FASES_MUY_COMPLEJA.proceso) {
      for (const dia of diasBusquedaAgregar) {
        if (candidatos.length >= 6) break;
        inicializarDia(dia.fecha);
        const bloquesDia = bloquesPorDiaTrabajadora[dia.fecha];
        const esMismoDia = dia.fecha === turnoFechaExistente;

        // Probar trabajadora actual primero, luego la otra
        const trabajadorasOrdenadas = [trabajadoraActual, ...TRABAJADORAS.filter(t => t !== trabajadoraActual)];

        for (const trabajadora of trabajadorasOrdenadas) {
          // Bloques activos del muy_compleja: [9:00-12:00] y [17:00-19:00]
          const bloquesNuevoMC = [
            { start: JORNADA_INICIO, end: JORNADA_INICIO + FASES_MUY_COMPLEJA.activo_inicio },
            { start: JORNADA_INICIO + FASES_MUY_COMPLEJA.activo_inicio + FASES_MUY_COMPLEJA.proceso,
              end: JORNADA_INICIO + FASES_MUY_COMPLEJA.activo_inicio + FASES_MUY_COMPLEJA.proceso + FASES_MUY_COMPLEJA.activo_fin }
          ];

          // Obtener bloques de la trabajadora SIN el turno actual (se va a reorganizar)
          const bloquesExistentes = esMismoDia
            ? bloquesSinTurnoActual(bloquesDia[trabajadora] || [])
            : (bloquesDia[trabajadora] || []);

          // Verificar que los bloques activos del muy_compleja no solapan
          if (!sinConflictos(bloquesNuevoMC, bloquesExistentes)) continue;

          // Verificar que el servicio existente cabe en la ventana de proceso sin conflictos
          // Buscar primer hueco libre en la ventana [12:00-17:00]
          let horaServicioEnProceso = null;
          for (let s = ventanaInicio; s + duracionExistente <= ventanaFin; s += STEP) {
            const bloqueExist = [{ start: s, end: s + duracionExistente }];
            if (sinConflictos(bloqueExist, bloquesExistentes)) {
              horaServicioEnProceso = s;
              break;
            }
          }

          if (horaServicioEnProceso === null) continue; // No cabe en la ventana

          candidatos.push({
            trabajadora,
            fecha: dia.fecha,
            hora_inicio: minutosToHora(JORNADA_INICIO), // 09:00
            hora_fin: minutosToHora(JORNADA_FIN), // 19:00
            nombre_dia: dia.nombre_dia,
            duracion_min: FASES_MUY_COMPLEJA.activo_inicio + FASES_MUY_COMPLEJA.proceso + FASES_MUY_COMPLEJA.activo_fin,
            score: (esMismoDia ? 18 : 0) + (trabajadora === trabajadoraActual ? 5 : 0),
            es_fecha_alternativa: !esMismoDia,
            en_proceso: false,
            // Metadata agregar servicio
            es_agregar_servicio: true,
            hora_original: turnoHoraExistente || minutosToHora(horaOriginalMin),
            servicio_reubicado: true,
            servicio_en_proceso: true,
            hora_servicio_existente: minutosToHora(horaServicioEnProceso)
          });
        }
      }
    }
  } else if (turnoComplejidadExistente === 'muy_compleja') {
    // ── ESTRATEGIA C: existente muy_compleja, nuevo servicio en ventana de proceso ──
    // El turno existente ocupa la jornada completa (3 fases).
    // El nuevo servicio (NO muy_compleja) se realiza durante la ventana de proceso [12:00-17:00].
    // CUALQUIER trabajadora disponible puede atender el nuevo servicio.

    const ventanaInicioC = JORNADA_INICIO + FASES_MUY_COMPLEJA.activo_inicio; // 720 = 12:00
    const ventanaFinC = ventanaInicioC + FASES_MUY_COMPLEJA.proceso; // 1020 = 17:00

    for (const dia of diasBusquedaAgregar) {
      if (candidatos.length >= 6) break;
      inicializarDia(dia.fecha);
      const bloquesDia = bloquesPorDiaTrabajadora[dia.fecha];
      const esMismoDia = dia.fecha === turnoFechaExistente;

      if (esMismoDia) {
        // Mismo dia: buscar espacio en la ventana de proceso con cualquier trabajadora
        for (const trabajadora of TRABAJADORAS) {
          const bloquesExistentes = bloquesDia[trabajadora] || [];

          for (let start = ventanaInicioC; start + duracionNueva <= ventanaFinC; start += STEP) {
            const nuevoBloque = [{ start, end: start + duracionNueva }];
            if (sinConflictos(nuevoBloque, bloquesExistentes)) {
              candidatos.push({
                trabajadora,
                fecha: dia.fecha,
                hora_inicio: minutosToHora(JORNADA_INICIO), // 09:00
                hora_fin: minutosToHora(JORNADA_FIN), // 19:00
                nombre_dia: dia.nombre_dia,
                duracion_min: 600, // Jornada completa se mantiene
                score: 20 + (trabajadora === trabajadoraActual ? 5 : 0),
                es_fecha_alternativa: false,
                en_proceso: true,
                es_agregar_servicio: true,
                hora_original: turnoHoraExistente || minutosToHora(horaOriginalMin),
                servicio_reubicado: false,
                servicio_en_proceso: true,
                hora_servicio_existente: minutosToHora(start)
              });
              break; // Primer hueco libre para esta trabajadora
            }
          }
        }
      } else {
        // Otro dia: verificar que muy_compleja cabe a las 09:00, luego buscar espacio
        // para el nuevo servicio en la ventana con cualquier trabajadora
        const trabajadorasOrdenadas = [trabajadoraActual, ...TRABAJADORAS.filter(t => t !== trabajadoraActual)];

        for (const trabajadoraMC of trabajadorasOrdenadas) {
          const bloquesMC = [
            { start: JORNADA_INICIO, end: JORNADA_INICIO + FASES_MUY_COMPLEJA.activo_inicio },
            { start: JORNADA_INICIO + FASES_MUY_COMPLEJA.activo_inicio + FASES_MUY_COMPLEJA.proceso,
              end: JORNADA_FIN }
          ];

          if (!sinConflictos(bloquesMC, bloquesDia[trabajadoraMC] || [])) continue;

          // Buscar espacio para nuevo servicio con cualquier trabajadora
          for (const trabajadora of TRABAJADORAS) {
            const bloquesT = bloquesDia[trabajadora] || [];
            for (let s = ventanaInicioC; s + duracionNueva <= ventanaFinC; s += STEP) {
              if (sinConflictos([{ start: s, end: s + duracionNueva }], bloquesT)) {
                candidatos.push({
                  trabajadora,
                  fecha: dia.fecha,
                  hora_inicio: minutosToHora(JORNADA_INICIO),
                  hora_fin: minutosToHora(JORNADA_FIN),
                  nombre_dia: dia.nombre_dia,
                  duracion_min: 600,
                  score: (trabajadoraMC === trabajadoraActual ? 5 : 0),
                  es_fecha_alternativa: true,
                  en_proceso: true,
                  es_agregar_servicio: true,
                  hora_original: turnoHoraExistente || minutosToHora(horaOriginalMin),
                  servicio_reubicado: false,
                  servicio_en_proceso: true,
                  hora_servicio_existente: minutosToHora(s)
                });
                break;
              }
            }
            if (candidatos.some(c => c.fecha === dia.fecha)) break;
          }
          if (candidatos.some(c => c.fecha === dia.fecha)) break;
        }
      }
    }
  } else {
    // ── ESTRATEGIA A: bloque continuo combinado ──
    // Fusionar servicios en un bloque sin tiempos muertos
    const duracionCombinada = duracionExistente + duracionNueva;

    for (const dia of diasBusquedaAgregar) {
      if (candidatos.length >= 12) break;
      inicializarDia(dia.fecha);
      const bloquesDia = bloquesPorDiaTrabajadora[dia.fecha];
      const esMismoDia = dia.fecha === turnoFechaExistente;

      for (let startMin = JORNADA_INICIO; startMin + duracionCombinada <= JORNADA_FIN; startMin += STEP) {
        const bloqueCombinado = [{ start: startMin, end: startMin + duracionCombinada }];

        // Verificar dentro de jornada
        if (!dentroDeJornada(bloqueCombinado)) continue;

        // Probar trabajadora actual primero, luego la otra
        const trabajadorasOrdenadas = [trabajadoraActual, ...TRABAJADORAS.filter(t => t !== trabajadoraActual)];

        for (const trabajadora of trabajadorasOrdenadas) {
          // Bloques de la trabajadora SIN el turno actual (se va a reorganizar)
          const bloquesExistentes = esMismoDia
            ? bloquesSinTurnoActual(bloquesDia[trabajadora] || [])
            : (bloquesDia[trabajadora] || []);

          if (!sinConflictos(bloqueCombinado, bloquesExistentes)) continue;

          // Calcular score
          let score = 0;
          if (esMismoDia) score += 8;
          if (startMin === horaOriginalMin) score += 20; // Mismo horario original = maximo
          else if (esMismoDia && Math.abs(startMin - horaOriginalMin) <= 60) score += 5;
          if (trabajadora === trabajadoraActual) score += 3;
          if (trabajadora === 'Leraysi') score += 1;

          const servicioReubicado = startMin !== horaOriginalMin;

          candidatos.push({
            trabajadora,
            fecha: dia.fecha,
            hora_inicio: minutosToHora(startMin),
            hora_fin: minutosToHora(startMin + duracionCombinada),
            nombre_dia: dia.nombre_dia,
            duracion_min: duracionCombinada,
            score,
            es_fecha_alternativa: !esMismoDia,
            en_proceso: false,
            // Metadata agregar servicio
            es_agregar_servicio: true,
            hora_original: turnoHoraExistente || minutosToHora(horaOriginalMin),
            servicio_reubicado: servicioReubicado,
            servicio_en_proceso: false
          });
        }
      }
    }
  }
}

// ============================================================================
// PASO 7: DEDUPLICAR Y SELECCIONAR TOP 3
// ============================================================================
// No repetir misma fecha+hora (quedarse con el de mayor score)
const vistos = new Map();
const candidatosUnicos = [];
for (const c of candidatos) {
  const key = `${c.fecha}-${c.hora_inicio}`;
  if (!vistos.has(key)) {
    vistos.set(key, candidatosUnicos.length);
    candidatosUnicos.push(c);
  } else {
    const idx = vistos.get(key);
    if (c.score > candidatosUnicos[idx].score) {
      candidatosUnicos[idx] = c;
    }
  }
}

// Ordenar por score descendente
candidatosUnicos.sort((a, b) => b.score - a.score);

// Seleccionar 3 opciones significativamente distintas
// Misma dia+trabajadora: minimo 60min de separacion
const elegidos = [];
for (const c of candidatosUnicos) {
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
    // Metadata agregar servicio (solo presente cuando aplica)
    ...(s.es_agregar_servicio ? {
      es_agregar_servicio: true,
      hora_original: s.hora_original,
      servicio_reubicado: s.servicio_reubicado,
      servicio_en_proceso: s.servicio_en_proceso,
      hora_servicio_existente: s.hora_servicio_existente
    } : {})
  };
});

// ============================================================================
// PASO 8: DETERMINAR DISPONIBILIDAD
// ============================================================================
const disponible = opciones.length > 0;
let motivoNoDisponible = null;

if (!disponible) {
  motivoNoDisponible = `No hay disponibilidad para ${input.servicio_detalle || 'el servicio solicitado'} en los proximos dias. Ambas trabajadoras tienen la agenda completa.`;
}

// ============================================================================
// PASO 9: RESUMEN PARA BUILDAGENTPROMPT
// ============================================================================
const resumen = opciones.length > 0
  ? opciones.map(o => `Opcion ${o.opcion}: ${o.fecha_humana} ${o.hora_inicio}-${o.hora_fin} (Trabajadora ${o.trabajadora})`).join('\n')
  : 'Sin disponibilidad en los proximos dias';

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

    // Alternativas (dias sin slot en fecha deseada)
    alternativas: opciones.filter(o => o.es_fecha_alternativa).map(o => ({
      fecha: o.fecha,
      nombre_dia: o.nombre_dia
    })),

    // Turno existente (para reprogramacion/agregar servicio)
    turno_servicio_existente: turnoServicioExistente,
    turno_id_existente: turnoIdExistente,
    turno_precio_existente: turnoPrecioExistente,
    turno_duracion_existente: turnoDuracionExistente,
    turno_complejidad_existente: turnoComplejidadExistente,
    turno_sena_pagada: turnoSenaPagada,
    turno_trabajadora_existente: turnoTrabajadoraExistente,
    turno_hora_original: turnoHoraExistente,

    // Accion explicita
    accion: input.accion || null,

    // Metadata
    turnos_existentes: turnos.length
  }
}];
