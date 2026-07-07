import { describe, expect, it } from "vitest";
import {
  deriveMetricsFromTrades,
  parseMoneyValue,
  parseTradesCsv,
  parseTradesPdfText,
} from "@/lib/trade-import";
import { defaultMetrics } from "@/store/tradeify-store";

describe("trade import parsers", () => {
  it("parses broker CSV rows into normalized trades", () => {
    const csv = [
      "symbol,_priceFormat,_priceFormatType,_tickSize,buyFillId,sellFillId,qty,buyPrice,sellPrice,pnl,boughtTimestamp,soldTimestamp,duration",
      "NQ,2,decimal,0.25,1,2,1,15000.25,15040.50,$40.25,07/01/2026 09:30:00 AM,07/01/2026 09:45:00 AM,15min",
      "ES,2,decimal,0.25,3,4,2,5550,5545,$(10.00),07/01/2026 10:00:00 AM,07/01/2026 10:10:00 AM,10min",
    ].join("\n");

    const trades = parseTradesCsv(csv);

    expect(trades).toHaveLength(2);
    expect(trades[0]).toMatchObject({
      symbol: "NQ",
      qty: 1,
      buyPrice: 15000.25,
      sellPrice: 15040.5,
      pnl: 40.25,
      durationSeconds: 900,
    });
    expect(trades[1].pnl).toBe(-10);
  });

  it("parses CSV pnl values with money formatting edge cases", () => {
    expect(parseMoneyValue("$60.00", "pnl", "row 1")).toBe(60);
    expect(parseMoneyValue("$(210.00)", "pnl", "row 2")).toBe(-210);
    expect(parseMoneyValue("$1,234.56", "pnl", "row 3")).toBe(1234.56);
  });

  it("parses realistic pasted broker report text from TRADES section", () => {
    const report = `
ALL TRADES
summary text that should be ignored
TRADES
Symbol Qty Buy Sell PnL Bought Sold Duration
NQ 1 15000.25 15040.50 $40.25 07/01/2026 09:30:00 AM 07/01/2026 09:45:00 AM 15min
ES 2 5550 5545 $(10.00) 07/01/2026 10:00:00 AM 07/01/2026 10:10:00 AM 10min
PROFIT TRADES
    `.trim();

    const trades = parseTradesPdfText(report);
    const metrics = deriveMetricsFromTrades(trades, defaultMetrics, 20);

    expect(trades).toHaveLength(2);
    expect(metrics.currentCycleProfit).toBe(30.25);
    expect(metrics.bestDayProfit).toBe(30.25);
    expect(metrics.profitableDays).toBe(1);
    expect(metrics.qualifyingDays).toBe(1);
  });

  it("handles wrapped duration lines in pasted broker report text", () => {
    const report = `
TRADES
NQ 1 15000 15050 $50.00 07/01/2026 09:30:00 AM 07/01/2026 09:40:00 AM 10min
28sec
    `.trim();

    const trades = parseTradesPdfText(report);
    expect(trades[0].durationSeconds).toBe(628);
  });

  it("returns user-friendly validation errors with context", () => {
    const invalidCsv = [
      "symbol,qty,buyPrice,sellPrice,pnl,boughtTimestamp,soldTimestamp,duration",
      "NQ,1,15000,15020,$20.00,07/01/2026 09:30:00 AM,,10min",
    ].join("\n");

    expect(() => parseTradesCsv(invalidCsv)).toThrow(/CSV row 2: Missing soldTimestamp/);
  });
});
