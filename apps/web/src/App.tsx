import { useCallback } from "react";
import { Boxes, Mic, Settings2, Sparkles } from "lucide-react";
import { EchoPilotMark } from "./components/EchoPilotMark";
import { AiWorkspacePanel } from "./components/AiWorkspacePanel";
import { LiveWorkspacePanel } from "./components/LiveWorkspacePanel";
import { ModelsWorkspacePanel } from "./components/ModelsWorkspacePanel";
import { SettingsWorkspacePanel } from "./components/SettingsWorkspacePanel";
import { WorkspaceAlerts } from "./components/WorkspaceAlerts";
import { RuntimeStatusStrip } from "./components/RuntimeStatusStrip";
import { SessionControls } from "./components/SessionControls";
import { useAiWorkspace } from "./hooks/useAiWorkspace";
import { useLiveWorkspace } from "./hooks/useLiveWorkspace";
import { useRuntimeSettings } from "./hooks/useRuntimeSettings";
import { useUiPreferences } from "./hooks/useUiPreferences";
import { useModelsWorkspace } from "./hooks/useModelsWorkspace";
import type { TabKey } from "./types";

const APP_VERSION = "0.7.0";

const APP_TABS: Array<{ key: TabKey; label: string; icon: typeof Mic }> = [
  { key: "live", label: "Live", icon: Mic },
  { key: "ai", label: "AI", icon: Sparkles },
  { key: "models", label: "Models", icon: Boxes },
  { key: "settings", label: "Settings", icon: Settings2 },
];

