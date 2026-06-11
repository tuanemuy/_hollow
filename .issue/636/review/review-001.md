# PR Review #001 — feat(ui): 主要画面を <Suspense> ＋スケルトンで分割描画（#634 Phase 2）

**PR:** #646
**Date:** 2026-06-11
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 9
- Notes: 多数
- Verdict: **BLOCKED**（Warning 残のため）

---

## Frontend / RSC

### Blockers
なし

### Warnings
- **[FE-W-001]** ナビゲーションで `SectionErrorBoundary` のエラー状態がリセットされない（`app/components/common/SectionErrorBoundary.tsx:41-56`）。検索条件変更等で新しい RSC children が届いても境界インスタンス再利用で `hasError` が残る。→ `resetKey` prop か呼び出し側 `key` で remount。
- **[FE-W-002]** `@tanstack/react-router-devtools` が `^1.166.13` のまま（`package.json:97`）。本体 `^1.170.15` と揃える。
- **[FE-W-003]** `SavedViewsSection` が 0 件時 `null` 返却で「スケルトン → 完全消滅」（`app/components/layout/Sidebar.tsx:63-75,184`）。SR に結果が伝わらない＋レイアウトシフト。→ fallback 最小化 or 判断を記録。
- **[FE-W-004]** RSC alpha ジャンプ＋Start 更新の同梱リスク（対応不要・監視のみ）。

### Notes
- N-001: `ToolbarSkeleton` の `aria-hidden` は意図的（testing.md に例外注記推奨）。
- N-002: home handler の viewId 分岐での二重 fetch は ADR-002 注記どおり許容。
- N-003: SectionErrorBoundary のロギング無しは将来のテレメトリ課題。
- N-005: モック準拠・a11y 引き継ぎ2件は実装・テスト済み。

---

## アーキテクチャ・規約

### Blockers
なし（レイヤー違反なし。handler 責務・try/catch 境界・Styling 規約・コメント方針すべて適合）

### Warnings
- **[AR-W-001]** スケルトン基底ユーティリティ `BAR`/`PILL` が5ファイルに重複定義。→ `app/components/common/styles.ts` へ昇格 or `SkeletonBar` 合成。
- **[AR-W-002]** `SavedViewsList/Page.tsx:9-21` の `NEW_VIEW_BUTTON_SKELETON` が status ラッパーを手書き再実装し、同一ページ内アナウンスが重複。→ `aria-hidden` のみの装飾扱いへ統一。

### Notes
- `NoteDetailContent` の export はテスト専用（JSDoc 一言推奨）。
- adr.md の ADR 番号が非整列（参照性のため整列推奨）。

---

## テスト・a11y

### Blockers
なし（3516 テスト全パス・plan のテスト方針履行済み）

### Warnings
- **[TS-W-001]** 新設スケルトン群の aria 契約が無テスト。→ 一括検証テスト追加 or status ラッパー共通化。
- **[TS-W-002]** `searchActive` が URL 駆動に変わり空白のみ `q` で見出しと一覧が食い違いうる（`HomePage.tsx:79`）。→ 見出しロジックを純関数化＋テスト。空白 `q` の trim は transport 境界で。
- **[TS-W-003]** `SectionErrorBoundary` のリトライ中 Spinner が `role="alert"` 内で二重アナウンス。→ ボタン内は `aria-hidden` の装飾スピナーに。

### Notes
- SectionErrorBoundary.test は良質。Skeleton/Spinner の追加テストは a11y 引き継ぎを固定。
- ADR-008（exports/$jobId 適用外）は a11y 的にも良い判断。

---

## Design Decisions

特になし（既存 ADR-001〜010 で記録済み）。
