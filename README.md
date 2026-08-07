# RunRPG

Desktop scratchpad for practicing RPG Full Free against a real IBM i, RunJS-style.

## Current status: Phase 1 — Persistent SSH session

Electron + Vite + React + TypeScript scaffold, plus a persistent SSH connection
to IBM i (tested against pub400.com) with an exec-per-command runner.

## How to run it

```bash
npm install
npm run dev
```

This should open an Electron window. Click "Test SSH" to connect and run a
couple of diagnostic CL commands (see `src/main/ssh/sshSession.ts`).

Before that, copy the credentials template and fill in your pub400 account:

```bash
cp runrpg.local.json.example runrpg.local.json
```

`runrpg.local.json` is gitignored — never commit real credentials.

## Before moving further, confirm manually:

```bash
ssh YOUR_USERNAME@pub400.com
```

You should land in a working shell. If you don't have an account yet, sign up
at https://pub400.com — it's free and meant for testing like this.

## Full roadmap

See the shared RunRPG roadmap for the day-by-day detail of the next phases:

1. **Phase 1** (days 2-5): persistent SSH session against pub400.
2. **Phase 2** (days 6-10): compile → run → capture output pipeline (DSPLY via job log).
3. **Phase 3** (days 11-15): real UI (Monaco editor + console panel).
4. **Phase 4** (days 16-18): wrap-up, packaging and practice exercises.

## Responsible use note

pub400.com is a shared community resource. Avoid compiling on every keystroke
(unlike RunJS); use an explicit trigger with aggressive time limits on any
`CALL`.
