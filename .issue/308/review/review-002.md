# PR Review #002 — feat(issue/308): apply button form guideline to TagActions / AccountDeleteForm / UsersTable

**PR:** #313
**Date:** 2026-05-29
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 2 (a11y: W-201 / W-202)
- Notes: 7
- Verdict: **BLOCKED**（Warning を修正してから再レビュー）

→ Round 2 の Warning は即時修正済（W-201 / W-202 / N-203 を取り込み）

---

## Accessibility / a11y (Round 2)

### Blockers
なし

### Warnings

- **[W-201]** UsersTable の summary `<p>` が `aria-live="polite"` のみで `role="alert"` 無し、条件マウントで初出時に SR が拾わない可能性
  - 場所: `app/components/admin/UsersTable/index.tsx:203-211`
  - 提案: `role="alert"` 追加
  - **対応**: ✅ `role="alert"` を追加（TagActions / AccountDeleteForm と整合）

- **[W-202]** AccountDeleteForm の `aria-describedby` 順が `[hintId, errorId]` で、エラー発生時に SR は hint → error の順で読み、最重要情報が後置される
  - 場所: `app/components/identity/AccountDeleteForm/index.tsx:129-133`
  - 提案: `[errorId, hintId]` 順に入れ替え（DOM 順は変えない）
  - **対応**: ✅ `aria-describedby` を errorId 優先順に変更、コメント追加

### Notes
- **[N-201]** `<label>` 内 `<code>` のアクセシブルネーム計算問題なし。VoiceOver/JAWS の設定依存で「コード」と発話される可能性は受容
- **[N-202]** onChange の `setError(null)` (validation 限定) が SR alert 読み上げ中に消える可能性。実害小、受容
- **[N-203]** `fieldErrors[0]` の防御性: `fieldErrors !== undefined && fieldErrors.length > 0` ガードに昇格すると堅牢
  - **対応**: ✅ aria-invalid / aria-describedby / 条件描画の 3 箇所すべてで length > 0 ガードを追加

---

## Plan/ADR 整合性 + TypeScript / Hooks (Round 2)

### Blockers
なし

### Warnings
なし

### Notes
- **[N-201]** `aria-describedby` の `|| undefined` フォールバックはデッドコード（hintId が常に存在するため）
  - **対応**: ✅ Round 2 修正で `|| undefined` を削除（hintId 必ず残るため空文字回避は不要）
- **[N-202]** ADR-006 Decision 7 「`<p role="alert">` summary に aria-live="polite" 追加」と UsersTable の実装に齟齬（元 `role="alert"` 無し）
  - **対応**: ✅ W-201 修正で UsersTable に `role="alert"` を追加し、ADR-006 と実装が一致
- **[N-203]** fieldErrors 空配列対応 → ✅ Round 2 修正で長さガード追加

### 確認済み（Pass）
- 型整合性 (`SerializedValidationError` クライアント立て型 OK)
- 型 narrowing (`error?.kind === "validation"` 全箇所 OK)
- ADR-004（生 `router.invalidate()` + WHY コメント）保持
- ADR-005（focus 制御コード追加なし）厳守
- スコープ宣言遵守（3 ファイルのみ変更）
- Hooks rules（useState×3 → useTransition → useId×3 トップレベル無条件）
- ADR-006 Decision 7 項目すべて反映
- 品質ゲート (typecheck / lint / test:unit) 全 PASS

---

## Round 2 修正対応サマリ

| 指摘 ID | 内容 | 対応 |
|---|---|---|
| W-201 | UsersTable summary に `role="alert"` 欠落 | ✅ `role="alert"` 追加 |
| W-202 | aria-describedby 順が hint 優先 | ✅ error 優先順に変更 |
| N-203 | fieldErrors[0] の防御性 | ✅ `length > 0` ガード追加 (aria-invalid / aria-describedby / 条件描画) |
| N-201 (Plan) | aria-describedby の `\|\| undefined` がデッドコード | ✅ 削除 |
| N-202 (Plan) | ADR-006 と UsersTable 実装の文言齟齬 | ✅ UsersTable に role="alert" 追加で実装側で整合 |

検証:
- `pnpm typecheck` PASS
- `pnpm lint:fix` 既存警告のみ（本 PR 無関係）
- `pnpm format` 1 ファイル整形
- `pnpm test:unit` 138 files / 2690 tests PASS
- 静的 guard: `router.invalidate()` / `rule 1` 両方 1 件ヒット

---

## Design Decisions

このラウンドで新たな ADR レベルの設計判断はなし（Warning レベルの修正のみ）。
