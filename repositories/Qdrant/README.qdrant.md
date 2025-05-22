
# 🧠 Qdrant - Vector DB interno

## 🚀 ¿Qué es?

Qdrant es un motor de búsqueda vectorial que usamos para almacenar embeddings (vectores de IA) y hacer búsquedas semánticas. Se ejecuta como servicio **interno** en nuestra red Docker.

---

## 🔧 Endpoint interno

```
http://qdrant:6333
```

Disponible únicamente para servicios en la red `leonobitech-net`.

---

## ✅ Test rápido desde cualquier contenedor (por ejemplo `core`)

### 1. Verificar que está vivo

```bash
curl http://qdrant:6333/collections
```

Debe responder:

```json
{
  "result": [],
  "status": "ok",
  "time": ...
}
```

---

### 2. Crear una colección de prueba

```bash
curl -X PUT http://qdrant:6333/collections/test_vectors \
  -H "Content-Type: application/json" \
  -d '{
    "vectors": {
      "size": 4,
      "distance": "Cosine"
    }
  }'
```

---

### 3. Insertar un vector

```bash
curl -X PUT http://qdrant:6333/collections/test_vectors/points?wait=true \
  -H "Content-Type: application/json" \
  -d '{
    "points": [
      {
        "id": 1,
        "vector": [0.1, 0.2, 0.3, 0.4],
        "payload": { "label": "demo" }
      }
    ]
  }'
```

---

### 4. Buscar por vector similar

```bash
curl -X POST http://qdrant:6333/collections/test_vectors/points/search \
  -H "Content-Type: application/json" \
  -d '{
    "vector": [0.1, 0.2, 0.3, 0.39],
    "top": 1
  }'
```

---

## 🧩 Uso desde n8n

1. Agregar credencial de Qdrant:
   - **Host**: `http://qdrant:6333`
   - **API Key**: `dummy` (no se usa en local)

2. Usar el nodo **Qdrant → Upsert / Search** en cualquier workflow.

---

# 👥 Maintained by

**Leonobitech DevOps Team** ✨  
[https://www.leonobitech.com](https://www.leonobitech.com)
