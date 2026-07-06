import {
  BufferProjection,
  ConsistencyProjection,
  DailyTargetProjection,
  EligibilityResult,
  LiveMetrics,
  PayoutProjection,
  ResolvedRuleSet,
  ScenarioSimulation,
} from "@/lib/models";
import { clampNumber, formatCurrency, formatPercent, parseProjectedDays, roundCurrency } from "@/lib/format";

function toneFromPass(pass: boolean, warning = false): "PASS" | "WARNING" | "FAIL" {
  if (pass) {
    return warning ? "WARNING" : "PASS";
  }

  return "FAIL";
}

export function calculateConsistency(
  currentCycleProfit: number,
  bestDayProfit: number,
  consistencyCapPercent: number,
): ConsistencyProjection {
  const normalizedCycleProfit = clampNumber(currentCycleProfit, 0);
  const consistencyPercent =
    normalizedCycleProfit > 0 ? (clampNumber(bestDayProfit, 0) / normalizedCycleProfit) * 100 : 100;
  const requiredCycleTotal =
    consistencyCapPercent > 0 ? clampNumber(bestDayProfit, 0) / (consistencyCapPercent / 100) : 0;
  const additionalProfitNeeded = Math.max(0, requiredCycleTotal - normalizedCycleProfit);
  const passes = consistencyPercent <= consistencyCapPercent || normalizedCycleProfit === 0;

  return {
    consistencyPercent: roundCurrency(consistencyPercent),
    consistencyCapPercent,
    passes,
    requiredCycleTotal: roundCurrency(requiredCycleTotal),
    additionalProfitNeeded: roundCurrency(additionalProfitNeeded),
    tone: toneFromPass(passes, additionalProfitNeeded > 0 && additionalProfitNeeded < 250),
    explanation: passes
      ? `Your best day is ${formatPercent(consistencyPercent)} of cycle profit, which is inside the ${formatPercent(consistencyCapPercent)} cap.`
      : `You need ${formatCurrency(additionalProfitNeeded)} more total cycle profit to bring the best day back under the ${formatPercent(consistencyCapPercent)} cap.`,
  };
}

export function calculateBuffer(
  currentBalance: number,
  trailingDrawdownLine: number,
  desiredSafetyCushion: number,
  requestedAmount = 0,
): BufferProjection {
  const currentBuffer = roundCurrency(currentBalance - trailingDrawdownLine);
  const maxSafeRequest = roundCurrency(
    Math.max(0, currentBalance - trailingDrawdownLine - desiredSafetyCushion),
  );
  const postRequestBuffer = roundCurrency(currentBuffer - requestedAmount);
  const dangerZone = postRequestBuffer < desiredSafetyCushion;
  const passes = requestedAmount <= maxSafeRequest;

  return {
    currentBuffer,
    maxSafeRequest,
    requestedAmount,
    postRequestBuffer,
    desiredSafetyCushion,
    dangerZone,
    tone: toneFromPass(passes, dangerZone),
    explanation: passes
      ? `After a ${formatCurrency(requestedAmount)} request, your projected cushion is ${formatCurrency(postRequestBuffer)}.`
      : `A ${formatCurrency(requestedAmount)} request would leave only ${formatCurrency(postRequestBuffer)} of buffer, below your ${formatCurrency(desiredSafetyCushion)} safety goal.`,
  };
}

export function calculatePayoutPlanner(
  metrics: LiveMetrics,
  rules: ResolvedRuleSet,
): PayoutProjection {
  const buffer = calculateBuffer(
    metrics.currentBalance,
    metrics.trailingDrawdownLine,
    metrics.desiredSafetyCushion,
    metrics.requestAmount,
  );
  const cycleCap = Math.max(0, metrics.currentCycleProfit);
  const payoutCap = rules.payoutCap ?? Number.POSITIVE_INFINITY;
  const maxRequest = roundCurrency(Math.max(0, Math.min(buffer.maxSafeRequest, payoutCap, cycleCap)));
  const minRequest = roundCurrency(rules.minRequest);

  const buildTier = (
    label: "Conservative" | "Balanced" | "Aggressive",
    multiplier: number,
  ) => {
    const amount = roundCurrency(
      maxRequest <= 0 ? 0 : Math.min(maxRequest, Math.max(minRequest, maxRequest * multiplier)),
    );
    return {
      label,
      amount,
      netTakeHome: roundCurrency(amount * (rules.payoutSplitPercent / 100)),
      tone: toneFromPass(amount <= maxRequest && amount > 0, label === "Aggressive" && amount === maxRequest),
      guidance:
        label === "Conservative"
          ? "Leaves the most room above drawdown and consistency pressure."
          : label === "Balanced"
            ? "A middle ground between buffer protection and payout speed."
            : "Maximizes the request size, but keeps the least breathing room.",
    };
  };

  const cadenceMessage =
    rules.cadence === "daily-eligible"
      ? "This account can request payouts daily once all other requirements pass."
      : rules.cadence === "no-minimum-day-count"
        ? "This account has no minimum day count; only profit, consistency, and safety checks remain."
        : `This account needs ${rules.qualifyingProfitableDays} qualifying profitable days before the request window opens.`;

  return {
    minRequest,
    maxRequest,
    payoutCap: Number.isFinite(payoutCap) ? payoutCap : null,
    netSplitPercent: rules.payoutSplitPercent,
    requestTiers: [buildTier("Conservative", 0.55), buildTier("Balanced", 0.75), buildTier("Aggressive", 1)],
    tone: toneFromPass(maxRequest >= minRequest && maxRequest > 0, maxRequest < minRequest && maxRequest > 0),
    cadenceMessage,
    explanation: `The planner limits the request to the smallest of cycle profit (${formatCurrency(cycleCap)}), payout cap (${rules.payoutCap ? formatCurrency(rules.payoutCap) : "no cap"}), and safe buffer (${formatCurrency(buffer.maxSafeRequest)}).`,
  };
}

