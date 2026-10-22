import { createModelCallToUIChunkTransform } from "@ai-sdk/workflow";
import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { start } from "workflow/api";
import { chatWorkflow } from "@/workflows/chat";

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const run = await start(chatWorkflow, [messages]);

  return createUIMessageStreamResponse({
    stream: run.readable.pipeThrough(createModelCallToUIChunkTransform()),
    headers: {
      "x-workflow-run-id": run.runId,
    },
  });
}
