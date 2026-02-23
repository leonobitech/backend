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

// Complejidad del turno solicitado (para filtrar capacidad por día)
const complejidadSolicitada = input.complejidad_maxima || 'media';

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
  turnosPorDia[fecha].duracion_total += Number(turno.duracion_min) || 0;

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

  // Verificar capacidad para la complejidad del turno solicitado
  let puedeRecibirEstaComplejidad = true;
  if (complejidadSolicitada === 'muy_compleja') puedeRecibirEstaComplejidad = puedeRecibirMuyCompleja;
  else if (complejidadSolicitada === 'compleja') puedeRecibirEstaComplejidad = puedeRecibirCompleja;
  else if (complejidadSolicitada === 'media') puedeRecibirEstaComplejidad = puedeRecibirMedia;
  else if (complejidadSolicitada === 'simple') puedeRecibirEstaComplejidad = puedeRecibirSimple;

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
    disponible: puedeRecibirMas && puedeRecibirEstaComplejidad
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
    if (!diaSolicitado.puede_recibir_turno) {
      motivoNoDisponible = `Agenda llena (${diaSolicitado.turnos_agendados} turnos, ${diaSolicitado.carga_porcentaje}% de capacidad)`;
    } else {
      motivoNoDisponible = `Sin capacidad para servicio ${complejidadSolicitada.replace('_', ' ')} (${diaSolicitado.turnos_agendados} turnos agendados)`;
    }
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
let turnoDuracionExistente = null;
let turnoComplejidadExistente = null;
let turnoSenaPagada = null;

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
    // Extraer el servicio existente completo
    // PRIORIDAD: servicio_detalle (string concatenado "Manicura simple + Pedicura")
    // porque el multi-select 'servicio' solo da valores individuales y antes
    // solo tomábamos el primero, perdiendo servicios intermedios con 3+ servicios
    let servicioValue = null;
    if (turnoUsuaria.servicio_detalle) {
      // Mejor fuente: string concatenado con todos los servicios
      servicioValue = turnoUsuaria.servicio_detalle;
    } else if (Array.isArray(turnoUsuaria.servicio) && turnoUsuaria.servicio.length > 0) {
      // Fallback: unir todos los valores del multi-select
      servicioValue = turnoUsuaria.servicio.map(s => s?.value || s).join(' + ');
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

    // Extraer duración del turno existente (para sumar al agregar servicio)
    turnoDuracionExistente = turnoUsuaria.duracion_min ? Number(turnoUsuaria.duracion_min) : null;

    // Extraer complejidad del turno existente (para MAX al agregar servicio)
    turnoComplejidadExistente = turnoUsuaria.complejidad_maxima?.value || turnoUsuaria.complejidad_maxima || null;

    // Extraer seña pagada del turno existente (para calcular diferencial)
    turnoSenaPagada = turnoUsuaria.sena_monto ? Number(turnoUsuaria.sena_monto) : null;
  }
}

// ============================================================================
// CÁLCULO DE SLOTS POR HORA (solo para modo consultar_disponibilidad)
// ============================================================================
const modo = input.modo || null;
let slotsRecomendados = [];
let esJornadaCompleta = false;

