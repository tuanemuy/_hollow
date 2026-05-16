# ADR 007: 管理者登録は Setup Token で行う

## ステータス

承認済み（2026-05-16）

## コンテキスト

[ADR 001](./001-multi-user-open-registration.md) でマルチユーザー・オープン登録モデルを採用したが、初期 admin の作り方は曖昧で、当初の設計では `spec/usecases/identity.md` の `SignUp` フロー内で「`userRepo.countAdmins() === 0` のとき `role=admin` に切り替える」という暗黙ルールを採用していた。

この方式には以下の課題がある:

- セルフホストで管理者がデプロイ直後にサインアップ画面を開く前に第三者がオープン登録経由で先回りすると、その第三者が admin になってしまう（race condition）
- 「最初の 1 人」という特権が usecase 内に隠れており、運用者にとって挙動が予測しにくい
- 一度デプロイされたインスタンスに 2 人目以降の admin を seed したいケース（後任管理者を増やす等）に対応できない

## 決定

**`ADMIN_SETUP_TOKEN` 環境変数（Cloudflare Workers Secret）で管理する Setup Token と一致するトークンを提示した SignUp のみ、`role=admin` で User を作成する**。通常の `SignUp` は常に `role=member` を作る。

具体的な運用:

1. 運用者は `wrangler secret put ADMIN_SETUP_TOKEN` で十分な長さ（32 字以上）のランダム文字列を設定する
2. `/setup` ページで `username` / `email` / `password` / `setupToken` を入力して admin を登録する
3. Setup Token は env が設定されている限り何度でも使える。admin を増やしたければ運用者は token を共有し、不要になったら `wrangler secret delete` で無効化する
4. `ADMIN_SETUP_TOKEN` が未設定のとき、`/setup` ページは 404 を返し、`AdminSignUp` ユースケースは常に `AuthenticationError('setup_token_disabled')` を返す
5. `AdminSignUp` は `RegistrationPolicy.open === false` でも実行可能（運用者特権）
6. それ以外の挙動（VO 検証 / pending 作成 / 確認メール / DirectoryService.ensureRoot / VerificationChallenge.issue）は通常の `SignUp` と同一

## 検討した代替案

### A. 初ユーザーを admin にする（旧方針）
- 利点: 追加の env / UI が不要
- 不採用理由: 上記コンテキスト参照（race condition / 予測困難 / 2 人目以降の seed 不可）

### B. DB の単発トークン（`verifications` に `purpose='admin_setup'` を追加）
- 利点: 発行・消費の監査ログが残る、1 回限りで自動消滅
- 不採用理由: トークン発行のために運用者が DB 操作（or CLI コマンド）を要する。Cloudflare Workers ではこのオペレーションが直感的でない。env-based の方がデプロイメントワークフローと噛み合う

### C. env と DB トークンの両方をサポート
- 利点: 柔軟
- 不採用理由: spec / 実装 / テストの面積が膨らむ。MVP 不要

### D. CLI 専用の bootstrap コマンド
- 利点: UI を露出しない
- 不採用理由: セルフホスト運用者の体験が悪い（ローカル CLI が前提になる）

## 影響

- **ドメイン**: `Identity` ドメインに `SetupTokenVerifier` ポートを追加。`Role` の説明文を「Setup Token で admin として登録、または admin が他ユーザーを昇格可能」に更新
  - 注 (ドメイン層に置く根拠): CLAUDE.md の「ポートは inward layer が定義」原則に従うと、Setup Token 検証は純粋な認可ゲート（シークレット比較）であり厳密にはドメイン不変条件に関与しない。それでもドメインに置くのは、(a) env / Secrets Manager 等の保管先依存をドメインから完全に隠蔽するため、(b) `AdminSignUp` ユースケースが `SignUp` と同列のドメインフロー（User pending 作成 + 確認メール）として読めるよう、認可ゲートの抽象も同じレイヤーに寄せたいため。インターフェースは `isEnabled(): boolean` / `verify(rawToken: string): boolean` の 2 メソッドのみで、副作用なし・I/O なしの薄い port に留める
- **ユースケース**: `SignUp` から「初ユーザーなら admin に切り替え」のロジックを削除。新規 `AdminSignUp` ユースケースを追加（入力に `setupToken: string` を追加、`SetupTokenVerifier.verify` 通過後に `role=admin` で作成）
- **DB**: スキーマ変更なし（env で完結）
- **ページ**: `/setup` を P01b として追加（[spec/pages/index.md](../pages/index.md) 参照）。`ADMIN_SETUP_TOKEN` 未設定時は 404
- **シナリオ**: 管理者領域（I 系）の冒頭に `I0: 初期管理者の登録` を追加
- **テスト**: SignUp の「初ユーザー登録 → admin」テストを削除。AdminSignUp 専用のテストを追加
- **運用**: README / `docs/runtime_cloudflare.md` に「初回デプロイ後に Setup Token を設定し、`/setup` から admin を作る」手順を追記する必要がある（本 ADR の範囲外）
- **セキュリティ**: Setup Token は admin 化のための「ルートトークン」相当。漏洩すると任意のユーザーが admin を作れる。運用者は admin 登録完了後に env から削除することを推奨する（README で明示）
