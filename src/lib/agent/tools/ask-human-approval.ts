import { tool } from "ai";
import { z } from "zod";
import { awaitHumanApproval } from "@/lib/agent/await-human-approval";
import {
  assertTextWithinPolicy,
  shortText,
} from "@/lib/agent/tool-schemas";

export const askHumanApproval = tool({
  description:
    "Pide aprobación humana en Slack para pedidos ambiguos u otros casos sin ejecutar aún refund/alto valor.",
  inputSchema: z.object({
    summary: shortText("Resumen corto de lo que se quiere hacer"),
    reason: shortText("Por qué se necesita un humano"),
  }),
  execute: async ({ summary, reason }, { toolCallId }) => {
    assertTextWithinPolicy("Resumen", summary);
    assertTextWithinPolicy("Motivo", reason);
    return awaitHumanApproval({
      toolCallId,
      summary,
      reason,
      operation: "ambiguous",
    });
  },
});
