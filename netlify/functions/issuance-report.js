// netlify/functions/issuance-report.js
// Kentrin: issuance report endpoint (NOT a ledger, NOT blockchain)

const crypto = require("crypto");

// === Constitutional parameters (keep high-level; can move to config later) ===
const EPOCH_SECONDS = 3600;               // 1 hour
const ISSUANCE_PER_EPOCH_KU = 1_000_000;  // K (integer)
const GENESIS_SUPPLY_KU = 0;              // S0
const ISSUANCE_STARTS_AT_EPOCH = 1;       // epoch 0 mints nothing

// NOTE: For now, this is a placeholder.
// Later: freeze T0 via reproducible build hash process.
const GENESIS_T0_UTC = "2026-03-01T00:00:00Z";

function sha256Hex(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function toUnixSeconds(iso) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}

function unixToIsoZ(sec) {
  return new Date(sec * 1000).toISOString();
}

function epochIndex(tUnix, t0Unix) {
  return Math.floor((tUnix - t0Unix) / EPOCH_SECONDS);
}

function issuanceForEpoch(n) {
  return n < ISSUANCE_STARTS_AT_EPOCH ? 0 : ISSUANCE_PER_EPOCH_KU;
}

function cumulativeSupply(n) {
  return n < ISSUANCE_STARTS_AT_EPOCH ? GENESIS_SUPPLY_KU : ISSUANCE_PER_EPOCH_KU * n;
}

exports.handler = async (event) => {
  try {
    const params = {
      epoch_seconds: EPOCH_SECONDS,
      issuance_per_epoch_KU: ISSUANCE_PER_EPOCH_KU,
      genesis_supply_KU: GENESIS_SUPPLY_KU,
      issuance_starts_at_epoch: ISSUANCE_STARTS_AT_EPOCH
    };

    const paramsFingerprint = "sha256:" + sha256Hex(JSON.stringify(params));

    const t0Unix = toUnixSeconds(GENESIS_T0_UTC);
    if (t0Unix === null) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: "Invalid GENESIS_T0_UTC" })
      };
    }

    // Optional query: ?t=2026-03-01T12:00:00Z
    const q = event.queryStringParameters || {};
    const tIso = q.t;

    const targetUnix = tIso ? toUnixSeconds(tIso) : Math.floor(Date.now() / 1000);
    if (targetUnix === null) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: "Invalid 't' timestamp. Use ISO-8601 like 2026-03-01T12:00:00Z" })
      };
    }

    const n = epochIndex(targetUnix, t0Unix);
    const startUnix = t0Unix + n * EPOCH_SECONDS;
    const endUnix = startUnix + EPOCH_SECONDS;

    const report = {
      type: "issuance_report",
      spec_version: "0.1",
      generated_at_utc: new Date().toISOString(),

      params,
      params_fingerprint: paramsFingerprint,

      genesis: {
        t0_utc: GENESIS_T0_UTC,
        definition:
          "UTC timestamp embedded in the first published reproducible reference implementation build whose hash is recorded in the Constitutional Registry.",
        reference_build_hash: "sha256:<to-be-frozen>"
      },

      query: {
        mode: tIso ? "at_time" : "now",
        t_utc: unixToIsoZ(targetUnix)
      },

      result: {
        epoch_index: n,
        epoch_start_utc: unixToIsoZ(startUnix),
        epoch_end_utc: unixToIsoZ(endUnix),
        issuance_this_epoch_KU: issuanceForEpoch(n),
        cumulative_supply_KU: cumulativeSupply(n),
        issued_epoch_count: Math.max(n, 0)
      }
    };

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify(report, null, 2)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Server error", detail: String(err) })
    };
  }
};