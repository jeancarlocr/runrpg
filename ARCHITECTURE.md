# Architecture notes

This document explains the non-obvious decisions behind the SSH/IBM i plumbing
in `src/main/ssh/`. Every claim here was verified against a real pub400.com
account, not assumed from general IBM i knowledge — several assumptions that
sounded reasonable turned out to be wrong in practice. If you're reading this
because something looks weird ("why not just use DSPLY?", "why is there a
whole SQL CLI wrapper?"), the answer is here so nobody has to re-run these
experiments.

## 1. One `exec()` per command, no pty, no shell (Phase 1)

`SshSession.runCommand()` opens a fresh `client.exec()` channel per command
instead of keeping one interactive shell open. Two things were tried and
rejected first:

- **A persistent `client.shell()` with a text marker** (echo a unique token
  after each command, scan the buffer for it). This is what an earlier
  version of this file did. It works, but it requires a pty to make
  `system`-family PASE commands behave (see below), and a pty echoes
  everything you type back at you, requiring extra cleanup of the echoed
  input and ANSI sequences.
- **A pty with no shell**, i.e. requesting a pseudo-tty directly on the exec
  channel. Tested in isolation (a `CALL` to a program that only does `dsply`
  and returns — not an interactive command like `WRKACTJOB` that legitimately
  hangs waiting for F3). Result: still nothing on the stream. A pty is a
  PASE/Unix terminal construct; it has no bearing on whether IBM i's own
  device/message subsystem is present for a job (see §3).

The current design (`client.exec()` per command, matching how Code for IBM i
/ vscode-ibmi runs one-off commands) gives native exit code / stdout / stderr
with no parsing, at the cost of a fact that isn't documented anywhere obvious:

## 2. QTEMP does not survive between separate `system` invocations

This is the single most surprising finding in this codebase, and it drives
almost every other decision in `rpgRunner.ts`.

**Expectation:** one SSH connection maps to one IBM i job, so `QTEMP` should
persist across every command sent over that connection — this is literally
what §1 originally claimed, and it's the standard mental model for IBM i
automation.

**Reality, confirmed by direct testing:** every time the PASE `system`
command runs a CL command, it appears to execute in its own throwaway
QTEMP-scoped context. This is true even when two `system "..."` calls are
chained with `&&` inside a *single* `client.exec()` invocation (one shell
process, one job, sequential statements) — compiling a program into
`QTEMP` in statement 1 and then running `CHKOBJ` on it in statement 2 of the
very same script reports "object not found." Whatever `system` does
internally to bridge PASE to the QSYS command processor, it does not share
QTEMP across separate calls to it, regardless of exec-channel or job
boundaries.

Practical consequence: **any workflow that needs an object created in one
step to still exist in a later step cannot be built out of separate
`system "..."` calls**, no matter how they're grouped. This ruled out the
originally planned "compile in one `runCommand()`, `CALL` in the next."

Two ways around it were tested:

- **A real (non-QTEMP) library.** pub400 accounts can't run `CRTLIB`
  (`CPD0032: Not authorized`), but every account already has a personal
  library as its `*CURLIB` (`JBUSTOS1` for this account, listed in
  `DSPLIBL`). Objects there persist normally across jobs/connections. This
  works for a compile-then-call sequence, but doesn't help capture DSPLY (see
  §3) and adds a "guess or discover the user's personal library" step, so it
  isn't used in the final design — noted here in case a future target
  system's account restrictions make it necessary again.
- **One long-lived `system` invocation that never returns**, used for every
  step. This is what shipped. See §4.

## 3. Why the output pipeline doesn't use DSPLY

The original plan (and the obvious one) was: run the program, then read its
DSPLY output back from the job log (`DSPJOBLOG OUTPUT(*PRINT)` or
`QSYS2.JOBLOG_INFO`). This was tested exhaustively and **DSPLY output is not
retrievable through any of these mechanisms** on this connection type:

