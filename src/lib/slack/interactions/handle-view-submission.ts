import {
  extractModalComment,
  parseApprovalModalMetadata,
} from "@/lib/slack/approval-modal";
import { finalizeApproval } from "@/lib/slack/interactions/finalize-approval";
import {
  actorFromUser,
  type SlackViewSubmissionPayload,
} from "@/lib/slack/interactions/types";

export function handleViewSubmission(
  payload: SlackViewSubmissionPayload,
): Response {
  if (payload.view?.callback_id !== "human_approval_comment_modal") {
    return new Response("", { status: 200 });
  }

  const meta = parseApprovalModalMetadata(payload.view.private_metadata);
  if (!meta) {
    return Response.json({
      response_action: "errors",
      errors: {
        comment_block: "No se pudo leer el contexto de aprobación.",
      },
    });
  }

  const comment = extractModalComment(payload.view);
  const actorName = actorFromUser(payload.user);

  finalizeApproval({
    toolCallId: meta.toolCallId,
    approved: meta.approved,
    actorName,
    comment,
    approvalId: meta.approvalId,
    summary: meta.summary,
    reason: meta.reason,
    channelId: meta.channelId,
    messageTs: meta.messageTs,
  });

  // Closing the modal; message update happens via chat.update in after().
  return Response.json({ response_action: "clear" });
}
