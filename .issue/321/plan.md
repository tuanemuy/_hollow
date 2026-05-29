# 実装計画 — Issue #321: 内部リンクの後追い再解決（リンク先ノートの作成・改名・削除時のバックフィル）

**Issue:** #321
**作成日:** 2026-05-29
**複雑度:** 中〜大規模

---

## 目的

#127（PR #320）で内部リンク `[[...]]` の `note_internal_links.resolved_note_id` を**保存時点**で正しく解決するようにした。本Issueでは、**リンク先ノートが後から作成・改名・削除（trash/restore）された場合に、既存の `note_internal_links` 行の解決状態を追従させる**後追い再解決機構を実装する（#127 ADR-004 で意図的に見送った範囲）。

## スコープ

### 含まれるもの

- **作成時バックフィル**: 新規ノートのタイトル / id に一致する未解決（`resolved_note_id IS NULL`）リンクを解決する。
- **改名時再解決**: 旧タイトルで解決していた行の解除 + 新タイトル一致の未解決行の解決。**改名は `renameNote` 専用 usecase（`note.renamed`）だけでなく、エディタ保存でタイトルを変える経路（`saveNote` → `Note.updateContent` → `note.content_updated`）でも起きる**ため、両イベントをトリガーに含める（後述 ADR-010 / round 1 P-001）。
- **trash時解除 / restore時再解決**: trash で当該ノートを指す行を解除、restore でバックフィル解決。
- これらをドメインイベント（`note.created` / `note.content_updated` / `note.renamed` / `note.trashed` / `note.restored`）駆動で outbox/consumer 経路に乗せる。
- 既存DBに滞留している `resolved_note_id IS NULL` 行の一括バックフィル運用 usecase（owner スコープ）。

### 含まれないもの

- `note.purged`（完全削除）のハンドリング — FK の `onDelete: cascade`（from 行）/ `set null`（resolved 参照）で対応済みのため不要。
- `note.moved` / `note.tags_replaced` のトリガー — タイトル・id 不変なので title/id-keyed の解決状態は変わらない。
- バックフィル運用 usecase の管理 UI（内部 API / 管理経路からの手動起動前提。起動口の整備は follow-up）。
- 内部リンク解決結果のキャッシュ / インデックス層。
- `saveNote` / `updateContent` のタイトル変更を `note.renamed` に寄せる設計変更（Issue スコープ超。`note.content_updated` をトリガーに含めることで吸収する）。

## 実装ステップ

### 1. ポートに「resolved_note_id 直接更新」系メソッドを追加

- **対象ファイル:** `app/core/domain/note/ports/noteRepository.ts`
- **変更内容:** `NoteRepository` に以下を追加。
  - `findUnresolvedTitleLinkRows(ownerId, title): Promise<readonly { id: string; fromNoteId: NoteId }[]>` — owner スコープで `refKind='title' AND resolvedNoteId IS NULL AND lower(refTarget)=lower(title)` かつ from_note_id が active note の行を引く。
  - `findResolvedLinkRowsByTarget(targetNoteId): Promise<readonly { id: string; fromNoteId: NoteId; refKind: 'id' | 'title'; refTarget: string }[]>` — `resolvedNoteId = targetNoteId` の行（改名・trash 時の解除候補）。
  - `setLinkResolution(linkRowIds: readonly string[], resolvedNoteId: NoteId | null): Promise<void>` — 指定 link 行群の `resolved_note_id` を IN 句でまとめて一括 set/unset。
- **理由:** aggregate re-save は OCC 競合・全 child delete-reinsert・version 増加・`note.content_updated` 連鎖発火という重い副作用を伴い、大量リンク再解決で非現実的。`resolved_note_id` は本文から導出される projection state であり、行単位の直接更新が適切（ADR-008）。owner スコープ + IN 句でバッチ性能を確保。

### 2. アダプタ実装

