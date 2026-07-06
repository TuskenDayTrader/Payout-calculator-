import {
  calculateBuffer,
  calculateConsistency,
  calculateDailyTarget,
  calculateEligibility,
  calculatePayoutPlanner,
  simulateCycle,
} from "@/lib/calculators";
import { defaultMetrics } from "@/store/tradeify-store";
import { getDefaultRulesCatalog, resolveRules } from "@/lib/rules";

const rules = resolveRules(
  { accountType: "Growth", accountSize: "50K", payoutNumber: 2 },
  getDefaultRulesCatalog(),
).resolvedRules!;

describe("calculator formulas", () => {
  it("computes consistency repair math", () => {
    const result = calculateConsistency(1600, 640, 30);

    expect(result.passes).toBe(false);
    expect(result.requiredCycleTotal).toBeCloseTo(2133.33, 2);
    expect(result.additionalProfitNeeded).toBeCloseTo(533.33, 2);
  });

  it("computes safe request buffer", () => {
    const result = calculateBuffer(53000, 51750, 900, 250);

    expect(result.currentBuffer).toBe(1250);
    expect(result.maxSafeRequest).toBe(350);
    expect(result.dangerZone).toBe(false);
  });

  it("caps payout requests using rule cap, cycle profit, and buffer", () => {
    const result = calculatePayoutPlanner(defaultMetrics, rules);

    expect(result.minRequest).toBe(500);
    expect(result.maxRequest).toBe(450);
    expect(result.tone).toBe("FAIL");
    expect(result.requestTiers).toHaveLength(3);
  });

  it("builds daily target projections", () => {
    const result = calculateDailyTarget(2000, 2, 5, rules);

    expect(result.perAccountDailyTarget).toBeGreaterThan(0);
    expect(result.minimumQualifyingDailyTarget).toBeGreaterThanOrEqual(200);
  });

  it("reports unmet requirements for ineligible accounts", () => {
    const result = calculateEligibility(
      {
        ...defaultMetrics,
        totalProfit: 600,
        qualifyingDays: 1,
        currentCycleProfit: 900,
        bestDayProfit: 500,
      },
      rules,
    );

    expect(result.eligible).toBe(false);
    expect(result.unmetRequirements.length).toBeGreaterThanOrEqual(2);
  });

  it("simulates projected days and recomputes eligibility", () => {
    const result = simulateCycle(defaultMetrics, rules, "250, 200, -100");

    expect(result.steps).toHaveLength(3);
    expect(result.fastPathSummary).toContain("Fast path");
  });
});
