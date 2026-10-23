import { tool } from "ai";
import { z } from "zod";
import { awaitHumanApproval } from "@/lib/agent/await-human-approval";
import {
  amountSchema,
  assertAmountWithinPolicy,
  assertTextWithinPolicy,
  shortText,
} from "@/lib/agent/tool-schemas";
import { emitAuditEvent } from "@/lib/audit/emit-audit-event";
import {
  getPolicyConfig,
  needsHighValueApproval,
  POLICY_DEFAULTS,
} from "@/lib/policy/config";

export const executeHighValueAction = tool({
  description: `Ejecuta una operación mock. Si el monto es ≥ POLICY_HIGH_VALUE_THRESHOLD_USD (default ${POLICY_DEFAULTS.highValueThresholdUsd}), exige aprobación en Slack.`,
  inputSchema: z.object({
    amount: amountSchema,
    description: shortText("Qué se está ejecutando"),
  }),
  execute: async ({ amount, description }, { toolCallId }) => {
    assertAmountWithinPolicy(amount);
    assertTextWithinPolicy("Descripción", description);

    const policy = getPolicyConfig();
    const needsApproval = needsHighValueApproval(amount);

    if (needsApproval) {
      const approval = await awaitHumanApproval({
        toolCallId,
        summary: `Operación de USD ${amount}: ${description}`,
        reason: `Monto ≥ USD ${policy.highValueThresholdUsd}; requiere aprobación humana.`,
        operation: "high_value",
        amountUsd: amount,
      });

      if (!approval.approved) {
        await emitAuditEvent({
          type: "operation_blocked",
          at: new Date().toISOString(),
          toolCallId,
          approvalId: approval.approvalId,
          operation: "high_value",
          summary: description,
          amountUsd: amount,
          decision: approval.status,
          actorName: approval.actorName,
          source:
            (approval.source as "slack" | "api" | "system" | null) ?? "system",
          message: approval.message,
        });

        return {
          status: approval.status,
          approved: false as const,
          amount,
          description,
          highValue: true as const,
          approval,
          message: approval.message,
        };
      }
    }

    const actionId = `act_mock_${Date.now()}`;
    await emitAuditEvent({
      type: "operation_executed",
      at: new Date().toISOString(),
      toolCallId,
      operation: "high_value",
      summary: description,
      amountUsd: amount,
      decision: needsApproval ? "approved" : "skipped_by_policy",
      resultId: actionId,
      source: needsApproval ? "system" : "policy",
      message: `Acción mock ${actionId}`,
    });

    return {
      status: "mock_executed" as const,
      approved: needsApproval ? (true as const) : undefined,
      actionId,
      amount,
      description,
      highValue: needsApproval,
      message: `Acción mock ejecutada (${actionId}): ${description} por USD ${amount}.`,
    };
  },
});
