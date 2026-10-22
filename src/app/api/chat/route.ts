import { chatWorkflow } from "@/workflows/chat";
import { createModelCallToUIChunkTransform } from "@ai-sdk/workflow";
import { createUIMessageStreamResponse, UIMessage } from "ai";
import { start } from "workflow/api";

export async function POST(req: Request) {
    const { messages }: { messages: UIMessage[] } = await req.json();

    const run = await start(chatWorkflow, [messages])

    return createUIMessageStreamResponse({
        stream: run.readable.pipeThrough(createModelCallToUIChunkTransform()),
    })
}