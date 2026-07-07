import type { LiveMetrics } from "@/lib/models";
import { roundCurrency } from "@/lib/format";

export interface NormalizedTrade {
  symbol: string;
  qty: number;
  buyPrice: number;
  sellPrice: number;
  pnl: number;
  boughtTimestamp: Date;
  soldTimestamp: Date;
  durationSeconds: number;
}

function parseCsvLine(line: string): string[] {
  const columns: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      columns.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  columns.push(current.trim());
  return columns;
}

function parseNumber(value: string, fieldName: string, context: string): number {
  const cleaned = value.trim();
  if (!cleaned) {
    throw new Error(`${context}: Missing ${fieldName}.`);
  }

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${context}: Invalid ${fieldName} "${value}".`);
  }

  return parsed;
}

export function parseMoneyValue(value: string, fieldName: string, context: string): number {
  const cleaned = value.trim();
  if (!cleaned) {
    throw new Error(`${context}: Missing ${fieldName}.`);
  }

  const negativeByParens = cleaned.startsWith("$(") && cleaned.endsWith(")");
  const normalized = cleaned
    .replace(/[$,\s]/g, "")
    .replace(/[()]/g, "")
    .replace(/^-(?=\d)/, "");
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${context}: Invalid ${fieldName} "${value}".`);
  }

  const negative = negativeByParens || cleaned.startsWith("-");
  return negative ? -parsed : parsed;
}

export function parseDurationToSeconds(value: string, context: string): number {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) {
    throw new Error(`${context}: Missing duration.`);
  }

  const clockMatch = normalized.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (clockMatch) {
    const first = Number(clockMatch[1]);
    const second = Number(clockMatch[2]);
    const third = Number(clockMatch[3] ?? 0);
    if (clockMatch[3] !== undefined) {
      return first * 3600 + second * 60 + third;
    }
    return first * 60 + second;
  }

  let totalSeconds = 0;
  const unitPattern = /(\d+(?:\.\d+)?)\s*(h(?:ours?)?|hr|hrs|m(?:in(?:ute)?s?)?|s(?:ec(?:ond)?s?)?)/g;
  let unitMatch = unitPattern.exec(normalized);
  while (unitMatch) {
    const amount = Number(unitMatch[1]);
    const unit = unitMatch[2];
    if (unit.startsWith("h")) {
      totalSeconds += amount * 3600;
    } else if (unit.startsWith("m")) {
      totalSeconds += amount * 60;
    } else {
      totalSeconds += amount;
    }
    unitMatch = unitPattern.exec(normalized);
  }

  if (totalSeconds > 0) {
    return Math.round(totalSeconds);
  }

  throw new Error(`${context}: Invalid duration "${value}".`);
}

