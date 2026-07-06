export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function clampNumber(value: number, min = 0): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, value);
}

export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parseProjectedDays(text: string): number[] {
  return text
    .split(/[\n,]+/)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));
}

export function toCsv(rows: Array<Array<string | number | boolean>>): string {
  return rows
    .map((row) =>
      row
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(","),
    )
    .join("\n");
}