- **対象ファイル:** `app/core/adapters/d1/repositories/noteRepository.ts`
- **変更内容:** 上記3メソッドを `mapDbError` でラップして実装。
  - `findUnresolvedTitleLinkRows`: `noteInternalLinks` を `notes`（fromNoteId, status='active', ownerId）と join、`refKind='title'`、`resolvedNoteId IS NULL`、`lower(refTarget)=lower(?)`。`idx_nil_target` を活用。
  - `findResolvedLinkRowsByTarget`: `eq(resolvedNoteId, targetNoteId)`（`idx_nil_resolved` 利用）。既存 `findReferrers` と同じ where 条件。
  - `setLinkResolution`: ids 空なら短絡。`db.update(noteInternalLinks).set({ resolvedNoteId }).where(inArray(id, chunk))` をホスト変数上限でチャンク。UoW 内なら既存 pending/batch 機構に合わせる。
- **理由:** 既存 `findActiveByOwnerAndTitle` / `findReferrers` / save の delete-reinsert と同じ書き方・同じ index 前提。

### 3. 再解決の決定規則をドメインサービスに集約

- **対象ファイル:** `app/core/domain/note/service.ts`（`NoteService` に純関数追加）
- **変更内容:**
  - `chooseResolutionForTitle(candidates, exceptId): NoteId | null` — #127 の title asc, id asc 明示ソート先頭採用ロジックを `resolveInternalLinks` から抽出・共有。
  - 再解決でこのロジックを使い、保存時と再解決時で決定規則を完全一致させる。
- **理由:** 同名複数時の決定規則が保存時と再解決時で食い違うと backlink が不安定になる。決定規則をドメインの1箇所に集約する（#127 ADR-003 と一意に整合）。

### 4. 再解決 application handler を新設

- **対象ファイル:** `app/core/application/note/` 配下に新規2ファイル（note ドメイン内の projection 再解決なので note 配下。ファイル冒頭 JSDoc で「mutation usecase ではなく reaction handler である」ことを明示する — round 1 S-001）。
  - `handleLinkTargetResolution.ts`（`note.created` / `note.content_updated` / `note.renamed` / `note.restored` 用の統合 reaction handler）: 入力は `noteId` のみ。**payload の title には依存しない**（`note.restored` の payload には title が無いため — round 2 P-001）。同一 UoW で:
    - **対象再読**: `ctx.noteRepository.findById(noteId)` でエンティティを再読し、現タイトル・ownerId・status を得る。**note が absent または `status != 'active'` の場合は no-op で抜ける**（consume 時点で再 trash / purge 済みのレース対策。trashed への遷移は `handleLinkTargetTrashed` が担当）。consume 時の最新値で解決するため、stale payload / 順序入れ替わりにも常に最新タイトルで収束する（#145 ADR-001 の consume-time 再読方針と整合）。
    - **解除（stale）**: `findResolvedLinkRowsByTarget(noteId)` のうち `refKind='title'` かつ `lower(refTarget) != lower(現タイトル)` の行を `setLinkResolution(ids, null)`。旧タイトル解決行の解除を旧タイトルに依存せず「現タイトル不一致」で判定する（ADR-010）。kind=id 行は id 不変なので解除しない。
    - **解決（title）**: `findUnresolvedTitleLinkRows(ownerId, 現タイトル)` で現タイトル一致の未解決行を引き、`chooseResolutionForTitle` で「このノートが選ばれる行」だけを `setLinkResolution(..., noteId)`。自己参照は exceptId=noteId で除外。
    - **解決（id）**: このノートの id を指す未解決 kind=id 行（owner スコープ・active from・非 self）を `setLinkResolution(..., noteId)`。created は id が新規採番なので実質 no-op、restored（trash で解除された id 行の復活）で必要。
  - この統合 handler は created / content_updated / renamed / restored すべてで冪等かつ正しく収束する: created は stale 部が no-op、content_updated/renamed はタイトル変更時に解除＋解決の双方向、restored は trash 時に解除された id/title 行を両方バックフィル（restore 直後は対象 id を指す resolved title 行が無いので解除部は空集合 no-op — round 2 S-001）。**最頻イベント `note.content_updated`（エディタ保存）でも走るが、タイトル未変更時は解除クエリ・解決クエリとも空集合を返す軽量 no-op**（pending も空なので `db.batch` 自体がスキップされ純 read UoW として返る — round 2 S-003）。
  - `handleLinkTargetTrashed.ts`（`note.trashed` 用）: `findResolvedLinkRowsByTarget(noteId)` で全行（id/title 問わず）`setLinkResolution(ids, null)`。FK の set null は物理削除時のみ作動し trash（論理削除）では作動しないため明示解除が必要。