export function parseBrokerTimestamp(value: string, fieldName: string, context: string): Date {
  const cleaned = value.trim();
  if (!cleaned) {
    throw new Error(`${context}: Missing ${fieldName}.`);
  }

  const nativeParsed = new Date(cleaned);
  if (!Number.isNaN(nativeParsed.getTime())) {
    return nativeParsed;
  }

  const dateTimeMatch = cleaned.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i,
  );
  if (!dateTimeMatch) {
    throw new Error(`${context}: Invalid ${fieldName} "${value}".`);
  }

  const month = Number(dateTimeMatch[1]);
  const day = Number(dateTimeMatch[2]);
  const rawYear = Number(dateTimeMatch[3]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const rawHour = Number(dateTimeMatch[4]);
  const minute = Number(dateTimeMatch[5]);
  const second = Number(dateTimeMatch[6] ?? 0);
  const meridiem = dateTimeMatch[7]?.toUpperCase();
  const hour =
    meridiem === "PM" && rawHour < 12
      ? rawHour + 12
      : meridiem === "AM" && rawHour === 12
        ? 0
        : rawHour;
  const parsed = new Date(year, month - 1, day, hour, minute, second);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${context}: Invalid ${fieldName} "${value}".`);
  }

  return parsed;
}

function normalizeTradeRow(
  row: {
    symbol: string;
    qty: string;
    buyPrice: string;
    sellPrice: string;
    pnl: string;
    boughtTimestamp: string;
    soldTimestamp: string;
    duration: string;
  },
  context: string,
): NormalizedTrade {
  const symbol = row.symbol.trim();
  if (!symbol) {
    throw new Error(`${context}: Missing symbol.`);
  }

  const qty = parseNumber(row.qty, "qty", context);
  const buyPrice = parseNumber(row.buyPrice.replace(/[$,]/g, ""), "buyPrice", context);
  const sellPrice = parseNumber(row.sellPrice.replace(/[$,]/g, ""), "sellPrice", context);
  const pnl = parseMoneyValue(row.pnl, "pnl", context);
  const boughtTimestamp = parseBrokerTimestamp(row.boughtTimestamp, "boughtTimestamp", context);
  const soldTimestamp = parseBrokerTimestamp(row.soldTimestamp, "soldTimestamp", context);
  const durationSeconds = parseDurationToSeconds(row.duration, context);

  return {
    symbol,
    qty,
    buyPrice,
    sellPrice,
    pnl,
    boughtTimestamp,
    soldTimestamp,
    durationSeconds,
  };
}

export function parseTradesCsv(input: string): NormalizedTrade[] {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    throw new Error("CSV import: No content provided.");
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  const columnIndex = (name: string) => headers.findIndex((header) => header === name);
  const requiredColumns = [
    "symbol",
    "qty",
    "buyPrice",
    "sellPrice",
    "pnl",
    "boughtTimestamp",
    "soldTimestamp",
    "duration",
  ] as const;

  const missingColumns = requiredColumns.filter((column) => columnIndex(column) < 0);
  if (missingColumns.length > 0) {
    throw new Error(`CSV import: Missing required column(s): ${missingColumns.join(", ")}.`);
  }

  return lines.slice(1).map((line, offset) => {
    const rowNumber = offset + 2;
    const context = `CSV row ${rowNumber}`;
    const columns = parseCsvLine(line);
    return normalizeTradeRow(
      {
        symbol: columns[columnIndex("symbol")] ?? "",
        qty: columns[columnIndex("qty")] ?? "",
        buyPrice: columns[columnIndex("buyPrice")] ?? "",
        sellPrice: columns[columnIndex("sellPrice")] ?? "",
        pnl: columns[columnIndex("pnl")] ?? "",
        boughtTimestamp: columns[columnIndex("boughtTimestamp")] ?? "",
        soldTimestamp: columns[columnIndex("soldTimestamp")] ?? "",
        duration: columns[columnIndex("duration")] ?? "",
      },
      context,
    );
  });
}

function extractTradesSection(input: string): string {
  const lines = input.split(/\r?\n/);
  const tradesHeaderIndex = lines.findIndex((line) => line.trim().toUpperCase() === "TRADES");
  if (tradesHeaderIndex < 0) {
    throw new Error('Broker report import: "TRADES" section not found.');
  }

  const sectionLines = lines.slice(tradesHeaderIndex + 1);
  const stopKeywords = ["ALL TRADES", "PROFIT TRADES", "LOSING TRADES", "LOSS TRADES", "SUMMARY"];
  const stopIndex = sectionLines.findIndex((line) =>
    stopKeywords.some((keyword) => line.trim().toUpperCase() === keyword),
  );

  return (stopIndex >= 0 ? sectionLines.slice(0, stopIndex) : sectionLines).join("\n");
}

function parseTradeFromText(line: string, context: string): Omit<NormalizedTrade, "durationSeconds"> & { rawTail: string } {
  const rowPattern =
    /^([A-Za-z][A-Za-z0-9._-]*)\s+(-?\d+(?:\.\d+)?)\s+([$]?\d[\d,]*(?:\.\d+)?)\s+([$]?\d[\d,]*(?:\.\d+)?)\s+([$]?\(?-?\d[\d,]*(?:\.\d+)?\)?)\s*(.*)$/;
  const match = line.match(rowPattern);
  if (!match) {
    throw new Error(`${context}: Could not parse trade row.`);
  }

  return {
    symbol: match[1],
    qty: parseNumber(match[2], "qty", context),
    buyPrice: parseNumber(match[3].replace(/[$,]/g, ""), "buyPrice", context),
    sellPrice: parseNumber(match[4].replace(/[$,]/g, ""), "sellPrice", context),
    pnl: parseMoneyValue(match[5], "pnl", context),
    boughtTimestamp: new Date(0),
    soldTimestamp: new Date(0),
    rawTail: match[6] ?? "",
  };
}

function hydrateTimestampsAndDuration(
  parsed: Omit<NormalizedTrade, "durationSeconds"> & { rawTail: string },
  tail: string,
  context: string,
): NormalizedTrade {
  const datePattern = /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?/gi;
  const dateMatches = tail.match(datePattern) ?? [];
  if (dateMatches.length < 2) {
    throw new Error(`${context}: Missing bought/sold timestamps in TRADES row.`);
  }
  const boughtRaw = dateMatches[0];
  const soldRaw = dateMatches[1];
  if (!boughtRaw || !soldRaw) {
    throw new Error(`${context}: Missing bought/sold timestamps in TRADES row.`);
  }

  const boughtTimestamp = parseBrokerTimestamp(boughtRaw, "boughtTimestamp", context);
  const soldTimestamp = parseBrokerTimestamp(soldRaw, "soldTimestamp", context);
  const durationText = tail.replace(datePattern, " ").replace(/\s+/g, " ").trim();
  const durationSeconds = parseDurationToSeconds(durationText, context);

  return {
    ...parsed,
    boughtTimestamp,
    soldTimestamp,
    durationSeconds,
  };
}

export function parseTradesPdfText(input: string): NormalizedTrade[] {
  const section = extractTradesSection(input);
  const lines = section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const trades: NormalizedTrade[] = [];
  let pending:
    | {
        context: string;
        parsed: Omit<NormalizedTrade, "durationSeconds"> & { rawTail: string };
        tail: string;
      }
    | undefined;

  for (const [index, line] of lines.entries()) {
    if (/^(symbol|ticker)\b/i.test(line) || /^qty\b/i.test(line)) {
      continue;
    }

    const context = `TRADES line ${index + 1}`;
    const startsNewTrade = /^[A-Za-z][A-Za-z0-9._-]*\s+-?\d+(?:\.\d+)?\s+[$]?\d/.test(line);

    if (startsNewTrade) {
      if (pending) {
        trades.push(hydrateTimestampsAndDuration(pending.parsed, pending.tail, pending.context));
      }

      const parsed = parseTradeFromText(line, context);
      pending = { context, parsed, tail: parsed.rawTail };
      continue;
    }

    if (pending) {
      pending.tail = `${pending.tail} ${line}`.replace(/\s+/g, " ").trim();
    }
  }

  if (pending) {
    trades.push(hydrateTimestampsAndDuration(pending.parsed, pending.tail, pending.context));
  }

  if (trades.length === 0) {
    throw new Error("Broker report import: No trade rows were parsed from the TRADES section.");
  }

  return trades;
}

export function deriveMetricsFromTrades(
  trades: NormalizedTrade[],
  currentMetrics: LiveMetrics,
  qualifyingDayProfit: number,
): Partial<LiveMetrics> {
  const dayPnl = new Map<string, number>();
  let totalPnl = 0;

  for (const trade of trades) {
    const dayKey = trade.soldTimestamp.toISOString().slice(0, 10);
    dayPnl.set(dayKey, roundCurrency((dayPnl.get(dayKey) ?? 0) + trade.pnl));
    totalPnl = roundCurrency(totalPnl + trade.pnl);
  }

  const dailyTotals = [...dayPnl.values()];
  const bestDayProfit = dailyTotals.length > 0 ? Math.max(...dailyTotals) : 0;
  const profitableDays = dailyTotals.filter((value) => value > 0).length;
  const qualifyingDays = dailyTotals.filter((value) => value >= qualifyingDayProfit).length;

  return {
    ...currentMetrics,
    currentCycleProfit: totalPnl,
    totalProfit: totalPnl,
    bestDayProfit: roundCurrency(bestDayProfit),
    profitableDays,
    qualifyingDays,
  };
}
