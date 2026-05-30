# PR Review #002 — design(issue/198): エラー UI の設計成果物化 (spec/design)

**PR:** #343
**Date:** 2026-05-30
**Round:** 2回目

---

## Summary

- Blockers: 1（修正の未コミット — 本ラウンド後にコミット/push で解消）
- Warnings: 1（コメント内 validator パスの不正確さ — 修正済み）
- Notes: 修正内容の正当性は両視点で確認
- Verdict: **BLOCKED**（コミット/push + W-A 修正 → 次ラウンドで確認）

---

## デザイン / フロントエンド（Round 2）

### Blockers
- **[B-001]** Round 1 の W-001/W-002 修正がワーキングツリーに留まり未コミット。`gh pr diff 343` には反映されていない。
  - 対応: working tree の変更を `issue/198/error-ui-design-artifacts` にコミットして push する（本ラウンド後に実施）。

### Warnings
- なし

### Notes
- W-001 解消方法は適切（`--tracking-*` は全て負値で正の字間トークンが無いため、リテラル行ごと削除し既定字間に委ねるのが正しい）。除去後の `.variant-label` は全プロパティがトークン参照、キャプション表示は破綻なし。
- 範囲外リテラル（P01b:243 `.admin-eyebrow`、P01b:329）は未変更を確認。
- マークアップ健全性 OK（HTML コメント開閉バランス・span 数整合）、既存非破壊。

## 要件カバレッジ・文言忠実性・セキュリティ抽象化（Round 2）

### Blockers
- **[B-001]**（上記と同一）修正が未コミットで PR に未反映。

### Warnings
- **[W-A]** validation バリアントの HTML コメント内 `validator.ts` のパスが不正確。実体は `app/core/presentation/validator.ts`（`app/components/auth/validator.ts` は存在しない）。直前の `schema.ts` が `app/components/auth/` 配下のため同ディレクトリと誤読させうる。
  - 対応: コメントと review/005.md のパスを `app/core/presentation/validator.ts` に修正（本ラウンドで修正済み）。

### Notes
- W-002 修正内容は実コードと照合し正確（`schema.ts` は message 未指定、`app/core/presentation/validator.ts` の `zodIssuesToFieldErrors` が `issue.message` を verbatim 格納、errorMap/i18n 層なし）。3ファイル全 validation バリアントに同趣旨コメント。
- review/005.md の clarify 記述も「あるべき設計提案／#201 申し送り」に修正済みで実態整合。
- 文言忠実性・セキュリティ抽象化・スコープにリグレッションなし。

---

## このラウンドで実施した修正

- **[W-A]** 3 HTML コメント + review/005.md の validator パスを `app/core/presentation/validator.ts` に修正。
- **[B-001]** 全修正（W-001 / W-002 / W-A）をコミットし PR ブランチへ push する。

## Design Decisions
- 特になし。
