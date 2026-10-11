import test from "node:test";
import assert from "node:assert/strict";
import { defaultFormMarket, isHorizon, isTraderMarket, shortcutsFor } from "../lib/trader-profile.ts";

test("ярлыки: рынки, потом срок, без повторов и не больше шести", () => {
  const s = shortcutsFor("day", ["crypto", "forex"]);
  assert.ok(s.length <= 6 && new Set(s.map((x) => x.href)).size === s.length);
  assert.equal(s[0].key, "market"); // сначала ярлыки первого рынка
  assert.ok(s.some((x) => x.key === "quick")); // и срок удержания
  assert.deepEqual(shortcutsFor(null, []), []);
  assert.equal(shortcutsFor("scalper", ["crypto", "stocks", "futures", "forex"], 3).length, 3);
  // «market» из разных рынков не дублируется
  assert.equal(shortcutsFor(null, ["crypto", "stocks"]).filter((x) => x.key === "market").length, 1);
});

test("рынок по умолчанию и проверки значений", () => {
  const form = ["crypto", "forex", "stocks", "futures"];
  assert.equal(defaultFormMarket(["stocks", "crypto"], form), "stocks");
  assert.equal(defaultFormMarket(["commodities"], form), "forex");
  assert.equal(defaultFormMarket(["options"], form), null); // пока нет в форме
  assert.equal(defaultFormMarket([], form), null);
  assert.ok(isHorizon("swing") && !isHorizon("x") && isTraderMarket("options") && !isTraderMarket(1));
});