- 各 handler は `container.unitOfWorkProvider.run` で完結し、`collectEvents` は**呼ばない**（resolved_note_id は projection。派生イベントを発火させず outbox を一切汚さないことを不変条件とする — ADR-008 / round 1 S-003。`collected.length > 0` ガードで outbox.save / relayTrigger.kick は走らないことを実コードで確認 — round 2 S-003）。
- `setLinkResolution` の write は**即時 update ではなく UoW の pending/batch（遅延書き込み）**で行う。read（find*）→ 計算 → write（setLinkResolution）の順なので read-after-write 依存は無く、handler 途中失敗時の部分コミットも避けられる（round 2 S-002）。
- **理由:** 既存 reaction handler パターン（UoW で再読→更新、冪等）に一致。タイトル変更を起こす全イベント（created/content_updated/renamed/restored）を1つの収束ロジックに集約し、ロジック重複と経路漏れ（P-001）を同時に防ぐ。

### 5. dispatchDomainEvent に fan-out 登録

- **対象ファイル:** `app/core/application/workers/dispatchDomainEvent.ts`
- **変更内容:**
  - 現状 `note.created` / `content_updated` / `renamed` / `moved` / `restored` / `tags_replaced` は1つの case 本体（`buildSnapshotByNoteId` → `handleNoteSavedEvent`）を fallthrough 共有している。case 分解は不要だが、**既存 case 本体は `snapshot === null`（note absent/trashed）で早期 return する**。再解決 handler は自前 UoW で `findById` ＋ status guard を持つため search snapshot guard とは独立に走らせる必要があり、`note.created` / `content_updated` / `renamed` / `restored` の4イベントについて **search 早期 return より前**（または別分岐）で `handleLinkTargetResolution({ container, noteId })` を await する（round 2/3 S-001）。これにより note 不在/trashed 時も再読 guard で no-op になりつつ呼び出し自体は漏れない。
  - **実装時注意（round 3）**: 4イベント判定は `["note.created","note.content_updated","note.renamed","note.restored"].includes(event.type)` の形で書く。`event.type === "a" || "b"` は JS では常に truthy になる典型バグなので避ける。`moved` / `tags_replaced` はこの判定から外れる。
  - `note.trashed` case: 既存 search→publication→view の fan-out 末尾に `handleLinkTargetTrashed({ container, noteId })` を追加。
  - VO 化（NoteId）は副作用前に行う（Issue #159 ADR-005）。再解決 handler は title を payload から取らないので、title の VO validate は不要（round 2 S-002）。
  - `note.moved` / `tags_replaced` / `purged` は追加不要。JSDoc の routing 表を更新。
- **理由:** 新規イベント定義ゼロで既存経路に相乗り。冪等性は handler の再読・set ベース更新で担保され、retry / 順序入れ替わり / バルク経路（bulkTrashNotes・deleteDirectory は per-note で `note.trashed` を出すため per-note で再解決が走る — 許容、ADR-008）でも収束する。

### 6. 既存滞留行の一括バックフィル運用 usecase

- **対象ファイル:** `app/core/application/note/backfillInternalLinkResolution.ts`（owner スコープ）
- **変更内容:** owner の active note 一覧を引き、各ノートの title/id を使って `findUnresolvedTitleLinkRows` + 決定規則で一括 `setLinkResolution`。冪等（解決済みは未解決クエリに乗らない）。
- **理由:** #127 修正前に蓄積した `resolved_note_id IS NULL` 行は、対象ノートが再保存/改名されない限り埋まらない。本Issueの handler は「リンク先イベント発生時」しか走らないため既存滞留は解消しない。マイグレーションにしない理由は ADR-009 参照（決定規則の再現が脆く、owner 単位制御・冪等再実行がしにくい）。

### 7. テスト・検証

- ユニット: `chooseResolutionForTitle` の決定規則、各 handler の解決/解除分岐。
- 統合（D1）: 後述テスト方針。
- `pnpm typecheck && pnpm lint:fix && pnpm format`、`pnpm test`。

## 設計判断

詳細は `.issue/321/adr.md` を参照。

