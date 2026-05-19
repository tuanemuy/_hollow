# Issue #13 manual-test seed data

**Issue:** #13 (PR #7 残 Warning まとめ — リファクタ・規約統一)
**Test source:** `.issue/13/testing.md`
**Date:** 2026-05-19

---

## サマリー

Issue #13 のテストは **既存ユーザでログインしてホーム / 編集 / ゴミ箱 / 一括操作 / ジョブ破棄 / タグ削除 / 保存ビュー削除等を一通り操作する** ことを要求する。
プロジェクトには既に `.manual-test/2026-05-17/seed.sql` という baseline seed が整備されており、ローカル D1 にも適用済みだった。
そのままだと `existing-user` に対する **trashed ノート / publication_states / 複数ディレクトリ / 複数タグ** が不足していたため、補完 SQL（`.issue/13/manual-test/seed-supplement.sql`）を作成して投入した。

---

## 実行した準備作業

1. `package.json` / `README.md` / `CLAUDE.md` / `docs/` を確認
   - seed 専用スクリプトは無いが、`pnpm db:migrate` で `wrangler d1 migrations apply ... --local` 慣行あり
   - `pnpm wrangler d1 execute ... --file <path>` で SQL を流し込む方式
2. `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite` を直接覗いて状態確認
   - マイグレーション `0000`〜`0006` 適用済み
   - `.manual-test/2026-05-17/seed.sql` の 12 アカウントが投入済み（baseline seed が既に有効）
3. `.manual-test/2026-05-17/seed-data.md` / `reseed.sh` を読み、既存の seed 方針を踏襲することを決定
4. 不足データを洗い出し、`existing-user`（baseline の主力アカウント）に対する補完 SQL を作成
5. `pnpm wrangler d1 execute tanstack-start-template-d1 --local --file .issue/13/manual-test/seed-supplement.sql` で投入
6. 既存 baseline は **一切変更しない** 方針。投入 ID は `01938f13-...` 前置で baseline と完全分離

---

## 投入したシードデータ

すべて owner = `existing-user`（`01938f00-0000-7000-8000-0000000000a1`）に対する追加。

| テーブル | 件数 | 内訳 |
|---|---|---|
| `directories` | +1 | `Issue13 Sub`（root 配下の sub-dir, depth=1） |
| `tags` | +2 | `issue13-alpha`, `issue13-beta` |
| `notes`（active） | +2 | sub-dir 配下の `Issue13 Sub Note 1/2` |
| `notes`（trashed） | +2 | `Issue13 Trashed Note 1/2`（root 直下、status=trashed） |
| `publication_states` | +6 | 既存4 + 補完2 のアクティブノートに `public`/`unlisted`/`private` 混在で付与 |
| `note_tags` | +5 | 上記タグを既存 + 補完ノートにリンク（note_count を再計算） |

### 投入後の `existing-user` データ（テスト時に見える状態）

- **アクティブノート: 6 件**（うち public 2 / unlisted 2 / private 2、サブディレクトリ含む）
- **ゴミ箱ノート: 2 件**（`/trash` ページの動作確認用）
- **ディレクトリ: 2 件**（root + `Issue13 Sub`、Sidebar ディレクトリフィルタ用）
- **タグ: 3 件**（baseline の `gamma`（未リンク） + `issue13-alpha`（2 ノート） + `issue13-beta`（3 ノート））
- **保存ビュー: 1 件**（baseline の `Issue32 TC04 View`、削除動作テスト用）
- **Ingestion ジョブ: 2 件**（baseline の `failed-member.html` (failed) + `pending-member.md` (pending)、`/ingestion` ジョブ破棄テスト用）

これにより `testing.md` の以下のシナリオが全て検証可能:

| シナリオ | 必要データ | 充足 |
|---|---|---|
| 1-1 一括ゴミ箱（BulkActionBar）| 複数アクティブノート | ◎ (6) |
| 1-2 単体削除（NoteActions） | 任意のノート詳細 | ◎ |
| 1-3 保存ビュー削除（SavedViewsList） | `/views` に 1 件以上 | ◎ (1) |
| 1-4 ジョブ破棄（IngestionJobRow） | ingestion ジョブ | ◎ (2) |
| 1-5 ゴミ箱完全削除（TrashRowActions） | ゴミ箱ノート | ◎ (2) |
| 1-6 タグ削除（TagActions） | `/tags` にタグ | ◎ (3) |
| 2 autosave（useAutosave） | 編集可能ノート | ◎ |
| 3 validateSearch 統一 | ホーム遷移と Sidebar ディレクトリ | ◎ |
| 3-2 ディレクトリリンク filter reset | 子ディレクトリ | ◎ (Issue13 Sub) |
| 3-4 FilterBar/Toolbar/DisplayMode | tags / visibility / directory 全部別値で揃う | ◎ |
| 4 bulkVisibilityDialog | 複数ノート + publication_states | ◎ |
| 5-1〜5-3 OwnedNotesResult discriminated union | filter / search / trash 全経路 | ◎ |

---

## テストで使用するアカウント情報

baseline seed のアカウントをそのまま使用する。**Issue #13 で実際に使うのは `existing-user`**。

| 用途 | username | email | password | role |
|---|---|---|---|---|
| **メイン（推奨）** | `existing-user` | `existing@example.com` | `Password123!` | `member` |
| 管理画面確認（3-1 #7 admin リンク） | `admin-user` | `admin@example.com` | `Password123!` | `admin` |
| ログイン衝突確認用（破壊禁止） | `mailowner` | `existing-new@example.com` | `Password123!` | `member` |

