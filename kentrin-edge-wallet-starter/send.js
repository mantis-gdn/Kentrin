import { signCanonicalMessage } from "./crypto.js";
import { fetchNoteMetadata } from "./explorer.js";

export function buildCanonicalTransferMessage({ note_id, from, to, ts, nonce }) {
  return `KU|v1|TRANSFER|${note_id}|${from}|${to}|${ts}|${nonce}`;
}

export async function previewTransfer({ apiBase, walletSession, note_id, to }) {
  if (!walletSession?.address || !walletSession?.privateKeyPkcs8Base64 || !walletSession?.publicKeyPem) {
    throw new Error("Wallet is locked or missing signing material.");
  }

  const meta = await fetchNoteMetadata(apiBase, note_id);
  if (meta.current_owner && meta.current_owner !== walletSession.address) {
    throw new Error(`Current owner is ${meta.current_owner}, not this wallet.`);
  }

  const nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  const ts = Math.floor(Date.now() / 1000);
  const canonical_message = buildCanonicalTransferMessage({
    note_id,
    from: walletSession.address,
    to,
    ts,
    nonce
  });

  const signature_b64 = await signCanonicalMessage(
    walletSession.privateKeyPkcs8Base64,
    canonical_message
  );

  return {
    note_id,
    from: walletSession.address,
    to,
    denom: Number(meta.denom),
    ts,
    nonce,
    from_public_key_pem: walletSession.publicKeyPem,
    canonical_message,
    signature_b64
  };
}

export async function submitTransfer(apiBase, preview) {
  const res = await fetch(`${apiBase.replace(/\/$/, "")}/.netlify/functions/ledger-submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      note_id: preview.note_id,
      from: preview.from,
      to: preview.to,
      denom: preview.denom,
      ts: preview.ts,
      nonce: preview.nonce,
      from_public_key_pem: preview.from_public_key_pem,
      signature_b64: preview.signature_b64
    })
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text, ok: res.ok };
  }
}
