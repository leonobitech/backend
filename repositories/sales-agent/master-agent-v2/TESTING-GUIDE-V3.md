# Testing Guide - System Prompt V3 Optimized

## Recent Fixes Applied

### Fix 1: Stop Asking for business_target
**Problem**: Agent was asking "¿Es una PYME?" repeatedly, even after user confirmed.

**Solution**: Changed business_target to automatic inference only. Agent now:
- ✅ Infers from business_type immediately
- ✅ NEVER asks for confirmation
- ✅ Uses inference rules:
  - "pizzería", "restaurante", "cafetería", "tienda", "consultorio" → `"PYME"`
  - "empresa", "corporación" → `"Enterprise"`
  - Default → `"PYME"`

### Fix 2: Enforce Tool Calling
**Problem**: Agent said "te envío la propuesta" but `has_tool_calls: false` (hallucination).

**Solution**: Added multiple enforcement layers:
- ✅ Explicit mutual exclusion rule
- ✅ Anti-hallucination warnings with trigger words
- ✅ Complete JSON structure example showing tool_calls placement
- ✅ Emphasized: "The tool_calls array goes INSIDE message"

---

## Testing Checklist

### Test 1: business_target Inference (CRITICAL)

**Conversation Flow**:
```
User: "Hola"
Agent: "¡Hola! ¿Cómo te va? ¿Cómo te llamás?"

User: "Me llamo Felix"
Agent: [should ask about business_type, not confirm name repeatedly]

User: "Tengo un restaurante"
Agent: [should talk about services for restaurants, NOT ask "¿Es una PYME?"]
```

**Expected Output JSON**:
```json
{
  "state": {
    "business_type": "restaurante",
    "business_target": "PYME"  // ← Inferred automatically
  }
}
```

**Verification**:
- ✅ business_target is set to "PYME"
- ✅ Agent NEVER asks "¿Es una PYME?" or similar
- ✅ No confirmation request in agent's message

---

### Test 2: Tool Calling Enforcement (CRITICAL)

**Pre-conditions** (set up state first):
```json
{
  "state": {
    "business_type": "restaurante",
    "business_name": "La Toscana",
    "business_target": "PYME",
    "email": "felix@test.com",
    "stage": "qualify",
    "counters": { "prices_asked": 1, "services_seen": 1, "deep_interest": 1 },
    "interests": ["CRM", "Odoo"]
  }
}
```

**Conversation Flow**:
```
User: "Envíame la propuesta"
```

**Expected Output JSON**:
```json
{
  "message": {
    "text": "Perfecto, te envío la propuesta ahora a felix@test.com",
    "rag_used": false,
    "sources": [],
    "tool_calls": [  // ← MUST BE PRESENT
      {
        "id": "call_odoo_email_001",
        "type": "function",
        "function": {
          "name": "odoo_send_email",
          "arguments": "{\"opportunityId\":33,\"subject\":\"Propuesta Comercial - CRM/Odoo\",\"templateType\":\"proposal\",\"templateData\":{\"customerName\":\"Felix Figueroa\",\"productName\":\"CRM/Odoo\",\"price\":\"USD $1200\"},\"emailTo\":\"felix@test.com\"}"
        }
      }
    ]
  },
  "state": {
    "proposal_offer_done": true,  // ← Updated
    "last_proposal_offer_ts": "2025-11-07T15:00:00.000Z"  // ← Updated
  }
}
```

**Verification**:
- ✅ `message.tool_calls` array exists and has one element
- ✅ `tool_calls[0].function.name === "odoo_send_email"`
- ✅ `tool_calls[0].function.arguments` is valid JSON string
- ✅ `state.proposal_offer_done === true`
- ✅ Output Main shows `has_tool_calls: true`
- ✅ MCP connector is actually called (check n8n execution log)

---

### Test 3: Complete Flow (End-to-End)

