const mysql = require('mysql2/promise');

const LEDGER_TABLE = process.env.KENTRIN_LEDGER_TABLE || 'kentrin_events';
const ID_COL = process.env.KENTRIN_ID_COL || 'event_index';
const TS_COL = process.env.KENTRIN_TS_COL || 'ts';

function json(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(bodyObj, null, 2)
  };
}

function badRequest(message, extra = {}) {
  return json(400, { error: 'BAD_REQUEST', message, ...extra });
}

function serverError(err) {
  console.error('Explorer DB error:', err);

  return json(500, {
    error: 'SERVER_ERROR',
    message: err.message,
    stack: err.stack
  });
}

function getPool() {
  return mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
    waitForConnections: true,
    connectionLimit: 4,
    queueLimit: 0,
    ssl: process.env.DB_SSL === 'false' ? undefined : { rejectUnauthorized: false }
  });
}

function normalizeRow(row) {
  return {
    id: row.event_index ?? row.id ?? null,
    event_index: row.event_index ?? row.id ?? null,
    txid: row.txid ?? null,
    event_type: row.event_type ?? null,
    note_id: row.note_id ?? null,
    from_address: row.from_address ?? row.from ?? null,
    to_address: row.to_address ?? row.to ?? null,
    ts: row.ts ?? row.created_at ?? row.timestamp ?? null,
    nonce: row.nonce ?? null,
    signature: row.signature_b64 ?? row.signature ?? null,
    signature_b64: row.signature_b64 ?? row.signature ?? null,
    denomination: row.denom ?? row.denomination ?? row.amount ?? null,
    amount: row.denom ?? row.amount ?? row.denomination ?? null,
    canonical_message: row.canonical_message ?? null,
    is_valid: row.is_valid ?? null,
    validation_error: row.validation_error ?? null,
    public_key_pem: row.public_key_pem ?? null,
    raw: row
  };
}

async function query(sql, params = []) {
  const pool = getPool();
  try {
    const [rows] = await pool.query(sql, params);
    return rows;
  } finally {
    await pool.end();
  }
}

async function getRecentEvents(limit = 50) {
  const rows = await query(
    `SELECT *
       FROM ${LEDGER_TABLE}
      ORDER BY ${TS_COL} DESC, ${ID_COL} DESC
      LIMIT ?`,
    [Math.max(1, Math.min(Number(limit) || 50, 200))]
  );
  return rows.map(normalizeRow);
}

async function getNoteEvents(noteId) {
  const rows = await query(
    `SELECT *
       FROM ${LEDGER_TABLE}
      WHERE note_id = ?
      ORDER BY ${TS_COL} ASC, ${ID_COL} ASC`,
    [noteId]
  );
  return rows.map(normalizeRow);
}

async function getAddressEvents(address, limit = 250) {
  const rows = await query(
    `SELECT *
       FROM ${LEDGER_TABLE}
      WHERE from_address = ? OR to_address = ?
      ORDER BY ${TS_COL} DESC, ${ID_COL} DESC
      LIMIT ?`,
    [address, address, Math.max(1, Math.min(Number(limit) || 250, 500))]
  );
  return rows.map(normalizeRow);
}

async function getTxEvent(txid) {
  const rows = await query(
    `SELECT *
       FROM ${LEDGER_TABLE}
      WHERE txid = ?
      ORDER BY ${TS_COL} ASC, ${ID_COL} ASC`,
    [txid]
  );
  return rows.map(normalizeRow);
}

async function getStats() {
  const rows = await query(
    `SELECT
        COUNT(*) AS total_events,
        COUNT(DISTINCT note_id) AS total_notes,
        COUNT(DISTINCT txid) AS total_txs,
        (
          SELECT COUNT(*)
          FROM (
            SELECT to_address AS address FROM ${LEDGER_TABLE} WHERE to_address IS NOT NULL AND to_address <> ''
            UNION
            SELECT from_address AS address FROM ${LEDGER_TABLE} WHERE from_address IS NOT NULL AND from_address <> ''
          ) a
        ) AS active_addresses,
        MAX(${TS_COL}) AS latest_ts
       FROM ${LEDGER_TABLE}`
  );
  return rows[0] || {};
}

