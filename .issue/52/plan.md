# 実装計画 — Issue #52: saved_views seed の query_json 構造とリポジトリデコーダの不整合（renderHome が 500 を返す）

**Issue:** #52
**作成日:** 2026-05-20
**複雑度:** 小規模

---

## 目的

`saved_views` 行を持つユーザーでホーム `/` を開いたときに `renderHome` が 500 を返さないようにする。原因は manual-test 用 seed.sql の `saved_views.query_json` / `sort_json` が現行ドメイン (`ViewQuery` / `ViewSort`) と異なる古いキー名・ネスト構造で書かれていることなので、シード側を現行形に揃える。

## 「正」の確定

`encodeQueryJson` / `decodeQueryJson` (`app/core/adapters/d1/repositories/savedViewRepository.ts`) と `ViewQuery` (`app/core/domain/view/valueObject.ts`) を読み合わせた結果、保存形式は次のフラット構造で一致している。シードだけがズレている。

- `query_json`: `{ directoryId, tagIds, dateRange, keyword, referencingNoteId, visibilityFilter }`
  - `dateRange` は `null` または `{ from: ISO|null, to: ISO|null }`（`null` でないなら少なくとも一方は文字列）
  - `tagIds` は **TagId 配列**（タグ名ではない）
  - `visibilityFilter` は `PublicationVisibility[]`
- `sort_json`: `{ by, direction }`（`field`/`order` ではない）

よって **方針 (A) シードを書き直す** を採用する。`SavedViewName` の制約も 1..60 文字でクリア、`DateRange` は `null` なら問題なし。

## スコープ

### 含まれるもの

- 4 つの seed.sql の `saved_views` ブロックの修正
  - `.issue/1/manual-test/seed.sql`
  - `.issue/8/manual-test/seed.sql`
  - `.issue/29/.manual-test/seed.sql`
  - `.issue/30/manual-test/seed.sql`
- `query_json` のキー: `filters.tagNames` → トップレベル `tagIds`（タグ ID 配列に変換）、`filters.q` → `keyword`、`filters.visibility` → `visibilityFilter`（配列）、`filters.from`/`to` → `dateRange` (`null` で OK)、`referencingNoteId` を追加（`null`）
- `sort_json` のキー: `field`/`order` → `by`/`direction`
- 既存の説明コメントも現行のキー名に合わせて修正

### 含まれないもの

- `decodeQueryJson` / `encodeQueryJson` 側の変更（書き込み・読み込み・ドメインで一致しているため正）
- `.issue/12/manual-test/seed.sql` の `view_query_json`（これは `research_sessions` テーブルの別カラムで、Issue #52 のスコープ外）
- 本番マイグレーション。本番 DB に該当行が存在しないことが前提（manual-test 専用シードのみが影響）

## 実装ステップ

### 1. 4 ファイルの saved_views ブロックを書き直す

- **対象ファイル:**
  - `.issue/1/manual-test/seed.sql`
  - `.issue/8/manual-test/seed.sql`
  - `.issue/29/.manual-test/seed.sql`
  - `.issue/30/manual-test/seed.sql`
- **変更内容:**
  - `query_json` を以下の形に置き換える
    ```json
    {
      "directoryId": null,
      "tagIds": ["01938f00-0000-7000-8000-00000000a071", "01938f00-0000-7000-8000-00000000a075"],
      "dateRange": null,
      "keyword": null,
      "referencingNoteId": null,
      "visibilityFilter": []
    }
    ```
    （`work` = `...a071`、`todo` = `...a075` — seed の tags ブロックで定義されている TagId）
  - `sort_json` を `{"by":"updatedAt","direction":"desc"}` に変更
  - コメントを「queryJson の形は `domain/view/valueObject.ts` の `ViewQuery` に準拠 (タグ ID ベース、フラット構造)」に更新
- **理由:** 書き込み・読み込み側がフラット構造のため、シードを現行形に合わせるとデコーダが通り、`renderHome` が 200 を返せるようになる

## 設計判断

- **(A) シード書き直し vs (B) デコーダ修正の選択:** 書き込み (`encodeQueryJson`) も読み込み (`decodeQueryJson`) もドメイン型 (`ViewQuery`) もすべてフラット構造で一致している。シードだけが古い形式なので、シードを書き直すのが「コードと真実を一致させる」最小修正。ADR には残さない（自明）。
- **tagIds の値:** シードの tags 定義から `work` / `todo` の TagId を引いて使う。タグ名から ID を引く動的解決は SQL では難しく、ハードコードで十分（シードは固定 UUID で安定している）。

## リスクと注意点

- 4 ファイルすべて完全に同じ saved_views ブロックなので、書き換え漏れがないようにする
- 該当行を持つ既存の local D1 がある場合は `DELETE FROM saved_views;` で消してから再シードする必要があるかもしれない（または `wrangler d1 execute` の `--local` を別の DB に切り替える）

## テスト方針

- 4 つの seed のいずれかを `pnpm db:execute:local --file=<seed.sql>` で投入
- `pnpm dev` を起動
- `test-user-001@example.com` でログインしてホーム `/` を開く → 200 が返り、saved_view 関連 UI（保存ビュー欄など）が正常表示されることを目視確認
