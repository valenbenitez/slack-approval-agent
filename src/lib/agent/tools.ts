import { tool } from "ai";
import { sleep } from "workflow";
import { z } from "zod";
import { emitAuditEvent } from "@/lib/audit/emit-audit-event";
import {
  getPolicyConfig,
  needsHighValueApproval,
  POLICY_DEFAULTS,
} from "@/lib/policy/config";
import { postSlackApprovalMessage } from "@/lib/slack/post-approval-message";
import { humanApprovalHook } from "@/workflows/hooks/human-approval";

export const HIGH_VALUE_THRESHOLD_USD = POLICY_DEFAULTS.highValueThresholdUsd;
export const HUMAN_APPROVAL_TIMEOUT = POLICY_DEFAULTS.humanApprovalTimeout;
export const MAX_OPERATION_AMOUNT_USD = POLICY_DEFAULTS.maxOperationAmountUsd;
export const MAX_TEXT_FIELD_LENGTH = POLICY_DEFAULTS.maxTextFieldLength;

const amountSchema = z.number().positive().describe("Monto en USD");

const shortText = (label: string) =>
  z.string().min(1, `${label} es obligatorio`).describe(label);

export type HumanApprovalResult = {
  status: "approved" | "denied" | "timed_out";
  summary: string;
  reason: string;
  approved: boolean;
  comment: string | null;
  actorName: string | null;
  source: string | null;
  slackPosted: boolean;
  approvalId?: string;
  message: string;
};

export async function awaitHumanApproval(options: {
  toolCallId: string;
  summary: string;
  reason: string;
  operation?: "refund" | "high_value" | "ambiguous" | "unknown";
  amountUsd?: number;
  orderId?: string | null;
}): Promise<HumanApprovalResult> {
  const policy = getPolicyConfig();
  const {
    toolCallId,
    summary,
    reason,
    operation = "unknown",
    amountUsd,
    orderId,
  } = options;

  using hook = humanApprovalHook.create({ token: toolCallId });

  const slackPost = await postSlackApprovalMessage({
    toolCallId,
    summary,
    reason,
  });

  await emitAuditEvent({
    type: "approval_requested",
    at: new Date().toISOString(),
    toolCallId,
    approvalId: slackPost.approvalId,
    operation,
    summary,
    reason,
    amountUsd,
    orderId: orderId ?? null,
    source: "system",
  });

  const decision = await Promise.race([
    hook.then((payload) => ({
      ...payload,
      timedOut: false as const,
    })),
    sleep(policy.humanApprovalTimeout).then(() => ({
      approved: false as const,
      timedOut: true as const,
      comment: "Timeout de aprobación (5 minutos)",
      actorName: undefined,
      source: "system" as const,
    })),
  ]);

  const slackPosted = Boolean(slackPost.ok && !slackPost.skipped);
  const status = decision.timedOut
    ? ("timed_out" as const)
    : decision.approved
      ? ("approved" as const)
      : ("denied" as const);

  const result: HumanApprovalResult = decision.timedOut
    ? {
        status,
        summary,
        reason,
        approved: false,
        comment: decision.comment,
        actorName: null,
        source: "system",
        slackPosted,
        approvalId: slackPost.approvalId,
        message:
          "La aprobación humana expiró tras 5 minutos. La operación no se ejecutó.",
      }
    : decision.approved
      ? {
          status,
          summary,
          reason,
          approved: true,
          comment: decision.comment ?? null,
          actorName: decision.actorName ?? null,
          source: decision.source ?? null,
          slackPosted,
          approvalId: slackPost.approvalId,
          message: decision.comment
            ? `Aprobado: ${decision.comment}`
            : "Aprobado por un humano.",
        }
      : {
          status,
          summary,
          reason,
          approved: false,
          comment: decision.comment ?? null,
          actorName: decision.actorName ?? null,
          source: decision.source ?? null,
          slackPosted,
          approvalId: slackPost.approvalId,
          message: decision.comment
            ? `Aprobación denegada: ${decision.comment}`
            : "Aprobación denegada por un humano.",
        };

  await emitAuditEvent({
    type: "approval_resolved",
    at: new Date().toISOString(),
    toolCallId,
    approvalId: slackPost.approvalId,
    operation,
    summary,
    reason,
    amountUsd,
    orderId: orderId ?? null,
    decision: status,
    actorName: result.actorName,
    source: (result.source as "slack" | "api" | "system" | null) ?? "system",
    message: result.message,
  });

  return result;
}

function assertAmountWithinPolicy(amount: number) {
  const { maxOperationAmountUsd } = getPolicyConfig();
  if (amount > maxOperationAmountUsd) {
    throw new Error(
      `El monto no puede superar USD ${maxOperationAmountUsd} (política).`,
    );
  }
}

function assertTextWithinPolicy(label: string, value: string) {
  const { maxTextFieldLength } = getPolicyConfig();
  if (value.length > maxTextFieldLength) {
    throw new Error(
      `${label} no puede superar ${maxTextFieldLength} caracteres (política).`,
    );
  }
}

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
          source: (approval.source as "slack" | "api" | "system" | null) ?? "system",
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
        message: "Refund sin HITL (POLICY_REFUND_ALWAYS_REQUIRES_APPROVAL=false).",
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
          source: (approval.source as "slack" | "api" | "system" | null) ?? "system",
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

export const askHumanApproval = tool({
  description:
    "Pide aprobación humana en Slack para pedidos ambiguos u otros casos sin ejecutar aún refund/alto valor.",
  inputSchema: z.object({
    summary: shortText("Resumen corto de lo que se quiere hacer"),
    reason: shortText("Por qué se necesita un humano"),
  }),
  execute: async ({ summary, reason }, { toolCallId }) => {
    assertTextWithinPolicy("Resumen", summary);
    assertTextWithinPolicy("Motivo", reason);
    return awaitHumanApproval({
      toolCallId,
      summary,
      reason,
      operation: "ambiguous",
    });
  },
});

export const agentTools = {
  request_refund: requestRefund,
  execute_high_value_action: executeHighValueAction,
  ask_human_approval: askHumanApproval,
};
