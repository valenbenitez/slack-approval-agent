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
import { getPolicyConfig } from "@/lib/policy/config";

export const requestRefund = tool({
  description:
    "Solicita un refund/devolución mock. Por política suele requerir aprobación humana en Slack (POLICY_REFUND_ALWAYS_REQUIRES_APPROVAL).",
  inputSchema: z.object({
    amount: amountSchema,
    reason: shortText("Motivo del refund"),
    orderId: z.string().optional().describe("ID de orden, si el usuario lo dio"),
  }),
  execute: async ({ amount, reason, orderId }, { toolCallId }) => {
    assertAmountWithinPolicy(amount);
    assertTextWithinPolicy("Motivo", reason);
    if (orderId) assertTextWithinPolicy("orderId", orderId);

    const policy = getPolicyConfig();
    const summary = orderId
      ? `Refund de USD ${amount} para el pedido ${orderId}`
      : `Refund de USD ${amount}`;

    if (policy.refundAlwaysRequiresApproval) {
      const approval = await awaitHumanApproval({
        toolCallId,
        summary: `${summary}, motivo: ${reason}`,
        reason:
          "Todo pedido de refund requiere aprobación humana antes de ejecutarse (política de devoluciones).",
        operation: "refund",
        amountUsd: amount,
        orderId: orderId ?? null,
      });

      if (!approval.approved) {
        await emitAuditEvent({
          type: "operation_blocked",
          at: new Date().toISOString(),
          toolCallId,
          approvalId: approval.approvalId,
          operation: "refund",
          summary,
          reason,
          amountUsd: amount,
          orderId: orderId ?? null,
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
          reason,
          orderId: orderId ?? null,
          approval,
          message: approval.message,
        };
      }
    } else {
      await emitAuditEvent({
        type: "approval_resolved",
        at: new Date().toISOString(),
        toolCallId,
        operation: "refund",
        summary,
        reason,
        amountUsd: amount,
        orderId: orderId ?? null,
        decision: "skipped_by_policy",
        source: "policy",
        message:
          "Refund sin HITL (POLICY_REFUND_ALWAYS_REQUIRES_APPROVAL=false).",
      });
    }

    const refundId = `ref_mock_${Date.now()}`;
    await emitAuditEvent({
      type: "operation_executed",
      at: new Date().toISOString(),
      toolCallId,
      operation: "refund",
      summary,
      reason,
      amountUsd: amount,
      orderId: orderId ?? null,
      decision: "approved",
      resultId: refundId,
      source: "system",
      message: `Refund mock ${refundId}`,
    });

    return {
      status: "mock_submitted" as const,
      approved: true as const,
      refundId,
      amount,
      reason,
      orderId: orderId ?? null,
      message: `Refund mock registrado (${refundId}) por USD ${amount}.`,
    };
  },
});
