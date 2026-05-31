# 動作確認計画 — Issue #372: タグ note_count 死蔵コードの撤去

**Issue:** #372
**作成日:** 2026-05-31

---

## 確認環境

このIssueの変更（死蔵列・索引・check の DROP、ドメイン/DTO 整理）を確認するために必要な手順のみ記載。

### migration の生成と適用

```bash
# schema.ts 変更後に migration を生成
pnpm db:generate
# 生成 SQL を目視レビュー（列 DROP が ALTER DROP COLUMN か table 再構築か、
# 索引/check の DROP が含まれるか）

# ローカル D1 に適用
pnpm db:apply:local
```

### 検証環境の起動

```bash
# MEMORY: pnpm start は dist を配信するため、ソース変更を実機確認する前に build する
pnpm build
pnpm start   # wrangler dev（ビルド済み dist/worker を配信）
```

開発中のUI挙動だけ見る場合は `pnpm dev`（vite dev）でも可。ただし wrangler の D1 migration ledger を使う確認は `pnpm start` 側で行う。

### デプロイ方法

```bash
# staging
pnpm db:apply:staging
# production
pnpm db:apply:production
```

migration 適用後にアプリ本体のデプロイ（既存のデプロイ手順）を行う。

## 確認項目

### 1. タグ一覧の件数表示（read-time 集計が維持されている）

- **目的:** 列撤去後も `findByOwner` の read-time 集計で件数が正しく表示される。
- **手順:**
  1. ログインし、複数タグと、各タグに紐づく active なノートを用意する。
  2. `/tags`（TagManager）を開く。
  3. 各タグの「N 件のノート」表示を確認する。
  4. `/`（すべてのノート）を開き FilterBar のタグファセットの件数を確認する。
- **期待結果:** 件数が active ノート数と一致（#365 と同じ挙動）。列撤去前後で表示数が変わらない。
- **確認ポイント:** ノートを trash に移すと該当タグの件数が減る（active のみ集計）。

### 2. タグの人気順ソート（索引撤去後も ORDER BY COUNT が機能）

- **目的:** `idx_tags_owner_note_count` 撤去後も noteCount 降順ソートが動く。
- **手順:**
  1. タグ一覧で「利用件数順」ソートを選ぶ（`sort=noteCount`）。
  2. 件数の多い順に並ぶことを確認する。
- **期待結果:** 件数降順で並ぶ。索引が無くても集計式の ORDER BY で正しくソートされる。

### 3. タグのマージ（increment 撤去後も merge が完結）

- **目的:** `incrementNoteCount` 撤去後も merge が note 側張り替え＋source 削除で完結する。
- **手順:**
  1. ソースタグとターゲットタグ、ソースに紐づくノートを用意する。
  2. `/tags` でソース → ターゲットへマージを実行する。
  3. ソースタグが消え、対象ノートがターゲットタグに張り替わっていることを確認する。
  4. マージ後にターゲットタグの件数表示が正しいことを確認する（read-time 集計）。
- **期待結果:** ソースタグ消滅、ノートのタグがターゲットに統合、件数表示が正しい。

### 4. タグの作成・リネーム（DTO 経路の整合）

- **目的:** `toTagView` 2引数化後も createTag/renameTag が正常に応答する。
- **手順:**
  1. 新規タグを作成する（`CreateTagForm`）。
  2. 既存タグをリネームする（`TagActions`）。
- **期待結果:** いずれも成功し、UI がエラーにならない。一覧に反映される。

## エッジケース・異常系

### 1. 全ノートが trashed のタグ

- **目的:** active 0 件のタグが 0 と表示される（#365 ADR-001 の維持）。
- **手順:**
  1. あるタグに紐づくノートをすべて trash に移す。
  2. `/tags` でそのタグの件数を確認する。
- **期待結果:** 0 件と表示される。

### 2. migration の冪等性・既存データ

- **目的:** 列 DROP migration が既存データを壊さない。
- **手順:**
  1. note_count に値が入った既存行があるローカル D1 で `pnpm db:apply:local` を実行する。
  2. アプリでタグ一覧が表示できることを確認する。
- **期待結果:** migration が成功し、表示は read-time 集計値（列値ではない）で正しい。

## 既存機能への影響確認

- **ノート保存時のタグ自動抽出**: `#hashtag` を含むノートを保存し、タグが作成・紐付けされること（noteCount 列更新が無くても OK）。
- **タグ削除**: タグ削除でノートからの除去・ブラックリスト追加が動くこと。
- **検索のタグファセット**: 検索結果のタグ表示が影響を受けないこと。

## 確認チェックリスト

- [ ] `pnpm db:generate` で生成された migration SQL をレビューした（列/索引/check の DROP・table 再構築の有無）
- [ ] `pnpm typecheck` が通る
- [ ] `./node_modules/.bin/biome check` がクリーン
- [ ] `pnpm test`（unit + integration）が緑
- [ ] タグ一覧の件数表示が正しい（read-time 集計）
- [ ] 人気順ソートが動く（索引撤去後）
- [ ] マージがソース削除＋ノート張り替えで完結する
- [ ] タグ作成・リネームが正常応答する
- [ ] 全 trashed タグが 0 表示
- [ ] migration 適用後も既存データで表示が壊れない
