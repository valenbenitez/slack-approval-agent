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

  return {
    botToken: botToken || null,
    signingSecret: signingSecret || null,
    channel: channel || null,
    isConfigured: Boolean(botToken && channel),
  };
}
