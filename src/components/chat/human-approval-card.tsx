"use client";

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
  input?: ApprovalInput;
  output?: ApprovalOutput;
  state?: string;
};

function ResolvedCard({ output }: { output: ApprovalOutput }) {
  const status = output.status ?? "done";
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
        {output.message ?? "La aprobación humana ya se resolvió."}
      </p>
    </div>
  );
}

export function HumanApprovalCard({
  input,
  output,
  state,
}: HumanApprovalCardProps) {
  if (output || state === "output-available" || state === "output-error") {
    return (
      <ResolvedCard
        output={
          output ?? {
            status: "done",
            message: "La aprobación humana ya se resolvió.",
          }
        }
      />
    );
  }

  return (
    <div className="border-border bg-muted/40 w-full max-w-[85%] space-y-3 rounded-2xl border px-4 py-3">
      <div>
        <p className="text-sm font-medium">Pendiente de aprobación en Slack</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Usá Approve / Deny en el mensaje de Slack. Timeout demo: 5 min.
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
    </div>
  );
}
