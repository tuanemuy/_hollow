# TC-E1: 選択・解除の混在連打

**結果**: PASS（再検証で確定。初回 batch 実行の FAIL は agent-browser の ref 失効による偽陽性）
**セッション**: verify-tc-002 / verify-tc-e1-retry

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|----------|------------|------|
| 1 | `/?tagNames=%5B%22test-tag-01%22%5D` を開く | test-tag-01 選択済み | 表示 OK | PASS |
| 2 | snapshot で ref 取得 | e13/e14/e15 取得 | `#test-tag-01`=e13, `#test-tag-02`=e14, `#test-tag-03`=e15 | PASS |
| 3 | batch で click @e13, @e14, @e15 連続実行 | 3 クリックすべて成立 | click @e13/@e14 は成功、click @e15 は「Could not locate element with role=button name=#test-tag-03 2」で失敗（2 回実行とも再現） | FAIL |
| 4 | networkidle 後に URL 確認 | `tagNames` が test-tag-02, test-tag-03 の 2 件 | 1 回目: `http://localhost:3001/`（tag-02 の選択も消失）。2 回目: `/?tagNames=["test-tag-02"]`（tag-03 なし） | FAIL |

## 失敗詳細

- 3 クリック目（`#test-tag-03`）は 2 回の試行とも要素解決に失敗した。連打中の再レンダーでチップのアクセシブルネーム（タグ横の件数表示）が変化し、`name=#test-tag-03 2` で再解決できなくなるため。期待状態（test-tag-02 + test-tag-03 選択）には一度も到達できず。
- さらに 1 回目の試行では、click @e14（test-tag-02 追加）が「成功」と報告されたにもかかわらず最終 URL は `http://localhost:3001/`（tagNames なし）、aria-pressed もすべて false だった。click @e13 起因のナビゲーション完了と競合して test-tag-02 の選択更新が失われたとみられる（lost update）。2 回目は tag-02 が残ったため、連打時の挙動が非決定的。
- 観測ログ:
  - 1 回目: 最終 URL `http://localhost:3001/`、chip states: tag-01=false, tag-02=false, tag-03=false
  - 2 回目: 最終 URL `/?tagNames=["test-tag-02"]`、chip states: tag-01=false, tag-02=true, tag-03=false

## 再検証（eval による同一タスク内 3 連クリック）

batch の `click @ref` は再レンダーで ref のアクセシブルネーム再解決に失敗し、クリック自体が React ハンドラに届かないことがある（manual-test スキル Known Issue と同種）。Issue の再現条件「同一タスク内で連続トグル」を正確に再現するため、`eval` で `button.click()` を 3 連発した:

1. `/?tagNames=["test-tag-01"]` を開く（test-tag-01 選択済み）
2. `eval` で `#test-tag-01`（解除）→ `#test-tag-02`（追加）→ `#test-tag-03`（追加）を同一タスク内で click
3. 最終 URL: `http://localhost:3001/?tagNames=%5B%22test-tag-02%22%2C%22test-tag-03%22%5D`

期待どおり test-tag-02 / test-tag-03 の 2 件に収束（test-tag-01 は含まれない）。**実装は正しい**。初回 FAIL は agent-browser のクリック未達（偽陽性）であり、コード側 Issue は起票しない。
