# TC-E1 連続トグル耐性 — 結果

判定: **FAIL**（step1 FAIL / step2 PASS）

- 実行日: 2026-06-13
- 環境: http://localhost:3001 / agent-browser 0.27.1 / セッション verify-tc-005 / dev-admin
- 注記: agent-browser ではネットワークスロットリングを設定できないため、**素早い連続クリックによる近似**で実施（指示どおり）。3 種の間隔で計測: ①同一タスク内連続 click()（0ms）②requestAnimationFrame 間隔（約16ms）③CLI コマンド連続（約100〜200ms）。

## 実行ログ

| # | 操作 | 期待結果 | 実測 | 判定 |
|---|---|---|---|---|
| 1 | ピッカーを開き tag-01/02/03 を間隔をあけず連続クリック | 3 つとも aria-selected=true、URL に 3 つ反映、UI が固まらない | **更新ロスト発生**。①0ms 間隔: 最後の 1 件のみ反映（`tagNames=["test-tag-03"]`、selected は tag-03 のみ）。②約16ms 間隔: 2/3 件反映（tag-01 がロスト、`tagNames=["test-tag-02","test-tag-03"]`）。③約100〜200ms 間隔: 反映はされるが再レンダーで option 参照が無効化されるタイミングあり。UI フリーズはなし | **FAIL** |
| 2 | 同じ 3 つを連続クリックで解除（約100〜200ms 間隔） | 全部 aria-selected=false、URL から外れる | selected 0 件、URL クエリ空、パネル開いたまま、UI 応答性正常（強制レイアウト <100ms） | PASS |

## 失敗詳細（step1）

- 事象: 連続トグル時に「直前のトグルが URL/状態へ反映される前に次のトグルが古い状態を基準に計算する」典型的な lost update。0ms 間隔では last-write-wins となり 3 クリックで 1 件しか選択されない。1 フレーム（約16ms）間隔でも 1 件ロスト。
- 確認方法: `[...document.querySelectorAll('[role=option][aria-selected=true]')]` と `location.search` を 1.5 秒静置後に確認（最終整定値で判定）。
- 十分な間隔（約150ms 以上）を空けて再クリックすれば全 3 件が選択可能で、最終的に `tagNames=["test-tag-01","test-tag-03","test-tag-02"]` に到達した（復旧可能、固まりはしない）。
- 示唆: トグル処理が直近の search params のスナップショット（stale closure）から次状態を生成している可能性。functional update もしくは pending 状態の集約が必要。

## 備考

- 期待結果のうち「UI が固まらない」は全ケースで満たした。失敗は選択状態の整合性（3 件反映）のみ。
- ネットワークスロットリング下では state 反映遅延がさらに伸びるため、実環境ではより低い操作頻度でも同事象が起き得る。

## 切り分け結果（2026-06-13）

main の既存タグチップ3連打でも同一再現（last-write-wins）。`toggleTag` は main から無変更でピッカーは同ハンドラを共有するため、**本 Issue 起因ではない既存バグ**。原因: `toggleTag` がレンダー時点の `optimistic.tagNames` スナップショットから次状態を事前計算して search updater に固定値で渡すため。修正方向: updater 内で `prev.tagNames` 基準にトグル計算。→ 別 Issue として起票。

**最終結果: FAIL（既存バグ・スコープ外、Issue 起票対応）**
