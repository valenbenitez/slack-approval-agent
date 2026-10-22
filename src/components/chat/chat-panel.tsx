"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
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

function getMessageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function getToolSummaries(message: UIMessage) {
  return message.parts
    .filter((part) => part.type.startsWith("tool-"))
    .map((part) => {
      const name = part.type.replace(/^tool-/, "");
      const state =
        "state" in part && typeof part.state === "string" ? part.state : "unknown";
      return `${name} (${state})`;
    });
}

export function ChatPanel() {
  const { messages, sendMessage, status, stop, error } = useChat();
  const [text, setText] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isBusy = status === "submitted" || status === "streaming";
  const canSend = text.trim().length > 0 && !isBusy;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isBusy) {
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
            Refunds, alto valor y pedidos ambiguos. HITL en fases siguientes.
          </p>
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
                      Probá un refund, una compra ≥ USD 500 o algo ambiguo para
                      ver las tools.
                    </p>
                  </div>
                ) : null}

                {messages.map((message) => {
                  const isUser = message.role === "user";
                  const content = getMessageText(message);
                  const tools = getToolSummaries(message);

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
                          {tools.length > 0 ? (
                            <p className="text-muted-foreground px-1 text-xs">
                              Tools: {tools.join(" · ")}
                            </p>
                          ) : null}
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
                placeholder="Escribí un mensaje…"
                rows={1}
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
