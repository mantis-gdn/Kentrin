export async function fetchNoteMetadata(apiBase, noteId) {
  const res = await fetch(`${apiBase.replace(/\/$/, "")}/.netlify/functions/note-read?note_id=${encodeURIComponent(noteId)}`);
  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`note-read returned non-JSON: ${text}`);
  }

  if (!res.ok) {
    throw new Error(JSON.stringify(data, null, 2));
  }

  return data;
}

export async function scanKnownNotes(apiBase, noteIds = []) {
  const results = [];
  for (const noteId of noteIds) {
    if (!noteId || !/^[a-f0-9]{64}$/i.test(noteId)) continue;
    try {
      const meta = await fetchNoteMetadata(apiBase, noteId);
      results.push(meta);
    } catch (err) {
      results.push({ note_id: noteId, error: err.message });
    }
  }
  return results;
}
