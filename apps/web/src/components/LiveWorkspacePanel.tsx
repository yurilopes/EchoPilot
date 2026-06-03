import { LiveTranscriptPane } from "./LiveTranscriptPane";
import { AnalysisPane } from "./AnalysisPane";
import type { AiReadinessState, TranscriptFollowState } from "../types";
import type { RefObject, UIEvent } from "react";

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
  onToggleAutoAnalysis: (checked: boolean) => Promise<void>;
  onAnalyzeNow: () => void;
  onOpenAiTab: () => void;
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
  onToggleAutoAnalysis,
  onAnalyzeNow,
  onOpenAiTab,
}: Props) {
  const hasAnalysis = analysisText.trim().length > 0;

  return (
    <section className="live-grid live-fill">
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
        onToggleAutoAnalysis={onToggleAutoAnalysis}
        onAnalyzeNow={onAnalyzeNow}
        onOpenAiTab={onOpenAiTab}
      />
    </section>
  );
}
