import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { clientDictionary, SERVER_ONLY_SECTIONS } from "../lib/i18n/client-dictionary.ts";
import ru from "../lib/i18n/dictionaries/ru.json" with { type: "json" };

function files(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    if (["node_modules", ".next", ".open-next", "tests", "supabase", "docs", ".git"].includes(f)) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}

const sections = new Set(Object.keys(ru));
const refs = (src: string) => [...src.matchAll(/["'`]([a-z][a-zA-Z0-9]*)\.[A-Za-z0-9_.${}]*/g)].map((m) => m[1]).filter((s) => sections.has(s));

test("словарь для браузера: исключённые разделы существуют и не используются клиентскими файлами", () => {
  for (const s of SERVER_ONLY_SECTIONS) assert.ok(sections.has(s), `нет раздела ${s}`);
  const bad: string[] = [];
  for (const p of files(".")) {
    const src = readFileSync(p, "utf8");
    const isClient = /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(src);
    const isAction = p.includes("app/actions/") || p.includes("app\\actions\\");
    if (!isClient && !isAction) continue;
    for (const s of refs(src)) if ((SERVER_ONLY_SECTIONS as readonly string[]).includes(s)) bad.push(`${p}: ${s}`);
  }
  assert.deepEqual(bad, []);
});

test("словарь для браузера: остальное на месте", () => {
  const c = clientDictionary(ru as Record<string, unknown>);
  assert.ok("common" in c && "nav" in c && "errors" in c);
  assert.ok(!("tradertypes" in c) && !("landing" in c));
  assert.ok(JSON.stringify(c).length < JSON.stringify(ru).length * 0.85);
});
