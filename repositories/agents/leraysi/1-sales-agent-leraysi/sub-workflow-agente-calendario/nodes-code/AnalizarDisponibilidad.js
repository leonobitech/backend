// ============================================================================
// ANALIZAR DISPONIBILIDAD - Agente Calendario Leraysi
// ============================================================================
// INPUT: ParseInput (datos del turno) + GetTurnosSemana (turnos existentes)
// OUTPUT: Disponibilidad calculada + alternativas pre-calculadas si no hay cupo
// ============================================================================

// Obtener turnos (puede ser array vacío)
const turnosRaw = $('GetTurnosSemana').all();
const turnos = turnosRaw.length > 0 ? turnosRaw.map(item => item.json) : [];

const input = $('ParseInput').first().json;

// Configuración de capacidad máxima por día según complejidad
// Horario: 9am-7pm (10 horas disponibles)
const CAPACIDAD = {
  max_muy_compleja: 2,  // Servicios muy complejos (Alisados, Balayage, Mechas, Tintura completa)
  max_compleja: 3,      // Servicios complejos (Tintura raíz, Manicura semipermanente)
  max_media: 4,         // Servicios medios (Corte, Manicura simple, Pedicura, Depilación cera/láser piernas)
  max_simple: 5,        // Servicios simples (Depilación axilas, bikini)
  max_turnos_dia: 8     // Máximo absoluto de turnos por día
};

// Agrupar turnos por fecha
const turnosPorDia = {};

turnos.forEach(turno => {
  const fecha = turno.fecha?.split('T')[0];
  if (!fecha) return;

  if (!turnosPorDia[fecha]) {
    turnosPorDia[fecha] = {
      fecha,
      turnos: [],
      count_total: 0,
      count_simple: 0,
      count_media: 0,
      count_compleja: 0,
      count_muy_compleja: 0,
      duracion_total: 0
    };
  }

  turnosPorDia[fecha].turnos.push(turno);
  turnosPorDia[fecha].count_total++;
  turnosPorDia[fecha].duracion_total += turno.duracion_min || 0;

  // Usar complejidad_maxima del turno (campo unificado con ParseInput)
  const complejidad = turno.complejidad_maxima?.value || turno.complejidad_maxima || 'media';
  if (complejidad === 'simple') turnosPorDia[fecha].count_simple++;
  else if (complejidad === 'media') turnosPorDia[fecha].count_media++;
  else if (complejidad === 'compleja') turnosPorDia[fecha].count_compleja++;
  else if (complejidad === 'muy_compleja') turnosPorDia[fecha].count_muy_compleja++;
});

// Generar próximos 30 días con disponibilidad (cobertura de 1 mes)
const dias = [];
const hoy = new Date();

for (let i = 0; i < 30; i++) {
  const fecha = new Date(hoy);
  fecha.setDate(hoy.getDate() + i);
  const fechaStr = fecha.toISOString().split('T')[0];

  const diaSemana = fecha.getDay();
  const nombreDia = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][diaSemana];

  // Domingo cerrado
  if (diaSemana === 0) {
    dias.push({
      fecha: fechaStr,
      nombre_dia: nombreDia,
      abierto: false,
      disponible: false,
      motivo: 'Cerrado'
    });
    continue;
  }

  const datosDia = turnosPorDia[fechaStr] || {
    count_total: 0,
    count_simple: 0,
    count_media: 0,
    count_compleja: 0,
    count_muy_compleja: 0,
    duracion_total: 0
  };

  // Verificar capacidad por nivel de complejidad
  const puedeRecibirMuyCompleja = datosDia.count_muy_compleja < CAPACIDAD.max_muy_compleja;
  const puedeRecibirCompleja = datosDia.count_compleja < CAPACIDAD.max_compleja;
  const puedeRecibirMedia = datosDia.count_media < CAPACIDAD.max_media;
  const puedeRecibirSimple = datosDia.count_simple < CAPACIDAD.max_simple;
  const puedeRecibirMas = datosDia.count_total < CAPACIDAD.max_turnos_dia;

  // 600 minutos = 10 horas (9am-7pm)
  const cargaPorcentaje = Math.round((datosDia.duracion_total / 600) * 100);

  dias.push({
    fecha: fechaStr,
    nombre_dia: nombreDia,
    abierto: true,
    turnos_agendados: datosDia.count_total,
    // Conteo por complejidad
    muy_complejos_agendados: datosDia.count_muy_compleja,
    complejos_agendados: datosDia.count_compleja,
    medios_agendados: datosDia.count_media,
    simples_agendados: datosDia.count_simple,
    duracion_total_min: datosDia.duracion_total,
    carga_porcentaje: cargaPorcentaje,
    // Capacidad disponible por complejidad
    puede_recibir_muy_compleja: puedeRecibirMuyCompleja,
    puede_recibir_compleja: puedeRecibirCompleja,
    puede_recibir_media: puedeRecibirMedia,
    puede_recibir_simple: puedeRecibirSimple,
    puede_recibir_turno: puedeRecibirMas,
    disponible: puedeRecibirMas
  });
}

// ============================================================================
// VERIFICAR DISPONIBILIDAD DEL DÍA SOLICITADO Y GENERAR ALTERNATIVAS
// ============================================================================
// Extraer solo la fecha (sin hora) para comparación - soporta ISO con T o solo fecha
const fechaSolicitadaRaw = input.fecha_deseada || '';
const fechaSolicitada = fechaSolicitadaRaw.includes('T')
  ? fechaSolicitadaRaw.split('T')[0]
  : fechaSolicitadaRaw.split(' ')[0];
