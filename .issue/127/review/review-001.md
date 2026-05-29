# PR Review #001 — fix(issue/127): resolve internal-link resolved_note_id by title (and id) match

**PR:** #320
**Date:** 2026-05-29
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 7
- Notes: 多数（良い点・整合確認）
- Verdict: **BLOCKED**（Warning を全件修正してから再レビュー）

---

## Domain

### Blockers
- なし

### Warnings
- **[W-D-001]** `kind=id` 分岐の `note.id === targetId` フィルタが冗長に見える
  - 場所: `app/core/domain/note/service.ts`（kind=id の `find`）
  - 理由: `findByIds([targetId])` は単一 id 引きなので返る行は定義上すべて `id === targetId`。実害はないが誤読を招く。
  - 提案: 防御的意図をコメント化、またはテストで意味づけする（Test W-T-002 と対）。

### Notes（抜粋）
- ソート比較子は branded string 比較で locale 非依存・決定的（ADR-003 実装が正しい）。
- kind=id ガード（id一致・active・owner一致・exceptId除外）に漏れなし。FK 違反・クロスオーナー漏洩を防止（ADR-007 一致）。
- catch 完全撤去はエラー契約を壊していない（I/O は UoW 境界へ伝播、ADR-001）。
- VO doc / service JSDoc の更新が実態と一致。plan / ADR と乖離なし。

## Adapter / Port

### Blockers
- なし

### Warnings
- **[W-A-001]** `findActiveByOwnerAndTitle` の JSDoc に「`title` は呼び出し側で trim 済み」の契約が無い
  - 場所: `app/core/domain/note/ports/noteRepository.ts`（新メソッド JSDoc） vs `searchByTitlePrefix`（"caller is responsible for trimming"）
  - 理由: 動作は正しい（両側 trim 済み VO）が、`searchByTitlePrefix` と契約明示度が非対称。
  - 提案: JSDoc に trim 前提を一文追記。
- **[W-A-002]** 同 JSDoc に「LIMIT を課さず全一致を返す」旨の記載が無い
  - 場所: 同上
  - 理由: 同名タイトル多数の owner で全件 hydrate しうる前提が明示されていない。
  - 提案: but-document を一行追加。

### Notes（抜粋）
- SQL（`lower(title)=lower(?)` AND owner AND active、title asc/id asc）は ADR-002 に完全一致。
- `mapDbError` 翻訳パターンを既存読み取りメソッドと同形で踏襲。
- 統合テストが case-insensitive / 同名 id 順 / owner 分離 / trashed 除外 / prefix 非ヒットを網羅。

## Use Case

### Blockers
- なし

### Warnings
- **[W-U-001]** `commitIngestionPreview` の overwrite 経路でエラー発生順序が変わっている（意図的・ADR-006）
  - 場所: `app/core/application/ingestion/commitIngestionPreview.ts`
  - 理由: overwrite target の NotFound/Forbidden が `assembleFromInputs` の前に surface するようになった。永続化副作用は等価だがエラー種別の順序は観測可能な差異。
  - 提案: ADR-006 の「挙動は等価」を「永続化副作用は等価／エラー順序は意図的に変更」に精緻化。順序差を固定する統合テストがあると退行検知になる。
- **[W-U-002]** `directoryId = target.entity.directoryId`（overwrite 分岐）がデッドコード（base からの引き継ぎ）
  - 場所: `commitIngestionPreview.ts`
  - 理由: if/else 以降 `directoryId` は読まれない。
  - 提案: 巻き上げで周辺を触ったついでに削除を検討。

### Notes（抜粋）
- `selfNoteId` の値が全経路で正しい（create=採番id, save=既存id, ingestion overwrite=target id / create=採番id）。
- UoW 境界は健全（id 確定→assemble→永続化が単一 UoW 内）。ドメインロジック漏出なし。
- `runExportJob` の変更はポート準拠メソッドの最小実装追加で妥当。

## Test

### Blockers
- なし

### Warnings
- **[W-T-001]** `kind=id` で **trashed なノート**を指すケースのユニットテストが欠落
  - 場所: `app/core/domain/note/__tests__/service.resolveInternalLinks.test.ts`
  - 理由: 実装の `status === "active"` ガード（ADR-007 の核心的安全条件）に裏付けテストが無く、この分岐を消しても緑のまま通る回帰穴。
  - 提案: `byIds` が trashed ノートを返すケースを1本追加し null を確認。
- **[W-T-002]** `kind=id` の id 突合ガード（`note.id === targetId`）が未検証
  - 場所: 同上
  - 理由: stub の `byIds` が引数を無視するため、別 id を返したときに拾わないことが未確認。
  - 提案: `byIds` が別 id のノートを返すケースで null を確認する1本を追加（W-D-001 と対で、ガードに意味づけ）。

### Notes（抜粋）
- plan.md のテスト方針を概ね網羅。stubRepo は未使用メソッド throw で旧 slug 経路復活を loud に検知。
- 統合テストは実 DB 値 + `findReferrers` 連動の両方を assert（過剰モックなし）。
- `[[title]]` 挿入契約は未変更（回帰として維持）+ ブラウザ TC で往復担保。

---

## Design Decisions

このラウンドで新規の設計判断なし。W-U-001 を受けて ADR-006 の Consequences 文言を精緻化する（挙動等価の範囲を明確化）。
