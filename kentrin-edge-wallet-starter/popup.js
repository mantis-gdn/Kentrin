import { sendMessage } from "./ui-bridge.js";

const $ = (id) => document.getElementById(id);

function write(text) {
  $("output").textContent = typeof text === "string" ? text : JSON.stringify(text, null, 2);
}

async function refresh() {
  const state = await sendMessage({ type: "GET_EXTENSION_STATE" });
  $("walletState").textContent = state.hasWallet ? "Wallet exists" : "Not created";
  $("address").textContent = state.address || "—";
  $("lockState").textContent = state.unlocked ? "Unlocked in current session" : "Locked / no session";
}

$("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

$("refreshState").addEventListener("click", async () => {
  await refresh();
  write("State refreshed.");
});

$("lockBtn").addEventListener("click", async () => {
  const result = await sendMessage({ type: "LOCK_WALLET" });
  await refresh();
  write(result);
});

$("clearSessionBtn").addEventListener("click", async () => {
  const result = await sendMessage({ type: "CLEAR_SESSION" });
  await refresh();
  write(result);
});

$("scanBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  write("Open the dashboard and use Scan Notes.");
});

$("sendBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  write("Open the dashboard and use the Send panel.");
});

refresh().catch(err => write({ error: err.message }));
