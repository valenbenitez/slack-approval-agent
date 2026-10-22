import { createAgent } from "@/lib/agent/agent";
import { ModelCallStreamPart } from "@ai-sdk/workflow";
import { convertToModelMessages, UIMessage } from "ai";
import { getWritable } from "workflow";

export async function chatWorkflow(messages: UIMessage[]) {
    "use workflow";

    const writable = getWritable<ModelCallStreamPart>();
    const agent = createAgent();
    const modelMessages = await convertToModelMessages(messages);

    await agent.stream({
        messages: modelMessages,
        writable,
    });
}