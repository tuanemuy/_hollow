# PR Review #002 — fix(#388): ディレクトリ移動UIのスケーラビリティ改善 / パス先頭スラッシュ重複の修正

**PR:** #398
**Date:** 2026-06-01
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 3（Escape二重クローズ ×2視点で同一 / clearフォーカス脱落 / open-close回帰テスト不足）
- Notes: 多数（1周目指摘はすべて解消確認）
- Verdict: **BLOCKED**（Round1 の open 導入で生じた新規回帰を修正してから再レビュー）

---

## Frontend / アクセシビリティ / UX

### Blockers
なし

### Warnings
- **[W-F1]** Escape が listbox を畳むだけでなく Dialog 全体を閉じる（open 導入で生じた新規回帰）。picker の Escape が `stopPropagation` せず、Dialog の document レベル Escape ハンドラ（`defaultPrevented` を見ない）まで到達するため。
  - → 修正: `hasListbox` 時のみ `preventDefault`＋`stopPropagation`＋`setOpen(false)`、非表示時は委譲。二段 Escape に。
- **[W-F2]** 解除（clear）ボタン押下後にサマリ行がアンマウントしフォーカスが body へ脱落。
  - → 修正: `inputRef` を追加し `clear()` 末尾で検索 input にフォーカスを戻す。

### Notes
- 1周目 W-F1/W-F2/W-F3 の解消確認。move ダイアログでの autofocus 自動展開は ADR-005 で許容済み・妥当。commit 後の再オープン動線（mousedown/typing/Arrow）も確保。status live region の open 非連動は軽微（N 止まり）。

---

## ロジック整合性 / エッジケース / 回帰リスク

### Blockers
なし

### Warnings
- **[W-L1]** （Frontend W-F1 と同一）Escape の二重クローズ。Dialog 埋め込み時のみ顕在化する実害ある回帰。
  - → 上記 W-F1 修正で解消。

### Notes
- 1周目 W-L1（clear で null 復帰）・W-L2（commit/Escape で畳む・query クリア）は ADR-005 どおり解消確認。パス正規化・cyclic 除外・includeRootOption と clear の組み合わせ・再オープン経路いずれも正しい。Arrow が `open` 非依存で commit 直後の1キーで先頭スキップする件は好みの範囲（N）。

---

## テスト網羅性 / テスト設計 / テスト品質

### Blockers
なし

### Warnings
- **[W-T1]** commit が listbox を閉じ query をクリアする挙動（Round1 W-L2 修正の核心）の回帰テストが無い。削除しても green のまま。
  - → 修正: commit 後の listbox 消失・value 空・再オープンで全件再表示を検証するケースを追加。
- **[W-T2]** Escape で閉じる挙動の回帰テストが無い。
  - → 修正: Escape で listbox が閉じる＋listbox 表示時の Escape が document へバブルしない（非表示時はバブルする）を検証するケースを追加。

### Notes
- 1周目 Test 指摘（W-T1 クランプ / W-T2 ArrowUp wrap / N-T3 includeRootOption 確定 / N-T1 import 統一 / forest・特殊文字）はすべて反映確認。`open()` ヘルパは実 focus 動線を経由し脆くない。N-T2（disabled テスト）も今回追加。

---

## Design Decisions

- Escape の二段挙動（listbox 表示時のみ stopPropagation して畳み、非表示時は Dialog の close に委ねる）と clear 後の検索 input フォーカス復帰を ADR-005 の Consequences に追記済み。
