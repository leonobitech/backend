// ============================================================================
// PARSE INPUT - Agente Calendario Leraysi
// ============================================================================
// Procesa y valida el input del Master AI Agent
// COMBINA: llm_output (del LLM) + state (de Input Main)
// Calcula duración y PRECIO basados en servicio + largo del cabello (determinístico)
// ============================================================================

const raw = $input.first().json;

// ============================================================================
// PASO 1: EXTRAER LLM_OUTPUT Y STATE
// ============================================================================
// El tool puede enviar los datos de dos formas:
// 1. Directo: { "llm_output": {...}, "state": {...} }
// 2. Wrapped: { "query": { "llm_output": {...}, "state": {...} } }
//
// Soportamos ambos formatos para compatibilidad

// Unwrap si viene dentro de "query"
const data = raw.query || raw;

// Extraer llm_output (lo que el LLM extrajo del mensaje del cliente)
const llmOutput = typeof data.llm_output === 'string'
  ? JSON.parse(data.llm_output)
  : (data.llm_output || {});

const state = typeof data.state === 'string' ? JSON.parse(data.state) : (data.state || {});

// ============================================================================
// PASO 2: COMBINAR LLM_OUTPUT + STATE
// ============================================================================
// llmOutput tiene prioridad (datos frescos del mensaje)
// State llena los campos que el LLM no puede extraer

const input = {
  // === MODO Y ACCIÓN ===
  // ParseInput solo pasa lo que la LLM envió (raw).
  // RouteDecision (post-analyzer) decide el modo y acción definitivos.
  modo: llmOutput.modo || null,
  preferencia_horario: llmOutput.preferencia_horario || null,
  accion: llmOutput.accion || null,

  // === Del LLM_OUTPUT (lo que el LLM extrajo del mensaje) ===
  nombre_clienta: llmOutput.full_name || llmOutput.nombre_clienta || state.full_name || state.nick_name,
  servicio: llmOutput.servicio || (state.servicio_interes ? [state.servicio_interes] : []),
  fecha_deseada: llmOutput.fecha_deseada || llmOutput.fecha,
  // Extraer hora de fecha_deseada si viene en formato ISO (ej: "2026-02-11T14:00:00")
  hora_deseada: llmOutput.hora_deseada || llmOutput.hora || (() => {
    const fecha = llmOutput.fecha_deseada || llmOutput.fecha;
    if (fecha && fecha.includes('T')) {
      const timePart = fecha.split('T')[1];
      if (timePart) {
        return timePart.substring(0, 5); // "14:00:00" -> "14:00"
      }
    }
    return null;
  })(),
  precio: llmOutput.precio || 0,
  email: llmOutput.email || state.email || null,

  // === Del STATE (datos que el LLM no puede ver en el userPrompt) ===
  telefono: state.phone,
  clienta_id: state.lead_id,
  lead_id: state.lead_id,  // Alias para uso en tools
  lead_row_id: state.row_id,
  conversation_id: state.conversation_id,
  image_analysis: state.image_analysis || null,

  // Estado de turno existente (para reprogramación o agregar servicio)
  turno_agendado: state.turno_agendado || false,
  turno_fecha: state.turno_fecha || null,

  // Para agregar servicio a turno existente
  // Derivar de: boolean explícito, accion del LLM, o modo del LLM
  agregar_a_turno_existente: state.agregar_a_turno_existente || llmOutput.agregar_a_turno_existente || llmOutput.accion === 'agregar_a_turno_existente' || llmOutput.modo === 'agregar_servicio' || false,
  // turno_id: priorizar state (numérico), validar que LLM envíe numérico
  turno_id_existente: state.odoo_turno_id || state.turno_id_existente || (() => {
    const llmId = llmOutput.turno_id_existente;
    // Solo aceptar si es numérico (evitar basura como "turno_andrea_figueroa")
    if (llmId && !isNaN(Number(llmId))) return llmId;
    return null;
  })(),
  turno_precio_existente: state.turno_precio_existente || llmOutput.turno_precio_existente || 0,

  // Largo del cabello (solo para servicios de cabello, null para manicure/pedicure/etc)
  largo_cabello_raw: state.image_analysis?.length || null
};

