import { ArrowDown } from "lucide-react";
import type { RefObject, UIEvent } from "react";
import type { TranscriptFollowState } from "../types";

type Props = {
  text: string;
  followState: TranscriptFollowState;
  unreadCount: number;
  preRef: RefObject<HTMLDivElement | null>;
  onScroll: (ev: UIEvent<HTMLDivElement>) => void;
  onJumpToLatest: () => void;
};

export function LiveTranscriptPane({ text, followState, unreadCount, preRef, onScroll, onJumpToLatest }: Props) {
  const singleLineText = text.replace(/\s+/g, " ").trim();

  return (
    <article className="panel transcript-panel">
      <div className="panel-head">
        <h2>Live Transcript</h2>
        <span className={`badge badge-primary ${followState === "following" ? "badge-selected" : ""}`}>
          {followState === "following" ? "Following" : "Paused"}
        </span>
      </div>
      <div ref={preRef} className="transcript-pre" onScroll={onScroll}>
        <span className="transcript-line">{singleLineText || "No transcript yet."}</span>
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
