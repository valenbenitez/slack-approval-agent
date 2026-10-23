"use client";

import { useChat } from "@ai-sdk/react";
import { WorkflowChatTransport } from "@ai-sdk/workflow/client";
import type { UIMessage } from "ai";
import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { HumanApprovalCard } from "@/components/chat/human-approval-card";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Message, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";

const ACTIVE_RUN_KEY = "active-workflow-run-id";

function getMessageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

const HITL_TOOL_TYPES = new Set([
  "tool-ask_human_approval",
  "tool-request_refund",
  "tool-execute_high_value_action",
]);

function isPendingHitlPart(part: UIMessage["parts"][number]) {
  if (!HITL_TOOL_TYPES.has(part.type)) {
    return false;
  }
  if ("output" in part && part.output != null) {
    return false;
  }
  // Low-value actions do not wait on Slack.
  if (
    part.type === "tool-execute_high_value_action" &&
    "input" in part &&
    part.input &&
    typeof part.input === "object" &&
    "amount" in part.input &&
    typeof (part.input as { amount?: unknown }).amount === "number" &&
    (part.input as { amount: number }).amount < 500
  ) {
    return false;
  }
  if (!("state" in part) || typeof part.state !== "string") {
    return true;
  }
  return part.state !== "output-available" && part.state !== "output-error";
}

function hasPendingHumanApproval(messages: UIMessage[]) {
  return messages.some((message) => message.parts.some(isPendingHitlPart));
}

function hitlCardInput(part: UIMessage["parts"][number]): {
  summary?: string;
  reason?: string;
} {
  if (!("input" in part) || part.input == null || typeof part.input !== "object") {
    return {};
  }
  const input = part.input as Record<string, unknown>;

  if (part.type === "tool-ask_human_approval") {
    return {
      summary: typeof input.summary === "string" ? input.summary : undefined,
      reason: typeof input.reason === "string" ? input.reason : undefined,
    };
  }

  if (part.type === "tool-request_refund") {
    const amount = typeof input.amount === "number" ? input.amount : null;
    const orderId = typeof input.orderId === "string" ? input.orderId : null;
    const reason = typeof input.reason === "string" ? input.reason : undefined;
    return {
      summary:
        amount != null
          ? orderId
            ? `Refund de USD ${amount} · pedido ${orderId}`
            : `Refund de USD ${amount}`
          : "Refund pendiente",
      reason,
    };
  }

  if (part.type === "tool-execute_high_value_action") {
    const amount = typeof input.amount === "number" ? input.amount : null;
    const description =
      typeof input.description === "string" ? input.description : undefined;
    return {
      summary:
        amount != null
          ? `Operación de USD ${amount}${description ? `: ${description}` : ""}`
          : "Operación pendiente",
      reason:
        amount != null && amount >= 500
          ? "Alto valor — requiere Approve/Deny en Slack"
          : undefined,
    };
  }

  return {};
}

