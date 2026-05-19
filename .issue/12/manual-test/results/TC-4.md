# TC-4: processing 状態ジョブのキャンセル動作

**結果**: PASS
**実行時間**: 約 25 秒
**セッション**: verify-tc-4
**dev サーバ**: http://localhost:3001

## 対象ジョブ
- `01938f12-0000-7000-8000-000000000302` （test-a 所有, status=`processing`, progress=2/5）

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | test-a@example.com / Test1234! でログイン | ログイン成功 | `/?page=1&limit=20` に遷移 | PASS |
| 2 | `/exports/01938f12-0000-7000-8000-000000000302` に遷移 | 詳細ページが描画される | h1「エクスポートジョブ詳細」、ステータス「処理中」、進捗 2/5、キャンセルボタンあり | PASS |
| 3 | snapshot で「キャンセル」ボタン ref を確認 | ボタンが存在 | `button "キャンセル" [ref=e3]` | PASS |
| 4 | キャンセルボタンクリック | サーバ側で cancel が実行され、詳細表示が更新される | click 成功 → networkidle 待ち完了 | PASS |
| 5 | 状態確認 | ステータスが「キャンセル」に変わる / キャンセルボタンが消える / 完了日時が表示される | すべて満たした（下記参照） | PASS |
| 6 | スクリーンショット保存 | `.issue/12/manual-test/screenshots/tc-4/result.png` | 保存完了 | PASS |
| 7 | close | session 終了 | OK | PASS |

## キャンセル後の状態（DOM から抽出した実テキスト）

DescriptionList の内容:

```
ステータス:    キャンセル
形式 / スコープ: markdown / multiple
進捗:         2/5
作成日時:      2026-05-20T00:00:00.000Z
完了日時:      2026-05-19T16:25:40.881Z
```

- **ステータスラベル文字列**: 「キャンセル」（処理中の表示 → キャンセル に切り替わった）
- **キャンセルボタン**: 消失（snapshot の interactive 要素から消えた）
- **完了日時 (completed_at)**: 新たに描画された（キャンセル時刻 `2026-05-19T16:25:40.881Z`）
- **進捗バーの progressbar 要素**: 削除され、テキスト `2/5` のみが残る形に変化

## DB 側の確認

```sql
SELECT id, status, completed_at FROM export_jobs
 WHERE id='01938f12-0000-7000-8000-000000000302';
-- 01938f12-0000-7000-8000-000000000302|cancelled|2026-05-19T16:25:40.881Z
```

UI 表示と DB 状態の両方で cancel への遷移を確認した。

## スクリーンショット
- `/Users/hikaru/github.com/tuanemuy/hollow/.issue/12/manual-test/screenshots/tc-4/result.png`

## 注記

- キャンセル後の表示は **「キャンセル」** （日本語ラベル）。
  spec 等で `cancelled` という英語コードを期待していた場合は、UI ラベルが日本語化されている点を確認しておくこと。
- 完了日時として、cancel API が呼ばれた瞬間の時刻 (`completed_at`) がそのまま描画される。
- 進捗 2/5 はキャンセル時点で凍結されており、その後 0/5 などに巻き戻ることはない。
