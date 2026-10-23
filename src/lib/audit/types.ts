export type AuditEventType =
  | "approval_requested"
  | "approval_resolved"
  | "operation_executed"
  | "operation_blocked";

export type AuditEvent = {
  type: AuditEventType;
  at: string;
  toolCallId: string;
  approvalId?: string;
  operation?: "refund" | "high_value" | "ambiguous" | "unknown";
  summary: string;
  reason?: string;
  amountUsd?: number;
  orderId?: string | null;
  decision?: "approved" | "denied" | "timed_out" | "skipped_by_policy";
  actorName?: string | null;
  source?: "slack" | "api" | "policy" | "system";
  resultId?: string;
  message?: string;
};
