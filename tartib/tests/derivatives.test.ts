import test from "node:test";
import assert from "node:assert/strict";
import { fetchDerivatives, parseFunding, parseLongShort, parseOpenInterest } from "../lib/derivatives.ts";

const fr = { code: "0", data: [{ fundingRate: "-0.0000104041157063", fundingTime: "1791705600000", nextFundingTime: "1791734400000" }] };

test("фандинг: ставка, период и годовая ставка", () => {
  const f = parseFunding(fr);
  assert.ok(f && Math.abs(f.rate - -0.00104041157063) < 1e-12 && f.perHours === 8);
  assert.ok(f && f.annualPct !== null && Math.abs(f.annualPct - f.rate * 3 * 365) < 1e-9);
  assert.equal(parseFunding({ code: "1", data: [] }), null);
  assert.equal(parseFunding({ code: "0", data: [{ fundingRate: "5", fundingTime: "1", nextFundingTime: "2" }] }), null); // нереальная ставка
  assert.equal(parseFunding(null), null);
});

test("открытый интерес и лонги к шортам", () => {
  assert.equal(parseOpenInterest({ code: "0", data: [{ oiUsd: "579836069.9" }] }), 579836069.9);
  assert.equal(parseOpenInterest({ code: "0", data: [{ oiUsd: "x" }] }), null);
  assert.equal(parseLongShort({ code: "0", data: [["1791723600000", "1.41"], ["1791720000000", "1.5"]] }), 1.41);
  assert.equal(parseLongShort({ code: "0", data: [] }), null);
});

test("таблица: частичные данные и полный отказ", async () => {
  const f = async (url: string) => {
    if (url.includes("funding-rate") && url.includes("BTC")) return new Response(JSON.stringify(fr));
    if (url.includes("open-interest") && url.includes("ETH")) return new Response(JSON.stringify({ code: "0", data: [{ oiUsd: "100" }] }));
    return new Response("no", { status: 500 });
  };
  const rows = await fetchDerivatives(f as never);
  assert.ok(rows);
  assert.equal(rows!.length, 6);
  assert.ok(rows!.find((r) => r.coin === "BTC")!.funding);
  assert.equal(rows!.find((r) => r.coin === "ETH")!.oiUsd, 100);
  assert.equal(rows!.find((r) => r.coin === "SOL")!.funding, null);
  const none = async () => { throw new Error("net"); };
  assert.equal(await fetchDerivatives(none as never), null);
});
