# ADR — Issue #127: note_internal_links.resolved_note_id が null のまま残るケースの調査

## ADR-001: 内部リンク `kind=title` はタイトル完全一致で解決する（slug 照合をやめる）

### Status
Proposed

### Context
`resolveInternalLinks`（`app/core/domain/note/service.ts:181-189`）は `kind=title` の内部リンクを `NoteSlug.create(ref.target)` → `findByOwnerAndSlug` で照合していた。しかし `ref.target` は `[[...]]` 内のタイトル文字列であり（`extractMetadataFromHtml`, service.ts:120-134）、フロントの `formatInternalLinkInsertion`（`internalLinkSuggest.ts:25`）も `[[${title}]]` を挿入する。ADR-008（`.issue/36/adr.md`）が `[[title]]` 挿入を正式仕様として確定している。

その結果、大文字・空白・日本語を含む通常タイトルは `NoteSlug.create` の pattern（`/^[a-z0-9][a-z0-9-]*$/`）違反で throw → catch → `resolved_note_id = null` に落ち、title-keyed リンクは事実上ほぼ解決されない。

選択肢:
1. **解決側をタイトル完全一致に直す** — フロント仕様（タイトル挿入）に合わせる。
2. 挿入側を slug に変える（`[[slug]]`）— サジェストでユーザーに見える文字列が slug になり UX が劣化、ADR-008 と矛盾。

### Decision
**選択肢 1。`kind=title` はタイトル完全一致でノートを引く。** service.ts:163-168 の JSDoc が元々示していた「owner の note catalogue をタイトルで引く」意図に実装を一致させる。`kind=id`（UUIDv7 直貼り）は従来どおり素通し。

あわせて、現在の `try/catch`（service.ts:190-194）は `NoteSlug.create` の throw を握り潰すためのものなので **完全に撤去**する。title 照合では VO の throw 経路が消え、「解決失敗」は候補空配列（null）で表現できる。`findActiveByOwnerAndTitle` の I/O エラー（アダプタが `mapDbError` で翻訳した `SystemError`）はそのまま UoW 境界へ伝播させる。CLAUDE.md「adapter → application でドライバエラーは翻訳済み、ドメインは再翻訳しない」「ordinary application logic で broad try/catch を避ける」に合致。範囲限定ではなく撤去が規約に沿う。

### Consequences
- 良い点: フロント挿入仕様（ADR-008）とサーバー解決が一致し、title-keyed リンクが正しく解決される。バックリンク（`findReferrers`）も連動して機能する。broad catch 撤去でドメインのエラー契約が明確になる。
- トレードオフ: 解決に「タイトル完全一致 lookup」という新しいポート操作が必要（ADR-002）。タイトルは一意でないため曖昧性が生じる（ADR-003）。自己参照の扱いを別途定義する必要がある（ADR-005）。

---

## ADR-002: タイトル完全一致 lookup をポートに追加し、case-insensitive は `lower(title)` 関数式で実装する

### Status
Proposed

### Context
`NoteRepository` には slug 完全一致（`findByOwnerAndSlug`）と title prefix（`searchByTitlePrefix`）はあるが、**title 完全一致**の lookup が無い。case-insensitive 比較については、タグ側は `name_normalized` 列を持つが `notes` には対応する正規化列が無い。

選択肢（正規化）:
1. **`lower(title)` 関数式の完全一致** — スキーマ変更不要、index 最適化されない（ADR-004 と同じ判断）。
2. `notes` に `title_normalized` 列を追加 + migration — index は効くがスコープ拡大。

### Decision
**`findActiveByOwnerAndTitle(ownerId, title): Promise<readonly Note[]>` をポートに追加し、アダプタは `lower(title) = lower(?)` AND `owner_id = ?` AND `status = 'active'` で実装する（選択肢 1）。** 戻り値は title asc, id asc 順の配列とし、複数一致時の選択は呼び出し側に委ねる。ADR-004（同 Issue 群の `.issue/36/adr.md`）が `notes.title` の case-insensitive 検索に `lower(title)` 関数式を選んでいるのと整合させ、新規スキーマ変更は持ち込まない。

### Consequences
- 良い点: スキーマ変更ゼロ。サジェスト側（`searchByTitlePrefix` も `lower` ベース）と大小無視ルールが揃う。
- トレードオフ: 関数式は B-tree index に乗らない（ADR-004 既知）。owner + status の絞り込みでヒット件数が小さい前提に依存。

