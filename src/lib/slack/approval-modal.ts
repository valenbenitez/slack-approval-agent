import type { SlackApprovalContext } from "@/lib/slack/approval-context";
import { getSlackConfig } from "@/lib/slack/env";

export type ApprovalModalMetadata = SlackApprovalContext & {
  approved: boolean;
  channelId?: string;
  messageTs?: string;
};

export function buildApprovalCommentModal(meta: ApprovalModalMetadata) {
  const decision = meta.approved ? "Approve" : "Deny";
  return {
    type: "modal" as const,
    callback_id: "human_approval_comment_modal",
    private_metadata: JSON.stringify(meta),
    title: {
      type: "plain_text" as const,
      text: decision,
    },
    submit: {
      type: "plain_text" as const,
      text: "Confirmar",
    },
    close: {
      type: "plain_text" as const,
      text: "Cancelar",
    },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: meta.approved
            ? "Confirmá la *aprobación*. Podés agregar un comentario opcional."
            : "Confirmá el *rechazo*. Podés agregar un comentario opcional.",
        },
      },
      {
        type: "input",
        block_id: "comment_block",
        optional: true,
        label: {
          type: "plain_text",
          text: "Comentario",
        },
        element: {
          type: "plain_text_input",
          action_id: "comment_input",
          multiline: true,
          max_length: 500,
          placeholder: {
            type: "plain_text",
            text: "Opcional — contexto para el audit trail…",
          },
        },
      },
    ],
  };
}

export async function openApprovalCommentModal(options: {
  triggerId: string;
  meta: ApprovalModalMetadata;
}): Promise<{ ok: boolean; error?: string }> {
  const { botToken } = getSlackConfig();
  if (!botToken) {
    return { ok: false, error: "missing_bot_token" };
  }

  const response = await fetch("https://slack.com/api/views.open", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      trigger_id: options.triggerId,
      view: buildApprovalCommentModal(options.meta),
    }),
  });

  const data = (await response.json()) as { ok: boolean; error?: string };
  if (!data.ok) {
    console.error("[slack] views.open failed", data.error);
    return { ok: false, error: data.error };
  }
  return { ok: true };
}

export function parseApprovalModalMetadata(
  raw: string | undefined,
): ApprovalModalMetadata | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ApprovalModalMetadata;
    if (!parsed.toolCallId || typeof parsed.approved !== "boolean") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function extractModalComment(view: {
  state?: {
    values?: Record<
      string,
      Record<string, { value?: string | null } | undefined>
    >;
  };
}): string | undefined {
  const value = view.state?.values?.comment_block?.comment_input?.value;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 500) : undefined;
}
