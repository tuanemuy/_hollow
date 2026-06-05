# モック ⇄ 実装 対応マッピング — Issue #500

各モック（`spec/design/pages/*.html`）と現状実装（`app/routes/`, `app/components/`）の対応表。突き合わせの起点。route / component / styles の3観点で記す。

## 共通シェル（layout）

認証済みページ（P10〜P24）に重複転記される共通シェル。**代表ページ P10 でシェル差分を一次判定し、他の認証済みページ(P11〜P24)はその判定に従う**。

- components: `app/components/layout/`（AppShell, AppShellDrawer, Header, Sidebar, MenuButton, UserMenu 等）
- **適用範囲は P10〜P24 の認証済みページのみ**。未ログイン領域（バッチA）の `app/components/auth/AuthHeader` は別物なので P10 判定を流用しない。

## バッチA: 未ログイン / auth（9）

| モック | route | component | styles |
|---|---|---|---|
| P01-signup | `app/routes/signup.tsx` | `auth/SignUpForm` | `auth/styles.ts` |
| P01b-admin-setup | `app/routes/setup.tsx` | `auth/AdminSignUpForm` | `auth/styles.ts` |
| P02-email-verify | `app/routes/verify-email.tsx` | `auth/VerifyEmail` | `auth/styles.ts` |
| P03-login | `app/routes/login.tsx` | `auth/LoginForm` | `auth/styles.ts` |
| P04-password-reset-request | `app/routes/password-reset/index.tsx` | `auth/PasswordResetRequestForm` | `auth/styles.ts` |
| P05-password-reset | `app/routes/password-reset/confirm.tsx` | `auth/PasswordResetConfirmForm` | `auth/styles.ts` |
| P06-email-change-confirm | `app/routes/email-change/confirm.tsx` | `auth/EmailChangeConfirm` | `auth/styles.ts` |
| P07-landing | `app/routes/about.tsx` | `landing/` | landing 内 |
| P34-error | `app/routes/error.tsx` | `_app/.../AppErrorFallback` | — |

未ログイン系は `auth/AuthHeader` を共通ヘッダーに使う（認証済みシェルとは別）。

## バッチB: 個人ノート系（11ファイル）

| モック | route | component | styles |
|---|---|---|---|
| P10-home | `app/routes/_app/index.tsx` | `note/list/*`（NoteList, FilterBar, ListView/TileView/CalendarView, BulkActionBar, DisplayModeSwitch） | `note/list/styles.ts`, `common/styles.ts` |
| P11-note-detail | `app/routes/_app/notes/$noteId/index.tsx`（※下記注） | `note/detail/*` | — |
| P12-editor | `app/routes/_app/notes/new.tsx` | `note/editor/*` | — |
| P13-upload | `app/routes/_app/upload/index.tsx` | `ingestion/*` | — |
| P13-upload-modal | `app/routes/_app/upload/index.tsx` | `ingestion/*` + `common/Dialog` | — |
| P13a-upload-modal | `app/routes/_app/upload/index.tsx` | `ingestion/*` + `common/Dialog` | — |
| P14-publish-settings | （ノート詳細から） | `publication/PublishSettings` | — |
| P15-export | `app/routes/export/index.tsx` | `export/ExportForm` | — |
| P16-export-jobs | `app/routes/_app/exports/index.tsx`, `$jobId.tsx` | `export/ExportJobsList`, `export/ExportJobDetail` | — |
| P17-trash | `app/routes/_app/trash/index.tsx` | `trash/*` | — |
| P18-tags | `app/routes/_app/tags/index.tsx` | `tag/*` | — |

注: ノート詳細ルートは `notes/$noteId/` 直下に index が無い場合がある。`note/detail/*` コンポーネントと `notes/$noteId/export.tsx`、`notes/public/$noteId.tsx` を辿る。実作業時に確認。
共通シェル: バッチB担当が **P10 でシェル一次判定**し、結果をこの mapping に追記して他バッチへ共有する。

## バッチC: ビュー / 設定（5）

| モック | route | component | styles |
|---|---|---|---|
| P20-views | `app/routes/_app/views/index.tsx` | `view/SavedViewsList` | — |
| P21-settings-profile | `app/routes/_app/settings/profile.tsx` | `identity/ProfileForm` | — |
| P22-settings-security | `app/routes/_app/settings/security.tsx` | `identity/SecurityForm` | — |
| P23-settings-prompts | `app/routes/_app/settings/prompts.tsx` | `identity/PromptsForm` | — |
| P24-settings-account-delete | `app/routes/_app/settings/account-delete.tsx` | `identity/AccountDeleteForm` | — |

## バッチD: 公開（4）

| モック | route | component | styles |
|---|---|---|---|
| P30-user-public-top | `app/routes/u/$username/index.tsx` | `public/*` | `public/styles.ts` |
| P31-public-note | `app/routes/u/$username/$noteSlug.tsx`（+ `notes/public/$noteId.tsx`） | `public/*` | `public/styles.ts` |
| P32-public-search | `app/routes/search.tsx` | `public/*` / `directory/*` | `public/styles.ts` |
| P33-share-link | `app/routes/share/$token.tsx` | `public/ShareLinkGate` | `public/styles.ts` |

注（#231 既知論点）: 公開側の空状態（`EMPTY_LIST`）はアイコン無しが意図的（#231 スコープ外）。モックがアイコン付き空状態を描いている場合、方針2（未実装）に倒さず C（要判断）として `decisions-pending.md` に登録する。

## バッチE: 管理者（7）

| モック | route | component | styles |
|---|---|---|---|
| P40-admin-dashboard | `app/routes/admin/index.tsx` | `admin/Dashboard` | — |
| P41-admin-llm | `app/routes/admin/llm.tsx` | `admin/LLMSettingsForm` | — |
| P42-admin-prompts | `app/routes/admin/prompts.tsx` | `admin/PromptsForm` | — |
| P43-admin-tokens | `app/routes/admin/design.tsx` | `admin/DesignTokensForm` | — |
| P44-admin-registration | `app/routes/admin/registration.tsx` | `admin/RegistrationForm` | — |
| P45-admin-users | `app/routes/admin/users.tsx` | `admin/UsersTable` | — |
| P46-admin-jobs | `app/routes/admin/jobs.tsx` | `admin/Jobs` | — |

注（対応なし）: `app/routes/admin/metrics.tsx` / `admin/Metrics` に対応するモックは無い。実装→モック欠落として `followups.md` に記録（モック新設は本Issueスコープ外）。

## 進捗チェックリスト

各ページに `.issue/500/diffs/{Pxx}.md` が作成され、A(モック修正反映)/B(フォローアップ記録)/C(要判断記録) が埋まったらチェック。

- バッチA: [x] P01 [x] P01b [x] P02 [x] P03 [x] P04 [x] P05 [x] P06 [x] P07 [x] P34
- バッチB: [x] P10 [x] P11 [x] P12 [x] P13-upload [x] P13-upload-modal [x] P13a-upload-modal [x] P14 [x] P15 [x] P16 [x] P17 [x] P18（+ SHELL.md: 共通シェル一次判定）
- バッチC: [x] P20 [x] P21 [x] P22 [x] P23 [x] P24
- バッチD: [x] P30 [x] P31 [x] P32 [x] P33
- バッチE: [x] P40 [x] P41 [x] P42 [x] P43 [x] P44 [x] P45 [x] P46（+ E-no-mock.md: admin/metrics モック欠落を記録）
