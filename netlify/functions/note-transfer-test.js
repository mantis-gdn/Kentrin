// netlify/functions/note-transfer-test.js
const crypto = require("crypto");

function json(res, statusCode, bodyObj) {
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
  // Strict ordering, no JSON ambiguity
  return `KU|v1|TRANSFER|${note_id}|${from}|${to}|${ts}|${nonce}`;
}

function sha256Hex(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(null, 405, { error: "Use POST" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(null, 400, { error: "Invalid JSON body" });
  }

  const {
    note_id,
    from, // address string (can be anything for testing)
    to,   // address string
    ts,   // unix seconds
    nonce,
    from_public_key_pem, // Ed25519 public key in PEM
    signature_b64,       // base64 signature of canonical message
  } = payload;

  // Basic validation
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
    return json(null, 400, { error: "Missing fields", missing });
  }

  // Build canonical message
  const message = canonicalTransferMessage({ note_id, from, to, ts, nonce });

  // Verify signature (Ed25519)
  let valid = false;
  let verifyError = null;

  try {
    const sig = Buffer.from(signature_b64, "base64");
    const msg = Buffer.from(message, "utf8");

    // IMPORTANT: For Ed25519, algorithm is null in Node crypto.verify
    valid = crypto.verify(null, msg, from_public_key_pem, sig);
  } catch (e) {
    verifyError = e.message || String(e);
  }

  // Handy debug artifacts
  const txid = sha256Hex(`KU|v1|TX|${message}|${signature_b64}`);
  const pubkey_fingerprint = sha256Hex(from_public_key_pem);

  return json(null, 200, {
    ok: true,
    valid,
    verifyError,
    canonical_message: message,
    txid,
    pubkey_fingerprint,
    received: { note_id, from, to, ts, nonce },
  });
};