const { json, badRequest, serverError, getNoteEvents, deriveNoteState } = require('./_explorer-db');

exports.handler = async (event) => {
  try {
    const noteId = event.queryStringParameters?.id || event.queryStringParameters?.note_id;
    if (!noteId) return badRequest('Missing note id. Use ?id=<note_id>');

    const events = await getNoteEvents(noteId);
    if (!events.length) {
      return json(404, { ok: false, error: 'NOT_FOUND', message: 'Note not found', note_id: noteId });
    }

    return json(200, {
      ok: true,
      note: deriveNoteState(events)
    });
  } catch (err) {
    return serverError(err);
  }
};
