# 実装計画 — Issue #539: インラインアラートを案D（.alert）に統一する実装追従（#510/#514 後続）

**Issue:** #539
**作成日:** 2026-06-07
**複雑度:** 中〜大規模

---

## 目的

PR #518（commit 324fad9 以降）でデザインモックを単一の `.alert` パターン（案D = 白地 + `color-mix` セマンティックヘアライン枠 + `--shadow-xs` + アイコン/見出し/本文）に統一した。実装側の通知箱コンポーネントをこの案Dへ追従させ、4 系統（`.alert` / `.notice` / `.callout` / `.banner`）に分裂していたページ内通知箱を単一 `.alert` に集約する。SSOT は `spec/design/index.md`「フィードバック・エラー表示原則（#221）」。

## スコープ

### 含まれるもの

- 共通 `.alert` スタイル定数群を `app/components/common/styles.ts` に新設（`--alert-accent` 1 変数でセマンティック切替、neutral 既定）
- auth `CALLOUT` / `CALLOUT_ICON` / `CALLOUT_BODY` / `CALLOUT_ACTION` / `NOTICE`（P03 / P01b / P04）を案Dへ
- メール変更確定の warning（P06）を案Dへ
- admin メトリクスアラート（P47、severity 駆動）/ 登録ポリシー通知（P44 `RegistrationForm`）を案Dへ。P47 監視キー見出しは mono ローカル変種を許容（P40 status-banner は対象外）
- アップロードの既存エラー/警告表示（P13）を案D `.alert` へ格上げ（既存表示の格上げのみ。純新規 UI は #541 へ）
- エクスポートの info バナー（P15）用に共通 `ALERT_INFO`（無彩色グレー）を**基盤提供**。バナー新設自体は新規 UI のため #541/#509/#401 へ委譲
- 寸法・色はデザイントークン経由（リテラル px の新規持ち込みを避ける）。`color-mix` / `--shadow-xs` を使用

### 含まれないもの

**スコープ確定（ユーザー判断 2026-06-07）:** #539 は「共通 `.alert` 基盤の新設 + Issue 本文チェックリストのページ（P03/P01b/P13/P15/P44/P47/P04/P06）の案D化」に限定する。傘 Issue #514 配下には領域別の子 Issue（#540 領域1 P10/P11/P12/P20 / #541 領域2 P13/P15/P16 / #542 領域3 P17/P18/P14 / #543 領域4 P21〜P24 / #544 領域5 P30〜P33 / #545 領域6 admin P40〜P47 / #546 領域7 認証 P01〜P07/P34）が既に存在し、各領域の残りの通知箱は #539 が作る共通 `.alert` を再利用してそれぞれの子 Issue で追従する。よって以下は #539 のスコープ外:

- **チェックリスト外のページの案D化**（P12 EditLockBanner / P17・common-confirm-dialog ConfirmDialog / P20 broken-condition / P24 account-delete / P33 LOCKOUT / P41 LLMSettingsForm 接続テスト / P01 signup エラーサマリー 等）→ 各領域子 Issue #540/#542/#543/#544/#545/#546 が共通 `.alert` を使って対応
- `FORM_ERROR` の全面 `.alert` 化（auth/ingestion/tag/trash で広く共有）。auth フォームエラー summary（P01/P01b/P03 の `role="alert"` サマリー）の案D化は領域7 #546 に委ねる。#539 はそれらが使う `ALERT_ERROR` を提供するに留める
- export の素 `<p role="alert">` エラー群の全面整形（#509/#401 のスコープ）
- ステータスバッジ（P44 公開中/停止中、#461）の変更
- トースト（#221、別系統。本Issueはインラインアラートのみ。P32 公開検索は 9287291 でトースト化済み）
- **mock に箱があるが実装に対応物が無い純新規 UI**（後述 P15 info バナー等）→ 共通 `.alert` 基盤のみ提供し、箱の新設は当該機能の所有 Issue に委ねる

## 前提・注意

- **ブランチ:** 本ブランチ `issue/539/inline-alert-design-d` は `origin/main` から作成済み。案Dモック（PR #518）と最新の design 追加（ee01f8a / 7b4aab9 / 9287291）は main に存在することを確認済み。実装（app/components）は未追従であることを確認済み（common/styles.ts に ALERT 無し、auth/styles.ts に CALLOUT/NOTICE 残存）。
- **mock 参照:** 実装サブエージェントは必ず本ブランチ（main 最新）の `spec/design/pages/*.html` と `spec/design/index.md` を直接読み、案Dの正準マークアップを把握すること。

## 実装ステップ

### 1. 共通 `.alert` スタイル定数を新設

