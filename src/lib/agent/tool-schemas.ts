import { z } from "zod";
import { getPolicyConfig, POLICY_DEFAULTS } from "@/lib/policy/config";

/** @deprecated Prefer getPolicyConfig() / POLICY_DEFAULTS — kept for callers. */
export const HIGH_VALUE_THRESHOLD_USD = POLICY_DEFAULTS.highValueThresholdUsd;
export const HUMAN_APPROVAL_TIMEOUT = POLICY_DEFAULTS.humanApprovalTimeout;
export const MAX_OPERATION_AMOUNT_USD = POLICY_DEFAULTS.maxOperationAmountUsd;
export const MAX_TEXT_FIELD_LENGTH = POLICY_DEFAULTS.maxTextFieldLength;

export const amountSchema = z.number().positive().describe("Monto en USD");

export const shortText = (label: string) =>
  z.string().min(1, `${label} es obligatorio`).describe(label);

export function assertAmountWithinPolicy(amount: number) {
  const { maxOperationAmountUsd } = getPolicyConfig();
  if (amount > maxOperationAmountUsd) {
    throw new Error(
      `El monto no puede superar USD ${maxOperationAmountUsd} (política).`,
    );
  }
}

export function assertTextWithinPolicy(label: string, value: string) {
  const { maxTextFieldLength } = getPolicyConfig();
  if (value.length > maxTextFieldLength) {
    throw new Error(
      `${label} no puede superar ${maxTextFieldLength} caracteres (política).`,
    );
  }
}