if (modo === 'consultar_disponibilidad') {
  const APERTURA = 9 * 60;   // 09:00 = 540 min
  const CIERRE = 19 * 60;    // 19:00 = 1140 min
  const STEP = 30;            // granularidad 30 min
  const duracionServicio = input.duracion_estimada || 60;
  const horaPreferida = input.hora_deseada ? (() => {
    const parts = input.hora_deseada.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1] || '0');
  })() : null;
  const preferencia = input.preferencia_horario || null;

  const ahora = new Date();
  // Usar hora Argentina (UTC-3)
  const ahoraArgentina = new Date(ahora.getTime() - 3 * 60 * 60 * 1000);
  const ahoraMin = ahoraArgentina.getUTCHours() * 60 + ahoraArgentina.getUTCMinutes();
  const hoyStr = ahoraArgentina.toISOString().split('T')[0];

  function horaToMinutos(horaStr) {
    if (!horaStr) return 9 * 60;
    const parts = horaStr.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1] || '0');
  }

  function minutosToHora(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Filtrar dias disponibles y priorizarlos
  // REGLA DE NEGOCIO: No se aceptan turnos para el mismo día. Mínimo = mañana.
  let diasBusqueda = dias.filter(d => d.abierto && d.disponible && d.fecha !== hoyStr);

  // Si se pidió una fecha específica, priorizarla
  if (fechaSolicitada) {
    const diaReq = diasBusqueda.find(d => d.fecha === fechaSolicitada);
    const diasOtros = diasBusqueda.filter(d => d.fecha !== fechaSolicitada);
    diasBusqueda = diaReq ? [diaReq, ...diasOtros] : diasOtros;
  }

  // Solo buscar en los próximos 14 días para consulta
  diasBusqueda = diasBusqueda.slice(0, 14);

  const candidatos = [];

  // ================================================================
  // JORNADA COMPLETA: servicios combinados que exceden el día laboral
  // ================================================================
  // Cuando la duración total supera las 10h (600 min), el loop normal
  // de slots no genera resultados. En la práctica, la estilista SÍ puede
  // hacer estos servicios en un día (paralleliza: trabaja uñas mientras
  // la química actúa en el cabello). Ofrecemos "jornada completa" en
  // días con baja carga.
  const JORNADA_MIN = CIERRE - APERTURA; // 600 min
  esJornadaCompleta = duracionServicio > JORNADA_MIN;

  if (esJornadaCompleta) {
    // Buscar días con carga < 20% (máx ~120 min de turnos existentes)
    const MAX_CARGA_JORNADA = 20;

    const diasJornada = diasBusqueda
      .filter(d => (d.carga_porcentaje || 0) < MAX_CARGA_JORNADA && d.puede_recibir_muy_compleja !== false)
      .sort((a, b) => {
        // Priorizar día solicitado
        if (a.fecha === fechaSolicitada) return -1;
        if (b.fecha === fechaSolicitada) return 1;
        // Luego por menor carga
        return (a.carga_porcentaje || 0) - (b.carga_porcentaje || 0);
      })
      .slice(0, 3);

    for (const dia of diasJornada) {
      candidatos.push({
        fecha: dia.fecha,
        hora: minutosToHora(APERTURA),
        hora_fin: minutosToHora(CIERRE),
        nombre_dia: dia.nombre_dia,
        score: dia.fecha === fechaSolicitada ? 18 : 10,
        motivo: 'Jornada completa disponible',
        carga_dia: dia.carga_porcentaje || 0,
        jornada_completa: true
      });
    }

    console.log(`[AnalizarDisponibilidad] 🗓️ JORNADA COMPLETA: ${duracionServicio}min > ${JORNADA_MIN}min, ${diasJornada.length} días encontrados`);
  } else {
    // ================================================================
    // MODO NORMAL: generar slots por hora
    // ================================================================
    for (const dia of diasBusqueda) {
      if (candidatos.length >= 9) break; // suficientes candidatos

      // Turnos del día (solo para scoring de adyacencia, NO bloquean slots)
      // Leraysi atiende en paralelo: la CAPACIDAD por complejidad + carga diaria controlan el límite
      const turnosDelDia = (turnosPorDia[dia.fecha]?.turnos || []).map(t => {
        const horaStr = t.hora || '09:00';
        const startMin = horaToMinutos(horaStr);
        return { start: startMin };
      });

      // Generar slots disponibles
      for (let start = APERTURA; start + duracionServicio <= CIERRE; start += STEP) {
        const end = start + duracionServicio;

        // Hoy ya está excluido en diasBusqueda (regla de negocio: mínimo mañana)

        // Verificar que la carga total del día no exceda la jornada
        const cargaConNuevoTurno = ((dia.duracion_total_min + duracionServicio) / 600) * 100;
        if (cargaConNuevoTurno > 100) continue; // No exceder jornada total (600 min)

        // Puntuar el slot
        let score = 0;
        let motivo = 'Horario disponible';

        // +10 si coincide con hora_deseada exacta
        if (horaPreferida !== null && start === horaPreferida) {
          score += 10;
          motivo = 'Horario solicitado disponible';
        }

        // +8 si es el día solicitado
        if (dia.fecha === fechaSolicitada) {
          score += 8;
        }

        // +5 si encaja en preferencia de horario
        if (preferencia === 'manana' && start >= APERTURA && start < 12 * 60) {
          score += 5;
          if (motivo === 'Horario disponible') motivo = 'Disponible por la mañana';
        } else if (preferencia === 'tarde' && start >= 13 * 60 && start < CIERRE) {
          score += 5;
          if (motivo === 'Horario disponible') motivo = 'Disponible por la tarde';
        }

        // +3 si está cerca de otro turno (pack calendar)
        if (turnosDelDia.length > 0) {
          const minGap = Math.min(...turnosDelDia.map(o =>
            Math.abs(start - o.start)
          ));
          if (minGap <= 60) score += 3;
        }

        // +2 si el día tiene baja carga
        const loadPct = dia.carga_porcentaje || 0;
        if (loadPct < 30) score += 2;

        candidatos.push({
          fecha: dia.fecha,
          hora: minutosToHora(start),
          hora_fin: minutosToHora(end),
          nombre_dia: dia.nombre_dia,
          score,
          motivo,
          carga_dia: loadPct
        });
      }
    }
  }

  // Ordenar por score descendente y tomar top 3
  candidatos.sort((a, b) => b.score - a.score);

  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

  slotsRecomendados = candidatos.slice(0, 3).map((s, i) => {
    const fechaObj = new Date(s.fecha + 'T12:00:00');
    const slot = {
      opcion: i + 1,
      fecha: s.fecha,
      hora: s.hora,
      hora_fin: s.hora_fin,
      nombre_dia: s.nombre_dia,
      fecha_humana: `${s.nombre_dia.toLowerCase()} ${fechaObj.getDate()} de ${meses[fechaObj.getMonth()]}`,
      motivo: s.motivo
    };
    if (s.jornada_completa) slot.jornada_completa = true;
    return slot;
  });
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
    turno_precio_existente: turnoPrecioExistente,
    // Duración del turno existente en minutos (para sumar al agregar servicio)
    turno_duracion_existente: turnoDuracionExistente,
    // Complejidad del turno existente (para MAX al agregar servicio)
    turno_complejidad_existente: turnoComplejidadExistente,
    // Seña ya pagada del turno existente (para calcular diferencial)
    turno_sena_pagada: turnoSenaPagada,
    // Slots recomendados (solo en modo consultar_disponibilidad)
    slots_recomendados: slotsRecomendados,
    // Jornada completa: servicios combinados exceden el día laboral
    jornada_completa: esJornadaCompleta,
    // Acción explícita (no depender solo de ...input spread)
    accion: input.accion || null
  }
}];
