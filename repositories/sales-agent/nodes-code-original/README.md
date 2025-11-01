# Nodes Code Original - Backup

Este directorio contiene **backups del código original** de los nodos n8n del Sales Agent workflow **ANTES de realizar cualquier modificación**.

## Propósito

- Preservar el código original funcionando antes de implementar mejoras
- Permitir comparación antes/después de cambios
- Facilitar rollback si una mejora causa problemas
- Documentar el estado baseline del sistema

## Convenciones de Nombres

Los archivos siguen la convención:
```
{node-number}-{node-name-kebab-case}.js
```

Ejemplos:
- `38-chat-history-filter.js` - Node #38: Chat History Filter
- `42-chat-history-processor.js` - Node #42: Chat History Processor (LLM Analyst)
- `48-flags-analyzer.js` - Node #48: FlagsAnalyzer
- `50-master-ai-agent-main.js` - Node #50: Master AI Agent
- `50-System-Prompt.md` - System prompt completo del Master Agent (2522 líneas)
- `51-output-main.js` - Node #51: Output Main

## Estructura de Archivos

Cada archivo `.js` contiene:

```javascript
// ============================================================================
// NODE: {Node Name} (Node #{number})
// ============================================================================
// Description: {Brief description}
// Input: {Input description}
// Output: {Output description}
//
// Status: ORIGINAL - Backup antes de modificaciones
// Date: {YYYY-MM-DD}
// ============================================================================

// ... código original del nodo ...
```

## Nodos Críticos para Backup

Según el AGENT-TESTING-LOG.md, estos son los nodos que requieren modificaciones:

### Alta Prioridad (Modificaciones Críticas)
- [ ] `50-master-ai-agent-main.js` - MEJORA #3: RAG Usage Mandate (83% fallas)
- [ ] `48-flags-analyzer.js` - MEJORA #10: Purpose Classification Fix (50% fallas)
- [ ] `51-output-main.js` - ✅ Bug #2 ya arreglado (validado)
- [ ] `42-chat-history-processor.js` - LLM Analyst (extracción business_type)

### Media Prioridad (Mejoras de Calidad)
- [ ] `50-master-ai-agent-main.js` - MEJORA #1: Tono Comercial
- [ ] `50-master-ai-agent-main.js` - MEJORA #9: Personalización por Industria
- [ ] `48-flags-analyzer.js` - MEJORA #7: Soft Close Detection
- [ ] `48-flags-analyzer.js` - MEJORA #6: Guardrail price_question_too_early

### Baja Prioridad (Optimizaciones)
- [ ] `50-master-ai-agent-main.js` - MEJORA #5: Manejo de Precio
- [ ] `50-master-ai-agent-main.js` - MEJORA #8: Transparencia Email Gate
- [ ] `42-chat-history-processor.js` - MEJORA #4: Calificación Temprana

## Proceso de Modificación

Cuando vayas a modificar un nodo:

1. **Crear backup PRIMERO**:
   ```bash
   # Copiar código del nodo n8n al archivo correspondiente
   # Agregar header con metadata
   # Commit del backup
   ```

2. **Implementar cambios**:
   - Modificar el nodo en n8n
   - Probar exhaustivamente
   - Documentar cambios

3. **Comparación**:
   ```bash
   # Comparar original vs modificado
   diff nodes-code-original/XX-node-name.js nodes-code-modified/XX-node-name.js
   ```

4. **Rollback si es necesario**:
   - Restaurar código desde este directorio
   - Pegar en n8n
   - Re-activar workflow

## Referencias

- **Testing Log**: `docs/AGENT-TESTING-LOG.md`
- **Mejoras Documentadas**: Ver sección "Mejoras únicas propuestas" en AGENT-TESTING-LOG.md
- **Workflow Docs**: `docs/` - Documentación de cada nodo

---

**Última actualización**: 2025-11-01
**Mantenido por**: Felix Figueroa + Claude Code
