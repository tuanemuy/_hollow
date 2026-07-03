# PR Review #001 — fix(design): #723 P12 エディターモックを FrontMatter 下部常設に追従

**PR:** #815
**Date:** 2026-07-03
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 3
- Verdict: **BLOCKED**（Warning を修正するため）

## レイヤー別ファイル

- General Review: review-001-general.md（B: 0 / W: 2 / N: 3）

## 指摘一覧

- [W-001] 実装に無い可視見出し「メタデータ」をモックが追加（SSOT が実装より要素過多） — `spec/design/pages/P12-editor.html` / `spec/design/pages/mobile/P12-editor.html` の `.fm-panel-title`
- [W-002] `styles.ts:57` の相互参照コメントが `.meta-field` のままで宙に浮く（実体は `.fm-row`） — `app/components/note/editor/styles.ts:57`
- [N-001] sr-only `<label>` が htmlFor 未関連付け（aria-label で実害なし）— 据え置き
- [N-002] スコープ厳密（良い点）
- [N-003] desktop/mobile の DOM 一致・aria 属性が実装と対応（良い点）

## 対応

- **W-001**: 両モックから可視見出し `.fm-panel-title`（"メタデータ"）を DOM・CSS とも除去。`<section aria-label="メタデータ">` の不可視ランドマークのみ残し、実装 `FrontMatterEditor.tsx`（可視見出しなし）に一致させた。
- **W-002**: `styles.ts:57` の JSDoc 相互参照を `.meta-field` → `.fm-row` に更新。
- **N-001**: Note のため据え置き（aria-label が accessible name を提供、差分肥大回避）。

修正後 typecheck / lint:fix / format 実行済み（HTML モックは Biome 対象外・無変更）。ヘッドレス再レンダリングでヘッダーが生編集トグルのみになり実装と一致することを確認。