- **対象ファイル:** `app/components/common/styles.ts`
- **変更内容:** 案D正準を Tailwind utility 文字列定数として追加。
  - `ALERT` = ベース枠（`flex items-start gap-3 p-4 rounded-lg bg-bg shadow-xs text-left border border-[color-mix(in_oklab,var(--alert-accent)_30%,transparent)] [--alert-accent:var(--color-accent)]`）。`mb` は呼び出し側都合で割れるため `ALERT` には含めない
  - セマンティック modifier（ローカル変数上書き）: `ALERT_INFO = "[--alert-accent:var(--color-info)]"`, `ALERT_SUCCESS`, `ALERT_WARNING`, `ALERT_ERROR`（neutral は modifier 無し = 既定）
  - `ALERT_ICON = "text-[var(--alert-accent)] shrink-0 mt-px"`
  - `ALERT_CONTENT = "flex flex-col items-start gap-0.5 min-w-0"`
  - `ALERT_TITLE = "m-0 text-sm font-semibold tracking-[-0.01em] text-[var(--alert-accent)]"`
  - `ALERT_BODY`（本文。`<strong>` は `[&_strong]:text-ink [&_strong]:font-medium`、`<code>` は mono 用 `ALERT_BODY_CODE` を併用）
  - `ALERT_ACTION`（`inline-flex items-center gap-1 mt-2 text-sm font-medium text-[var(--alert-accent)] hover:underline` + offset。`disabled:opacity-disabled`）
  - `ALERT_BODY_CODE = "font-mono text-xs"`（P15/P47 mono ローカル変種）
  - 実値（`gap-0.5`=2px / `mt-px`=1px / `tracking-[-0.01em]`）は Tailwind 標準スケールで表現し新規 px トークンは持ち込まない
- **理由:** 4 系統を 1 パターンに集約する SSOT を作る。`common/styles.ts` は既存の共通スタイル集約場所で全レイヤーから import 可能。着手前に最新モック（特に index.md「フィードバック・エラー表示原則」と各 P*.html の `.alert*` クラス）の正確な値を写経する。

### 2. auth `CALLOUT` 系 / `NOTICE` を共通 `.alert` へ巻き取り

- **対象ファイル:** `app/components/auth/styles.ts`
- **変更内容:** `CALLOUT` / `CALLOUT_ICON` / `CALLOUT_BODY` / `CALLOUT_ACTION` / `NOTICE` を削除し、`common/styles.ts` の `ALERT*` を re-export するか各呼び出し元を直接 `ALERT*` 利用へ移行。`FORM_ERROR` の扱いは設計判断に従う。
- **理由:** auth 配下の呼び出し元を共通定義へ統一し、ADR-004 を案Dで上書きする。

### 3. P03 ログイン未認証案内を案Dへ

- **対象ファイル:** `app/components/auth/LoginForm/index.tsx`
- **変更内容:** 通知ブロックを案D構造（`role="status"`、neutral 既定、`ALERT_ICON` + `ALERT_CONTENT`（title + body）+ 再送 `ALERT_ACTION`）へ。アイコンは `Icon` 経由・`size={20}`・`aria-hidden`。P03 mock の文言/構造に合わせる。
- **理由:** P03 案D追従。

### 4. P01b admin setup info 案内を案Dへ

- **対象ファイル:** `app/components/auth/AdminSignUpForm/index.tsx`
- **変更内容:** `CALLOUT` ブロックを `ALERT`（neutral or `ALERT_INFO` = 同グレー）+ icon + title + body + `role="note"` へ。
- **理由:** P01b 案D追従。

### 5. P04 補助 notice を案Dへ

- **対象ファイル:** `app/components/auth/PasswordResetRequestForm/index.tsx`
- **変更内容:** `NOTICE` 素ボックスを `ALERT`（neutral）+ icon + title + body + `role="note"` へ。P04 mock に合わせる。
- **理由:** P04 案D追従。

### 6. P06 メール変更確定 warning を案Dへ

- **対象ファイル:** `app/components/auth/EmailChangeConfirm/index.tsx`
- **変更内容:** 直書きの `bg-warning-surface` ボックスを `ALERT` + `ALERT_WARNING` + icon + title + body へ。`role="status"` 維持。P06 mock に合わせる。
- **理由:** P06 案D追従。

### 7. admin メトリクスアラート（P47）を案Dへ

