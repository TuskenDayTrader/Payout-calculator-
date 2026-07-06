"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DEMO_PROFILES } from "@/lib/demo-profiles";
import { formatCurrency, formatPercent, toCsv } from "@/lib/format";
import {
  calculateBuffer,
  calculateConsistency,
  calculateDailyTarget,
  calculateEligibility,
  calculatePayoutPlanner,
  simulateCycle,
} from "@/lib/calculators";
import { getDefaultRulesCatalog, getSortedVersions, resolveRules, safeParseRulesCatalog } from "@/lib/rules";
import type { AccountSize, AccountType, LiveMetrics, StatusTone } from "@/lib/models";
import { useTradeifyStore } from "@/store/tradeify-store";

const sections = [
  ["dashboard", "Dashboard"],
  ["setup", "Account Setup"],
  ["metrics", "Live Metrics Input"],
  ["eligibility", "Eligibility Results"],
  ["planner", "Payout Planner"],
  ["deep-dive", "Consistency & Buffer Deep Dive"],
  ["simulator", "Cycle Simulator"],
  ["settings", "Settings + Rule Config"],
] as const;

function badgeClasses(tone: StatusTone): string {
  if (tone === "PASS") {
    return "bg-[var(--success-soft)] text-[var(--success)]";
  }

  if (tone === "WARNING") {
    return "bg-[var(--warning-soft)] text-[var(--warning)]";
  }

  return "bg-[var(--danger-soft)] text-[var(--danger)]";
}

function surfaceClasses(): string {
  return "rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-xl shadow-black/5";
}

function toneCopy(tone: StatusTone): string {
  return tone === "PASS" ? "PASS" : tone === "WARNING" ? "WARNING" : "FAIL";
}

