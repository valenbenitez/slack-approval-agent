export type SlackUser = {
  id?: string;
  name?: string;
  username?: string;
  real_name?: string;
};

export type SlackBlockActionsPayload = {
  type: "block_actions";
  trigger_id?: string;
  user?: SlackUser;
  channel?: { id?: string };
  container?: { channel_id?: string; message_ts?: string };
  message?: { ts?: string };
  actions?: Array<{
    action_id?: string;
    value?: string;
  }>;
};

export type SlackViewSubmissionPayload = {
  type: "view_submission";
  user?: SlackUser;
  view?: {
    callback_id?: string;
    private_metadata?: string;
    state?: {
      values?: Record<
        string,
        Record<string, { value?: string | null } | undefined>
      >;
    };
  };
};

export type SlackInteractionPayload =
  | SlackBlockActionsPayload
  | SlackViewSubmissionPayload
  | { type: string };

export function actorFromUser(user?: SlackUser) {
  return user?.real_name || user?.name || user?.username || user?.id;
}
