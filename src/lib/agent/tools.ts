import { tool } from "ai";
import { sleep } from "workflow";
import { z } from "zod";
import { postSlackApprovalMessage } from "@/lib/slack/post-approval-message";
import { humanApprovalHook } from "@/workflows/hooks/human-approval";

export const HIGH_VALUE_THRESHOLD_USD = 500;
export const HUMAN_APPROVAL_TIMEOUT = "5m";

export const requestRefund = tool({
  description:
    "Solicita un refund/devolución mock. Usar para cualquier pedido de reembolso.",
  inputSchema: z.object({
    amount: z.number().positive().describe("Monto a devolver en USD"),
    reason: z.string().min(1).describe("Motivo del refund"),
    orderId: z.string().optional().describe("ID de orden, si el usuario lo dio"),
  }),
  execute: async ({ amount, reason, orderId }) => {
    const refundId = `ref_mock_${Date.now()}`;
    return {
      status: "mock_submitted" as const,
      refundId,
      amount,
      reason,
      orderId: orderId ?? null,
      message: `Refund mock registrado (${refundId}) por USD ${amount}.`,
    };
  },
});

export const executeHighValueAction = tool({
  description:
    "Ejecuta una operación de alto valor mock (compras, transferencias, cambios costosos).",
  inputSchema: z.object({
    amount: z.number().positive().describe("Monto de la operación en USD"),
    description: z.string().min(1).describe("Qué se está ejecutando"),
  }),
  execute: async ({ amount, description }) => {
    const actionId = `act_mock_${Date.now()}`;
    return {
      status: "mock_executed" as const,
      actionId,
      amount,
      description,
      highValue: amount >= HIGH_VALUE_THRESHOLD_USD,
      message: `Acción mock ejecutada (${actionId}): ${description} por USD ${amount}.`,
    };
  },
});

export const askHumanApproval = tool({
  description:
    "Pide aprobación humana antes de refunds, operaciones ≥ USD 500, o pedidos ambiguos. Pausa el workflow hasta Approve/Deny (o timeout).",
  inputSchema: z.object({
    summary: z
      .string()
      .min(1)
      .describe("Resumen corto de lo que se quiere hacer"),
    reason: z
      .string()
      .min(1)
      .describe("Por qué se necesita un humano (refund, alto valor, ambiguo)"),
  }),
  execute: async ({ summary, reason }, { toolCallId }) => {
    // Hooks are workflow-level primitives — do not mark this execute with "use step".
    using hook = humanApprovalHook.create({ token: toolCallId });

    // Side effect (Slack API) runs as a durable step; UI approval still works without Slack.
    const slackPost = await postSlackApprovalMessage({
      toolCallId,
      summary,
      reason,
    });

    const decision = await Promise.race([
      hook.then((payload) => ({
        ...payload,
        timedOut: false as const,
      })),
      sleep(HUMAN_APPROVAL_TIMEOUT).then(() => ({
        approved: false as const,
        timedOut: true as const,
        comment: "Timeout de aprobación (5 minutos)",
      })),
    ]);

    if (decision.timedOut) {
      return {
        status: "timed_out" as const,
        summary,
        reason,
        approved: false,
        comment: decision.comment,
        slackPosted: Boolean(slackPost.ok && !slackPost.skipped),
        message:
          "La aprobación humana expiró tras 5 minutos. La operación no se ejecutó.",
      };
    }

    if (!decision.approved) {
      return {
        status: "denied" as const,
        summary,
        reason,
        approved: false,
        comment: decision.comment ?? null,
        slackPosted: Boolean(slackPost.ok && !slackPost.skipped),
        message: decision.comment
          ? `Aprobación denegada: ${decision.comment}`
          : "Aprobación denegada por un humano.",
      };
    }

    return {
      status: "approved" as const,
      summary,
      reason,
      approved: true,
      comment: decision.comment ?? null,
      slackPosted: Boolean(slackPost.ok && !slackPost.skipped),
      message: decision.comment
        ? `Aprobado: ${decision.comment}`
        : "Aprobado por un humano. Podés continuar con la operación.",
    };
  },
});

export const agentTools = {
  request_refund: requestRefund,
  execute_high_value_action: executeHighValueAction,
  ask_human_approval: askHumanApproval,
};
