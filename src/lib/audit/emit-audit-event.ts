import type { AuditEvent } from "@/lib/audit/types";
import { getSlackConfig } from "@/lib/slack/env";

function formatAuditBlocks(event: AuditEvent) {
  const decisionLine = event.decision
    ? `*Decisión*\n\`${event.decision}\``
    : null;
  const actorLine = event.actorName
    ? `*Actor*\n${event.actorName}`
    : null;
  const amountLine =
    event.amountUsd != null ? `*Monto*\nUSD ${event.amountUsd}` : null;

  const fields = [
    { type: "mrkdwn" as const, text: `*Evento*\n\`${event.type}\`` },
    {
      type: "mrkdwn" as const,
      text: `*Operación*\n\`${event.operation ?? "unknown"}\``,
    },
    ...(decisionLine
      ? [{ type: "mrkdwn" as const, text: decisionLine }]
      : []),
    ...(actorLine ? [{ type: "mrkdwn" as const, text: actorLine }] : []),
    ...(amountLine ? [{ type: "mrkdwn" as const, text: amountLine }] : []),
    {
      type: "mrkdwn" as const,
      text: `*Resumen*\n${event.summary}`,
    },
  ];

  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Audit trail",
        emoji: true,
      },
    },
    { type: "section", fields: fields.slice(0, 10) },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: [
            `toolCallId: \`${event.toolCallId}\``,
            event.approvalId ? `approvalId: \`${event.approvalId}\`` : null,
            event.resultId ? `resultId: \`${event.resultId}\`` : null,
            event.source ? `source: \`${event.source}\`` : null,
            event.at,
          ]
            .filter(Boolean)
            .join(" · "),
        },
      ],
    },
  ];
}

export async function emitAuditEvent(event: AuditEvent): Promise<{
  ok: boolean;
  skipped?: boolean;
  error?: string;
}> {
  "use step";

  console.info("[audit]", JSON.stringify(event));

  const { botToken, auditChannel } = getSlackConfig();
  if (!botToken || !auditChannel) {
    return { ok: true, skipped: true };
  }

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: auditChannel,
      text: `[audit] ${event.type}: ${event.summary}`,
      blocks: formatAuditBlocks(event),
    }),
  });

  const data = (await response.json()) as { ok: boolean; error?: string };
  if (!data.ok) {
    console.error("[audit] slack post failed", data.error);
    return { ok: false, error: data.error ?? `HTTP ${response.status}` };
  }

  return { ok: true };
}
