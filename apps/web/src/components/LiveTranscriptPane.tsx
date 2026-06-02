import { ArrowDown, FileText } from "lucide-react";
import type { RefObject, UIEvent } from "react";
import type { TranscriptFollowState } from "../types";

type Props = {
  text: string;
  followState: TranscriptFollowState;
  unreadCount: number;
  preRef: RefObject<HTMLDivElement | null>;
  onScroll: (ev: UIEvent<HTMLDivElement>) => void;
  onClearTranscript: () => void;
  onJumpToLatest: () => void;
};

export function LiveTranscriptPane({ text, followState, unreadCount, preRef, onScroll, onClearTranscript, onJumpToLatest }: Props) {
  const singleLineText = text.replace(/\s+/g, " ").trim();
  const hasTranscript = singleLineText.length > 0;

  return (
    <article className="panel transcript-panel">
      <div className="panel-head">
        <h2>Live Transcript</h2>
        <button className="btn btn-quiet transcript-clear" onClick={onClearTranscript}>Clear transcript</button>
      </div>
      <div ref={preRef} className="transcript-pre" onScroll={onScroll}>
        {hasTranscript ? (
          <span className="transcript-line">{singleLineText}</span>
        ) : (
          <div className="transcript-empty">
            <div className="transcript-empty-icon">
              <FileText size={28} />
            </div>
            <strong>No transcript yet.</strong>
            <span className="muted">Start the session to begin live transcription.</span>
          </div>
        )}
      </div>
      {followState === "paused" ? (
        <div className="row transcript-jump">
          <button className="btn" onClick={onJumpToLatest}><ArrowDown size={14} /> Jump to latest</button>
          {unreadCount > 0 ? <span className="badge badge-soft">{unreadCount} new lines</span> : <span className="muted">No new lines yet.</span>}
        </div>
      ) : null}
    </article>
  );
}
