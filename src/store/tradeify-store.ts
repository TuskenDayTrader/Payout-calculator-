"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AccountProfile,
  LiveMetrics,
  RiskMode,
  SessionSnapshot,
  ThemeMode,
} from "@/lib/models";
import { DEMO_PROFILES } from "@/lib/demo-profiles";
import { stringifyDefaultRules } from "@/lib/rules";

export const defaultProfile: AccountProfile = {
  accountType: "Growth",
  accountSize: "50K",
  payoutNumber: 1,
  nickname: "Primary account",
};

export const defaultMetrics: LiveMetrics = {
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
};

export const defaultRuleText = stringifyDefaultRules();

export interface TradeifyStoreState {
  profile: AccountProfile;
  metrics: LiveMetrics;
  selectedRuleVersionId?: string;
  customRulesText: string;
  desiredWeeklyPayout: number;
  numberOfAccounts: number;
  tradingDaysPerWeek: number;
  projectedDaysText: string;
  theme: ThemeMode;
  explainLikeImNew: boolean;
  riskMode: RiskMode;
  readOnlySharedState: boolean;
  snapshots: SessionSnapshot[];
  updateProfile: (patch: Partial<AccountProfile>) => void;
  updateMetrics: (patch: Partial<LiveMetrics>) => void;
  setSelectedRuleVersionId: (value?: string) => void;
  setCustomRulesText: (value: string) => void;
  setDesiredWeeklyPayout: (value: number) => void;
  setNumberOfAccounts: (value: number) => void;
  setTradingDaysPerWeek: (value: number) => void;
  setProjectedDaysText: (value: string) => void;
  setTheme: (value: ThemeMode) => void;
  setExplainLikeImNew: (value: boolean) => void;
  setRiskMode: (value: RiskMode) => void;
  setReadOnlySharedState: (value: boolean) => void;
  applyRiskMode: (value: RiskMode) => void;
  applyDemoProfile: (profileId: string) => void;
  saveSnapshot: (name: string) => void;
  loadSnapshot: (snapshotId: string) => void;
  deleteSnapshot: (snapshotId: string) => void;
  hydrateFromSharedState: (snapshot: Partial<SessionSnapshot>) => void;
  resetAppState: () => void;
}

