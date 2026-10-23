import { askHumanApproval } from "@/lib/agent/tools/ask-human-approval";
import { executeHighValueAction } from "@/lib/agent/tools/execute-high-value";
import { requestRefund } from "@/lib/agent/tools/request-refund";

export {
  HIGH_VALUE_THRESHOLD_USD,
  HUMAN_APPROVAL_TIMEOUT,
  MAX_OPERATION_AMOUNT_USD,
  MAX_TEXT_FIELD_LENGTH,
} from "@/lib/agent/tool-schemas";

export {
  awaitHumanApproval,
  type HumanApprovalResult,
} from "@/lib/agent/await-human-approval";

export { requestRefund, executeHighValueAction, askHumanApproval };

export const agentTools = {
  request_refund: requestRefund,
  execute_high_value_action: executeHighValueAction,
  ask_human_approval: askHumanApproval,
};