`testing.md` が `test-user@example.com` 等を例示しているのは抽象的な記述。
本プロジェクトの baseline seed では `existing-user` / `existing@example.com` がメインの "テスト用ログインアカウント" として確立されているのでこれを使う。

> 既に DB にユーザ `019e3c5e-...` が `test-user@example.com` で存在するが、これは別 Issue（#32 関連）で作られた残骸でパスワードが分からない。Issue #13 では `existing-user` を使う方が確実。

### 認証

- パスワードアルゴリズム: PBKDF2-HMAC-SHA256, 600,000 iter, 16-byte salt, 32-byte key
- ハッシュは baseline seed.sql に焼き付け済み（2026-05-17 生成）
- メール認証等の追加ステップは不要（`email_verified=1` で投入済み）
- 公開サインアップフローを使わずに INSERT で済んでいる

---

## 設定した環境変数

新規設定なし。`.dev.vars` は既存のものをそのまま使用。Cloudflare Workers のローカル開発（`pnpm dev`）で `--local` D1 binding が自動で繋がる。

---

## 再投入手順

### Issue #13 補完 seed のみを再投入

```bash
pnpm wrangler d1 execute tanstack-start-template-d1 --local \
  --file .issue/13/manual-test/seed-supplement.sql
```

すべて `INSERT OR IGNORE` なので重複実行で破壊されない。`note_count` は UPDATE で再計算する。

### baseline ごとリセット（破壊的 TC 後の D4 protocol）

```bash
./.manual-test/2026-05-17/reseed.sh
pnpm wrangler d1 execute tanstack-start-template-d1 --local \
  --file .issue/13/manual-test/seed-supplement.sql
```

`reseed.sh` は baseline の 12 アカウントを DELETE → INSERT する。`01938f13-...` 系の supplemental データはこの DELETE 対象に含まれないため、cascade で連動して消える（owner_id FK の ON DELETE CASCADE）。なので再投入が必要。

> reseed.sh に supplemental の DELETE/INSERT を組み込むことも検討したが、baseline は他 Issue の TC も依存するため触らず、Issue #13 専用の追記スクリプトとして分離した。

---

## 問題・制約と回避策

### 1. ローカル D1 にすでに無関係なテストデータが残存

- `019e3c5e-...` / `019e3c62-...` の 2 ユーザは過去の TC 実行で残ったもの。パスワード不明のためログインに使えない。
- **回避策:** Issue #13 は baseline の `existing-user` を使えば全シナリオを満たせるので無視する。気になる場合は `pnpm wrangler d1 execute ... --command "DELETE FROM users WHERE id LIKE '019e3c%'"` で除去可（cascade で関連レコードも消える）。今回は本番影響皆無の検証用 DB なので clean up は省略した。

### 2. `testing.md` が `test-user@example.com` を例示している

- baseline seed のメインアカウントは `existing-user` / `existing@example.com`。
- **回避策:** 上記表で明示し、Issue #13 マニュアルテスト実行時は `existing@example.com` でログインする旨を共有。

### 3. リモート D1 には触っていない

- `wrangler.toml` に staging / production の D1 binding はあるが、CLAUDE.md と本タスクの方針に従い `--remote` 系コマンドは一切実行していない。
- **適用範囲:** ローカル D1（`.wrangler/state/v3/d1/.../*.sqlite`）のみ。

### 4. instance_settings は未投入

- baseline seed と同じ方針。サインアップ系シナリオは Issue #13 のスコープではないため不要。
- ホーム / 編集 / ゴミ箱 / 一括操作 / タグ / 保存ビュー / ジョブの全シナリオは instance_settings 無しで動く。

### 5. search_documents は未投入

- 検索シナリオ（5-2 search 経路）で FTS インデックスが必要だが、現状の seed では search_documents への INSERT は行っていない。
- **影響:** `?q=foo` のような検索で 0 件ヒットになる可能性がある。
- **回避策:** マニュアルテスト時はノート編集を 1 回行えばアプリケーション側のリポジトリ層が `search_documents` を更新する。検証実行前に `Issue13 Sub Note 1` を一度開いて軽い編集→保存しておけば検索ヒット可能（autosave のテスト 2-1 とも兼ねられる）。
- もしくは検証時に `?q=` 無しの filter 経路を主としつつ、search 経路は専用に最新ノートを 1〜2 件編集して検索可能にする運用とする。

### 6. メディア（画像等）と share_links は未投入

- 1-5（ゴミ箱完全削除）や 1-6（タグ削除）周りで cascade のテストをする場合に厳密性を求めるなら追加が必要。
- 本 Issue は UI のダイアログ置換が主目的（PR #7 残 Warning のリファクタ）で、データ完全性のテストではないため、最低限の関連レコードのみで十分と判断。

---

## 関連ファイル

- `.issue/13/manual-test/seed-supplement.sql` — 本 Issue 用補完シード
- `.issue/13/manual-test/seed-data.md` — 本ドキュメント
- `.manual-test/2026-05-17/seed.sql` — baseline seed（変更禁止）
- `.manual-test/2026-05-17/reseed.sh` — baseline 再投入スクリプト
- `app/core/adapters/d1/migrations/0000_initial.sql` 〜 `0006_admin_job_listing_indexes.sql` — 適用済み migrations
- `app/core/adapters/d1/schema.ts` — Drizzle スキーマ
