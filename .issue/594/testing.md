# 動作確認計画 — Issue #594: 領域7（P06）メール変更確認のアドレス差分カード

**Issue:** #594
**作成日:** 2026-06-09

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。

### 検証環境の起動

ソース変更を実サーバーで見る:

```bash
pnpm dev   # vite dev（HMR 付き、ローカル D1 を使用）
```

または production 相当で見る場合:

```bash
pnpm build && pnpm start   # wrangler dev で dist/worker を配信
```

ローカル D1 のスキーマ適用（未適用の場合のみ）:

```bash
pnpm db:migrate
```

SQL 投入は `pnpm db:execute:local <SQLファイル>` を使う（`wrangler d1 execute hollow-local-d1 --local --file`）。`pnpm dev` / `wrangler dev` とローカル D1 の書き込み先は同一。

### デプロイ方法

なし（検証環境のみで確認できる）。

## 確認項目

### 1. success 状態にアドレス差分カードが実値で表示される

- **目的:** メール変更確認の success 画面で、旧アドレス→新アドレスの差分カードがモック通りに実値で表示されることを確認する。
- **前提シード:** 確認画面に到達するには `email_change` の有効なチャレンジトークンが必要。`verifications` テーブルに以下を投入する（`<userId>` は既存ユーザー、現アドレスが旧アドレスとして表示される）:
  - `identifier`: `email_change:<userId>`
  - `value`: `{"token":"<任意トークン>","payload":{"newEmail":"new-address@example.com"}}`
  - `expires_at`: 未来日時（ISO 8601）
  - `id` / `created_at` / `updated_at`: 適当な値
- **手順:**
  1. シード投入後、ブラウザで `/email-change/confirm?token=<任意トークン>` を開く。
  2. loading（「アドレス変更を確認中...」）から success（「メールアドレスを変更しました」）へ遷移するのを待つ。
- **期待結果:**
  - 本文の下、warning alert（「旧アドレスは使用できなくなりました」）の上に差分カードが表示される。
  - カードには「旧アドレス」行（ユーザーの現アドレスが**取り消し線**・薄色で表示）と「新アドレス」行（`new-address@example.com` が通常色・medium で表示）が、左ラベル・右値の2カラムで並ぶ。
  - カード → warning alert → 「ホームへ進む」CTA の順序。
- **確認ポイント:** 旧行の取り消し線・色（ink-tertiary）・font-weight（regular）、新行の color（ink）・weight（medium）が `spec/design/pages/P06-email-change-confirm.html` の `.address-summary` と一致するか。カードの padding・gap・角丸・背景（surface）がモックと一致するか。

### 2. デザインモックとの寸法・色の一致

- **目的:** トークン由来ユーティリティで当てた寸法・色がモックと視覚的に一致することを確認する。
- **手順:**
  1. 確認項目1の success 画面と `P06-email-change-confirm.html` をブラウザで並べて比較する。
- **期待結果:** 差分カードの見た目（余白・角丸・背景・行間・文字色・取り消し線）がモックと一致。
- **確認ポイント:** リテラル px が紛れ込んでいないか（トークン経由のユーティリティのみ）。

## エッジケース・異常系

### 1. 長いメールアドレスの折返し

- **目的:** 長いアドレスでもレイアウトが崩れないことを確認する。
- **手順:**
  1. `payload.newEmail` に長いアドレス（例: `very.long.local.part.address.for.wrapping.check@example-domain-name.com`）を入れてシードし、確認画面を開く。
  2. 狭幅（モバイル幅）でも確認する。
- **期待結果:** 値が `break-all` で折返し、ラベルや他要素を押し出してレイアウトを破壊しない。

### 2. 既存のエラー状態が回帰していない

- **目的:** 差分カード追加によって expired/used/not_found/error 状態が壊れていないことを確認する。
- **手順:**
  1. 無効・期限切れ・使用済みトークンでそれぞれ `/email-change/confirm?token=...` を開く。
- **期待結果:** 各エラー状態（期限切れ/使用済み/無効/失敗）が従来通り表示され、差分カードは表示されない。

## 既存機能への影響確認

- `verifyEmailChange` usecase の DTO 拡張により、実際にユーザーの email が新アドレスに更新されること（DB の `users.email` を確認、または既存統合テスト）。
- success 遷移時の `router.invalidate()`（`_app` の userDto.email キャッシュ破棄）が従来通り動くこと。

## 確認チェックリスト

- [ ] success 画面に差分カードが旧（取り消し線）→ 新の実値で表示される
- [ ] カードは「ラベル + 値」の2カラム構成で、旧行のみ取り消し線・薄色・regular
- [ ] 順序が 本文 → 差分カード → warning alert → CTA
- [ ] 差分カードの寸法・色がモック `P06-email-change-confirm.html` と一致
- [ ] 長いアドレスが break-all で折返す
- [ ] expired/used/not_found/error 状態が回帰していない
- [ ] `pnpm typecheck && pnpm lint:fix && pnpm format` が通る
- [ ] `pnpm test:integration` の verifyEmailChange テストが通る