const diaSolicitado = dias.find(d => d.fecha === fechaSolicitada);

// Determinar si la fecha está disponible
const fechaDisponible = diaSolicitado?.abierto && diaSolicitado?.disponible;

// Pre-calcular alternativas si el día NO está disponible
let alternativas = [];
let motivoNoDisponible = null;

if (!fechaDisponible) {
  // Determinar el motivo
  if (!diaSolicitado) {
    motivoNoDisponible = 'Fecha fuera de rango (solo se pueden agendar turnos en los próximos 30 días)';
  } else if (!diaSolicitado.abierto) {
    motivoNoDisponible = 'Cerrado (Domingo)';
  } else if (!diaSolicitado.disponible) {
    motivoNoDisponible = `Agenda llena (${diaSolicitado.turnos_agendados} turnos, ${diaSolicitado.carga_porcentaje}% de capacidad)`;
  }

  // Buscar los próximos 3 días disponibles como alternativas
  alternativas = dias
    .filter(d => d.abierto && d.disponible)
    .slice(0, 3)
    .map(d => ({
      fecha: d.fecha,
      nombre_dia: d.nombre_dia,
      turnos_agendados: d.turnos_agendados,
      carga_porcentaje: d.carga_porcentaje
    }));
}

// Resumen para el agente
const resumen = dias
  .filter(d => d.abierto)
  .map(d => {
    let estado = '';
    if (!d.disponible) estado = '❌ Lleno';
    else if (d.carga_porcentaje >= 70) estado = '⚠️ Casi lleno';
    else if (d.carga_porcentaje >= 40) estado = '📅 Moderado';
    else estado = '✅ Disponible';

    return `${d.nombre_dia} ${d.fecha}: ${estado} (${d.turnos_agendados} turnos, ${d.carga_porcentaje}% carga)`;
  })
  .join('\n');

// ============================================================================
// EXTRAER SERVICIO DEL TURNO EXISTENTE (para detectar reprogramación vs turno adicional)
// ============================================================================
// Si la usuaria tiene turno_agendado=true, buscamos su turno en los turnos de la semana
// para extraer el servicio y poder compararlo con el servicio solicitado
//
// IMPORTANTE: En Baserow tabla TurnosLeraysi, el linked field es "clienta_id"
// que apunta a la tabla LeadsLeraysi. El formato es:
// - Array de objetos: [{id: 116, value: "428"}] donde id es el ROW_ID del lead
//
// Debemos comparar contra lead_row_id (el row_id de Baserow), NO contra lead_id (Odoo ID)
let turnoServicioExistente = null;
let turnoIdExistente = null;
let turnoPrecioExistente = null;

if (input.turno_agendado && input.lead_row_id) {
  // Buscar turno de esta usuaria por lead_row_id (ID de fila en Baserow)
  const turnoUsuaria = turnos.find(t => {
    // El campo en Baserow se llama "clienta_id" (linked field a LeadsLeraysi)
    let turnoClientaRowId = null;
    if (Array.isArray(t.clienta_id) && t.clienta_id.length > 0) {
      // Formato: [{id: 116, value: "428"}] - id es el row_id del lead
      turnoClientaRowId = t.clienta_id[0]?.id;
    } else if (t.clienta_id && typeof t.clienta_id === 'object') {
      // Formato objeto directo
      turnoClientaRowId = t.clienta_id.id || t.clienta_id.value;
    } else {
      // Formato: valor directo
      turnoClientaRowId = t.clienta_id;
    }

    return turnoClientaRowId && String(turnoClientaRowId) === String(input.lead_row_id);
  });

  if (turnoUsuaria) {
    // Extraer el servicio - en Baserow viene como [{id: X, value: "Corte mujer", color: "..."}]
    let servicioValue = null;
    if (Array.isArray(turnoUsuaria.servicio) && turnoUsuaria.servicio.length > 0) {
      servicioValue = turnoUsuaria.servicio[0]?.value;
    } else if (turnoUsuaria.servicio?.value) {
      servicioValue = turnoUsuaria.servicio.value;
    } else {
      servicioValue = turnoUsuaria.servicio;
    }
    turnoServicioExistente = servicioValue || null;

    // Extraer odoo_turno_id (ID del turno en Odoo)
    turnoIdExistente = turnoUsuaria.odoo_turno_id || null;

    // Extraer precio del turno existente (para calcular seña diferencial)
    turnoPrecioExistente = turnoUsuaria.precio ? Number(turnoUsuaria.precio) : null;
  }
}

return [{
  json: {
    ...input,
    disponibilidad: dias,
    resumen_disponibilidad: resumen,
    capacidad_config: CAPACIDAD,
    turnos_existentes: turnos.length,
    // Nuevos campos para el agente
    // Mantener fecha original completa (con hora si viene) para BuildAgentPrompt
    fecha_solicitada: fechaSolicitadaRaw,
    fecha_disponible: fechaDisponible,
    motivo_no_disponible: motivoNoDisponible,
    alternativas: alternativas,
    // Servicio del turno existente (para comparar con servicio solicitado)
    turno_servicio_existente: turnoServicioExistente,
    // ID del turno en Odoo (para agregar servicio al turno existente)
    turno_id_existente: turnoIdExistente,
    // Precio del turno existente (para calcular seña diferencial)
    turno_precio_existente: turnoPrecioExistente
  }
}];
