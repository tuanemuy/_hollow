# General Review — PR #694 / Issue #679

対象: 取り込みプレビュー編集でタグを削除しても commit 時に LLM 提案タグが復活するバグ修正。

## 結論

修正は正しく、根本原因を的確に潰している。`undefined` と空配列の区別、後方互換、overwrite パス、本文インラインタグのマージ挙動はすべて保たれている。AC-1〜AC-5 はテストで満たされ、integration test 全 693 件 green（57 ファイル）。Blocker なし。

## 検証メモ

### 修正の正しさ（commitIngestionPreview.ts:180-183）

```ts
const declaredTagNames =
  mods.tagNames === undefined
    ? preview.suggestedTagNames
    : explicitTagNames;
```

- 旧コードの `[...explicitTagNames, ...preview.suggestedTagNames]` 無条件マージを廃し、`title` / `frontMatter` / `directoryId`（行 160-171, 144-158）と同じ「modification 優先 / 未指定なら preview フォールバック」パターンに揃っている。レイヤー整合性・可読性ともに良好。
- `undefined` 判定は `=== undefined` の明示比較で、`?? []` による潰し込みを避けている（plan のリスク項目どおり）。空配列 `[]` は authoritative ブランチへ正しく流れる。
- `explicitTagNames`（行 72-74）の VO 化は UoW 外で先行実行され、`TagName.create` のエラーは従来どおり storage interaction 前に surface する。挙動不変。

### wire 経路（フォーム → action → usecase）

- `IngestionPreviewForm.tsx:206` は `tagNames: [...tagNames]` を**常に**送る（`parseTagInput` は空入力で `[]` を返す。editorState.ts:538-549 で確認）。よって実フォーム submit では `tagNames` は常に defined。
- `actions.ts:122` は `data.tagNames === undefined ? {} : { tagNames: data.tagNames }`。空配列は undefined ではないため `[]` がそのまま渡り、authoritative ブランチに到達する。タグ全消去が正しく「タグ0件」になる。
- `schema.ts:20` は `z.array(z.string().trim().min(1)).optional()`。空配列は valid（min は要素単位）。
- `undefined` フォールバックは「呼び出し元が tagNames を省略するケース」専用で、現状フォーム経路では発生しないが、内部 API / 将来の呼び出し元に対する後方互換として妥当。

### NoteService.assembleFromInputs のタグマージ（service.ts:427-438）

- `declaredTagNames` の後ろに `tagsFromBody`（本文インラインタグ）を dedupe マージする既存挙動は不変。本 Issue のスコープ外で正しく touch されていない。
- テストの preview は `contentHtml: "<p>preview body</p>"` でインラインタグ無し → AC-2 が `[]` を期待できる前提が成立している。

### overwrite commit パス

- `declaredTagNames` 解決は create/overwrite 分岐（行 263-326）の**手前**（行 180）で一度だけ行われ、`assembled.tagIds` は overwrite（行 270 `Note.updateContent`）と create（行 316 `Note.create`）の双方で同じものを使う。したがって修正は overwrite でも同一に効く。専用 integration test は無いが testing.md でマニュアル確認項目に挙げられており、ロジック上の分岐が無いため許容範囲。

### テストがバグを capture しているか（旧コードでの fail 判定）

旧コード `merged = [...explicit, ...suggested]`（NoteService 側で dedupe）を当てはめると:

- **AC-1**（drops removed tag）: explicit `["alpha"]` + suggested `["alpha","beta"]` → `["alpha","beta"]`。期待 `["alpha"]`。旧コードで **FAIL** → バグを正しく捕捉。
- **AC-2**（empty clears）: explicit `[]` + suggested `["alpha","beta"]` → `["alpha","beta"]`。期待 `[]`。旧コードで **FAIL** → 捕捉。
- **AC-3**（fallback）: `modifications: {}` → explicit `[]`、旧コードでも `["alpha","beta"]`。期待 `["alpha","beta"]`。旧コードでも PASS（フォールバック挙動の固定化テスト。回帰防止として有用）。
- **AC-4**（add new）: explicit `["alpha","gamma"]` + suggested `["alpha"]` → `["alpha","gamma"]`。旧コードでも PASS。バグ捕捉ではなく追加挙動のドキュメント化。

→ AC-1/AC-2 が確実に修正前 fail し、修正の核を守る。AC-3/AC-4 は補完的だが妥当。

### テストヘルパーの正しさ

- `tagNamesOnNote`（diff）: `noteTags ⋈ tags` を `noteId` で join し `name` を `.sort()`。順序非依存の集合比較として正しい。`expect(...).toEqual([...].sort 済み)` と整合（"alpha"<"beta"<"gamma"、空は `[]`）。
- `previewWithSuggestedTags`: `IngestionPreview` の JSON 形を正しく構築（`internalLinkRefs: []`, `mediaRefs: []`, `frontMatter: {}`）。`seedIngestionJob` の `previewJson` に直接渡している。
- `getContainer` は `describe("commitIngestionPreview")`（行 613）スコープで、新規テストは同 describe 内（行 1329-1454）。スコープ整合。

## Blockers

なし

## Warnings

- **[W-001]** overwrite commit パスのタグ置換に自動テストが無い
  - 場所: `app/core/application/ingestion/__tests__/ingestion.integration.test.ts`（新規4ケースは全て create パス）
  - 理由: 本修正は overwrite でも効くがロジック上の保証はコードリーディングのみ。`overwriteNoteId` 経由で既存ノートのタグがフォーム値に正しく置換されることを検証するケースが無い。回帰時に検知できない。
  - 提案: 必須ではないが、既存ノートに `["old"]` を付与 → preview suggested `["alpha","beta"]` → `modifications: { overwriteNoteId, tagNames: ["alpha"] }` で commit し、ノートのタグが `["alpha"]` になる（old も beta も残らない）ことを確認するケースを 1 件追加すると安心。testing.md のマニュアル項目を integration に格上げする形。

## Notes

- **[N-001]** 修正コメント（commitIngestionPreview.ts:173-179）が「なぜフォームが authoritative か（client が suggestedTagNames を seed 済み）」「なぜ undefined だけフォールバックか」「再マージすると #679 が再発する」を簡潔に説明しており、CLAUDE.md の why コメント方針に沿って優秀。
- **[N-002]** plan の影響範囲分析（「他の呼び出し元なし」「action は undefined のとき渡さない」）が実コードと一致していることを確認済み。`commitIngestionPreviewFn` 以外に `commitIngestionPreview` を呼ぶ箇所は無い。
- **[N-003]** integration test 全 693 件 green（57 ファイル、約 289s）。AC-5 充足。出力末尾の `WebSocket peer disconnected` は workerd のテスト終了時ノイズで、テスト失敗とは無関係。
- **[N-004]** AC-4 は厳密にはバグ捕捉ではなく追加挙動の固定化だが、「ユーザー追加タグが落ちない」回帰防止として価値があり、AC 表とも整合しているので問題なし。
