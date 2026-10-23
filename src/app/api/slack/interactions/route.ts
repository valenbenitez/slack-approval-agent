import { getSlackConfig } from "@/lib/slack/env";
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

function buildResolvedMessage(options: {
  approved: boolean;
  actorName?: string;
}) {
  const statusText = options.approved ? "✅ Aprobado" : "❌ Denegado";
  const actor = options.actorName ? ` por ${options.actorName}` : "";
  const text = `${statusText}${actor}`;

  return {
    replace_original: true,
    text,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${statusText}*${actor}`,
        },
      },
    ],
  };
}

export async function POST(request: Request) {
  // Log immediately so a miss (no log at all) means Slack never hit this process.
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
  const toolCallId = action?.value;
  const actionId = action?.action_id;

  if (!toolCallId || !actionId) {
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

  console.log("[slack/interactions] resume", { toolCallId, approved, actorName });

  try {
    await humanApprovalHook.resume(toolCallId, { approved });
    console.log("[slack/interactions] hook resumed ok");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to resume approval hook";
    // Still continue so Slack UI updates; hook may already be resolved.
    console.error("[slack/interactions] resume failed:", message);
  }

  const resolved = buildResolvedMessage({ approved, actorName });

  // Prefer acknowledging with replace_original so buttons disappear immediately.
  // Also hit response_url as a fallback for older clients.
  if (payload.response_url) {
    void fetch(payload.response_url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(resolved),
    }).catch((error) => {
      console.error("[slack/interactions] response_url failed", error);
    });
  }

  return Response.json(resolved);
}