1. `DSPJOBLOG OUTPUT(*PRINT)` run directly after a `CALL` (own `exec()`) —
   only ever shows the boilerplate "job started" message. Expected, given §2
   (it's a different job by the time DSPJOBLOG runs).
2. A CL wrapper program that does `CALL target` then `DSPJOBLOG
   OUTPUT(*PRINT)` *in the same single execution* (so it's provably the same
   job) — still nothing from the DSPLY.
3. `RCVMSG` on the calling program's own queue (`PGMQ(*PGMQ)`, the default)
   immediately after the `CALL` — finds nothing.
4. `RCVMSG PGMQ(*EXT)` (the job's external queue) — finds only the original
   "job started" message that was already sitting there; nothing new.
5. Raising the job's logging level (`CHGJOB LOG(4 00 *SECLVL)
   LOGCLPGM(*YES)`) before compiling/calling — no change.
6. A real pty allocated on the exec channel running the `CALL` directly (see
   §1) — the stream comes back completely empty.

Every one of these was tried against the *same* trivial `dsply 'Hello from
RunRPG'; *inlr = *on;` program, so it isn't a message-severity or
message-type filtering issue specific to one attempt.

**Working theory:** DSPLY's "no interactive device, fall back to an
informational message" behavior requires the job to have (or have had) a
real 5250-class device association. An SSH/PASE-originated job (job type
`QP0ZSPWT` in every test here) never has one, with or without a pty, so
there is nowhere for DSPLY to fall back to — it's plausible the runtime just
no-ops. This is a hypothesis based on exhausting every retrieval path we
could find, not something IBM documents explicitly; treat it as "don't spend
more time on DSPLY here" rather than a citable fact.

**What replaced it:** the compiled program calls `runrpg_out('text')`
instead of `dsply`. This subprocedure is appended to every snippet the user
writes (see `buildFullSource()` in `rpgRunner.ts`) and writes its argument,
plus a newline, directly to a per-run IFS stream file using raw `open()` /
`write()` / `close()` — see §5 for why those specific calls and not the more
common `fopen()`/`fputs()`/`fclose()`. That file is downloaded over SFTP
after the `CALL` and deleted during cleanup. This sidesteps the job/message
queue subsystem entirely: a stream file write doesn't care what kind of job
performed it.

The trade-off is explicit and worth restating: **snippets must call
`runrpg_out()`, not `dsply`, to produce visible output.** If IBM i's device
model is ever better understood or a different connection type (a real
SBMJOB-submitted batch job, for instance) turns out to support DSPLY
properly, this is the place to revisit.

## 4. Why QZDFMDB2 instead of more `system` calls

Given §2, compiling and calling can't be two separate `system` invocations.
The fix (and the actual technique Code for IBM i uses under the hood) is to
never let the shared context go away: open **one** exec channel running

```
system "call QSYS/QZDFMDB2 PARM('-d' '-i' '-t')"
```

— IBM i's interactive Db2 CLI — and keep it alive for the life of one
`runRpgSnippet()` call (`Db2Session` in `db2Session.ts`). CL commands are run
through it via `CALL QSYS2.QCMDEXC('CL COMMAND HERE')` SQL statements written
to its stdin. Because it's the same long-lived process the whole time,
everything routed through it shares one QTEMP — confirmed by creating an
object with one `QCMDEXC` call and successfully `CHKOBJ`-ing it with the
next, in the same session.

Two bonuses fell out of this approach:

- The literal `"DB2>"` prompt the CLI prints after every statement is a free,
  built-in completion marker — no text-marker scheme like the shell/pty
  version needed (§1).
- `select ... from table(qsys2.joblog_info('*'))` renders as a clean,
  parseable fixed-width text table directly on the CLI's stdout — no spool
  file, no `CPYSPLF`, no IFS round-trip needed just to read job log
  messages. (`CPYTOIMPF`, the more obvious way to export a query to a flat
  file, is broken on this account — every attempt failed with a generic
  `CPF2817`, even for a trivial one-column control table, so it isn't used
  anywhere in this codebase.)

The known limitation: `QCMDEXC`'s own error reporting only surfaces a
generic top-level message (e.g. "`RNS9310: Compilation failed... N severity
NN errors found`") through `joblog_info`, not the line-by-line `*RNF####`
diagnostics you get from a compile listing. A direct (non-`QCMDEXC`)
`system "CRTBNDRPG ..."` call *does* print the full listing with per-line
errors — but compiling that way means the object lands in a QTEMP that
disappears before a subsequent `CALL` could use it (§2 again). For now,
`compileErrors` in `RunRpgResult` is the generic summary; getting the
detailed per-line listing without giving up QTEMP persistence (e.g. by
parsing `QTEMP/EVFEVENT`, which `OPTION(*EVENTF)` generates as a normal
queryable database file rather than a message-queue-based mechanism) is a
reasonable Phase 3 improvement.

## 5. `runrpg_out()`: open/write/close, not fopen/fputs/fclose, and DFTACTGRP(*NO)

Calling any external (non-RPG) procedure via `extproc(...)` — required for
both approaches below — forces `CRTBNDRPG ... DFTACTGRP(*NO)`. Without it,
compilation fails with `RNF3788: DFTACTGRP(*NO) must be specified for a
prototype that does not have the EXTPGM keyword`. `rpgRunner.ts` always
compiles with `DFTACTGRP(*NO)` because the `runrpg_out()` wrapper is always
present.

The first implementation used the C standard library's buffered I/O
(`fopen`/`fputs`/`fclose`, mode `"a"`). It compiled and ran without error,
but silently produced no file at all — `fopen()` was returning `*NULL`
every time, for any path, and the reason wasn't tracked down (a binding or
signature mismatch was suspected but not confirmed; not worth more time once
the alternative below worked cleanly).

The raw POSIX-style syscalls — `open()` / `write()` / `close()` — work
correctly. One real gotcha here: **the `O_*` flag values on IBM i's ILE C
runtime are not the usual POSIX/Linux ones.** Don't guess them from general
C knowledge; the actual values (confirmed from
`/QIBM/include/fcntl.h`, which is itself stored as an EBCDIC IFS file and
needs `iconv -f IBM-037 -t UTF-8` to read) are:

| Flag       | Value (decimal) |
|------------|-----------------:|
| `O_RDONLY` | 1                |
| `O_WRONLY` | 2                |
| `O_RDWR`   | 4                |
| `O_CREAT`  | 8                |
| `O_EXCL`   | 16               |
| `O_TRUNC`  | 64               |
| `O_APPEND` | 256              |

(For reference, Linux uses `O_RDONLY=0, O_WRONLY=1, O_RDWR=2` — sequential,
not bitmask-based, for the access-mode bits. Porting a snippet from a Linux C
reference without checking would silently open the wrong mode.)

`runrpg_out()` opens with `O_WRONLY | O_CREAT | O_APPEND` (`2 + 8 + 256 =
266`), writes the trimmed argument plus one newline (`x'25'`, the EBCDIC
CCSID-37 newline byte, appended as a literal source character — see §6 for
why the CCSID matters here too), and closes.

## 6. CCSID handling: two different problems, two different fixes

**Uploaded source files.** A `.rpgle` file written as plain UTF-8 (CCSID
1208, what any normal file write produces) cannot be opened by `CRTBNDRPG`
on this system — it fails with `RNS9339: Unable to open file`, regardless of
the file's actual content or location (`/tmp`, `$HOME`, doesn't matter).
Fix: `iconv -f UTF-8 -t IBM-037` to transcode the *bytes*, then `setccsid 37`
to fix the *tag* to match. Doing only `setccsid` without `iconv` is worse
than doing nothing — it relabels UTF-8 bytes as if they were EBCDIC without
converting them, producing a compilable but garbled/mojibake source file
(confirmed: the compiler happily accepted it and printed a source listing
full of box-drawing garbage instead of RPG).

**Downloaded output files.** The stream file `runrpg_out()` writes to gets
created with *this job's* ambient CCSID, not 37 — it was CCSID 273 in every
test here (Austria/Germany EBCDIC), not the 37 used for the source file.
Don't hardcode 273 either; `rpgRunner.ts` reads the real value with
`attr <path> CCSID` before converting, so this keeps working if a different
account/job ends up with a different default.

## Open questions / good next investigations

- Detailed (per-line) compile error messages without losing QTEMP
  persistence — likely means parsing `QTEMP/EVFEVENT` via SQL while still
  inside the same `Db2Session`.
- Why `fopen()` returns `*NULL` here (§5) — never root-caused, just replaced.
- Whether a genuinely submitted batch job (`SBMJOB`, polled for completion)
  behaves differently for DSPLY. Not attempted — `runrpg_out()` made it
  unnecessary, but if a future phase needs unmodified user snippets to work
  (i.e. real `dsply` support), this is the next thing to try.
