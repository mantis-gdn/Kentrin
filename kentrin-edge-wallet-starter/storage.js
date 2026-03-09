const WALLET_KEY = "kentrin_wallet_blob";
const SESSION_KEY = "kentrin_wallet_session";
const CACHE_KEY = "kentrin_cached_notes";

export async function saveWalletBlob(blob) {
  await chrome.storage.local.set({ [WALLET_KEY]: blob });
}

export async function getWalletBlob() {
  const data = await chrome.storage.local.get(WALLET_KEY);
  return data[WALLET_KEY] || null;
}

export async function clearWalletBlob() {
  await chrome.storage.local.remove(WALLET_KEY);
}

export async function saveWalletSession(session) {
  await chrome.storage.session.set({ [SESSION_KEY]: session });
}

export async function getWalletSession() {
  const data = await chrome.storage.session.get(SESSION_KEY);
  return data[SESSION_KEY] || null;
}

export async function clearWalletSession() {
  await chrome.storage.session.remove(SESSION_KEY);
}

export async function saveCachedNotes(address, notes) {
  const all = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY] || {};
  all[address] = notes;
  await chrome.storage.local.set({ [CACHE_KEY]: all });
}

export async function getCachedNotes(address) {
  const all = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY] || {};
  return all[address] || [];
}

export async function clearAllWalletData() {
  await chrome.storage.local.remove([WALLET_KEY, CACHE_KEY]);
  await chrome.storage.session.remove(SESSION_KEY);
}
