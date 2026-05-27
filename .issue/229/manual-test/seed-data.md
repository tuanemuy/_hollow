# Issue #229 — Manual Test Seed Data

## 採用した戦略: B (DB 直接 INSERT)

### 戦略選定の理由

**戦略A (本物のアップロードフロー) は不採用**。

`app/core/application/di/serverCloudflare.ts` の DI を読むと、admin が
`/admin/llm` で LLM API キーを保存していない状態では、ingestion パイ
プラインで使われる `llmProvider` / `ocrProvider` / `pdfExtractor` は
すべて `Stub*` 実装にフォールバックする (L423, L445, L471)。
`StubLLMProvider` は `structureToHtml` / `suggestMetadata` を呼ばれた
瞬間に `BusinessRuleError(UnsupportedFormat, "llm_not_implemented_in_mvp")`
を投げる (`app/core/adapters/stub/llmProvider.ts`)。

`runIngestionJob` のパイプラインは:

- `kind in {html, markdown, plain}` でも、構造化 LLM はスキップする
  ものの `suggestMetadata` は必ず呼ばれる (`runIngestionJob.ts` L224)。
- `kind in {pdfTextual, pdfScanned, image, audio, office}` も同様に
  抽出 / 構造化のいずれかで Stub に到達する。

つまり**どの kind でアップロードしても `previewing` に到達せず、
`runIngestionJob` 内の `markFailedSafely` で `failed` に落ちる**。

「破棄したジョブが取り込みキューから消える」を実機で検証するには
`previewing` か `discarded` のジョブが必要 (`discardIngestionPreview`
ユースケースは `previewing` からの遷移を期待)。LLM 鍵を投入して実フ
ロー化することも可能だが、外部キー / コスト / 時間効率の観点から
範囲外と判断し、**DB に直接 seed する戦略B** を採用した。

戦略B は `discarded` 状態を直接作るためプレビュー画面の「破棄」ボタ
ンの動作自体は別途検証する必要があるが、本 Issue の核心要件
「`getIngestionJobs` のデフォルト除外フィルタ」と「`/upload` 画面で
の表示挙動」は完全にカバーできる。

## 実行した準備作業

```bash
# 1. ローカル D1 にマイグレーション適用
pnpm db:apply:local

# 2. 既存 baseline seed (テストユーザー 12 名 / accounts / directories)
pnpm wrangler d1 execute hollow-local-d1 --local \
  --file=.manual-test/2026-05-17/seed.sql

# 3. Issue #229 用の ingestion_jobs シード (3 行)
pnpm wrangler d1 execute hollow-local-d1 --local \
  --file=.issue/229/manual-test/seed.sql

# 4. 投入結果の確認
pnpm wrangler d1 execute hollow-local-d1 --local \
  --command "SELECT id, owner_id, original_file_name, status \
             FROM ingestion_jobs ORDER BY id"
```

注: `pnpm db:execute:local -- <file>` は pnpm が `--` を吸収して
`--file` 引数が wrangler に届かないため、`pnpm wrangler d1 execute
... --file=<path>` を直接使う必要がある。

## 投入したシードデータの概要

### baseline seed (`.manual-test/2026-05-17/seed.sql`)

| テーブル | 件数 | 備考 |
|---|---|---|
| `users` | 12 | role=member×10 + admin×1 + suspended×1 |
| `accounts` | 12 | provider_id='credential', PBKDF2-SHA256 |
| `directories` | 12 | 各ユーザーのルート (parent_id=NULL) |

### Issue #229 seed (`.issue/229/manual-test/seed.sql`)

| 用途 | id | owner | status | 期待挙動 |
|---|---|---|---|---|
| User A 通常ジョブ | `01938f04-...022901` | UserA | `previewing` | キューに表示される |
| User A 破棄ジョブ | `01938f04-...022902` | UserA | `discarded` | キューから消える(核心) |
| User B 通常ジョブ | `01938f04-...022903` | UserB | `previewing` | UserA から見えない |

## テストアカウント

すべて baseline seed 由来 (`.manual-test/2026-05-17/seed.sql`)。
パスワードは全員 `Password123!` で共通 (PBKDF2-SHA256 / 600,000
iterations)。

| 役割 | email | password | user_id |
|---|---|---|---|
| User A (member) | `existing@example.com` | `Password123!` | `01938f00-0000-7000-8000-0000000000a1` |
| User B (member) | `existing-new@example.com` | `Password123!` | `01938f00-0000-7000-8000-0000000000b1` |
| Admin (参考) | `admin@example.com` | `Password123!` | `01938f00-0000-7000-8000-0000000000c1` |

