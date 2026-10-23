import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_CLOCK_SKEW_SECONDS = 60 * 5;

export type SlackSignatureFailure =
  | "missing_headers"
  | "bad_timestamp"
  | "clock_skew"
  | "mismatch";

export function verifySlackSignature(options: {
  signingSecret: string;
  signature: string | null;
  timestamp: string | null;
  rawBody: string;
}): { ok: true } | { ok: false; reason: SlackSignatureFailure } {
  const { signingSecret, signature, timestamp, rawBody } = options;

  if (!signature || !timestamp) {
    return { ok: false, reason: "missing_headers" };
  }

  const requestTs = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(requestTs)) {
    return { ok: false, reason: "bad_timestamp" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - requestTs) > MAX_CLOCK_SKEW_SECONDS) {
    return { ok: false, reason: "clock_skew" };
  }

  const base = `v0:${timestamp}:${rawBody}`;
  const digest = createHmac("sha256", signingSecret)
    .update(base, "utf8")
    .digest("hex");
  const expected = `v0=${digest}`;

  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(signature, "utf8");

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    return { ok: false, reason: "mismatch" };
  }

  return { ok: true };
}
