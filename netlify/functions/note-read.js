const mysql = require("mysql2/promise");

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body, null, 2)
  };
}

exports.handler = async (event) => {
  let db;

  try {
    const note_id = (event.queryStringParameters?.note_id || "").trim().toLowerCase();

    if (!/^[a-f0-9]{64}$/.test(note_id)) {
      return json(400, { error: "INVALID_NOTE_ID" });
    }

    db = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME
    });

    // 1) Find original denom from issuance row
    // Adjust table/column names here if your schema differs.
    const [issuanceRows] = await db.execute(
      `
      SELECT note_id, denom, owner_address
      FROM issuance
      WHERE note_id = ?
      LIMIT 1
      `,
      [note_id]
    );

    if (!issuanceRows.length) {
      return json(404, { error: "NOTE_NOT_FOUND" });
    }

    const issuance = issuanceRows[0];

    // 2) Find latest owner from ledger row history
    // Adjust table/column names here if your schema differs.
    const [ledgerRows] = await db.execute(
      `
      SELECT note_id, owner_address, event_type, txid, ts
      FROM ledger
      WHERE note_id = ?
      ORDER BY ts DESC, id DESC
      LIMIT 1
      `,
      [note_id]
    );

    const latest = ledgerRows[0] || null;

    return json(200, {
      note_id,
      denom: Number(issuance.denom),
      issued_to: issuance.owner_address,
      current_owner: latest?.owner_address || issuance.owner_address,
      latest_event_type: latest?.event_type || "ISSUANCE",
      latest_txid: latest?.txid || null,
      latest_ts: latest?.ts || null
    });
  } catch (err) {
    return json(500, {
      error: "SERVER_ERROR",
      details: err.message
    });
  } finally {
    if (db) {
      try { await db.end(); } catch {}
    }
  }
};