function InputLabel({ children, htmlFor }: { children: string; htmlFor: string }) {
  return (
    <label className="mb-2 block text-sm font-medium text-[var(--foreground)]" htmlFor={htmlFor}>
      {children}
    </label>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  disabled,
  step = "1",
}: {
  id: string;
  label: string;
  value: number;
  onChange: (nextValue: number) => void;
  disabled?: boolean;
  step?: string;
}) {
  return (
    <div>
      <InputLabel htmlFor={id}>{label}</InputLabel>
      <input
        className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-strong)] px-4 text-base outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-60"
        id={id}
        inputMode="decimal"
        disabled={disabled}
        step={step}
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function CheckboxField({
  id,
  label,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (nextValue: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel-strong)] px-4 py-3 text-sm font-medium">
      <input
        id={id}
        checked={checked}
        disabled={disabled}
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function FormulaDrawer({ title, formula, explanation }: { title: string; formula: string; explanation: string }) {
  return (
    <details className="rounded-2xl border border-[var(--border)] bg-black/5 px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium text-[var(--foreground)]">How this was calculated — {title}</summary>
      <p className="mt-3 rounded-2xl bg-black/10 p-3 font-mono text-xs text-[var(--accent)]">{formula}</p>
      <p className="mt-2 leading-6 text-[var(--muted)]">{explanation}</p>
    </details>
  );
}

function MetricCard({
  title,
  value,
  tone,
  helper,
}: {
  title: string;
  value: string;
  tone: StatusTone;
  helper: string;
}) {
  return (
    <article className={`${surfaceClasses()} min-h-40`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{title}</h3>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClasses(tone)}`}>{toneCopy(tone)}</span>
      </div>
      <p className="mt-4 text-3xl font-semibold text-[var(--foreground)]">{value}</p>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{helper}</p>
    </article>
  );
}

function tooltipCurrency(
  value: number | string | readonly (number | string)[] | undefined,
) {
  const normalizedValue = Array.isArray(value) ? value[0] : value;
  return formatCurrency(
    typeof normalizedValue === "number" ? normalizedValue : Number(normalizedValue ?? 0),
  );
}

export function TradeifyCalculatorApp() {
  const store = useTradeifyStore();
  const [shareFeedback, setShareFeedback] = useState<string>("");
  const [snapshotName, setSnapshotName] = useState<string>("");
  const shareHydratedRef = useRef(false);

  const parsedRules = useMemo(() => safeParseRulesCatalog(store.customRulesText), [store.customRulesText]);
  const catalog = parsedRules.success ? parsedRules.data : getDefaultRulesCatalog();
  const versions = useMemo(() => getSortedVersions(catalog), [catalog]);
  const selectedVersionId = store.selectedRuleVersionId ?? versions.at(-1)?.versionId;
  const selectedVersion = versions.find((version) => version.versionId === selectedVersionId) ?? versions.at(-1);
  const accountTypeConfig = selectedVersion?.accountTypes.find(
    (entry) => entry.accountType === store.profile.accountType,
  );
  const availableSizes = accountTypeConfig?.sizes.map((entry) => entry.accountSize) ?? [];
  const resolution = useMemo(
    () => resolveRules(store.profile, catalog, selectedVersionId),
    [catalog, selectedVersionId, store.profile],
  );
  const rules = resolution.resolvedRules;
  const consistency = rules
    ? calculateConsistency(
        store.metrics.currentCycleProfit,
        store.metrics.bestDayProfit,
        rules.consistencyCapPercent,
      )
    : null;
  const buffer = rules
    ? calculateBuffer(
        store.metrics.currentBalance,
        store.metrics.trailingDrawdownLine,
        store.metrics.desiredSafetyCushion,
        store.metrics.requestAmount,
      )
    : null;
  const payoutPlanner = rules ? calculatePayoutPlanner(store.metrics, rules) : null;
  const dailyTarget = rules
    ? calculateDailyTarget(
        store.desiredWeeklyPayout,
        store.numberOfAccounts,
        store.tradingDaysPerWeek,
        rules,
      )
    : null;
  const eligibility = rules ? calculateEligibility(store.metrics, rules) : null;
  const simulation = rules ? simulateCycle(store.metrics, rules, store.projectedDaysText) : null;
  const disabled = store.readOnlySharedState;

  const lightningSummary =
    store.profile.accountType === "Lightning" && rules
      ? {
          payoutNumber: store.profile.payoutNumber,
          consistencyCap: formatPercent(rules.consistencyCapPercent),
          payoutCap: rules.payoutCap ? formatCurrency(rules.payoutCap) : "No cap",
          nextChange:
            resolution.nextPayoutTier?.nextChangeHint ??
            "No higher payout-tier override is seeded yet for the next payout number.",
        }
      : null;

  const redFlags = [
    ...(eligibility?.warnings ?? []),
    ...(resolution.missingRequirements ?? []),
    ...(consistency && !consistency.passes
      ? ["Best-day risk is too large for the active consistency cap."]
      : []),
    ...(buffer?.dangerZone ? ["Requested payout harms the target drawdown cushion."] : []),
    ...(rules && store.metrics.qualifyingDays < rules.qualifyingProfitableDays
      ? ["Qualifying day count is still below the payout cadence requirement."]
      : []),
  ];

  useEffect(() => {
    document.documentElement.dataset.theme = store.theme;
  }, [store.theme]);

  useEffect(() => {
    if (shareHydratedRef.current || typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const sharePayload = params.get("share");

    if (!sharePayload) {
      shareHydratedRef.current = true;
      return;
    }

    try {
      const decoded = decodeURIComponent(atob(sharePayload));
      const payload = JSON.parse(decoded) as Parameters<typeof store.hydrateFromSharedState>[0];
      store.hydrateFromSharedState(payload);
      queueMicrotask(() => {
        setShareFeedback("Loaded a read-only shared plan. Click clone to edit.");
      });
    } catch {
      queueMicrotask(() => {
        setShareFeedback("That share link could not be decoded. Loading your saved local data instead.");
      });
    } finally {
      shareHydratedRef.current = true;
    }
  }, [store]);

  const updateMetric = <K extends keyof LiveMetrics>(field: K, value: number | boolean) => {
    store.updateMetrics({ [field]: value } as Partial<LiveMetrics>);
  };

  const exportCsv = () => {
    if (typeof window === "undefined") {
      return;
    }

    const csv = toCsv([
      ["Field", "Value"],
      ["Account Type", store.profile.accountType],
      ["Account Size", store.profile.accountSize],
      ["Payout Number", store.profile.payoutNumber],
      ["Rules Version", resolution.version.versionId],
      ["Current Balance", store.metrics.currentBalance],
      ["Trailing DD Line", store.metrics.trailingDrawdownLine],
      ["Cycle Profit", store.metrics.currentCycleProfit],
      ["Best Day Profit", store.metrics.bestDayProfit],
      ["Qualifying Days", store.metrics.qualifyingDays],
      ["Profitable Days", store.metrics.profitableDays],
      ["Desired Cushion", store.metrics.desiredSafetyCushion],
      ["Eligibility", eligibility?.eligible ?? false],
      ["Safe Max Request", eligibility?.maxSafeRequest ?? 0],
    ]);

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "tradeify-assumptions.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyShareLink = async () => {
    if (typeof window === "undefined") {
      return;
    }

    const payload = {
      profile: store.profile,
      metrics: store.metrics,
      selectedRuleVersionId: selectedVersionId,
      projectedDaysText: store.projectedDaysText,
      desiredWeeklyPayout: store.desiredWeeklyPayout,
      numberOfAccounts: store.numberOfAccounts,
      tradingDaysPerWeek: store.tradingDaysPerWeek,
      theme: store.theme,
      explainLikeImNew: store.explainLikeImNew,
      riskMode: store.riskMode,
      customRulesText: store.customRulesText,
    };
    const encoded = btoa(encodeURIComponent(JSON.stringify(payload)));
    const url = `${window.location.origin}${window.location.pathname}?share=${encoded}`;

    try {
      await navigator.clipboard.writeText(url);
      setShareFeedback("Share link copied.");
    } catch {
      setShareFeedback(url);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <header className={`${surfaceClasses()} relative overflow-hidden`}>
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-400 via-cyan-400 to-sky-400" />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm uppercase tracking-[0.24em] text-[var(--muted)]">Tradeify planning dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Tradeify Payout &amp; Risk Utility Calculator</h1>
            <p className="mt-4 text-sm leading-7 text-[var(--muted)] sm:text-base">
              Check payout eligibility, preserve drawdown buffer, repair consistency, and plan your next payout cycle
              without guessing. Every result shows both raw numbers and plain-language guidance.
            </p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm text-[var(--muted)]">
              <span>Last updated rules: {catalog.lastUpdated}</span>
              <span>•</span>
              <span>Active rule version: {resolution.version.label}</span>
              <span>•</span>
              <span>Applied layers: {resolution.appliedLayers.join(" → ")}</span>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:min-w-72">
            <div className="flex flex-wrap gap-3">
              <button
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-slate-950"
                type="button"
                onClick={() => store.setTheme(store.theme === "dark" ? "light" : "dark")}
              >
                Theme: {store.theme}
              </button>
              <button
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-[var(--border)] px-4 text-sm font-semibold"
                type="button"
                onClick={() => store.setExplainLikeImNew(!store.explainLikeImNew)}
              >
                Explain like I&apos;m new: {store.explainLikeImNew ? "On" : "Off"}
              </button>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-[var(--border)] px-4 text-sm font-semibold"
                type="button"
                onClick={copyShareLink}
              >
                Copy share link
              </button>
              <button
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-[var(--border)] px-4 text-sm font-semibold"
                type="button"
                onClick={exportCsv}
              >
                Export CSV
              </button>
              <button
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-[var(--border)] px-4 text-sm font-semibold"
                type="button"
                onClick={() => window.print()}
              >
                Print / PDF
              </button>
            </div>
            {shareFeedback ? <p className="text-sm text-[var(--muted)]">{shareFeedback}</p> : null}
            {store.readOnlySharedState ? (
              <div className="rounded-2xl bg-[var(--warning-soft)] p-4 text-sm text-[var(--warning)]">
                <p className="font-semibold">Read-only share mode</p>
                <p className="mt-2">You can inspect the plan safely without overwriting your saved assumptions.</p>
                <button
                  className="mt-3 inline-flex min-h-11 items-center rounded-full border border-current px-4 font-semibold"
                  type="button"
                  onClick={() => store.setReadOnlySharedState(false)}
                >
                  Clone to edit
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <nav aria-label="App sections" className={`${surfaceClasses()} py-4`}>
        <ul className="flex flex-wrap gap-2">
          {sections.map(([slug, label]) => (
            <li key={slug}>
              <a
                className="inline-flex min-h-11 items-center rounded-full border border-[var(--border)] px-4 text-sm font-medium text-[var(--foreground)]"
                href={`#${slug}`}
              >
                {label}
              </a>
            </li>
          ))}
          <li>
            <Link
              className="inline-flex min-h-11 items-center rounded-full border border-[var(--border)] px-4 text-sm font-medium text-[var(--foreground)]"
              href="/formulas"
            >
              Formula docs
            </Link>
          </li>
        </ul>
      </nav>

      <section className="grid gap-4 lg:grid-cols-4" id="dashboard">
        <MetricCard
          title="Eligibility"
          value={rules && eligibility ? (eligibility.eligible ? "Eligible now" : "Not eligible yet") : "Rules missing"}
          tone={eligibility?.tone ?? "FAIL"}
          helper={eligibility?.plainLanguageSummary ?? "Fix the missing rule config before using the calculator."}
        />
        <MetricCard
          title="Safe max request"
          value={payoutPlanner ? formatCurrency(payoutPlanner.maxRequest) : "—"}
          tone={payoutPlanner?.tone ?? "FAIL"}
          helper={buffer?.explanation ?? "Buffer and payout rules combine to determine the safe request ceiling."}
        />
        <MetricCard
          title="Consistency"
          value={consistency ? formatPercent(consistency.consistencyPercent) : "—"}
          tone={consistency?.tone ?? "FAIL"}
          helper={consistency?.explanation ?? "Consistency is unavailable until all required rules are loaded."}
        />
        <MetricCard
          title="Combined daily target"
          value={dailyTarget ? formatCurrency(dailyTarget.combinedDailyTarget) : "—"}
          tone={dailyTarget ? "PASS" : "FAIL"}
          helper={dailyTarget?.explanation ?? "Daily target planning requires a valid rule profile."}
        />
      </section>

      <section className={`${surfaceClasses()} grid gap-4 lg:grid-cols-[2fr_1fr]`} id="setup">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">1. Account Setup</p>
              <h2 className="mt-2 text-2xl font-semibold">Choose account type, size, rule profile, and payout tier</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                {store.explainLikeImNew
                  ? "This tells the engine which payout rules to apply before it checks your live numbers."
                  : "The selected rule profile drives inheritance from base rules to account type, size, and payout-number overrides."}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClasses(parsedRules.success ? "PASS" : "FAIL")}`}>
              {parsedRules.success ? "Rules validated" : "Rules invalid"}
            </span>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <InputLabel htmlFor="account-type">Account type</InputLabel>
              <select
                aria-label="Account type"
                className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-strong)] px-4"
                disabled={disabled}
                id="account-type"
                value={store.profile.accountType}
                onChange={(event) => {
                  const nextType = event.target.value as AccountType;
                  const nextTypeConfig = selectedVersion?.accountTypes.find(
                    (entry) => entry.accountType === nextType,
                  );
                  const nextSizes =
                    nextTypeConfig?.sizes.map((entry) => entry.accountSize) ?? availableSizes;
                  store.updateProfile({
                    accountType: nextType,
                    accountSize: nextSizes.includes(store.profile.accountSize)
                      ? store.profile.accountSize
                      : (nextSizes[0] ?? store.profile.accountSize),
                  });
                }}
              >
                {selectedVersion?.accountTypes.map((entry) => (
                  <option key={entry.accountType} value={entry.accountType}>
                    {entry.accountType}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <InputLabel htmlFor="account-size">Account size</InputLabel>
              <select
                aria-label="Account size"
                className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-strong)] px-4"
                disabled={disabled}
                id="account-size"
                value={store.profile.accountSize}
                onChange={(event) =>
                  store.updateProfile({ accountSize: event.target.value as AccountSize })
                }
              >
                {availableSizes.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
            <NumberField
              id="payout-number"
              disabled={disabled}
              label="Current payout #"
              value={store.profile.payoutNumber}
              onChange={(value) => store.updateProfile({ payoutNumber: Math.max(1, value) })}
            />
            <div>
              <InputLabel htmlFor="rule-version">Rule version</InputLabel>
              <select
                aria-label="Rule version"
                className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-strong)] px-4"
                disabled={disabled}
                id="rule-version"
                value={selectedVersionId}
                onChange={(event) => store.setSelectedRuleVersionId(event.target.value)}
              >
                {versions.map((version) => (
                  <option key={version.versionId} value={version.versionId}>
                    {version.label} ({version.effectiveFrom})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {lightningSummary ? (
            <div className="mt-5 grid gap-4 rounded-3xl border border-[var(--border)] bg-black/10 p-4 md:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Current payout #</p>
                <p className="mt-2 text-lg font-semibold">#{lightningSummary.payoutNumber}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Consistency cap for this payout #</p>
                <p className="mt-2 text-lg font-semibold">{lightningSummary.consistencyCap}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Payout cap for this payout #</p>
                <p className="mt-2 text-lg font-semibold">{lightningSummary.payoutCap}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">What changes at next payout #</p>
                <p className="mt-2 text-sm leading-6">{lightningSummary.nextChange}</p>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="rounded-3xl border border-[var(--border)] bg-black/10 p-4">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Demo profiles</p>
          <div className="mt-3 flex flex-col gap-3">
            {DEMO_PROFILES.map((profile) => (
              <button
                key={profile.id}
                className="rounded-2xl border border-[var(--border)] bg-[var(--panel-strong)] px-4 py-3 text-left"
                type="button"
                onClick={() => store.applyDemoProfile(profile.id)}
              >
                <span className="block font-semibold">{profile.label}</span>
                <span className="mt-1 block text-sm leading-6 text-[var(--muted)]">{profile.description}</span>
              </button>
            ))}
          </div>
        </aside>
      </section>

      <section className={`${surfaceClasses()} grid gap-6 lg:grid-cols-[1.8fr_1fr]`} id="metrics">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">2. Live Metrics Input</p>
          <h2 className="mt-2 text-2xl font-semibold">Paste in the numbers you see right now</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Use the same values your platform shows today. Inputs persist locally, so you can come back without retyping.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <NumberField
              id="current-balance"
              disabled={disabled}
              label="Current balance"
              value={store.metrics.currentBalance}
              onChange={(value) => updateMetric("currentBalance", value)}
            />
            <NumberField
              id="trailing-dd"
              disabled={disabled}
              label="Trailing DD line"
              value={store.metrics.trailingDrawdownLine}
              onChange={(value) => updateMetric("trailingDrawdownLine", value)}
            />
            <NumberField
              id="current-cycle-profit"
              disabled={disabled}
              label="Current cycle profit"
              value={store.metrics.currentCycleProfit}
              onChange={(value) => updateMetric("currentCycleProfit", value)}
            />
            <NumberField
              id="best-day-profit"
              disabled={disabled}
              label="Best day profit"
              value={store.metrics.bestDayProfit}
              onChange={(value) => updateMetric("bestDayProfit", value)}
            />
            <NumberField
              id="profitable-days"
              disabled={disabled}
              label="Profitable days"
              value={store.metrics.profitableDays}
              onChange={(value) => updateMetric("profitableDays", Math.max(0, value))}
            />
            <NumberField
              id="qualifying-days"
              disabled={disabled}
              label="Qualifying days"
              value={store.metrics.qualifyingDays}
              onChange={(value) => updateMetric("qualifyingDays", Math.max(0, value))}
            />
            <NumberField
              id="total-profit"
              disabled={disabled}
              label="Total profit"
              value={store.metrics.totalProfit}
              onChange={(value) => updateMetric("totalProfit", value)}
            />
            <NumberField
              id="desired-cushion"
              disabled={disabled}
              label="Desired safety cushion"
              value={store.metrics.desiredSafetyCushion}
              onChange={(value) => updateMetric("desiredSafetyCushion", value)}
            />
            <NumberField
              id="request-amount"
              disabled={disabled}
              label="Planned request amount"
              value={store.metrics.requestAmount}
              onChange={(value) => updateMetric("requestAmount", value)}
            />
          </div>

          <div className="mt-4">
            <CheckboxField
              id="microscalping"
              checked={store.metrics.microscalpingCompliant}
              disabled={disabled}
              label="Microscalping compliance flag"
              onChange={(value) => updateMetric("microscalpingCompliant", value)}
            />
          </div>
        </div>

        <aside className="rounded-3xl border border-[var(--border)] bg-black/10 p-4">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Quick Fill from Screenshot Values</p>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Manually transcribe the key numbers from a screenshot or platform panel. These fields update the main inputs.
          </p>
          <div className="mt-4 grid gap-3">
            <NumberField
              id="quick-balance"
              disabled={disabled}
              label="Screenshot balance"
              value={store.metrics.currentBalance}
              onChange={(value) => updateMetric("currentBalance", value)}
            />
            <NumberField
              id="quick-drawdown"
              disabled={disabled}
              label="Screenshot drawdown line"
              value={store.metrics.trailingDrawdownLine}
              onChange={(value) => updateMetric("trailingDrawdownLine", value)}
            />
            <NumberField
              id="quick-cycle"
              disabled={disabled}
              label="Screenshot cycle profit"
              value={store.metrics.currentCycleProfit}
              onChange={(value) => updateMetric("currentCycleProfit", value)}
            />
            <NumberField
              id="quick-best-day"
              disabled={disabled}
              label="Screenshot best day"
              value={store.metrics.bestDayProfit}
              onChange={(value) => updateMetric("bestDayProfit", value)}
            />
          </div>
        </aside>
      </section>

      <section className={`${surfaceClasses()} grid gap-5 lg:grid-cols-[1.3fr_1fr]`} id="eligibility">
        <div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">3. Eligibility Results</p>
              <h2 className="mt-2 text-2xl font-semibold">See whether you can request a payout right now</h2>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClasses(eligibility?.tone ?? "FAIL")}`}>
              {eligibility ? toneCopy(eligibility.tone) : "FAIL"}
            </span>
          </div>

          {!parsedRules.success ? (
            <div className="mt-4 rounded-3xl bg-[var(--danger-soft)] p-4 text-sm leading-6 text-[var(--danger)]">
              Rule config error: {parsedRules.error}
            </div>
          ) : null}
          {resolution.missingRequirements.length > 0 ? (
            <div className="mt-4 rounded-3xl bg-[var(--danger-soft)] p-4 text-sm leading-6 text-[var(--danger)]">
              {resolution.missingRequirements.join(" ")}
            </div>
          ) : null}

          <p className="mt-4 text-base leading-7 text-[var(--foreground)]">
            {eligibility?.plainLanguageSummary ?? "Complete the rule setup to run the eligibility engine."}
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <article className="rounded-3xl border border-[var(--border)] bg-black/10 p-4">
              <h3 className="text-lg font-semibold">Unmet requirements</h3>
              {eligibility && eligibility.unmetRequirements.length > 0 ? (
                <ul className="mt-3 space-y-3 text-sm leading-6 text-[var(--muted)]">
                  {eligibility.unmetRequirements.map((requirement) => (
                    <li key={`${requirement.label}-${requirement.plainLanguage}`} className="rounded-2xl bg-[var(--panel-strong)] p-3">
                      <p className="font-semibold text-[var(--foreground)]">{requirement.label}</p>
                      <p>{requirement.plainLanguage}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">No gaps remain. You are clear to request within the safe payout range.</p>
              )}
            </article>
            <article className="rounded-3xl border border-[var(--border)] bg-black/10 p-4">
              <h3 className="text-lg font-semibold">Scenario cards</h3>
              <div className="mt-3 space-y-3 text-sm leading-6 text-[var(--muted)]">
                <div className="rounded-2xl bg-[var(--panel-strong)] p-3">
                  <p className="font-semibold text-[var(--foreground)]">Get eligible ASAP</p>
                  <p>
                    {eligibility?.unmetRequirements[0]?.plainLanguage ?? "Stay inside the safe request limit and you can request immediately."}
                  </p>
                </div>
                <div className="rounded-2xl bg-[var(--panel-strong)] p-3">
                  <p className="font-semibold text-[var(--foreground)]">Max payout with max buffer</p>
                  <p>
                    {payoutPlanner
                      ? `Balanced tier suggests ${formatCurrency(payoutPlanner.requestTiers[1]?.amount ?? 0)} while still respecting your cushion target.`
                      : "Requires a valid ruleset."}
                  </p>
                </div>
                <div className="rounded-2xl bg-[var(--panel-strong)] p-3">
                  <p className="font-semibold text-[var(--foreground)]">Consistency repair mode</p>
                  <p>
                    {consistency
                      ? consistency.additionalProfitNeeded > 0
                        ? `Focus on adding ${formatCurrency(consistency.additionalProfitNeeded)} of smaller gains before taking a payout.`
                        : "Consistency already passes. Avoid a new oversized best day."
                      : "Requires a valid ruleset."}
                  </p>
                </div>
              </div>
            </article>
          </div>
        </div>

        <aside className="rounded-3xl border border-[var(--border)] bg-black/10 p-4">
          <h3 className="text-lg font-semibold">Red Flag Detector</h3>
          <ul className="mt-3 space-y-3 text-sm leading-6 text-[var(--muted)]">
            {redFlags.length > 0 ? (
              redFlags.map((flag) => (
                <li key={flag} className="rounded-2xl bg-[var(--panel-strong)] p-3 text-[var(--warning)]">
                  {flag}
                </li>
              ))
            ) : (
              <li className="rounded-2xl bg-[var(--panel-strong)] p-3 text-[var(--success)]">
                No major red flags detected with the current assumptions.
              </li>
            )}
          </ul>
        </aside>
      </section>

      <section className={`${surfaceClasses()} grid gap-5 xl:grid-cols-[1.5fr_1fr]`} id="planner">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">4. Payout Planner</p>
          <h2 className="mt-2 text-2xl font-semibold">Choose a request size that matches your risk mode</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">The planner combines payout cap, cycle profit, and drawdown buffer so you can see the safe range instantly.</p>

          <div className="mt-4 flex flex-wrap gap-3">
            {(["Survival", "Balanced", "Growth"] as const).map((mode) => (
              <button
                key={mode}
                className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${
                  store.riskMode === mode
                    ? "bg-[var(--accent)] text-slate-950"
                    : "border border-[var(--border)] text-[var(--foreground)]"
                }`}
                type="button"
                onClick={() => store.applyRiskMode(mode)}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {payoutPlanner?.requestTiers.map((tier) => (
              <article key={tier.label} className="rounded-3xl border border-[var(--border)] bg-black/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold">{tier.label}</h3>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClasses(tier.tone)}`}>{tier.label}</span>
                </div>
                <p className="mt-3 text-3xl font-semibold">{formatCurrency(tier.amount)}</p>
                <p className="mt-2 text-sm text-[var(--muted)]">Net take-home: {formatCurrency(tier.netTakeHome)}</p>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{tier.guidance}</p>
              </article>
            ))}
          </div>
        </div>

        <aside className="rounded-3xl border border-[var(--border)] bg-black/10 p-4">
          <h3 className="text-lg font-semibold">Planner outputs</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-[var(--muted)]">Min request</dt>
              <dd className="font-semibold">{payoutPlanner ? formatCurrency(payoutPlanner.minRequest) : "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-[var(--muted)]">Max request</dt>
              <dd className="font-semibold">{payoutPlanner ? formatCurrency(payoutPlanner.maxRequest) : "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-[var(--muted)]">Split</dt>
              <dd className="font-semibold">{payoutPlanner ? formatPercent(payoutPlanner.netSplitPercent) : "—"}</dd>
            </div>
            <div className="rounded-2xl bg-[var(--panel-strong)] p-3 text-sm leading-6 text-[var(--muted)]">{payoutPlanner?.cadenceMessage}</div>
            <div className="rounded-2xl bg-[var(--panel-strong)] p-3 text-sm leading-6 text-[var(--muted)]">{payoutPlanner?.explanation}</div>
          </dl>
          <FormulaDrawer
            title="Min / max request logic"
            formula="max_request = min(cycle_profit, payout_cap, current_balance - dd_line - desired_cushion)"
            explanation="The request planner never recommends more than the smallest binding constraint. Trader split is applied after the gross request amount is chosen."
          />
        </aside>
      </section>

      <section className={`${surfaceClasses()} grid gap-5 xl:grid-cols-[1.2fr_1.2fr_1fr]`} id="deep-dive">
        <article className="rounded-3xl border border-[var(--border)] bg-black/10 p-4">
          <h2 className="text-2xl font-semibold">Consistency deep dive</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Current consistency: {consistency ? formatPercent(consistency.consistencyPercent) : "—"}</p>
          <div className="mt-4 grid gap-3 text-sm">
            <div className="rounded-2xl bg-[var(--panel-strong)] p-3">
              <p className="text-[var(--muted)]">Required cycle total</p>
              <p className="mt-2 text-xl font-semibold">{consistency ? formatCurrency(consistency.requiredCycleTotal) : "—"}</p>
            </div>
            <div className="rounded-2xl bg-[var(--panel-strong)] p-3">
              <p className="text-[var(--muted)]">Additional profit needed</p>
              <p className="mt-2 text-xl font-semibold">{consistency ? formatCurrency(consistency.additionalProfitNeeded) : "—"}</p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-[var(--muted)]">{consistency?.explanation}</p>
          <div className="mt-4 space-y-3">
            <FormulaDrawer
              title="Consistency %"
              formula="best_day_profit / current_cycle_total * 100"
              explanation="If the best day consumes too much of the cycle total, the account fails the consistency check until more profit is added or the best day is diluted."
            />
            <FormulaDrawer
              title="Required cycle total"
              formula="best_day_profit / (consistency_cap_percent / 100)"
              explanation="This converts the active cap into the minimum total cycle profit needed to keep the best day inside the permitted share of the cycle."
            />
          </div>
        </article>

        <article className="rounded-3xl border border-[var(--border)] bg-black/10 p-4">
          <h2 className="text-2xl font-semibold">Buffer &amp; drawdown safety</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Keep enough distance above the trailing drawdown line before requesting a payout.</p>
          <div className="mt-4 grid gap-3 text-sm">
            <div className="rounded-2xl bg-[var(--panel-strong)] p-3">
              <p className="text-[var(--muted)]">Current buffer</p>
              <p className="mt-2 text-xl font-semibold">{buffer ? formatCurrency(buffer.currentBuffer) : "—"}</p>
            </div>
            <div className="rounded-2xl bg-[var(--panel-strong)] p-3">
              <p className="text-[var(--muted)]">Post-request buffer projection</p>
              <p className="mt-2 text-xl font-semibold">{buffer ? formatCurrency(buffer.postRequestBuffer) : "—"}</p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-[var(--muted)]">{buffer?.explanation}</p>
          <div className="mt-4 space-y-3">
            <FormulaDrawer
              title="Buffer before / after payout"
              formula="current_buffer = balance - dd_line; post_request_buffer = current_buffer - request_amount"
              explanation="The post-request projection highlights how much breathing room remains after the payout hits the account balance."
            />
            <FormulaDrawer
              title="Max safe request"
              formula="balance - dd_line - desired_safety_cushion"
              explanation="A warning is shown whenever the planned request would cut inside the chosen cushion."
            />
          </div>
        </article>

        <article className="rounded-3xl border border-[var(--border)] bg-black/10 p-4">
          <h2 className="text-2xl font-semibold">Daily Target Planner</h2>
          <div className="mt-4 grid gap-3">
            <NumberField
              id="desired-weekly"
              disabled={disabled}
              label="Desired weekly payout"
              value={store.desiredWeeklyPayout}
              onChange={(value) => store.setDesiredWeeklyPayout(value)}
            />
            <NumberField
              id="account-count"
              disabled={disabled}
              label="Number of accounts"
              value={store.numberOfAccounts}
              onChange={(value) => store.setNumberOfAccounts(Math.max(1, value))}
            />
            <NumberField
              id="trading-days"
              disabled={disabled}
              label="Trading days / week"
              value={store.tradingDaysPerWeek}
              onChange={(value) => store.setTradingDaysPerWeek(Math.max(1, value))}
            />
          </div>
          <div className="mt-4 rounded-2xl bg-[var(--panel-strong)] p-4 text-sm leading-6 text-[var(--muted)]">
            <p>Per-account daily target: {dailyTarget ? formatCurrency(dailyTarget.perAccountDailyTarget) : "—"}</p>
            <p>Combined daily target: {dailyTarget ? formatCurrency(dailyTarget.combinedDailyTarget) : "—"}</p>
            <p>Minimum qualifying daily target: {dailyTarget ? formatCurrency(dailyTarget.minimumQualifyingDailyTarget) : "—"}</p>
            <p className="mt-2">Safer target band: {dailyTarget ? `${formatCurrency(dailyTarget.saferTargetBand.low)} / ${formatCurrency(dailyTarget.saferTargetBand.medium)} / ${formatCurrency(dailyTarget.saferTargetBand.high)}` : "—"}</p>
          </div>
          <FormulaDrawer
            title="Daily target math"
            formula="desired_weekly_payout / split / account_count / trading_days"
            explanation="The planner first converts take-home goals back into gross payout requirements, then spreads the load across the chosen number of accounts and trading days."
          />
        </article>
      </section>

      <section className={`${surfaceClasses()} grid gap-5 xl:grid-cols-[1.2fr_1fr]`} id="simulator">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">6. Cycle Simulator</p>
          <h2 className="mt-2 text-2xl font-semibold">Model the next few days before you trade them</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Enter projected day results separated by commas or new lines. The simulator recomputes eligibility after every day.</p>
          <InputLabel htmlFor="projected-days">Projected day results</InputLabel>
          <textarea
            aria-label="Projected day results"
            className="min-h-32 w-full rounded-3xl border border-[var(--border)] bg-[var(--panel-strong)] p-4 outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            disabled={disabled}
            id="projected-days"
            value={store.projectedDaysText}
            onChange={(event) => store.setProjectedDaysText(event.target.value)}
          />
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <article className="rounded-3xl border border-[var(--border)] bg-black/10 p-4 text-sm leading-6 text-[var(--muted)]">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">Fast path</h3>
              <p className="mt-3">{simulation?.fastPathSummary}</p>
            </article>
            <article className="rounded-3xl border border-[var(--border)] bg-black/10 p-4 text-sm leading-6 text-[var(--muted)]">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">Low variance path</h3>
              <p className="mt-3">{simulation?.lowVarianceSummary}</p>
            </article>
          </div>
          {simulation?.warnings.length ? (
            <ul className="mt-4 space-y-2 text-sm leading-6 text-[var(--warning)]">
              {simulation.warnings.map((warning) => (
                <li key={warning} className="rounded-2xl bg-[var(--warning-soft)] p-3">
                  {warning}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="grid gap-4">
          <article className="rounded-3xl border border-[var(--border)] bg-black/10 p-4">
            <h3 className="text-lg font-semibold">Eligibility by simulated day</h3>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={simulation?.steps ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" />
                  <XAxis dataKey="day" tick={{ fill: "currentColor", fontSize: 12 }} />
                  <YAxis tickFormatter={(value) => `$${value}`} tick={{ fill: "currentColor", fontSize: 12 }} />
                  <Tooltip formatter={tooltipCurrency} />
                  <Legend />
                  <Line dataKey="cycleProfit" name="Cycle profit" stroke="#5eead4" strokeWidth={2} />
                  <Line dataKey="maxSafeRequest" name="Safe max request" stroke="#60a5fa" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </article>
          <article className="rounded-3xl border border-[var(--border)] bg-black/10 p-4">
            <h3 className="text-lg font-semibold">Projected day bars</h3>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={simulation?.steps ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" />
                  <XAxis dataKey="day" tick={{ fill: "currentColor", fontSize: 12 }} />
                  <YAxis tickFormatter={(value) => `$${value}`} tick={{ fill: "currentColor", fontSize: 12 }} />
                  <Tooltip formatter={tooltipCurrency} />
                  <Bar dataKey="projectedProfit" fill="#fdb022" name="Projected day result" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
        </div>
      </section>

      <section className={`${surfaceClasses()} grid gap-5 xl:grid-cols-[1.1fr_1fr]`} id="settings">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">7. Settings + Rule Config</p>
          <h2 className="mt-2 text-2xl font-semibold">Admin-safe rule editing, snapshots, and reset controls</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Edit the rules JSON safely. Invalid rule changes never silently apply; the validator explains what is missing.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <input
              aria-label="Snapshot name"
              className="h-12 min-w-60 rounded-2xl border border-[var(--border)] bg-[var(--panel-strong)] px-4"
              disabled={disabled}
              placeholder="Snapshot name"
              value={snapshotName}
              onChange={(event) => setSnapshotName(event.target.value)}
            />
            <button
              className="inline-flex min-h-12 items-center rounded-full border border-[var(--border)] px-4 text-sm font-semibold"
              disabled={disabled}
              type="button"
              onClick={() => {
                store.saveSnapshot(snapshotName);
                setSnapshotName("");
              }}
            >
              Save snapshot
            </button>
            <button
              className="inline-flex min-h-12 items-center rounded-full border border-[var(--border)] px-4 text-sm font-semibold"
              disabled={disabled}
              type="button"
              onClick={() => store.resetAppState()}
            >
              Reset local inputs
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {store.snapshots.length > 0 ? (
              store.snapshots.map((snapshot) => (
                <div key={snapshot.id} className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-black/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{snapshot.name}</p>
                    <p className="text-sm text-[var(--muted)]">Saved {snapshot.savedAt}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="inline-flex min-h-11 items-center rounded-full border border-[var(--border)] px-4 text-sm font-semibold"
                      type="button"
                      onClick={() => store.loadSnapshot(snapshot.id)}
                    >
                      Load
                    </button>
                    <button
                      className="inline-flex min-h-11 items-center rounded-full border border-[var(--border)] px-4 text-sm font-semibold"
                      type="button"
                      onClick={() => store.deleteSnapshot(snapshot.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-[var(--muted)]">No saved snapshots yet.</p>
            )}
          </div>
        </div>

        <aside className="rounded-3xl border border-[var(--border)] bg-black/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">Rule config editor</h3>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClasses(parsedRules.success ? "PASS" : "FAIL")}`}>
              {parsedRules.success ? "Safe" : "Needs fix"}
            </span>
          </div>
          <textarea
            aria-label="Rule config JSON"
            className="mt-4 min-h-[26rem] w-full rounded-3xl border border-[var(--border)] bg-[var(--panel-strong)] p-4 font-mono text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            disabled={disabled}
            value={store.customRulesText}
            onChange={(event) => store.setCustomRulesText(event.target.value)}
          />
          <p className={`mt-3 text-sm leading-6 ${parsedRules.success ? "text-[var(--muted)]" : "text-[var(--danger)]"}`}>
            {parsedRules.success
              ? "The JSON is valid. Changes apply immediately across the dashboard while preserving inheritance and versioning."
              : parsedRules.error}
          </p>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Tip: keep base rules generic, then override only what changes at the account-type, size, or payout-tier layers.
          </p>
        </aside>
      </section>
    </main>
  );
}
