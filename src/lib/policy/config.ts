import { z } from "zod";

export const POLICY_DEFAULTS = {
  refundAlwaysRequiresApproval: true,
  highValueThresholdUsd: 500,
  maxOperationAmountUsd: 10_000,
  maxTextFieldLength: 500,
  humanApprovalTimeout: "5m" as const,
} as const;

function cleanEnv(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
  return cleaned || null;
}

function parseBoolean(value: string | null, fallback: boolean): boolean {
  if (value == null) return fallback;
  const normalized = value.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parsePositiveNumber(value: string | null, fallback: number): number {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const policySchema = z.object({
  refundAlwaysRequiresApproval: z.boolean(),
  highValueThresholdUsd: z.number().positive(),
  maxOperationAmountUsd: z.number().positive(),
  maxTextFieldLength: z.number().int().positive(),
  humanApprovalTimeout: z.union([
    z.literal("5m"),
    z.literal("1m"),
    z.literal("10m"),
    z.literal("30s"),
  ]),
});

export type AgentPolicyConfig = z.infer<typeof policySchema>;

const ALLOWED_TIMEOUTS = ["5m", "1m", "10m", "30s"] as const;
type AllowedTimeout = (typeof ALLOWED_TIMEOUTS)[number];

function parseTimeout(value: string | null): AllowedTimeout {
  if (value && (ALLOWED_TIMEOUTS as readonly string[]).includes(value)) {
    return value as AllowedTimeout;
  }
  return POLICY_DEFAULTS.humanApprovalTimeout;
}


export function getPolicyConfig(): AgentPolicyConfig {
  const parsed = policySchema.parse({
    refundAlwaysRequiresApproval: parseBoolean(
      cleanEnv(process.env.POLICY_REFUND_ALWAYS_REQUIRES_APPROVAL),
      POLICY_DEFAULTS.refundAlwaysRequiresApproval,
    ),
    highValueThresholdUsd: parsePositiveNumber(
      cleanEnv(process.env.POLICY_HIGH_VALUE_THRESHOLD_USD),
      POLICY_DEFAULTS.highValueThresholdUsd,
    ),
    maxOperationAmountUsd: parsePositiveNumber(
      cleanEnv(process.env.POLICY_MAX_OPERATION_AMOUNT_USD),
      POLICY_DEFAULTS.maxOperationAmountUsd,
    ),
    maxTextFieldLength: Math.floor(
      parsePositiveNumber(
        cleanEnv(process.env.POLICY_MAX_TEXT_FIELD_LENGTH),
        POLICY_DEFAULTS.maxTextFieldLength,
      ),
    ),
    humanApprovalTimeout: parseTimeout(
      cleanEnv(process.env.POLICY_HUMAN_APPROVAL_TIMEOUT),
    ),
  });

  return parsed;
}

export function needsHighValueApproval(amountUsd: number): boolean {
  return amountUsd >= getPolicyConfig().highValueThresholdUsd;
}
