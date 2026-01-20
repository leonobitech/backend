// ============================================================================
// BUILD AGENT PROMPT - Construye el User Message para Agente Calendario
// ============================================================================
// INPUT: Datos combinados de ParseInput + AnalizarDisponibilidad
// OUTPUT: userMessage para el AI Agent del calendario
// ============================================================================

const data = $input.first().json;

// Formatear hora deseada
const horaDeseada = data.hora_deseada || 'Sin preferencia';

const userMessage = `## SOLICITUD DE TURNO

### Datos de la Clienta
- Nombre: ${data.nombre_clienta || 'No proporcionado'}
- Teléfono: ${data.telefono || 'No proporcionado'}
- Email: ${data.email || 'No proporcionado'}
- Clienta ID: ${data.clienta_id || 'N/A'}

### Servicio Solicitado
- Servicio: ${data.servicio_detalle || JSON.stringify(data.servicio)}
- Categoría: ${data.categoria_servicio || 'No clasificado'}
- Duración estimada: ${data.duracion_estimada || 60} minutos
- Precio acordado: $${data.precio || 0}

### Fecha y Hora
- Fecha deseada: ${data.fecha_deseada || 'No especificada'}
- Hora preferida: ${horaDeseada}

### Análisis de Cabello
- Largo: ${data.largo_cabello || 'medio'}
- Complejidad: ${data.complejidad || 'media'}

### Disponibilidad de la Semana
${data.resumen_disponibilidad || 'No disponible'}

### Configuración de Capacidad
- Máx servicios pesados/día: ${data.capacidad_config?.max_pesados || 2}
- Máx muy pesados/día: ${data.capacidad_config?.max_muy_pesados || 1}
- Máx turnos totales/día: ${data.capacidad_config?.max_turnos_dia || 6}

---

TAREA: Crear el turno directamente.

La fecha solicitada es ${data.fecha_deseada}. Revisá el resumen de disponibilidad arriba.

- Si ${data.fecha_deseada} está DISPONIBLE → llamar leraysi_crear_turno con hora ${data.hora_deseada || '09:00'}
- Si ${data.fecha_deseada} NO está disponible → responder JSON con alternativas (NO llamar ninguna tool)`;

return [{
  json: {
    ...data,
    userMessage
  }
}];
