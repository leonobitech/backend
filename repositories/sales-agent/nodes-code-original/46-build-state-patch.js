// ============================================================================
// NODE: BuildStatePatch (Node #46)
// ============================================================================
// Description: Construye patch diferencial entre state base y state LLM
// Input: { profile, state (LLM), state_base, agent_brief, options, history }
// Output: { ok, merge_key, agent_brief, profile, state, patch, json_patch, ... }
//
// Features:
// - Monotonicidad: counters nunca retroceden
// - Anti-regresión: stage nunca retrocede
// - LatestISO: cooldowns y timestamps toman el más reciente
// - Intereses canónicos: unión con baseline (no se pierden)
// - Inmutables protegidos: lead_id, chatwoot_id, phone_number, country, tz, channel
// - Genera patch (dot-paths) y json_patch (RFC6902)
// - Métricas de cambio: stage_changed, counters_changed, etc.
// - Evidence tracking: para auditoría
//
// Status: ORIGINAL - Backup antes de modificaciones
// Date: 2025-11-01
// ============================================================================

/**
 * BuildStatePatch v2.1 — Leonobitech
 * - Monotonicidad (counters), anti-regresión (stage), latestISO (cooldowns/ts),
 *   intereses canónicos (unión con baseline), flags no regresivos.
 * - Genera patch (dot-paths), json_patch (RFC6902) y métricas de cambio.
 */

const IMMUTABLES = ["lead_id","chatwoot_id","phone_number","country","tz","channel"];

// Campos considerados para patch (dot-paths)
const PATCH_FIELDS = [
  "stage",
  "business_name",
  "email",
  "counters.services_seen",
  "counters.prices_asked",
  "counters.deep_interest",
  "cooldowns.addressee_ask_ts",
  "cooldowns.email_ask_ts",
  "interests",
  "last_proposal_offer_ts",
  "proposal_offer_done",
  // opcional: solo si existe en el shape base/llm lo vamos a tocar
  "proposal_intent_confirmed"
];

// ---------- helpers ----------
function deepClone(x){ return JSON.parse(JSON.stringify(x)); }
function toIntNZ(v,d=0){ const n=Number(v); return Number.isFinite(n)?Math.max(0,Math.trunc(n)):d; }
function isISO(ts){ if (typeof ts!=="string") return false; const d=new Date(ts); return !isNaN(d.getTime()) && ts.includes("T") && ts.endsWith("Z"); }
function toISOorNull(ts){ if (ts==null) return null; if (isISO(ts)) return ts; const d=new Date(ts); return isNaN(d.getTime())?null:d.toISOString(); }
function latestISO(a,b){
  const A = a? new Date(a).getTime(): -Infinity;
  const B = b? new Date(b).getTime(): -Infinity;
  if (!isFinite(A) && !isFinite(B)) return null;
  return (B>=A ? b : a) || null;
}
function uniq(a){ return Array.from(new Set(a)); }

function getPath(o, path){
  const parts = path.split(".");
  let cur = o;
  for (const p of parts){
    if (cur==null || typeof cur!=="object") return undefined;
    cur = cur[p];
  }
  return cur;
}
function setPath(o, path, val){
  const parts = path.split(".");
  let cur = o;
  for (let i=0;i<parts.length-1;i++){
    const p = parts[i];
    if (typeof cur[p] !== "object" || cur[p] === null) cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length-1]] = val;
}
function dotToJsonPointer(path){
  return "/"+path.split(".").map(encodeURIComponent).join("/");
}
function arraysEqual(a,b){
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i=0;i<a.length;i++){ if (a[i] !== b[i]) return false; }
  return true;
}
function sortedStrings(arr){
  return uniq((arr||[]).filter(v => typeof v==="string").map(v => v.trim())).sort((a,b)=>a.localeCompare(b));
}
function stageIndex(stage, allowed){ const i = allowed.indexOf(stage); return i<0? 0 : i; }

// --- history helpers (para evidencia) ---
const NAME_ASK_PATTERNS = [
  /tu nombre/i,
  /c[oó]mo te llamas/i,
  /me podr[íi]as (decir|compartir) tu nombre/i,
  /nombre para comenzar/i
];
function lastAssistantAskName(history){
  let hit = null;
  for (const m of Array.isArray(history)?history:[]){
    if (m?.role === "assistant" && NAME_ASK_PATTERNS.some(rx => rx.test(m?.text || ""))){
      hit = { ts: m.ts || null, text: m.text || null };
    }
  }
  return hit;
}

