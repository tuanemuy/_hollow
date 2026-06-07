# 進捗 — Issue #539: インラインアラートを案D（.alert）に統一する実装追従

**実装日:** 2026-06-07

## 完了したステップ

| ステップ | 対象 | 状態 |
| --- | --- | --- |
| 1 | `common/styles.ts` に `ALERT*` 定数群を新設 | 完了 |
| 2 | `auth/styles.ts` の `CALLOUT*` / `NOTICE` を削除 | 完了 |
| 3 | P03 `LoginForm`（未認証案内 alert） | 完了 |
| 4 | P01b `AdminSignUpForm`（特権操作 note） | 完了 |
| 5 | P04 `PasswordResetRequestForm`（補助 note） | 完了 |
| 6 | P06 `EmailChangeConfirm`（旧アドレス warning） | 完了 |
| 7 | P47 `Metrics` / P40・P47 `Dashboard`（severity アラート） | 完了 |
| 8 | P44 `RegistrationForm`（登録ポリシー note） | 完了 |
| 9 | P13 `UploadDialog` / `UploadForm`（判定のみ） | 委譲（後述） |
| 10 | P15 `ExportForm`（info バナー） | 委譲（後述） |
| 11 | typecheck / lint / format / test | 完了（全 PASS） |

## ステップ7 の 1:1 照合結果（P40 / P47）

- **P47 `Metrics`**: mock の `.alert alert-error` / `.alert alert-warning`（監視キー見出し mono）= severity アラート。実装の `bg-error/warning/accent-surface` ベタ塗りボックスを案D `.alert` + tone へ変換。`alert.code` 見出しは `${ALERT_TITLE} font-mono`（mono ローカル変種、plan・mock 許容）。
- **P40 `Dashboard`**:
  - **healthy state（`.status-banner`「All systems operational」）は別意匠であり案D `.alert` 対象外** → **触っていない**（緑ドット + hairline ボックスのまま）。
  - **alerts がある場合の表示**（実装の `BANNER_*` ベタ塗り、`AlertDTO[]` severity 駆動）は P40 mock コメント「alerts がある場合は banner.error / banner.warning を上に積む」に対応する severity アラートであり、plan ステップ7が `Dashboard/index.tsx` を変換対象として明示しているため、案D `.alert` + tone へ変換した（`.status-banner` とは別の DOM 分岐）。
- **severity → tone map（Dashboard / Metrics 共通）**: `critical → ALERT_ERROR` / `warning → ALERT_WARNING` / `info → ALERT_INFO`。新規 modifier は作らず、`critical` は `ALERT_ERROR` にマップ（案D modifier は info/success/warning/error の4つのみ）。
- **severity → icon map**: `critical → AlertCircle` / `warning → AlertTriangle` / `info → Info`（P47 mock の error=circle / warning=triangle に一致）。

## ステップ9（P13）の ①既存格上げ vs ②純新規 UI 判定

mock DOM と実コードを 1:1 照合した結果:

- **mock の 2 つの `.alert` 箱**:
  - `.alert alert-error`「対応外の形式が含まれています」（`<code>archive.zip</code>` 等、ファイル名に紐づくクライアント側の拡張子/形式バリデーション結果）
  - `.alert alert-warning`「サイズ超過のファイル」（`<code>large-dataset.xlsx (72.4 MB)</code>`、上限超過のクライアント側サイズチェック結果）
- **実コードの現状**: `UploadDialog.tsx` / `UploadForm.tsx` のページ内通知は **サーバーエラーを表示する `<p className={FORM_ERROR} role="alert">{displayError(error)}</p>` のみ**（`FORM_ERROR` = `layout/styles.ts` の `text-error text-sm mt-2` = 素テキスト）。アップロード前にファイルを選別する**クライアント側の形式/サイズ検証ロジックは存在しない**（全ファイルをそのままアップロードしサーバーエラーを表示する実装）。
- **判定**: mock の 2 つの `.alert` 箱は**②純新規 UI（新たな検証ロジックを伴う箱）** に該当する。①既存表示の格上げではない。
  - 素テキストの `FORM_ERROR`（フィールド直下用途）は plan の指示どおり**据え置き**（誤巻き込み回避）。`.alert` 化対象となる**既存の箱は存在しない**。
- **対応**: #539 では共通 `ALERT_ERROR` / `ALERT_WARNING` / `ALERT_BODY_CODE` を提供済み。P13 の 2 箱の新設（= 形式/サイズのクライアント検証ロジックを含む）は **領域2 子 Issue #541 へ委譲**。`UploadDialog.tsx` / `UploadForm.tsx` は今回**変更していない**。

## ステップ10（P15）の委譲記録

- `ExportForm/index.tsx` の現状はフィールドエラー/サマリーの素 `<p role="alert">` のみで、P15 mock の `.alert alert-info`「非同期ジョブを推奨します」（選択件数に応じた推奨ロジック付き）に対応する**既存の info バナーは存在しない**。
- この info バナーは新たな推奨ロジックを伴う**純新規 UI** であり、export スタイリングを進める #509/#401 および領域2 #541 のスコープと重なる。
- **対応**: #539 では共通 `ALERT_INFO`（無彩色グレー、青を足さない）+ `ALERT_BODY_CODE` を**基盤として提供する**に留め、**P15 info バナーの新設は #541 / #509 / #401 へ委譲**。`ExportForm/index.tsx` は今回**変更していない**。export の素 `<p role="alert">` エラー群も触っていない。

## スコープ外として触れていないもの（確認）

- `FORM_ERROR`（auth/ingestion/layout）の全面 `.alert` 化 → 領域7 #546 ほか
- auth フォーム送信エラー summary（P01/P01b/P03 の `role="alert"` サマリー）の案D化 → 領域7 #546
- P41 `LLMSettingsForm` の `BANNER_*` 接続テスト → 領域5 #545
- P44 ステータスバッジ（公開中/停止中、#461）
- P40 `.status-banner`（healthy state、別意匠）
- トースト（#221）

## 検証結果

- `pnpm typecheck`: エラー 0
- `pnpm lint:fix`: 3 files fixed（import 並べ替え）、変更ファイルに警告なし
- `pnpm format`: No fixes applied
- `pnpm test:unit`: 193 files / 3274 tests すべて PASS
