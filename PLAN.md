# PLAN — Slack Approval Agent (Plaude challenge)

Plan de implementación.

- **Repo:** `slack-approval-agent`
- **Challenge:** [plaude.com/api/challenge](https://plaude.com/api/challenge)
- **Ventana:** 2026-10-22 → 2026-10-23
- **Stack fijado:** Next.js App Router, Workflow SDK + `WorkflowAgent`, AI Gateway (`AI_MODEL`, default `minimax/minimax-m3.1-flash`), Slack Bot + Block Kit, UI/agent en español, umbral alto valor **USD 500**, timeout HITL **5 min**

---

## Vista rápida de fases


| Fase           | Objetivo                                | Estado                            |
| -------------- | --------------------------------------- | --------------------------------- |
| 0 Setup        | Next + Workflow + Gateway               | Hecho                             |
| 1 Agent mínimo | Chat + tools mock                       | Hecho                             |
| 2 HITL durable | Hook + pause/resume + timeout           | Hecho (UI approve luego retirado) |
| 3 Slack        | Bot + Block Kit + interactivity         | Hecho                             |
| 4 Polish       | Demos README, mensaje Slack rico, build | Hecho                             |
| Extra          | Guardrails anti prompt-injection        | Hecho                             |


---



## Fase 0 — Setup

**Objetivo:** app Next que arranca con Workflow SDK y AI Gateway.

**Hecho**

- Scaffold Next.js App Router + TypeScript
- `workflow` + `withWorkflow` en `next.config`
- `.env.example` (`AI_GATEWAY_API_KEY`, `AI_MODEL`, placeholders Slack)
- README base / smoke de completion

**Commit:** `b976e28` — scaffold workflow SDK

**Done cuando:** `npm run dev` corre y hay respuesta del modelo vía Gateway.

---



## Fase 1 — Agent mínimo (sin Slack)

**Objetivo:** chatear con `WorkflowAgent` + instrucciones + tools mock (sin pausa).

**Hecho**

- `lib/agent/instructions` (plain-text) + `WorkflowAgent`
- Tools mock: `request_refund`, `execute_high_value_action`, stub/`ask_human_approval`
- Workflow `"use workflow"` + API `/api/chat`
- Chat UI (stream con `WorkflowChatTransport`)

**Commit:** `a8a1951` — chat UI + agent tools

**Done cuando:** desde la UI un refund / alto valor dispara tools (aún sin humano).

---



## Fase 2 — HITL durable

**Objetivo:** pausa/reanudación durable del workflow.

**Hecho**

- Hook tipado (`defineHook`) con token = `toolCallId`
- Timeout **5 min** vía `Promise.race(hook, sleep("5m"))`
- Endpoint `/api/hooks/approval` para resume
- UI pending mientras el run espera

**Evolución posterior:** Approve/Deny se movieron **solo a Slack** (la UI quedó informativa). El contrato del hook se reutilizó en Fase 3.

**Commit:** `a41ebf8` — durable HITL approval

**Done cuando:** approve / deny / timeout reanudan o cancelan bien el workflow.

---



## Fase 3 — Slack (Bot + Block Kit)

**Objetivo:** aprobación en un canal Slack con botones nativos.

**Hecho**

- Slack App Blank, scopes `chat:write` (+ `chat:write.public` si aplica)
- Bot en canal, `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_APPROVAL_CHANNEL`
- Interactivity URL pública (Cursor Ports **Public** / tunnel); Socket Mode off
- `chat.postMessage` + Block Kit Approve/Deny
- `/api/slack/interactions` — verify signature → `resumeHook`
- Docs de setup Slack en README

**Lecciones**

- URL mal tipeada / port **Private** → 401 en Slack sin log en Next
- Ack a Slack en **< ~3s** (resume del hook en `after()`), si no fallan los botones/`replace_original`

**Commit:** `dd90b62` — integrate Slack bot approvals

**Done cuando:** pedido sensible en UI → mensaje en canal → Approve/Deny reanuda el agent.

---



## Fase 4 — Escenarios + polish

**Objetivo:** demos claras y UX Slack/UI coherente.

**Hecho**

- Mensaje Slack enriquecido: **ID**, **Resumen**, **Motivo**, **Decisión**; botones se eliminan con `replace_original` + `chat.update`
- README con demo script copy-paste (approve / deny / ambiguo / alto valor)
- HITL solo por Slack en la UI
- Fix build: `next build --webpack` (Turbopack panic en Next 16)

**Commits**

- `41a11b9` — polish Slack approval message
- `81db004` — update README
- (build webpack + guardrails en commits posteriores / mismo tramo)

**Done cuando:** otro humano puede seguir el README y reproducir approve + deny.

---



## Extra — Guardrails

**Objetivo:** reducir prompt injection y bypass de HITL.

**Hecho**

1. Instrucciones anti-injection (mensaje de usuario = dato no confiable)
2. Límites Zod (monto ≤ USD 10 000, textos ≤ 500 chars)
3. HITL **estructural**: `request_refund` siempre aprueba en Slack; `execute_high_value_action` si monto ≥ 500

**Commit:** `5971a70` — security guardrails + structural HITL

---

## Referencias

- Challenge: https://plaude.com/api/challenge
- Docs: `@ai-sdk/workflow`, Workflow SDK hooks, Slack Interactivity + Block Kit
- PRD / plan Notion (interno): Challenges técnicos → Plaude
