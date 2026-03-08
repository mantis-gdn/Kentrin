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

function mintCanonical({ genesis, epoch_index, denom, owner_address, mint_nonce }) {
  return `KU|v1|MINT|${genesis}|${epoch_index}|${denom}|${owner_address}|${mint_nonce}`;
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

  for (const key of ["DB_HOST", "DB_USERNAME", "DB_PASSWORD", "DB_NAME", "TREASURY_MINT_SECRET"]) {
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

  const {
    to_public_key_pem,
    denom,
    epoch_index,
    genesis,
    treasury_mint_secret
  } = payload;

  if (treasury_mint_secret !== process.env.TREASURY_MINT_SECRET) {
    return json(403, {
      error: "FORBIDDEN",
      hint: "Invalid treasury mint secret"
    });
  }

  const missing = [];
  for (const k of ["to_public_key_pem", "denom", "epoch_index", "genesis"]) {
    if (payload[k] === undefined || payload[k] === null || payload[k] === "") {
      missing.push(k);
    }
  }

  if (missing.length) {
    return json(400, { error: "Missing fields", missing });
  }

  const denomInt = Number(denom);
  const epochInt = Number(epoch_index);
  const genesisStr = String(genesis).trim();

  if (!Number.isInteger(denomInt) || denomInt <= 0) {
    return json(400, {
      error: "INVALID_DENOM",
      hint: "denom must be positive integer"
    });
  }

  if (!Number.isInteger(epochInt) || epochInt < 0) {
    return json(400, {
      error: "INVALID_EPOCH_INDEX",
      hint: "epoch_index must be >= 0"
    });
  }

  if (!/^\d+$/.test(genesisStr)) {
    return json(400, {
      error: "INVALID_GENESIS",
      hint: "genesis must be unix seconds"
    });
  }

  let to_address;
  try {
    to_address = deriveKUAddressFromPublicKeyPem(to_public_key_pem);
  } catch (err) {
    return json(400, {
      error: "INVALID_PUBLIC_KEY",
      detail: err.message
    });
  }

  const mint_nonce = crypto.randomBytes(16).toString("hex");
  const ts = Math.floor(Date.now() / 1000);

  const canonical_message = mintCanonical({
    genesis: genesisStr,
    epoch_index: epochInt,
    denom: denomInt,
    owner_address: to_address,
    mint_nonce
  });

  const note_id = sha256HexStr(canonical_message);
  const txid = sha256HexStr(`KU|v1|MINT_TX|${canonical_message}`);

  let connection;
  try {
    connection = await getConnection();

    const [existingRows] = await connection.execute(
      `SELECT event_index
       FROM kentrin_events
       WHERE note_id = ?
       LIMIT 1`,
      [note_id]
    );

    if (existingRows && existingRows.length > 0) {
      return json(409, {
        error: "NOTE_ALREADY_EXISTS",
        note_id,
        txid
      });
    }

    await connection.execute(
      `INSERT INTO kentrin_events
      (event_type, note_id, denom, from_address, to_address, ts, nonce, txid, signature_b64, canonical_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "ISSUANCE",
        note_id,
        denomInt,
        "",
        to_address,
        ts,
        mint_nonce,
        txid,
        "",
        canonical_message
      ]
    );

    return json(200, {
      ok: true,
      stored: true,
      event_type: "ISSUANCE",
      note_id,
      txid,
      denom: denomInt,
      epoch_index: epochInt,
      genesis: genesisStr,
      to_address,
      ts,
      nonce: mint_nonce,
      canonical_message
    });
  } catch (err) {
    if (err && (err.code === "ER_DUP_ENTRY" || err.errno === 1062)) {
      return json(409, {
        error: "DUPLICATE_TXID_OR_NOTE",
        note_id,
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