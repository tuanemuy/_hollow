# PR Review #002 — feat(#405): 保存ビュー管理UIの拡充

**PR:** #412
**Date:** 2026-06-02
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 数件（いずれも既存挙動・許容範囲）
- Verdict: **APPROVED**

---

## Frontend

### Blockers / Warnings
なし

round-1 の修正を検証:
- **B-1 修正 OK**: `ViewFormDialog.tsx` で両 kind ラジオに `disabled={props.mode === "edit"}` が付き、edit で変更不可・create で編集可能。注記「公開範囲は作成後に変更できません。」は `text-xs text-ink-tertiary` で規約準拠。無言破棄が UI レベルで根治。
- **W-1 修正 OK**: `styles.ts:67` の JSDoc から `role="alert"` 記述削除、実 DOM と一致。挙動不変。

Notes: edit 時の壊れたタグ参照の silent 除去（設計意図に沿う）、空クエリ作成の許容、server fn 作法の統一を確認。

---

## Domain / Application / Adapter / Test

### Blockers / Warnings
なし

round-1 の修正を検証:
- **W-001 修正 OK**: `deleteDirectory.ts:104-106` の `("" as DirectoryName)` は型安全（import は `type DirectoryName`）、挙動は修正前と等価。空文字センチネルが event payload → decoder → handler → markBroken の ADR-A/B 経路と一貫。`forRoot()` 廃止で壊れる箇所なし。`directory.integration.test.ts` のアサーション（`name: "empty"`）とも整合。

Fresh pass: ADR-B マージ非対称・後方互換（3層フォールバック）・所有者検証/OCC・マイグレーション不要・テストカバレッジをいずれも再確認し問題なし。

---

## Design Decisions

特になし。round-1 の修正はいずれも実装詳細で ADR 追記不要（既存 ADR-A〜E の範囲内）。

---

## 結論

2ラウンド目で Blocker 0 / Warning 0。レビュー完了（APPROVED）。
