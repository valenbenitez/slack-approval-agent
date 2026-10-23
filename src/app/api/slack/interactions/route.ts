import { after } from "next/server";
import { decodeApprovalButtonValue } from "@/lib/slack/approval-context";
import { getSlackConfig } from "@/lib/slack/env";
import {
  buildResolvedSlackBlocks,
  updateSlackApprovalMessage,
} from "@/lib/slack/post-approval-message";
import { verifySlackSignature } from "@/lib/slack/verify-signature";
import { humanApprovalHook } from "@/workflows/hooks/human-approval";

type SlackBlockActionsPayload = {
  type: string;
  user?: { id?: string; name?: string; username?: string; real_name?: string };
  channel?: { id?: string };
  container?: { channel_id?: string; message_ts?: string };
  message?: { ts?: string };
  response_url?: string;
  actions?: Array<{
    action_id?: string;
    value?: string;
  }>;
};

export async function POST(request: Request) {
  console.log("[slack/interactions] hit", {
    contentType: request.headers.get("content-type"),
    hasSignature: Boolean(request.headers.get("x-slack-signature")),
    hasTimestamp: Boolean(request.headers.get("x-slack-request-timestamp")),
  });

  const rawBody = await request.text();
  const { signingSecret } = getSlackConfig();

  if (!signingSecret) {
    console.error("[slack/interactions] SLACK_SIGNING_SECRET missing");
    return new Response("Slack signing secret not configured", { status: 500 });
  }

  const signature = request.headers.get("x-slack-signature");
  const timestamp = request.headers.get("x-slack-request-timestamp");
  const verified = verifySlackSignature({
    signingSecret,
    signature,
    timestamp,
    rawBody,
  });

  if (!verified.ok) {
    console.error("[slack/interactions] invalid signature", {
      reason: verified.reason,
      hasSignature: Boolean(signature),
      hasTimestamp: Boolean(timestamp),
      bodyLength: rawBody.length,
      contentType: request.headers.get("content-type"),
      signingSecretLength: signingSecret.length,
    });
    return new Response("Invalid signature", { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const payloadRaw = params.get("payload");
  if (!payloadRaw) {
    return new Response("Missing payload", { status: 400 });
  }

  const payload = JSON.parse(payloadRaw) as SlackBlockActionsPayload;
  console.log("[slack/interactions] type=", payload.type);

  if (payload.type !== "block_actions") {
    return new Response("", { status: 200 });
  }

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
  const actorName =
    payload.user?.real_name ||
    payload.user?.name ||
    payload.user?.username ||
    payload.user?.id;

  console.log("[slack/interactions] resume scheduled", {
    toolCallId: ctx.toolCallId,
    approvalId: ctx.approvalId,
    approved,
    actorName,
  });

  const resolvedBody = {
    replace_original: true,
    ...buildResolvedSlackBlocks({
      approved,
      actorName,
      approvalId: ctx.approvalId,
      summary: ctx.summary,
      reason: ctx.reason,
      toolCallId: ctx.toolCallId,
    }),
  };

  after(async () => {
    try {
      await humanApprovalHook.resume(ctx.toolCallId, {
        approved,
        actorName,
        source: "slack",
      });
      console.log("[slack/interactions] hook resumed ok");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to resume approval hook";
      console.error("[slack/interactions] resume failed:", message);
    }

    const channelId = payload.channel?.id ?? payload.container?.channel_id;
    const messageTs = payload.message?.ts ?? payload.container?.message_ts;
    if (channelId && messageTs) {
      try {
        await updateSlackApprovalMessage({
          channel: channelId,
          ts: messageTs,
          approved,
          actorName,
          approvalId: ctx.approvalId,
          summary: ctx.summary,
          reason: ctx.reason,
          toolCallId: ctx.toolCallId,
        });
      } catch (error) {
        console.error("[slack/interactions] chat.update failed", error);
      }
    }
  });

  return Response.json(resolvedBody);
}
