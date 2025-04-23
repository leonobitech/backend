# 🧩 Convención de Tipos

Este proyecto utiliza una organización clara y escalable para definir tipos en TypeScript, diferenciando entre tipos **globales** y **modulares**.

---

## 🌍 Globales (`*.d.ts`)

📁 Ubicación: `src/types/global/`

- Usan `declare global` o `declare module`
- Se aplican automáticamente en todo el proyecto
- **No deben importarse manualmente**
- Reconocidos por TypeScript gracias a `tsconfig.include: ["src"]`

### ✅ Ejemplo:

```ts
// types/global/express.d.ts
import "express";

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}
```

---

## 🧩 Modulares (`*.ts`)

📁 Ubicación: `src/types/modules/`

- Contienen tipos específicos de cada feature o dominio (`auth`, `user`, etc.)
- **Se importan manualmente** usando el alias `@custom-types`
- Se comportan como cualquier otro módulo de código

### ✅ Ejemplo:

```ts
// types/modules/auth/account.ts
export type LoginParams = {
  email: string;
  password: string;
};
```

```ts
// En un servicio o controlador
import type { LoginParams } from "@custom-types/modules/auth/account";
```

---

## 🧠 Notas importantes

- Evitá usar `.d.ts` para tipos que vas a importar/exportar.  
  TypeScript los considera **"ambient declarations"** y no los trata como módulos comunes.

- Usá `.ts` para cualquier tipo que necesites importar.

- Gracias a `"include": ["src"]` en `tsconfig.json`, **no necesitás usar `typeRoots`** para tus tipos globales.