import Link from "next/link";

const formulas = [
  {
    title: "Consistency %",
    formula: "best_day_profit / current_cycle_total * 100",
    note: "Tradeify-style consistency flags outsized single-day gains relative to total cycle profit.",
  },
  {
    title: "Required cycle total",
    formula: "best_day_profit / (consistency_cap_percent / 100)",
    note: "This shows how much total profit is needed for the best day to sit under the active cap.",
  },
  {
    title: "Additional profit needed",
    formula: "max(0, required_cycle_total - current_cycle_total)",
    note: "Only positive deficits matter; once the value hits zero, the cycle passes consistency.",
  },
  {
    title: "Current buffer",
    formula: "current_balance - trailing_drawdown_line",
    note: "This is the breathing room available before touching the trailing drawdown line.",
  },
  {
    title: "Max safe request",
    formula: "current_balance - trailing_drawdown_line - desired_safety_cushion",
    note: "The calculator only recommends requests that preserve the selected safety cushion.",
  },
  {
    title: "Per-account daily target",
    formula: "desired_weekly_payout / split / account_count / trading_days",
    note: "The output is grossed up for the trader split so the take-home goal stays realistic.",
  },
];

export default function FormulasPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <header className="rounded-3xl border border-white/10 bg-[var(--panel)] p-6 shadow-lg shadow-black/10">
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">Formula transparency</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">
          Tradeify Payout &amp; Risk Utility Calculator formulas
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Every major calculator in the app exposes the same formulas shown below. The UI also explains
          each number in plain language so newer traders can understand the trade-offs behind each result.
        </p>
        <Link
          className="mt-4 inline-flex h-11 items-center rounded-full border border-[var(--border)] px-4 text-sm font-medium text-[var(--foreground)]"
          href="/"
        >
          Back to dashboard
        </Link>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {formulas.map((entry) => (
          <article
            className="rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-lg shadow-black/5"
            key={entry.title}
          >
            <h2 className="text-lg font-semibold">{entry.title}</h2>
            <pre className="mt-3 overflow-x-auto rounded-2xl bg-black/20 p-4 font-mono text-sm text-[var(--accent)]">
              {entry.formula}
            </pre>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{entry.note}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
