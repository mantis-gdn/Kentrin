import { sendMessage } from "./ui-bridge.js";

const $ = (id) => document.getElementById(id);
let latestPreview = null;

function write(value) {
  $("output").textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

async function refreshState() {
  const state = await sendMessage({ type: "GET_WALLET_DETAILS" });
  $("walletNameView").textContent = state.walletName || "—";
  $("walletStatus").textContent = state.hasWallet ? (state.unlocked ? "Unlocked" : "Locked") : "No wallet";
  $("walletAddress").textContent = state.address || "—";
}

$("restoreToggle").addEventListener("click", () => {
  $("recoveryWrap").classList.toggle("hidden");
});

$("createWallet").addEventListener("click", async () => {
  try {
    const password = $("walletPassword").value.trim();
    const walletName = $("walletName").value.trim() || "Kentrin Wallet";
    const result = await sendMessage({
      type: "CREATE_WALLET",
      payload: { password, walletName }
    });

    if (!result.ok) throw new Error(result.error || "Create wallet failed.");
    $("recoveryPreview").value = result.recoveryPhrase;
    write({
      message: "Wallet created. Write down the recovery phrase now.",
      address: result.address
    });
    await refreshState();
  } catch (err) {
    write({ error: err.message });
  }
});

$("restoreWallet").addEventListener("click", async () => {
  try {
    const recoveryPhrase = $("recoveryPhrase").value.trim();
    const password = $("restorePassword").value.trim();
    const walletName = $("walletName").value.trim() || "Kentrin Wallet";
    const result = await sendMessage({
      type: "RESTORE_WALLET",
      payload: { recoveryPhrase, password, walletName }
    });

    if (!result.ok) throw new Error(result.error || "Restore wallet failed.");
    $("recoveryPreview").value = result.recoveryPhrase;
    write({
      message: "Wallet restored.",
      address: result.address
    });
    await refreshState();
  } catch (err) {
    write({ error: err.message });
  }
});

$("unlockWallet").addEventListener("click", async () => {
  try {
    const password = $("walletPassword").value.trim();
    const result = await sendMessage({
      type: "UNLOCK_WALLET",
      payload: { password }
    });
    if (!result.ok) throw new Error(result.error || "Unlock failed.");
    write(result);
    await refreshState();
  } catch (err) {
    write({ error: err.message });
  }
});

$("lockWallet").addEventListener("click", async () => {
  const result = await sendMessage({ type: "LOCK_WALLET" });
  write(result);
  await refreshState();
});

$("saveWalletName").addEventListener("click", async () => {
  const result = await sendMessage({
    type: "SAVE_WALLET_NAME",
    payload: { walletName: $("walletName").value.trim() }
  });
  write(result);
});

$("copyAddress").addEventListener("click", async () => {
  const text = $("walletAddress").textContent;
  if (text && text !== "—") {
    await navigator.clipboard.writeText(text);
    write("Address copied.");
  }
});

$("clearWallet").addEventListener("click", async () => {
  const confirmed = confirm("Delete local wallet data from this extension?");
  if (!confirmed) return;

  const result = await sendMessage({ type: "DELETE_WALLET" });
  $("recoveryPreview").value = "";
  $("notesJson").value = "";
  $("sendPreview").value = "";
  latestPreview = null;
  write(result);
  await refreshState();
});

$("scanNotes").addEventListener("click", async () => {
  try {
    const address = $("walletAddress").textContent.trim();
    if (!address || address === "—") throw new Error("Unlock wallet first.");
    const apiBase = $("apiBase").value.trim() || "https://www.kentrin.com";
    const noteIdsRaw = prompt("Paste known note IDs separated by commas or spaces for now.");
    const noteIds = (noteIdsRaw || "")
      .split(/[\s,]+/)
      .map(x => x.trim().toLowerCase())
      .filter(Boolean);

    const result = await sendMessage({
      type: "SCAN_NOTES",
      payload: { apiBase, address, noteIds }
    });

    if (!result.ok) throw new Error(result.error || "Scan failed.");
    $("notesJson").value = JSON.stringify(result.notes, null, 2);
    $("cachedCount").textContent = String(result.notes.length);
    const firstOwner = result.notes.find(n => n.current_owner)?.current_owner || "—";
    $("currentOwner").textContent = firstOwner;
    write(result);
  } catch (err) {
    write({ error: err.message });
  }
});

$("loadAddressNotes").addEventListener("click", async () => {
  try {
    const address = $("walletAddress").textContent.trim();
    if (!address || address === "—") throw new Error("Unlock wallet first.");
    const result = await sendMessage({
      type: "GET_CACHED_NOTES",
      payload: { address }
    });

    if (!result.ok) throw new Error(result.error || "Load cached notes failed.");
    $("notesJson").value = JSON.stringify(result.notes, null, 2);
    $("cachedCount").textContent = String(result.notes.length);
    const firstOwner = result.notes.find(n => n.current_owner)?.current_owner || "—";
    $("currentOwner").textContent = firstOwner;
    write("Cached notes loaded.");
  } catch (err) {
    write({ error: err.message });
  }
});

$("previewSend").addEventListener("click", async () => {
  try {
    const apiBase = $("apiBase").value.trim() || "https://www.kentrin.com";
    const note_id = $("noteId").value.trim().toLowerCase();
    const to = $("recipient").value.trim();

    const result = await sendMessage({
      type: "PREVIEW_TRANSFER",
      payload: { apiBase, note_id, to }
    });

    if (!result.ok) throw new Error(result.error || "Preview failed.");
    latestPreview = result.preview;
    $("sendPreview").value = JSON.stringify(result.preview, null, 2);
    write("Transfer preview created.");
  } catch (err) {
    write({ error: err.message });
  }
});

$("submitSend").addEventListener("click", async () => {
  try {
    const apiBase = $("apiBase").value.trim() || "https://www.kentrin.com";
    if (!latestPreview) throw new Error("Preview transfer first.");

    const result = await sendMessage({
      type: "SUBMIT_TRANSFER",
      payload: { apiBase, preview: latestPreview }
    });

    if (!result.ok) throw new Error(result.error || "Submit failed.");
    write(result.result);
  } catch (err) {
    write({ error: err.message });
  }
});

refreshState().catch(err => write({ error: err.message }));
