import { invoke } from "@tauri-apps/api/core";

const aot = document.getElementById("aot") as HTMLButtonElement;
const pip = document.getElementById("pip") as HTMLButtonElement;
const state = document.getElementById("state") as HTMLSpanElement;

aot.onclick = async () => {
  const value = await invoke<boolean>("toggle_always_on_top");
  state.textContent = `Always On Top: ${value}`;
};

pip.onclick = async () => {
  const value = await invoke<boolean>("toggle_pip_mode");
  state.textContent = `PiP mode: ${value}`;
};

invoke("backend_health")
  .then((msg) => { state.textContent = `Backend: ${String(msg)}`; })
  .catch((err) => { state.textContent = `Backend error: ${String(err)}`; });
