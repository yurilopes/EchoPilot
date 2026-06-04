import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

const ALWAYS_ON_TOP_KEY = "echopilot.desktop.alwaysOnTop";
const CAPTURE_EXCLUSION_KEY = "echopilot.desktop.captureExclusion";

function readStoredBoolean(key: string): boolean {
  return localStorage.getItem(key) === "true";
}

type ControlKey = "alwaysOnTop" | "captureExclusion";

export function DesktopWindowControls() {
  const [available, setAvailable] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [captureExclusion, setCaptureExclusion] = useState(false);
  const [saving, setSaving] = useState<ControlKey | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isTauri()) return;
    setAvailable(true);

    const storedAlwaysOnTop = readStoredBoolean(ALWAYS_ON_TOP_KEY);
    const storedCaptureExclusion = readStoredBoolean(CAPTURE_EXCLUSION_KEY);
    setAlwaysOnTop(storedAlwaysOnTop);
    setCaptureExclusion(storedCaptureExclusion);

    void applyAlwaysOnTop(storedAlwaysOnTop, false);
    void applyCaptureExclusion(storedCaptureExclusion, false);
  }, []);

  if (!available) return null;

  async function applyAlwaysOnTop(enabled: boolean, updateMessage = true) {
    setSaving("alwaysOnTop");
    try {
      const value = await invoke<boolean>("set_always_on_top", { enabled });
      setAlwaysOnTop(value);
      localStorage.setItem(ALWAYS_ON_TOP_KEY, String(value));
      if (updateMessage) setMessage(`Always on top ${value ? "on" : "off"}`);
    } catch (err) {
      setAlwaysOnTop(readStoredBoolean(ALWAYS_ON_TOP_KEY));
      setMessage(`Always on top failed: ${String(err)}`);
    } finally {
      setSaving(null);
    }
  }

  async function applyCaptureExclusion(enabled: boolean, updateMessage = true) {
    setSaving("captureExclusion");
    try {
      const value = await invoke<boolean>("set_capture_exclusion", { enabled });
      setCaptureExclusion(value);
      localStorage.setItem(CAPTURE_EXCLUSION_KEY, String(value));
      if (updateMessage) setMessage(`Screen capture ${value ? "hidden" : "visible"}`);
    } catch (err) {
      setCaptureExclusion(readStoredBoolean(CAPTURE_EXCLUSION_KEY));
      setMessage(`Screen capture failed: ${String(err)}`);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="desktop-window-controls" aria-label="Desktop window controls">
      <label className="desktop-window-toggle">
        <input
          type="checkbox"
          checked={alwaysOnTop}
          disabled={saving === "alwaysOnTop"}
          onChange={(event) => {
            setAlwaysOnTop(event.target.checked);
            void applyAlwaysOnTop(event.target.checked);
          }}
        />
        <span>Always on top</span>
      </label>
      <label className="desktop-window-toggle">
        <input
          type="checkbox"
          checked={captureExclusion}
          disabled={saving === "captureExclusion"}
          onChange={(event) => {
            setCaptureExclusion(event.target.checked);
            void applyCaptureExclusion(event.target.checked);
          }}
        />
        <span>Hide from screen capture</span>
      </label>
      <span className="desktop-window-status">{message}</span>
    </div>
  );
}
