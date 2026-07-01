# 実装計画 — Issue #737: harden(ingestion): 取り込み系 POST server function に CSRF 保護が無い

**Issue:** #737
**作成日:** 2026-06-30
**複雑度:** 小規模

---

## 目的

`app/components/ingestion/actions.ts` の state-changing な POST server function 群に `csrfMiddleware` を追加し、admin 系 server function と対称な CSRF（混乱した代理人）防御を備える。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | `uploadFileFn` / `commitIngestionPreviewFn` / `discardIngestionPreviewFn` / `regenerateIngestionPreviewFn` / `ownerRetryIngestionJobFn` の middleware が `[errorResponseMiddleware, csrfMiddleware]` になっている | Issue 本文「提案」 | 1 |
| AC-2 | GET 系（`getEffectiveIngestionPromptsFn` / `getIngestionQueueCountFn` / `getIngestionJobFn` / `getIngestionJobsFn`）には `csrfMiddleware` を**追加しない** | Issue 本文「GET 系は対象外」 | 1 |
| AC-3 | cross-origin POST が 403 で拒否され、same-origin POST は従来通り通る | Issue 本文「リスク」 | 1 |
| AC-4 | `pnpm typecheck && pnpm lint && pnpm test` が通る | プロジェクト品質ゲート | 2 |

## スコープ

### 含まれないもの
- `APP_URL` 設定の正しさの担保（関連 #360）。`csrfMiddleware` は `config.appUrl` と `Origin`/`Referer` を照合するため設定が前提になるが、本 Issue では設定変更は行わない。
- admin 系・他コンポーネントの CSRF 適用状況の見直し（既に適用済み）。

## 調査結果

- 関連ファイル:
  - `app/components/ingestion/actions.ts` — 変更対象。POST 5本が `.middleware([errorResponseMiddleware])` のみで無防御。
  - `app/core/presentation/csrfMiddleware.ts` — 適用するミドルウェア。`SAFE_METHODS`（GET/HEAD/OPTIONS）はスキップし、それ以外は `Origin`（fallback `Referer`）を `config.appUrl` と照合。不一致は `ForbiddenError` → 403。
  - `app/components/admin/SpeechSettingsForm/action.ts` ほか admin 系7ファイル — `.middleware([errorResponseMiddleware, csrfMiddleware])` の参照実装。
- あるべきアーキテクチャ: CLAUDE.md「Error handling」より、`errorResponseMiddleware` が `csrfMiddleware` を包む（=配列で先に来る）必要がある。state-changing な POST は CSRF 防御を備えるのが既定（admin 系で確立済み）。
- 既存実装の状態: ingestion 系 POST は admin 系と非対称（無防御）。本 Issue で対称化する。
- 依存関係: `csrfMiddleware` は `GET/HEAD/OPTIONS` をスキップするため、誤って GET に付けても実害は無いが、Issue 方針に従い POST のみへ付与する。

## 設計

CLAUDE.md「プレゼンテーション層 / Error handling」を正とする。ドメイン・ユースケース・アダプターへの影響は無く、プレゼンテーション層の横断的関心（CSRF）の配線変更のみ。

### ドメインモデルへの影響
なし（横断的関心のミドルウェア配線のみ）。

### ユースケース / アプリケーションロジック
なし。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション
`actions.ts` の POST server function 5本に `csrfMiddleware` を追加。`csrfMiddleware` は `errorResponseMiddleware` がシリアライズして 403 にするため、配列内で `errorResponseMiddleware` の**後**に置く（`[errorResponseMiddleware, csrfMiddleware]`）。admin 系と同じ並び。

## 実装ステップ

### 1. ingestion actions に csrfMiddleware を配線

- **対象ファイル:** `app/components/ingestion/actions.ts`
- **変更内容:**
  - `import { csrfMiddleware } from "@/core/presentation/csrfMiddleware";` を追加。
  - 次の POST 5本の `.middleware([errorResponseMiddleware])` を `.middleware([errorResponseMiddleware, csrfMiddleware])` に変更:
    - `uploadFileFn`
    - `commitIngestionPreviewFn`
    - `discardIngestionPreviewFn`
    - `regenerateIngestionPreviewFn`
    - `ownerRetryIngestionJobFn`
  - GET 4本（`getEffectiveIngestionPromptsFn` / `getIngestionQueueCountFn` / `getIngestionJobFn` / `getIngestionJobsFn`）は変更しない。
- **理由:** admin 系と対称な CSRF 防御を備え、cross-origin POST による意図しないジョブ作成・ノート作成・LLM 再実行（課金）を防ぐ。

### 2. 品質ゲート

- **対象:** プロジェクト全体
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format` と `pnpm test` を実行して回帰がないことを確認。
- **理由:** CLAUDE.md の作業後手順。

## リスクと注意点

- `csrfMiddleware` は `config.appUrl` と `Origin`/`Referer` を照合するため、検証環境で `APP_URL` が実アクセス URL と一致していないと正規の POST が 403 になりうる。本番/検証で設定確認が前提（#360 関連、本 Issue ではスコープ外）。
- 録音 UI（#701）は `uploadFileFn` を再利用するため、本変更で録音アップロードも CSRF 配下になる。same-origin からの正規操作には影響なし。

## テスト方針

- `app/core/presentation/__tests__/csrfMiddleware.test.ts` が `isSameOrigin` / ミドルウェア挙動を既にユニットテスト済み。ミドルウェア自体のロジックは本 Issue で変えないため、新規ユニットテストは追加せず配線変更に留める（admin 系も配線にテストを追加していない既存方針に揃える）。
- 配線の正しさは `pnpm typecheck` と手動ブラウザ検証（same-origin で従来操作が通る／cross-origin POST が 403）で担保する。