// ============================================================================
// CONFIGURACIÓN DE SERVICIOS Y DURACIONES
// ============================================================================
// Los 15 servicios oficiales de Baserow (tabla 850 - ServiciosLeraysi)
//
// complejidad: FIJA por servicio (determina capacidad diaria del salón)
//   - muy_compleja: máx 2/día
//   - compleja: máx 3/día
//   - media: máx 4/día
//   - simple: máx 5/día
//
// requiere_largo: true = servicio de cabello (largo afecta duración)
//                 false = servicio sin cabello (uñas, depilación)
//
const SERVICIOS_CONFIG = {
  // === CORTE (1 servicio) ===
  'Corte mujer': { base_min: 60, complejidad: 'media', requiere_largo: true, precio_base: 8000 },

  // === ALISADO (2 servicios) — muy_compleja con 3 fases ===
  'Alisado brasileño': { base_min: 600, complejidad: 'muy_compleja', requiere_largo: true, precio_base: 45000, activo_inicio: 180, proceso: 300, activo_fin: 120 },
  'Alisado keratina':  { base_min: 600, complejidad: 'muy_compleja', requiere_largo: true, precio_base: 55000, activo_inicio: 180, proceso: 300, activo_fin: 120 },

  // === COLOR (4 servicios) — muy_compleja con 3 fases (excepto Tintura raíz) ===
  'Mechas completas':  { base_min: 600, complejidad: 'muy_compleja', requiere_largo: true, precio_base: 35000, activo_inicio: 180, proceso: 300, activo_fin: 120 },
  'Tintura raíz': { base_min: 60, complejidad: 'compleja', requiere_largo: true, precio_base: 15000 },
  'Tintura completa':  { base_min: 600, complejidad: 'muy_compleja', requiere_largo: true, precio_base: 25000, activo_inicio: 180, proceso: 300, activo_fin: 120 },
  'Balayage':          { base_min: 600, complejidad: 'muy_compleja', requiere_largo: true, precio_base: 50000, activo_inicio: 180, proceso: 300, activo_fin: 120 },

  // === UÑAS (3 servicios) ===
  'Manicura simple': { base_min: 120, complejidad: 'media', requiere_largo: false, precio_base: 5000 },
  'Manicura semipermanente': { base_min: 180, complejidad: 'compleja', requiere_largo: false, precio_base: 8000 },
  'Pedicura': { base_min: 120, complejidad: 'media', requiere_largo: false, precio_base: 6000 },

  // === DEPILACIÓN (5 servicios) ===
  'Depilación cera piernas': { base_min: 120, complejidad: 'media', requiere_largo: false, precio_base: 10000 },
  'Depilación cera axilas': { base_min: 60, complejidad: 'simple', requiere_largo: false, precio_base: 4000 },
  'Depilación cera bikini': { base_min: 60, complejidad: 'simple', requiere_largo: false, precio_base: 6000 },
  'Depilación láser piernas': { base_min: 120, complejidad: 'media', requiere_largo: false, precio_base: 25000 },
  'Depilación láser axilas': { base_min: 60, complejidad: 'simple', requiere_largo: false, precio_base: 12000 }
};

// Duración extra (aditiva) según largo del cabello
// Solo aplica a servicios con requiere_largo: true
const DURACION_EXTRA_LARGO = {
  'corto': 0,
  'medio': 60,
  'largo': 120,
  'muy_largo': 120
};

// Mapeo largo_cabello → complejidad para servicios de cabello (máximo: compleja)
// muy_compleja es EXCLUSIVA de los 5 tratamientos químicos (siempre, sin importar largo)
const COMPLEJIDAD_POR_LARGO = {
  'corto': 'media',
  'medio': 'compleja',
  'largo': 'compleja',
  'muy_largo': 'compleja'
};