export function App() {
  const transcriptDebug = (import.meta.env.VITE_ECHOPILOT_TRANSCRIPT_DEBUG ?? "").toString() === "1";
  const {
    activeTab: tab,
    setActiveTab: setTab,
    modelFilter,
    setModelFilter,
    sortBy,
    setSortBy,
    sortDir,
    setSortDir,
    modelFilters,
    setModelFilters,
    autoApplyAfterDownload,
    setAutoApplyAfterDownload,
  } = useUiPreferences();
  const live = useLiveWorkspace({
    setActiveTab: setTab,
    transcriptDebug,
  });

  const runtimeSettings = useRuntimeSettings({
    onCoreUnavailable: live.markBackendConnecting,
  });

  const handleCatalogError = useCallback((error: unknown) => {
    if (String(error).toLowerCase().includes("core api is temporarily unavailable")) {
      live.markBackendConnecting();
      return;
    }
    console.warn("catalog_refresh_failed", error);
  }, [live.markBackendConnecting]);

  const models = useModelsWorkspace({
    settings: runtimeSettings.settings,
    updateSettings: runtimeSettings.updateSettings,
    setActiveTab: setTab,
    preferences: {
      modelFilter,
      setModelFilter,
      sortBy,
      setSortBy,
      sortDir,
      setSortDir,
      modelFilters,
      setModelFilters,
      autoApplyAfterDownload,
      setAutoApplyAfterDownload,
    },
    onCatalogError: handleCatalogError,
  });

  const ai = useAiWorkspace({
    settings: runtimeSettings.settings,
    updateSettings: runtimeSettings.updateSettings,
    status: live.status,
    transcript: live.transcript,
    setAnalysis: live.setAnalysis,
    setActiveTab: setTab,
  });

  return (
    <div className="page page-fill">
      <header className="hero sticky-header">
        <div className="hero-brand">
          <div className="hero-mark" aria-hidden="true">
            <EchoPilotMark size={60} />
          </div>
          <div className="hero-copy">
            <h1 className="hero-title">EchoPilot</h1>
            <p className="hero-subtitle">Live computer-audio transcription & AI analysis</p>
          </div>
        </div>
        <SessionControls
          sessionState={live.sessionState}
          clearTranscriptOnStart={runtimeSettings.settings.clear_transcript_on_start}
          onToggleClearTranscriptOnStart={(checked) => {
            void live.safe(async () => {
              await runtimeSettings.updateSettings({ clear_transcript_on_start: checked }, { persistNow: true });
            });
          }}
          stopCheckboxGapPx={0}
          onStart={() => live.safe(live.onStart)}
          onStop={() => live.safe(live.onStop)}
        />
      </header>

      <RuntimeStatusStrip
        status={live.status}
        settingsModelId={runtimeSettings.settings.model_id}
        settingsEngine={runtimeSettings.settings.asr_engine}
        backendConnecting={live.backendConnecting}
        sessionState={live.sessionState}
      />

      <nav className="tabs">
        {APP_TABS.map((item) => (
          <button key={item.key} type="button" className={`tab ${tab === item.key ? "active" : ""}`} onClick={() => setTab(item.key)}>
            <item.icon size={16} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="workspace-shell">
        <WorkspaceAlerts
          error={live.error}
          backendConnecting={live.backendConnecting}
          fallbackReason={live.status?.fallback_reason}
          queueAlert={models.queueAlert}
        />

        <main className="workspace-content">
          {tab === "live" ? (
            <LiveWorkspacePanel
              transcript={live.displayedTranscript}
              followState={live.followState}
              unreadCount={live.unreadChunks}
              transcriptRef={live.transcriptRef}
              onTranscriptScroll={live.onTranscriptScroll}
              onClearTranscript={() => live.safe(live.onClearTranscript)}
              onJumpToLatest={live.onJumpToLatest}
              analysisText={live.analysis}
              emptyMessage={runtimeSettings.settings.ai_enabled ? "Run an analysis to generate AI insights from your transcript." : "AI analysis is disabled in the AI tab."}
              readinessState={ai.aiReadiness.state}
              readinessMessage={ai.aiReadiness.message}
              aiModelLabel={ai.aiModelLabel}
              analysisStateLabel={ai.analysisStateLabel}
              analysisStateKind={ai.analysisStateKind}
              canAnalyzeNow={ai.canAnalyzeNow}
              analysisBusy={ai.analysisBusy}
              autoAnalysisEnabled={runtimeSettings.settingsLoaded ? runtimeSettings.settings.auto_analysis_enabled : false}
              autoAnalysisLoaded={runtimeSettings.settingsLoaded}
              autoAnalysisSaving={ai.autoAnalysisSaving}
              autoAnalysisError={ai.autoAnalysisError}
              onToggleAutoAnalysis={(checked) => live.safe(async () => ai.onToggleAutoAnalysis(checked))}
              onAnalyzeNow={() => void live.safe(ai.onAnalyzeNow)}
              onOpenAiTab={ai.onOpenAiTab}
            />
          ) : null}

          {tab === "ai" ? <AiWorkspacePanel ai={ai} onSaveApiKey={() => void live.safe(ai.saveApiKey)} /> : null}

          {tab === "models" ? (
            <ModelsWorkspacePanel
              liveStatus={live.status}
              runtimeSettings={runtimeSettings.settings}
              modelFilter={modelFilter}
              setModelFilter={setModelFilter}
              sortBy={sortBy}
              setSortBy={setSortBy}
              sortDir={sortDir}
              setSortDir={setSortDir}
              modelFilters={modelFilters}
              filterOptions={models.filterOptions}
              activeModels={models.activeModels}
              downloadState={models.downloadState}
              warmupInfo={models.warmupInfo}
              elapsedSeconds={models.elapsedSeconds}
              autoApplyAfterDownload={autoApplyAfterDownload}
              setAutoApplyAfterDownload={setAutoApplyAfterDownload}
              onEngineChange={(engine) => { void live.safe(async () => models.onEngineChange(engine)); }}
              onSelectModel={() => { void live.safe(models.onSelectModel); }}
              onApplyToRuntime={() => { void live.safe(models.onApplyToRuntime); }}
              onUseModel={(modelId) => { void live.safe(async () => models.onUseModel(modelId)); }}
              onDownload={(modelId) => { void live.safe(async () => models.onDownload(modelId)); }}
              onCancel={(taskId) => { void live.safe(async () => models.onCancel(taskId)); }}
              onRetry={(taskId) => { void live.safe(async () => models.onRetry(taskId)); }}
              onWarmup={() => { void live.safe(models.onWarmup); }}
              toggleFilter={models.toggleFilter}
              clearFilters={models.clearFilters}
            />
          ) : null}

          {tab === "settings" ? (
            <SettingsWorkspacePanel
              settings={runtimeSettings.settings}
              status={live.status}
              onLanguageChange={(value) => {
                void live.safe(async () => {
                  await runtimeSettings.updateSettings({ language: value });
                });
              }}
              onChunkSecondsChange={(value) => {
                void live.safe(async () => {
                  await runtimeSettings.updateSettings({ chunk_seconds: value });
                });
              }}
              onSaveRuntimeSettings={() => void live.safe(async () => { await runtimeSettings.saveRuntimeSettings(); await models.refreshCatalog(); })}
            />
          ) : null}
        </main>
        <footer className="app-footer">
          <div className="footer-item">EchoPilot v{APP_VERSION}</div>
          <div className="footer-item">Local processing only</div>
          <div className="footer-item">Your data stays on this device</div>
        </footer>
      </div>
    </div>
  );
}
