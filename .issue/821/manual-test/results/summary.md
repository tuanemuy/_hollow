# テスト実行サマリー — Issue #821

**実行日:** 2026-07-10
**テストソース:** .issue/821/testing.md
**サーバー:** http://localhost:3001（vite dev / cloudflare workerd SSR）
**ブラウザ実効TZ:** America/New_York（Chrome が起動時 `TZ` env を尊重。非JST環境での強い検証が成立）

| TC | URL | 対象 | 結果 | 備考 |
|----|-----|------|------|------|
| TC-01 | /admin | Dashboard formatActivityTime (RSC) | PASS | アクティビティ無し（表示データなし）、warning無し |
| TC-02 | /admin/users | UsersTable (client, #817集約) | PASS | dev-admin 登録日 `2024/01/01`（TZ依存なら前日 2023/12/31 になるところ JST 固定） |
| TC-03 | /admin/jobs | Jobs (client) | PASS | ジョブ日時 `YYYY/MM/DD HH:mm` 一貫表示 |
| TC-04 | /settings/profile | ProfileForm (client) | PASS（決定的） | 作成日時 `2024年1月1日 09:00`（UTC00:00 → JST +9h） |
| TC-05 | /settings/security | SecurityForm (client) + relativeTime | PASS（決定的） | ログイン日時 `2024/01/01 9:00` |
| TC-06 | /tags | TagList (client) | PASS | 最終使用日 `YYYY/MM/DD` 一貫表示 |
| TC-07 | / | note list listSelectors (client) | PASS | ノート更新日 `YYYY年M月D日` 一貫表示 |
| TC-08 | /trash | TrashList (RSC) | PASS | 削除ノート無し（表示データなし）、warning無し |

**合計:** 8 件（PASS: 8 / FAIL: 0）

## hydration warning
全 8 ページで検出ゼロ。"hydrat" / "did not match" / "Text content does not match" / "server rendered HTML" 系は一切なし。console に出たのは tanstack-router の code-split バンドル警告のみ（hydration 無関係）。

## 日付表示の JST 妥当性（総括）
ブラウザ TZ が America/New_York にもかかわらず全ページで JST 固定表示を確認。決定的な証拠は UTC 00:00 の seed 値が +9h の 09:00 で表示された点（TC-04 / TC-05）と、TC-02 の日付が前日ずれせず `2024/01/01` のままだった点。クライアントがブラウザ TZ に依存しないことを強く確認できた。

## 検証対象外
- **PublishSettings**（ノート詳細のシェアアクセス表示）: dev-admin にシェアアクセスデータが無く実機検証不可 → 検証対象外。ユニットテスト（`dateFormat.test.ts` + 既存コンポーネントテスト）でカバー。
- **NoteMetaPanel / NoteHistoryList / NoteRevisionDetail**: dev-admin にノート/履歴データが無いため実機での日付表示は未確認（ページ自体は空状態で warning 無し）。共有ヘルパー経由化はユニット/型チェックでカバー。
