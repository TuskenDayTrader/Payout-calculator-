export type AccountType = "Growth" | "Select" | "Lightning";
export type AccountSize = "25K" | "50K" | "100K" | "150K";
export type RiskMode = "Survival" | "Balanced" | "Growth";
export type ThemeMode = "light" | "dark";
export type CadenceRule =
  | "daily-eligible"
  | "every-5-profitable-days"
  | "no-minimum-day-count";
export type StatusTone = "PASS" | "WARNING" | "FAIL";

export interface AccountProfile {
  accountType: AccountType;
  accountSize: AccountSize;
  payoutNumber: number;
  rulesVersionId?: string;
  nickname?: string;
}

export interface RuleLayer {
  totalProfitMin?: number;
  minRequest?: number;
  payoutCap?: number | null;
  payoutSplitPercent?: number;
  consistencyCapPercent?: number;
  qualifyingProfitableDays?: number;
  qualifyingDayProfit?: number;
  cadence?: CadenceRule;
  desiredSafetyCushionDefault?: number;
  requiresMicroscalpingFlag?: boolean;
  notes?: string[];
}

export interface PayoutTierRule {
  minPayoutNumber: number;
  maxPayoutNumber?: number;
  label: string;
  overrides: RuleLayer;
  nextChangeHint?: string;
}

export interface AccountSizeRule {
  accountSize: AccountSize;
  overrides?: RuleLayer;
  payoutNumberRules?: PayoutTierRule[];
}

export interface AccountTypeRule {
  accountType: AccountType;
  overrides?: RuleLayer;
  sizes: AccountSizeRule[];
}

export interface RuleVersion {
  versionId: string;
  label: string;
  effectiveFrom: string;
  updatedAt: string;
  notes: string[];
  futureUpdatePlaceholders?: string[];
  baseRules: RuleLayer;
  accountTypes: AccountTypeRule[];
}

export interface RuleSet {
  rulesetId: string;
  label: string;
  lastUpdated: string;
  versions: RuleVersion[];
}

export interface ResolvedRuleSet {
  totalProfitMin: number;
  minRequest: number;
  payoutCap: number | null;
  payoutSplitPercent: number;
  consistencyCapPercent: number;
  qualifyingProfitableDays: number;
  qualifyingDayProfit: number;
  cadence: CadenceRule;
  desiredSafetyCushionDefault: number;
  requiresMicroscalpingFlag: boolean;
  notes: string[];
}

export interface ResolvedRuleContext {
  version: RuleVersion;
  resolvedRules: ResolvedRuleSet | null;
  missingRequirements: string[];
  appliedLayers: string[];
  activePayoutTier?: PayoutTierRule;
  nextPayoutTier?: PayoutTierRule;
}

export interface LiveMetrics {
  currentBalance: number;
  trailingDrawdownLine: number;
  currentCycleProfit: number;
  bestDayProfit: number;
  profitableDays: number;
  qualifyingDays: number;
  totalProfit: number;
  desiredSafetyCushion: number;
  requestAmount: number;
  microscalpingCompliant: boolean;
}

export interface RequirementDeficit {
  label: string;
  deficit: number;
  unit: "currency" | "days" | "percent" | "toggle";
  plainLanguage: string;
}

export interface ConsistencyProjection {
  consistencyPercent: number;
  consistencyCapPercent: number;
  passes: boolean;
  requiredCycleTotal: number;
  additionalProfitNeeded: number;
  tone: StatusTone;
  explanation: string;
}

export interface BufferProjection {
  currentBuffer: number;
  maxSafeRequest: number;
  requestedAmount: number;
  postRequestBuffer: number;
  desiredSafetyCushion: number;
  dangerZone: boolean;
  tone: StatusTone;
  explanation: string;
}

export interface RequestTier {
  label: "Conservative" | "Balanced" | "Aggressive";
  amount: number;
  netTakeHome: number;
  tone: StatusTone;
  guidance: string;
}

export interface PayoutProjection {
  minRequest: number;
  maxRequest: number;
  payoutCap: number | null;
  netSplitPercent: number;
  requestTiers: RequestTier[];
  tone: StatusTone;
  cadenceMessage: string;
  explanation: string;
}

export interface DailyTargetProjection {
  desiredWeeklyPayout: number;
  numberOfAccounts: number;
  tradingDaysPerWeek: number;
  perAccountDailyTarget: number;
  combinedDailyTarget: number;
  minimumQualifyingDailyTarget: number;
  saferTargetBand: {
    low: number;
    medium: number;
    high: number;
  };
  explanation: string;
}

export interface EligibilityResult {
  eligible: boolean;
  tone: StatusTone;
  unmetRequirements: RequirementDeficit[];
  warnings: string[];
  cadenceEligible: boolean;
  maxSafeRequest: number;
  plainLanguageSummary: string;
}

export interface SimulatorStep {
  day: number;
  projectedProfit: number;
  cycleProfit: number;
  bestDayProfit: number;
  qualifyingDays: number;
  profitableDays: number;
  balance: number;
  maxSafeRequest: number;
  eligible: boolean;
  buffer: number;
}

export interface ScenarioSimulation {
  projectedDays: number[];
  steps: SimulatorStep[];
  fastPathSummary: string;
  lowVarianceSummary: string;
  warnings: string[];
}

export interface DemoProfile {
  id: string;
  label: string;
  description: string;
  profile: AccountProfile;
  metrics: LiveMetrics;
}

export interface SessionSnapshot {
  id: string;
  name: string;
  savedAt: string;
  profile: AccountProfile;
  metrics: LiveMetrics;
  selectedRuleVersionId?: string;
  projectedDaysText: string;
  desiredWeeklyPayout: number;
  numberOfAccounts: number;
  tradingDaysPerWeek: number;
  theme: ThemeMode;
  explainLikeImNew: boolean;
  riskMode: RiskMode;
  customRulesText: string;
}
