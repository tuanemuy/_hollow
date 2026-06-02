# テスト実行サマリー — Issue #74

**実行日時**: 2026-06-03
**テストソース**: `.issue/74/testing.md`
**サーバー**: http://localhost:5176（`pnpm dev --port 5176`, live source）
**対象**: home `/`（認証必須 `_app`）の FilterBar / DisplayModeSwitch の URL 更新挙動
**検証目的**: `homeSearchUpdater(prev, patch)` = `{ ...prev, ...patch }` の挙動同一性（リファクタ回帰確認）

| # | 確認項目 | 種別 | 結果 | URL 遷移 |
|---|---------|------|------|---------|
| 1 | 公開状態セレクト | 正常系 | PASS | `/` → `/?visibility=private` |
| 2 | 表示モード tile（フィルタ適用中） | 正常系 | PASS | `…visibility=private` → `…&display=tile`（filter 保持） |
| 3 | 表示モード calendar | 正常系 | PASS | → `…&display=calendar` |
| 4 | 表示モード list | 正常系 | PASS | → `…&display=list` |
| 5 | クリア | 正常系 | PASS | `…visibility=private&display=list` → `/?display=list`（display 保持・visibility 除去） |
| 6 | タグチップ選択 | 正常系 | PASS | `/` → `/?tagNames=["work"]` |
| 7 | タグチップ解除 | 正常系 | PASS | → `/`（tagNames 完全除去） |
| 8 | 開始日入力 | 正常系 | PASS | `/` → `/?from=2026-01-15` |
| 9 | 終了日入力 | 正常系 | PASS | → `/?from=2026-01-15&to=2026-02-20` |
| 10 | 開始日クリア（to 保持） | エッジ | PASS | → `/?to=2026-02-20`（from のみ除去） |
| 11 | 内部リンク参照 選択＋ページリセット | 正常系 | PASS | `/?page=2` → `/?referencingNoteId=…`（page=2 ドロップ） |
| 12 | 内部リンク参照 解除 | 正常系 | PASS | → `/` |

**合計**: 12 件（PASS: 12 / FAIL: 0）

## 確認ポイント（特記）

- デフォルトページネーション `page=1&limit=20` が全操作で URL に出ない（Issue #215 挙動維持）。
- 内部リンク参照付与で `?page=2` が脱落（`handlePick` の `page: undefined` patch）— 期待どおり。
- prev スプレッドの後勝ち: フィルタ適用中の display 切替で既存 param 保持＋display のみ更新／from クリアで to を保持しつつ from のみ除去、を実挙動で裏付け。

## FAIL

なし。途中 1 回 picker 操作後に `about:blank` へ飛ぶ一過性の glitch があったが、cookie 再注入＋再 open で復帰・再現性なし。agent-browser/CDP 側の一時挙動であり実装バグではないと判断。

## 後始末

- シードした users / sessions / tags / notes / directories 行を `pnpm db:execute:local` で全削除、削除後件数 0 を確認。dev DB は汚していない。
- サーバーは Phase 2 完了後にメイン側で停止。

## スクリーンショット

`.issue/74/manual-test/screenshots/` に 14 枚（step-01 〜 step-14）。
