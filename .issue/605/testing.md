# 動作確認計画 — Issue #605: 公開面の published_at 基準の並び替え・期間集計

**Issue:** #605
**作成日:** 2026-06-09

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。本 Issue は DB スキーマ変更（領域1の複合 index `idx_pubs_owner_visibility_published_at`、migration `0015`）を含むため、検証前にマイグレーション適用が必須。領域3は範囲クエリ化のみでスキーマ変更なし。

### マイグレーション生成・適用（スキーマ変更を伴うため必須）

```bash
pnpm db:generate    # app/core/adapters/d1/schema.ts の変更から SQL マイグレーションを生成
pnpm db:migrate     # 生成された SQL をローカル D1 (hollow-local-d1) に適用
```

- 本 Issue の migration は領域1の複合 index（`0015`、手書き SQL）のみ。`pnpm db:migrate` で適用する。
- カスタム SQL を直接流す場合: `pnpm db:execute:local --file <path/to.sql>`。

### 検証環境の起動

```bash
pnpm dev    # vite dev (workerd) on http://localhost:3000
```

実サーバー（wrangler dev・本番に近い配信）で確認したい場合:

```bash
pnpm build && pnpm start    # dist/worker を wrangler dev で配信
```

`pnpm dev`（vite dev）と `db:execute:local` / `seed:dev-admin` の D1 書き込み先は同一なので、seed → `pnpm dev` で反映される。

### シードデータ準備

```bash
pnpm seed:dev-admin    # 管理者ユーザー＋有効セッションを投入（先に pnpm db:migrate 済みであること）
```

本 Issue は「公開日（published_at）」と「カレンダー日付（date_for_calendar = frontMatter 日付 or updatedAt）」が**乖離する**ノートを用意しないと差分が見えない。`pnpm db:execute:local --file <seed.sql>` で次の状態を作る:

- 同一ユーザーの公開ノートを複数件用意し、`publication_states.published_at` の順序と `notes.updated_at`（旧「公開日順」の実体）の順序が**逆**になるように作る（例: A は updatedAt 新だが published_at 旧、B はその逆）。
- `search_documents.date_for_calendar` が published_at と**別の期間に入る**ノートを用意（例: frontMatter 日付は 2年前だが公開日は今日）。
- trash relay ラグ再現用に、`publication_states.visibility='public'` のまま `notes.status='trashed'` の行を1件作り、total に混入しないことを確認する。
- lowercase の username（例: `alice` と `alicia`）を用意し、混在ケースの prefix `AL`/`al` で両方ヒットすることを確認する（username は domain 上 lowercase のみ）。

### デプロイ方法

なし（検証環境のみで確認できる）。ステージング反映が必要な場合のみ `pnpm db:apply:staging` → `pnpm deploy:staging`。

## 確認項目

### 1. P30 公開トップ「公開日順」が published_at 基準で並ぶ

- **目的:** 「公開日順」ソートの実体が `updatedAt` ではなく `publication_states.published_at` になっていること。
- **手順:**
  1. published_at と updatedAt の順序が逆になる公開ノートを seed する。
  2. `http://localhost:3000/u/{username}` を開く。
  3. ソートを「公開日順」にする（URL は `?sort=publishedAt` がデフォルト）。
- **期待結果:** ノートが published_at 降順で並ぶ（updatedAt 順とは異なる並び）。
- **確認ポイント:** URL の `sort` パラメータと表示順。「更新日順」に切り替えると updatedAt 順に変わること。

### 2. ページネーションの total が published_at listing でも整合する

- **目的:** publication 集約 listing 経由でも「items.length ≤ total」「窓と total 独立」（#30）が保たれること。
- **手順:**
  1. 公開ノートを 1ページ表示件数より多く seed する。
  2. 公開日順で複数ページめくる。
- **期待結果:** total 件数が全ページで一貫し、各ページの表示件数が total を超えない。
- **確認ポイント:** trashed 混入ノートが total にも一覧にも出ないこと（確認項目5）。

### 3. タグ絞り込み × 公開日順の合成

- **目的:** タグ AND フィルタと公開日順が単一パスで両立し、total も整合すること。
- **手順:**
  1. 一部ノートに共通タグを付けて seed。
  2. 公開トップでタグを選択し、公開日順にする。
- **期待結果:** タグを持つ公開ノートだけが published_at 降順で並び、total もそのタグの公開ノート件数と一致。

### 4. P32 期間ファセット/検索が published_at 基準で絞り込む

