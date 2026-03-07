// netlify/functions/treasury-mint-test.js

const crypto = require("crypto");

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

exports.handler = async (event) => {

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Use POST" });
  }

  if (!process.env.TREASURY_MINT_SECRET) {
    return json(500, {
      error: "TREASURY_MINT_SECRET missing on server"
    });
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
    genesis
  } = payload;

  const missing = [];

  // FIXED VERSION — allows epoch_index = 0
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

  const canonical = mintCanonical({
    genesis: genesisStr,
    epoch_index: epochInt,
    denom: denomInt,
    owner_address: to_address,
    mint_nonce
  });

  const note_id = sha256HexStr(canonical);

  const mint_txid = sha256HexStr(
    `KU|v1|MINT_TX|${canonical}`
  );

  return json(200, {
    ok: true,
    denom: denomInt,
    epoch_index: epochInt,
    genesis: genesisStr,
    to_address,
    note_id,
    mint_txid,
    mint_nonce,
    canonical_mint: canonical
  });

};