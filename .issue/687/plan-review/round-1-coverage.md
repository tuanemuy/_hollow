# Plan Review — Issue #687 / Round 1

**視点:** Issue の要件カバレッジ・スコープ整合性
**対象:** `.issue/687/plan.md`, `.issue/687/adr.md`
**日付:** 2026-06-13

## 検証サマリー（要件トレーサビリティ）

### Issue スコープ6項目 → plan の対応

| Issue スコープ項目 | plan AC | plan ステップ | 判定 |
|---|---|---|---|
| `release-please-config.json` 追加 | AC-1/2/3 | S2 | OK |
| `.release-please-manifest.json` 追加 | AC-6 | S3 | OK |
| `package.json` に `version` 追加 | AC-6 | S1 | OK |
| `release-please.yml` 追加 | AC-1/2/4 | S4 | OK |
| 生成タグ ↔ `deploy-production.yml` の `v*.*.*` / branch policy 一致確認 | AC-3 | S6 | OK |
| `docs/deployment_setup.md` 更新 | AC-7 | S7 | OK |

### Issue 受け入れ条件5項目 → plan AC

| Issue 受け入れ条件 | plan AC | 判定 |
|---|---|---|
| feat/fix 起点で常時1本のリリースPR自動作成・更新 | AC-1 | OK |
| マージで vX.Y.Z タグ + Release 生成、Deploy(production) 自動起動 | AC-2 / AC-3 | OK |
| main へ bump 直接コミットが発生しない（保護両立） | AC-4 | OK |
| Release/ノートの生成元一本化・二重作成なし | AC-5 | OK |
| `docs/deployment_setup.md` が新フローに更新 | AC-7 | OK |

### ユーザー決定済み未決事項3つ → plan 反映

| 決定事項 | plan 反映箇所 | 判定 |
|---|---|---|
| 0.1.0 始まり | AC-6, S1, S3, ADR-003。`release-as`/`bootstrap-sha` 不使用をスコープ除外に明記 | OK |
| squash 統一 | AC-8, S7, ADR-003 | OK |
| workflow_dispatch fallback 残さない | スコープ「含まれないもの」+ S4「追加しない」明記。既存 deploy-production の `workflow_dispatch` は別物としてスコープ外温存と区別済み | OK |

### コード照合（plan の調査結果の正確性）

- `package.json` に `version` フィールドが欠落 → 実ファイルで確認（L1-4 に version なし）。OK
- `deploy-production.yml` の `Generate release notes`（`softprops/action-gh-release@v2`, `generate_release_notes: true`）→ 実ファイル L153-160 に存在。plan の行番号記載と一致。OK
- `deploy-production.yml` の `on.push.tags: ["v*.*.*"]` + `workflow_dispatch` + `environment: production` → 実ファイル L3-7, L23-27 で確認。OK
- `docs/deployment_setup.md` リリース節が `pnpm version patch && git push --follow-tags` → 実ファイルで確認。OK
- `README.md` Release flow 節（`pnpm version` + 「creates a GitHub Release with auto-generated notes」）→ 実ファイル L137-145 で確認。OK

「Generate release notes 削除」は S5 で「末尾の `Generate release notes`（L153-160）ステップ全体を削除」と明示され、AC-5 と紐付き、テスト方針 AC-5 で「deploy ログに Release 作成ステップが無いこと」を検証手段まで定義。確実にカバーされている。

## 問題点（要修正）

問題点ゼロ。

Issue 本文で合意されたスコープ6項目・受け入れ条件5項目・決定済み未決事項3つは、すべて plan の AC とステップに漏れなく落ちている。各 AC は「由来」「対応ステップ」列を持ち、検証可能な文言（タグ形式 `vX.Y.Z`、`package.json` と manifest が `0.1.0` で一致、deploy ログに Release ステップなし 等）で記述され、テスト方針の実地検証項目にも AC 単位で対応づいている。スコープ外作業の紛れ込みもなく、むしろ「含まれないもの」節で `release-as`/`bootstrap-sha`・CHANGELOG 手書き初期化・`deploy-staging.yml`/`ci.yml` 不変更・`workflow_dispatch` 不追加を明示的に除外しており、スコープ境界が明確。

## 改善提案（検討推奨）

- **[S-001]** README 更新が Issue 本文の明記なしにスコープへ含まれている件 — 妥当だが AC への根拠付けを一段強くできる
  - 理由: README の Release flow 節は `deploy-production.yml` が「creates a GitHub Release with auto-generated notes」と記述しており、S5 で Release 所有を release-please へ一本化した後はこの記述が**実装と矛盾する虚偽記述**になる。plan は L43 / S7 / AC-7 で README を更新対象に含めており判断自体は正しい。ただし AC-7 の由来欄は「Issue 受け入れ条件5 / スコープ」となっているが、Issue 受け入れ条件5・スコープは `docs/deployment_setup.md` のみを指す。README を含める根拠は「条件5の趣旨（新フローに更新）＋ S5 による既存記述の陳腐化回避」である旨を AC-7 か調査結果に一行補強すると、スコープ拡張の正当性がレビュアーに自明になる。現状でも L43 に括弧書きで触れているため軽微。

- **[S-002]** AC-8（squash 統一手順のドキュメント化）の「検証可能性」がドキュメント記載有無に留まる
  - 理由: AC-8 は「手順がドキュメント化されている」ことのみを基準とし、リポジトリの merge button 設定変更自体は operator の手動作業（ADR-003 / リスク欄で明記済み）でコード変更外。これは決定として正しく、plan も「設定変更は operator が実施する前提」と整合している。改善余地として、AC-8 に「squash の Default commit message = Pull request title 設定」まで手順記載対象に含むことを明示すると（S7 本文には既述だが AC 文言には未反映）、1 PR = 1 conventional commit という release-please 前提の核心が AC レベルで担保される。

## 良い点

- AC 表が「由来（Issue 受け入れ条件/スコープ/未決事項の番号）」と「対応ステップ」の双方向トレーサビリティを持ち、要件 → 基準 → 実装ステップの紐付けが機械的に追える。
- 決定済み未決事項3つを AC・ステップ・ADR・スコープ除外の4箇所で一貫して反映し、特に `workflow_dispatch` は「release-please に追加しない」と「deploy-production の既存分は温存」を明確に区別して取り違えを防いでいる。
- 「Generate release notes 削除」を S5 で実行行番号・最終ステップ化の影響まで具体化し、AC-5 とテスト方針（deploy ログに Release ステップ無し確認）で検証手段までクローズしている。
- GITHUB_TOKEN による tag push が deploy-production をトリガーしない GitHub 仕様リスクを plan L195・リスク欄・ADR-001 で先回り把握し、PAT 切替の代替経路を用意。AC-3（タグ→デプロイ連鎖）の達成リスクをスコープ内で管理している。
- スコープ「含まれないもの」が充実しており、過剰実装（gold-plating）の余地を事前に閉じている。
