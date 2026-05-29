# ADR — Issue #321: 内部リンクの後追い再解決

#127（`.issue/127/adr.md`）の ADR-001〜007 を前提とする。本Issueの番号は #127 からの連番として ADR-008 から開始する。

## ADR-008: 再解決は aggregate re-save ではなく `note_internal_links` の直接バルク更新で行う

### Status
Proposed

### Context
リンク先ノートのライフサイクルイベントに応じて、**他ノートの** `note_internal_links.resolved_note_id` を更新する必要がある。手段の選択肢:

1. 参照元ノートの aggregate を `findById` で読み、`internalLinkRefs` を再解決して `save`（OCC付き）する。
2. `note_internal_links` 行の `resolved_note_id` だけを行レベルで直接 set/unset する新ポートメソッドを追加する。

### Decision
**選択肢 2。** `resolved_note_id` は本文（`internalLinkRefs` の refKind/refTarget）から導出される **projection state** であり、参照元ノートの不変条件（タイトル・本文・version）には属さない。したがって aggregate を経由せず行レベルで更新してよい。

ポートに `findUnresolvedTitleLinkRows` / `findResolvedLinkRowsByTarget` / `setLinkResolution` を追加し、owner スコープ + IN 句でバッチ更新する。決定規則（title asc, id asc・self 除外・lower 比較）はドメインサービス `chooseResolutionForTitle`（#127 ADR-003 のロジックを抽出）に集約し、ロジック分散を防ぐ。

### Consequences
- 良い点: re-save 案の重い副作用（OCC 競合・全 child delete-reinsert・version 増加・`note.content_updated` の不要発火・イベント連鎖）を回避。大量リンクでも owner スコープ・IN 句で実用的。
- トレードオフ: 「すべての書き込みは aggregate 経由」という原則を projection state について一点緩める。save（delete-reinsert）と再解決（直接 update）が同一論理リンクを触りうるが、両者とも同じ決定規則（`chooseResolutionForTitle`）に基づくため最終整合する（last-write-wins だが結果は決定的）。
- 最終整合の補強（round 2 S-005）: save は `note_internal_links` 行を delete→reinsert で **`id` ごと再採番**する（adapter `bufferChildInserts`）。再解決 handler が先に読んだ link 行 id は save 後には存在しないため、再解決の `setLinkResolution(IN ...)` は 0 行ヒットで空振りするが、reinsert された行は save 時点の `resolveInternalLinks` が同じ決定規則で resolved 済みなので収束する。逆順なら再解決の update が活き、後続 save が同一決定規則で上書きする。いずれも決定的。
- 再解決の write は UoW pending/batch（遅延書き込み）で行い、handler 内では read→計算→write の順を守る（read-after-write 依存なし・途中失敗時の部分コミット回避）。

---

## ADR-009: 既存滞留行の一括バックフィルはマイグレーションではなく運用 usecase で行う

### Status
Proposed

### Context
#127 修正前に蓄積した `resolved_note_id IS NULL` 行は、対象ノートが再保存/改名されない限り埋まらない。本Issueの再解決 handler は「リンク先イベント発生時」しか走らないため、既存滞留は自動解消しない。一括バックフィルの実装手段:

1. SQL マイグレーション（D1 migration）。
2. アプリ層の運用 usecase（owner スコープ）。

### Decision
**選択肢 2。** `backfillInternalLinkResolution`（owner スコープ）を実装し、owner の active note を走査して決定規則で未解決 title リンクを一括解決する。冪等。

### Consequences
- 良い点: 決定規則（title asc,id asc・self 除外・lower 比較）を同じドメインロジックで再利用でき、owner 単位制御・冪等再実行が容易。
- トレードオフ: 本番では内部 API / 管理経路から手動起動する運用が必要（UI はスコープ外）。マイグレーション一発実行に比べ起動手順が要る。

---

## ADR-010: タイトル変更の再解決は payload の旧タイトルに依存せず「現タイトル不一致の解決済み title 行を解除」方式で吸収する

### Status
Proposed

### Context
改名時に「旧タイトルで解決していたリンクの解除」が必要だが、`note.renamed` / `note.content_updated` の payload には新（現）タイトルしか含まれず（events.ts）、旧タイトルが無い。