- **ADR-008**: 再解決は aggregate re-save ではなく `note_internal_links` 直接バルク更新（`resolved_note_id` は projection state）。
- **ADR-009**: 既存滞留行の一括バックフィルはマイグレーションではなく運用 usecase。
- **ADR-010**: `note.renamed` の旧タイトル欠落は payload 変更せず「現タイトル不一致の解決済み title 行を解除 + 新タイトル一致の未解決行を解決」方式で対応。
- イベント駆動（outbox/consumer）を採用。同期での他 aggregate 更新は UoW スコープ・aggregate 境界に反する。

## リスクと注意点

- **トリガー漏れによる収束失敗**: 大量の同名 rename が短時間に並ぶと一時的に複数行が同じ先頭ノートを指す中間状態が起こりうるが、決定規則で最終収束する（at-least-once の性質、許容範囲）。
- **child 行を aggregate 外で更新する一貫性**: save（delete-reinsert）と再解決（直接 update）が同一行を触りうる。両者は決定規則に基づくため最終整合する（ADR-008 に明記）。
- **lower(title) は index 非効率**（#127 ADR-002 既知）。owner+status+refKind 絞りで母集合が小さい前提を踏襲。adapter 実装に「`idx_nil_target` は `refKind='title'` 前置までしか効かず lower 比較は filter」とコメントを残す（round 1 S-004）。
- **purge は対象外で正しい**ことを JSDoc / ADR に明記（FK cascade + set null）。
- **content_updated を再解決トリガーに含める**（round 1 P-001 修正後）。エディタ保存（`saveNote`）でのタイトル変更が `note.content_updated` で飛ぶため。最頻イベントだが、タイトル未変更の本文編集では解除/解決クエリが空集合 no-op となり負荷は search 再インデックス（同 case で既に毎回走る）と同程度。
- **バルク経路の per-note 再解決**: `bulkTrashNotes` / `deleteDirectory` は note ごとに `note.trashed` を発行し、handler が per-note で UoW を開く。既存 trashed fan-out（search/publication/view）も per-note で走る設計と整合。収束するが N 回の UoW が走ることを ADR に明記（round 1 S-002）。

## テスト方針

- **ユニット**: `chooseResolutionForTitle`（title asc,id asc・self 除外・空→null）、各 handler の分岐。
- **統合（D1）**:
  - 作成バックフィル: B が `[[A]]`（A 不在で null 保存）→ A 作成イベント dispatch → B の行が A に解決。`findReferrers(A)` に B が出る。
  - 改名: A 改名 → 旧タイトル行が null に戻り、新タイトル未解決行が A に解決（payload に旧タイトル無しでも成立）。
  - trash/restore: A trash → A を指す行が全 null（FK 非作動でも明示解除）。A restore → 再解決。
  - purge: A purge → A の from 行は消え、A を指す resolved 行は FK で null（handler 不要を確認）。
  - 同名複数: A1,A2 同タイトル → 決定規則先頭に解決。A1 改名で A2 に再選択。
  - 冪等: 同一イベント2回 dispatch で結果不変。created→rename 逆順でも最終状態一致。
  - バックフィル usecase: 既存 null 行が一括解決・再実行で不変。
- **手動**: ブラウザで A 不在のまま B に `[[A]]` 保存（broken 表示）→ A 作成 → B のリンク/バックリンクが解決表示に変わる。A 改名で旧リンクが broken に、新タイトル参照が解決に変わる。

## レビュー履歴

### 1周目
**修正した点**:
- **P-001（要件カバレッジ／アーキ両視点が同一指摘）**: タイトル変更は `renameNote`（`note.renamed`）だけでなく、エディタ保存 `saveNote` → `Note.updateContent` → `note.content_updated`（最頻経路）でも起きる（`entity.ts:135,175` / `saveNote.ts:62,132-133` で確認）。当初計画が `content_updated` を「タイトル不変」として除外していたのは誤り。対応: 再解決トリガーに `note.content_updated` を追加し、created/content_updated/renamed/restored を統合 reaction handler `handleLinkTargetResolution`（解除＋title解決＋id解決）に集約。スコープ・step4/5・リスク・ADR-010 を実態に合わせて修正。

