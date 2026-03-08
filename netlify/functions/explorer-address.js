const {
  json,
  badRequest,
  serverError,
  getAddressEvents,
  getNoteEvents,
  deriveNoteState
} = require('./_explorer-db');

exports.handler = async (event) => {
  try {
    const address = event.queryStringParameters?.id || event.queryStringParameters?.address;
    if (!address) {
      return badRequest('Missing address. Use ?id=<KU...>');
    }

    const events = await getAddressEvents(address, 250);

    const inbound = [];
    const outbound = [];
    const noteIds = new Set();

    for (const row of events) {
      if (row.note_id) noteIds.add(row.note_id);
      if (row.to_address === address) inbound.push(row);
      if (row.from_address === address) outbound.push(row);
    }

    const currentNotes = [];

    for (const noteId of noteIds) {
      const fullNoteEvents = await getNoteEvents(noteId);

      const state = deriveNoteState(fullNoteEvents);

      if (state.current_owner === address) {
        const lastRow = fullNoteEvents[fullNoteEvents.length - 1] || null;

        currentNotes.push({
          note_id: noteId,
          denomination: lastRow?.denomination ?? lastRow?.amount ?? null,
          amount: lastRow?.amount ?? lastRow?.denomination ?? null,
          last_txid: state.latest_valid_txid,
          last_event_type: state.latest_valid_event_type
        });
      }
    }

    return json(200, {
      ok: true,
      address: {
        address,
        current_notes: currentNotes,
        inbound_count: inbound.length,
        outbound_count: outbound.length,
        recent_activity: events.slice(0, 50)
      }
    });
  } catch (err) {
    return serverError(err);
  }
};