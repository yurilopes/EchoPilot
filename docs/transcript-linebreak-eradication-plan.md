# EchoPilot Transcript Linebreak Eradication Plan

## Objective
Eliminate unintended transcript line breaks permanently across backend, transport, and UI rendering.

## Problem Snapshot
Observed transcript output contains per-chunk line breaks:

```text
several strong candidates.
Identify drugs like binaum
Retinib, Pakritinib and sorry
the state and let's take one
Let's do this.
is absolutely approved and used for scale.
```

This behavior indicates one or both of:
- newline separators still present in transcript payload text
- UI rendering mode still allowing visual chunk-per-line output

## End-State Definition
The live transcript must be displayed as a continuous single-line stream in the Live panel.

Acceptance must be proven by all of:
1. `/transcript` payload contains no newline separators.
2. `/ws` transcript events contain no newline separators.
3. Live UI text is displayed in single-line mode without chunk line breaks.
4. Copying transcript text from UI does not reintroduce per-line chunk splits.

## Execution Plan

### Phase 1: Locate the true source of line breaks
Add temporary diagnostics in these points:
- `services/core/src/realtime_system_transcriber/asr_engine.py`
- `services/core/src/realtime_system_transcriber/transcript_store.py`
- `services/core/src/realtime_system_transcriber/runtime.py`
- `apps/web/src/App.tsx`

For each sampled chunk log:
- text length
- escaped representation
- whether it contains newline-like characters
- unique control/separator codepoints

Sampling rule:
- log at most every N chunks to avoid log spam

Exit criteria:
- definitive identification of the earliest stage where line separators appear

### Phase 2: Canonical normalization contract
Backend is source of truth.

Define one canonical normalization function and use it for:
- incoming chunk add
- full transcript assembly
- websocket transcript payload

Canonical rules:
- remove line separators: `\r`, `\n`, `\u000B`, `\u000C`, `\u0085`, `\u2028`, `\u2029`
- remove escaped literals: `\\n`, `\\r`, `\\r\\n`
- replace any whitespace run with a single space
- trim edges

Exit criteria:
- no newline characters in normalized backend output

### Phase 3: Chunk-boundary repair
Repair fragmentation at chunk boundaries:
- if previous chunk ends with `-`, merge next chunk start without extra space
- avoid duplicate spaces on chunk join
- keep punctuation spacing stable

Exit criteria:
- chunk joins read as continuous text

### Phase 4: UI render lock
Live transcript panel must be explicitly single-line:
- plain text in `div`, not `pre`
- `white-space: nowrap`
- `overflow-x: auto`
- no `<br>` insertion path

Frontend keeps lightweight defensive normalization only, not a second canonical policy.

Exit criteria:
- no visual line splits caused by newline preservation

### Phase 5: Regression tests
Backend tests:
- raw newlines
- escaped newlines
- Unicode separators
- control characters
- cross-chunk hyphen merges

Frontend tests:
- multiline input always serializes to single-line displayed text

Integration tests:
- multi-event websocket append with mixed separators yields continuous final text

Exit criteria:
- test suite blocks reintroduction

### Phase 6: Runtime validation
Run live session for 60-90s and capture:
- `GET /transcript`
- transcript websocket messages
- rendered Live transcript text

All three must be newline-free by content contract.

## Verification Commands

```powershell
# Transcript debug run (recommended first)
.\scripts\run-transcript-debug.ps1

# Core tests
cd services\core
.\.venv\Scripts\python -m pytest -q

# Web build
cd ..\..\apps\web
npm run build

# Run app stack
cd ..\..
.\scripts\run-local.ps1
```

## Diagnostic Checklist
Use this checklist after each attempt:

- [ ] ASR raw chunk includes no newline separators, or separators are removed by canonical normalization
- [ ] TranscriptStore output is newline-free
- [ ] WebSocket transcript payload is newline-free
- [ ] React pre-render string is newline-free
- [ ] Live panel visually shows continuous one-line text
- [ ] Copied text from UI has no per-line chunk breaks

## Non-Goals
- Do not change transcript semantics beyond whitespace normalization.
- Do not degrade latency or runtime stability.
- Do not tie live transcription availability to model catalog availability.
