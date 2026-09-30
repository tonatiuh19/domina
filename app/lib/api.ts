import axios from "axios";

export const USER_TOKEN_KEY = "domina.user.token";
export const ADMIN_TOKEN_KEY = "domina.admin.token";

export function readToken(key: string): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(key);
}

export function writeToken(key: string, token: string | null) {
  if (typeof localStorage === "undefined") return;
  if (token) localStorage.setItem(key, token);
  else localStorage.removeItem(key);
}

export function authHeaders(token: string | null) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function formatAxiosError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Something went wrong. Try again.";
}

export function formatMoney(cents: number, currency = "MXN") {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format((cents || 0) / 100);
}
