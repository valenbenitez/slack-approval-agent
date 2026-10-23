import { tool } from "ai";
import { sleep } from "workflow";
import { z } from "zod";
import { postSlackApprovalMessage } from "@/lib/slack/post-approval-message";
import { humanApprovalHook } from "@/workflows/hooks/human-approval";

export const HIGH_VALUE_THRESHOLD_USD = 500;
export const HUMAN_APPROVAL_TIMEOUT = "5m";
/** Hard cap for demo tools — rejects absurd / injection-sized amounts. */
export const MAX_OPERATION_AMOUNT_USD = 10_000;
export const MAX_TEXT_FIELD_LENGTH = 500;

const amountSchema = z
  .number()
  .positive()
  .max(
    MAX_OPERATION_AMOUNT_USD,
    `El monto no puede superar USD ${MAX_OPERATION_AMOUNT_USD}`,
  );

const shortText = (label: string) =>
  z
    .string()
    .min(1, `${label} es obligatorio`)
    .max(
      MAX_TEXT_FIELD_LENGTH,
      `${label} no puede superar ${MAX_TEXT_FIELD_LENGTH} caracteres`,
    );

export type HumanApprovalResult = {
  status: "approved" | "denied" | "timed_out";
  summary: string;
  reason: string;
  approved: boolean;
  comment: string | null;
  slackPosted: boolean;
  message: string;
};

/**
 * Durable human approval (Slack). Must run in workflow context (not inside "use step").
 */
export async function awaitHumanApproval(options: {
  toolCallId: string;
  summary: string;
  reason: string;
}): Promise<HumanApprovalResult> {
  const { toolCallId, summary, reason } = options;

  using hook = humanApprovalHook.create({ token: toolCallId });

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

  const slackPosted = Boolean(slackPost.ok && !slackPost.skipped);

  if (decision.timedOut) {
    return {
      status: "timed_out",
      summary,
      reason,
      approved: false,
      comment: decision.comment,
      slackPosted,
      message:
        "La aprobación humana expiró tras 5 minutos. La operación no se ejecutó.",
    };
  }

  if (!decision.approved) {
    return {
      status: "denied",
      summary,
      reason,
      approved: false,
      comment: decision.comment ?? null,
      slackPosted,
      message: decision.comment
        ? `Aprobación denegada: ${decision.comment}`
        : "Aprobación denegada por un humano.",
    };
  }

  return {
    status: "approved",
    summary,
    reason,
    approved: true,
    comment: decision.comment ?? null,
    slackPosted,
    message: decision.comment
      ? `Aprobado: ${decision.comment}`
      : "Aprobado por un humano.",
  };
}

export const requestRefund = tool({
  description:
    "Solicita un refund/devolución mock. Siempre requiere aprobación humana en Slack antes de ejecutarse (no se puede saltear).",
  inputSchema: z.object({
    amount: amountSchema.describe("Monto a devolver en USD"),
    reason: shortText("Motivo").describe("Motivo del refund"),
    orderId: z
      .string()
      .max(MAX_TEXT_FIELD_LENGTH)
      .optional()
      .describe("ID de orden, si el usuario lo dio"),
  }),
  execute: async ({ amount, reason, orderId }, { toolCallId }) => {
    const summary = orderId
      ? `Refund de USD ${amount} para el pedido ${orderId}`
      : `Refund de USD ${amount}`;

    const approval = await awaitHumanApproval({
      toolCallId,
      summary: `${summary}, motivo: ${reason}`,
      reason:
        "Todo pedido de refund requiere aprobación humana antes de ejecutarse (política de devoluciones).",
    });

    if (!approval.approved) {
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

    const refundId = `ref_mock_${Date.now()}`;
    return {
      status: "mock_submitted" as const,
      approved: true as const,
      refundId,
      amount,
      reason,
      orderId: orderId ?? null,
      approval,
      message: `Refund mock registrado (${refundId}) por USD ${amount}.`,
    };
  },
});

export const executeHighValueAction = tool({
  description:
    "Ejecuta una operación mock (compras, transferencias, etc.). Si el monto es ≥ USD 500, exige aprobación humana en Slack antes de ejecutarse.",
  inputSchema: z.object({
    amount: amountSchema.describe("Monto de la operación en USD"),
    description: shortText("Descripción").describe("Qué se está ejecutando"),
  }),
  execute: async ({ amount, description }, { toolCallId }) => {
    const needsApproval = amount >= HIGH_VALUE_THRESHOLD_USD;

    if (needsApproval) {
      const approval = await awaitHumanApproval({
        toolCallId,
        summary: `Operación de USD ${amount}: ${description}`,
        reason: `Monto ≥ USD ${HIGH_VALUE_THRESHOLD_USD}; requiere aprobación humana.`,
      });

      if (!approval.approved) {
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
    "Pide aprobación humana en Slack para pedidos ambiguos o cuando hace falta un humano sin ejecutar aún otra tool. Refunds y alto valor ya aprueban solos dentro de request_refund / execute_high_value_action.",
  inputSchema: z.object({
    summary: shortText("Resumen").describe(
      "Resumen corto de lo que se quiere hacer",
    ),
    reason: shortText("Motivo").describe(
      "Por qué se necesita un humano (ambiguo, política, etc.)",
    ),
  }),
  execute: async ({ summary, reason }, { toolCallId }) => {
    return awaitHumanApproval({ toolCallId, summary, reason });
  },
});

export const agentTools = {
  request_refund: requestRefund,
  execute_high_value_action: executeHighValueAction,
  ask_human_approval: askHumanApproval,
};
