# 実装計画 — Issue #757: モバイルフィルターのモック（P10-home.html）を集約シート方式に同期

**複雑度:** 小規模（ドキュメント同期 / `spec/design/` の HTML モック2ファイルのみ）

## 目的

#754（PR #756）でモバイル（`max-sm`）のノート一覧フィルターを「横スクロール依存のチップ行」から「集約トリガー（絞り込み）+ `Dialog` ボトムシート + 件数バッジ」へ変更した。これに伴い乖離した `spec/design/` のモックを実装に同期する。`.issue/754/adr.md` ADR-002 が #754 のスコープ外として明示的に後回しにした follow-up。

## スコープ

含む:
- `spec/design/pages/mobile/P10-home.html` — モバイルのフィルタ行を集約トリガー方式へ置き換え + ボトムシート（開いた状態）の showcase を追加。
- `spec/design/pages/P10-home.html` — モバイル該当部（`@media (max-width: 640px)`）でインラインチップ行を隠し、集約トリガーを表示するレスポンシブ切替を反映。デスクトップ（`sm` 以上）の見た目は不変。
- `#749 ADR-001`（チップ行は横スクローラ・44px タップ床はチップ非適用）の前提が #754 で更新された点を、モック内のコメントに反映。

含まない:
- デスクトップ（`sm` 以上）のモック見た目の変更（実装も不変）。
- `mobile/P10-filterbar-popovers.html` 等、他モックの更新（Issue がファイルを明示していないため別途）。
- アプリ実装コードの変更（本 Issue はドキュメント同期のみ）。

## 実装の正（参照）

実装は確定済み。モックはこれに合わせる:
- `app/components/note/list/FilterBar.tsx` — モバイルトリガー（`mobileFilterBar` / `mobileFilterTrigger` / `mobileFilterCount`）+ `Dialog` シート（`data-filter-sheet`: タグ / 期間 / 公開状態 fieldset / 内部リンク参照 / すべてクリア）。
- `app/components/note/list/styles.ts` — `mobileFilterBar` = `hidden max-sm:flex`、`filterBar` = `...max-sm:hidden`。トリガー高32px・件数バッジ（min-w 18 / h 18 / bg ink / white / 11px）。`filterBar` JSDoc が「#749 ADR-001 を #754 が更新」と明記済み。

## 受け入れ基準

| ID | 基準 | 検証 |
|----|------|------|
| AC-1 | `mobile/P10-home.html` のフィルタ行が横スクロール（`overflow-x: auto` のチップ行）ではなく、集約トリガー「絞り込み」+ 件数バッジ + クリア× になっている | 該当 CSS/markup を目視 + ブラウザ |
| AC-2 | `mobile/P10-home.html` に集約フィルターのボトムシート（開いた状態）が showcase として表現され、タグ / 期間 / 公開状態（fieldset ラジオ）/ 内部リンク参照 / 全クリア を含む | ブラウザ目視 |
| AC-3 | `P10-home.html`（デスクトップ）で `max-width: 640px` 時にインラインチップ行が隠れ集約トリガーが出る。`sm` 以上のデスクトップ見た目は不変 | 幅可変でブラウザ目視 |
| AC-4 | `#749 ADR-001`（横スクローラ前提）が #754 で更新された点がモック内コメントに反映されている | コメント目視 |
| AC-5 | デザイントークン（`spec/design/tokens.md` / 既存モックの CSS 変数）のみ使用し、新規ハードコード値・新トークンを増やさない | diff 目視 |

## 実装ステップ

1. `spec/design/pages/mobile/P10-home.html`
   - CSS: 横スクロール `.filter-bar`（+ `.filter-tags` scroller）を `.mobile-filter-bar`（トリガー行）+ `.mobile-filter-trigger` + `.mobile-filter-count` に置換。`.filter-chip` / `.filter-chip-ghost` / `.filter-clear-x` 等はシート showcase で再利用するため温存。ボトムシート CSS（`.sheet-stage` / `.sheet` / `.sheet-grabber` / `.dialog-title` 等）を既存モバイルダイアログモックから踏襲して追加。
   - markup: フィルタ行を集約トリガー（`SlidersHorizontal` + 絞り込み + 件数バッジ + クリア×）へ置換。末尾（`.bulk-bar` の前例に倣う）に「フィルター（開いた状態）」の `.sheet-stage` showcase を追加。
   - コメント: `#497`/`#749 ADR-001` の横スクロール注記を #754 の集約シート方式に更新。
2. `spec/design/pages/P10-home.html`（デスクトップ）
   - markup: `.filter-bar` の直後に `.mobile-filter-bar` トリガー（base `display:none`）を追加。
   - CSS: `.mobile-filter-bar` / `.mobile-filter-trigger` / `.mobile-filter-count` を base（`display:none`）で定義。`@media (max-width: 640px)` に `.filter-bar { display:none }` + `.mobile-filter-bar { display:flex }` を追加。
   - コメント: 「モバイルはインラインチップ行を隠し集約トリガー（シートは mobile モック参照）。#754 が #749 ADR-001 の横スクロール前提を更新」を明記。
3. `pnpm format` でモックを整形（HTML は対象なら）。`pnpm typecheck`/`lint` への影響は無い想定だが念のため確認。
4. ブラウザで両ファイルを開き AC を目視確認。

## リスク

- モックの CSS クラス温存/削除の取り違え → シート showcase で再利用するクラス（`.filter-chip` 系）を消さないよう、削除は横スクロール固有部（`.filter-bar` overflow / `.filter-tags` nowrap）に限定する。
- デスクトップ見た目への波及 → 追加 CSS は `.mobile-filter-*`（base `display:none`）と `@media (max-width:640px)` 限定にし、既存 `.filter-bar` の desktop ルールは触らない。
- トークン外の値混入 → 既存モックの CSS 変数のみ使用。
