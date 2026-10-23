import { getSlackConfig } from "@/lib/slack/env";
import {
  createApprovalId,
  encodeApprovalButtonValue,
} from "@/lib/slack/approval-context";

export type SlackApprovalMessageResult = {
  ok: boolean;
  channel?: string;
  ts?: string;
  approvalId?: string;
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

  const approvalId = createApprovalId();
  const buttonValue = encodeApprovalButtonValue({
    toolCallId: input.toolCallId,
    approvalId,
    summary: input.summary,
    reason: input.reason,
  });

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
          text: `*ID*\n\`${approvalId}\``,
        },
        {
          type: "mrkdwn",
          text: `*Estado*\nPendiente`,
        },
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
          value: buttonValue,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Deny", emoji: true },
          style: "danger",
          action_id: "human_approval_deny",
          value: buttonValue,
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
      text: `Aprobación requerida (${approvalId}): ${input.summary}`,
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
      approvalId,
      error: data.error ?? `Slack HTTP ${response.status}`,
    };
  }

  return {
    ok: true,
    approvalId,
    channel: data.channel,
    ts: data.ts,
  };
}

export function buildResolvedSlackBlocks(input: {
  approved: boolean;
  actorName?: string;
  approvalId: string;
  summary: string;
  reason: string;
  toolCallId: string;
}) {
  const decision = input.approved ? "✅ Aprobado" : "❌ Denegado";
  const actor = input.actorName ? ` por ${input.actorName}` : "";

  return {
    text: `${decision}${actor} · ${input.approvalId}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Aprobación resuelta",
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*ID*\n\`${input.approvalId}\``,
          },
          {
            type: "mrkdwn",
            text: `*Decisión*\n${decision}${actor}`,
          },
          {
            type: "mrkdwn",
            text: `*Resumen*\n${input.summary || "_Sin resumen_"}`,
          },
          {
            type: "mrkdwn",
            text: `*Motivo*\n${input.reason || "_Sin motivo_"}`,
          },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Token: \`${input.toolCallId}\``,
          },
        ],
      },
    ],
  };
}

export async function updateSlackApprovalMessage(input: {
  channel: string;
  ts: string;
  approved: boolean;
  actorName?: string;
  approvalId: string;
  summary: string;
  reason: string;
  toolCallId: string;
}): Promise<void> {
  const { botToken } = getSlackConfig();
  if (!botToken) {
    return;
  }

  const resolved = buildResolvedSlackBlocks(input);

  await fetch("https://slack.com/api/chat.update", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: input.channel,
      ts: input.ts,
      text: resolved.text,
      blocks: resolved.blocks,
    }),
  });
}
