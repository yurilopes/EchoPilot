import { LiveTranscriptPane } from "./LiveTranscriptPane";
import { AnalysisPane } from "./AnalysisPane";
import type { AiReadinessState, LivePanelFocus, TranscriptFollowState } from "../types";
import type { CSSProperties, RefObject, UIEvent } from "react";

type Props = {
  transcript: string;
  followState: TranscriptFollowState;
  unreadCount: number;
  transcriptRef: RefObject<HTMLDivElement | null>;
  onTranscriptScroll: (ev: UIEvent<HTMLDivElement>) => void;
  onClearTranscript: () => void;
  onJumpToLatest: () => void;
  analysisText: string;
  emptyMessage: string;
  readinessState: AiReadinessState;
  readinessMessage: string;
  aiModelLabel: "Flash" | "Pro";
  analysisStateLabel: string;
  analysisStateKind: "unavailable" | "ready" | "waiting" | "up-to-date" | "in-progress";
  canAnalyzeNow: boolean;
  analysisBusy: boolean;
  autoAnalysisEnabled: boolean;
  autoAnalysisLoaded: boolean;
  autoAnalysisSaving: boolean;
  autoAnalysisError: string;
  onToggleAutoAnalysis: (checked: boolean) => Promise<void>;
  onAnalyzeNow: () => void;
  onOpenAiTab: () => void;
  livePanelFocus: LivePanelFocus;
};

const LIVE_PANEL_COLUMNS: Record<LivePanelFocus, string> = {
  "70/30": "minmax(0, 7fr) minmax(0, 3fr)",
  "50/50": "minmax(0, 1fr) minmax(0, 1fr)",
  "30/70": "minmax(0, 3fr) minmax(0, 7fr)",
};

export function LiveWorkspacePanel({
  transcript,
  followState,
  unreadCount,
  transcriptRef,
  onTranscriptScroll,
  onClearTranscript,
  onJumpToLatest,
  analysisText,
  emptyMessage,
  readinessState,
  readinessMessage,
  aiModelLabel,
  analysisStateLabel,
  analysisStateKind,
  canAnalyzeNow,
  analysisBusy,
  autoAnalysisEnabled,
  autoAnalysisLoaded,
  autoAnalysisSaving,
  autoAnalysisError,
  onToggleAutoAnalysis,
  onAnalyzeNow,
  onOpenAiTab,
  livePanelFocus,
}: Props) {
  const hasAnalysis = analysisText.trim().length > 0;
  const gridStyle = {
    "--live-grid-columns": LIVE_PANEL_COLUMNS[livePanelFocus],
  } as CSSProperties;

  return (
    <section className="live-workspace live-fill">
      <div className="live-grid" style={gridStyle}>
        <LiveTranscriptPane
          text={transcript}
          followState={followState}
          unreadCount={unreadCount}
          preRef={transcriptRef}
          onScroll={onTranscriptScroll}
          onClearTranscript={onClearTranscript}
          onJumpToLatest={onJumpToLatest}
        />
        <AnalysisPane
          analysisText={analysisText}
          hasAnalysis={hasAnalysis}
          emptyMessage={emptyMessage}
          readinessState={readinessState}
          readinessMessage={readinessMessage}
          aiModelLabel={aiModelLabel}
          analysisStateLabel={analysisStateLabel}
          analysisStateKind={analysisStateKind}
          canAnalyzeNow={canAnalyzeNow}
          analysisBusy={analysisBusy}
          autoAnalysisEnabled={autoAnalysisEnabled}
          autoAnalysisLoaded={autoAnalysisLoaded}
          autoAnalysisSaving={autoAnalysisSaving}
          autoAnalysisError={autoAnalysisError}
          onToggleAutoAnalysis={onToggleAutoAnalysis}
          onAnalyzeNow={onAnalyzeNow}
          onOpenAiTab={onOpenAiTab}
        />
      </div>
    </section>
  );
}
