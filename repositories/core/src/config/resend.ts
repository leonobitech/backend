import { Resend } from "resend";
import { RESEND_API_KEY } from "@config/env";
import { loggerEvent } from "@utils/logging/loggerEvent";
import { handleStartupError } from "@utils/http/handleStartupError";

// ⚠️ Validación inicial
if (!RESEND_API_KEY || RESEND_API_KEY.trim() === "") {
  handleStartupError("resend", new Error("Missing RESEND_API_KEY"));
}

let resend: Resend;

try {
  resend = new Resend(RESEND_API_KEY);
  loggerEvent("resend.connection.success", {
    service: "resend",
  });
} catch (err) {
  handleStartupError("resend", err);
}

export default resend!;