さらに重要な事実として、**タイトル変更は `renameNote` 専用 usecase（`note.renamed`）だけで起きるのではない**。エディタの保存経路 `saveNote` は `input.title` を `NoteTitle` 化して `Note.updateContent` の `titleOverride` に渡し（`saveNote.ts:62,132-133`）、`updateContent` は `note.content_updated` を emit する（`entity.ts:135,175`）。`restoreNoteRevision` も `revision.title` を `updateContent` に渡す。つまり**実運用で最頻のタイトル変更経路は `note.content_updated`**であり、当初計画が `content_updated` を「タイトル不変」として除外していたのは誤りだった（round 1 で両レビュアーが P-001 として指摘）。

選択肢:
1. payload に旧タイトルを追加する。
2. 「`resolved_note_id` がこのノートを指すが、現タイトルと不一致の `refKind='title'` 行」を解除し、別途「現タイトル一致の未解決行」を解決する（現状再評価）。これをタイトルを変えうる全イベント（created/content_updated/renamed/restored）から呼ぶ。
3. 全ノートを全再評価する。
4. `saveNote`/`updateContent` がタイトル変更時に `note.renamed` を emit する設計に変更する。

### Decision
**選択肢 2。** タイトルを起こしうる全イベント（`note.created` / `note.content_updated` / `note.renamed` / `note.restored`）から統合 reaction handler `handleLinkTargetResolution({ container, noteId })` を呼ぶ。

**現タイトルは payload からではなく handler 自前の UoW 内 `ctx.noteRepository.findById(noteId)` で再読する**（round 2 P-001）。理由: `note.restored` の payload には title が無く（events.ts:61-68 `NoteRestoredEvent = { noteId, ownerId, directoryId }`）、4イベントを統合するには payload title 前提が崩れる。consume 時点の最新 aggregate を読むことで、stale payload / 順序入れ替わり時も常に最新タイトルで収束する（dispatcher の `buildSnapshotByNoteId` / #145 ADR-001 の consume-time 再読方針と整合）。note が absent または `status != 'active'` なら no-op で抜ける（trashed への遷移直後のレースは `handleLinkTargetTrashed` が担当）。

handler は同一 UoW で (a) `findResolvedLinkRowsByTarget(noteId)` のうち `refKind='title'` かつ `lower(refTarget) != lower(現タイトル)` を `setLinkResolution(ids, null)` で解除、(b) `findUnresolvedTitleLinkRows(ownerId, 現タイトル)` を決定規則で解決、(c) このノート id を指す未解決 kind=id 行を解決する。kind=id 行は id 不変なので (a) では解除しない。

選択肢 4 は `note.renamed` の意味論変更・全 emit 経路への波及で Issue スコープを超えるため不採用。選択肢 2 なら payload 不変のまま `content_updated` 経由のタイトル変更も同一ロジックで吸収できる。

### Consequences
- 良い点: payload 不変で既存イベント / outbox 互換を保つ。旧タイトルを持ち回らずに成立し、冪等・順序非依存。created/content_updated/renamed/restored を1つの収束ロジックに集約でき、経路漏れ（P-001）が起きない。
- トレードオフ: タイトル変更を起こしうるイベントごとに「このノートを指す解決済み行」を1回 scan するが `idx_nil_resolved` で軽量。最頻の `note.content_updated`（本文のみ編集）でもクエリが走るが、解除/解決とも空集合 no-op で、同 case の search 再インデックスと同程度の負荷。

---

## ADR-011: 未解決 kind=id 行のバックフィルに専用ポート `findUnresolvedIdLinkRows` を追加する（実装時判断）

### Status
Accepted（実装時判断）

### Context
plan.md ステップ1 はポートに3メソッド（`findUnresolvedTitleLinkRows` / `findResolvedLinkRowsByTarget` / `setLinkResolution`）を追加する想定だったが、ステップ4「解決(id)」が要求する「このノート id を指す**未解決** kind=id 行」を引く手段が3メソッドのいずれでも得られない。`findResolvedLinkRowsByTarget` は `resolvedNoteId = target` の**解決済み**行しか返さず、未解決（`resolvedNoteId IS NULL`）の id 行は対象外。plan.md ステップ4 の注記が「`findUnresolvedIdLinkRows(ownerId, noteId)` を追加するか汎用化するかは既存パターンに沿って判断し ADR/コメントに残すこと」と明示している。