export function ChatPanel() {
  const activeRunId = useMemo(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    return localStorage.getItem(ACTIVE_RUN_KEY) ?? undefined;
  }, []);

  const transport = useMemo(
    () =>
      new WorkflowChatTransport({
        api: "/api/chat",
        onChatSendMessage: (response) => {
          const workflowRunId = response.headers.get("x-workflow-run-id");
          if (workflowRunId) {
            localStorage.setItem(ACTIVE_RUN_KEY, workflowRunId);
          }
        },
        onChatEnd: () => {
          localStorage.removeItem(ACTIVE_RUN_KEY);
        },
        prepareReconnectToStreamRequest: ({ api: _api, ...rest }) => {
          const runId = localStorage.getItem(ACTIVE_RUN_KEY);
          if (!runId) {
            throw new Error("No active workflow run ID found");
          }
          return {
            ...rest,
            api: `/api/chat/${encodeURIComponent(runId)}/stream`,
          };
        },
      }),
    [],
  );

  const { messages, sendMessage, status, stop, error } = useChat({
    transport,
    resume: Boolean(activeRunId),
  });

  const [text, setText] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isBusy = status === "submitted" || status === "streaming";
  const pendingApproval = hasPendingHumanApproval(messages);
  const canSend = text.trim().length > 0 && !isBusy && !pendingApproval;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isBusy || pendingApproval) {
      return;
    }

    setText("");
    void sendMessage({ text: trimmed });
    inputRef.current?.focus();
  }

  return (
    <div className="flex h-dvh items-stretch justify-center bg-zinc-100 md:items-center md:bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] md:from-zinc-50 md:via-zinc-100 md:to-zinc-200/80 md:p-6 dark:bg-zinc-950 dark:md:from-zinc-900 dark:md:via-zinc-950 dark:md:to-black">
      <div className="bg-background flex h-full w-full max-w-2xl flex-col md:h-[min(52rem,calc(100dvh-3rem))] md:overflow-hidden md:rounded-[1.75rem] md:shadow-[0_24px_80px_-24px_rgba(0,0,0,0.35)] md:ring-1 md:ring-black/5 dark:md:ring-white/10">
        <header className="shrink-0 px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))] md:px-6 md:pt-5">
          <h1 className="text-[17px] font-semibold tracking-tight">
            Slack Approval Agent
          </h1>
          <p className="text-muted-foreground mt-0.5 text-sm leading-relaxed">
            HITL vía Slack (Approve/Deny). Timeout demo: 5 min.
          </p>
          {pendingApproval ? (
            <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
              Pendiente en Slack — el workflow está pausado.
            </p>
          ) : null}
        </header>

        <MessageScrollerProvider autoScroll>
          <MessageScroller className="min-h-0 flex-1">
            <MessageScrollerViewport className="px-4 md:px-6">
              <MessageScrollerContent className="min-h-full gap-4 py-2">
                {messages.length === 0 ? (
                  <div className="text-muted-foreground flex min-h-[min(24rem,50dvh)] flex-1 flex-col items-start justify-center gap-2 px-1 text-sm md:min-h-0 md:items-center md:text-center">
                    <p className="text-foreground text-lg font-medium tracking-tight">
                      ¿En qué te ayudo?
                    </p>
                    <p className="max-w-sm leading-relaxed">
                      Probá un refund o una compra ≥ USD 500 para disparar la
                      aprobación humana.
                    </p>
                  </div>
                ) : null}

                {messages.map((message) => {
                  const isUser = message.role === "user";
                  const content = getMessageText(message);

                  return (
                    <MessageScrollerItem
                      key={message.id}
                      messageId={message.id}
                      scrollAnchor={isUser}
                    >
                      <Message align={isUser ? "end" : "start"}>
                        <MessageContent>
                          {content ? (
                            <Bubble
                              align={isUser ? "end" : "start"}
                              variant={isUser ? "muted" : "secondary"}
                              className="max-w-[85%]"
                            >
                              <BubbleContent className="whitespace-pre-wrap text-[15px] leading-relaxed">
                                {content}
                              </BubbleContent>
                            </Bubble>
                          ) : null}

                          {message.parts.map((part, partIndex) => {
                            if (HITL_TOOL_TYPES.has(part.type)) {
                              const toolCallId =
                                "toolCallId" in part
                                  ? String(part.toolCallId)
                                  : `${message.id}-${partIndex}`;
                              const output =
                                "output" in part
                                  ? (part.output as {
                                      status?: string;
                                      message?: string;
                                      approved?: boolean;
                                      comment?: string | null;
                                    })
                                  : undefined;

                              // Low-value execute_high_value finishes without Slack —
                              // keep a compact tool line instead of the HITL card.
                              if (
                                part.type === "tool-execute_high_value_action" &&
                                output &&
                                output.status === "mock_executed" &&
                                !output.approved
                              ) {
                                return (
                                  <p
                                    key={toolCallId}
                                    className="text-muted-foreground px-1 text-xs"
                                  >
                                    Tool: execute_high_value_action (ok)
                                  </p>
                                );
                              }

                              return (
                                <HumanApprovalCard
                                  key={toolCallId}
                                  input={hitlCardInput(part)}
                                  output={output}
                                  state={
                                    "state" in part &&
                                    typeof part.state === "string"
                                      ? part.state
                                      : undefined
                                  }
                                />
                              );
                            }

                            if (part.type.startsWith("tool-")) {
                              const name = part.type.replace(/^tool-/, "");
                              const toolState =
                                "state" in part && typeof part.state === "string"
                                  ? part.state
                                  : "unknown";
                              return (
                                <p
                                  key={`${message.id}-${partIndex}`}
                                  className="text-muted-foreground px-1 text-xs"
                                >
                                  Tool: {name} ({toolState})
                                </p>
                              );
                            }

                            return null;
                          })}
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  );
                })}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>

        <footer className="shrink-0 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6 md:pb-5">
          <form ref={formRef} onSubmit={onSubmit} className="w-full">
            {error ? (
              <p className="text-destructive mb-2 text-xs" role="alert">
                {error.message}
              </p>
            ) : null}
            <InputGroup className="h-auto min-h-12 rounded-2xl border-border/70 shadow-sm">
              <InputGroupTextarea
                ref={inputRef}
                autoFocus
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={
                  pendingApproval
                    ? "Aprobá o denegá en Slack para continuar…"
                    : "Escribí un mensaje…"
                }
                rows={1}
                disabled={pendingApproval}
                className="min-h-11 max-h-40 p-3 text-[15px]"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    formRef.current?.requestSubmit();
                  }
                }}
              />
              <InputGroupAddon align="block-end" className="justify-end pb-2">
                {isBusy ? (
                  <InputGroupButton
                    type="button"
                    size="icon-sm"
                    variant="default"
                    className="rounded-full"
                    aria-label="Detener"
                    onClick={() => stop()}
                  >
                    <SquareIcon className="size-3.5 fill-current" />
                  </InputGroupButton>
                ) : (
                  <InputGroupButton
                    type="submit"
                    size="icon-sm"
                    variant="default"
                    className="rounded-full"
                    disabled={!canSend}
                    aria-label="Enviar"
                  >
                    <ArrowUpIcon />
                  </InputGroupButton>
                )}
              </InputGroupAddon>
            </InputGroup>
          </form>
        </footer>
      </div>
    </div>
  );
}
