import { sleep } from "workflow";
import { emitAuditEvent } from "@/lib/audit/emit-audit-event";
import { getPolicyConfig } from "@/lib/policy/config";
import { postSlackApprovalMessage } from "@/lib/slack/post-approval-message";
import { humanApprovalHook } from "@/workflows/hooks/human-approval";

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

/**
 * Durable human approval (Slack). Must run in workflow context (not inside "use step").
 */
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