export function calculateDailyTarget(
  desiredWeeklyPayout: number,
  numberOfAccounts: number,
  tradingDaysPerWeek: number,
  rules: ResolvedRuleSet,
): DailyTargetProjection {
  const safeAccounts = Math.max(1, numberOfAccounts);
  const safeDays = Math.max(1, tradingDaysPerWeek);
  const grossWeeklyTargetPerAccount = desiredWeeklyPayout / (rules.payoutSplitPercent / 100) / safeAccounts;
  const perAccountDailyTarget = roundCurrency(grossWeeklyTargetPerAccount / safeDays);
  const combinedDailyTarget = roundCurrency(perAccountDailyTarget * safeAccounts);
  const minimumQualifyingDailyTarget = roundCurrency(
    Math.max(rules.qualifyingDayProfit, rules.minRequest / safeDays),
  );

  return {
    desiredWeeklyPayout,
    numberOfAccounts: safeAccounts,
    tradingDaysPerWeek: safeDays,
    perAccountDailyTarget,
    combinedDailyTarget,
    minimumQualifyingDailyTarget,
    saferTargetBand: {
      low: roundCurrency(perAccountDailyTarget * 0.85),
      medium: perAccountDailyTarget,
      high: roundCurrency(perAccountDailyTarget * 1.15),
    },
    explanation: `To net ${formatCurrency(desiredWeeklyPayout)} at a ${formatPercent(rules.payoutSplitPercent)} split, each account needs about ${formatCurrency(perAccountDailyTarget)} per trading day over ${safeDays} days.`,
  };
}

export function calculateEligibility(
  metrics: LiveMetrics,
  rules: ResolvedRuleSet,
): EligibilityResult {
  const consistency = calculateConsistency(
    metrics.currentCycleProfit,
    metrics.bestDayProfit,
    rules.consistencyCapPercent,
  );
  const buffer = calculateBuffer(
    metrics.currentBalance,
    metrics.trailingDrawdownLine,
    metrics.desiredSafetyCushion,
    metrics.requestAmount,
  );
  const payoutPlanner = calculatePayoutPlanner(metrics, rules);

  const unmetRequirements = [] as EligibilityResult["unmetRequirements"];
  const warnings: string[] = [];

  if (metrics.totalProfit < rules.totalProfitMin) {
    const deficit = roundCurrency(rules.totalProfitMin - metrics.totalProfit);
    unmetRequirements.push({
      label: "Total profit minimum",
      deficit,
      unit: "currency",
      plainLanguage: `Need ${formatCurrency(deficit)} more total profit to reach ${formatCurrency(rules.totalProfitMin)}.`,
    });
  }

  if (rules.qualifyingProfitableDays > 0 && metrics.qualifyingDays < rules.qualifyingProfitableDays) {
    const deficit = rules.qualifyingProfitableDays - metrics.qualifyingDays;
    unmetRequirements.push({
      label: "Qualifying profitable days",
      deficit,
      unit: "days",
      plainLanguage: `Need ${deficit} more ${formatCurrency(rules.qualifyingDayProfit)}+ qualifying day${deficit === 1 ? "" : "s"}.`,
    });
  }

  if (!consistency.passes) {
    unmetRequirements.push({
      label: "Consistency cap",
      deficit: consistency.additionalProfitNeeded,
      unit: "currency",
      plainLanguage: `Need ${formatCurrency(consistency.additionalProfitNeeded)} more cycle profit to get under the ${formatPercent(rules.consistencyCapPercent)} cap.`,
    });
  }

  if (rules.requiresMicroscalpingFlag && !metrics.microscalpingCompliant) {
    unmetRequirements.push({
      label: "Microscalping compliance",
      deficit: 1,
      unit: "toggle",
      plainLanguage: "Toggle microscalping compliance on only if the account activity satisfies the rule set.",
    });
  }

  const cadenceEligible =
    rules.cadence === "no-minimum-day-count"
      ? true
      : rules.cadence === "daily-eligible"
        ? metrics.profitableDays >= 1
        : metrics.qualifyingDays >= rules.qualifyingProfitableDays;

  if (!cadenceEligible) {
    unmetRequirements.push({
      label: "Payout cadence",
      deficit: Math.max(1, rules.qualifyingProfitableDays - metrics.qualifyingDays),
      unit: "days",
      plainLanguage:
        rules.cadence === "daily-eligible"
          ? "Need at least one profitable day in the cycle before requesting."
          : `Need ${Math.max(0, rules.qualifyingProfitableDays - metrics.qualifyingDays)} more qualifying days to open the payout cadence window.`,
    });
  }

  if (buffer.dangerZone) {
    warnings.push("Your current request would leave the account inside the danger zone buffer.");
  }

  if (payoutPlanner.maxRequest < rules.minRequest) {
    warnings.push("Your safe request size is currently below the configured minimum request.");
  }

  const eligible = unmetRequirements.length === 0;

  return {
    eligible,
    tone: toneFromPass(eligible, warnings.length > 0),
    unmetRequirements,
    warnings,
    cadenceEligible,
    maxSafeRequest: payoutPlanner.maxRequest,
    plainLanguageSummary: eligible
      ? `You are payout-eligible right now, with up to ${formatCurrency(payoutPlanner.maxRequest)} available while respecting your current cushion target.`
      : `You are not payout-eligible yet. The largest remaining gap is ${unmetRequirements[0]?.plainLanguage ?? "an unresolved rule requirement"}.`,
  };
}