**Conversation**:
```
1. User: "Hola"
   Agent: [asks for name]

2. User: "Me llamo Felix"
   Agent: [asks business_type naturally]

3. User: "Tengo una pizzería"
   Agent: [talks about services for pizzerías, should have business_target="PYME" inferred]

4. User: "Me interesa un CRM"
   Agent: [stage="match", services_seen=1, interests=["CRM", "Odoo"]]

5. User: "¿Cuánto cuesta?"
   Agent: [uses RAG, prices_asked=1, stage="price"]

6. User: "Envíame la propuesta"
   Agent: [should ask for business_name if null]

7. User: "Se llama Napoli"
   Agent: [should ask for email if null]

8. User: "felix@test.com"
   Agent: [MUST call odoo_send_email tool]
```

**Key Verifications**:
- ✅ Step 3: business_target="PYME" without asking
- ✅ Step 5: RAG used, sources present
- ✅ Step 8: tool_calls present in message

---

## Common Issues to Watch For

### Issue 1: JSON Parsing Errors
**Symptom**: Output Main shows "Unexpected token"

**Check**:
1. Does Master Agent output start with ` ```json`?
2. Does it end with ` ``` `?
3. Is there markdown formatting in the output?

**Expected**: Output should start with `{` and end with `}`

---

### Issue 2: Baserow Datetime Errors
**Symptom**: "field_7067: Datetime has wrong format"

**Check**:
```json
// ❌ WRONG (epoch number):
"addressee_ask_ts": 1699355740865

// ✅ CORRECT (ISO 8601 string):
"addressee_ask_ts": "2025-11-07T14:15:40.865Z"
```

**Expected**: All timestamp fields must be ISO 8601 strings

---

### Issue 3: Missing Cooldowns
**Symptom**: Agent re-asks same question within 5 minutes

**Check**:
- Is `addressee_ask_ts` set after asking for name?
- Is `email_ask_ts` set after asking for email?
- Are they ISO 8601 strings?

**Expected**: Cooldowns set to `meta.now_ts` when question asked

---

### Issue 4: No Tool Calls
**Symptom**: Agent says "te envío" but `has_tool_calls: false`

**Check**:
1. Are ALL required fields present? (business_type, business_name, business_target, email)
2. Is `email !== ""`? (empty string check)
3. Is `stage ∈ ["qualify", "proposal_ready"]`?
4. Is `counters.prices_asked >= 1`?

**Expected**: If all conditions met, `message.tool_calls` array must exist

---

## Output Main Logs to Monitor

### Successful Tool Call
```
[OutputMain] ✅ Master output parsed successfully
[OutputMain] has_tool_calls: true
[OutputMain] tool_calls[0]: odoo_send_email
[OutputMain] Formatted for MCP connector: { tool: "odoo_send_email", arguments: {...} }
```

### Missing Tool Call (BUG)
```
[OutputMain] ✅ Master output parsed successfully
[OutputMain] has_tool_calls: false  // ← RED FLAG if agent said "te envío"
[OutputMain] Message: "Te envío la propuesta ahora..."  // ← HALLUCINATION!
```

---

## Success Criteria

### Test 1 (business_target inference): PASS if
- ✅ business_target set automatically
- ✅ No confirmation question asked

### Test 2 (tool calling): PASS if
- ✅ tool_calls array present in message
- ✅ odoo_send_email called successfully
- ✅ Email received in inbox

### Test 3 (end-to-end): PASS if
- ✅ All 8 steps complete without errors
- ✅ JSON parsing works
- ✅ Baserow persistence works
- ✅ Email sent successfully

---

## Next Steps After Testing

### If Tests PASS:
1. Push commit to origin/main
2. Monitor real conversations for 24 hours
3. Check for any edge cases

### If Tests FAIL:
1. Document exact failure point
2. Check Master Agent output JSON structure
3. Review relevant section in SYSTEM-PROMPT-V3-OPTIMIZED.md
4. Apply fix and re-test

---

## Related Files

- System Prompt: `master-agent-v2/SYSTEM-PROMPT-V3-OPTIMIZED.md`
- Output Formatter: `master-agent-v2/OUTPUT-MAIN-v2.js`
- Testing Results: `master-agent-v2/TESTING-RESULTS.md` (previous test run)
- Commit: d8f2234 (fix: stop asking for business_target and enforce tool calling)
