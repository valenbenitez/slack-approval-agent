"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ApprovalInput = {
  summary?: string;
  reason?: string;
};

type ApprovalOutput = {
  status?: string;
  message?: string;
  approved?: boolean;
  comment?: string | null;
};

type HumanApprovalCardProps = {
  toolCallId: string;
  input?: ApprovalInput;
  output?: ApprovalOutput;
  state?: string;
};

export function HumanApprovalCard({
  toolCallId,
  input,
  output,
  state,
}: HumanApprovalCardProps) {
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (output || state === "output-available" || state === "output-error") {
    const status = output?.status ?? "done";
    const tone =
      status === "approved"
        ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-50"
        : status === "timed_out"
          ? "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-50"
          : "border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-50";

    return (
      <div className={`w-full max-w-[85%] rounded-2xl border px-4 py-3 text-sm ${tone}`}>
        <p className="font-medium">
          {status === "approved"
            ? "Aprobado"
            : status === "timed_out"
              ? "Expiró (timeout)"
              : "Denegado"}
        </p>
        <p className="mt-1 leading-relaxed opacity-90">
          {output?.message ?? "La aprobación humana ya se resolvió."}
        </p>
      </div>
    );
  }

  async function submit(approved: boolean) {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/hooks/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolCallId,
          approved,
          comment: comment.trim() || undefined,
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "No se pudo enviar la aprobación");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al enviar");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="border-border bg-muted/40 w-full max-w-[85%] space-y-3 rounded-2xl border px-4 py-3">
      <div>
        <p className="text-sm font-medium">Pendiente de aprobación humana</p>
        <p className="text-muted-foreground mt-1 text-xs">
          El workflow está pausado hasta Approve / Deny (timeout 5 min).
        </p>
      </div>

      {input?.summary ? (
        <div className="bg-background/80 rounded-xl px-3 py-2 text-sm">
          <p className="font-medium">{input.summary}</p>
          {input.reason ? (
            <p className="text-muted-foreground mt-1 text-xs">
              Motivo: {input.reason}
            </p>
          ) : null}
        </div>
      ) : null}

      <Textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Comentario opcional…"
        rows={2}
        className="min-h-16 text-sm"
        disabled={isSubmitting}
      />

      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={isSubmitting}
          onClick={() => void submit(true)}
        >
          {isSubmitting ? "Enviando…" : "Approve"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isSubmitting}
          onClick={() => void submit(false)}
        >
          Deny
        </Button>
      </div>
    </div>
  );
}