export function simulateCycle(
  metrics: LiveMetrics,
  rules: ResolvedRuleSet,
  projectedDaysText: string,
): ScenarioSimulation {
  const projectedDays = parseProjectedDays(projectedDaysText);
  const steps = [] as ScenarioSimulation["steps"];
  const rolling = { ...metrics };

  for (const [index, profit] of projectedDays.entries()) {
    rolling.currentBalance += profit;
    rolling.currentCycleProfit += profit;
    rolling.totalProfit += profit;
    rolling.bestDayProfit = Math.max(rolling.bestDayProfit, profit);

    if (profit > 0) {
      rolling.profitableDays += 1;
      if (profit >= rules.qualifyingDayProfit) {
        rolling.qualifyingDays += 1;
      }
    }

    const payout = calculatePayoutPlanner(rolling, rules);
    const eligibility = calculateEligibility(rolling, rules);
    const buffer = calculateBuffer(
      rolling.currentBalance,
      rolling.trailingDrawdownLine,
      rolling.desiredSafetyCushion,
      rolling.requestAmount,
    );

    steps.push({
      day: index + 1,
      projectedProfit: roundCurrency(profit),
      cycleProfit: roundCurrency(rolling.currentCycleProfit),
      bestDayProfit: roundCurrency(rolling.bestDayProfit),
      qualifyingDays: rolling.qualifyingDays,
      profitableDays: rolling.profitableDays,
      balance: roundCurrency(rolling.currentBalance),
      maxSafeRequest: payout.maxRequest,
      eligible: eligibility.eligible,
      buffer: buffer.currentBuffer,
    });
  }

  const totalProjected = projectedDays.reduce((total, value) => total + value, 0);
  const averageProjected = projectedDays.length > 0 ? totalProjected / projectedDays.length : 0;
  const fastPathConsistency = calculateConsistency(
    metrics.currentCycleProfit + totalProjected,
    Math.max(metrics.bestDayProfit, ...projectedDays, 0),
    rules.consistencyCapPercent,
  );
  const lowVarianceConsistency = calculateConsistency(
    metrics.currentCycleProfit + totalProjected,
    Math.max(metrics.bestDayProfit, averageProjected),
    rules.consistencyCapPercent,
  );

  const warnings: string[] = [];
  if (projectedDays.some((value) => value < 0)) {
    warnings.push("Negative simulated days can slow the payout path and shrink drawdown buffer.");
  }
  if (fastPathConsistency.additionalProfitNeeded > 0) {
    warnings.push("The fast path concentrates too much profit in one day for the active consistency cap.");
  }

  return {
    projectedDays,
    steps,
    fastPathSummary: `Fast path: front-load ${formatCurrency(Math.max(...projectedDays, 0))} days. Consistency lands at ${formatPercent(fastPathConsistency.consistencyPercent)} and ${fastPathConsistency.passes ? "still passes" : `needs ${formatCurrency(fastPathConsistency.additionalProfitNeeded)} more repair profit`}.`,
    lowVarianceSummary: `Low variance path: average about ${formatCurrency(averageProjected)} per day. Consistency lands at ${formatPercent(lowVarianceConsistency.consistencyPercent)} and ${lowVarianceConsistency.passes ? "stays compliant" : `still needs ${formatCurrency(lowVarianceConsistency.additionalProfitNeeded)} more total profit`}.`,
    warnings,
  };
}
