const { json, badRequest, serverError, getTxEvent } = require('./_explorer-db');

exports.handler = async (event) => {
  try {
    const txid = event.queryStringParameters?.id || event.queryStringParameters?.txid;
    if (!txid) return badRequest('Missing txid. Use ?id=<txid>');

    const rows = await getTxEvent(txid);
    if (!rows.length) {
      return json(404, { ok: false, error: 'NOT_FOUND', message: 'Transaction not found', txid });
    }

    return json(200, {
      ok: true,
      txid,
      events: rows
    });
  } catch (err) {
    return serverError(err);
  }
};
