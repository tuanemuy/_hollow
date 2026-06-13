# Issue #654 ブラウザ検証用シードデータ

公開ページ P30 の「＋ タグを追加」chip（公開面タグサジェスト）の動作確認用シードデータ整備記録。**ローカル dev D1（`hollow-local-d1 --local`）のみ**に投入。本番・staging には一切触れていない。

## 実行した準備作業

```bash
pnpm db:migrate                                   # → "No migrations to apply"（適用済み）
node scripts/seed-public-user.mjs                 # 土台: 公開ユーザー + 基本公開ノート8件 + 公開タグ3種 + 非公開コントロール1件
node .issue/654/manual-test/seed-654.mjs          # #654 追加データ（本タスクで作成した生成スクリプト）
pnpm db:execute:local /tmp/verify-654.sql         # 検証 SELECT
```

両スクリプトとも冪等。`seed-public-user.mjs` は `01951900-...` 帯の自分の行を `DELETE` → `INSERT ... ON CONFLICT` で再構築する。追加スクリプト `seed-654.mjs` は `01951901-...` 帯の自分の行のみ `DELETE` → `INSERT OR REPLACE`。再実行しても土台側を壊さない（再実行検証済み: 公開タグ10種・公開ノート28件で安定）。

## 投入したシードデータ概要

- **ユーザー名:** `test-public-user`（表示名「公開テストユーザー」, email_verified=1 / banned=0 / deleted_at=NULL の active 著者）
- **公開ノート総数:** 28 件（active かつ visibility=public かつ published_at NOT NULL）
- **公開トップ1ページ表示件数:** 20 件（`PAGINATION_DEFAULT_LIMIT`、`app/core/presentation/pagination.ts`）。デフォルトソートは publishedAt desc。

### 公開タグ一覧（母集合 = 10種類）

`listUserPublicTags` の gate（public + active + owner-scoped, DISTINCT tags.name）で列挙される母集合:

| タグ名 | 由来 | 備考 |
|---|---|---|
| TypeScript | 土台 seed | |
| 設計 | 土台 seed | |
| 日記 | 土台 seed | |
| Rust | #654 追加 | 公開ノート（ページ1相当の新しい日付）に付与 |
| Go | #654 追加 | 同上 |
| データベース | #654 追加 | 同上 |
| テスト | #654 追加 | 同上 |
| ブラウザ | #654 追加 | 同上 |
| アーキテクチャ | #654 追加 | 同上 |
| **ページ2タグ** | #654 追加 | **ページ2の公開ノートにのみ付与（現ページ外タグ）** |

公開タグ計 **10種類 ≥ 9** を満たす（transport cap `tags.max(8)` 到達時の抑止挙動を確認できる）。

### 非公開専用タグ

- **`非公開タグ`** — visibility=private のノート「#654 非公開ノート（非公開タグ付き・表示されないはず）」にのみ付与。公開ノートには一切付けていない。公開 gate が効けば「＋ タグを追加」の母集合に**出ない**。

### 現ページ外（ページ2）に配置した公開タグ

- **`ページ2タグ`** — published_at が全公開ノート中で最古（2025-07-01）の公開ノート「#654 ページ2のノート（ページ2タグ付き）」にのみ付与。28件中 rank 28 で**ページ2**（rank 21+）に位置するため、ページ1の発見タグ chips には現れないが、母集合（＋chip）には現れるべきタグ。母集合が発見タグの上位集合であることの確認用。

### ノート構成の内訳

- 土台 seed: 公開ノート8件（2026-06-12〜2025-09-12）、非公開コントロール1件（タグなし）
- #654 追加:
  - ページ埋め公開ノート 16件（2025-08-31〜2025-08-16, タグなし）— ページ境界を越えさせるための母数
  - 公開タグ付き公開ノート 3件（2026-06-08〜11, Rust/Go・データベース/テスト・ブラウザ/アーキテクチャ）
  - ページ2公開ノート 1件（2025-07-01, `ページ2タグ` のみ）
  - 非公開タグ付き private ノート 1件（`非公開タグ` のみ）

ID 帯: 土台 `01951900-...`、#654 追加 `01951901-...`（衝突なし・全て有効な UUIDv7）。

## 検証 SELECT 結果サマリー

| 要件 | 確認内容 | 結果 |
|---|---|---|
| 3. タグ9種以上 | 公開タグ母集合の DISTINCT 件数 | **10種**（≥9 OK） |
| 2. 非公開 gate | `非公開タグ` が公開母集合に含まれるか | 0件 = **含まれない**（private ノートにのみ紐付き） |
| 1. 現ページ外タグ | `ページ2タグ` 付き公開ノートの publishedAt desc 順位 | **rank 28 / 28件 → ページ2**（ページ1=rank1-20 の外） |

公開ノート総数 28・ページサイズ 20 のため、ページ2は rank 21-28。`ページ2タグ` の唯一の宿主ノートは rank 28 で確実にページ2側。

## テスト用 URL と着目タグ

- URL: `http://localhost:<port>/u/test-public-user`（`pnpm dev` 起動時は通常 `http://localhost:3000/u/test-public-user`）
- 着目タグ:
  - **ページ2タグ** … ＋chip（母集合）には出るが、ページ1の発見タグ chips には出ないこと（AC-2: 母集合は発見タグの上位集合）。
  - **非公開タグ** … ＋chip にも発見 chips にも出ないこと（AC-3: 公開 gate）。
  - **TypeScript / 設計 / 日記 / Rust / Go / データベース / テスト / ブラウザ / アーキテクチャ / ページ2タグ** … 計10種で transport cap `tags.max(8)` 到達検証（8件選択後の追加抑止 = AC-5）。

## 問題と対処

- 特になし。`pnpm db:migrate` は既適用（"No migrations to apply"）。
- 注意点: デフォルトソート（publishedAt desc）以外（updatedAt 等）に切り替えると順位が変わるため、ページ境界の検証はデフォルトソート前提。`ページ2タグ` の宿主ノートは published_at / created_at / updated_at すべて最古（2025-07-01）に揃えているので、createdAt・updatedAt ソートでも最後尾に来てページ2側に留まる。