---

## ADR-003: 同名タイトルが複数あるときはタイトル昇順・id 昇順で先頭を採用する

### Status
Proposed

### Context
slug は owner 内で一意（`uniq_notes_owner_slug WHERE status='active'`）だが、タイトルは一意でない。タイトル照合に切り替えると、同名ノートが複数あるとき解決先が一意に定まらない。

選択肢:
1. **決定的順序（title asc, id asc）で先頭1件を採用。**
2. 複数一致なら曖昧として未解決（null）にする。

### Decision
**選択肢 1。** サジェスト（`searchInternalLinkTargets`）と同じ並び順を使い、ユーザーが候補リスト先頭で見ているものと一致させる。結果が決定的になりテストで固定できる。

決定規則は**ドメインサービス側で明示ソート（title asc, id asc）してから先頭採用**し、ポート（`findActiveByOwnerAndTitle`）の戻り順保証に暗黙依存しない。ポート実装が並びを変えても解決結果が壊れないようにし、ポート/ドメイン間の結合を緩める。

### Consequences
- 良い点: 常に解決される（broken link が無駄に増えない）。並びがサジェストと一致して直感的。決定的でテスト可能。明示ソートでポート順序変更に対して堅牢。
- トレードオフ: 同名ノートが複数あると、ユーザーが意図しない方に解決される可能性がある。タイトル一意制約は存在しないため本質的に避けられない曖昧性であり、決定規則で安定させることを優先する。

---

## ADR-004: リンク先の後追い作成 / 改名 / 削除に対するバックフィル・再解決はスコープ外

### Status
Proposed

### Context
Issue #127 の原因候補に「リンク先ノートが後から作成された場合の再解決トリガー欠如」が挙がっている。現状バックフィル機構は存在しない（保存時点でのみ解決）。これを実装するには、ノート作成・改名・削除の各タイミングで既存の未解決 / 解決済みリンクを再走査する独立した機構が必要になる。

### Decision
**本 Issue のスコープは「保存時点で対応ノートが存在すれば正しく解決される」までとし、後追いバックフィル・再解決は実装しない。** Issue の「期待される動作」（対応ノートが存在する場合に正しく解決）は ADR-001〜003 で満たされる。バックフィル機構は Phase 4 で follow-up Issue として切り出す。

### Consequences
- 良い点: 根本原因（照合キー不整合）の修正に集中し、副作用範囲の広い再解決機構を分離できる。
- トレードオフ: リンク先が後から作成された場合、対象ノートを再保存するまでは null のまま残る。follow-up Issue で別途対応する。

---

## ADR-005: 自己参照（self-link）は解決候補から除外する

### Status
Proposed

### Context
slug 照合（`findByOwnerAndSlug`）時代は、保存対象ノートが本文に `[[自分のタイトル]]` を書いても、解決は単一の slug lookup であり「自分自身を backlink に含む」という観点は表面化しなかった。タイトル完全一致照合（ADR-001）に変えると、`findActiveByOwnerAndTitle(ownerId, ref.target)` は DB 上に存在する**保存対象ノート自身**を候補に含みうる。結果として自分の backlink（`findReferrers`）に自分が現れる。

- saveNote / commitIngestionPreview: 既存ノートを更新するので自分が active 行として存在し、自己解決されうる。
- createNote: ノート挿入前に `resolveInternalLinks` が走るため、そもそも自分はまだ DB に存在せず自己解決されない（非対称）。

### Decision
**`assembleFromInputs` の input に optional な `selfNoteId?: NoteId` を追加し、`resolveInternalLinks` に `exceptId` として渡して、解決候補から `id === exceptId` のノートを除外する。** saveNote / commitIngestionPreview は対象ノートの既存 id、createNote は採番済みの新規 id を渡す。これにより全経路で「自己参照は解決しない」挙動に統一する（createNote の非対称も解消）。

### Consequences
- 良い点: backlink に自分が現れる不自然な挙動を防ぎ、全経路で挙動が一貫する。テストで固定可能。
- トレードオフ: `assembleFromInputs` の input にフィールドが 1 つ増え、3 つの usecase が id を渡す必要がある。影響は局所的で小さい。

