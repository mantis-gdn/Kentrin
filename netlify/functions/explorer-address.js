const { json, badRequest, serverError, getAddressEvents, summarizeAddress } = require('./_explorer-db');

exports.handler = async (event) => {
  try {
    const address = event.queryStringParameters?.id || event.queryStringParameters?.address;
    if (!address) return badRequest('Missing address. Use ?id=<KU...>');

    const events = await getAddressEvents(address, 250);
    return json(200, {
      ok: true,
      address: summarizeAddress(address, events)
    });
  } catch (err) {
    return serverError(err);
  }
};
