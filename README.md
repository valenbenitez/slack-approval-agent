# Slack Approval Agent

Agent durable (Next.js + Workflow SDK + `WorkflowAgent`) con human-in-the-loop **vía Slack** (Block Kit Approve / Deny).

Challenge Plaude: chat en Next, aprobación humana para refunds / alto valor / pedidos ambiguos, entrega vía GitHub.

## Stack

- Next.js App Router
- Workflow SDK (`"use workflow"` / `"use step"`)
- `WorkflowAgent` (`@ai-sdk/workflow`) — reemplazo de `DurableAgent`
- Vercel AI Gateway (`AI_MODEL`, default `minimax/minimax-m3.1-flash`)
- Slack App + Bot Token + Block Kit + Interactivity HTTP

## Setup

```bash
npm install
cp .env.example .env
```

Completá:

```bash
AI_GATEWAY_API_KEY=
AI_MODEL=minimax/minimax-m3.1-flash

SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APPROVAL_CHANNEL=C0123456789
# Opcional: audit trail en otro canal
SLACK_AUDIT_CHANNEL=C0AUDITXXXX

# Policy tipada (ver src/lib/policy/config.ts)
POLICY_REFUND_ALWAYS_REQUIRES_APPROVAL=true
POLICY_HIGH_VALUE_THRESHOLD_USD=500
POLICY_MAX_OPERATION_AMOUNT_USD=10000
```

```bash
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

La demo pensada para el challenge **requiere Slack**.

## Slack

### 1. Crear la Slack App

1. [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → From scratch (Blank)
2. **OAuth & Permissions** → Bot Token Scopes:
   - `chat:write`
   - `chat:write.public` (si posteás a canales sin invite)
   - Reinstalá la app tras agregar scopes si ya estaba instalada
3. **Install to Workspace** → copiá `Bot User OAuth Token` → `SLACK_BOT_TOKEN`
4. **Basic Information** → **Signing Secret** → `SLACK_SIGNING_SECRET` (no el Client Secret)
5. Invitar el bot al canal de aprobaciones
6. Copiá el **Channel ID** → `SLACK_APPROVAL_CHANNEL` (preferible `C…`)
7. (Opcional) Canal de auditoría → `SLACK_AUDIT_CHANNEL` (invitar el mismo bot)

### 2. Interactivity Request URL

**Interactivity & Shortcuts** → On. **Socket Mode** → Off.

```text
https://<tu-host-publico>/api/slack/interactions
```

### 3. Qué hace el mensaje de Slack

1. Al escalar, se posta un Block Kit con **ID**, **Resumen**, **Motivo**, token y botones Approve / Deny
2. Al clickear, el mismo mensaje se **reemplaza** (sin botones) con **ID**, **Decisión**, **Resumen**, **Motivo**
3. El workflow resume el hook y el agent continúa en el chat

Timeout demo: **5 minutos** → la operación no se ejecuta.

## Demo script

Con `npm run dev` + Interactivity URL pública + bot en el canal:

### 1. Approve (refund)

En el chat:

```text
Quiero un refund de USD 80 del pedido #33 por demora en la entrega
```

En Slack → **Approve**. En el canal el mensaje pasa a “Aprobado…”; en la UI el agent continúa y registra el refund mock.

### 2. Deny

```text
Quiero un refund de USD 80 del pedido #33 por demora en la entrega
```

En Slack → **Deny**. El mensaje se actualiza a “Denegado…”; el agent no ejecuta el refund.

### 3. Ambiguo

```text
Haceme un reembolso
```

El agent debería pedir datos faltantes y/o escalar a humano según las instrucciones.

### 4. Alto valor (≥ USD 500)

```text
Quiero comprar un equipo de USD 750
```

Debería pedir aprobación humana antes de `execute_high_value_action`.

## Arquitectura breve

```text
UI (useChat + WorkflowChatTransport)
  → POST /api/chat → start(chatWorkflow)
    → WorkflowAgent + tools
      → request_refund / execute_high_value (≥500) / ask_human_approval
          → hook HITL (pausa durable; no se puede saltear por prompt)
          → Slack chat.postMessage (Block Kit)
        → Slack click → POST /api/slack/interactions
            → ack replace_original (sin botones)
            → resumeHook → agent continúa
```

Guardrails: instrucciones anti-injection, límites de política tipada (`POLICY_*`), HITL **estructural** en tools sensibles, y **audit trail** opcional a `SLACK_AUDIT_CHANNEL` (requested / resolved / executed / blocked).

## Nota sobre DurableAgent

El enunciado del challenge menciona `DurableAgent`. Usamos **`WorkflowAgent`** de `@ai-sdk/workflow`, el reemplazo oficial en AI SDK 7.
