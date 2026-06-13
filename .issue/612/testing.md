# 動作確認計画 — Issue #612: 公開プロフィールの publicNoteCount が trashed-but-public を過大カウント

**Issue:** #612
**作成日:** 2026-06-13

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。本 Issue は **DB スキーマ変更なし**（read-only count メソッドの追加のみ）。新規マイグレーションは不要だが、ローカル D1 が未初期化なら既存マイグレーションの適用が必要。

### マイグレーション適用（既存スキーマの初期化のみ。本 Issue では新規生成なし）

```bash
pnpm db:migrate     # 既存マイグレーションをローカル D1 (hollow-local-d1) に適用
```

- 本 Issue はスキーマ変更を含まないため `pnpm db:generate` は不要。

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

本 Issue は relay-lag 中の **trashed-but-public 行**（`publication_states.visibility='public'` のまま `notes.status='trashed'`）を再現しないと差分が見えない。`pnpm db:execute:local --file <seed.sql>` で次の状態を作る:

- 同一ユーザー（公開プロフィールを開く対象）の公開ノートを複数件用意（`publication_states.visibility='public'` かつ `published_at` 非 NULL、`notes.status='active'`）。
- そのうち 1 件を「trashed-but-public」にする: `notes.status='trashed'` に更新しつつ `publication_states.visibility='public'` / `published_at` 非 NULL のまま残す（relay 前のラグ状態を模す）。
- 比較用に `published_at` が NULL の公開行や private / unlisted の行も混ぜておくと、除外条件の確認が一度にできる。

### 自動テスト（adapter レベルの検証）

```bash
pnpm test:integration    # D1 integration test（countPublicByOwner を含む）
```

### デプロイ方法

なし（検証環境のみで確認できる）。ステージング反映が必要な場合のみ `pnpm db:apply:staging`（本 Issue はスキーマ変更なしのため実質不要）→ `pnpm deploy:staging`。

## 確認項目

### 1. ヒーロー件数が trashed-but-public を除外する（live 件数）

- **対応する受け入れ基準:** AC-1
- **目的:** `publicNoteCount` が relay-lag 中の trashed-but-public 行を含まず、active な公開ノートだけを数えること。
- **手順:**
  1. シードで active+public な公開ノートを 4 件、trashed-but-public な行を 1 件用意する。
  2. `http://localhost:3000/u/{username}` を開く。
  3. ヒーローヘッダーの公開ノート件数を確認する。
- **期待結果:** ヒーロー件数が **4**（trashed-but-public の 1 件を除外）。修正前は 5 と過大表示されていた。
- **確認ポイント:** trashed にした行の `publication_states` は public のまま残っていること（relay 前を再現できているか）。

### 2. ヒーロー件数と一覧件数（listing total）が一致する

- **対応する受け入れ基準:** AC-2
- **目的:** 同一公開トップページで `publicNoteCount`（ヒーロー）と listing `total`（`listUserPublicNotes`）が、**デフォルト経路（公開日順・タグ/期間フィルタ無し）の全件比較**で一致すること。
- **手順:**
  1. 確認項目 1 と同じ seed 状態（trashed-but-public 混在）で `http://localhost:3000/u/{username}` を開く。
  2. ヒーローの件数と、一覧（ノートカード）の件数・listing の総件数表示を見比べる。
- **期待結果:** ヒーロー件数 == 一覧の総件数（どちらも trashed-but-public を除外した同値）。
- **確認ポイント:** タグや期間でフィルタした状態では、ヒーロー件数（全件 count）と listing total（フィルタ後 count）は一致しないのが**仕様どおり**。一致を確認するのはフィルタ無しのデフォルト経路でのみ。

### 3. 公開ノート 1000 件超でも頭打ちにならない（任意・大規模 seed）

- **対応する受け入れ基準:** AC-3
- **目的:** 旧実装の `limit: 1000` による件数頭打ちが解消され、実件数を返すこと。
- **手順:**
  1. 同一ユーザーに active+public な公開ノートを 1000 件超（例: 1005 件）seed する（`db:execute:local` の一括 INSERT）。
  2. `http://localhost:3000/u/{username}` を開く。
- **期待結果:** ヒーロー件数が 1005（1000 で頭打ちにならない）。
- **確認ポイント:** 大量 seed が重い場合はこのケースを省略し、ステップ 5 の integration test（COUNT に limit が無いこと）で代替してよい。

## エッジケース・異常系

### 1. 公開ノートゼロのユーザー

- **目的:** 公開ノートが 1 件も無いユーザーで件数が 0 になること。
- **手順:**
  1. 公開ノートを持たない（または全件 private の）ユーザーの `http://localhost:3000/u/{username}` を開く。
- **期待結果:** ヒーロー件数 0。エラーにならない。

### 2. 他ユーザーの公開ノートが混入しない

- **目的:** owner スコープが効いており、別ユーザーの公開ノートを数え込まないこと。
- **手順:**
  1. ユーザー A・B それぞれに公開ノートを用意する。
  2. A の公開トップを開く。
- **期待結果:** A の件数に B の公開ノートが含まれない。

## 既存機能への影響確認

- **アカウント削除（deleteAccount）:** `findPublicByOwner` は不変更のため、アカウント削除時に trashed-but-public 行も含めて全公開行が private に flip される掃除挙動が変わらないこと。退会フローを実行し、退会後に当該 owner の `publication_states` に public 行が残らないことを確認する（trashed だった行も private 化されること）。
- **関連ノート表示（listRelatedPublicNotes / P31）:** `findPublicByOwner` 不変更のため、ノート詳細ページ下部「同じ著者の他のノート」の表示件数・並びが変わらないこと。
