import { after } from "next/server";
import { updateSlackApprovalMessage } from "@/lib/slack/post-approval-message";
import { humanApprovalHook } from "@/workflows/hooks/human-approval";

export type FinalizeApprovalInput = {
  toolCallId: string;
  approved: boolean;
  actorName?: string;
  comment?: string;
  approvalId: string;
  summary: string;
  reason: string;
  channelId?: string;
  messageTs?: string;
};

/**
 * Ack Slack quickly, then resume the workflow hook and update the original message.
 */
export function finalizeApproval(options: FinalizeApprovalInput) {
  after(async () => {
    try {
      await humanApprovalHook.resume(options.toolCallId, {
        approved: options.approved,
        comment: options.comment,
        actorName: options.actorName,
        source: "slack",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to resume approval hook";
      console.error("[slack/interactions] resume failed:", message);
    }

    if (options.channelId && options.messageTs) {
      try {
        await updateSlackApprovalMessage({
          channel: options.channelId,
          ts: options.messageTs,
          approved: options.approved,
          actorName: options.actorName,
          approvalId: options.approvalId,
          summary: options.summary,
          reason: options.reason,
          toolCallId: options.toolCallId,
          comment: options.comment,
        });
      } catch (error) {
        console.error("[slack/interactions] chat.update failed", error);
      }
    }
  });
}
