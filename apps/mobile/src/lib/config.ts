/**
 * API-adress. Sätts via EXPO_PUBLIC_API_URL i .env (utveckling) eller i
 * eas.json (bygge). Se README.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/+$/, "");

export const APP_NAME = "Kursappen";

/** Text som visas när prenumerationen inte är aktiv. Får inte länka till köp (Apple 3.1.1). */
export const NO_ACCESS_TEXT =
  "Vi hittar ingen aktiv prenumeration för den här e-postadressen. Kontrollera att du använder samma adress som när du köpte, eller kontakta kursarrangören.";