- **対象ファイル:** `app/components/admin/Dashboard/index.tsx`, `app/components/admin/Metrics/index.tsx`
- **変更内容:** メトリクスアラート（`alert.severity` 駆動の通知箱）の filled surface（`BANNER_BASE` / `BANNER_TONE`）を `ALERT` + tone へ置換。各アラートを icon + `ALERT_TITLE`（`alert.code`）+ `ALERT_BODY`（`alert.message`）で構成。`alert.code` 見出しは P47 監視キーの **mono ローカル変種**（`${ALERT_TITLE} font-mono` 等）を許容。`role="alert"` 維持。
  - **severity → tone map:** `critical → ALERT_ERROR` / `warning → ALERT_WARNING` /（`info`/`success` があれば対応）。案Dの semantic modifier は `info/success/warning/error` の4つのみ。`critical` 用の新規 modifier は作らず必ず `ALERT_ERROR` にマップする。
  - **P40 注意:** P40 ダッシュボードのヘルス系は mock では `.status-banner`（別意匠）であり案D `.alert` 対象ではない可能性が高い。`Dashboard/index.tsx` の `BANNER_*` が P47 相当のアラートか P40 status-banner 相当かを mock（`spec/design/pages/P40-admin-dashboard.html` / `P47-admin-metrics.html`）と 1:1 照合し、**`.alert` 対象（severity アラート）のみ**変換する。status-banner は触らない。
- **理由:** P47 案D追従。Dashboard/Metrics で同型のアラートは tone マッピングを共有。

### 8. P44 登録ポリシー通知を案Dへ

- **対象ファイル:** `app/components/admin/RegistrationForm/index.tsx`（88行目の `bg-accent-surface` ベタ塗り案内ボックス「既存ユーザーには影響しません」。場所確認済み）
- **変更内容:** filled box を `ALERT`（neutral）+ icon + title/body へ。`code` タグがあれば `ALERT_BODY_CODE`（mono）。ステータスバッジ（#461）は変更しない。P44 mock と構造を合わせる。
- **理由:** P44 案D追従。実ファイルは `Metrics` ではなく `RegistrationForm`。

### 9. P13 アップロードのエラー/警告バナーを案Dへ

- **対象ファイル:** `app/components/ingestion/UploadDialog.tsx`, `app/components/ingestion/UploadForm.tsx`
- **変更内容:** P13 mock の `.alert alert-error`「対応外の形式が含まれています」/ `.alert alert-warning` に対応する**実装側の既存のページ内エラー/警告表示**を `ALERT_ERROR` / `ALERT_WARNING` 構造へ格上げする。アイコンは `Icon` 経由。
  - **既存格上げ vs 新規 UI の判定:** 実装側の現状は `FORM_ERROR` の `<p role="alert">` が中心。mock の各 `.alert` 箱が①実装に既存の表示（格上げ対象）か②実装に対応物が無い純新規 UI（= 新たな検証ロジックが必要）かを、着手時に mock DOM と実コードで 1:1 照合する。**①既存表示の格上げのみ #539 で行い、②純新規 UI は領域2 #541 に委ねる**（共通 `ALERT_*` は提供済み）。判定結果を progress.md に記録する。
  - フィールド直下の `FORM_ERROR` 素テキスト用途（箱でない用途）は据え置き（誤巻き込み回避）。
- **理由:** P13 案D追従。箱だけ対象にし副作用を限定。純新規 UI の作成は領域2 子 Issue のスコープ。

### 10. P15 エクスポート info バナーを案D（grey）へ（#509/#401・#541 連携）

- **対象ファイル:** `app/components/export/ExportForm/index.tsx`
- **現状確認:** ExportForm には P15 mock の `.alert alert-info`「非同期ジョブを推奨します」（選択件数に応じた推奨ロジック付き）に**対応する既存の info バナーが存在しない**（現状は `<p role="alert">` のフィールドエラー/サマリーのみ）。よってこの info バナーは「既存表示の案D 格上げ」ではなく**新たな推奨ロジックを伴う新規 UI**であり、export スタイリングを進める #509/#401・領域2 #541 のスコープと重なる。
- **変更内容:** #539 では共通 `ALERT_INFO`（= 無彩色グレー、青を足さない）+ `ALERT_BODY_CODE` を**基盤として提供する**に留め、P15 info バナーの新設は #541/#509/#401 に委ねる。export の素 `<p role="alert">` エラー群も触らない。判定と委譲先を progress.md・PR 説明に明記する。
- **理由:** info バナーは新規機能 UI のため #539 のスコープ（実装追従 + 共通基盤）外。共通 `.alert` 基盤の提供で連携を担保し、二重作業・#509/#401 との衝突を回避。info 無彩色グレー維持。

### 11. 仕上げ

