# PR Review #001 — impl(#545): 領域6「管理（admin）」P40〜P47 のモック実装追従

**PR:** #593
**Date:** 2026-06-08
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 12
- Verdict: **APPROVED**

レビューレイヤー: Frontend/デザイン準拠 / アクセシビリティ・plan整合（中規模・フロント3ファイル中心のため2軸並列）。

---

## Frontend / デザインモック準拠・レスポンシブ・Tailwind規約

#### Blockers
なし

#### Warnings
なし

#### Notes
- **[N-001]** P47 積層 CSS の写しが SSOT（mock 471-493行）と完全一致。`thead display:none`→`max-md:hidden`、`table/tbody/tr/td→block`→各 `max-md:block`、tr カード化（border / radius-lg=12px / mb=space-3=12px / p=space-3=12px）、td `padding:4px 0`→`max-md:px-0 max-md:py-1`、`.num text-align:left`→`max-md:text-left`。トークン値も tokens.css で裏取り済み。
- **[N-002]** `overflow-x-auto` 内側ラッパ削除が正しい（P47 モックは min-width も scroll ラッパも持たない構造）。P45/P46 の `overflow-x-auto` 維持と扱いを正しく分離。
- **[N-003]** 値セルの `font-mono` を内側ラベル span が `font-sans` で上書き → ラベルは sans・実値は mono。manual-test の computed style とも整合。
- **[N-004]** P45/P46 の `min-w-[880px]`/`[920px]` が SSOT 完全一致・ADR-003 と整合。広幅で従来テーブルは壊れない。
- **[N-005]** CleanupSection への 920px 適用は過剰でない（P46 モックも同 `.table` を当てる）。
- **[N-006]** スコープ最小・共通化リファクタ混入なし。`data-*` 規約・既存ロジック無変更。
- **[N-007/参考]** P45/P46 mock の `white-space: nowrap` を実装の cell が持たない既存差分あり。ただし**本 PR 以前からの差分で変更行でもなく**、付与した min-width が収縮を防ぐため実害小。Blocker/Warning ではない（Phase 4 検討余地）。

## アクセシビリティ / 虚偽表示禁止 / plan整合

#### Blockers
なし

#### Warnings
なし

#### Notes
- **[N-001]** ADR-004 の a11y 設計が正しく実装され核心懸念をクリア。狭幅で `thead` を `max-md:hidden`（a11y ツリー除外）にする一方、列ラベルを実 DOM span として描画（`aria-hidden` なし）→ SR に列ラベルが届く。広幅ではラベル span が `hidden` で消え `<th>` columnheader が機能 → 二重読み上げなし。
- **[N-002]** 虚偽表示禁止（ADR-001）厳守。Dashboard 無変更でチャート/アクティビティのダミーデータ追加なし。metric/limits 値は実 DTO 由来、nullable は `—`。
- **[N-003]** P41 クォータ文言の虚偽回避を確認（実装は quota を意図的に省略）。
- **[N-004]** plan/ADR 整合: スコープ逸脱なし。P47 のみ積層、P45/P46 は min-width 横スクロール。一括操作・ソート・チャートの混入なし。
- **[N-005]** 回帰なし。Jobs 3 テーブルに min-width 一律適用、UsersTable は横スクロールのみ、Metrics 広幅レイアウトは従来どおり。

---

## Design Decisions

このラウンドで新たな設計判断は発生せず（既存 ADR-001〜004 の範囲内）。N-007（cell の whitespace-nowrap 既存差分）は本 PR スコープ外として記録のみ。

---

## 完了判定

Round 1 で Blocker 0 / Warning 0。Step 7「1ラウンドクリーンで完了」に従い **APPROVED**。PR を Ready for review に切替。
