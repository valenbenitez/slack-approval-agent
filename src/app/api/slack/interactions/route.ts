import { handleBlockActions } from "@/lib/slack/interactions/handle-block-actions";
import { handleViewSubmission } from "@/lib/slack/interactions/handle-view-submission";
import type {
  SlackBlockActionsPayload,
  SlackViewSubmissionPayload,
} from "@/lib/slack/interactions/types";
import { verifyAndParseSlackInteraction } from "@/lib/slack/interactions/verify-and-parse";

export async function POST(request: Request) {
  const verified = await verifyAndParseSlackInteraction(request);
  if (!verified.ok) {
    return verified.response;
  }

  const { payload } = verified;

  if (payload.type === "block_actions") {
    return handleBlockActions(payload as SlackBlockActionsPayload);
  }

  if (payload.type === "view_submission") {
    return handleViewSubmission(payload as SlackViewSubmissionPayload);
  }

  return new Response("", { status: 200 });
}
