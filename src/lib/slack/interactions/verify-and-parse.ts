import { getSlackConfig } from "@/lib/slack/env";
import type { SlackInteractionPayload } from "@/lib/slack/interactions/types";
import { verifySlackSignature } from "@/lib/slack/verify-signature";

export type VerifiedSlackInteraction =
  | { ok: true; payload: SlackInteractionPayload }
  | { ok: false; response: Response };

/**
 * Shared entry: log hit, verify Slack signature, parse interaction payload.
 */
export async function verifyAndParseSlackInteraction(
  request: Request,
): Promise<VerifiedSlackInteraction> {

  const rawBody = await request.text();
  const { signingSecret } = getSlackConfig();

  if (!signingSecret) {
    console.error("[slack/interactions] SLACK_SIGNING_SECRET missing");
    return {
      ok: false,
      response: new Response("Slack signing secret not configured", {
        status: 500,
      }),
    };
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
    return {
      ok: false,
      response: new Response("Invalid signature", { status: 401 }),
    };
  }

  const params = new URLSearchParams(rawBody);
  const payloadRaw = params.get("payload");
  if (!payloadRaw) {
    return {
      ok: false,
      response: new Response("Missing payload", { status: 400 }),
    };
  }

  const payload = JSON.parse(payloadRaw) as SlackInteractionPayload;
  return { ok: true, payload };
}
