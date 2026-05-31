# PR Review #001 — P10 ノート一覧: モバイル対応 + 選択モード/絞り込み UX の全面刷新

**PR:** #362
**Date:** 2026-05-30
**Round:** 1回目

---

## Summary

- Blockers: 1
- Warnings: 6（うち1件は誤検知）
- Notes: 多数（設計準拠を確認）
- Verdict: **BLOCKED**

3レイヤー（Frontend/UX・Architecture/RSC/Styling・Accessibility/Responsive）で並列レビュー。

---

## Frontend / UX

### Blockers
- なし

### Warnings
- **[W-FE-001]** モバイルドロワーが閉じている時もサイドバー内リンクがフォーカス可能。`APP_SIDEBAR` が `-translate-x-full` で画面外に出すだけで `inert`/`aria-hidden` なし。ADR-002 が約束した「Dialog パターン踏襲のフォーカス管理」が未達。→ **A11y B-001 と同一。修正済み**
- **[W-FE-003]** `data-pending` の `pointer-events-none` が選択モード中の操作も一時凍結。要件4「pending 中も止めない」と片手落ち。選択はローカル state なので止める必然性なし。→ **修正済み（pointer-events-none を撤去、opacity のみ）**

### Notes
- N: 選択モードの状態設計（pure reducer・アトミック遷移・参照同一性）、view 別 Link 競合解決、NoteCheckbox 共通化、useOptimistic 境界限定はいずれも設計通りで高品質。
- N: フィルタ操作での `page` 未リセットは main 時点からの既存挙動（本PRの回帰でない）→ スコープ外。

## Architecture / RSC / Styling

### Blockers
- なし

### Warnings
- **[W-AR-001]** `SIDEBAR_BACKDROP` の lg 非表示が generated-CSS のソース順依存。`max-lg:` でスコープした方が堅牢。→ **修正済み（`data-[open]:max-lg:block`）**
- **[W-AR-002]** フィルタ結果0件時は pending dimming が効かない（空状態がラッパー外）。軽微。→ 後述（許容）

### Notes
- N: ADR-002 のRSC境界（AppShellFrame=Server、AppShellDrawer/MenuButton=client、副作用 import の server 局在）が忠実。Sidebar の aside 移設も唯一の利用箇所のみで他ルート副作用なし。スタイリング規約・デザイン値の一致を全面確認。`AppShell.tsx`/変換ロジック不変。

## Accessibility / Responsive

### Blockers
- **[B-A11Y-001]** ドロワーにフォーカス管理が一切ない（focus trap / 初期フォーカス / 復帰 / role・aria-modal・aria-label）。off-canvas はモーダル相当なのに背面へ Tab が抜け、閉時も内部リンクがフォーカス可能。→ **修正済み（ADR-006）。`AppShellDrawer` にモバイル時のみのトラップ・初期/復帰フォーカス・`role=dialog`/`aria-modal`/`aria-label`・閉時 `inert` を実装**

### Warnings
- **[W-A11Y-001]** mode ON 時に List/Calendar のタイトルがプレーン span 化しリンク不能、かつ行トグルも無く ADR-005 と乖離。→ **ADR-005 を実装（checkbox-only）に合わせて訂正。Biome a11y lint が `<li onClick>` を弾くための意図的決定であることを明記**
- **[W-A11Y-002]** Tile の入れ子 button（button in button）。→ **誤検知。checkbox `<span>` はカード `<button>` の兄弟（`<li>` 直下）であり入れ子ではない（TileView.tsx:79-104 で確認）**
- **[W-A11Y-003]** dark pill 上の disabled アクションのコントラスト。→ WCAG 1.4.3 は disabled/inactive コンポーネントをコントラスト要件から除外しているため違反ではない。0件 disabled は意図的なミュート表現として許容。
- **[W-A11Y-004]** BulkActionBar の件数 live 表示に `aria-live` 無し。→ **修正済み（`aria-live="polite"`）**

### Notes
- N: CTA aria-label 維持・44px タッチターゲット・ブレークポイント使い分け・スクロールロック/リサイズ解除・NoteCheckbox のキーボード/focus-visible・各種 aria-* は良好。

---

## 対応サマリー

| 指摘 | 対応 |
|---|---|
| B-A11Y-001（ドロワー focus 管理） | 修正（ADR-006、AppShellDrawer 全面強化） |
| W-FE-003（pending で選択凍結） | 修正（pointer-events-none 撤去） |
| W-AR-001（backdrop クラス堅牢化） | 修正（max-lg スコープ） |
| W-A11Y-004（件数 aria-live） | 修正 |
| W-A11Y-001（ADR-005 乖離） | ADR-005 を実装に合わせ訂正 |
| W-A11Y-002（入れ子 button） | 誤検知（兄弟構造を確認） |
| W-A11Y-003（disabled コントラスト） | 許容（WCAG は disabled を除外） |
| W-AR-002（0件時 dimming なし） | 許容（軽微、空状態は即時表示で実害小） |

## Design Decisions
- ADR-005 を実装（List/Calendar checkbox-only）に合わせて訂正。
- ADR-006 を新規追加（モバイルドロワーのモーダル相当フォーカス管理）。
