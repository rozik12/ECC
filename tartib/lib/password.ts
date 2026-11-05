/** Проверка пароля на «слишком простой». Не заменяет длину, а дополняет её. */

const COMMON = new Set([
  "password", "password1", "password12", "password123", "passw0rd", "p@ssw0rd", "p@ssword", "12345678", "123456789", "1234567890",
  "12341234", "123123123", "87654321", "987654321", "11111111", "00000000", "qwertyui", "qwerty123", "qwertyuiop", "qwerty12",
  "1q2w3e4r", "1qaz2wsx", "qazwsxedc", "zaq12wsx", "asdfghjk", "asdfghjkl", "zxcvbnm1", "abc12345", "abcd1234", "admin123",
  "administrator", "letmein1", "welcome1", "welcome123", "iloveyou", "monkey12", "dragon12", "football", "baseball", "trustno1",
  "tartib12", "tartib123", "tartib1234", "trader123", "trading123", "bitcoin123", "uzbekistan", "parol123", "parol1234", "salom123",
  "qwertyuiop123", "pass1234", "test1234", "temp1234", "changeme", "changeme1",
]);

function isSequential(s: string): boolean {
  // Подряд идущие цифры или буквы: 12345678, abcdefgh (и в обратную сторону)
  if (s.length < 8) return false;
  let up = true;
  let down = true;
  for (let i = 1; i < s.length; i++) {
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1);
    if (d !== 1) up = false;
    if (d !== -1) down = false;
  }
  return up || down;
}

export function isWeakPassword(password: string, email = ""): boolean {
  const p = password.toLowerCase();
  if (COMMON.has(p)) return true;
  if (new Set(p).size <= 2) return true; // aaaaaaaa, 12121212
  if (isSequential(p)) return true;
  const local = email.trim().toLowerCase().split("@")[0] ?? "";
  if (local.length >= 4 && (p === local || p.includes(local))) return true; // пароль повторяет почту
  return false;
}
