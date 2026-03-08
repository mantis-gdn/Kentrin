const crypto = require("crypto");
const mysql = require("mysql2/promise");

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body, null, 2)
  };
}

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

exports.handler = async (event) => {
  try {

    const body = JSON.parse(event.body || "{}");

    const {
      input_note_id,
      from,
      outputs,
      ts,
      nonce,
      from_public_key_pem,
      signature_b64
    } = body;

    if (!input_note_id || !from || !outputs?.length) {
      return json(400, { error: "Missing fields" });
    }

    const db = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME
    });

    // load parent note
    const [rows] = await db.execute(
      `SELECT * FROM kentrin_events
       WHERE note_id = ?
       ORDER BY ts DESC
       LIMIT 1`,
      [input_note_id]
    );

    if (!rows.length) {
      return json(400, { error: "Note not found" });
    }

    const parent = rows[0];

    if (parent.to_addr !== from) {
      return json(400, { error: "Not note owner" });
    }

    const inputValue = parent.denom;

    const outputSum = outputs.reduce((a, o) => a + Number(o.value), 0);

    if (outputSum !== inputValue) {
      return json(400, { error: "Output sum mismatch" });
    }

    const message = JSON.stringify({
      input_note_id,
      from,
      outputs,
      ts,
      nonce
    });

    const verify = crypto.createVerify("SHA256");
    verify.update(message);
    verify.end();

    const validSig = verify.verify(
      from_public_key_pem,
      Buffer.from(signature_b64, "base64")
    );

    if (!validSig) {
      return json(400, { error: "Invalid signature" });
    }

    const txid = sha256(message + signature_b64);

    let index = 0;

    for (const out of outputs) {

      const newNoteId = sha256(txid + index);

      await db.execute(
        `INSERT INTO kentrin_events
        (txid, type, note_id, parent_note_id, child_index,
         denom, from_addr, to_addr, ts)
        VALUES (?, 'ISSUANCE', ?, ?, ?, ?, ?, ?, ?)`,
        [
          txid,
          newNoteId,
          input_note_id,
          index,
          out.value,
          from,
          out.to,
          ts
        ]
      );

      index++;
    }

    return json(200, {
      ok: true,
      txid,
      outputs_created: outputs.length
    });

  } catch (err) {
    return json(500, {
      error: err.message
    });
  }
};