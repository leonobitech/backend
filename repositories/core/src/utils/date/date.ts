// 🕒 Constantes reutilizables
export const ONE_MINUTE_MS = 60 * 1000;
export const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
export const ONE_DAY_MS = 24 * ONE_HOUR_MS;
export const ONE_YEAR_MS = 365 * ONE_DAY_MS;

// 🕒 Fechas relativas (valores desde el presente)
export const fiveMinutesFromNow = () =>
  new Date(Date.now() + 5 * ONE_MINUTE_MS);
export const fifteenMinutesFromNow = () =>
  new Date(Date.now() + 15 * ONE_MINUTE_MS);
export const thirtyMinutesFromNow = () =>
  new Date(Date.now() + 30 * ONE_MINUTE_MS);
export const oneHourFromNow = () => new Date(Date.now() + ONE_HOUR_MS);
export const oneDayFromNow = () => new Date(Date.now() + ONE_DAY_MS);
export const thirtyDaysFromNow = () => new Date(Date.now() + 30 * ONE_DAY_MS);
export const oneYearFromNow = () => new Date(Date.now() + ONE_YEAR_MS);

// 🕒 Funciones dinámicas
export const addMinutes = (minutes: number) =>
  new Date(Date.now() + minutes * ONE_MINUTE_MS);
export const addHours = (hours: number) =>
  new Date(Date.now() + hours * ONE_HOUR_MS);
export const addDays = (days: number) =>
  new Date(Date.now() + days * ONE_DAY_MS);
export const addYears = (years: number) =>
  new Date(Date.now() + years * ONE_YEAR_MS);
