# 動作確認計画 — Issue #46: noteRepository.findReferrers 結果上限制御

**Issue:** #46
**作成日:** 2026-06-01

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

ソース変更を反映した状態で確認するには、ビルド → wrangler dev の順で起動する（`pnpm start` = `wrangler dev` は dist/worker を配信するため、先に build が必要）。

```
pnpm build
pnpm start
```

開発中の hot-reload で UI を確認するだけなら:

```
pnpm dev
```

自動テスト:

```
pnpm test:unit
pnpm test:integration
```

### デプロイ方法

本 Issue は検証環境（ローカル wrangler dev / vite dev）で確認できる。ステージング反映が必要な場合は既存の `pnpm deploy:staging`。本 Issue の確認自体には不要。

## 確認項目

### 1. 詳細ページのバックリンク preview が top-N に絞られる

- **目的:** inline backlinks リストが preview 件数（`BACKLINK_PREVIEW_LIMIT` = 5）で頭打ちになり、全件描画されないこと。
- **手順:**
  1. ログインし、あるノート T を作成。
  2. T を `[[T のタイトル]]` で参照するノートを 6 件以上作成（リンクが解決され referrer になる）。
  3. T の詳細ページを開く。
  4. 下部「バックリンク」section の inline リスト件数を数える。
- **期待結果:** inline リストは最大 5 件のみ表示される。
- **確認ポイント:** リストが referrer 全件ではなく 5 件で止まること。

### 2. 件数表示が総数（preview 上限超）を正しく示す

- **目的:** フッターの「このノートを参照しているノート一覧を見る（{N} 件）」が preview 件数ではなく referrer 総数を示すこと。
- **手順:**
  1. 上記 1. の状態（referrer 6 件以上）で T の詳細ページを開く。
  2. フッターリンクの「（{N} 件）」を確認。
- **期待結果:** N が referrer 総数（例 6）を示し、5 で頭打ちにならない。
- **確認ポイント:** inline 5 件に対し件数表示は 6 以上であること（preview と総数が独立）。

### 3. 「一覧を見る」導線で全 referrer にアクセスできる

- **目的:** preview に出ない referrer もフッター導線（home の referencingNoteId フィルタ、ページネーション済み）で辿れること。
- **手順:**
  1. 上記の状態でフッターリンクをクリック。
  2. home の参照元一覧（referencingNoteId フィルタ）に遷移。
- **期待結果:** referrer がページネーションされて全件閲覧でき、件数も一致する。

### 4. backlink snippet が従来どおり表示される

- **目的:** preview に出る各 backlink の title / snippet が従来どおり表示されること（DTO 形状不変）。
- **手順:**
  1. referrer ノートに本文を持たせ、T の詳細ページの backlink リストを確認。
- **期待結果:** title とその下に本文 head の snippet が 2 行表示される。

## エッジケース・異常系

### 1. referrer 0 件

- **目的:** referrer が無いノートで「なし」表示と「（0 件）」が正しいこと。
- **手順:** どこからも参照されていないノートの詳細ページを開く。
- **期待結果:** inline は「なし」、フッターは「（0 件）」。

### 2. trashed な referrer の扱い

- **目的:** ゴミ箱に入れた referrer も件数・preview の母集合に含まれること（status スコープ一致）。
- **手順:**
  1. T を参照するノートを作成し、その参照元ノートをゴミ箱へ移動。
  2. T の詳細ページで件数と inline を確認。
- **期待結果:** trashed referrer も件数に数えられ、preview にも（上限内なら）現れる。inline と件数で母集合がズレない。

## 既存機能への影響確認

- **export 機能**: `referencingNoteId` を含む view scope の export ジョブが、参照元全件を対象に正しく絞り込めること（findReferrers の opts 省略パスが全件を返す後方互換）。export ジョブを 1 件流して対象ノート数が変わっていないことを確認。
- **getBacklinks**: UI 未使用だが、export view と DTO を共有しているため export 出力の backlink 表現が壊れていないこと。
- **home の referencingNoteId フィルタ一覧**: 従来どおりページネーションされ件数が正しいこと（`countByOwner`/`listWithCount` 経路は無変更）。

## 確認チェックリスト

- [ ] 詳細ページ inline backlinks が最大 5 件に絞られる
- [ ] 件数表示が referrer 総数（preview 上限超）を示す
- [ ] フッター導線で全 referrer にアクセスできる
- [ ] backlink の title / snippet が従来どおり表示される
- [ ] referrer 0 件で「なし」「（0 件）」
- [ ] trashed referrer が件数・preview の母集合に含まれる（ズレない）
- [ ] export ジョブの referencingNoteId 絞り込みが全件で機能する
- [ ] `pnpm test:unit` / `pnpm test:integration` が green
