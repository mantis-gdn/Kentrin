// netlify/functions/note-transfer-test.js
const crypto = require("crypto");

function json(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(bodyObj, null, 2),
  };
}

function canonicalTransferMessage({ note_id, from, to, ts, nonce }) {
  return `KU|v1|TRANSFER|${note_id}|${from}|${to}|${ts}|${nonce}`;
}

function sha256HexBuf(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function sha256HexStr(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function deriveKUAddressFromPublicKeyPem(publicKeyPem) {
  const keyObj = crypto.createPublicKey(publicKeyPem);
  const spkiDer = keyObj.export({ type: "spki", format: "der" });
  const hex = sha256HexBuf(spkiDer);
  return "KU1" + hex.slice(0, 40);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Use POST" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  let {
    note_id,
    from,
    to,
    ts,
    nonce,
    from_public_key_pem,
    signature_b64,
  } = payload;

  const missing = [];
  for (const k of [
    "note_id",
    "from",
    "to",
    "ts",
    "nonce",
    "from_public_key_pem",
    "signature_b64",
  ]) {
    if (payload[k] === undefined || payload[k] === null || payload[k] === "") missing.push(k);
  }
  if (missing.length) {
    return json(400, { error: "Missing fields", missing });
  }

  // --- NEW: enforce note_id is sha256 hex (64 chars) ---
  if (typeof note_id !== "string") {
    return json(400, { error: "INVALID_NOTE_ID_TYPE", hint: "note_id must be a string" });
  }
  note_id = note_id.trim().toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(note_id)) {
    return json(400, {
      error: "INVALID_NOTE_ID",
      hint: "note_id must be 64 hex chars (sha256).",
      note_id,
    });
  }

  // Optional sanity checks for address format
  if (typeof from !== "string" || !from.startsWith("KU1") || from.length !== 43) {
    return json(400, {
      error: "INVALID_FROM_ADDRESS",
      hint: "from must look like KU1 + 40 hex chars (length 43).",
      from,
    });
  }
  if (typeof to !== "string" || !to.startsWith("KU1") || to.length !== 43) {
    return json(400, {
      error: "INVALID_TO_ADDRESS",
      hint: "to must look like KU1 + 40 hex chars (length 43).",
      to,
    });
  }

  // STRICT MODE: derive address from public key and require it matches "from"
  let derived_from_address = null;
  try {
    derived_from_address = deriveKUAddressFromPublicKeyPem(from_public_key_pem);
  } catch (e) {
    return json(400, { error: "Invalid from_public_key_pem", detail: e.message || String(e) });
  }

  if (from !== derived_from_address) {
    return json(400, {
      error: "FROM_ADDRESS_MISMATCH",
      from_provided: from,
      from_derived: derived_from_address,
      hint: "Set 'from' to KU address derived from the supplied public key.",
    });
  }

  // Build canonical message (use normalized note_id)
  const message = canonicalTransferMessage({ note_id, from, to, ts, nonce });

  // Verify signature (Ed25519)
  let valid = false;
  let verifyError = null;

  try {
    const sig = Buffer.from(signature_b64, "base64");
    const msg = Buffer.from(message, "utf8");
    valid = crypto.verify(null, msg, from_public_key_pem, sig);
  } catch (e) {
    verifyError = e.message || String(e);
  }

  const txid = sha256HexStr(`KU|v1|TX|${message}|${signature_b64}`);
  const pubkey_fingerprint = sha256HexStr(from_public_key_pem);

  return json(200, {
    ok: true,
    valid,
    verifyError,
    canonical_message: message,
    txid,
    pubkey_fingerprint,
    derived_from_address,
    received: { note_id, from, to, ts, nonce },
  });
};