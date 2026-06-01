# PR Review #001 — feat(issue/397): デザイントークン設定で既定値を初期表示する

**PR:** #400
**Date:** 2026-06-01
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 5
- Notes: 多数（良好）
- Verdict: **BLOCKED**（Warning 全件を修正してから再レビュー）

---

## Domain

#### Blockers
なし

#### Warnings
なし

#### Notes
- 27キーの値が tokens.css と文字列完全一致、整合性テストのパーサ堅牢、domain の純粋性維持、VO 制約適合を機械検証。計画・ADR と高精度で整合。

## Application / Use Case

#### Blockers
なし

#### Warnings
- **[A-W-001]** 「既存 override → default 同値で再送 → DB から override が消える」ケースが usecase 単体テストで未カバー。integration の "drops entries equal to the built-in default" は新規 save のみ。回帰防止のため既存 override が同値再送で消えるケースを追加すべき。

#### Notes
- ADR-003 のレイヤー配置・VO 純粋性・DTO 対称性・「全行既定同値→空 override」エッジケース・エラー規約すべて適切。

## Frontend / Presentation

#### Blockers
なし

#### Warnings
- **[F-W-001]** `data-overridden` 属性が死にコード（`index.tsx:256`）。対応する `data-[overridden]:` variant も CSS フックもリポジトリに存在せず、属性を出すだけで視覚差が無い。上書き可視化は「上書き中」バッジが担っている。variant を足すか、属性を削除して死にコードを残さない。
- **[F-W-002]** 「すべてリセット」（`onConfirmReset`）が `setEntries` を呼ばず `routerInvalidate` に一任しているが、DesignTokensForm の `entries` は `useState` 初期化子で mount 時のみ構築される。RSC のクライアントコンポーネント状態は invalidate（route 再フェッチ）では再初期化されないため、リセット後もフォームが古い override 行を表示したままになる潜在バグ。元コードは `setEntries([])` で明示的に更新していた。リセット後は entries を既定値ベースに明示的に再構築すべき。行リセット（`onRowReset`）は `setEntries(nextEntries)` で正しく更新しているが、reset-all と挙動が非一貫。

#### Notes
- 分岐ロジック（既定キー＝value を default に snap して再送 / 既定外キー＝削除して再送）は計画と整合し prompts の per-key reset を誤流用していない。三重防御・スタイル規約準拠・React 19 primitives・aria 対応は良好。

## Test

#### Blockers
なし

#### Warnings
- **[T-W-001]** `defaults.test.ts` のパーサが `/:root\s*\{([\s\S]*)\}/`（greedy）で、将来 tokens.css に2つ目の `:root`（`[data-theme="dark"]` 等、spec で将来導入予定）や `@media` ブロックが増えると末尾 `}` まで飲み込んでパースが静かに壊れ整合性テストが偽陰性化する。`:root` を最初のブロックに限定（`[^}]*`）し、パーサ自体の最小単体テスト（複数行宣言・clamp/rgba のカンマ値・コメント内 `:` ）を追加すべき。
- **[T-W-002]** 「全 27 curated キーが DTO に surface される」網羅アサーションが無い。DTO 合成テストは `--color-accent` 1キーのスポットチェックのみ。`BUILTIN_DESIGN_TOKENS` 全キーが DTO に含まれる旨の網羅アサーションを追加すべき。

#### Notes
- 主要シナリオ（既定同値ドロップ／逸脱永続化／既定外キー永続化、DTO の isOverridden 合成、round-trip の `.value` 追従）は実テストでカバー。トートロジー・偽陽性なし。

---

## Design Decisions

新規の設計判断なし（既存 ADR-001〜003 の範囲内）。
