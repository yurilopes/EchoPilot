type Props = {
  error: string;
  backendConnecting: boolean;
  fallbackReason?: string | null;
  queueAlert: string;
};

export function WorkspaceAlerts({ error, backendConnecting, fallbackReason, queueAlert }: Props) {
  return (
    <div className="workspace-alerts">
      {error ? <div className="error">{error}</div> : null}
      {backendConnecting ? <div className="warning">Reconnecting to core backend...</div> : null}
      {fallbackReason ? <div className="warning">CUDA fallback active: {fallbackReason}</div> : null}
      {queueAlert ? <div className="warning">{queueAlert}</div> : null}
    </div>
  );
}
