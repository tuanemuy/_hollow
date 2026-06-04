# Issue #478 動作確認計画

## 確認環境

worktree: `/Users/hikaru/github.com/tuanemuy/hollow-478`（ブランチ `issue/478/filterbar-optimistic-await`）

### 自動テスト

```bash
pnpm test:unit -- FilterBar
pnpm typecheck
pnpm lint:fix && pnpm format
```

- `FilterBar.test.tsx`: タグクリックで選択状態が即時反映 / navigate reject 時に baseline へ rollback。

### ブラウザ手動確認

```bash
pnpm dev   # vite dev（Cloudflare runtime, 既定ポート 3000）
```

ログインは `seed:dev-admin` の cookie 手順（memory: local-browser-verification 参照）。タグが付いたノートが複数ある状態を用意する。

| # | 操作 | 期待結果 |
|---|------|---------|
| 1 | ノート一覧 `/` でタグチップをクリック | **クリック直後**にチップがハイライト（`data-active` / 黒背景）になる。loader 完了を待たない |
| 2 | 別のタグを連続クリック | 各クリックで即座にトグル、取りこぼしなし |
| 3 | 公開状態 `<select>` を変更 | 選択値が即時反映され、リストが round-trip 後に更新 |
| 4 | round-trip 中の見た目 | `aria-busy` / リストの dim が round-trip 完了まで継続 |
| 5 | 「クリア」ボタン | 全フィルタの選択状態が即座に解除 |
| 6 | 保存ビュー `<select>`（NoteListToolbar）を切替 | 切替中 `<select>` が disabled になり、loader 完了で解除 |

## 合否基準

- ステップ1で「ワンテンポ遅れ」が解消されていること（本 Issue の主目的）。
- 既存のフィルタ絞り込み結果・URL 同期が従来通り動くこと（リグレッションなし）。
