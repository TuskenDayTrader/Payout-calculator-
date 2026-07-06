import seedRules from "@/rules/tradeify-rules.json";
import type {
  AccountProfile,
  AccountSizeRule,
  AccountTypeRule,
  PayoutTierRule,
  ResolvedRuleContext,
  ResolvedRuleSet,
  RuleLayer,
  RuleSet,
  RuleVersion,
} from "@/lib/models";
import { ruleSetSchema } from "@/rules/schemas";

const validatedSeedRules = ruleSetSchema.parse(seedRules) as RuleSet;

function mergeRuleLayers(...layers: Array<RuleLayer | undefined>): RuleLayer {
  return layers.reduce<RuleLayer>((merged, layer) => {
    if (!layer) {
      return merged;
    }

    return {
      ...merged,
      ...layer,
      notes: [...(merged.notes ?? []), ...(layer.notes ?? [])],
    };
  }, {});
}

function finalizeRuleSet(layer: RuleLayer): ResolvedRuleSet | null {
  const missing = [
    layer.totalProfitMin,
    layer.minRequest,
    layer.payoutSplitPercent,
    layer.consistencyCapPercent,
    layer.qualifyingProfitableDays,
    layer.qualifyingDayProfit,
    layer.cadence,
    layer.desiredSafetyCushionDefault,
    layer.requiresMicroscalpingFlag,
  ].some((value) => value === undefined);

  if (missing) {
    return null;
  }

  return {
    totalProfitMin: layer.totalProfitMin!,
    minRequest: layer.minRequest!,
    payoutCap: layer.payoutCap ?? null,
    payoutSplitPercent: layer.payoutSplitPercent!,
    consistencyCapPercent: layer.consistencyCapPercent!,
    qualifyingProfitableDays: layer.qualifyingProfitableDays!,
    qualifyingDayProfit: layer.qualifyingDayProfit!,
    cadence: layer.cadence!,
    desiredSafetyCushionDefault: layer.desiredSafetyCushionDefault!,
    requiresMicroscalpingFlag: layer.requiresMicroscalpingFlag!,
    notes: layer.notes ?? [],
  };
}

function findActiveTier(
  accountSizeRule: AccountSizeRule | undefined,
  payoutNumber: number,
): PayoutTierRule | undefined {
  return accountSizeRule?.payoutNumberRules?.find((rule) => {
    const max = rule.maxPayoutNumber ?? Number.POSITIVE_INFINITY;
    return payoutNumber >= rule.minPayoutNumber && payoutNumber <= max;
  });
}

function findNextTier(
  accountSizeRule: AccountSizeRule | undefined,
  payoutNumber: number,
): PayoutTierRule | undefined {
  return accountSizeRule?.payoutNumberRules?.find(
    (rule) => rule.minPayoutNumber === payoutNumber + 1,
  );
}

export function getDefaultRulesCatalog(): RuleSet {
  return validatedSeedRules;
}

export function getSortedVersions(catalog: RuleSet = validatedSeedRules): RuleVersion[] {
  return [...catalog.versions].sort((left, right) =>
    left.effectiveFrom.localeCompare(right.effectiveFrom),
  );
}

export function getRuleVersion(
  catalog: RuleSet,
  versionId?: string,
  effectiveDate = new Date().toISOString().slice(0, 10),
): RuleVersion {
  if (versionId) {
    const exactMatch = catalog.versions.find((version) => version.versionId === versionId);
    if (exactMatch) {
      return exactMatch;
    }
  }

  const sorted = getSortedVersions(catalog);
  const eligibleVersions = sorted.filter(
    (version) => version.effectiveFrom <= effectiveDate,
  );

  return eligibleVersions.at(-1) ?? sorted.at(-1) ?? catalog.versions[0];
}

export function safeParseRulesCatalog(
  rawRulesText: string,
): { success: true; data: RuleSet } | { success: false; error: string } {
  try {
    const parsed = JSON.parse(rawRulesText) as unknown;
    const validated = ruleSetSchema.parse(parsed) as RuleSet;
    return { success: true, data: validated };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "The custom rules JSON could not be parsed.",
    };
  }
}

export function resolveRules(
  profile: AccountProfile,
  catalog: RuleSet = validatedSeedRules,
  versionId?: string,
): ResolvedRuleContext {
  const version = getRuleVersion(catalog, versionId);
  const accountTypeRule = version.accountTypes.find(
    (candidate: AccountTypeRule) => candidate.accountType === profile.accountType,
  );
  const accountSizeRule = accountTypeRule?.sizes.find(
    (candidate: AccountSizeRule) => candidate.accountSize === profile.accountSize,
  );
  const payoutTierRule = findActiveTier(accountSizeRule, profile.payoutNumber);
  const nextPayoutTier = findNextTier(accountSizeRule, profile.payoutNumber);

  const missingRequirements: string[] = [];
  const appliedLayers = [
    `${version.label} (${version.versionId})`,
    "Base rules",
  ];

  if (!accountTypeRule) {
    missingRequirements.push(`Missing account type rules for ${profile.accountType}.`);
  } else {
    appliedLayers.push(`${profile.accountType} overrides`);
  }

  if (!accountSizeRule) {
    missingRequirements.push(
      `Missing account size rules for ${profile.accountType} ${profile.accountSize}.`,
    );
  } else {
    appliedLayers.push(`${profile.accountSize} overrides`);
  }

  if (profile.accountType === "Lightning" && !payoutTierRule) {
    missingRequirements.push(
      `Missing payout-tier rules for Lightning payout #${profile.payoutNumber}.`,
    );
  } else if (payoutTierRule) {
    appliedLayers.push(`${payoutTierRule.label} payout tier`);
  }

  const resolvedLayer = mergeRuleLayers(
    version.baseRules,
    accountTypeRule?.overrides,
    accountSizeRule?.overrides,
    payoutTierRule?.overrides,
  );
  const resolvedRules = finalizeRuleSet(resolvedLayer);

  if (!resolvedRules) {
    missingRequirements.push(
      "One or more required rule fields are missing after inheritance was applied.",
    );
  }

  return {
    version,
    resolvedRules,
    missingRequirements,
    appliedLayers,
    activePayoutTier: payoutTierRule,
    nextPayoutTier,
  };
}

export function stringifyDefaultRules(): string {
  return JSON.stringify(validatedSeedRules, null, 2);
}