選択肢:
1. title 専用の `findUnresolvedTitleLinkRows` と対になる id 専用 `findUnresolvedIdLinkRows(ownerId, targetNoteId)` を追加する。
2. 既存メソッドを「kind と target で引く汎用未解決クエリ」に一般化する。

### Decision
**選択肢 1。** `findUnresolvedTitleLinkRows` と同じ owner+active join・同じ戻り値形（`{ id, fromNoteId }[]`）の id 版を追加し、`refKind='id' AND resolvedNoteId IS NULL AND refTarget = <targetNoteId> AND from が owner の active note AND fromNoteId <> targetNoteId（自己除外）`で引く。

汎用化（選択肢2）を採らない理由: title 版は `lower(refTarget)=lower(?)` の関数式比較、id 版は `refTarget = ?` の等値比較で where が本質的に異なり、また id 版は自己除外（`fromNoteId <> targetNoteId`）を SQL レベルで持つ一方、title 版の自己除外は決定規則（`chooseResolutionForTitle` の exceptId）側に寄せている。1メソッドにまとめると分岐フラグが増え、既存の「kind ごとに専用 finder（`findActiveByOwnerAndTitle` 等）」パターンからも外れる。kind=id は決定規則（同名タイトルの tie-break）が不要で「存在すれば即解決」なので、戻り行をそのまま全件 `setLinkResolution(..., noteId)` に渡せる。

### Consequences
- 良い点: title / id それぞれの finder が単一責務で、where も戻り値も既存パターンと揃う。restore で trash 時に解除された id 行を確実に再解決できる。
- トレードオフ: ポートのメソッド数が plan.md 想定の3から4に増える。影響は局所的（adapter 1実装 + 既存 stub の追従のみ）。
- バックフィル運用 usecase（ADR-009 / ステップ6）は title 行のみを対象とし id 行は扱わない。kind=id は保存時（ADR-007）と restore handler で解決され、「active だった target を指す未解決 id 行」という滞留状態は実質発生しないため。

---

## ADR-012: trashed reaction handler も consume-time ステータス再読で「現在 trashed のときだけ解除」する

### Status
Accepted（review-002 B-1 で発覚 → 実装時判断）

### Context
`handleLinkTargetResolution`（created/content_updated/renamed/restored）は ADR-010 の通り consume 時に `findById` でステータスを再読し、absent / 非 active なら no-op する設計で、at-least-once・順序保証なしの配送下でも最新状態に収束する。一方 `handleLinkTargetTrashed` は当初、対象を指す解決済み行を**無条件で全解除**していた。

この非対称が収束バグを生む。trash → restore は別 UoW・別 outbox 行として発行され、順序保証がない:
- `note.restored` を先に処理（resolution が A=active と読み B のリンクを再解決）→ `note.trashed` が遅延処理（trashed が B のリンクを無条件 null 解除）。最終的に A は active のままなのに B のリンクが null になり、**修復するイベントが存在しない**（A を再保存/改名するかバックフィル usecase 手動実行まで残留）。
- `note.trashed` の重複配送（restore 後に古い trashed が再配送）でも同じ。

### Decision
**`handleLinkTargetTrashed` も `findById` でステータスを再読し、解除は「現在 trashed のときだけ」行う。** `note === null`（purge 済み → FK の set null が既にクリア）または `status === 'active'`（restore が勝った / stale / 再配送）は no-op。これで resolution / trashed 両 handler が consume-time 再読で対称になり、任意順・重複配送でも DB の現アグリゲート状態（= 最後にコミットした usecase の結果）に収束する。

### Consequences
- 良い点: at-least-once・順序保証なしの配送モデルで両 handler が収束する。trash→restore の reorder / trashed 再配送でリンクが恒久的に壊れる経路を塞ぐ。
- トレードオフ: trashed handler が解除前に `findById` を1回引く（従来は0回）。consume 経路のコストは resolution handler と同等で許容範囲。
