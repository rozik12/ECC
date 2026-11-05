import test from "node:test";
import assert from "node:assert/strict";
import { ARTICLES } from "../lib/articles.ts";

const LOCALES = ["ru", "uz", "en"] as const;

test("статьи: уникальные адреса и тексты на всех языках", () => {
  const slugs = ARTICLES.map((a) => a.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const a of ARTICLES) {
    assert.match(a.slug, /^[a-z0-9-]+$/);
    assert.match(a.date, /^\d{4}-\d{2}-\d{2}$/);
    for (const l of LOCALES) {
      const x = a.text[l];
      assert.ok(x.title.length > 10 && x.description.length > 20, `${a.slug} ${l}`);
      assert.ok(x.sections.length >= 3, `${a.slug} ${l}`);
      assert.equal(x.sections.length, a.text.ru.sections.length, `${a.slug} ${l}: число разделов`);
      for (const s of x.sections) assert.ok(s.h.length > 3 && s.p.every((p) => p.length > 40), `${a.slug} ${l}`);
    }
  }
});

test("статьи: нет обещаний прибыли и призывов покупать", () => {
  const bad = /гарантир|100%|точно заработ|купи |продай |kafolat|sotib oling|guarantee[sd]?\b|sure profit|buy now/i;
  for (const a of ARTICLES) for (const l of LOCALES) {
    const all = [a.text[l].title, a.text[l].description, ...a.text[l].sections.flatMap((s) => [s.h, ...s.p])].join(" ");
    assert.equal(bad.test(all), false, `${a.slug} ${l}`);
  }
});
