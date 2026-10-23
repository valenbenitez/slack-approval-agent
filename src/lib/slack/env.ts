function cleanEnv(value: string | undefined): string | null {
  if (!value) return null;
  // Strip quotes/BOM/whitespace that sneak in when pasting from Slack.
  const cleaned = value
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
  return cleaned || null;
}

export function getSlackConfig() {
  const botToken = cleanEnv(process.env.SLACK_BOT_TOKEN);
  const signingSecret = cleanEnv(process.env.SLACK_SIGNING_SECRET);
  const channel = cleanEnv(process.env.SLACK_APPROVAL_CHANNEL);
  const auditChannel = cleanEnv(process.env.SLACK_AUDIT_CHANNEL);

  return {
    botToken: botToken || null,
    signingSecret: signingSecret || null,
    channel: channel || null,
    /** Optional second channel for append-only approval/operation audit logs. */
    auditChannel: auditChannel || null,
    isConfigured: Boolean(botToken && channel),
    isAuditConfigured: Boolean(botToken && auditChannel),
  };
}
