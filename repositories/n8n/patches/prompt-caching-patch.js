/**
 * Anthropic Prompt Caching Patch for n8n
 *
 * Patches @langchain/anthropic's message_inputs.cjs to automatically wrap
 * system messages with cache_control: { type: "ephemeral" }, enabling
 * Anthropic's prompt caching feature.
 *
 * This reduces API costs significantly for agents with large system prompts.
 * The patch is idempotent — safe to run multiple times.
 */

const fs = require('fs');
const path = require('path');

const PREFIX = '[prompt-caching-patch]';

// Find the target file
function findTarget() {
  const base = '/usr/local/lib/node_modules/n8n';
  const results = [];

  function walk(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (
          entry.name === 'message_inputs.cjs' &&
          full.includes('anthropic') &&
          full.includes('dist/utils')
        ) {
          results.push(full);
        }
      }
    } catch {}
  }

  walk(base);
  return results[0] || null;
}

const targetFile = findTarget();

if (!targetFile) {
  console.log(`${PREFIX} WARNING: message_inputs.cjs not found. Skipping.`);
  process.exit(0);
}

let content = fs.readFileSync(targetFile, 'utf-8');

// Check if already patched (use unique marker from our replacement code)
const PATCH_MARKER = 'var _raw = messages[0].content;';
if (content.includes(PATCH_MARKER)) {
  console.log(`${PREFIX} Already patched. Skipping.`);
  process.exit(0);
}

console.log(`${PREFIX} Patching: ${targetFile}`);

// Backup
fs.writeFileSync(targetFile + '.bak', content);

// The original line (minified, on a single line with tab indent):
// \tif (mergedMessages.length > 0 && mergedMessages[0]._getType() === "system") system = messages[0].content;
const SEARCH = 'if (mergedMessages.length > 0 && mergedMessages[0]._getType() === "system") system = messages[0].content;';

const REPLACE = `if (mergedMessages.length > 0 && mergedMessages[0]._getType() === "system") {
\t\tvar _raw = messages[0].content;
\t\tif (typeof _raw === "string") {
\t\t\tsystem = [{ type: "text", text: _raw, cache_control: { type: "ephemeral" } }];
\t\t} else if (Array.isArray(_raw)) {
\t\t\tsystem = _raw.map(function(b, i, a) {
\t\t\t\tif (i === a.length - 1 && typeof b === "object" && !b.cache_control) {
\t\t\t\t\treturn Object.assign({}, b, { cache_control: { type: "ephemeral" } });
\t\t\t\t}
\t\t\t\treturn b;
\t\t\t});
\t\t} else {
\t\t\tsystem = _raw;
\t\t}
\t}`;

if (!content.includes(SEARCH)) {
  console.log(`${PREFIX} ERROR: Target code pattern not found. n8n version may have changed.`);
  console.log(`${PREFIX} Expected pattern: ${SEARCH}`);
  process.exit(1);
}

content = content.replace(SEARCH, REPLACE);

fs.writeFileSync(targetFile, content);

// Verify
const verify = fs.readFileSync(targetFile, 'utf-8');
if (verify.includes('cache_control') && verify.includes('ephemeral')) {
  console.log(`${PREFIX} SUCCESS: Prompt caching enabled for Anthropic.`);
} else {
  console.log(`${PREFIX} ERROR: Verification failed. Restoring backup.`);
  fs.copyFileSync(targetFile + '.bak', targetFile);
  process.exit(1);
}
