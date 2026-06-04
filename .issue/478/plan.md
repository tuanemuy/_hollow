# Issue #478 実装計画

## メタデータ

- Issue: #478 `fix(ui): ノート一覧の絞り込み選択状態（タグ等）が即時反映されない`
- 複雑度: **小規模**（2ファイルの規約合わせ + テスト追加）
- ラベル: bug

## 概要

ノート一覧（`/`）の `FilterBar` で、タグチップ等をクリックしても選択状態（ハイライト）が即時反映されない。`run` ヘルパーが `startTransition` の中で `router.navigate(...)` を **await していない**ため、transition が同期的に即終了し、React 19 の `useOptimistic` が pending を抜けて baseline へ即巻き戻る。プロジェクトで確立済みの「`startTransition(async () => { applyOptimistic(...); await ... })`」規約（Issue #414 / #423）に揃える。

## 調査結果

- 関連ファイル
  - `app/components/note/list/FilterBar.tsx` — **本体**。`run` が `startTransition(() => {...})` で navigate を await せず（`L121-130` 付近）。
  - `app/components/note/list/NoteListToolbar.tsx` — `onSelectView` ×2 が同じく未 await（`isPending` で保存ビュー `<select>` の disabled 制御に影響、軽微）。
- あるべきパターン（既存実装から抽出）
  - `view/SavedViewsList/index.tsx`, `note/list/BulkExportDialog.tsx`, `ingestion/IngestionJobRow.tsx` などはいずれも `startTransition(async () => { applyOptimistic(...); await router.navigate(...); })`。
  - mutation を伴うものは `try/catch + setError` でラップしているが、`FilterBar` / `NoteListToolbar` は **error UI を持たない navigate 専用**なので try/catch は付けない（Issue が明記した最小修正に従う）。`useOptimistic` は transition 完了時（resolve / reject いずれも）自動で baseline へ戻るため、reject 時の rollback は await だけで担保される。
- 既存実装の状態: `FilterBar` / `NoteListToolbar` のみ規約から外れている。他の `startTransition` 箇所は問題なし（Issue の sweep 表で確認済み）。

## 実装ステップ

1. `FilterBar.tsx` の `run` を async transition + await に変更
   - 対象: `app/components/note/list/FilterBar.tsx`
   - 変更: `startTransition(() => { applyOptimistic(action); router.navigate(...); })` → `startTransition(async () => { applyOptimistic(action); await router.navigate(...); })`
   - 理由: navigate（loader round-trip 込み）完了まで transition を pending に保ち、`useOptimistic` が楽観値を維持する。`isPending`（`aria-busy` / リスト dim）も round-trip 中ずっと正しく true になる。

2. `NoteListToolbar.tsx` の `onSelectView` 2箇所を await に揃える
   - 対象: `app/components/note/list/NoteListToolbar.tsx`
   - 変更: `startTransition(() => { router.navigate(...); })` → `startTransition(async () => { await router.navigate(...); })`（早期 return パスとビュー選択パスの両方）
   - 理由: 保存ビュー `<select>` の `disabled={isPending}` フィードバックが loader round-trip 中ずっと効くようにする。

3. `FilterBar` の component テスト追加
   - 対象: `app/components/note/list/__tests__/FilterBar.test.tsx`（新規）
   - 内容: Issue #414 / #423 と同型（happy-dom + `router.navigate` mock）
     - タグクリックで選択状態（`aria-pressed` / `data-active`）が即時反映される
     - `router.navigate` が reject したとき baseline へ rollback する

## スコープ外

- Issue #476（ノート一覧の絞り込みUI再設計）— 本修正は独立。
- `DisplayModeSwitch.tsx` — Issue の sweep で問題なしと確認済み（transition 不要設計）。

## 影響範囲

- タグ / 期間 / 公開状態 / ディレクトリ解除 / 内部リンク参照は全て `run` 経由 → 全フィルタ操作の選択状態が一括で即時反映される。
- 振る舞いの変更は「楽観値の保持期間」のみ。URL / loader / DTO に変更なし。
