# ADR — Issue #749: モバイル表示をモックに合わせる（横断）

## ADR-001: 裸チップ／選択チェックボックスから 44px タッチ床を外す

### Status
Accepted

### Context

`filterChip` / `filterChipGhost` は `${TOUCH_TARGET}`（`max-sm:min-h-[44px]`）を、`NoteCheckbox` の `NOTE_CHECK` は `${TOUCH_TARGET_SQUARE}`（両軸 44px）を付与していた。一方、mobile mock（`spec/design/pages/mobile/P10-home.html` line 161-165）は次を明記している:

> タッチ床 44px は主要アクション（pill/icon ボタン）に限定する。裸の button まで一律に伸ばすと、フィルタチップは膨張してデスクトップより大きく見え、正方形のチェックボックス(.note-check)は縦長に潰れる。チップ・選択チェックは各々で適切な最小高さを明示する。

実装側の 44px 床は mock の指定寸法（チップ32px・チェック24px）を `min-*` で上書きしてしまい、mock 不一致の直接原因になっていた。

選択肢:
- (A) 床を残したまま寸法だけ変える → `min-h/min-w:44px` が `h-8/w-6` に勝ち、mock 寸法を実現できない。
- (B) 床を外し、mock どおり各自の最小高さ（チップ`max-sm:h-8`=32px・チェック`max-sm:w-6/h-6`=24px）を明示する。

### Decision

(B) を採用。`filterChip` / `filterChipGhost` から `${TOUCH_TARGET}` を、`NOTE_CHECK` から `${TOUCH_TARGET_SQUARE}` を外し、mock どおりの寸法を明示する。共有定数 `TOUCH_TARGET` / `TOUCH_TARGET_SQUARE` 自体は他コンポーネント（pill/icon ボタン）で正しく機能しているため変更しない — 利用側の文字列から外すだけに留める。

### Consequences

- 良い点: mobile mock とチップ・チェックボックスの寸法が一致する。床除去は mock 作者が意図した方針であり、実効タップ対象は別途確保される（チップ＝横スクロール行内で 32px＋間隔、チェック＝行全体がトグル対象 / `filterClearX` は擬似要素で 44px 相当を維持）。
- トレードオフ: 32px チップ・24px チェックは WCAG 2.5.8（AA 最小 24px）を満たすが 2.5.5（AAA 44px）は下回る。mock 作者が a11y を考慮の上で許容した設計であり、ユーザーも本スコープを明示的に選択済み。
- 波及: `NoteCheckbox` は List/Tile/Calendar の3ビュー共有（#354）のため、3ビューすべての選択チェックがモバイル 24px / デスクトップ 20px に揃う。挙動は不変。

---

## ADR-002: カード化 breakpoint の 640→768 変更は今回スコープ外

### Status
Accepted

### Context

P40 ダッシュボードのアクティビティテーブルのカード化は実装が `max-sm:`（<640px）だが、デスクトップ mock は `@media (max-width: 767px)`（<768px）。640〜767px で挙動が食い違う（Issue 1.C）。

### Decision

今回は変更しない（<640px のまま）。ユーザー判断によりスコープ外とした。640〜767px のタブレット縦相当域での挙動差は残るが、主要なモバイル幅（375/390px）では mock と一致する。

### Consequences

- 良い点: スコープを絞り、a11y 床除去（ADR-001）に集中できる。
- トレードオフ: 640〜767px でのカード化挙動差が残る。必要なら別途 Issue 化を検討（Phase 4）。

---

## ADR-003: チェック表示モデルの常時列描画化は今回スコープ外

### Status
Accepted

### Context

両 mock は選択チェック列を常時持つ（デスクトップ=hover で opacity 表示 / モバイル=常時可視）。実装は「選択モード時のみ」チェック列を描画する（`ListView.tsx` / `SelectionContext`）。mock との構造差（Issue 2.C）。

### Decision

今回は変更しない。現状の「選択モード時のみ列描画」を維持する。ユーザー判断によりスコープ外。インタラクションモデルの大きな変更（常時チェック列・hover-reveal の再導入）はリスクが高く、`NoteCheckbox` の JSDoc が現行モデル（選択モード時のみ描画ゆえ hover-reveal を意図的に廃止）を設計判断として記録済みでもある。

### Consequences

- 良い点: 既存の選択 UX を維持し、回帰リスクを抑える。
- トレードオフ: チェック列の常時表示という mock の構造とは引き続き乖離する。必要なら別途 Issue 化を検討（Phase 4）。
