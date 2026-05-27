# PR Review #002 — refactor(note): switch FrontMatter editor to generic key-value model

**PR:** #237
**Date:** 2026-05-27
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 3
- Notes: 多数
- Verdict: **BLOCKED**（Warning 残のため）

---

## Frontend

### Blockers
- なし

### Warnings
- なし

### Notes
- Round 1 の全 Warning (W-FE-001〜009) 完全解消、新規バグ・UX 後退なし
- 構造化エラー日本語化が自然
- 永続 aria-live で SR 通知漏れなし
- `KeyRow` の `siblingKeys` ベース重複事前チェック + reducer 二段構えが堅実
- 軽微: `entries.map` 内で `new Set(allKeys)` を行数分生成は O(n²) だが 64KiB 上限で実害ゼロ

→ **APPROVED**

---

## State Management / Reducer

### Blockers
- なし

### Warnings
- なし

### Notes
- `FrontMatterError` タグ付きユニオン設計 (ADR-006) が型レベルで安全
- `toggleFrontMatterMode` の `kind !== "json"` 分岐で sticky-error 仕様を表現
- ADR-007 (モード切替時の強制 blur) が `FrontMatterEditor` / `NoteEditor` の両方で実装
- ADR-008 (同一キー rename で stale error クリア) が referential equality 保ったまま実装
- 不変性・dirtyKeys・autosave 副作用ゼロが maintain
- 軽微: `editorState.ts:371-372` のコメント「leave the raw text as-is from the last sync」が実装と若干噛み合わず、「resync raw view from the in-sync parsed object」に直すと正確

→ **APPROVED**

---

## Test

### Blockers
- なし

### Warnings
- **[W-TS-003]** `toggleFrontMatterMode` の **`json`-kind error が toggle でクリアされる側** のパスがテストされていない
  - 場所: `editorState.ts:373-388`、`editorState.test.ts`
  - 理由: `hasStructuredError = ... && kind !== "json"` 分岐で非対称仕様（`duplicateKey`/`emptyKey` は保持、`json` はクリア）。後者だけ未テスト → 分岐が緩んだ時に regression 検知不能
  - 提案: `frontMatterJsonError = { kind: "json", message }` 状態から toggle してエラーが消える / raw text が再パースされるテスト 1 件追加

- **[W-TS-004]** UI 側修正に対応するテストがない
  - 場所: `FrontMatterEditor.test.tsx`、`FrontMatterEditor.tsx:140-152, 169-178`
  - 理由: W-FE-001 IME composing ガード / W-FE-002 重複 rename 時の rollback / W-FE-003 newKeyBuffer 保持の動作仕様が UI テストでカバーされていない
  - 提案:
    - (a) `KeyboardEvent("keydown", { key: "Enter", isComposing: true })` で `commitKey` が呼ばれないテスト
    - (b) 重複 rename 後に親が同じ parsed で rerender した時に key input value が元キーへ復元されるテスト
    - (c) 新規キー追加で重複時に input value が保持されるテスト

- **[W-TS-005]** `data-value-kind` 属性のカバレッジが `number` のみ
  - 場所: `FrontMatterEditor.test.tsx:349-365`、`FrontMatterEditor.tsx:157`
  - 理由: `boolean` / `complex` / `string` / `null` 未検証。CSS hook / QA 観点で属性値ドメインが契約として効くため、せめて boolean と complex を 1 件ずつ
  - 提案: `parsed={{ flag: true }}` / `parsed={{ obj: { a: 1 } }}` で `[data-value-kind="boolean"]` / `[data-value-kind="complex"]` の存在を assert

### Notes
- Round 1 W-TS-001 / W-TS-002 は完全解消
- 構造化エラー (`{ kind, key }`) の reducer / UI 両側テスト成立
- `clearFrontMatterError` の通常 / no-op パスカバー
- W-ST-001 / W-ST-003 対応テスト追加
- 全 2447 テスト pass

→ **BLOCKED**（3 Warning 対応必要）

---

## Spec / Documentation

### Blockers
- なし

### Warnings
- なし

### Notes
- B-SP-001 / W-SP-001/002/003 全て解消
- TC-D4-05 に「Issue #230 のスコープ外」注記追加
- `spec/domains/ingestion.md:113` の `suggestMetadata` 戻り値 `{ tags, aliases }` は AI 補助提案の DTO で別系統（スコープ外、意図的残置）
- `spec/design/pages/P13-upload.html` の `tags` 例示は別 Issue 候補（Round 1 Notes 通り）

→ **APPROVED**

---

## Design Decisions

特になし（ADR-006/007/008 は既に追記済み）。

## 次のアクション

Test の 3 Warning (W-TS-003 / W-TS-004 / W-TS-005) を解消し Round 3 でクリーン化する。
