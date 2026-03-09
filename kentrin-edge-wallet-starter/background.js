import {
  generateWalletMaterial,
  generateRecoveryPhrase,
  deriveDeterministicSeedFromPhrase,
  encryptJsonWithPassword,
  decryptJsonWithPassword
} from "./crypto.js";
import {
  saveWalletBlob,
  getWalletBlob,
  clearWalletBlob,
  saveWalletSession,
  getWalletSession,
  clearWalletSession,
  saveCachedNotes,
  getCachedNotes,
  clearAllWalletData
} from "./storage.js";
import { scanKnownNotes } from "./explorer.js";
import { previewTransfer, submitTransfer } from "./send.js";

chrome.runtime.onInstalled.addListener(() => {
  console.log("Kentrin Wallet extension installed.");
});

async function createWallet({ password, walletName }) {
  if (!password) throw new Error("Password is required.");

  const recoveryPhrase = generateRecoveryPhrase();
  const recoverySeed = await deriveDeterministicSeedFromPhrase(recoveryPhrase);
  const material = await generateWalletMaterial();

  const payload = {
    version: 1,
    walletName: walletName || "Kentrin Wallet",
    recoveryPhrase,
    recoverySeed,
    ...material
  };

  const encrypted = await encryptJsonWithPassword(payload, password);
  await saveWalletBlob(encrypted);
  await saveWalletSession({
    walletName: payload.walletName,
    address: payload.address,
    publicKeyPem: payload.publicKeyPem,
    publicKeySpkiBase64: payload.publicKeySpkiBase64,
    privateKeyPkcs8Base64: payload.privateKeyPkcs8Base64
  });

  return {
    ok: true,
    walletName: payload.walletName,
    address: payload.address,
    recoveryPhrase
  };
}

async function restoreWallet({ password, recoveryPhrase, walletName }) {
  if (!password) throw new Error("Password is required.");
  if (!recoveryPhrase?.trim()) throw new Error("Recovery phrase is required.");

  const recoverySeed = await deriveDeterministicSeedFromPhrase(recoveryPhrase);
  const material = await generateWalletMaterial();

  const payload = {
    version: 1,
    walletName: walletName || "Kentrin Wallet",
    recoveryPhrase: recoveryPhrase.trim().toLowerCase(),
    recoverySeed,
    ...material
  };

  const encrypted = await encryptJsonWithPassword(payload, password);
  await saveWalletBlob(encrypted);
  await saveWalletSession({
    walletName: payload.walletName,
    address: payload.address,
    publicKeyPem: payload.publicKeyPem,
    publicKeySpkiBase64: payload.publicKeySpkiBase64,
    privateKeyPkcs8Base64: payload.privateKeyPkcs8Base64
  });

  return {
    ok: true,
    walletName: payload.walletName,
    address: payload.address,
    recoveryPhrase: payload.recoveryPhrase
  };
}

async function unlockWallet({ password }) {
  const blob = await getWalletBlob();
  if (!blob) throw new Error("No local wallet found.");
  if (!password) throw new Error("Password is required.");

  const payload = await decryptJsonWithPassword(blob, password);
  await saveWalletSession({
    walletName: payload.walletName,
    address: payload.address,
    publicKeyPem: payload.publicKeyPem,
    publicKeySpkiBase64: payload.publicKeySpkiBase64,
    privateKeyPkcs8Base64: payload.privateKeyPkcs8Base64
  });

  return {
    ok: true,
    walletName: payload.walletName,
    address: payload.address
  };
}

async function getExtensionState() {
  const blob = await getWalletBlob();
  const session = await getWalletSession();

  return {
    hasWallet: !!blob,
    unlocked: !!session,
    address: session?.address || null,
    walletName: session?.walletName || null
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case "CREATE_WALLET":
        sendResponse(await createWallet(message.payload));
        break;
      case "RESTORE_WALLET":
        sendResponse(await restoreWallet(message.payload));
        break;
      case "UNLOCK_WALLET":
        sendResponse(await unlockWallet(message.payload));
        break;
      case "LOCK_WALLET":
        await clearWalletSession();
        sendResponse({ ok: true, message: "Wallet locked." });
        break;
      case "CLEAR_SESSION":
        await clearWalletSession();
        sendResponse({ ok: true, message: "Session cleared." });
        break;
      case "GET_EXTENSION_STATE":
        sendResponse(await getExtensionState());
        break;
      case "GET_WALLET_DETAILS": {
        const session = await getWalletSession();
        const blob = await getWalletBlob();
        sendResponse({
          hasWallet: !!blob,
          unlocked: !!session,
          walletName: session?.walletName || "Kentrin Wallet",
          address: session?.address || null
        });
        break;
      }
      case "SAVE_WALLET_NAME": {
        const blob = await getWalletBlob();
        if (!blob) throw new Error("No wallet to rename.");
        sendResponse({ ok: true, message: "Wallet name save hook is ready. Wire rename logic next." });
        break;
      }
      case "SCAN_NOTES": {
        const notes = await scanKnownNotes(message.payload.apiBase, message.payload.noteIds || []);
        await saveCachedNotes(message.payload.address, notes);
        sendResponse({ ok: true, notes });
        break;
      }
      case "GET_CACHED_NOTES": {
        const notes = await getCachedNotes(message.payload.address);
        sendResponse({ ok: true, notes });
        break;
      }
      case "PREVIEW_TRANSFER": {
        const session = await getWalletSession();
        const preview = await previewTransfer({
          apiBase: message.payload.apiBase,
          walletSession: session,
          note_id: message.payload.note_id,
          to: message.payload.to
        });
        sendResponse({ ok: true, preview });
        break;
      }
      case "SUBMIT_TRANSFER": {
        const result = await submitTransfer(message.payload.apiBase, message.payload.preview);
        sendResponse({ ok: true, result });
        break;
      }
      case "DELETE_WALLET":
        await clearAllWalletData();
        sendResponse({ ok: true, message: "Local wallet data deleted." });
        break;
      default:
        throw new Error(`Unknown message type: ${message.type}`);
    }
  })().catch(err => {
    sendResponse({ ok: false, error: err.message });
  });

  return true;
});
