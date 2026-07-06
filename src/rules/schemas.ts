import { z } from "zod";

const cadenceRuleSchema = z.enum([
  "daily-eligible",
  "every-5-profitable-days",
  "no-minimum-day-count",
]);

export const ruleLayerSchema = z
  .object({
    totalProfitMin: z.number().nonnegative().optional(),
    minRequest: z.number().nonnegative().optional(),
    payoutCap: z.number().nonnegative().nullable().optional(),
    payoutSplitPercent: z.number().positive().max(100).optional(),
    consistencyCapPercent: z.number().positive().max(100).optional(),
    qualifyingProfitableDays: z.number().int().nonnegative().optional(),
    qualifyingDayProfit: z.number().nonnegative().optional(),
    cadence: cadenceRuleSchema.optional(),
    desiredSafetyCushionDefault: z.number().nonnegative().optional(),
    requiresMicroscalpingFlag: z.boolean().optional(),
    notes: z.array(z.string()).optional(),
  })
  .strict();

export const payoutTierRuleSchema = z
  .object({
    minPayoutNumber: z.number().int().positive(),
    maxPayoutNumber: z.number().int().positive().optional(),
    label: z.string().min(1),
    overrides: ruleLayerSchema,
    nextChangeHint: z.string().optional(),
  })
  .strict();

export const accountSizeRuleSchema = z
  .object({
    accountSize: z.enum(["25K", "50K", "100K", "150K"]),
    overrides: ruleLayerSchema.optional(),
    payoutNumberRules: z.array(payoutTierRuleSchema).optional(),
  })
  .strict();

export const accountTypeRuleSchema = z
  .object({
    accountType: z.enum(["Growth", "Select", "Lightning"]),
    overrides: ruleLayerSchema.optional(),
    sizes: z.array(accountSizeRuleSchema),
  })
  .strict();

export const ruleVersionSchema = z
  .object({
    versionId: z.string().min(1),
    label: z.string().min(1),
    effectiveFrom: z.string().min(1),
    updatedAt: z.string().min(1),
    notes: z.array(z.string()).default([]),
    futureUpdatePlaceholders: z.array(z.string()).optional(),
    baseRules: ruleLayerSchema,
    accountTypes: z.array(accountTypeRuleSchema),
  })
  .strict();

export const ruleSetSchema = z
  .object({
    rulesetId: z.string().min(1),
    label: z.string().min(1),
    lastUpdated: z.string().min(1),
    versions: z.array(ruleVersionSchema).min(1),
  })
  .strict();
