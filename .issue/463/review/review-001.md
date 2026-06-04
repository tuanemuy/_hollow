# PR Review #001 — feat(settings): 設定画面のスタイリング実装 + UserMenu の開いた瞬間グレー化を修正

**PR:** #485
**Date:** 2026-06-05
**Round:** 1回目

---

## Summary

- Blockers: 1
- Warnings: 1
- Notes: 多数（良好）
- Verdict: **BLOCKED**

---

## Frontend / スタイリング規約準拠

総評: 規約準拠度は非常に高い。新規 CSS / `@apply` なし、トークン外の色なし、`common/styles.ts` primitive を適切に合成、`data-active={active || undefined}` 遵守、danger ハイライトのクラス順序も正しい。plan.md / adr.md と差分が一致。

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- [N-001] utility-first 完全準拠（新規 CSS/@apply なし、module-scoped 定数化）
- [N-002] 全クラスが実在トークン/ユーティリティにマップ
- [N-003] data-* 属性規約 (ADR-003) 遵守
- [N-004] danger ハイライトのクラス順序が正しい
- [N-005] breakpoint は max-lg:/lg: バリアントで出し分け（新規 @media なし）
- [N-006] 既存 primitive 再利用・既存慣習（FilterBar の active pill、SavedViewsList のバッジ）と整合
- [N-007] 任意値クラスはすべて既存慣習の範囲内
- [N-008] `SUCCESS_MSG` の `text-[13px]` は `formError` の `text-sm` と微妙に不対称（好みの範囲、未対応）
- [N-009] `directory/styles.ts:52` の同型バグは plan/ADR どおり別Issue化でスコープ外

## アクセシビリティ / UX / 計画整合性

#### Blockers
- **[B-001]** プライマリボタンが accent 色にならずセカンダリと見分けがつかない
  - 場所: `ProfileForm/index.tsx:147,194`、`SecurityForm/index.tsx:181,246`、`PromptsForm/index.tsx:203`
  - 理由: `BTN_PRIMARY = ${pillBtn} ${pillBtnPrimary}` だが、`pillBtnPrimary`（`common/styles.ts:25-26`）は `data-[primary]:` バリアントのみ。`data-primary=""` 属性がないと accent 背景・白文字が発火せず、素の `bg-surface`（グレー）= `BTN_SECONDARY` と完全に同一描画になる。auth フォームは全 submit に `data-primary=""` を併記している。プライマリ/セカンダリの階層が消失する UX 後退。
  - 提案: 各プライマリボタンに `data-primary=""` を付与する。
  - **→ 対応済み（このPRで修正）**: 5 箇所の BTN_PRIMARY ボタンに `data-primary=""` を追加。

#### Warnings
- **[W-001]** サブタイトル文言が実態と食い違う
  - 場所: `route.tsx:78`（`アカウント、外観、AI の挙動を調整します。`）
  - 理由: 設定画面に「外観（テーマ等）」の項目は存在しない（NAV はプロフィール/セキュリティ/プロンプト/アカウント削除）。存在しない機能を案内する文言は軽い誤誘導。
  - 提案: 「外観」を外す。
  - **→ 対応済み（このPRで修正）**: 「アカウントと AI の挙動を調整します。」に変更。

#### Notes
- [N-001] UserMenu 修正は ADR-001 どおり（focus-visible 化 + danger 併記、UserMenu.tsx 無修正）
- [N-002] h1 sr-only 化は ADR-005 どおり、文書アウトライン維持
- [N-003] a11y 属性は完全に不変（role/aria-live/aria-current/htmlFor 維持、追加は className と data-active のみ）
- [N-004] 構造変更（ul/li 除去・div ラップ追加）は ADR-006 どおりでセマンティクスを壊していない
- [N-005] スコープ外機能の混入なし
- [N-006] 使用トークンはすべて実在を確認

---

## Design Decisions

このラウンドで新規の設計判断なし。B-001/W-001 は既存設計（`pillBtnPrimary` の data-primary 契約、サブタイトル文言）に実装を合わせる修正で、ADR 追記は不要。
</content>
