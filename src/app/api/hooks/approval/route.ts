import { humanApprovalHook } from "@/workflows/hooks/human-approval";

export async function POST(request: Request) {
  const body = await request.json();
  const toolCallId = body.toolCallId as string | undefined;
  const approved = body.approved as boolean | undefined;
  const comment =
    typeof body.comment === "string" && body.comment.trim().length > 0
      ? body.comment.trim()
      : undefined;

  if (!toolCallId || typeof approved !== "boolean") {
    return Response.json(
      { error: "toolCallId and approved are required" },
      { status: 400 },
    );
  }

  try {
    await humanApprovalHook.resume(toolCallId, { approved, comment });
    return Response.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to resume approval hook";
    return Response.json({ error: message }, { status: 404 });
  }
}
