# PR Review #001 — モバイルモック(#536)の実装追従 ② 画面別レイアウト

**PR:** #600
**Date:** 2026-06-08
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 5（重複統合後）
- Notes: 多数（良い設計の確認）
- Verdict: **BLOCKED**（Warning を全て潰してから完了）

レビュー観点: ①フロントエンド/モック忠実度 ②スタイリング規約/アーキ ③correctness/非回帰（3サブエージェント並列）

---

## Warnings（全て本PRで修正）

### [W-001] MENU_RAIL の `display:contents` が desktop で失効（FE-W-002 + CO-W-001）
- **場所:** `app/components/note/detail/NoteActions.tsx:93`（`MENU_RAIL = "flex flex-wrap gap-2 items-center contents max-sm:flex ..."`）
- **理由:** base に `flex` と `contents` を両方含み、Tailwind v4 の utilities 出力順（`contents` → `flex`）で後勝ち `.flex` が勝つため、desktop(≥sm) でこの div が `display:flex`（nested flex ラッパ）になり、ADR/コメントが謳う「desktop は contents で先頭ピル群が親 MENU の flex-wrap クラウドに溶け込む」前提が成立していない。手動テストは 390px のみで desktop 非回帰を見落とし。
- **提案:** base から裸の `flex` を外し、desktop=`contents` / mobile のみ `max-sm:flex` を効かせる。`flex-wrap`/`gap`/`items-center` は contents 下で無効なので残置可。

### [W-002] FilterBar タグチップクラスタが mobile でも内部 flex-wrap（FE-W-001）
- **場所:** `app/components/note/list/FilterBar.tsx:301`（`<div className="inline-flex gap-1.5 flex-wrap">`）
- **理由:** 親 `filterBar` は `max-sm:flex-nowrap overflow-x-auto` の単一横スクロールレールだが、このタグクラスタは `flex-shrink-0` を持たず内部 `flex-wrap` を保持するため、モック `.filter-tags { flex-wrap:nowrap; flex-shrink:0 }`（P10-home.html:541）の「1行で横スクロール」にならず狭幅でタグだけ折り返す。overflow=0 は満たすがモック忠実度が落ちる。
- **提案:** クラスタに `max-sm:flex-nowrap max-sm:shrink-0` を付与し親レールと連動させる。

### [W-003] `scrollbarHidden` の置き場所がドメイン横断で不適切（ST-W-001）
- **場所:** `app/components/note/list/styles.ts:74-75`（定義）
- **理由:** 汎用スクロールバー非表示プリミティブが `note/list` 配下に置かれ、`BulkActionBar`・`note/detail/NoteActions`（`../list/styles`）・`note/editor/styles.ts`（`@/components/note/list/styles`）の3フィーチャから cross-folder import されている。ドメイン非依存プリミティブは `common/styles.ts` が自然な置き場所（`dialogActions` 等と同様）。
- **提案:** `scrollbarHidden` を `common/styles.ts` へ移し、list/detail/editor 各 styles はそこから import。

### [W-004] `z-45` がコードベースの z-index 表記規約から外れる（ST-W-002）
- **場所:** `app/components/note/list/BulkActionBar.tsx:43`（`max-sm:z-45`）
- **理由:** 既存 z 積層は全て角括弧記法（`z-[100]`/`z-[90]`）。同じ非デフォルト値の 45 だけ bare で表記混在。機能は正常（v4 で z-index:45 生成）だが一貫性を欠く。
- **提案:** `max-sm:z-[45]` に揃える。

### [W-005] popoverSheetPanel の desktop padding p-3→p-4（CO-W-002）
- **場所:** `app/components/note/list/FilterBar.tsx`（旧 `FILTER_POPOVER_PANEL` は `p-3`）/ `common/styles.ts`（`popoverSheetPanel` は `p-4`）
- **理由:** 共有定数へ寄せた結果、FilterBar ポップオーバーの desktop(sm以上)内側余白が 12px→16px に変化。本Issueの「sm: 以上は現状維持」方針に対する意図せぬ変化。p-4 はモックの `.popover-panel`（space-4）方向への補正でもあるが、desktop 非回帰を厳守する。
- **提案:** `FILTER_POPOVER_PANEL` 側で `sm:p-3` を足し desktop を従来値へ戻す（mobile は共有定数の p-4 を活かす）。

---

## Notes（良い設計・確認済み）

- cta-bar↔bulk-bar 排他は3状態（非選択/選択0件/選択1件以上）全てで成立、desktop 非回帰を確認（CO-N-001）
- usePopover clamp 狭幅無効化は唯一の消費者 FilterBar 限定、SSR セーフ、既存 Popover テスト21件 PASS（CO-N-002）
- `dialogActions` 共有定数改変は全11ダイアログで DOM 順 `[cancel, primary]` 統一を実地確認、net-positive（FE-N-001/ST-N-001/CO-N-003）
- `popoverSheetPanel` dead constant を ADR-003 通り正しく消費、primitive 公開API無変更（ST-N-002）
- env(safe-area) 二重適用なし（CO-N-004）、className 依存テスト不在で非回帰リスク低（CO-N-006）
- progress.md 見送り4項目の判断は概ね妥当。P30 profile-hero/P32 text-left はフォローアップ別Issueが妥当（FE-N-005）

---

## Design Decisions

特になし（W-005 の desktop padding 据え置きは adr.md ADR-003 に一文追記）。
