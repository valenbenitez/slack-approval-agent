# Slack Approval Agent

Agent durable (Next.js + Workflow SDK + `WorkflowAgent`) con human-in-the-loop en la UI y en Slack.

Challenge Plaude: chat en Next, aprobación humana para refunds / alto valor / pedidos ambiguos, entrega vía GitHub.

## Stack

- Next.js App Router
- Workflow SDK (`"use workflow"` / `"use step"`)
- `WorkflowAgent` (`@ai-sdk/workflow`) — reemplazo de `DurableAgent`
- Vercel AI Gateway (`AI_MODEL`, default `minimax/minimax-m3.1-flash`)
- Slack App + Bot Token + Block Kit

## Setup

```bash
npm install
cp .env.example .env.local
```

Completá al menos:

```bash
AI_GATEWAY_API_KEY=
AI_MODEL=minimax/minimax-m3.1-flash
```

```bash
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

Sin Slack configurado, la aprobación sigue funcionando **solo en la UI**.

## Slack (Fase 3)

### 1. Crear la Slack App

1. [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → From scratch
2. **OAuth & Permissions** → Bot Token Scopes:
   - `chat:write`
   - `chat:write.public` (si posteás a canales sin invite)
3. **Install to Workspace** → copiá `Bot User OAuth Token` → `SLACK_BOT_TOKEN`
4. **Basic Information** → **Signing Secret** → `SLACK_SIGNING_SECRET`
5. Invitar el bot al canal de aprobaciones
6. Copiá el **Channel ID** → `SLACK_APPROVAL_CHANNEL` (preferible ID `C…`)

### 2. Interactivity Request URL

En la Slack App → **Interactivity & Shortcuts** → On:

```text
https://<tu-host-publico>/api/slack/interactions
```

En local necesitás un tunnel (ngrok / Cloudflare Tunnel) o un deploy preview en Vercel.

Ejemplo ngrok:

```bash
ngrok http 3000
# Interactivity URL: https://xxxx.ngrok-free.app/api/slack/interactions
```

### 3. Env

```bash
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APPROVAL_CHANNEL=C0123456789
```

### Flujo

1. El usuario pide un refund / acción ≥ USD 500 en el chat
2. El agent llama `ask_human_approval` → el workflow **pausa**
3. Se posta un mensaje Block Kit en el canal (Approve / Deny)
4. Click en Slack (o en la UI) → `resumeHook` → el agent continúa
5. Timeout demo: **5 minutos** → cancelación automática

## Demo script

1. **Approve:** `Quiero un refund de USD 80 del pedido #123 por demora`
2. **Deny:** mismo prompt → Deny en UI o Slack
3. **Ambiguo:** `Haceme un reembolso` (sin monto / orderId)

## Arquitectura breve

```text
UI (useChat + WorkflowChatTransport)
  → POST /api/chat → start(chatWorkflow)
    → WorkflowAgent + tools
      → ask_human_approval → hook + (opcional) Slack postMessage
        → UI /api/hooks/approval  ó  Slack /api/slack/interactions
          → resumeHook → agent continúa
```

## Nota sobre DurableAgent

El enunciado del challenge menciona `DurableAgent`. Usamos **`WorkflowAgent`** de `@ai-sdk/workflow`, el reemplazo oficial en AI SDK 7.
