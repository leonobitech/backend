# Check Odoo Environment Variables in Deployed Container

Your container is deployed on VPS. Run these commands on your **remote server** (vmi2568874.contaboserver.net):

## 1. Check all ODOO environment variables

```bash
docker exec claude_oauth env | grep ODOO
```

**Expected output:**
```
ODOO_URL=https://odoo.leonobitech.com
ODOO_DB=leonobitech
ODOO_USERNAME=felix@leonobitech.com
ODOO_API_KEY=0a36c32239aa30260a9f78ef41cc2b9dfc13168d
ODOO_VERSION=19
```

## 2. Verify the .env file is mounted correctly

```bash
docker exec claude_oauth cat .env | grep ODOO
```

This shows the actual .env file content inside the container.

## 3. Test Odoo connection from inside the container

```bash
docker exec claude_oauth node -e "
const https = require('https');
const url = process.env.ODOO_URL || 'https://odoo.leonobitech.com';
console.log('Testing connection to:', url);
https.get(url, (res) => {
  console.log('✅ HTTP Status:', res.statusCode);
  res.on('data', () => {});
}).on('error', (e) => {
  console.error('❌ Error:', e.message);
});
"
```

## 4. Check container logs for any Odoo errors

```bash
docker logs --tail 50 claude_oauth | grep -i odoo
```

## 5. Test Odoo authentication from inside container

```bash
docker exec claude_oauth node -e "
const xmlrpc = require('xmlrpc');
const url = process.env.ODOO_URL;
const db = process.env.ODOO_DB;
const username = process.env.ODOO_USERNAME;
const apiKey = process.env.ODOO_API_KEY;

console.log('Testing Odoo authentication...');
console.log('URL:', url);
console.log('DB:', db);
console.log('User:', username);

const client = xmlrpc.createSecureClient({
  url: url + '/xmlrpc/2/common',
  rejectUnauthorized: true
});

client.methodCall('authenticate', [db, username, apiKey, {}], (error, uid) => {
  if (error) {
    console.error('❌ Auth failed:', error.message);
    process.exit(1);
  }
  console.log('✅ Authenticated! UID:', uid);
  process.exit(0);
});
"
```

---

## Quick All-in-One Check

Run this single command on your VPS to check everything:

```bash
echo "=== 1. Odoo Environment Variables ===" && \
docker exec claude_oauth env | grep ODOO && \
echo "" && \
echo "=== 2. Container Status ===" && \
docker ps --filter name=claude_oauth --format "{{.Names}}\t{{.Status}}\t{{.Ports}}" && \
echo "" && \
echo "=== 3. Recent Logs ===" && \
docker logs --tail 20 claude_oauth
```

---

## Troubleshooting

### If environment variables are missing:

1. Check your `.env` file on the VPS:
   ```bash
   cat /path/to/claude-oauth/.env | grep ODOO
   ```

2. Verify docker-compose.yml has the .env file mounted:
   ```bash
   cat docker-compose.yml | grep -A 5 "env_file\|environment"
   ```

3. Restart the container:
   ```bash
   docker compose restart claude_oauth
   # or
   docker compose up -d --force-recreate claude_oauth
   ```

### If authentication fails:

- Verify the API Key is correct in Odoo UI: Settings → Users → API Keys
- Check that user `felix@leonobitech.com` has CRM access
- Verify `odoo.leonobitech.com` is reachable from the container

---

## Next Steps After Verification

Once environment variables are confirmed:

1. **Test from Claude Desktop**: Open Claude Desktop and try:
   ```
   Use odoo_get_leads to show me the latest 5 leads
   ```

2. **Check the MCP manifest**:
   ```bash
   curl https://odoo-mcp.leonobitech.com/.well-known/anthropic/manifest.json
   ```

3. **Monitor logs while testing**:
   ```bash
   docker logs -f claude_oauth
   ```
