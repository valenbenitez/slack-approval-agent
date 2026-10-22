import { defineHook } from "workflow";
import { z } from "zod";

export const humanApprovalPayloadSchema = z.object({
  approved: z.boolean(),
  comment: z.string().optional(),
});

export type HumanApprovalPayload = z.infer<typeof humanApprovalPayloadSchema>;

export const humanApprovalHook = defineHook({
  schema: humanApprovalPayloadSchema,
});
