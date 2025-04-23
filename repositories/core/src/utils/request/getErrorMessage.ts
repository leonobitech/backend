// 📁 utils/getErrorMessage.ts

import {
  ERROR_MESSAGES,
  ErrorMessageKey,
  SupportedLang,
} from "@constants/errorMessages";

export const getErrorMessage = (code: string, lang: string = "en"): string => {
  const isValidLang = (lng: string): lng is SupportedLang =>
    ["en", "es"].includes(lng);
  const fallbackLang: SupportedLang = isValidLang(lang) ? lang : "en";

  if (code in ERROR_MESSAGES) {
    const messages = ERROR_MESSAGES[code as ErrorMessageKey];
    return messages[fallbackLang] || messages.en;
  }

  return ERROR_MESSAGES.INTERNAL_SERVER_ERROR[fallbackLang];
};
