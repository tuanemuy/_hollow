# 動作確認計画 — Issue #473: DTO ブランド型を廃止しプリミティブ string に置き換える

**Issue:** #473
**作成日:** 2026-06-04

---

## 確認環境

このリファクタは型レベルのみの変更で、全キャストは TypeScript の型消去によりランタイムに残らない（**正味の実行時効果はゼロ**）。したがって検証の中心は静的検査（typecheck / lint / test）であり、ブラウザ確認は「既存挙動が壊れていない」ことのスモークに留める。

### 静的検査（主検証）

```bash
pnpm typecheck      # tsgo — 全参照解決・domain ブランド据え置きの確認（最重要）
pnpm lint:fix       # biome check --write — 冗長キャスト・未使用 import の機械掃除
pnpm format         # biome format --write
pnpm test           # test:unit + test:integration
```

### 検証環境の起動（スモーク用）

```bash
pnpm dev            # vite dev（Cloudflare runtime）。既定ポートが埋まっていれば別ポートで起動
```

ローカルログインが要る画面を見る場合のみ:

```bash
pnpm db:apply:local     # ローカル D1 にマイグレーション適用（未適用時）
pnpm seed:dev-admin     # dev-admin ユーザーを投入し cookie ログイン
```

### デプロイ方法

なし（検証環境のローカル静的検査＋スモークで完結。ステージング反映は通常リリースフローに従う）。

## 確認項目

### 1. typecheck が green（最重要）

- **目的:** DTO フィールドを `string` 化しても全参照が解決し、据え置いた domain ブランドキャスト・`.create()` 検証が温存されていることを確認
- **手順:**
  1. `pnpm typecheck` を実行
  2. エラーがあれば未解決参照（エイリアス畳み漏れ・クロス import 削除漏れ）を特定して修正
- **期待結果:** エラーゼロ
- **確認ポイント:** 特に定義削除（Step 6）直後。domain 側の `as <domainブランド>` が誤って消えていないか

### 2. 消し漏れの明示確認（typecheck では拾えない純減未達）

- **目的:** string→string の冗長キャストは typecheck を通るため、純減が未達でも気づけない。明示 grep で残骸を潰す
- **手順:**
  1. `grep -rn "as unknown as Parameters<typeof" app/` — 間接キャスト経路②の残りがないか
  2. `grep -rn "toDtoUserId" app/` — ヘルパーが残っていないか
  3. `grep -rn "as unknown as string" app/` — 残ってよいのは「含まれないもの」の intra-domain 11 件（`loaders.ts:444`/`startExportJob.ts`×2/`runIngestionJob.ts`×4/`domain/export/service.ts`×4）のみ
  4. `grep -rn "__brand" app/core/application/dto/` — DTO ブランド定義が残っていないか（`SessionToken` は元から非ブランド）
- **期待結果:** 据え置き対象以外の DTO 関連キャスト・ブランド定義が残っていない
- **確認ポイント:** 据え置き 11 件を誤って消していないことも同時に確認

### 3. ユニット・統合テストが green

- **目的:** ランタイム挙動が不変であること、DTO ブランドを参照していた 8 テストファイルの import/フィクスチャ更新が正しいことを確認
- **手順:**
  1. `pnpm test` を実行
- **期待結果:** 全テスト green（挙動はキャスト erase により不変）
- **確認ポイント:** `note/detail`・`note/history`・`note/editor`・`note/list` の DTO ブランド参照を更新したテストが落ちていないか

### 4. ブラウザスモーク（既存挙動の非回帰）

- **目的:** DTO を消費する代表画面が従来どおり描画・動作することを確認
- **手順:**
  1. `pnpm dev` で起動し、`pnpm seed:dev-admin` でログイン
  2. ノート詳細画面を開く（`getNoteDetail` 経由。**Issue 起点の `originalFileName` を含む sourceFile 表示**が壊れていないか）
  3. ノート一覧・タグ・ディレクトリツリーを開く（loader の `as unknown as string` を削除した動線）
  4. タグ rename / ingestion アップロード等、`toDtoUserId`・`Parameters<>` キャストを畳んだ action を1つ操作
- **期待結果:** いずれも従来どおり表示・操作でき、id 関連の不整合（リンク切れ・取得失敗）が出ない
- **確認ポイント:** id がフィールドに正しく入っているか（string 化で値そのものは不変のはず）

## エッジケース・異常系

### 1. 据え置き対象の据え置き確認

- **目的:** intra-domain の string 演算（ファイル名生成・Map キー）が壊れていないか
- **手順:** ingestion ジョブ実行（ディレクトリパス構築）／export ジョブ実行（ファイル名生成）を伴う動線があれば動かす。なければ該当ユニット/統合テストの green で代替
- **期待結果:** パス・ファイル名が従来どおり生成される

## 既存機能への影響確認

- DTO を消費する全画面（presentation 層全般）が影響範囲。ただしランタイム不変のため、typecheck + test green と代表画面スモークで担保する
- domain 層・adapter 層は変更なし（import 元が `@/core/domain/...` のキャストは据え置き）

## 確認チェックリスト

- [ ] `pnpm typecheck` green
- [ ] `grep "as unknown as Parameters<typeof" app/` 残骸なし
- [ ] `grep "toDtoUserId" app/` 残骸なし
- [ ] `grep "as unknown as string" app/` 据え置き 11 件のみ
- [ ] `grep "__brand" app/core/application/dto/` 残骸なし
- [ ] `pnpm lint:fix && pnpm format` 適用済み・差分安定
- [ ] `pnpm test` green
- [ ] ノート詳細（sourceFile 表示）スモーク OK
- [ ] ノート一覧・タグ・ディレクトリツリー スモーク OK
- [ ] タグ/ingestion action スモーク OK
