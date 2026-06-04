import { AiReadinessCard } from "./AiReadinessCard";
import type { AiWorkspace } from "../hooks/useAiWorkspace";
import { ANALYSIS_LANGUAGE_OPTIONS } from "../languageOptions";

type Props = {
  ai: AiWorkspace;
  onSaveApiKey: () => void;
};

export function AiWorkspacePanel({ ai, onSaveApiKey }: Props) {
  return (
    <section className="panel tab-panel ai-tab-panel">
      <div className="panel-head">
        <h2>AI Configuration</h2>
        <AiReadinessCard readinessState={ai.aiReadiness.state} readinessMessage={ai.aiReadiness.message} statusLabel={ai.aiStatusLabel} />
      </div>
      <div className="form-grid ai-form-grid">
        <label>
          Enable AI analysis
          <select value={ai.aiEnabled ? "yes" : "no"} onChange={(e) => ai.setAiEnabled(e.target.value === "yes")}>
            <option value="yes">Enabled</option>
            <option value="no">Disabled</option>
          </select>
        </label>
        <label>
          Base URL
          <input value={ai.baseUrl} onChange={(e) => ai.setBaseUrl(e.target.value)} />
        </label>
        <label>
          Model Name
          <select value={ai.llmModel} onChange={(e) => ai.setLlmModel(e.target.value)}>
            <option value="deepseek-v4-flash">DeepSeek V4 Flash</option>
            <option value="deepseek-v4-pro">DeepSeek V4 Pro</option>
          </select>
        </label>
        <label>
          Response Language
          <select value={ai.analysisLanguage} onChange={(e) => ai.setAnalysisLanguage(e.target.value)}>
            {ANALYSIS_LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          Periodic Analysis (s)
          <input type="number" min={0} max={600} value={ai.analysisIntervalSeconds} onChange={(e) => ai.setAnalysisIntervalSeconds(Number(e.target.value))} />
        </label>
        <label className="wide">
          Analysis Prompt
          <textarea value={ai.prompt} onChange={(e) => ai.setPrompt(e.target.value)} />
        </label>
        <label className="wide">
          API Key (stored in Windows Credential Manager)
          <input type="text" value={ai.apiKeyInputValue} onFocus={ai.onApiKeyFocus} onChange={(e) => ai.onApiKeyChange(e.target.value)} />
        </label>
        <div className="wide muted ai-help-line">Lower periodic values increase API usage and UI churn.</div>
        <div className="row wide">
          <button className="btn" onClick={onSaveApiKey}>Save API Key</button>
        </div>
      </div>
    </section>
  );
}