- **目的:** 期間ファセット件数・公開検索の期間絞り込みが `date_for_calendar` ではなく `published_at` 基準になっていること。
- **手順:**
  1. published_at は「今日」だが date_for_calendar は「2年前」のノートを seed。
  2. `http://localhost:3000/search`（公開検索）で期間ファセットを「7日以内」「1年以内」等で切り替える。
- **期待結果:** 当該ノートは published_at（今日）に基づき「7日以内」に含まれ、「1年より前」には出ない。date_for_calendar 基準だった頃と件数が変わる。
- **確認ポイント:** ファセットの件数表示と実際の検索結果件数が一致すること。MATCH（キーワードあり）と LIKE フォールバック（短語等）の両経路で同じ期間判定になること。

### 5. trash relay ラグ中の公開ノートが total・一覧から除外される

- **目的:** `notes.status='trashed'` だが `publication_states.visibility='public'` の行が、active JOIN により一覧・total の両方から除外されること。
- **手順:**
  1. 公開ノートを trash 状態にする（outbox relay 未処理を想定し publication 行は public のまま）seed を作る。
  2. 公開トップを開く。
- **期待結果:** その trashed ノートは一覧に出ず、total にも数えられない（「total=N だが表示 N-1」が起きない）。

### 6. username prefix サジェストが case-insensitive で index 経由になる

- **目的:** `searchPublicByUsernamePrefix` が `username` 列への範囲スキャンで、大文字小文字非依存（query 側 lowercase 化）の前方一致になること。`username` は domain 上常に lowercase なので、混在ケースの query が lowercase 行にヒットする形で確認する。
- **手順:**
  1. `alice`・`alicia` 等の公開ユーザーを seed（username は lowercase のみ）。
  2. ユーザー検索/サジェストで `AL`・`al` を入力。
- **期待結果:** 双方の query で `alice`・`alicia` がヒットする。公開ノートを持たない/停止ユーザーは出ない。
- **確認ポイント:** （任意）`pnpm db:execute:local --file` で `EXPLAIN QUERY PLAN SELECT ... WHERE username >= 'al' AND username < 'am'` を流し、`SEARCH ... USING INDEX uniq_users_username` になること（`LIKE` だと SCAN）。

## エッジケース・異常系

### 1. published_at が NULL の公開ノートは listing に出ない

- **目的:** entity 不変条件（public⇒published_at 非 NULL）の防御として NULL は除外されること。
- **手順:** （異常データとして）`visibility='public'` かつ `published_at IS NULL` の行を seed し公開トップを開く。
- **期待結果:** その行は公開日順 listing に現れない（除外）。

### 2. LIKE 特殊文字を含む username prefix

- **目的:** `%`・`_` 等を含む prefix がエスケープされ誤マッチしないこと。
- **手順:** `a_b` 等を含む username を seed し、`a_` で検索。
- **期待結果:** リテラルとして扱われ、`axb` 等に誤ヒットしない。

## 既存機能への影響確認

- **既存ソート軸（更新日順/タイトル順）:** publishedAt 追加後も従来の note 列ソート（`noteRepository.listWithCount` 経由）が壊れていないこと。
- **カレンダー表示（display=calendar）:** default sort 変更後も `date_for_calendar` ベースの日付グルーピングが従来どおり動くこと。
- **既存の username 検索/タグ検索:** tags の `name_normalized` prefix 検索が回帰していないこと。
- **検索のキーワード絞り込み（期間以外）:** 期間 JOIN 追加で MATCH/LIKE のキーワード絞り込みやスコアリングが変わっていないこと。

## 確認チェックリスト

- [ ] `pnpm db:generate && pnpm db:migrate` でスキーマ変更が適用される
- [ ] P30「公開日順」が published_at 降順で並ぶ（確認項目1）
- [ ] ページ total が整合し窓を超えない（確認項目2）
- [ ] タグ × 公開日順が両立し total も一致（確認項目3）
- [ ] P32 期間ファセット/検索が published_at 基準（確認項目4・MATCH/LIKE 両経路）
- [ ] trashed 公開ノートが total・一覧から除外（確認項目5）
- [ ] username prefix が case-insensitive・index 経由（確認項目6）
- [ ] published_at NULL の除外（異常系1）
- [ ] LIKE 特殊文字エスケープ（異常系2）
- [ ] 既存ソート・カレンダー表示・タグ検索・キーワード検索の回帰なし
- [ ] `pnpm typecheck && pnpm lint:fix && pnpm format` がクリーン
- [ ] `pnpm test:unit` / `pnpm test:integration` が green
