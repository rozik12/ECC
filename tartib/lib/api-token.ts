// Личные API-ключи: создание и хэш. Сам ключ хранить нельзя: в базе лежит только SHA-256.

const hex = (buf: ArrayBuffer | Uint8Array) => [...new Uint8Array(buf as ArrayBuffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Новый ключ: tt_ и 64 шестнадцатеричных знака (256 бит случайности). */
export function generateToken(): string {
  return `tt_${hex(crypto.getRandomValues(new Uint8Array(32)))}`;
}

export async function hashToken(token: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
}

/** Первые знаки ключа для списка («tt_3fa9…»): по ним ключ узнают, но воспользоваться ими нельзя. */
export const tokenPrefix = (token: string) => token.slice(0, 9);

export const looksLikeToken = (v: unknown): v is string => typeof v === "string" && /^tt_[0-9a-f]{64}$/.test(v);
