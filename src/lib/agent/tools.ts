import { tool } from "ai";
import { z } from "zod";

export const HIGH_VALUE_THRESHOLD_USD = 500;

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
    "Pide aprobación humana antes de refunds, operaciones ≥ USD 500, o pedidos ambiguos.",
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
  execute: async ({ summary, reason }) => {
    return {
      status: "not_implemented" as const,
      summary,
      reason,
      message:
        "HITL pendiente (Fase 2). Todavía no hay pausa durable ni aprobación en Slack.",
    };
  },
});

export const agentTools = {
  request_refund: requestRefund,
  execute_high_value_action: executeHighValueAction,
  ask_human_approval: askHumanApproval,
};