# PR #666 レビュー — General（Round 1）

対象: Issue #664「FilterBar: タグフィルタの連続トグルで lost update」
計画: `.issue/664/plan.md`

## 計画との整合性 / 受け入れ基準の検証

| AC | 内容 | 判定 |
|---|---|---|
| AC-1 | 3 連クリックで 3 タグすべて `tagNames` に反映 | 満たす。トグル計算を search updater 内（`prev.tagNames` 基準）に移動。ユニットテスト "accumulates three rapid toggles" + 実機 TC-1 で検証済み |
| AC-2 | 選択済みタグの再クリックで該当タグのみ解除 | 満たす。"deselects only the re-clicked tag" + TC-2 |
| AC-3 | 全解除で `tagNames` が URL から消える | 満たす。`arr.length === 0 ? undefined : arr` を維持し、テストは `final.tagNames === undefined` かつ `"tagNames" in final === true`（明示 undefined によるクリア）まで検証 |
| AC-4 | 連続トグルの累積をユニットテストで検証 | 満たす。updater を `prev` チェーンで順次評価する `chainUpdaters` で検証 |

スコープ（page リセット非追加・他フィルタ非対象）も計画どおり。`pnpm vitest run FilterBar.test.tsx`（23 passed）と `pnpm typecheck` をローカルで実行し、グリーンを確認した。

### General

#### Blockers

なし

#### Warnings

- **[W-001]** トグルロジックが `reduceFilters` の `toggleTag` ケースと `toggleTag` の updater の 2 箇所に重複しており、片方だけ変更されると optimistic 表示と URL の最終状態が乖離する（plan の「リスクと注意点」自身が指摘している収束性が暗黙の前提のまま）
  - 場所: `app/components/note/list/FilterBar.tsx:88-93` / `app/components/note/list/FilterBar.tsx:186-196`
  - 理由: Set への add/delete トグルという同一計算が 2 箇所にあり、両者の一致を保証するテストも共有実装もない。将来の変更（例: タグ数上限、正規化）で片側だけ直すと Issue #478 系の「表示と URL の不一致」を再発させる
  - 提案: `toggleInSet(names: Iterable<string>, name: string): Set<string>` 程度の純関数を切り出して reducer と updater の両方から呼ぶ。必須ではないが、今回の修正でちょうど 2 箇所目が生まれたタイミングなので安い保険

#### Notes

- **[N-001]** 修正アプローチは妥当。レースの根本原因（レンダー時スナップショット `optimistic.tagNames` を updater がクロージャで固定）を、TanStack Router の functional updater が渡す `prev`（直前 navigate の結果を含む最新 search）基準の計算に置き換えており、last-write-wins を正しく解消している。optimistic 側は `useOptimistic` のアクションキューが元から累積するため無変更で正しい
- **[N-002]** テスト設計が効果的。`chainUpdaters` は router の prev チェーン挙動をシミュレートするだけだが、旧実装（固定値クロージャ）に回帰すると各 updater が `prev` を無視して単一タグを返すため AC-1 テストが `["gamma"]` で確実に落ちる。回帰検出力がある。router 実機の prev 挙動はユニットでは担保できない点も、manual-test（TC-1/TC-E1、batch click と eval click の両方）で補完されており、plan のリスク項目への対応として適切
- **[N-003]** plan は `prev as Partial<NoteListSearch>` のキャストが必要と書いていたが、実装は `run` の `nav` パラメータが既に `(prev: Partial<NoteListSearch>) => ...` と型付けされているためキャスト不要で、計画よりも型安全に着地している。良い逸脱
- **[N-004]** コメント規約準拠。FilterBar.tsx:182-185 のコメントは「なぜ updater 内で計算するか（スナップショットだと連打が上書きされる）」という why のみで CLAUDE.md の方針に合致。テスト側の describe 前 JSDoc も既存 #478/#467 ブロックの様式に揃っている
- **[N-005]** manual-test レポート（TC-E1）が初回 FAIL を隠さず、agent-browser の ref 失効による偽陽性と切り分けたうえで eval による同一タスク内連打で再検証している。検証の誠実さとして良い
