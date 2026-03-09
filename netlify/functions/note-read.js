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
      return json(400, {
        error: "INVALID_NOTE_ID",
        note_id
      });
    }

    db = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      ssl: {}
    });

    const [rows] = await db.execute(
      `
      SELECT
        event_index,
        event_type,
        note_id,
        parent_note_id,
        child_index,
        denom,
        from_address,
        to_address,
        ts,
        nonce,
        txid,
        canonical_message,
        created_at
      FROM kentrin_events
      WHERE note_id = ?
      ORDER BY ts DESC, event_index DESC
      `,
      [note_id]
    );

    if (!rows.length) {
      return json(404, {
        error: "NOTE_NOT_FOUND",
        note_id
      });
    }

    const latest = rows[0];
    const oldest = rows[rows.length - 1];
    const denomRow = rows.find(r => r.denom !== null && r.denom !== undefined) || latest;

    return json(200, {
      note_id,
      denom: Number(denomRow.denom),
      event_count: rows.length,
      issued_to: oldest.to_address || null,
      current_owner: latest.to_address || null,
      latest_event_type: latest.event_type,
      latest_txid: latest.txid,
      latest_ts: latest.ts,
      latest_from: latest.from_address || null,
      latest_to: latest.to_address || null
    });
  } catch (err) {
    return json(500, {
      error: "SERVER_ERROR",
      message: err.message,
      code: err.code || null,
      errno: err.errno || null,
      sqlState: err.sqlState || null,
      sqlMessage: err.sqlMessage || null,
      stack: err.stack || null
    });
  } finally {
    if (db) {
      try {
        await db.end();
      } catch {}
    }
  }
};