サインインは `/sign-in` から email + password で実施できる。
better-auth のユーザー名ログインを使う場合は username (例:
`existing-user`) でも可。

## 投入した ingestion_jobs の id 一覧

```
01938f04-0000-7000-8000-000000022901   (UserA / previewing)
01938f04-0000-7000-8000-000000022902   (UserA / discarded)
01938f04-0000-7000-8000-000000022903   (UserB / previewing)
```

クリーンアップ:

```sql
DELETE FROM ingestion_jobs
 WHERE id LIKE '01938f04-0000-7000-8000-000000229%';
```

## 問題と対処

### 1. `pnpm db:execute:local -- <file>` が動かない

`pnpm` が `--` を `<file>` ごと吸収して `wrangler` に渡さないため、
wrangler が「`--command` か `--file` を指定せよ」と怒る。
**対処**: `pnpm wrangler d1 execute hollow-local-d1 --local --file=<path>`
を直接呼ぶ。本 seed-data.md と Phase 4 の手順書では後者を使う。

### 2. MVP Stub が ingestion パイプラインを破壊

(上記「戦略選定の理由」と重複) アップロードフローでは `previewing`
に到達できないため戦略B を採用。LLM 鍵を `/admin/llm` 経由で投入す
れば実フロー化は可能だが、本 Issue の検証範囲外。

## 後続 Phase 4 (テスト実行) の推奨手順

### 事前準備

1. 開発サーバ起動: `pnpm dev` (http://localhost:3000 で待ち受け)
2. 上記 baseline seed と issue #229 seed が両方 D1 に入っていること
   を `SELECT COUNT(*) FROM ingestion_jobs` 等で確認。

### testing.md の TC マッピング

#### TC1: 破棄したジョブがキューから消える (核心要件)

- **本来の手順** (アップロード → プレビュー → 破棄): MVP Stub のため
  実行不可。**省略**。
- **代替手順**: シード時点で既に `discarded` ジョブが入っているため、
  「`/upload` を開いた時に `discarded` のジョブが表示されない」だけ
  を確認すればよい。
- 期待結果:
  - User A でログインし `/upload` を開く。
  - キューに `issue229-userA-previewing.md` のカードが 1 件だけ表示
    される。
  - `issue229-userA-discarded.md` は表示されない。
  - DevTools コンソール / サーバログにエラーが出ていない。

#### TC2: 複数ジョブ混在時の挙動

- TC1 のシードがそのまま該当する (UserA に previewing 1 件 +
  discarded 1 件)。
- 期待結果: 表示件数が「総数 2 − 破棄 1 = 1」になる。

#### TC3: 自動テスト

- `pnpm test:integration` を実行し、`getIngestionJobs` の新規 4 ケー
  スが PASS することを確認する。**DB シードに依存しない** (テスト内
  で独立に環境を組み立てる)。

#### TC4: 静的チェック

- `pnpm typecheck && pnpm lint:fix && pnpm format` を順に実行。DB
  シードに依存しない。

#### エッジケース 1: 他人のジョブが見えない

- User B の `previewing` をシード済み (`...022903`)。
- 期待結果:
  - User A でログイン → `/upload` に User B のジョブが出ない。
  - User B でログイン → `/upload` に `issue229-userB-previewing.md`
    が 1 件だけ表示され、User A のジョブは出ない。

#### エッジケース 2: キューが空の場合

- User A のジョブをすべて消す: `DELETE FROM ingestion_jobs WHERE
  owner_id = '01938f00-0000-7000-8000-0000000000a1';` を実行後、
  `/upload` を再表示し空状態 UI を確認。
- 検証後に re-seed したい場合は本 seed.sql を再実行 (INSERT OR
  IGNORE なので既存行は触らないが、削除済みなら復元される)。

### スクリーンショット保存先

`.issue/229/manual-test/screenshots/` 配下に TC ごとに分けて保存す
る (既存ディレクトリあり)。

### 注意事項

- **戦略B では「破棄ボタンを押す → キューから消える」UI 操作は検証
  できない**。本 Issue の挙動の根拠は `getIngestionJobs` のフィルタ
  なので、自動テスト (TC3) でこの遷移パスをカバーする。
- `temp_storage_key` を持つ `previewing` ジョブはあるが、R2 には実
  バイトが置かれていない。プレビュー画面を開こうとした場合に preview
  本文の表示だけは `preview_json` から復元できるが、再生成
  (`regenerateIngestionPreview`) を試みると `tempFileStorage.get` で
  落ちる。Phase 4 のテストでは「破棄」「コミット」「再生成」のボタン
  はクリックしない方が安全。
