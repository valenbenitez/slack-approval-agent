import { getSlackConfig } from "@/lib/slack/env";

export type SlackApprovalMessageResult = {
  ok: boolean;
  channel?: string;
  ts?: string;
  skipped?: boolean;
  error?: string;
};

export async function postSlackApprovalMessage(input: {
  toolCallId: string;
  summary: string;
  reason: string;
}): Promise<SlackApprovalMessageResult> {
  "use step";

  const { botToken, channel, isConfigured } = getSlackConfig();
  if (!isConfigured || !botToken || !channel) {
    return { ok: true, skipped: true };
  }

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Aprobación humana requerida",
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Resumen*\n${input.summary}`,
        },
        {
          type: "mrkdwn",
          text: `*Motivo*\n${input.reason}`,
        },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Token: \`${input.toolCallId}\` · Timeout demo: 5 min`,
        },
      ],
    },
    {
      type: "actions",
      block_id: "human_approval_actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Approve", emoji: true },
          style: "primary",
          action_id: "human_approval_approve",
          value: input.toolCallId,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Deny", emoji: true },
          style: "danger",
          action_id: "human_approval_deny",
          value: input.toolCallId,
        },
      ],
    },
  ];

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel,
      text: `Aprobación requerida: ${input.summary}`,
      blocks,
    }),
  });

  const data = (await response.json()) as {
    ok: boolean;
    channel?: string;
    ts?: string;
    error?: string;
  };

  if (!data.ok) {
    return {
      ok: false,
      error: data.error ?? `Slack HTTP ${response.status}`,
    };
  }

  return {
    ok: true,
    channel: data.channel,
    ts: data.ts,
  };
}

export async function updateSlackApprovalMessage(input: {
  channel: string;
  ts: string;
  approved: boolean;
  actorName?: string;
  comment?: string;
}): Promise<void> {
  const { botToken } = getSlackConfig();
  if (!botToken) {
    return;
  }

  const statusText = input.approved ? "✅ Aprobado" : "❌ Denegado";
  const actor = input.actorName ? ` por ${input.actorName}` : "";
  const comment = input.comment ? `\nComentario: ${input.comment}` : "";

  await fetch("https://slack.com/api/chat.update", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: input.channel,
      ts: input.ts,
      text: `${statusText}${actor}${comment}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${statusText}*${actor}${comment}`,
          },
        },
      ],
    }),
  });
}
