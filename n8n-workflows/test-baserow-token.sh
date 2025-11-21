#!/bin/bash

# Test Baserow API Token
# Reemplaza TU_TOKEN_AQUI con tu token real de Baserow

BASEROW_TOKEN="TU_TOKEN_AQUI"
TABLE_ID="848"

echo "🔍 Testing Baserow API Token..."
echo ""

# Test 1: GET rows (verificar token)
echo "Test 1: GET /api/database/rows/table/${TABLE_ID}/"
curl -X GET "https://br.leonobitech.com/api/database/rows/table/${TABLE_ID}/?user_field_names=true" \
  -H "Authorization: Token ${BASEROW_TOKEN}" \
  -w "\nHTTP Status: %{http_code}\n" \
  -s | jq -r '.count // .error // .detail // "Response: OK"'

echo ""
echo "---"
echo ""

# Test 2: POST con archivo de prueba (crear test.txt primero)
echo "Test 2: POST /api/database/rows/table/${TABLE_ID}/ (upload test)"
echo "test file content" > /tmp/test_baserow_upload.txt

curl -X POST "https://br.leonobitech.com/api/database/rows/table/${TABLE_ID}/" \
  -H "Authorization: Token ${BASEROW_TOKEN}" \
  -F "user_id=test_user_$(date +%s)" \
  -F "filename=test.txt" \
  -F "avatar=@/tmp/test_baserow_upload.txt" \
  -w "\nHTTP Status: %{http_code}\n" \
  -s | jq '.' || echo "Error: No JSON response"

echo ""
echo "✅ Test completed"

# Cleanup
rm -f /tmp/test_baserow_upload.txt
