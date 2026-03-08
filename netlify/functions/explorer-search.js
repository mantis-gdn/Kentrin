const { json, badRequest, serverError, detectInputType } = require('./_explorer-db');

exports.handler = async (event) => {
  try {
    const q = (event.queryStringParameters?.q || '').trim();
    if (!q) return badRequest('Missing search query. Use ?q=<txid|note_id|KUaddress>');

    const type = detectInputType(q);
    let route = null;

    if (type === 'address') route = `/explorer/#/address/${q}`;
    else if (type === 'hash') route = `/explorer/#/lookup/${q}`;
    else route = `/explorer/#/lookup/${encodeURIComponent(q)}`;

    return json(200, { ok: true, q, detected_type: type, route });
  } catch (err) {
    return serverError(err);
  }
};
