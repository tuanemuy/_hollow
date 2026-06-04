# 動作確認計画 — Issue #473: DTO ブランド型を廃止しプリミティブ string に置き換える

**Issue:** #473
**作成日:** 2026-06-04

---

## 確認環境

本 Issue は型レベルのリファクタ（ブランド型 → `string`）で、ランタイム挙動・UI は不変。検証の主軸は静的解析（typecheck）と既存テストの維持。

### 静的検証

```bash
pnpm typecheck      # tsgo — 残存ブランド参照・剥がし忘れキャストを全検出
pnpm lint:fix       # biome check --write — 未使用 import（消し忘れた *DTO import）検出
pnpm format         # biome format --write
```

### 既存テストの実行

```bash
pnpm test:unit          # vitest run
pnpm test:integration   # vitest run --config vitest.config.integration.ts
```

### 検証環境の起動（ブラウザスモーク用）

```bash
pnpm dev    # vite dev --config vite.config.cloudflare.ts（ローカル開発サーバー）
```

ログイン手順・ローカル D1 シードは memory の local-browser-verification を参照。

### デプロイ方法

なし（ローカルの typecheck / test で確認できる。本番反映は通常の `deploy:staging` / `deploy:production` フローに従う）。

## 確認項目

### 1. typecheck がグリーン

- **目的:** DTO ブランド参照と剥がしキャストが残らず置換漏れゼロであることを保証する
- **手順:**
  1. `pnpm typecheck` を実行
- **期待結果:** エラーゼロで終了（exit 0）。ブランド削除後に残存参照があれば全て型エラーになるため、緑＝置換完遂
- **確認ポイント:** `domain/**/valueObject.ts` の変更が一切無いこと（git diff で domain 層に差分が出ていないこと）

### 2. 既存テストが全てグリーン

- **目的:** ブランドは構造的に erase されるため、振る舞いが一切変わっていないことを確認する
- **手順:**
  1. `pnpm test:unit`
  2. `pnpm test:integration`
- **期待結果:** リファクタ前と同じテスト結果（全 PASS）。新規 FAIL ゼロ
- **確認ポイント:** ingestion / export / tag 系（入力ブリッジを単一 `as` 化した usecase）のテストが特に PASS していること

### 3. `as unknown as` キャストの純減

- **目的:** Issue の主目的（無駄キャストの純減）が達成されたことを確認する
- **手順:**
  1. `grep -rn "as unknown as" app/core app/components app/routes --include="*.ts" --include="*.tsx" | wc -l` をリファクタ前後で比較
- **期待結果:** ブランド橋渡し・剥がしキャストが大幅に減少（dto 射影・presentation 剥がし分が消える）。残るのは domain 境界の単一 `as`・export domain ブランド由来など意図的に残した分のみ
- **確認ポイント:** `dto/` 配下と presentation の `as unknown as XId` / `as unknown as string` が消えていること

## エッジケース・異常系

### 1. domain 層の不可侵

- **目的:** DTO ブランド廃止が domain ブランド・値オブジェクトに波及していないことを確認する
- **手順:**
  1. `git diff main...HEAD --name-only | grep "core/domain"` を実行
- **期待結果:** domain 層のファイルが変更対象に含まれていない（出力が空）。domain ブランドの `.create()` 検証は無傷

## 既存機能への影響確認

- **ノート / ディレクトリ / タグ / 公開 / エクスポート / ingestion の各画面** — id を扱う導線が壊れていないこと。`pnpm dev` で起動し、ノート詳細表示・タグ一覧・エクスポート詳細など id を URL/props で受け渡す代表画面を 1〜2 個開いて 500 エラーが出ないことだけ確認すれば十分（型のみの変更のため）

## 確認チェックリスト

- [ ] `pnpm typecheck` グリーン
- [ ] `pnpm lint:fix` で未使用 import なし（差分が出ても import 削除のみ）
- [ ] `pnpm test:unit` 全 PASS
- [ ] `pnpm test:integration` 全 PASS
- [ ] domain 層に差分が出ていない（`git diff main...HEAD --name-only | grep core/domain` が空）
- [ ] `as unknown as` 件数が純減している
- [ ] 代表画面（ノート詳細・エクスポート詳細など）が `pnpm dev` で 500 エラーなく開く
