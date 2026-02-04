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
  nombre_clienta: llmOutput.nombre_clienta || state.full_name || state.nick_name,
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

  // Estado de turno existente (para reprogramación)
  turno_agendado: state.turno_agendado || false,
  turno_fecha: state.turno_fecha || null,

  // Complejidad y largo del cabello (del image_analysis)
  complejidad: state.image_analysis?.complexity || 'media',
  largo_cabello: state.image_analysis?.length || 'medio'
};

// ============================================================================
// CONFIGURACIÓN DE SERVICIOS Y DURACIONES
// ============================================================================
const SERVICIOS_CONFIG = {
  // Servicios livianos (45-60 min base)
  'Peinados': { base_min: 45, categoria: 'liviano' },
  'Manicure': { base_min: 30, categoria: 'liviano' },
  'Pedicure': { base_min: 45, categoria: 'liviano' },
  'Maquillaje': { base_min: 45, categoria: 'liviano' },
  'Corte de cabello': { base_min: 45, categoria: 'liviano' },

  // Servicios pesados (90-120 min base)
  'Alisado': { base_min: 120, categoria: 'pesado' },
  'Keratina': { base_min: 120, categoria: 'pesado' },
  'Botox capilar': { base_min: 90, categoria: 'pesado' },
  'Alisado con keratina': { base_min: 150, categoria: 'muy_pesado' },

  // Servicios de color (60-90 min base)
  'Tinte': { base_min: 90, categoria: 'pesado' },
  'Mechas': { base_min: 120, categoria: 'pesado' },
  'Balayage': { base_min: 150, categoria: 'muy_pesado' },
  'Decoloración': { base_min: 120, categoria: 'pesado' }
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
const largo_cabello = image_analysis?.length || input.largo_cabello || 'medio';
const complejidad = image_analysis?.complexity || input.complejidad || 'media';

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
  const multLargo = MULTIPLICADOR_LARGO[largo] || 1.0;
  const multComplejidad = MULTIPLICADOR_COMPLEJIDAD[complejidad] || 1.0;

  duracionTotal = Math.round(duracionTotal * multLargo * multComplejidad);

  // Redondear a múltiplos de 15 minutos
  return Math.ceil(duracionTotal / 15) * 15;
}

// Determinar categoría más pesada del servicio
function obtenerCategoriaPesada(servicios) {
  const categorias = servicios.map(srv => {
    const config = SERVICIOS_CONFIG[srv];
    return config?.categoria || 'liviano';
  });

  if (categorias.includes('muy_pesado')) return 'muy_pesado';
  if (categorias.includes('pesado')) return 'pesado';
  return 'liviano';
}

const duracion_estimada = calcularDuracion(servicio, largo_cabello, complejidad);
const categoria_servicio = obtenerCategoriaPesada(servicio);
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
    categoria_servicio,

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

    // Metadata
    received_at: new Date().toISOString()
  }
}];
