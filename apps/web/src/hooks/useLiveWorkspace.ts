import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction, UIEvent } from "react";
import { apiGet, apiPost, socketUrl } from "../api";
import type { RuntimeStatus, SessionUiState, TabKey, TranscriptFollowState } from "../types";
import { deriveSessionState } from "../uiState";

type UseLiveWorkspaceArgs = {
  setActiveTab: (tab: TabKey) => void;
  transcriptDebug: boolean;
};

type LiveWorkspace = {
  status: RuntimeStatus | null;
  transcript: string;
  analysis: string;
  error: string;
  backendConnecting: boolean;
  inFlight: "none" | "starting" | "stopping";
  followState: TranscriptFollowState;
  unreadChunks: number;
  sessionState: SessionUiState;
  displayedTranscript: string;
  transcriptRef: RefObject<HTMLDivElement | null>;
  setAnalysis: Dispatch<SetStateAction<string>>;
  safe: (fn: () => Promise<void>) => Promise<void>;
  markBackendConnecting: () => void;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
  onTranscriptScroll: (ev: UIEvent<HTMLDivElement>) => void;
  onClearTranscript: () => Promise<void>;
  onJumpToLatest: () => void;
};

function normalizeTranscriptChunk(value: string): string {
  return value
    .replace(/-\s*[\r\n\u000B\u000C\u0085\u2028\u2029]+\s*/g, "")
    .replace(/\\r\\n|\\n|\\r/g, " ")
    .replace(/[\r\n\u000B\u000C\u0085\u2028\u2029]+/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/[\u0000-\u0009\u000E-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function useLiveWorkspace({ setActiveTab, transcriptDebug }: UseLiveWorkspaceArgs): LiveWorkspace {
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [transcript, setTranscript] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [error, setError] = useState("");
  const [backendConnecting, setBackendConnecting] = useState(false);
  const [inFlight, setInFlight] = useState<"none" | "starting" | "stopping">("none");
  const [followState, setFollowState] = useState<TranscriptFollowState>("following");
  const [unreadChunks, setUnreadChunks] = useState(0);
  const [optimisticRunTarget, setOptimisticRunTarget] = useState<boolean | null>(null);
  const [optimisticRunUntil, setOptimisticRunUntil] = useState<number>(0);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const followStateRef = useRef<TranscriptFollowState>("following");
  const nowMs = Date.now();

  const hasOptimisticRun = optimisticRunTarget !== null && nowMs < optimisticRunUntil;
  const effectiveRunning = hasOptimisticRun ? optimisticRunTarget : (status?.running ?? false);
  const sessionState = useMemo(
    () => deriveSessionState({ ...(status ?? ({} as RuntimeStatus)), running: effectiveRunning }, inFlight, !!error),
    [status, effectiveRunning, inFlight, error],
  );
  const displayedTranscript = useMemo(() => normalizeTranscriptChunk(transcript), [transcript]);

  const safe = async (fn: () => Promise<void>) => {
    try {
      await fn();
      setError("");
    } catch (e) {
      if (String(e).toLowerCase().includes("core api is temporarily unavailable")) {
        setBackendConnecting(true);
        return;
      }
      setError(String(e));
    }
  };

  const isTransientCoreUnavailable = (value: unknown): boolean =>
    String(value).toLowerCase().includes("core api is temporarily unavailable");

  const reconcileRunningStateAfterTransientError = async (expectedRunning: boolean): Promise<boolean> => {
    try {
      const health = await apiGet<{ status: RuntimeStatus }>("/health");
      setStatus(health.status);
      const matches = !!health.status?.running === expectedRunning;
      if (matches) {
        setOptimisticRunTarget(expectedRunning);
        setOptimisticRunUntil(Date.now() + 2500);
        setError("");
        return true;
      }
    } catch {
      // keep original error path
    }
    return false;
  };

  useEffect(() => {
    let stopped = false;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let healthProbeTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    let connectionId = 0;

    const clearTimers = () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (healthProbeTimer) clearTimeout(healthProbeTimer);
      retryTimer = null;
      healthProbeTimer = null;
    };

    const probeHealth = async () => {
      try {
        await apiGet<{ status: RuntimeStatus }>("/health");
        if (!stopped) {
          setBackendConnecting(false);
        }
        return true;
      } catch {
        if (!stopped) {
          setBackendConnecting(true);
        }
        return false;
      }
    };

    const scheduleReconnect = () => {
      if (stopped) return;
      reconnectAttempts += 1;
      const delay = Math.min(8000, 400 * (2 ** Math.max(0, reconnectAttempts - 1)));
      if (reconnectAttempts >= 3) {
        setBackendConnecting(true);
      }
      console.info("ws_reconnect_attempt", { reconnectAttempts, delay });
      retryTimer = setTimeout(connect, delay);
    };

    apiGet<{ status: RuntimeStatus }>("/health")
      .then((x) => {
        if (stopped) return;
        setStatus(x.status);
        setBackendConnecting(false);
      })
      .catch((e) => {
        if (stopped) return;
        if (String(e).toLowerCase().includes("core api is temporarily unavailable")) {
          setBackendConnecting(true);
          return;
        }
        setError(String(e));
      });

    apiGet<{ text: string }>("/transcript")
      .then((x) => {
        if (stopped) return;
        setTranscript(normalizeTranscriptChunk(String(x.text ?? "")));
      })
      .catch(() => undefined);

    const connect = () => {
      if (stopped) return;
      const currentConnectionId = ++connectionId;
      ws = new WebSocket(socketUrl());
      ws.onopen = () => {
        if (stopped || currentConnectionId !== connectionId) return;
        reconnectAttempts = 0;
        setBackendConnecting(false);
        clearTimers();
      };
      ws.onmessage = (event) => {
        if (stopped || currentConnectionId !== connectionId) return;
        const msg = JSON.parse(event.data);
        if (msg.type === "status") setStatus(msg.data as RuntimeStatus);
        if (msg.type === "transcript") {
          const normalized = normalizeTranscriptChunk(String(msg.text ?? ""));
          if (!normalized) return;
          if (transcriptDebug && /[\r\n\u0085\u2028\u2029]/.test(String(msg.text ?? ""))) {
            console.debug("transcript_debug_ws_payload_contains_linebreak", JSON.stringify(msg.text ?? "").slice(0, 240));
          }
          setTranscript((prev) => normalizeTranscriptChunk(`${prev}${prev ? " " : ""}${normalized}`));
          if (followStateRef.current === "paused") setUnreadChunks((v) => v + 1);
        }
        if (msg.type === "analysis_start") {
          setAnalysis("");
        }
        if (msg.type === "analysis_delta") {
          setAnalysis((prev) => `${prev}${String(msg.text ?? "")}`);
        }
        if (msg.type === "analysis") {
          setAnalysis(msg.text);
        }
        if (msg.type === "transcript_reset" || msg.type === "analysis_reset") {
          setTranscript("");
          setAnalysis("");
          setUnreadChunks(0);
          setFollowState("following");
          transcriptRef.current?.scrollTo({ top: 0, behavior: "auto" });
        }
        if (msg.type === "error") setError(msg.message);
      };
      ws.onclose = (event) => {
        if (stopped || currentConnectionId !== connectionId) return;
        clearTimers();
        console.info("ws_closed", {
          reconnectAttempts,
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
        healthProbeTimer = setTimeout(() => {
          void probeHealth();
        }, 200);
        scheduleReconnect();
      };
      ws.onerror = () => ws?.close();
    };

    connect();
    return () => {
      stopped = true;
      clearTimers();
      ws?.close();
    };
  }, [transcriptDebug]);

  useEffect(() => {
    if (followState !== "following") return;
    const el = transcriptRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    if (unreadChunks > 0) setUnreadChunks(0);
  }, [transcript, followState, unreadChunks]);

  const onStart = async () => {
    if (inFlight !== "none") return;
    setInFlight("starting");
    setActiveTab("live");
    try {
      await apiPost("/transcription/start");
      setOptimisticRunTarget(true);
      setOptimisticRunUntil(Date.now() + 2500);
    } catch (e) {
      if (isTransientCoreUnavailable(e)) {
        const recovered = await reconcileRunningStateAfterTransientError(true);
        if (recovered) return;
      }
      throw e;
    } finally {
      setInFlight("none");
    }
  };

  const onStop = async () => {
    if (inFlight !== "none") return;
    setInFlight("stopping");
    try {
      await apiPost("/transcription/stop");
      setOptimisticRunTarget(false);
      setOptimisticRunUntil(Date.now() + 2500);
    } catch (e) {
      if (isTransientCoreUnavailable(e)) {
        const recovered = await reconcileRunningStateAfterTransientError(false);
        if (recovered) return;
      }
      throw e;
    } finally {
      setInFlight("none");
    }
  };

  const onTranscriptScroll = (ev: UIEvent<HTMLDivElement>) => {
    const el = ev.currentTarget;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    setFollowState(nearBottom ? "following" : "paused");
  };

  const onClearTranscript = async () => {
    await apiPost("/transcript/clear");
    setTranscript("");
    setAnalysis("");
    setUnreadChunks(0);
    setFollowState("following");
    transcriptRef.current?.scrollTo({ top: 0, behavior: "auto" });
  };

  const onJumpToLatest = () => {
    setFollowState("following");
    setUnreadChunks(0);
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  };

  const markBackendConnecting = useCallback(() => {
    setBackendConnecting(true);
  }, []);

  return {
    status,
    transcript,
    analysis,
    error,
    backendConnecting,
    inFlight,
    followState,
    unreadChunks,
    sessionState,
    displayedTranscript,
    transcriptRef,
    setAnalysis,
    safe,
    markBackendConnecting,
    onStart,
    onStop,
    onTranscriptScroll,
    onClearTranscript,
    onJumpToLatest,
  };
}