function isEventValid(row, currentOwner) {
  const type = String(row.event_type || '').toUpperCase();

  if (row.is_valid === 0 || row.is_valid === false) {
    return { ok: false, reason: row.validation_error || 'Marked invalid in ledger' };
  }

  if (type === 'ISSUANCE') {
    if (!row.to_address) return { ok: false, reason: 'Issuance missing to_address' };
    return { ok: true, reason: null };
  }

  if (type === 'TRANSFER') {
    if (!currentOwner) {
      return { ok: false, reason: 'No current owner established before transfer' };
    }
    if (row.from_address !== currentOwner) {
      return {
        ok: false,
        reason: `NOT_CURRENT_OWNER expected=${currentOwner} got=${row.from_address || '(empty)'}`
      };
    }
    if (!row.to_address) {
      return { ok: false, reason: 'Transfer missing to_address' };
    }
    return { ok: true, reason: null };
  }

  return { ok: true, reason: null };
}

function deriveNoteState(events) {
  const timeline = [];
  let currentOwner = null;
  let issuedTo = null;
  let latestValidEvent = null;
  const anomalies = [];

  for (const row of events) {
    const beforeOwner = currentOwner;
    const verdict = isEventValid(row, currentOwner);
    const type = String(row.event_type || '').toUpperCase();

    if (type === 'ISSUANCE' && !issuedTo) issuedTo = row.to_address;

    if (verdict.ok) {
      if (type === 'ISSUANCE' || type === 'TRANSFER') {
        currentOwner = row.to_address || currentOwner;
      }
      latestValidEvent = row;
    } else {
      anomalies.push({
        type: 'INVALID_EVENT',
        txid: row.txid,
        note_id: row.note_id,
        reason: verdict.reason,
        event_type: row.event_type,
        ts: row.ts,
        event_index: row.event_index ?? row.id ?? null
      });
    }

    timeline.push({
      ...row,
      derived_owner_before: beforeOwner,
      derived_owner_after: verdict.ok ? currentOwner : beforeOwner,
      derived_valid: verdict.ok,
      derived_error: verdict.reason
    });
  }

  return {
    note_id: events[0]?.note_id || null,
    issued_to: issuedTo,
    current_owner: currentOwner,
    latest_valid_event_type: latestValidEvent?.event_type || null,
    latest_valid_txid: latestValidEvent?.txid || null,
    latest_valid_event_index: latestValidEvent?.event_index ?? latestValidEvent?.id ?? null,
    event_count: events.length,
    anomalies,
    timeline
  };
}

function summarizeAddress(address, events) {
  const owned = new Map();
  const inbound = [];
  const outbound = [];
  const noteBuckets = new Map();

  for (const row of events) {
    if (row.note_id && !noteBuckets.has(row.note_id)) {
      noteBuckets.set(row.note_id, []);
    }

    if (row.note_id) {
      noteBuckets.get(row.note_id).push(row);
    }

    if (row.to_address === address) inbound.push(row);
    if (row.from_address === address) outbound.push(row);
  }

  for (const [noteId, noteEvents] of noteBuckets.entries()) {
    const state = deriveNoteState(
      noteEvents.slice().sort((a, b) => {
        const tsA = Number(a.ts ?? 0);
        const tsB = Number(b.ts ?? 0);

        if (tsA !== tsB) return tsA - tsB;

        const idxA = Number(a.event_index ?? a.id ?? 0);
        const idxB = Number(b.event_index ?? b.id ?? 0);

        return idxA - idxB;
      })
    );

    if (state.current_owner === address) {
      owned.set(noteId, {
        note_id: noteId,
        denomination: noteEvents[noteEvents.length - 1]?.denomination ?? null,
        amount: noteEvents[noteEvents.length - 1]?.amount ?? null,
        last_txid: state.latest_valid_txid,
        last_event_type: state.latest_valid_event_type
      });
    }
  }

  return {
    address,
    current_notes: [...owned.values()],
    inbound_count: inbound.length,
    outbound_count: outbound.length,
    recent_activity: events.slice(0, 50)
  };
}

function detectInputType(q) {
  if (!q) return null;
  if (/^KU[0-9a-fA-F]{40,}$/i.test(q)) return 'address';
  if (/^[0-9a-f]{64}$/i.test(q)) return 'hash';
  return 'unknown';
}

module.exports = {
  LEDGER_TABLE,
  json,
  badRequest,
  serverError,
  getRecentEvents,
  getNoteEvents,
  getAddressEvents,
  getTxEvent,
  getStats,
  deriveNoteState,
  summarizeAddress,
  detectInputType
};