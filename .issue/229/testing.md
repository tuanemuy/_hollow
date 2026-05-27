# 動作確認計画 — Issue #229: 破棄したアップロードジョブを取り込みキューに残さない（既定で非表示）

**Issue:** #229
**作成日:** 2026-05-27

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm db:apply:local
pnpm dev
```

- `db:apply:local` — ローカル D1 にマイグレーションを適用（`wrangler d1 migrations apply hollow-local-d1 --local`）
- `dev` — Cloudflare runtime ターゲットの開発サーバを起動（`vite dev --config vite.config.cloudflare.ts`）

シードデータは manual-test スキルが手配する（既定の baseline seed を流す）。テスト用アカウントは seed の規定に従う。

### デプロイ方法

なし（検証環境のみで確認できる）。本Issueの変更はUIの取り込みキュー表示挙動とusecase層のフィルタのみで、マイグレーション・キュー設定・ワーカー設定の変更はない。

## 確認項目

### 1. 破棄したジョブがキューから消える（核心要件）

- **目的:** Issue完了条件「破棄したジョブが既定で取り込みキューに表示されない」を実機で確認する。
- **手順:**
  1. 一般ユーザーでログインする。
  2. `/upload` を開き、ファイル（PDF や画像など）をアップロードする。
  3. プレビュー画面に遷移したら、「破棄」ボタンを押す。
  4. `/upload` を再表示する（リダイレクトされない場合は手動で再アクセスする）。
- **期待結果:**
  - 破棄したジョブが「取り込みキュー」一覧に表示されない。
  - キュー件数が破棄前と比べて1件少なくなっている。
- **確認ポイント:**
  - DevTools コンソールおよびサーバログに新規のエラーが出ていない。
  - `previewing` / `pending` / `processing` / `done` 等、`discarded` 以外のステータスのジョブは引き続き表示される。

### 2. 複数ジョブ混在時の挙動

- **目的:** 「破棄済みのみ消える」を担保する（他ステータスは消えない）。
- **手順:**
  1. 同一ユーザーで複数ファイルをアップロードする（少なくとも2件以上）。
  2. 一部のジョブだけ「破棄」する（例: 1件破棄、1件はプレビュー保持）。
  3. `/upload` を再表示する。
- **期待結果:**
  - 破棄したジョブは消え、保持中のジョブは引き続き表示される。
- **確認ポイント:**
  - キュー件数が「アップロード総数 − 破棄数」と一致する。

### 3. 自動テスト（`pnpm test:integration`）

- **目的:** Issue完了条件「単体テストでフィルタ挙動を担保」を確認する。
- **手順:**
  1. `pnpm test:integration` を実行する。
- **期待結果:**
  - `getIngestionJobs` の新規追加4ケースすべてが PASS する:
    - `excludes discarded jobs by default`
    - `includes discarded jobs when includeDiscarded is true`
    - `returns only discarded when status is "discarded"`
    - `does not exclude discarded when status is explicitly set to non-discarded`（include 優先契約の回帰）
  - 既存テスト（`returns only the actor's jobs` 等）も引き続き PASS。
- **確認ポイント:**
  - 全テスト件数が前回比で4件増えていること（既存テストを誤って改変していない確認）。

### 4. 静的チェック

- **目的:** CLAUDE.md 規定の品質ゲート確認。
- **手順:**
  1. `pnpm typecheck` を実行する。
  2. `pnpm lint:fix` を実行する。
  3. `pnpm format` を実行する。
- **期待結果:** すべてエラーなく完了する。
- **確認ポイント:**
  - 新規追加した `excludeStatuses` フィールドが型レベルで正しく扱われている。

## エッジケース・異常系

### 1. 他人のジョブが見えない既存挙動が維持される

- **目的:** デフォルト除外条件追加が「所有者一致」の認可フィルタを壊していないことを確認。
- **手順:**
  1. ユーザーAでアップロード → 破棄、別ジョブを作って保持。
  2. ユーザーBでログインし `/upload` を開く。
- **期待結果:**
  - ユーザーBの画面にユーザーAのジョブ（discarded か否かに関わらず）が表示されない。
- **確認ポイント:**
  - 既存統合テスト `returns only the actor's jobs` の意図が実機でも維持されていること。

### 2. キューが空の場合の表示

- **目的:** 全ジョブを破棄した結果キューが空になっても画面が壊れないことを確認。
- **手順:**
  1. すべてのジョブを破棄する。
  2. `/upload` を再表示する。
- **期待結果:**
  - 取り込みキューが空状態として正常に表示される（既存の空状態 UI と同じ）。
- **確認ポイント:**
  - エラーオーバーレイや 500 が出ない。

## 既存機能への影響確認

- **`/upload`(`UploadPage`):** 取り込みキュー一覧から `discarded` が消える以外の表示変更はない。アップロードフォーム・他ステータスのカード表示は変わらない。
- **プレビュー画面（`discardIngestionPreview` 経由）:** 「破棄」ボタンの動作自体は変わらない（status を `discarded` に更新するのみ）。
- **DB / マイグレーション:** スキーマ変更なし。既存データへの影響なし。
- **他の `findByOwner` 呼び出し元:** `findByOwner` は `getIngestionJobs` 経由でのみ呼ばれており、他経路への影響はない。`findRecent` / `findStuck` の admin 動線は別シグネチャで未変更。

## 確認チェックリスト

- [ ] 破棄したジョブが `/upload` の取り込みキューから消える
- [ ] 複数ジョブ混在時、破棄したものだけが消える
- [ ] `pnpm test:integration` の新規4ケースすべてが PASS
- [ ] `pnpm test:integration` の既存テスト（`returns only the actor's jobs` 等）が引き続き PASS
- [ ] `pnpm typecheck` がエラーなく完了する
- [ ] `pnpm lint:fix` がエラーなく完了する
- [ ] `pnpm format` がエラーなく完了する
- [ ] 他人のジョブが表示されない（既存の所有者フィルタが維持されている）
- [ ] すべて破棄してもキューが正常に空状態で描画される
- [ ] DevTools コンソール / サーバログに新規エラーが出ていない
