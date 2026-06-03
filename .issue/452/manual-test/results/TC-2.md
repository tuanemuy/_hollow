# TC-2: `/media/<mediaId>` への直接アクセスで presigned URL へ 302 リダイレクト

**結果:** 閲覧（inline）= PASS / ダウンロード（`?download=1`）= **FAIL（実装バグ検出）**

## 目的
所有者として `/media/<mediaId>` にアクセスし、presigned URL（R2）へ 302 リダイレクトされること。実体バイト取得は R2 ローカルエミュレーション制約により対象外。

## 操作ログ

| # | URL | 期待 | 結果 |
|---|-----|------|------|
| 1 | `/media/019e8e81-...452`（inline/閲覧） | 302 → presigned R2 URL | **OK** 302 → `https://<acct>.r2.cloudflarestorage.com/hollow-local-objects/<owner>/source/<mediaId>?X-Amz-...`（host のみ署名、content-disposition なし＝inline） |
| 2 | 同上、R2 へ追従後 | （環境制約）実体取得 | R2 が `NoSuchKey` を返す（ローカルにオブジェクト実体なし＝想定どおりの環境制約） |
| 3 | `/media/019e8e81-...452?download=1`（ダウンロード） | 302 → attachment 付き presigned URL | **FAIL** HTTP **500**。エラー画面「メディアを取得できません」表示 |
| 4 | `/media/...?download=true` | 302 | OK（boolean ブランチ一致） |
| 5 | `/media/...?download="1"`（クォート文字列） | 302 | OK（`z.literal("1")` 一致） |
| 6 | `/media/...?download=1`（裸の 1） | 302 | **500**（再現） |

## 検証メモ（fetch redirect:manual で確認）
- inline: `status:0 type:opaqueredirect`（= 302）
- download=1: `status:500 type:basic`

## 実装バグ（根本原因）

UI（`NoteMetaPanel.tsx:159`）が生成する「ダウンロード」リンク `/media/<id>?download=1` を**クリックすると HTTP 500 になり、ダウンロードできない**。

- TanStack Router のデフォルト検索パーサは検索値を JSON パースするため、裸の `?download=1` は**文字列 `"1"` ではなく数値 `1`** になる。
- ルート `app/routes/media/$mediaId.tsx` の `mediaSearchSchema` は
  `download: z.union([z.boolean(), z.literal("1"), z.literal("0")])` で、
  **数値 `1` をどのブランチも受け付けない** → `validateSearch` が Zod `invalid_union` を throw → 500。
- 500 HTML 内に埋め込まれていた実際のエラー:
  `invalid_union` / `expected boolean, received number` / `expected "1"` / `expected "0"`。

つまり「閲覧」（検索パラメータなし）は通るが、「ダウンロード」（`?download=1`）は UI が出すそのままの形で必ず 500 になる。**環境制約ではなく実装バグ**。

### 修正方針（参考・本テストでは未修正）
- ルートスキーマで数値 `1`/`0` も受理する（例: `z.union([z.boolean(), z.literal(1), z.literal(0), z.literal("1"), z.literal("0")])` または `z.coerce` 系）か、
- リンク側を `?download=true`（boolean ブランチに一致）に変える、
- あるいは `validateSearch` に `z.number()` 分岐を足す。

## スクリーンショット
- `screenshots/TC2-media-302-presigned-r2.png`（inline 302 → R2 NoSuchKey）
- `screenshots/TC2-BUG-download1-500.png`（download=1 の 500 エラー画面）

## 判定
- inline 経路（閲覧）: 302 → 正しい presigned URL。**PASS**（実体取得失敗は R2 ローカル制約）。
- download 経路（ダウンロード）: UI のリンク形 `?download=1` で **500。FAIL（実装バグ）**。
