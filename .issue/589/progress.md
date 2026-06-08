# 進捗・残存課題 — Issue #589

## 完了

P40〜P47 の admin 画面で、高密度テーブルを狭幅（`max-sm:`）でカード/縦積みへ畳むモバイル追従を実装。受け入れ基準（320〜430px overflow=0・desktop 非回帰・カード内タッチ床44px・トークン経由・agent-browser 目視）をすべて満たすことをブラウザ検証で確認済み（report.md）。

## 残存課題（スコープ外・Phase 4 で起票検討）

### `publication/styles.ts` `LINK_MINI_ROW` の同種タッチ床バグ

- **内容**: #588 で導入された `LINK_MINI_ROW`（共有シェアリンク操作行）は `[&>button]:max-sm:min-h-[44px]` でカード縦積み時の 44px 床回復を意図しているが、内部ボタンが `pillBtnSm` + `data-sm=""` を持つため、本 Issue で判明したのと同じ specificity 衝突（`.class[data-sm]` (0,2,0) が `.parent>button` (0,1,1) に勝つ）で**床が実際には復元されていない**可能性が高い（本 Issue では実機で 26px を確認）。
- **理由**: `LINK_MINI_ROW` を本 Issue で修正すると #588 のスコープ（公開・共有画面）に踏み込むため見送り。本 Issue は admin（P40〜P47）に限定。
- **影響範囲**: P33 共有リンクゲート等、`LINK_MINI_ROW` を使う公開系画面のモバイルでアクションボタンが 44px 床に達していない可能性。機能影響はなく見た目のタッチターゲットのみ。
- **フォローアップ**: Phase 4 で別 Issue として起票検討（修正は admin と同じ `!important` 化、または `pillBtnSm` 側の床打ち消しを `data-[sm]:` 単独でなく親で確定的に上書きできる仕組みの共通化）。

## 設計判断の記録

実装中・検証中の非自明判断は adr.md（ADR-006 実装細部 / ADR-007 specificity 修正）に記録済み。
