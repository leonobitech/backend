// ============================================================================
// PARSE INPUT - Agente Calendario Leraysi
// ============================================================================
// Procesa y valida el input del Master AI Agent
// COMBINA: llm_output (del LLM) + state (de Input Main)
// Calcula duración basada en servicio + complejidad del cabello
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
  agregar_a_turno_existente: state.agregar_a_turno_existente || llmOutput.agregar_a_turno_existente || false,
  turno_id_existente: state.odoo_turno_id || state.turno_id_existente || llmOutput.turno_id_existente || null,
  turno_precio_existente: state.turno_precio_existente || llmOutput.turno_precio_existente || 0,

  // Complejidad del trabajo (aplica a TODOS los servicios)
  complejidad: state.image_analysis?.complexity || 'media',
  // Largo del cabello (solo para servicios de cabello, null para manicure/pedicure/etc)
  largo_cabello_raw: state.image_analysis?.length || 'medio'
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
  'Corte mujer': { base_min: 45, complejidad: 'media', requiere_largo: true },

  // === ALISADO (2 servicios) ===
  'Alisado brasileño': { base_min: 150, complejidad: 'muy_compleja', requiere_largo: true },
  'Alisado keratina': { base_min: 150, complejidad: 'muy_compleja', requiere_largo: true },

  // === COLOR (4 servicios) ===
  'Mechas completas': { base_min: 120, complejidad: 'muy_compleja', requiere_largo: true },
  'Tintura raíz': { base_min: 60, complejidad: 'compleja', requiere_largo: true },
  'Tintura completa': { base_min: 90, complejidad: 'muy_compleja', requiere_largo: true },
  'Balayage': { base_min: 180, complejidad: 'muy_compleja', requiere_largo: true },

  // === UÑAS (3 servicios) ===
  'Manicura simple': { base_min: 30, complejidad: 'media', requiere_largo: false },
  'Manicura semipermanente': { base_min: 45, complejidad: 'compleja', requiere_largo: false },
  'Pedicura': { base_min: 45, complejidad: 'media', requiere_largo: false },

  // === DEPILACIÓN (5 servicios) ===
  'Depilación cera piernas': { base_min: 45, complejidad: 'media', requiere_largo: false },
  'Depilación cera axilas': { base_min: 15, complejidad: 'simple', requiere_largo: false },
  'Depilación cera bikini': { base_min: 20, complejidad: 'simple', requiere_largo: false },
  'Depilación láser piernas': { base_min: 60, complejidad: 'media', requiere_largo: false },
  'Depilación láser axilas': { base_min: 30, complejidad: 'simple', requiere_largo: false }
};

// Multiplicadores según largo del cabello
const MULTIPLICADOR_LARGO = {
  'corto': 0.8,
  'medio': 1.0,
  'largo': 1.3,
  'muy_largo': 1.5
};

// Multiplicadores según complejidad del trabajo
const MULTIPLICADOR_COMPLEJIDAD = {
  'simple': 0.9,
  'media': 1.0,
  'compleja': 1.2,
  'muy_compleja': 1.4
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
const camposRequeridos = ['clienta_id', 'nombre_clienta', 'telefono', 'servicio', 'fecha_deseada', 'precio'];
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
const complejidad = image_analysis?.complexity || input.complejidad || 'media';

// Largo de cabello: solo aplica si algún servicio lo requiere
// Para Manicure, Pedicure, Maquillaje → largo_cabello = null
const serviciosArray = Array.isArray(input.servicio) ? input.servicio : [input.servicio];
const requiereLargo = algunServicioRequiereLargo(serviciosArray);
const largo_cabello = requiereLargo
  ? (image_analysis?.length || input.largo_cabello_raw || 'medio')
  : null;

// ============================================================================
// CÁLCULO DE DURACIÓN ESTIMADA
// ============================================================================
function calcularDuracion(servicios, largo, complejidad) {
  let duracionTotal = 0;

  for (const srv of servicios) {
    const config = SERVICIOS_CONFIG[srv];
    if (config) {
      duracionTotal += config.base_min;
    } else {
      // Servicio no mapeado, usar 60 min por defecto
      duracionTotal += 60;
    }
  }

  // Aplicar multiplicadores
  // largo puede ser null para servicios sin cabello (manicure, pedicure, etc.)
  const multLargo = largo ? (MULTIPLICADOR_LARGO[largo] || 1.0) : 1.0;
  const multComplejidad = MULTIPLICADOR_COMPLEJIDAD[complejidad] || 1.0;

  duracionTotal = Math.round(duracionTotal * multLargo * multComplejidad);

  // Redondear a múltiplos de 15 minutos
  return Math.ceil(duracionTotal / 15) * 15;
}

// Determinar la complejidad más alta entre los servicios solicitados
// Orden de prioridad: muy_compleja > compleja > media > simple
function obtenerComplejidadMaxima(servicios) {
  const complejidades = servicios.map(srv => {
    const config = SERVICIOS_CONFIG[srv];
    return config?.complejidad || 'media';
  });

  if (complejidades.includes('muy_compleja')) return 'muy_compleja';
  if (complejidades.includes('compleja')) return 'compleja';
  if (complejidades.includes('media')) return 'media';
  return 'simple';
}

const duracion_estimada = calcularDuracion(servicio, largo_cabello, complejidad);
const complejidad_maxima = obtenerComplejidadMaxima(servicio);
const servicio_detalle = servicio.join(' + ');

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
    precio,
    duracion_estimada,
    complejidad_maxima,

    // Análisis de imagen
    image_analysis,
    largo_cabello,
    complejidad,

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

    // Metadata
    received_at: new Date().toISOString()
  }
}];
