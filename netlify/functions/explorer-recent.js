const { json, serverError, getRecentEvents, getStats, deriveNoteState } = require('./_explorer-db');

exports.handler = async (event) => {
  try {
    const limit = Number(event.queryStringParameters?.limit || 50);
    const recent = await getRecentEvents(limit);
    const stats = await getStats();

    const noteMap = new Map();
    for (const row of recent) {
      if (!row.note_id) continue;
      if (!noteMap.has(row.note_id)) noteMap.set(row.note_id, []);
      noteMap.get(row.note_id).push(row);
    }

    const flagged = [];
    for (const rows of noteMap.values()) {
      const sorted = rows.slice().sort((a, b) => new Date(a.ts) - new Date(b.ts) || (a.id || 0) - (b.id || 0));
      const state = deriveNoteState(sorted);
      flagged.push(...state.anomalies);
    }

    return json(200, {
      ok: true,
      stats,
      recent,
      flagged: flagged.slice(0, 25)
    });
  } catch (err) {
    return serverError(err);
  }
};