**取り込んだ改善提案**:
- **S-001**: dispatchDomainEvent の note.* イベントが1 case 本体（search snapshot）を fallthrough 共有している点を step5 に明記。handler ファイルに「reaction handler であり mutation usecase ではない」JSDoc を付ける方針を step4 に追加。
- **S-002**: バルク経路（bulkTrashNotes/deleteDirectory）が per-note で再解決を走らせる（許容）ことをリスク・step5 に明記。
- **S-003**: 再解決 handler が `collectEvents` を呼ばず outbox を汚さないことを不変条件として step4・ADR-008 に明記。
- **S-004**: `lower(title)` の index 非効率（#127 ADR-002 既知）を adapter コメントとして残す方針をリスクに追記。

**見送った提案とその理由**:
- 旧タイトルを payload に追加する案・`saveNote` を `note.renamed` に寄せる設計変更案（ADR-010 選択肢1,4）: イベント意味論変更で Issue スコープ超。現状再評価方式（選択肢2）で吸収するため不要。
- バックフィル usecase の起動口（server function / CLI）整備（S-003 要件カバレッジ視点）: usecase 実装で Issue の「要否を判断」要件は満たす。起動口は follow-up としてスコープ外（plan.md スコープに明記）。

### 2周目
**修正した点**:
- **P-001（両視点が同一指摘）**: `note.restored` の payload には title が無い（`NoteRestoredEvent = { noteId, ownerId, directoryId }`、events.ts:61-68）。統合 handler を「payload の title から」とした記述が restored で破綻する。対応: handler は title を payload から取らず、自前 UoW 内 `ctx.noteRepository.findById(noteId)` で現タイトル・ownerId・status を再読する設計に統一。absent / status != 'active' は no-op。consume 時最新値で解決し stale/順序入れ替わりにも収束（#145 ADR-001 整合）。step4・step5・ADR-010 を修正。

**取り込んだ改善提案**:
- **S-001（アーキ）**: dispatch は case 分解不要。既存 case 本体の後に event.type ガードで `handleLinkTargetResolution` を await。search snapshot の早期 return（snapshot null）とは独立に再解決 handler を呼ぶ必要がある点を step5 に明記。
- **S-001（要件）/ S-002（要件）**: restore 直後は解除部が空集合 no-op であること、restored で payload title を validate しないことを step4・ADR-010 に明記。
- **S-002（アーキ）**: `setLinkResolution` は即時 update でなく UoW pending/batch（遅延書き込み）で行うことを step4・ADR-008 に明記。
- **S-003（アーキ）**: collectEvents 非呼び出し＝outbox 非汚染が `collected.length > 0` ガードで実コード保証されること、完全 no-op 時は pending も空で `db.batch` スキップされることを step4 に明記。
- **S-004（アーキ）**: `chooseResolutionForTitle` 抽出は候補取得（DB クエリ）を呼び出し側に残し (2)self除外〜(4)先頭採用のみ抽出。抽出前後で同入力→同出力のユニットテストを置く方針をテスト方針に反映。
- **S-005（アーキ）**: save の delete-reinsert は行 id を再採番するため再解決 update が空振りしても reinsert 側が同決定規則で解決済みで収束する点を ADR-008 に追記。
- **S-006（アーキ）**: `findUnresolvedTitleLinkRows` は note_internal_links に owner 列が無いため notes との join 必須。lower 比較は filter になる（#127 ADR-002 既知）点を確認。

**見送った提案とその理由**:
- なし（2周目の指摘は要修正1件＋実装補強の改善提案で、すべて取り込み）。

### 3周目
両視点とも**問題点ゼロ**で終了。Issue の「期待される動作」3項目（作成時バックフィル / 改名時の解除＋解決 / trash時解除・restore時再解決）が実コードと照合して過不足なくカバーされ、UoW の read-your-write 非対応制約・outbox 非汚染・dispatch の snapshot 早期 return との独立性も実コードで保証されることを確認。

**取り込んだ改善提案（軽微）**:
- step5 のガード擬似コード `event.type === "a" || "b"`（JS で常に truthy になるバグ形）を `[...].includes(event.type)` に修正。line 77/78 の「case 本体の後」と「早期 return より前」の表現の緊張を解消し、後者を binding として統一。