- **対象ファイル:** 変更全体
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format`。未使用 import を整理。既存テスト（クラス名/文言依存）を更新。
- **理由:** CLAUDE.md の after-changes ゲート遵守。

## 設計判断

詳細は `.issue/539/adr.md` を参照。要点:

- 共通 `.alert` は **module-scoped 文字列定数**とする（React コンポーネント化しない）。CLAUDE.md の Styling 規約・既存集約パターンに沿う。
- セマンティック切替は `[--alert-accent:var(--color-xxx)]` のローカル変数ユーティリティで行い、border/icon/title を 1 箇所の上書きで連動させる。動的 severity は `severity → ALERT_*` の定数 map で解決（条件付きクラス連結を避ける）。
- `mb` は `ALERT` 定数に含めず呼び出し側で付与（フォーム内 0 / 通常 `mb-8` の割れに対応）。
- `FORM_ERROR` 全面 `.alert` 化は本Issueのスコープ外（共有による副作用大）。最新モックの auth フォームエラー案D化（ee01f8a）の実態を確認の上、範囲を判断。

## リスクと注意点

- **mock の最新化:** main には 324fad9 の後に ee01f8a / 7b4aab9 / 9287291（フォームエラー案D化・横展開・トースト導入）が積まれている。実装サブエージェントは本ブランチの最新 mock を直接読むこと。Issue 本文の記述より mock の現物が優先。
- **#509/#401 との衝突:** export はスタイリング進行中。P15 info バナー1箇所に限定し衝突面を最小化。PR に連携点を明記。
- **`color-mix`/oklab 対応:** mock が採用済み（SSOT）。対象ブラウザ前提。
- **`FORM_ERROR` 誤巻き込み:** P13 で箱用途とフィールド直下用途を取り違えると無関係なエラー表示まで変わる。mock と 1:1 照合してから変更。
- **テスト依存:** `UploadDialog.test.tsx` / `ConfirmDialog.test.tsx` 等がクラス名・文言に依存している可能性。title 追加で文言アサーションが増減しうる。
- **アイコン契約:** `.alert-icon` は装飾。`Icon` に `label` を渡さず `aria-hidden`、box 側の `role` で意味を担保（a11y 契約）。

## テスト方針

- 単体: 既存テストの文言・`role` アサーションが壊れないか確認・追従。`role="alert"/"status"/"note"` の付与を担保。
- 型/lint: `pnpm typecheck && pnpm lint:fix && pnpm format`。
- ブラウザ（manual-test）: 各画面を案D mock と対照。P03 / P01b / P04 / P06 / P13 / P15 / P40 / P47 / P44。
- 確認観点: 白地 + セマンティックヘアライン枠 + `--shadow-xs` か、塗りつぶし背景が消えているか、info に彩度の高い青が出ていないか、新規 px の持ち込みが無いか。

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスク 2視点並列）

**スコープ確定（最重要）**:
- レビュー視点1の [P-001]「main の design commit（ee01f8a/7b4aab9/9287291）で案D化されたページが Issue チェックリストより広い（P01/P12/P14/P17/P20/P24/P33/P41/common-confirm-dialog）」と、視点1 [P-002]「auth FORM_ERROR サマリーの案D化が未決」を受け、傘 Issue #514 配下の領域別子 Issue（#540〜#546）の存在を確認。ユーザー判断（2026-06-07）により **#539 のスコープ = 共通 `.alert` 基盤 + Issue チェックリスト分（P03/P01b/P13/P15/P44/P47/P04/P06）のみ**、チェックリスト外と FORM_ERROR サマリーは各領域子 Issue へ委譲、と確定。「スコープ → 含まれないもの」に明記。

**修正した点**:
- 視点2 [P-001] / P15・P13 の「mock に箱があるが実装に対応物が無い純新規 UI」問題 → ステップ9（P13）に「既存格上げ vs 新規 UI」判定分岐を追加、ステップ10（P15 info バナー）は新規 UI のため基盤提供に留め #541/#509/#401 へ委譲、と明確化。
- 視点2 [S-002]「P44 の実ファイルは `Metrics` でなく `RegistrationForm/index.tsx:88`」→ ステップ8の対象ファイルを確定（現物確認済み）。
- 視点2 [S-003]「admin severity に `critical` があるが案D modifier は info/success/warning/error の4つ」→ ステップ7に `critical → ALERT_ERROR` マッピングを明記。
- 視点1 [S-001]「P40 は `.status-banner`（別意匠）で案D 対象外の可能性」→ ステップ7に P40 status-banner を触らない注意を追加。タイトルを「P40/P47」→「P47」に補正。

**取り込んだ改善提案**:
- 視点2 [S-001]「`border` 幅 + arbitrary `border-color` の生成 CSS 順を ADR に明記」→ adr.md ADR-002 に注記追加。

**見送った提案とその理由**:
- 視点1 [S-002]「P33 LOCKOUT を含めるか再考」→ スコープ確定により P33 は領域5 #544 の担当として #539 スコープ外で確定（見送りでなくスコープ判断で決着）。

### 2周目以降

スコープがユーザー判断で確定し、残る指摘はすべて plan.md / adr.md に反映済みのため、再レビューは行わず実装フェーズへ移行する。実装サブエージェントは本ブランチ最新 mock を直読し、各ステップの 1:1 照合をもって最終判定する。
