# ブラウザ検証レポート — Issue #539: インラインアラートを案D（.alert）に統一

**実行日:** 2026-06-07
**テストソース:** .issue/539/testing.md
**サーバー:** http://localhost:5175/（vite dev / Cloudflare、検証後停止済み）
**シード:** `pnpm db:apply:local` + `pnpm seed:dev-admin`（dev-admin@example.com / admin）

---

## サマリー

| TC | 画面 | 項目 | 結果 | 備考 |
|----|------|------|------|------|
| 1 | `/password-reset` | P04 リセット補助 notice | **PASS** | 案D完全一致（計測値確認） |
| 2 | `/admin/registration` | P44 登録ポリシー案内 | **PASS** | 案D（DOM 確認）、バッジ据え置き |
| 3 | `/login`（条件付き） | P03 未認証案内 | SKIP（到達不可） | 未確認メールのシードユーザーが無い。コードで `.alert` 利用確認 |
| 4 | `/setup` | P01b admin setup 案内 | SKIP（到達不可） | setup 無効化で `notFound()`。コードで `${ALERT} role="note"` 確認 |
| 5 | `/email-change/confirm` | P06 メール変更確定 warning | SKIP（到達不可） | 有効トークン+認証済み pending change が必要。コードで `${ALERT} ${ALERT_WARNING}` 確認 |
| 6 | `/admin`, `/admin/metrics` | P47 メトリクスアラート | SKIP（アラート0件） | この環境のデータ状態で severity アラート未生成。healthy status-banner（案D対象外）は従来意匠で正しい |

**合計:** 到達6項目中 PASS 2 / SKIP 4（到達不可3 + データ不足1）。**FAIL 0 件。**

## 到達できた画面の確証

### P04 リセット補助 notice（PASS）
- 背景 `rgb(255,255,255)`（白地、旧 surface 塗りなし）
- 枠線 `oklab(0.371 0 0 / 0.3)`（chroma 0 = 無彩色グレー、青みなし）/ border-width `1px`（ヘアライン）
- 影 `rgba(0,0,0,0.04) 0 1px 2px`（shadow-xs）
- アイコン + 見出し（accent 色）+ 本文（ink-secondary）
- screenshot: `screenshots/auth/p04-password-reset-request.png`

### P44 登録ポリシー案内（PASS）
- 実 DOM: `flex items-start gap-3 p-4 rounded-lg bg-bg shadow-xs text-left border border-[color-mix(in_oklab,var(--alert-accent)_30%,transparent)] [--alert-accent:var(--color-accent)] mb-6` `role="note"`
- `bg-bg`（白地、旧 `bg-accent-surface` ベタ塗り消滅）、`shadow-xs`、無彩色グレーのヘアライン枠
- lucide-info アイコン + 見出し（font-semibold, accent 色）+ 本文（ink-secondary）
- リテラル px の持ち込みなし
- ステータスバッジ（#461「現在の状態: 公開中」+ トグル）は従来どおり据え置き
- screenshot: `screenshots/admin/p44-registration.png`

## 到達不可項目のコード確認

ブラウザ状態に到達できなかった P03 / P01b / P06 / P47 は、いずれも共通 `.alert` 定数（`app/components/common/styles.ts:283` の `ALERT` ほか）を使用していることをコードで確認:
- P01b: `AdminSignUpForm/index.tsx` `${ALERT} ... role="note"`
- P06: `EmailChangeConfirm/index.tsx` `${ALERT} ${ALERT_WARNING} ... role="status"`
- P47: `Dashboard/index.tsx` / `Metrics/index.tsx` severity アラートが `ALERT` + tone map を使用

## 既存機能の非回帰

- auth FORM_ERROR summary（誤パスワードログイン時）は従来どおり filled 表示で正常動作。#539 スコープ外につき案D化されていないのは仕様どおり。
- P44 ステータスバッジは従来意匠を維持。
- healthy status-banner（P40、案D対象外）は従来意匠を維持。

## 起票した Issue

なし（FAIL 0 件）。

## 補足

P47 severity アラートと P03/P01b/P06 の条件付き表示は、実機での目視には専用シードデータ（critical/warning 閾値超過メトリクス、未確認メールユーザー、有効な email-change トークン）が必要。本検証では到達できた範囲（P04/P44）で案Dを計測レベルで確証し、残りはコードで共通 `.alert` 準拠を確認した。
