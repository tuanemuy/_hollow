const ADMIN = '01950000-0000-7000-8000-000000000001';
const ADMIN_DIR = '019e9845-7d00-76d2-9276-b1771d744df1';
const TESTER = '01950642-0000-7000-8000-0000000000f1';
const TESTER_DIR = '01950642-0000-7000-8000-0000000000f2';
const noteId = i => `01950642-0000-7000-8000-0000000000${String(i).padStart(2,'0')}`;
const N = 26;
const lines = [];
const ids = Array.from({length:N},(_,k)=>noteId(k+1));
const inList = ids.map(id=>`'${id}'`).join(',');
lines.push(`-- Issue #642 P32 公開検索ソート検証シード（冪等: 固定ID削除→再投入）`);
lines.push(`DELETE FROM note_tags WHERE note_id IN (${inList});`);
lines.push(`DELETE FROM search_documents WHERE note_id IN (${inList});`);
lines.push(`DELETE FROM publication_states WHERE note_id IN (${inList});`);
lines.push(`DELETE FROM notes WHERE id IN (${inList});`);
// tester user + root dir
lines.push(`INSERT INTO users (id, name, email, email_verified, image, created_at, updated_at, username, display_username, role, banned, ban_reason, ban_expires, bio, avatar_media_id, last_username_changed_at, deleted_at, username_normalized)
VALUES ('${TESTER}', 'P32 Sort Tester', 'p32-sort-tester@example.com', 1, NULL, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z', 'p32-sort-tester', NULL, 'member', 0, NULL, NULL, NULL, NULL, NULL, NULL, 'p32-sort-tester')
ON CONFLICT(id) DO UPDATE SET banned=0, deleted_at=NULL;`);
lines.push(`INSERT OR IGNORE INTO directories (id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at)
VALUES ('${TESTER_DIR}', '${TESTER}', NULL, '', '', 0, 0, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z');`);
// tags
const tagA='01950642-0000-7000-8000-0000000000a1', tagB='01950642-0000-7000-8000-0000000000a2', tagC='01950642-0000-7000-8000-0000000000a3';
lines.push(`INSERT OR IGNORE INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at) VALUES
('${tagA}','${ADMIN}','p32-tag-a','p32-tag-a',0,'2026-06-13T00:00:00.000Z','2026-06-13T00:00:00.000Z'),
('${tagB}','${ADMIN}','p32-tag-b','p32-tag-b',0,'2026-06-13T00:00:00.000Z','2026-06-13T00:00:00.000Z'),
('${tagC}','${TESTER}','p32-tag-c','p32-tag-c',0,'2026-06-13T00:00:00.000Z','2026-06-13T00:00:00.000Z');`);
const esc = s => s.replace(/'/g,"''");
for (let i=1;i<=N;i++){
  const id = noteId(i);
  const admin = i<=16;
  const owner = admin ? ADMIN : TESTER;
  const dir = admin ? ADMIN_DIR : TESTER_DIR;
  const day = String(i).padStart(2,'0');
  const updated = `2024-04-${day}T12:00:00.000Z`;
  // published_at: notes 24-26 are inverted vs updated_at to prove sort uses updated_at
  const pubDay = (i>=24) ? String(50-i).padStart(2,'0') : day; // 24->26? 50-24=26,50-25=25,50-26=24 → inverted
  const published = `2024-04-${pubDay}T00:00:00.000Z`;
  const reps = 27-i; // oldest note has most keyword occurrences
  const cjk = (i===5||i===15||i===25) ? ' 蜻蛉が飛ぶ季節の記録。' : '';
  const onlyone = (i===13) ? ' p32onlyone unique marker.' : '';
  const title = `P32ソート検証ノート${day} p32sort`;
  const body = `これは Issue #642 のソート検証用ノート ${day} です。${cjk}${onlyone} ` + Array(reps).fill('p32sort').join(' ') + '。';
  const tag = admin ? (i%2===1?'p32-tag-a':'p32-tag-b') : 'p32-tag-c';
  const tagId = admin ? (i%2===1?tagA:tagB) : tagC;
  lines.push(`INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, source_file_id, version)
VALUES ('${id}','${owner}','${dir}','p32-sort-note-${day}','${esc(title)}','<p>${esc(body)}</p>','{}','active',NULL,'${updated}','${updated}',NULL,NULL,NULL,NULL,0);`);
  lines.push(`INSERT INTO publication_states (note_id, owner_id, visibility, published_at, updated_at, version)
VALUES ('${id}','${owner}','public','${published}','${updated}',0);`);
  lines.push(`INSERT INTO search_documents (note_id, owner_id, visibility, title, body_plain, tag_names_json, directory_path, date_for_calendar, updated_at, indexed_at)
VALUES ('${id}','${owner}','public','${esc(title)}','${esc(body)}','["${tag}"]','','2024-04-${day}','${updated}','${updated}');`);
  lines.push(`INSERT INTO note_tags (note_id, tag_id) VALUES ('${id}','${tagId}');`);
}
process.stdout.write(lines.join('\n')+'\n');