// Multiplicador de precio según largo del cabello
// Solo aplica a servicios con requiere_largo: true
// corto = precio base, medio = +10%, largo = +20%
const PRECIO_MULTIPLICADOR_LARGO = {
  'corto': 1.0,
  'medio': 1.1,
  'largo': 1.2,
  'muy_largo': 1.2
};

// ============================================================================
// HELPER: Verificar si algún servicio requiere largo de cabello
// ============================================================================
function algunServicioRequiereLargo(servicios) {
  return servicios.some(srv => {
    const config = SERVICIOS_CONFIG[srv];
    // Si el servicio no está en config, asumimos que requiere largo (por defecto)
    return config ? config.requiere_largo !== false : true;
  });
}

// ============================================================================
// VALIDACIÓN DE CAMPOS REQUERIDOS
// ============================================================================
// En modo consulta solo necesitamos servicio y fecha (aún no hay datos de clienta/precio)
const modoConsulta = input.modo === 'consultar_disponibilidad';
const camposRequeridos = modoConsulta
  ? ['servicio', 'fecha_deseada']
  : ['clienta_id', 'nombre_clienta', 'servicio', 'fecha_deseada'];
const camposFaltantes = camposRequeridos.filter(campo => !input[campo]);

if (camposFaltantes.length > 0) {
  throw new Error(`[ParseInput] Campos requeridos faltantes: ${camposFaltantes.join(', ')}`);
}

// ============================================================================
// EXTRACCIÓN DE DATOS
// ============================================================================

// Datos de la clienta
const clienta_id = input.clienta_id;
const nombre_clienta = input.nombre_clienta;
const telefono = input.telefono;
const email = input.email || null;

// Datos del turno
const servicio = Array.isArray(input.servicio) ? input.servicio : [input.servicio];
const fecha_deseada = input.fecha_deseada;
const hora_deseada = input.hora_deseada || null;
const precio = Number(input.precio) || 0;

// IDs de contexto
const lead_row_id = input.lead_row_id || input.row_id;
const conversation_id = input.conversation_id || null;

// Análisis de imagen (si existe)
const image_analysis = input.image_analysis || null;

// Largo de cabello: solo aplica si algún servicio lo requiere
// Para Manicure, Pedicure, Maquillaje → largo_cabello = null
// Sin imagen → null (fallback a SERVICIOS_CONFIG defaults)
const serviciosArray = Array.isArray(input.servicio) ? input.servicio : [input.servicio];
const requiereLargo = algunServicioRequiereLargo(serviciosArray);
const largo_cabello = requiereLargo
  ? (image_analysis?.length || input.largo_cabello_raw || null)
  : null;

// ============================================================================
// CÁLCULO DE DURACIÓN ESTIMADA
// ============================================================================
function calcularDuracion(servicios, largo) {
  let duracionTotal = 0;

  for (const srv of servicios) {
    const config = SERVICIOS_CONFIG[srv];
    if (config) {
      let duracionServicio = config.base_min;
      // Solo agregar tiempo extra si el servicio requiere largo Y hay dato de largo
      // NO aplica a muy_compleja (base_min 600 ya es el total real: 3h+5h+2h)
      if (config.requiere_largo && largo && config.complejidad !== 'muy_compleja') {
        duracionServicio += (DURACION_EXTRA_LARGO[largo] || 0);
      }
      duracionTotal += duracionServicio;
    } else {
      // Servicio no mapeado, usar 60 min por defecto
      duracionTotal += 60;
    }
  }

  // Redondear a múltiplos de 15 minutos
  return Math.ceil(duracionTotal / 15) * 15;
}

