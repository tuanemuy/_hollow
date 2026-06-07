# ブラウザ検証レポート — Issue #541

**Issue**: #541 領域2「取り込み・書き出し」(P13/P15/P16) のモック実装追従
**実行日時**: 2026-06-07
**テストソース**: `.issue/541/testing.md`
**サーバー**: http://127.0.0.1:3000（`pnpm dev`）

## 結果概要

7 テストケース中 **6 PASS / 1 FAIL**。FAIL の 1 件（TC-004）は実装バグではなく testing.md の前提誤りで、ドキュメントを実装に合わせて修正済み。**実装バグはゼロ、起票した Issue はなし**。

## 検証できたこと

### P13 アップロードのクライアント検証バナー（#539 委譲分）
- 未対応形式（`.zip`）を選択すると送信前に `.alert-error`「対応外の形式が含まれています」が出て、ファイル名が `<code>` 表示、アップロードは開始されない（TC-001）。
- 50 MB 超ファイルで `.alert-warning`「サイズ超過のファイル」が出て、`large.md (50.5 MB)` が `<code>` 表示、送信されない（TC-002）。
- ヘッダー「アップロード」モーダルの SelectView でも同じ検証バナーが出て、進捗ビューへ遷移しない（TC-003、ADR-004 の意図どおり）。
- error/warning のセマンティックアクセント（`--color-error` / `--color-warning`）が正しく出し分けられている。

### P15 エクスポートの非同期推奨バナー（#539 委譲分）
- bulk で件数 51 > 50 のとき、メディア OFF でも `.alert-info`「非同期ジョブを推奨します」が出て「選択中の 51 件」と表示（TC-005）。
- bulk・3 件・メディア OFF では非表示（TC-006）。
- single（`/notes/$noteId/export`）では非表示（TC-007）。
- accent は `oklch(37.1% 0 0)`（chroma 0 = 無彩色グレー、青を足していない。index.md の info 原則どおり）。role=note、code「エクスポートジョブ一覧」も仕様一致。

## TC-004 の詳細（FAIL → ドキュメント修正で解消）

- **期待（手順書の旧前提）**: embedMedia 初期値 true なので `/export` を開いた初期（0件）でバナーが出る。
- **実際**: 対象 0 件ではバナーは出ない。1 件以上入力すると条件成立で即表示。
- **原因**: 実装の発火条件に `bulkCount > 0` が含まれる（`ExportForm/index.tsx` L163-166）。「選択ゼロなら推奨しない」という妥当な実装。
- **対処**: testing.md の確認項目・エッジ記述と ADR-003 を「対象 1 件以上 + （件数>50 または embedMedia ON）」に修正。Issue 起票なし。

## 環境メモ（次回 QA 向け）

1. **`localhost` ではなく `127.0.0.1` を使う**。別プロジェクト peek が `[::1]:3000`（IPv6）で同時 LISTEN しており、macOS は `localhost` を `::1` に解決するため `localhost:3000` は peek にヒットして全ルート 404。hollow3 は IPv4 `*:3000`。
2. **検証前に `pnpm seed:dev-admin`** でローカル D1 に admin セッションを投入（未投入だと `_app` 配下が未認証で 404）。
3. **バナーのセレクタ**: literal `.alert-info` ではなく Tailwind arbitrary utility（`[--alert-accent:var(--color-info)]`）。判定は `[role=note]` + テキストで行う。

## 成果物
- 結果: `.issue/541/manual-test/results/TC-001.md` 〜 `TC-007.md`、`summary.md`
- スクリーンショット: `.issue/541/manual-test/screenshots/tc-001/` 〜 `tc-007/`
- シード: `.issue/541/manual-test/seed-data.md`
- サーバー情報: `.issue/541/manual-test/server-info.md`
