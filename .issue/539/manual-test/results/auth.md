# Issue #539 案D（.alert）目視確認 — auth 系画面

**検証日:** 2026-06-07
**サーバー:** http://localhost:5175/
**セッション:** verify-auth
**対象確認項目:** P04 / P03 / P01b / P06（testing.md 確認項目 1〜4）

## 判定サマリー

| 項目 | 画面 / ルート | 判定 | 根拠 |
|------|---------------|------|------|
| P04 パスワードリセット補助 notice | `/password-reset`（`role="note"`） | **PASS** | 白地・無彩色グレーのヘアライン枠・shadow-xs・アイコン+見出し+本文。旧塗りつぶし無し。計測値で確認 |
| P03 ログイン未認証案内 | `/login`（未確認メールでログイン試行時の条件付き表示） | **SKIP（到達不可）** | 未確認メールのシードユーザーが存在しない（seed は `dev-admin@example.com` の email_verified=1 のみ）。未認証案内ボックスは表示条件を満たせず到達不可 |
| P01b admin setup info 案内 | `/setup`（AdminSignUpForm の `role="note"`） | **SKIP（到達不可）** | `setupTokenVerifier.isEnabled()` が false のため `beforeLoad` で `notFound()`。「404 Not Found / このページは利用できません。」表示。管理者既存/トークン検証無効により到達不可 |
| P06 メール変更確定 warning | `/email-change/confirm?token=...`（success 状態の `.alert .alert-warning`） | **SKIP（到達不可）** | warning ボックスは `verifyEmailChangeFn` 成功（有効な未消費トークン+認証済み pending change）の場合のみ描画。ダミートークンでは not_found 状態（「無効なリンクです」）になり warning は出ない。要有効トークン |

FAIL なし。到達できた P04 は PASS。残り 3 項目は到達不可（SKIP）。

## P04（PASS）詳細

到達した notice ボックスの計測値:

- class: `flex items-start gap-3 p-4 rounded-lg bg-bg shadow-xs text-left border border-[color-mix(in_oklab,var(--alert-accent)_30%,transparent)] [--alert-accent:var(--color-accent)] mt-6`
- 背景: `rgb(255, 255, 255)`（白地、旧 surface 塗りなし）
- 枠線: `oklab(0.371 0 0 / 0.3)`（無彩色グレー・chroma=0、青みなし）・border-width `1px`（ヘアライン）
- 影: `rgba(0,0,0,0.04) 0px 1px 2px 0px`（shadow-xs）
- 構成: info アイコン（グレー）+ 見出し「メールが届かないときは」（accent 色）+ 本文（ink-secondary グレー）

案D完全一致。info/neutral は彩度の高い青ではなく無彩色グレー。

## 共通 .alert 実装（コードで確認・3項目の到達不可分の裏付け）

`app/components/common/styles.ts`:

- `ALERT`（283-284行）= `flex items-start gap-3 p-4 rounded-lg bg-bg shadow-xs text-left border border-[color-mix(in_oklab,var(--alert-accent)_30%,transparent)] [--alert-accent:var(--color-accent)]`
- `ALERT_INFO` = `[--alert-accent:var(--color-info)]`（`--color-info` は `--color-accent` のエイリアス＝無彩色グレー、青みなし）
- `ALERT_WARNING` = `[--alert-accent:var(--color-warning)]`
- `ALERT_ICON` / `ALERT_CONTENT` / `ALERT_TITLE`（accent 色）/ `ALERT_BODY`（ink-secondary）

到達不可 3 画面も共有 `.alert` を使用していることをコードで確認:

- P01b: `app/components/auth/AdminSignUpForm/index.tsx:170` `<div className={`${ALERT} mb-6`} role="note">`（「このページは特権操作です」）
- P06: `app/components/auth/EmailChangeConfirm/index.tsx:99` `<div className={`${ALERT} ${ALERT_WARNING} mb-8`} role="status">`（「旧アドレスは使用できなくなりました」、success 状態のみ）

## 対象外（既存機能の非回帰確認）

- auth フォーム送信エラー summary（FORM_ERROR）は #539 対象外。`/login` で誤パスワード送信時、従来どおり filled 表示（`bg-error-surface` rgb(251,235,235) / text-error）で正常表示。壊れていない。

## スクリーンショット

- `/Users/hikaru/github.com/tuanemuy/hollow2/.issue/539/manual-test/screenshots/auth/p04-password-reset-request.png`（P04 PASS — 補助 notice）
- `/Users/hikaru/github.com/tuanemuy/hollow2/.issue/539/manual-test/screenshots/auth/p03-login-initial.png`（P03 — ログイン初期画面）
- `/Users/hikaru/github.com/tuanemuy/hollow2/.issue/539/manual-test/screenshots/auth/p03-login-form-error.png`（P03 代替 — FORM_ERROR summary 表示状況、対象外）
- `/Users/hikaru/github.com/tuanemuy/hollow2/.issue/539/manual-test/screenshots/auth/p06-email-change-confirm-invalid.png`（P06 — ダミートークンで not_found、warning 非表示）

## 注記

- agent-browser のページ初回ロードで body が空になる事象があり、`open` を再実行（または load 完了待ち）で描画完了することを確認。判定はすべて描画完了後に実施。
