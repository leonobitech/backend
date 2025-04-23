// funcionalidades
//✅ info: logs normales (ej: login exitoso)
//⚠️ warn: eventos inesperados (ej: intento de login fallido)
//❌ error: errores con stacktrace
//📋 event: auditoría de eventos sensibles (registro, login, logout)
//🧠 debug: para desarrollo
//==================================================================\\
//info	Logs normales del flujo feliz (login, register)	🔵 Azul
//warn	Eventos inesperados, sin detener el sistema	🟡 Amarillo
//error	Errores con o sin stack, bien formateado	🔴 Rojo
//event	Auditoría tipo “acción importante”	🟣 Magenta
//debug	Solo en dev: seguimiento interno	🔵 Cyan

import chalk from "chalk";

// 🔁 Timestamp en formato ISO
const timestamp = () => new Date().toISOString();

const logger = {
  info: (message: string, meta?: any) => {
    console.log(
      `${chalk.blue("[INFO]")} ${timestamp()} - ${message}`,
      meta || ""
    );
  },

  warn: (message: string, meta?: any) => {
    console.warn(
      `${chalk.yellow("[WARN]")} ${timestamp()} - ${message}`,
      meta || ""
    );
  },

  error: (message: string, error?: unknown) => {
    console.error(`${chalk.red("[ERROR]")} ${timestamp()} - ${message}`);

    if (error instanceof Error) {
      console.error(chalk.red(error.stack));
    } else if (error) {
      console.error(error);
    }
  },

  event: (eventName: string, payload: Record<string, any>) => {
    console.log(
      `${chalk.magenta("[EVENT]")} ${timestamp()} - ${eventName}`,
      payload
    );
  },

  debug: (label: string, meta?: any) => {
    if (process.env.NODE_ENV === "development") {
      console.log(
        `${chalk.cyan("[DEBUG]")} ${timestamp()} - ${label}`,
        meta || ""
      );
    }
  },
};

export default logger;
