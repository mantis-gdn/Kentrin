const { json, serverError, getRecentEvents, getStats, deriveNoteState } = require('./_explorer-db');

exports.handler = async (event) => {
  try {
    const rawLimit = Number(event.queryStringParameters?.limit || 50);
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(rawLimit, 200))
      : 50;

    const recent = await getRecentEvents(limit);
    const stats = await getStats();

    const noteMap = new Map();

    for (const row of recent) {
      if (!row.note_id) continue;

      if (!noteMap.has(row.note_id)) {
        noteMap.set(row.note_id, []);
      }

      noteMap.get(row.note_id).push(row);
    }

    const flagged = [];

    for (const rows of noteMap.values()) {
      const sorted = rows.slice().sort((a, b) => {
        const tsA = Number(a.ts ?? 0);
        const tsB = Number(b.ts ?? 0);

        if (tsA !== tsB) return tsA - tsB;

        const idxA = Number(a.event_index ?? 0);
        const idxB = Number(b.event_index ?? 0);

        return idxA - idxB;
      });

      const state = deriveNoteState(sorted);

      if (state?.anomalies?.length) {
        flagged.push(...state.anomalies);
      }
    }

    return json(200, {
      ok: true,
      stats,
      recent,
      flagged: flagged.slice(0, 25)
    });
  } catch (err) {
    console.error('explorer-recent error:', err);
    return serverError(err);
  }
};