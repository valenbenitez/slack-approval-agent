export type SlackApprovalContext = {
  toolCallId: string;
  approvalId: string;
  summary: string;
  reason: string;
};

/** Slack button `value` max length is 2000 chars. */
export function encodeApprovalButtonValue(ctx: SlackApprovalContext): string {
  const payload = JSON.stringify({
    t: ctx.toolCallId,
    i: ctx.approvalId,
    s: ctx.summary.slice(0, 500),
    r: ctx.reason.slice(0, 500),
  });
  return payload.length <= 2000 ? payload : payload.slice(0, 2000);
}

export function decodeApprovalButtonValue(
  value: string | undefined,
): SlackApprovalContext | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as {
      t?: string;
      i?: string;
      s?: string;
      r?: string;
    };
    if (!parsed.t) {
      return null;
    }
    return {
      toolCallId: parsed.t,
      approvalId: parsed.i ?? parsed.t,
      summary: parsed.s ?? "",
      reason: parsed.r ?? "",
    };
  } catch {
    // Legacy buttons only stored the toolCallId.
    return {
      toolCallId: value,
      approvalId: value,
      summary: "",
      reason: "",
    };
  }
}

export function createApprovalId(): string {
  return `apr_${Date.now().toString(36)}`;
}