export const useTradeifyStore = create<TradeifyStoreState>()(
  persist(
    (set, get) => ({
      profile: defaultProfile,
      metrics: defaultMetrics,
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
      updateProfile: (patch) => set((state) => ({ profile: { ...state.profile, ...patch } })),
      updateMetrics: (patch) => set((state) => ({ metrics: { ...state.metrics, ...patch } })),
      setSelectedRuleVersionId: (value) => set({ selectedRuleVersionId: value }),
      setCustomRulesText: (value) => set({ customRulesText: value }),
      setDesiredWeeklyPayout: (value) => set({ desiredWeeklyPayout: value }),
      setNumberOfAccounts: (value) => set({ numberOfAccounts: value }),
      setTradingDaysPerWeek: (value) => set({ tradingDaysPerWeek: value }),
      setProjectedDaysText: (value) => set({ projectedDaysText: value }),
      setTheme: (value) => set({ theme: value }),
      setExplainLikeImNew: (value) => set({ explainLikeImNew: value }),
      setRiskMode: (value) => set({ riskMode: value }),
      setReadOnlySharedState: (value) => set({ readOnlySharedState: value }),
      applyRiskMode: (value) => {
        const cushionMap = {
          Survival: 1400,
          Balanced: 950,
          Growth: 600,
        } as const;
        set((state) => ({
          riskMode: value,
          metrics: {
            ...state.metrics,
            desiredSafetyCushion: cushionMap[value],
            requestAmount:
              value === "Survival"
                ? Math.min(state.metrics.requestAmount, 500)
                : value === "Balanced"
                  ? Math.max(state.metrics.requestAmount, 750)
                  : Math.max(state.metrics.requestAmount, 1000),
          },
        }));
      },
      applyDemoProfile: (profileId) => {
        const demo = DEMO_PROFILES.find((candidate) => candidate.id === profileId);
        if (!demo) {
          return;
        }

        set({
          profile: demo.profile,
          metrics: demo.metrics,
          readOnlySharedState: false,
        });
      },
      saveSnapshot: (name) => {
        const trimmedName = name.trim();
        if (!trimmedName) {
          return;
        }

        const state = get();
        const snapshot: SessionSnapshot = {
          id: `${Date.now()}`,
          name: trimmedName,
          savedAt: new Date().toISOString(),
          profile: state.profile,
          metrics: state.metrics,
          selectedRuleVersionId: state.selectedRuleVersionId,
          projectedDaysText: state.projectedDaysText,
          desiredWeeklyPayout: state.desiredWeeklyPayout,
          numberOfAccounts: state.numberOfAccounts,
          tradingDaysPerWeek: state.tradingDaysPerWeek,
          theme: state.theme,
          explainLikeImNew: state.explainLikeImNew,
          riskMode: state.riskMode,
          customRulesText: state.customRulesText,
        };

        set((current) => ({ snapshots: [snapshot, ...current.snapshots].slice(0, 8) }));
      },
      loadSnapshot: (snapshotId) => {
        const snapshot = get().snapshots.find((entry) => entry.id === snapshotId);
        if (!snapshot) {
          return;
        }

        set({
          profile: snapshot.profile,
          metrics: snapshot.metrics,
          selectedRuleVersionId: snapshot.selectedRuleVersionId,
          projectedDaysText: snapshot.projectedDaysText,
          desiredWeeklyPayout: snapshot.desiredWeeklyPayout,
          numberOfAccounts: snapshot.numberOfAccounts,
          tradingDaysPerWeek: snapshot.tradingDaysPerWeek,
          theme: snapshot.theme,
          explainLikeImNew: snapshot.explainLikeImNew,
          riskMode: snapshot.riskMode,
          customRulesText: snapshot.customRulesText,
          readOnlySharedState: false,
        });
      },
      deleteSnapshot: (snapshotId) =>
        set((state) => ({
          snapshots: state.snapshots.filter((snapshot) => snapshot.id !== snapshotId),
        })),
      hydrateFromSharedState: (snapshot) =>
        set((state) => ({
          profile: snapshot.profile ?? state.profile,
          metrics: snapshot.metrics ?? state.metrics,
          selectedRuleVersionId: snapshot.selectedRuleVersionId ?? state.selectedRuleVersionId,
          projectedDaysText: snapshot.projectedDaysText ?? state.projectedDaysText,
          desiredWeeklyPayout: snapshot.desiredWeeklyPayout ?? state.desiredWeeklyPayout,
          numberOfAccounts: snapshot.numberOfAccounts ?? state.numberOfAccounts,
          tradingDaysPerWeek: snapshot.tradingDaysPerWeek ?? state.tradingDaysPerWeek,
          theme: snapshot.theme ?? state.theme,
          explainLikeImNew: snapshot.explainLikeImNew ?? state.explainLikeImNew,
          riskMode: snapshot.riskMode ?? state.riskMode,
          customRulesText: snapshot.customRulesText ?? state.customRulesText,
          readOnlySharedState: true,
        })),
      resetAppState: () =>
        set({
          profile: defaultProfile,
          metrics: defaultMetrics,
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
        }),
    }),
    {
      name: "tradeify-calculator-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        profile: state.profile,
        metrics: state.metrics,
        selectedRuleVersionId: state.selectedRuleVersionId,
        customRulesText: state.customRulesText,
        desiredWeeklyPayout: state.desiredWeeklyPayout,
        numberOfAccounts: state.numberOfAccounts,
        tradingDaysPerWeek: state.tradingDaysPerWeek,
        projectedDaysText: state.projectedDaysText,
        theme: state.theme,
        explainLikeImNew: state.explainLikeImNew,
        riskMode: state.riskMode,
        snapshots: state.snapshots,
      }),
    },
  ),
);
