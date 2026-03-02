# Idea: Two-Phase Zoo Startup Flow

## Problem

Currently starting the simulation requires two steps:
1. `npm run dev` (starts server)
2. `curl -X POST http://localhost:4000/api/zoo/agents/start` (starts agents)

This is clunky for dev and won't work on Railway without manual intervention.

## User Story (Frontend)

**Phase 1: "Open the Zoo"**
- User presses "Start"
- System spins up infrastructure, verifies merchants are ready
- Feedback: "Your zoo is open"

**Phase 2: "Let Customers In"**
- Confirmation prompt: "Zoo and merchants are ready. Want to let customers in?"
- User confirms → agents start engaging with merchants
- Activity becomes visible in the dashboard

## Key Design Questions (To Resolve)

- What exactly does "opening the zoo" validate? (blockchain, balances, merchant registry?)
- Should the frontend show individual pre-flight check results or just pass/fail?
- What does the running state look like? (agent cards, live transaction feed, metrics?)
- Do we need a `ZOO_AUTO_START` env var for Railway headless deploys, or will Railway always have the frontend?
- Should stop/restart be supported, or is it start-once per session?

## Current Architecture Notes

- `AgentRunner` is already instantiated at module load (in `server/routes/zoo.ts` line 21)
- It just needs `.start()` called — that's what the curl does
- Existing endpoints: `POST /api/zoo/agents/start`, `POST /api/zoo/agents/stop`, `GET /api/zoo/agents/status`
- WebSocket events already broadcast agent activity (`purchase_completed`, `needs_updated`, etc.)
- Frontend exists (React + Vite + Tailwind) but is currently a generic "Tempo Explorer", not zoo-specific

## Possible Backend Additions

- `POST /api/zoo/open` — pre-flight readiness check (blockchain, accounts, merchants, funding)
- `autoStart` config for headless Railway deployment
- Export `agentRunner` from zoo routes for auto-start in `server/index.ts`