// ---------- entrada ----------
const i = $json || {};
const profile      = deepClone(i.profile || {});
const stateLLM0    = deepClone(i.state   || {});
const stateBase0   = deepClone(i.state_base || null);
const agent_brief  = deepClone(i.agent_brief || {});
const options      = deepClone(i.options || {});
const history      = deepClone(i.history || i.smart_input?.history || i.base?.history || []);
const merge_key    = i.merge_key ?? stateLLM0.lead_id ?? profile.lead_id ?? null;

if (!stateLLM0) return [{ json: { ok:false, error:"BuildStatePatch: falta state (LLM)", input:i } }];
if (!stateBase0) {
  return [{
    json: {
      ok: true,
      merge_key,
      agent_brief,
      profile,
      state: stateLLM0,
      patch: {}, json_patch: [], has_patch: false, changed_keys: [],
      stage_changed:false, email_changed:false, business_name_changed:false,
      counters_changed:false, cooldowns_changed:false, interests_changed:false, proposal_changed:false,
      has_funnel_changes: false,
      patch_meta: { before:null, after:null, changed_keys:[], source:"llm", warning:"state_base no presente; patch vacío por seguridad.", evidence: null }
    }
  }];
}

// Clonar para mutar con normalizaciones
const stateLLM  = deepClone(stateLLM0);
const stateBase = deepClone(stateBase0);

// Proteger inmutables con baseline
for (const k of IMMUTABLES){ if (k in stateBase) stateLLM[k] = stateBase[k]; }

// ---------- Normalizaciones ----------
const allowedStages = Array.isArray(options.stage_allowed) && options.stage_allowed.length
  ? options.stage_allowed
  : ["explore","match","price","qualify","proposal_ready"];

const allowedInterests = Array.isArray(options.interests_allowed) && options.interests_allowed.length
  ? options.interests_allowed
  : ["Odoo","WhatsApp","CRM"];

if (!stateLLM.counters) stateLLM.counters = { services_seen:0, prices_asked:0, deep_interest:0 };
if (!stateBase.counters) stateBase.counters = { services_seen:0, prices_asked:0, deep_interest:0 };

// Counters monótonos (no regresan)
stateLLM.counters.services_seen = Math.max(toIntNZ(stateBase.counters.services_seen,0), toIntNZ(stateLLM.counters.services_seen,0));
stateLLM.counters.prices_asked  = Math.max(toIntNZ(stateBase.counters.prices_asked,0),  toIntNZ(stateLLM.counters.prices_asked,0));
stateLLM.counters.deep_interest = Math.max(toIntNZ(stateBase.counters.deep_interest,0), toIntNZ(stateLLM.counters.deep_interest,0));

if (!stateLLM.cooldowns) stateLLM.cooldowns = { email_ask_ts:null, addressee_ask_ts:null };
if (!stateBase.cooldowns) stateBase.cooldowns = { email_ask_ts:null, addressee_ask_ts:null };

// Cooldowns/timestamps → más reciente
stateLLM.cooldowns.email_ask_ts     = latestISO(toISOorNull(stateBase.cooldowns.email_ask_ts),     toISOorNull(stateLLM.cooldowns.email_ask_ts));
stateLLM.cooldowns.addressee_ask_ts = latestISO(toISOorNull(stateBase.cooldowns.addressee_ask_ts), toISOorNull(stateLLM.cooldowns.addressee_ask_ts));

stateLLM.last_proposal_offer_ts = latestISO(toISOorNull(stateBase.last_proposal_offer_ts), toISOorNull(stateLLM.last_proposal_offer_ts));

// Strings
if (typeof stateLLM.business_name === "string"){
  stateLLM.business_name = stateLLM.business_name.trim();
  if (stateLLM.business_name === "") stateLLM.business_name = stateBase.business_name ?? null;
}
if (typeof stateLLM.email === "string"){
  const e = stateLLM.email.trim().toLowerCase();
  stateLLM.email = e || (stateBase.email ?? null);
}

// Stage enum + anti-regresión
if (!stateLLM.stage) stateLLM.stage = stateBase.stage || "explore";
if (!allowedStages.includes(stateLLM.stage)) stateLLM.stage = allowedStages[0];
const idxBase = stageIndex(stateBase.stage || "explore", allowedStages);
const idxNew  = stageIndex(stateLLM.stage, allowedStages);
if (idxNew < idxBase) stateLLM.stage = stateBase.stage || stateLLM.stage; // nunca retrocede

// Interests: canónicos + unión con baseline para no perder nada
const baseInterests = sortedStrings(Array.isArray(stateBase.interests)? stateBase.interests: []);
let llmInterests    = sortedStrings(Array.isArray(stateLLM.interests)? stateLLM.interests: []);
// limitar a catálogo y unir con baseline
llmInterests = sortedStrings(uniq([...llmInterests, ...baseInterests]).filter(v => allowedInterests.includes(v)));
stateLLM.interests = llmInterests;

