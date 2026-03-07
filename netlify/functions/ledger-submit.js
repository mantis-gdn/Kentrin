const crypto = require("crypto");
const mysql = require("mysql2/promise");

function json(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(bodyObj, null, 2)
  };
}

function canonicalTransferMessage({ note_id, from, to, ts, nonce }) {
  return `KU|v1|TRANSFER|${note_id}|${from}|${to}|${ts}|${nonce}`;
}

function sha256HexStr(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function sha256HexBuf(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function deriveKUAddressFromPublicKeyPem(publicKeyPem) {
  const keyObj = crypto.createPublicKey(publicKeyPem);
  const spkiDer = keyObj.export({ type: "spki", format: "der" });
  const hex = sha256HexBuf(spkiDer);
  return "KU1" + hex.slice(0, 40);
}

function isValidKUAddress(s) {
  return typeof s === "string" && /^KU1[a-f0-9]{40}$/i.test(s);
}

function isValidNoteId(s) {
  return typeof s === "string" && /^[a-f0-9]{64}$/i.test(s);
}

async function getConnection() {
  return mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: true }
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Use POST" });
  }

  for (const key of ["DB_HOST", "DB_USERNAME", "DB_PASSWORD", "DB_NAME"]) {
    if (!process.env[key]) {
      return json(500, { error: `Missing environment variable: ${key}` });
    }
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  let {
    note_id,
    denom,
    from,
    to,
    ts,
    nonce,
    from_public_key_pem,
    signature_b64
  } = payload;

  const missing = [];
  for (const k of [
    "note_id",
    "denom",
    "from",
    "to",
    "ts",
    "nonce",
    "from_public_key_pem",
    "signature_b64"
  ]) {
    if (payload[k] === undefined || payload[k] === null || payload[k] === "") {
      missing.push(k);
    }
  }

  if (missing.length) {
    return json(400, { error: "Missing fields", missing });
  }

  note_id = String(note_id).trim().toLowerCase();
  from = String(from).trim();
  to = String(to).trim();
  nonce = String(nonce).trim();
  const denomInt = Number(denom);
  const tsInt = Number(ts);

  if (!isValidNoteId(note_id)) {
    return json(400, {
      error: "INVALID_NOTE_ID",
      hint: "note_id must be 64 hex chars (sha256).",
      note_id
    });
  }

  if (!Number.isInteger(denomInt) || denomInt <= 0) {
    return json(400, {
      error: "INVALID_DENOM",
      hint: "denom must be a positive integer."
    });
  }

  if (!isValidKUAddress(from)) {
    return json(400, {
      error: "INVALID_FROM_ADDRESS",
      hint: "from must be KU1 + 40 hex chars.",
      from
    });
  }

  if (!isValidKUAddress(to)) {
    return json(400, {
      error: "INVALID_TO_ADDRESS",
      hint: "to must be KU1 + 40 hex chars.",
      to
    });
  }

  if (from === to) {
    return json(400, {
      error: "SELF_TRANSFER_NOT_ALLOWED"
    });
  }

  if (!Number.isInteger(tsInt) || tsInt <= 0) {
    return json(400, {
      error: "INVALID_TIMESTAMP",
      hint: "ts must be a positive integer unix timestamp."
    });
  }

  let derived_from_address;
  try {
    derived_from_address = deriveKUAddressFromPublicKeyPem(from_public_key_pem);
  } catch (err) {
    return json(400, {
      error: "INVALID_PUBLIC_KEY",
      detail: err.message || String(err)
    });
  }

  if (from !== derived_from_address) {
    return json(400, {
      error: "FROM_ADDRESS_MISMATCH",
      from_provided: from,
      from_derived: derived_from_address,
      hint: "Set 'from' to the KU address derived from the supplied public key."
    });
  }

  const canonical_message = canonicalTransferMessage({
    note_id,
    from,
    to,
    ts: tsInt,
    nonce
  });

  let valid = false;
  let verifyError = null;

  try {
    const sig = Buffer.from(signature_b64, "base64");
    const msg = Buffer.from(canonical_message, "utf8");
    valid = crypto.verify(null, msg, from_public_key_pem, sig);
  } catch (err) {
    verifyError = err.message || String(err);
  }

  if (!valid) {
    return json(400, {
      error: "INVALID_SIGNATURE",
      verifyError,
      canonical_message
    });
  }

  const txid = sha256HexStr(`KU|v1|TX|${canonical_message}|${signature_b64}`);

  let connection;
  try {
    connection = await getConnection();

    // 1) Find latest event for this note
    const [latestRows] = await connection.execute(
      `SELECT event_index, event_type, note_id, denom, from_address, to_address, ts, txid
       FROM kentrin_events
       WHERE note_id = ?
       ORDER BY event_index DESC
       LIMIT 1`,
      [note_id]
    );

    if (!latestRows || latestRows.length === 0) {
      return json(404, {
        error: "NOTE_NOT_FOUND",
        hint: "This note_id does not exist in the ledger. Mint it first.",
        note_id
      });
    }

    const latest = latestRows[0];

    // 2) Denomination must match original/latest record
    if (Number(latest.denom) !== denomInt) {
      return json(400, {
        error: "DENOM_MISMATCH",
        note_id,
        provided_denom: denomInt,
        ledger_denom: Number(latest.denom)
      });
    }

    // 3) Current owner must be sender
    if (latest.to_address !== from) {
      return json(409, {
        error: "NOT_CURRENT_OWNER",
        note_id,
        current_owner: latest.to_address,
        attempted_from: from,
        latest_event_type: latest.event_type,
        latest_txid: latest.txid
      });
    }

    // 4) Prevent immediate duplicate replay by txid
    const [dupRows] = await connection.execute(
      `SELECT event_index
       FROM kentrin_events
       WHERE txid = ?
       LIMIT 1`,
      [txid]
    );

    if (dupRows && dupRows.length > 0) {
      return json(409, {
        error: "DUPLICATE_TXID",
        txid
      });
    }

    // 5) Insert transfer event
    await connection.execute(
      `INSERT INTO kentrin_events
      (event_type, note_id, denom, from_address, to_address, ts, nonce, txid, signature_b64, canonical_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "TRANSFER",
        note_id,
        denomInt,
        from,
        to,
        tsInt,
        nonce,
        txid,
        signature_b64,
        canonical_message
      ]
    );

    return json(200, {
      ok: true,
      stored: true,
      ownership_verified: true,
      event_type: "TRANSFER",
      txid,
      note_id,
      denom: denomInt,
      from,
      to,
      ts: tsInt,
      nonce,
      canonical_message
    });
  } catch (err) {
    if (err && (err.code === "ER_DUP_ENTRY" || err.errno === 1062)) {
      return json(409, {
        error: "DUPLICATE_TXID",
        txid,
        detail: err.message
      });
    }

    return json(500, {
      error: "DB_INSERT_FAILED",
      detail: err.message || String(err)
    });
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch {}
    }
  }
};