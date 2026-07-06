import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TradeifyCalculatorApp } from "@/components/tradeify-calculator-app";
import { defaultRuleText, useTradeifyStore } from "@/store/tradeify-store";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  Line: () => null,
  Bar: () => null,
}));

describe("TradeifyCalculatorApp", () => {
  beforeEach(() => {
    useTradeifyStore.setState({
      profile: {
        accountType: "Growth",
        accountSize: "50K",
        payoutNumber: 1,
        nickname: "Primary account",
      },
      metrics: {
        currentBalance: 51750,
        trailingDrawdownLine: 50500,
        currentCycleProfit: 1350,
        bestDayProfit: 420,
        profitableDays: 4,
        qualifyingDays: 3,
        totalProfit: 1350,
        desiredSafetyCushion: 800,
        requestAmount: 500,
        microscalpingCompliant: true,
      },
      selectedRuleVersionId: undefined,
      customRulesText: defaultRuleText,
      desiredWeeklyPayout: 2000,
      numberOfAccounts: 2,
      tradingDaysPerWeek: 5,
      projectedDaysText: "300, 250, 225, 180, 160",
      theme: "dark",
      explainLikeImNew: true,
      riskMode: "Balanced",
      readOnlySharedState: false,
      snapshots: [],
    });
  });

  it("loads a demo profile and exposes Lightning payout details", async () => {
    const user = userEvent.setup();
    render(<TradeifyCalculatorApp />);

    await user.click(screen.getByRole("button", { name: /Lightning \/ First Payout/i }));

    expect(screen.getByText(/Payout cap for this payout #/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("1")).toBeInTheDocument();
  });
});