// Determinar la complejidad más alta entre los servicios solicitados
// Factor 1: complejidad individual del servicio (cabello: via COMPLEJIDAD_POR_LARGO, otros: fija)
// Factor 2: cantidad de servicios (2 = mín compleja, 3+ = mín muy_compleja)
// Resultado: MAX(individual_más_alta, floor_por_cantidad)
function obtenerComplejidadMaxima(servicios, largo) {
  const COMP_ORDER = { simple: 1, media: 2, compleja: 3, muy_compleja: 4 };
  const ORDER_TO_COMP = { 1: 'simple', 2: 'media', 3: 'compleja', 4: 'muy_compleja' };

  // Paso 1: Max complejidad individual (lógica existente)
  const complejidades = servicios.map(srv => {
    const config = SERVICIOS_CONFIG[srv];
    if (!config) return 'media';
    if (config.requiere_largo && largo && config.complejidad !== 'muy_compleja') {
      return COMPLEJIDAD_POR_LARGO[largo] || config.complejidad;
    }
    return config.complejidad;
  });

  let maxIndividual = 'simple';
  if (complejidades.includes('muy_compleja')) maxIndividual = 'muy_compleja';
  else if (complejidades.includes('compleja')) maxIndividual = 'compleja';
  else if (complejidades.includes('media')) maxIndividual = 'media';

  // Paso 2: Floor por cantidad de servicios
  // 1 servicio = sin boost, 2 = mín compleja, 3+ = mín muy_compleja
  let floorPorCantidad = 'simple';
  if (servicios.length >= 3) floorPorCantidad = 'muy_compleja';
  else if (servicios.length >= 2) floorPorCantidad = 'compleja';

  // Paso 3: Retornar el mayor entre individual y floor
  const finalOrder = Math.max(COMP_ORDER[maxIndividual] || 2, COMP_ORDER[floorPorCantidad] || 1);
  return ORDER_TO_COMP[finalOrder] || maxIndividual;
}

// ============================================================================
// CÁLCULO DE PRECIO DETERMINÍSTICO
// ============================================================================
// Mismo patrón que duración: precio_base + ajuste por largo
// Servicios de cabello: precio_base * multiplicador_largo
// Servicios sin cabello: precio_base fijo
// Si algún servicio no está en config → fallback al precio del LLM
function calcularPrecio(servicios, largo) {
  let precioTotal = 0;
  for (const srv of servicios) {
    const config = SERVICIOS_CONFIG[srv];
    if (config && config.precio_base != null) {
      let precioServicio = config.precio_base;
      if (config.requiere_largo && largo) {
        precioServicio = Math.round(config.precio_base * (PRECIO_MULTIPLICADOR_LARGO[largo] || 1.0));
      }
      precioTotal += precioServicio;
    } else {
      console.log(`[ParseInput] ⚠️ Servicio "${srv}" no encontrado en config, precio no calculable`);
      return null;
    }
  }
  return precioTotal;
}

// ============================================================================
// DEFENSA: Filtrar servicio existente cuando agregar_a_turno_existente
// ============================================================================
// Si el LLM envía accidentalmente el servicio existente junto con el nuevo
// (ej: ["Manicura semipermanente", "Pedicura"] cuando debería ser solo ["Pedicura"]),
// la duración se duplica en AnalizarDisponibilidad (duracionExistente + duracionNueva
// donde duracionNueva ya incluye el existente).
// Solución: filtrar servicios que coincidan con servicio_interes del state.
if (input.agregar_a_turno_existente && servicio.length > 1) {
  const servicioExistente = (state.servicio_interes || '').toLowerCase().trim();
  if (servicioExistente) {
    const serviciosFiltrados = servicio.filter(
      s => s.toLowerCase().trim() !== servicioExistente
    );
    // Solo filtrar si quedan servicios después (nunca dejar vacío)
    if (serviciosFiltrados.length > 0 && serviciosFiltrados.length < servicio.length) {
      console.log(`[ParseInput] 🛡️ DEFENSA agregar_servicio: filtrado "${servicioExistente}" del array. ` +
                  `Original: [${servicio.join(', ')}] → Filtrado: [${serviciosFiltrados.join(', ')}]`);
      servicio.length = 0;
      serviciosFiltrados.forEach(s => servicio.push(s));
    }
  }
}

const duracion_estimada = calcularDuracion(servicio, largo_cabello);
const complejidad_maxima = obtenerComplejidadMaxima(servicio, largo_cabello);
const servicio_detalle = servicio.join(' + ');

