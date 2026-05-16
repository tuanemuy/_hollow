# ADR 006: better-auth スキーマ自動生成と拡張カラムの両立

## ステータス

承認済み（2026-05-16）

## コンテキスト

Identity ドメインの `CredentialStore` / `SessionService` / `VerificationChallenge` ポートのアダプタ実装に better-auth を採用する。better-auth は `@better-auth/cli generate` で Drizzle スキーマを自動生成でき、`username` plugin / `admin` plugin のスキーマも統合できる。

一方、本アプリは `users` テーブルに以下のアプリ固有の拡張カラムを追加している:

- `bio` (0..500 のプロフィール文)
- `avatar_media_id` (アバター用 MediaAsset への FK)
- `last_username_changed_at` (30 日制限の判定用)
- `deleted_at` (論理削除マーカー)

これらは better-auth の生成スキーマには含まれないため、生成スキーマと共存させる運用方針を決める必要がある。

## 決定

**better-auth の `additionalFields` 設定機能を用いて拡張カラムを混ぜ込み、`@better-auth/cli generate` から単一のスキーマを生成する**。

具体的な運用:

1. better-auth インスタンスの設定 (`betterAuth({ ... })`) で `user.additionalFields` に `bio` / `avatar_media_id` / `last_username_changed_at` / `deleted_at` を宣言する
2. `@better-auth/cli generate` の生成結果を **そのままコミット**する (手で追記しない)。拡張カラムの追加・変更は `additionalFields` の宣言を編集 → 再生成
3. better-auth が触らないテーブル (`directories`, `notes`, ...) は通常通り手書きの Drizzle schema で管理。同じ `schema.ts` 内に共存
4. マイグレーション戦略:
   - 開発中は `pnpm db:push` 相当で D1 に schema を直接同期
   - 本番移行時は手書きマイグレーションを用意 (better-auth の auto-migrate は使わない)
5. `users.name` は better-auth core の既定 (NOT NULL) を維持。SignUp ユースケース側で `displayName ?? username` をセットする (空欄不可)

## 検討した代替案

### A. 生成スキーマに手で追記する
- 利点: `additionalFields` 設定を覚えなくて良い
- 不採用理由: 再生成のたびに手追加分が消える / マージ衝突が発生する。バージョンアップ時の事故源

### B. 拡張カラムを別テーブル (例: `user_profiles`) に分離
- 利点: better-auth の生成スキーマに一切触らずに済む
- 不採用理由: `users` 1 行を読むのに JOIN が増える / ドメインの `User` 集約構築コストが上がる / インデックス設計が複雑化

### C. better-auth を採用しない (自前実装)
- 利点: スキーマの完全な自由
- 不採用理由: パスワードハッシュ / セッション / 確認トークンの実装を再発明することになる。better-auth はこの領域の堅牢な OSS

## 影響

- 拡張カラムの追加は **「`additionalFields` を編集 → CLI 再生成 → migration 追記」** の 3 ステップで完結する
- better-auth のメジャーバージョンアップ時、`additionalFields` 仕様の変更があれば本 ADR を更新する
- 生成スキーマと手書きスキーマが同一ファイルに混在するため、コードレビュー時に「生成範囲」と「手書き範囲」を明示するコメントを入れる
- `User.markDeleted` で `deleted_at` を立てる操作は better-auth API ではなく Drizzle の直接更新で行う (`database/index.md` の users 注記参照)
