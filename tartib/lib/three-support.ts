// Когда можно показывать 3D. Чистая функция без обращений к браузеру, чтобы её можно было тестировать.
export type DeviceInfo = {
  /** Пользователь просил поменьше анимации */
  reducedMotion: boolean;
  /** Включён экономный режим трафика */
  saveData: boolean;
  /** Память устройства в гигабайтах (есть не везде) */
  deviceMemory?: number;
  /** Число ядер процессора (есть не везде) */
  cores?: number;
  /** Браузер умеет WebGL */
  hasWebGL: boolean;
};

/** 3D показываем только там, где он будет работать плавно; иначе остаётся обычная картинка. */
export function shouldRun3D(d: DeviceInfo): boolean {
  if (!d.hasWebGL || d.reducedMotion || d.saveData) return false;
  if (d.deviceMemory !== undefined && d.deviceMemory < 2) return false;
  if (d.cores !== undefined && d.cores < 2) return false;
  return true;
}

/** Читает сведения об устройстве в браузере. */
export function detectDevice(): DeviceInfo {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  let hasWebGL = false;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    hasWebGL = !!gl;
    (gl as WebGLRenderingContext | null)?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    hasWebGL = false;
  }
  return {
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    saveData: nav.connection?.saveData === true,
    deviceMemory: nav.deviceMemory,
    cores: nav.hardwareConcurrency,
    hasWebGL,
  };
}