// Precio determinístico: override sobre el precio del LLM
const precio_calculado = calcularPrecio(servicio, largo_cabello);
const precioFinal = precio_calculado !== null ? precio_calculado : precio;
if (precio_calculado !== null && precio > 0 && precio_calculado !== precio) {
  console.log(`[ParseInput] 🔧 Precio corregido: LLM=$${precio}, determinístico=$${precio_calculado}`);
}

// ============================================================================
// GATE DETERMINÍSTICO: datos obligatorios para turno nuevo
// ============================================================================
// Si es turno nuevo y falta email o full_name → bloquear flujo.
// Se fuerza modo "consultar_disponibilidad" para que SwitchModo rutee a
// FormatearRespuestaOpciones, que detecta gate_bloqueado y devuelve
// "datos_faltantes" al Master Agent.
// Esto es código determinístico — imposible de bypassear por el LLM.

const esTurnoNuevo = !input.turno_agendado && !input.agregar_a_turno_existente;
const tieneFullName = !!(llmOutput.full_name || state.full_name);
const tieneEmail = !!email;
const tieneTelefono = !!telefono;
const esTelegram = (state.channel || '').toLowerCase() === 'telegram';

let gate_bloqueado = false;
const gate_datos_faltantes = [];

if (esTurnoNuevo) {
  if (!tieneFullName) gate_datos_faltantes.push('nombre completo');
  if (!tieneEmail) gate_datos_faltantes.push('email');
  // Telegram no provee teléfono automáticamente (WhatsApp sí)
  if (esTelegram && !tieneTelefono) gate_datos_faltantes.push('teléfono');
  gate_bloqueado = gate_datos_faltantes.length > 0;
}

if (gate_bloqueado) {
  console.log(`[ParseInput] 🛡️ GATE BLOQUEADO: faltan ${gate_datos_faltantes.join(', ')}`);
}

// RouteDecision (post-analyzer) maneja gate_bloqueado y fuerza modo/accion.
// ParseInput ya no necesita forzar modo — solo pasa datos.

// ============================================================================
// EXTRAER FASES DEL SERVICIO MUY_COMPLEJA (si aplica)
// ============================================================================
// Si algún servicio tiene estructura de 3 fases (activo_inicio + proceso + activo_fin),
// extraer para que AnalizarDisponibilidad pueda modelar los bloques activos
let activo_inicio = null;
let proceso = null;
let activo_fin = null;

const servicioConFases = servicio.find(srv => {
  const config = SERVICIOS_CONFIG[srv];
  return config && config.activo_inicio != null;
});
if (servicioConFases) {
  const config = SERVICIOS_CONFIG[servicioConFases];
  activo_inicio = config.activo_inicio;
  proceso = config.proceso;
  activo_fin = config.activo_fin;
}

// ============================================================================
// OUTPUT
// ============================================================================
return [{
  json: {
    // Datos de la clienta
    clienta_id,
    nombre_clienta,
    telefono,
    email,

    // Datos del turno
    servicio,
    servicio_detalle,
    fecha_deseada,
    hora_deseada,
    precio: precioFinal,
    duracion_estimada,
    complejidad_maxima,

    // Fases para servicios muy_compleja (3 fases: activo_inicio, proceso, activo_fin)
    activo_inicio,
    proceso,
    activo_fin,

    // Análisis de imagen
    image_analysis,
    largo_cabello,

    // IDs de contexto
    lead_id: input.lead_id,
    lead_row_id,
    conversation_id,

    // Estado de turno (para reprogramación)
    turno_agendado: input.turno_agendado,
    turno_fecha: input.turno_fecha,

    // Para agregar servicio a turno existente
    agregar_a_turno_existente: input.agregar_a_turno_existente,
    turno_id_existente: input.turno_id_existente,
    turno_precio_existente: input.turno_precio_existente,

    // Modo de operación (raw de LLM, RouteDecision decide el definitivo)
    modo: input.modo,
    preferencia_horario: input.preferencia_horario,
    accion: input.accion,

    // GATE determinístico
    gate_bloqueado,
    gate_datos_faltantes,

    // Metadata
    received_at: new Date().toISOString()
  }
}];