// Flags no regresivos
if (stateBase.proposal_offer_done === true) stateLLM.proposal_offer_done = true;
if (typeof stateBase.proposal_intent_confirmed === "boolean" || typeof stateLLM.proposal_intent_confirmed === "boolean"){
  stateLLM.proposal_intent_confirmed = Boolean(stateBase.proposal_intent_confirmed || stateLLM.proposal_intent_confirmed);
}

// ---------- construir patch ----------
const patch = {};
const json_patch = [];
const before = {};
const after  = {};

let stage_changed=false, email_changed=false, business_name_changed=false;
let counters_changed=false, cooldowns_changed=false, interests_changed=false, proposal_changed=false;

for (const path of PATCH_FIELDS){
  // si el path no existe en ninguno de los dos (p.ej. proposal_intent_confirmed ausente) saltar
  const existsInBase = getPath(stateBase, path) !== undefined;
  const existsInLLM  = getPath(stateLLM,  path) !== undefined;
  if (!existsInBase && !existsInLLM) continue;

  const bRaw = getPath(stateBase, path);
  const aRaw = getPath(stateLLM,  path);

  let b = bRaw;
  let a = aRaw;

  // Tipos
  if (path.startsWith("counters.")) { b = toIntNZ(b,0); a = toIntNZ(a,0); }
  if (path === "interests") {
    const bArr = sortedStrings(Array.isArray(b) ? b : []);
    const aArr = sortedStrings(Array.isArray(a) ? a : []);
    if (!arraysEqual(bArr, aArr)) {
      setPath(patch, path, aArr);
      const op = (bRaw === undefined) ? "add" : "replace";
      json_patch.push({ op, path: dotToJsonPointer(path), value: aArr });
      setPath(before, path, bArr);
      setPath(after, path, aArr);
      interests_changed = true;
    }
    continue;
  }
  if (path.startsWith("cooldowns.")) { a = toISOorNull(a); b = toISOorNull(b); }
  if (path === "last_proposal_offer_ts") { a = toISOorNull(a); b = toISOorNull(b); }

  const changed = (a ?? null) !== (b ?? null);
  if (changed){
    setPath(patch, path, a);

    const op = (bRaw === undefined && a !== null) ? "add"
              : (a === null ? "remove" : "replace");

    const pointer = dotToJsonPointer(path);
    if (op === "remove") json_patch.push({ op, path: pointer });
    else json_patch.push({ op, path: pointer, value: a });

    setPath(before, path, b);
    setPath(after, path, a);

    if (path === "stage") stage_changed = true;
    if (path === "email") email_changed = true;
    if (path === "business_name") business_name_changed = true;
    if (path.startsWith("counters.")) counters_changed = true;
    if (path.startsWith("cooldowns.")) cooldowns_changed = true;
    if (path === "proposal_offer_done" || path === "last_proposal_offer_ts" || path === "proposal_intent_confirmed") proposal_changed = true;
  }
}

const changed_keys = Object.keys(patch).sort();
const has_patch = changed_keys.length > 0;
const touched_roots = uniq(changed_keys.map(k => k.split(".")[0]));
const has_funnel_changes = !!(stage_changed || counters_changed || interests_changed || proposal_changed);

// Evidencia enriquecida (con fallback si no hay history)
const askHit = lastAssistantAskName(history);
const fallbackAskTs = getPath(stateLLM, "cooldowns.addressee_ask_ts") || null;
const evidence = {
  last_incoming: agent_brief?.last_incoming || null,
  intent: agent_brief?.intent || null,
  stage_before: getPath(stateBase, "stage"),
  stage_after: getPath(stateLLM, "stage"),
  assistant_ask_name_ts: askHit?.ts || fallbackAskTs || null,
  assistant_ask_name_text: askHit?.text || (fallbackAskTs ? "(inferred from cooldowns.addressee_ask_ts)" : null)
};

// ---------- salida ----------
return [{
  json: {
    ok: true,
    merge_key,
    agent_brief,
    profile,            // baseline intacto
    state: stateLLM,    // normalizado + inmutables protegidos
    patch,              // dot-paths -> nuevo valor
    json_patch,         // RFC6902 (opcional)
    has_patch,
    changed_keys,
    touched_roots,
    stage_changed,
    email_changed,
    business_name_changed,
    counters_changed,
    cooldowns_changed,
    interests_changed,
    proposal_changed,
    has_funnel_changes,
    patch_meta: { before, after, changed_keys, source:"llm", warning:null, evidence }
  }
}];
