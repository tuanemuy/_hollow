# シードデータ — Issue #594 ブラウザ検証

## テストユーザー
- id: `01950000-0000-7000-8000-000000000001`（`pnpm seed:dev-admin` 投入）
- 現 email（旧アドレスとして表示）: `dev-admin@example.com`

## 投入したチャレンジ（verifications テーブル）
| 用途 | token | payload.newEmail | expires_at |
|---|---|---|---|
| 通常 | `test-email-change-594` | `new-address-594@example.com` | 2030-01-01 |
| 長いアドレス | `test-email-change-594-long` | `very.long.local.part.address.for.wrapping.check@example-domain-name-594.com` | 2030-01-01 |

SQL: `.issue/594/seed-email-change.sql`（冪等。再投入は `pnpm db:execute:local .issue/594/seed-email-change.sql`）

## 確認URL
- 通常: `/email-change/confirm?token=test-email-change-594`
- 長い: `/email-change/confirm?token=test-email-change-594-long`

## 注意
- **トークンは使い切り**。verify 成功でその行は削除される。再検証は再シード。
- **verify 成功で user の email が更新される**。通常ケース実行後は dev-admin の email が `new-address-594@example.com` に変わるため、長いアドレスケースの「旧アドレス」はその時点の現アドレスになる（レイアウト検証には支障なし）。