---

## ADR-006: `commitIngestionPreview` は note id 決定を `assembleFromInputs` の前に巻き上げる

### Status
Accepted（実装時判断）

### Context
ADR-005 で `assembleFromInputs` に `selfNoteId` を渡す方針を決めたが、`commitIngestionPreview` は元々 `assembleFromInputs` を呼んだ**後**に overwrite / create を分岐し、そこで note id（overwrite は既存 target、create は新規採番）を確定していた。`selfNoteId` を assemble に渡すには、id を assemble より前に確定する必要がある。

選択肢:
1. **id 決定（overwrite target の取得 / 権限チェック、または新規 id 採番）を `assembleFromInputs` の前に巻き上げ、確定した `selfNoteId` を assemble に渡す。**
2. assemble を 2 回呼ぶ / link 解決だけ後で再実行する — 重複と複雑性が増す。

### Decision
**選択肢 1。** `mods.overwriteNoteId` がある場合は assemble 前に `findById` + owner チェックを行って既存 id を得る（権限エラーがより早く surface する副次的な利点もある）。ない場合は `idGenerator.next()` を assemble 前に 1 回だけ採番し、その id を create の `Note.create` にもそのまま使う。これにより overwrite / create 両経路で `selfNoteId` を一貫して渡せる。

### Consequences
- 良い点: ADR-005 の自己参照除外が ingestion 経路でも機能する。overwrite target の not-found / forbidden が assemble より前に出る。
- トレードオフ: usecase 内のブロック順序が変わった（id 確定 → assemble → 永続化）。挙動は等価で、テストで担保。

---

## ADR-007: `kind=id` 内部リンクも存在確認のうえ `resolved_note_id` を埋める（owner スコープ）

### Status
Accepted（ブラウザ検証 TC-005 で発覚 → 実装時判断）

### Context
ブラウザ検証（manual-test TC-005）で、本文に UUID を直書きした `[[<uuid>]]`（`kind=id`）リンクの `resolved_note_id` が NULL のまま残ることが判明した。原因は `resolveInternalLinks` が `kind=id` を `out.push(ref)` で素通しし、`resolvedNoteId` を設定していなかったこと。一方 VO の JSDoc（`valueObject.ts`）は「id-keyed references always carry the matching id」と不変条件を宣言しており、実装がこれに違反していた。これは Issue #127 が原因候補に挙げた「内部リンクの `ref.target` 値と `resolvedNoteId` の関係性の検証漏れ」そのもので、Issue の「期待される動作（対応ノートが存在する場合に正しく解決）」の範囲内。`note_internal_links.resolved_note_id` は `notes.id` への FK（onDelete: set null）を持つため、存在しない id を盲目的にセットすると INSERT が FK 違反で失敗する。

選択肢:
1. `target` を盲目的に `resolvedNoteId` にセット（VO doc の字面通り「canonical だから信頼」）— 存在しない id で保存が FK 違反、別オーナーのノートへの backlink 漏洩のリスク。
2. **`kind=id` も owner スコープで存在・active を確認し、満たせば `resolvedNoteId` をセット、満たさなければ null（broken link）。** `kind=title` と同じ安全性・一貫性。
3. スコープ外として follow-up Issue 化 — 同じ関数・同じ機能・Issue 意図のど真ん中であり切り出しは不自然。

### Decision
**選択肢 2。** `resolveInternalLinks` の `kind=id` 分岐で `repo.findByIds([NoteId.create(ref.target)])` を引き、`status === 'active'` かつ `ownerId === owner` かつ `exceptId` でない場合に `resolvedNoteId = target` をセットする。満たさなければ null。VO / service の JSDoc も実態（存在確認のうえ解決）に合わせて更新した。

### Consequences
- 良い点: `[[<uuid>]]` リンクが正しく解決され backlink も機能する。FK 違反による保存失敗を防ぎ、別オーナーのノートへの解決（backlink 漏洩）も防ぐ。`kind=title` と挙動・安全性が揃う。
- トレードオフ: `kind=id` リンクごとに `findByIds` を 1 回引く（従来は 0 回）。`kind=id` リンクは稀（サジェストは常にタイトル挿入）のため影響は小さい。VO doc の旧不変条件「always carry the matching id」を「存在する owned note のときに限り解決」に緩めた。

