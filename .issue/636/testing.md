# 動作確認計画 — Issue #636: 主要画面を <Suspense> ＋スケルトンで分割描画

**Issue:** #636
**作成日:** 2026-06-11

---

## 確認環境

このIssueはフロントエンド（route / RSC / 共通コンポーネント）の変更のみ。検証は開発サーバーで行う。

### 検証環境の起動

```bash
pnpm dev
```

（`vite dev --config vite.config.cloudflare.ts`。Cloudflare ランタイムをターゲットにしたローカル開発サーバー。）

自動チェック:

```bash
pnpm typecheck && pnpm lint:fix && pnpm format
pnpm test:unit
```

streaming は本番ビルドでも挙動確認する（plan.md リスク参照）:

```bash
pnpm build && pnpm start
```

（`wrangler dev` でビルド済み worker をローカル実行。）

### デプロイ方法

なし（検証環境のみで確認できる。デプロイ手順は本Issueの範囲外）。

## 確認項目

### 1. ホームの分割描画（最優先・DoD 1）

- **目的:** ホームの5系統が個別の Suspense 境界として独立解決すること。
- **手順:**
  1. devtools のネットワークスロットリング（Slow 3G 等）を有効にしてホーム `/` を初回ロードする。
  2. ヘッダー・サイドバー枠などのシェルが即描画され、①ディレクトリツリー ②保存ビュー（サイドバー）③タグチップ群 ④referencing title ⑤ノート一覧がそれぞれスケルトン → 実データに独立して置き換わるのを観察する。
- **期待結果:** シェルは即時表示。各境界が P10 モック相当のスケルトンを示し、解決順がバラバラでも他境界をブロックしない。
- **確認ポイント:** 件数見出し「N 件のノート」はノート一覧境界側でスケルトン → 実数表示。スケルトンに `aria-busy` / `role="status"` が付与されている。

### 2. 失敗の局所化（DoD 2）

- **目的:** 1系統の失敗が当該セクションのみのエラー表示に局所化されること。
- **手順:**
  1. 任意のローダー（例: `loadAllTags`）に一時的に `throw new Error("test")` を仕込む。
  2. ホームをロードする。
- **期待結果:** タグ境界のみ `SectionErrorBoundary` のエラーパネル（汎用文言＋「再読み込み」ボタン）になり、他境界は正常描画。
- **確認ポイント:** 「再読み込み」押下で `router.invalidate()` が走り、throw を外せば回復する。エラーパネルに `role="alert"`。

### 3. シェル/ページ間の局所化の組合せ

- **目的:** Sidebar（境界①②）の失敗がホーム本体に影響しないこと。
- **手順:** Sidebar 系ローダー（tree または savedViews）に一時的 throw を仕込んでホームをロード。
- **期待結果:** サイドバーの該当セクションのみエラーパネル。ホーム本体（タグ・一覧等）は正常。

### 4. 各画面のスケルトン表示（アーキタイプ確認）

- **目的:** 対象全画面で適切なアーキタイプのスケルトンが出ること。
- **手順:** スロットリングを有効にしたまま各画面に初回遷移する:
  - ノート詳細（P11: 本文→メタ→バックリンクが独立境界）
  - tags / trash / views / upload / export / exports（P18 ListPageSkeleton）
  - settings の profile / security / account-delete / prompts（P21 FormSkeleton）
  - admin の users / jobs / prompts / llm / registration / metrics（P45 AdminTableSkeleton）、design（FormSkeleton）
- **期待結果:** 各画面で静的見出しは即描画、データ依存領域のみスケルトン → 実データに置換。
- **確認ポイント:** モックとレイアウトの大きなズレがないこと。

### 5. loader 再実行時のフリッカー（plan.md 最重要リスク）

- **目的:** invalidate / ポーリング / 検索条件変更で旧コンテンツが保持され、スケルトンが点滅しないこと。
- **手順:**
  1. `/upload`（IngestionQueue）と `/exports/{jobId}` を開き、ポーリング周期中の表示を観察する。
  2. ホームで検索・タグフィルタ・ページ送りを行う。
  3. ノート作成/削除のミューテーション後（`appShellInvalidate`）にサイドバーを観察する。
- **期待結果:** いずれも旧コンテンツが保持され、スケルトンへの巻き戻りが起きない。フリッカーが出る場合は plan.md ステップ6 の段階的フォールバック（(a) startTransition ラップ → (b) handler await 維持＋Issue へスコープ調整コメント）に従う。

### 6. a11y 引き継ぎ事項

- **目的:** #636 コメントで #635 から引き継いだ2件の解消確認。
- **手順:**
  1. VoiceOver 等（または DOM 検査）で Skeleton に `label` を渡した箇所の読み上げ属性を確認。
  2. OS の「視差効果を減らす」を有効にし、Skeleton のパルスと Spinner の回転を観察。
- **期待結果:** `label` 指定時に既定 `aria-label` が重複しない。reduced-motion でパルス・スピンが静止し、Spinner は静止でも pending とわかる表示。

## エッジケース・異常系

### 1. redirect / notFound が境界外で機能すること

- **目的:** SavedView 正規化 redirect（ホーム）、ノート詳細の not-found、exports/$jobId の存在確認が従来どおり動くこと。
- **手順:** 不正な viewId 付き URL でホームへ、存在しない noteId / jobId の URL へアクセス。
- **期待結果:** 従来どおり redirect / 全画面エラー（`errorComponent`）。スケルトンのまま固まらない。

### 2. 未認証アクセス

- **目的:** auth fail-safe が handler 側で機能すること。
- **手順:** ログアウト状態で `/`・`/admin/users` 等にアクセス。
- **期待結果:** 従来どおりログインへリダイレクト（境界内エラーにならない）。

## 既存機能への影響確認

- ミューテーションの pending 可視化（#635 の成果）: タグ作成・ノート操作等の pending 表示が分割後も従来どおり動くこと。
- ノート一覧の選択（SelectionProvider）: チェックボックス選択 → BulkActionBar の操作が Suspense 分割後も機能すること。
- `staleTime: POSITIVE_INFINITY` の settings 系: 2回目以降のナビゲーションでスケルトンが出ない（キャッシュ再利用）こと。
- 既存ユニットテスト（`index.loaderDeps.test.ts` 等）が通ること。

## 確認チェックリスト

- [ ] ホーム5系統が独立解決（スロットリング下）
- [ ] 1系統の失敗が当該セクションに局所化＋リトライで回復
- [ ] Sidebar 失敗がホーム本体に波及しない
- [ ] 対象全画面でアーキタイプ・スケルトン表示
- [ ] ポーリング / invalidate / 検索変更でフリッカーなし
- [ ] a11y 2件（二重読み上げ解消・reduced-motion）
- [ ] redirect / notFound / 未認証が従来どおり
- [ ] 既存機能（pending 表示・選択操作・settings キャッシュ）に影響なし
- [ ] `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test:unit` 通過
- [ ] `pnpm build && pnpm start` で本番ビルドの streaming 確認
