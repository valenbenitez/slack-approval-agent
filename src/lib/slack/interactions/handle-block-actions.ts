import { decodeApprovalButtonValue } from "@/lib/slack/approval-context";
import { openApprovalCommentModal } from "@/lib/slack/approval-modal";
import { finalizeApproval } from "@/lib/slack/interactions/finalize-approval";
import {
  actorFromUser,
  type SlackBlockActionsPayload,
} from "@/lib/slack/interactions/types";
import { buildResolvedSlackBlocks } from "@/lib/slack/post-approval-message";

export async function handleBlockActions(
  payload: SlackBlockActionsPayload,
): Promise<Response> {
  const action = payload.actions?.[0];
  const actionId = action?.action_id;
  const ctx = decodeApprovalButtonValue(action?.value);

  if (!ctx || !actionId) {
    console.error("[slack/interactions] missing action data", action);
    return new Response("Missing action data", { status: 400 });
  }

  if (
    actionId !== "human_approval_approve" &&
    actionId !== "human_approval_deny"
  ) {
    return new Response("", { status: 200 });
  }

  const approved = actionId === "human_approval_approve";
  const channelId = payload.channel?.id ?? payload.container?.channel_id;
  const messageTs = payload.message?.ts ?? payload.container?.message_ts;

  if (!payload.trigger_id) {
    console.error("[slack/interactions] missing trigger_id");
    return new Response("Missing trigger_id", { status: 400 });
  }

  const opened = await openApprovalCommentModal({
    triggerId: payload.trigger_id,
    meta: {
      ...ctx,
      approved,
      channelId,
      messageTs,
    },
  });

  if (!opened.ok) {
    // Fallback: resolve without comment if modal cannot open.
    const actorName = actorFromUser(payload.user);
    finalizeApproval({
      toolCallId: ctx.toolCallId,
      approved,
      actorName,
      approvalId: ctx.approvalId,
      summary: ctx.summary,
      reason: ctx.reason,
      channelId,
      messageTs,
    });
    return Response.json({
      replace_original: true,
      ...buildResolvedSlackBlocks({
        approved,
        actorName,
        approvalId: ctx.approvalId,
        summary: ctx.summary,
        reason: ctx.reason,
        toolCallId: ctx.toolCallId,
      }),
    });
  }

  return new Response("", { status: 200 });
}
