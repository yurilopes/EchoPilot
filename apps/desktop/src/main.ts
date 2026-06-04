import { invoke } from "@tauri-apps/api/core";

const aot = document.getElementById("aot") as HTMLInputElement;
const captureExclusion = document.getElementById("capture-exclusion") as HTMLInputElement;
const pip = document.getElementById("pip") as HTMLButtonElement;
const state = document.getElementById("state") as HTMLSpanElement;

const ALWAYS_ON_TOP_KEY = "echopilot.desktop.alwaysOnTop";
const CAPTURE_EXCLUSION_KEY = "echopilot.desktop.captureExclusion";

function readStoredBoolean(key: string): boolean {
  return localStorage.getItem(key) === "true";
}

async function applyAlwaysOnTop(enabled: boolean) {
  const previous = aot.checked;
  aot.disabled = true;
  try {
    const value = await invoke<boolean>("set_always_on_top", { enabled });
    aot.checked = value;
    localStorage.setItem(ALWAYS_ON_TOP_KEY, String(value));
    state.textContent = `Always on top: ${value ? "on" : "off"}`;
  } catch (err) {
    aot.checked = previous;
    state.textContent = `Always on top error: ${String(err)}`;
  } finally {
    aot.disabled = false;
  }
}

async function applyCaptureExclusion(enabled: boolean) {
  const previous = captureExclusion.checked;
  captureExclusion.disabled = true;
  try {
    const value = await invoke<boolean>("set_capture_exclusion", { enabled });
    captureExclusion.checked = value;
    localStorage.setItem(CAPTURE_EXCLUSION_KEY, String(value));
    state.textContent = `Screen capture: ${value ? "hidden" : "visible"}`;
  } catch (err) {
    captureExclusion.checked = previous;
    state.textContent = `Screen capture error: ${String(err)}`;
  } finally {
    captureExclusion.disabled = false;
  }
}

aot.onchange = () => {
  void applyAlwaysOnTop(aot.checked);
};

captureExclusion.onchange = () => {
  void applyCaptureExclusion(captureExclusion.checked);
};

pip.onclick = async () => {
  const value = await invoke<boolean>("toggle_pip_mode");
  state.textContent = `PiP mode: ${value}`;
};

invoke("backend_health")
  .then((msg) => { state.textContent = `Backend: ${String(msg)}`; })
  .catch((err) => { state.textContent = `Backend error: ${String(err)}`; });

aot.checked = readStoredBoolean(ALWAYS_ON_TOP_KEY);
captureExclusion.checked = readStoredBoolean(CAPTURE_EXCLUSION_KEY);
void applyAlwaysOnTop(aot.checked);
void applyCaptureExclusion(captureExclusion.checked);
