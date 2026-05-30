# EchoPilot Transcript Linebreak Validation Checklist

## Goal
Prove that live transcript text no longer contains unintended line breaks across backend, transport, and UI.

## Test Session Metadata
- Date:
- Tester:
- Branch/commit:
- Engine/model:
- Language:
- Chunk seconds:

## Preparation
- [ ] Open PowerShell in project root.
- [ ] Start debug run:

```powershell
.\scripts\run-transcript-debug.ps1
```

- [ ] Start transcription and let it run for 30 to 60 seconds.

## Evidence Capture

### A. Raw ASR chunk diagnostics
- [ ] Collected log lines containing `transcript_debug_raw_chunk`.
- [ ] At least 3 samples captured.
- [ ] Any `contains_linebreak=true` in raw chunks?
  - Result: `YES` / `NO`
  - Notes:

### B. Normalized chunk diagnostics
- [ ] Collected log lines containing `transcript_debug_normalized_chunk`.
- [ ] At least 3 samples captured.
- [ ] Any `contains_linebreak=true` after normalization?
  - Result: `YES` / `NO`
  - Notes:

### C. Backend full transcript payload
Run:

```powershell
Invoke-RestMethod http://127.0.0.1:8765/transcript | Select-Object -ExpandProperty text
```

- [ ] Output captured.
- [ ] Output contains no line breaks.
  - Result: `PASS` / `FAIL`
  - Notes:

Optional automated check:

```powershell
.\scripts\check-transcript-linebreaks.ps1
```

### D. WebSocket/UI path
- [ ] UI Live Transcript observed during active stream.
- [ ] No per-chunk line breaks shown in UI.
  - Result: `PASS` / `FAIL`
  - Notes:

- [ ] Copied text from UI and pasted into plain text editor.
- [ ] Pasted text is continuous and has no unintended line breaks.
  - Result: `PASS` / `FAIL`
  - Notes:

## Root Cause Decision Matrix
- If raw chunk contains line breaks:
  - Root cause area: `ASR/chunk generation`
- If raw chunk clean, normalized chunk has line breaks:
  - Root cause area: `Backend normalization`
- If backend payload clean, UI still breaks:
  - Root cause area: `Frontend rendering`

Selected root cause:
- [ ] ASR/chunk
- [ ] Backend normalization
- [ ] Frontend rendering

## Acceptance Gate (all required)
- [ ] `/transcript` payload has no line breaks.
- [ ] Normalized WS/UI path has no line breaks.
- [ ] Live UI shows continuous transcript without per-chunk line splits.
- [ ] Copied UI text is also continuous.

Final decision:
- [ ] PASS (issue resolved)
- [ ] FAIL (continue fix cycle)

## Follow-up Actions (if FAIL)
- [ ] Apply fix in detected root-cause layer only.
- [ ] Re-run this checklist from Preparation.
- [ ] Attach before/after evidence snippets.
