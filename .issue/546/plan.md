# 実装計画 — Issue #546: impl: 領域7「入口・例外（認証・エラー）」(P01〜P07/P34) のモック実装追従（#514 子）

**Issue:** #546
**作成日:** 2026-06-08
**複雑度:** 小〜中（モック⇄実装を9枚突き合わせた結果、本Issueで埋める乖離は (1) 認証フォーム3枚の form-error サマリーの `.alert` 案D 追従、(2) P34 エラーページのナビ補助＝バックリンク＋バリアント別アクション に集約。バックエンド変更を伴う乖離は別Issueへ落とす）

---

## 概要

P01/P01b/P02/P03/P04/P05/P06/P07/P34 の各モック（SSOT）と現実装を 1 枚ずつ突き合わせた結果、領域7の認証サーフェスは #500/#510 の A 修正（モックを実装へ寄せる）と `.alert` 案D 共通基盤（`app/components/common/styles.ts` の `ALERT*`）の導入が**既に大半済んでいる**。残る本Issueスコープのバックエンド非依存な UI 乖離は次の 2 系統に集約される。

1. **認証フォーム3枚の form-error サマリーの `.alert` 案D 未追従**: P01-signup / P03-login / P01b-admin-setup の各モックは送信失敗サマリーを `.alert alert-error`（白地 + error ヘアライン枠 + アイコン + `alert-title`「…に失敗しました。」+ `alert-body`）に更新済みだが、実装（`SignUpForm` / `LoginForm` / `AdminSignUpForm`）はいまだ旧 `FORM_ERROR`（`bg-error-surface` 塗りつぶし箱・アイコン無し・strong+本文インライン）で出している。index.md「フィードバック・エラー表示原則」§250 の「`CALLOUT` は案D へ追従要（実装は別 Issue）」を、本Iss ューが履行する形。
2. **P34 エラーページのナビ補助（Issue 本文が主追従ポイントに明示）**: モックは全バリアントに「一つ前に戻る」バックリンク（`.back-link`、`history.back()`）を持ち、かつアクションをバリアント別に出し分ける（404=ホーム+検索 / 403=ログイン+ホーム / 410=ホーム / 500=再読み込み+ホーム）。実装 `ErrorPage` はバックリンク無し・アクションは kind に依らず「ホームへ戻る+検索ページを開く」固定ペア。いずれも history.back / location.reload / 静的リンクのクライアント完結ナビで**バックエンド非依存**。

> **案D 追従の根拠条文について（レビュー反映）**: 本Iss ューの form-error 案D 化の一次根拠は index.md §244（`.alert` が「エラー表示」を含む恒常アラートを集約）と §251（参照モックに P01/P03/P01b を列挙）、および各モックが実際に error-summary を `.alert alert-error` で描いている事実にある。§250 が名指す `CALLOUT`（status/note callout の旧称）は既に `.alert` 定数へ移行済みで、本件の `FORM_ERROR`（塗りつぶし箱）とは別物。§250 は「案D 追従要・別 Issue」の精神を示す傍証として扱い、根拠の主は §244/§251 とする。

スコープの切り方・「含まれないもの」の徹底・対応表の書き方は #544 / #541 に倣う。

---

## 調査結果

### 関連ファイル（モック ⇄ コンポーネント ⇄ ルート ⇄ スタイル）

| モック (SSOT) | コンポーネント実装 | ルート | スタイル |
|---|---|---|---|
| `spec/design/pages/P01-signup.html` | `app/components/auth/SignUpForm/index.tsx` | `app/routes/signup.tsx` | `app/components/auth/styles.ts`, `common/styles.ts` |
| `spec/design/pages/P01b-admin-setup.html` | `app/components/auth/AdminSignUpForm/index.tsx` | `app/routes/setup.tsx` | 同上 |
| `spec/design/pages/P02-email-verify.html` | `app/components/auth/VerifyEmail/index.tsx` | `app/routes/verify-email.tsx` | `auth/styles.ts` |
| `spec/design/pages/P03-login.html` | `app/components/auth/LoginForm/index.tsx` | `app/routes/login.tsx` | `auth/styles.ts`, `common/styles.ts` |
| `spec/design/pages/P04-password-reset-request.html` | `app/components/auth/PasswordResetRequestForm/index.tsx` | `app/routes/password-reset/index.tsx` | `auth/styles.ts`, `common/styles.ts` |
| `spec/design/pages/P05-password-reset.html` | `app/components/auth/PasswordResetConfirmForm/index.tsx` | `app/routes/password-reset/confirm.tsx` | `auth/styles.ts` |
| `spec/design/pages/P06-email-change-confirm.html` | `app/components/auth/EmailChangeConfirm/index.tsx` | `app/routes/email-change/confirm.tsx` | `auth/styles.ts`, `common/styles.ts` |
| `spec/design/pages/P07-landing.html` | `app/components/landing/LandingPage.tsx`（内部モジュール定数でスタイル） | `app/routes/_app/index.tsx`（未認証時。`about.tsx` は別物の legal ページ） | `LandingPage.tsx` 内 |
| `spec/design/pages/P34-error.html` | `app/components/public/ErrorPage.tsx` | `app/routes/error.tsx` + 各ルートの `errorComponent`/`notFoundComponent`（`u/route.tsx`, `u/$username/$noteSlug.tsx`, `terms.tsx`, `privacy.tsx` 等） | `app/components/public/styles.ts`（`ERR_*`） |

共通シェル: 認証系は `auth/AuthHeader`、エラー/ランディングは `public/PublicLayout` / `LandingPage` 内 HEADER。`.alert` 案D 共通定数は `app/components/common/styles.ts`（`ALERT` / `ALERT_INFO` / `ALERT_SUCCESS` / `ALERT_WARNING` / `ALERT_ERROR` / `ALERT_ICON` / `ALERT_CONTENT` / `ALERT_TITLE` / `ALERT_BODY` / `ALERT_ACTION`、282-331行）。

### あるべきアーキテクチャ（CLAUDE.md / index.md / tokens.md）

- **`.alert` 案D（index.md「フィードバック・エラー表示原則」§246-251）**: ページ内に埋め込む恒常的な注意喚起・エラー表示は単一 `.alert` パターン（案D = 白地 `--color-bg` + セマンティックカラーのヘアライン枠 `color-mix(in oklab, --alert-accent 30%, transparent)` + `--shadow-xs` + アイコン + `alert-title` + `alert-body`）に統一。塗りつぶし背景は使わない。`--alert-accent` 1 変数でセマンティック切替。**info は無彩色グレー維持**（青を足さない）。a11y は用途で `role="alert"`（エラー/即時）/ `status`（進行/案内）/ `note`（補足）を出し分け。§250 は「実装の `CALLOUT` は案D へ追従要（実装は別 Issue）」と明記しており、本Iss ューがその受け皿。
- **デザイントークン経由・リテラル px 禁止**（Issue 本文 / 既存 `styles.ts` 方針）。寸法・色はトークン or Tailwind 標準スケール（#461 ノーマライズ）で当て、任意値 px を新規持ち込まない。
- **utility-first / data-* 属性 / ハードコード CSS 新設禁止**（CLAUDE.md スタイリング規約）。繰り返し utility はモジュール定数へ集約（`auth/styles.ts` / `public/styles.ts` 既存方式）。`data-primary={... || undefined}` パターンで primary CTA を表現。
- **公開シェル（index.md §2.4 / §2.5）**: 公開・エラーはサイドバー無し単一カラム + 公開ヘッダー。`ErrorPage` は `PublicLayout` 上に構築済み。
- **未実装機能を約束する飾り UI を作らない**（#541 ADR-005 / #544 と同方針）。機能裏付けが無い UI はスコープ外。
- **検証は transport 境界（`validateSearch` / `inputValidator`）と VO 構築の二点**。`error.tsx` は `validateSearch` で kind/message を検証済み。本Issueの追従は表示層のみで検証境界を増やさない。
- **アイコン運用（§7.1）**: `lucide-react` を `Icon.tsx` ラッパー経由。テキスト併用は `size={16}`、確認/アイキャッチ系 `size={20}`、空状態アイキャッチ `size={24}`。`Icon` に `w-*`/`h-*` を渡さず `size` prop を寸法 SSOT にする。

### 既存実装の状態（モック ⇄ 実装の乖離一覧）

凡例: 「埋める」= 本Issueで対応 / 「スコープ外」= 別Issue起票候補 / 「一致」= 乖離なし。

#### P01-signup

| モック該当 | 実装該当 | 乖離 | 判定 |
|---|---|---|---|
| レイアウト・入力欄(h-11)・btn-primary・auth-title(mb-2)・checkbox・フッターリンク・成功状態ブロック | `SignUpForm.tsx` 全体 | なし（#500 A で寄せ済み・トークン水準一致） | 一致 |
| 送信失敗サマリーを `.alert alert-error` 案D で表示（534-540行: icon + title「登録に失敗しました。」+ body） | `SignUpForm.tsx:278-285`（`FORM_ERROR` 塗りつぶし箱、strong「登録に失敗しました。」+ 本文インライン、アイコン無し） | **モックは案D 化済み・実装は旧 `FORM_ERROR`** | **埋める**（ADR-001） |
| conflict(c)「email 重複を field 直下に開示」案 | 実装なし（`fieldErrorOf` は validation kind のみ） | email_taken の validation kind 変換は usecase 層依存 | スコープ外（followups=No, #201 内包） |

#### P01b-admin-setup

| モック該当 | 実装該当 | 乖離 | 判定 |
|---|---|---|---|
| admin-eyebrow（素テキスト accent ラベル）・callout（=`.alert role=note` 案D「このページは特権操作です」）・入力欄・reveal-btn・本体安静状態 | `AdminSignUpForm.tsx`（`ADMIN_EYEBROW` / 案D alert は 169-180行で実装済み） | なし（#500 A で寄せ済み・案D alert は導入済み） | 一致 |
| Setup Token エラー分岐1/2 を `.alert alert-error` 案D で表示（634-648行: icon + title「Setup Token が正しくありません。/ 設定されていません。」+ body「値を確認して…」） | `AdminSignUpForm.tsx:341-352`（`FORM_ERROR` 塗りつぶし箱、strong+本文インライン） | **モックは案D 化済み・実装は旧 `FORM_ERROR`** | **埋める**（ADR-001） |
| 一般 form-error サマリー（登録失敗） | `AdminSignUpForm.tsx:355-362`（`FORM_ERROR`） | モックは P01 と同じ案D 方針 | **埋める**（ADR-001） |

#### P02-email-verify

| モック該当 | 実装該当 | 乖離 | 判定 |
|---|---|---|---|
| success/expired/used 各状態（status-icon 24px・auth-title mb-2・btn 寸法・文言） | `VerifyEmail.tsx` | なし（#500 A で寄せ済み） | 一致 |
| expired の再送フォーム（メール入力欄 + 再送ボタン） | `VerifyEmail.tsx:144-179`（入力欄付き再送フォーム実装済み） | followups B（モック側の入力欄欠落）は**モック整備で解消済み**（現 P02 モック 350-357行に `resend-form` + `input` 有り）。実装が正で一致 | 一致（followups=No, 解消済み） |

#### P03-login

| モック該当 | 実装該当 | 乖離 | 判定 |
|---|---|---|---|
| レイアウト・入力欄・field-link・未認証 callout（=`.alert role=status` 案D・MailWarning・再送 `<button>`+ChevronRight） | `LoginForm.tsx`（未認証 alert は 205-232行で案D 実装済み） | なし（#500 A + 案D 導入済み） | 一致 |
| ログイン失敗サマリーを `.alert alert-error` 案D で表示（522-528行: icon + title「ログインできませんでした。」+ body） | `LoginForm.tsx:183-193`（`FORM_ERROR` 塗りつぶし箱、AlertCircle + strong + 本文インライン） | **モックは案D 化済み・実装は旧 `FORM_ERROR`** | **埋める**（ADR-001） |
| callout-body 内構造（strong/本文/action 縦並び）の微差 | `CALLOUT_BODY` 相当（現 `ALERT_CONTENT` gap-0.5） | followups C の微差。案D 共通定数へ移行済みのため実質収束 | 一致（微差・据え置き） |

#### P04-password-reset-request

| モック該当 | 実装該当 | 乖離 | 判定 |
|---|---|---|---|
| 入力欄・field-hint・btn-primary・notice（=`.alert role=note` 案D「メールが届かないときは」）・sent 状態 | `PasswordResetRequestForm.tsx`（案D alert は 134-144行で実装済み） | なし（#500 A + 案D 導入済み） | 一致 |
| 送信失敗サマリー | `PasswordResetRequestForm.tsx:118-122`（`FORM_ERROR`） | **モックに error-summary alert は無い**（モックの `.alert` は `role=note` のみ）。追従対象なし | 一致（モック裏付け無し→据え置き） |

#### P05-password-reset

| モック該当 | 実装該当 | 乖離 | 判定 |
|---|---|---|---|
| auth-title・入力欄・パスワード強度バー・confirm hint・btn-primary・auth-footer・subtitle 文言 | `PasswordResetConfirmForm.tsx` | なし（#500 A で寄せ済み・強度バー一致） | 一致 |
| 送信失敗サマリー | `PasswordResetConfirmForm.tsx:191-195`（`FORM_ERROR`） | **モックに error-summary alert は無い**。追従対象なし | 一致（据え置き） |

#### P06-email-change-confirm

| モック該当 | 実装該当 | 乖離 | 判定 |
|---|---|---|---|
| success（status-icon 24px・auth-title mb-2・auth-body mb-8）・警告 `.alert alert-warning` 案D（旧アドレス使用不可）・ホームへ進む CTA | `EmailChangeConfirm.tsx`（案D warning alert は 99-109行で実装済み） | なし（#500 A + 案D 導入済み） | 一致 |
| アドレス差分カード `.address-summary`（旧→新を対比、420-431行） | 実装なし | **DTO に旧アドレスが渡らない設計**。表示するには `verifyEmailChange` 応答に旧/新アドレスを載せる機能追加が必要 | **スコープ外**（ADR-002。followups=Yes） |

#### P07-landing

| モック該当 | 実装該当 | 乖離 | 判定 |
|---|---|---|---|
| header（border-b・nav 3項目: 機能/ログイン/アカウント作成）・hero・features・teaser・footer | `LandingPage.tsx`（#500 A で border-b 追加・公開検索リンク削除・footer 2 `<p>` 化済み） | なし（トークン水準一致） | 一致 |
| 見出し最大幅の指定方式（ch vs rem+balance/pretty） | `LandingPage.tsx`（`text-balance`/`text-pretty` + `max-w-[Nrem]`） | followups C の手法差。視覚は近く、ch→rem 機械変換は font 依存で非自明 | 一致（手法差・据え置き） |

#### P34-error

| モック該当 | 実装該当 | 乖離 | 判定 |
|---|---|---|---|
| err-page/err-inner/err-code/err-title/err-desc/err-meta（trace 削除済み）・検索ボックス | `ErrorPage.tsx`（`ERR_*` 定数・showSearch=notFound/gone）+ `public/styles.ts` | なし（#500 A で寄せ済み・trace 非表示・検索ボックス一致） | 一致 |
| **「一つ前に戻る」バックリンク `.back-link`（全バリアント、`history.back()`）** | 実装なし | **モックにあって実装に無い。Issue 本文が主追従ポイントに明示。クライアント完結ナビでバックエンド非依存** | **埋める**（ADR-003） |
| **バリアント別アクションセット**（404=ホーム+検索 / 403=ログイン+ホーム / 410=ホーム / 500=再読み込み+ホーム） | `ErrorPage.tsx:90-106`（kind に依らず「ホームへ戻る+検索ページを開く」固定ペア） | **モックは kind 別に出し分け、実装は固定ペア**。403→ログイン誘導・500→再読み込みは UX 意図的。クライアント完結（静的リンク + location.reload）でバックエンド非依存 | **埋める**（ADR-004。followups C「実装/モックどちらを正とするか保留」を本Iss ューがモック正で決着） |
| ヘッダー（PublicLayout 共通シェルの pill-btn/text-link 寸法） | `PublicLayout` | バッチD（P30）一次判定領域。領域5側で確認済み・本Iss ューでは触らない | スコープ外（PublicLayout 責務・他領域所有） |

### 依存関係

- **バックエンド変更: 本Issueの確定スコープ（認証フォーム3枚の案D 追従 / P34 バックリンク + バリアント別アクション）はすべて不要。**
- `.alert` 案D 共通定数（`ALERT*` / `app/components/common/styles.ts`）: #539（PR #547）で確立済み・auth の他 alert で既に再利用。本Iss ューの認証フォーム追従でそのまま再利用する（新規定数は作らない）。
- `ERR_*` / `PILL_BTN` / `SEARCH_ICON` / `USER_SEARCH_INPUT`（`public/styles.ts`）: P34 追従で再利用。バックリンク用スタイルのみ新規定数（`BACK_LINK`）を 1 つ追加する（モック `.back-link` 258-268行のトークン化）。
- `router.history.back()` の確立パターン: `NoteEditor.tsx:306`（client component で `useRouter().history.back()`）。P34 バックリンク・500 再読み込みは client 境界を要する（後述 ADR-003）。
- 他Issue / 他領域所有（本Iss ューでは触らない）: #201（P01 email 重複 field 直下化）/ P06 アドレス差分カード（旧アドレスを DTO に載せる機能追加・別Issue起票候補）/ #474（`_app/notes` 無スタイル errorComponent、Issue 本文で重複回避明示）/ PublicLayout ヘッダー（領域5バッチD）。

---

## スコープ

### 含まれるもの

1. **認証フォーム3枚の form-error サマリーを `.alert alert-error` 案D に追従**（P01-signup / P03-login / P01b-admin-setup）。`SignUpForm` / `LoginForm` / `AdminSignUpForm` の `FORM_ERROR` 箱を、共通 `ALERT*` 定数（`ALERT + ALERT_ERROR` + `ALERT_ICON` + `ALERT_CONTENT` + `ALERT_TITLE` + `ALERT_BODY`）で構成し直す。`role="alert"` 維持。`alert-title` に「…に失敗しました。」「Setup Token が正しくありません。/ 設定されていません。」、`alert-body` に詳細文言（現行 `summary` / 確認文言）を移す。
2. **P34 エラーページにバックリンク「一つ前に戻る」を追加**（全バリアント）。`router.history.back()` を呼ぶクライアント要素。`public/styles.ts` に `BACK_LINK` 定数を新設（モック 258-268行をトークン化: `inline-flex items-center gap-1 text-sm text-ink-tertiary px-2.5 py-1.5 rounded-md hover:text-ink hover:bg-surface` + `ChevronLeft size={16}` ※モックは 12px だが §7.1 で `size` は 16/20/24 段階・テキスト併用は 16 が原則。最小段階の 16 を採用）。
3. **P34 アクションをバリアント別に出し分け**（404=ホーム+検索 / 403=ログイン+ホーム / 410=ホーム / 500=再読み込み+ホーム）。`COPY` テーブルか派生ロジックで kind 別のアクション集合を定義し、`ERR_ACTIONS` 内に描画。500 の「再読み込み」は `location.reload()`（client）。
4. 上記の単体テスト追加 / 既存テストの整合更新。
5. 仕上げ（typecheck / lint / format）と残課題・別Issue起票候補の記録。

### 含まれないもの（別Issue起票候補 / 他Issue・他領域所有）

- **P06 アドレス差分カード `.address-summary`**（ADR-002）→ 別Issue（`verifyEmailChange` 応答に旧/新アドレスを載せる機能追加が前提。followups=Yes・デザイン強化 Issue 候補）。
- **P01 conflict(c) email 重複の field 直下開示** → **#201 所有**（usecase 層で email_taken を validation kind に変換する設計判断。followups=No, #201 内包）。
- **`_app/notes` 配下の無スタイル errorComponent** → **#474 所有**（Issue 本文で重複回避明示）。
- **P34 ヘッダー（PublicLayout）の pill-btn / text-link 寸法精緻化** → 領域5バッチD / PublicLayout 責務（本Iss ューでは触らない）。
- **P04/P05 の `FORM_ERROR` サマリー** → モックに案D の error-summary alert が無いため**追従対象外・据え置き**（`PasswordResetRequestForm` / `PasswordResetConfirmForm` の `FORM_ERROR` は温存）。モックが案D 化した時点で別途追従。
- **P07 見出し最大幅の ch→rem 手法差** → 手法差（balance/pretty vs ch）として据え置き（followups C・モック側論点）。

---

## Issue「主な追従ポイント」に対するカバレッジ

| 主追従ポイント | 本Issueのカバレッジ | 落とし先 |
|---|---|---|
| 認証フロー（サインアップ/ログイン/メール検証/パスワードリセット/メール変更確認） | **form-error サマリーの案D 追従**（P01/P03/P01b）。他の状態・alert は既に一致 | 本Iss ューで対応 |
| ランディング（P07） | **ゼロ追従**（#500 A で全て一致済み） | — |
| エラーページのナビ補助（P34） | **本命**（バックリンク追加 + バリアント別アクション出し分け） | 本Iss ューで対応 |
| メール変更確認のアドレス差分（P06） | **ゼロ追従**（DTO に旧アドレスが無く機能追加前提） | ADR-002（別Issue） |

→ 領域7は #500/#510 の A 修正と `.alert` 案D 基盤導入で**既に高い一致度**にある。本Iss ューが拾うのは「案D 化済みモックに form-error サマリーだけが追従漏れ」の3枚と、Issue が明示する P34 ナビ補助。

---

## 実装ステップ

### 1. 認証フォーム3枚の form-error サマリーを `.alert alert-error` 案D に追従

- **対象ファイル:** `app/components/auth/SignUpForm/index.tsx`, `app/components/auth/LoginForm/index.tsx`, `app/components/auth/AdminSignUpForm/index.tsx`
- **変更内容（共通）:** `FORM_ERROR` の塗りつぶし箱を、共通 `ALERT*` 定数で案D 構造に置換する。
  - 箱: `<div className={`${ALERT} ${ALERT_ERROR}`} role="alert">`（form gap レイアウト内なので margin は付けない＝ALERT は margin 非内包。`FORM` の `gap-5` が間隔を担う）。
  - アイコン: `<span className={ALERT_ICON} aria-hidden="true"><Icon icon={AlertCircle} size={20} /></span>`（モック 535行は info 円 + ! の error アイコン。実装の既存 `AlertCircle` を流用。§7.1 で alert アイキャッチは `size={20}`）。
  - 中身: `<div className={ALERT_CONTENT}><p className={ALERT_TITLE}>{title}</p><p className={ALERT_BODY}>{body}</p></div>`。
  - **SignUpForm（P01）:** title「登録に失敗しました。」/ body は現行 `summary`（`displayError(error)` の文言）。`summaryId` の `id` は維持（既存 a11y 配線）。
  - **LoginForm（P03）:** title「ログインできませんでした。」/ body は現行 `summary`。
  - **AdminSignUpForm（P01b）:** (a) Setup Token エラー分岐（`isSetupTokenError`）: title は `state.error?.code === "setup_token_disabled" ? "Setup Token が設定されていません。" : "Setup Token が正しくありません。"`、body「値を確認してもう一度入力してください。」。(b) 一般 summary: title「登録に失敗しました。」/ body は `summary`。両方を案D 化する。
- **不要 import の整理:** 3 ファイルとも `FORM_ERROR` import を削除（他で使っていなければ）。ここで対象にするのは **`app/components/auth/styles.ts:54` の `FORM_ERROR`（`bg-error-surface` 塗りつぶし箱）**のみ。`app/components/layout/styles.ts:88` の同名 `FORM_ERROR`（`text-error text-sm mt-2` のインライン文字列）や `common/styles.ts:195` の `formError` は**別系統なので一切触らない**（同名定数が3系統あり grep / `lint:fix` の未使用整理で取り違えやすい）。`ALERT` / `ALERT_ERROR` / `ALERT_ICON` / `ALERT_CONTENT` / `ALERT_TITLE` / `ALERT_BODY` を `@/components/common/styles` から追加 import。`AlertCircle` は `lucide-react`（SignUpForm/LoginForm は要追加、AdminSignUpForm は既存）。
- **a11y:** `role="alert"` を維持（送信失敗の即時通知）。これは index.md §249 の「エラー・即時 = `role="alert"`」と整合（既存 auth の info/warning は `role=status`/`note` だが、本件は失敗の即時通知なので `alert` が正）。
- **理由:** index.md §250「`CALLOUT` は案D へ追従要（実装は別 Issue）」の履行。3 枚のモックが既に `.alert alert-error` 案D に更新済みで、実装だけ旧 `FORM_ERROR` 塗りつぶし箱に取り残されている。共通定数再利用でリテラル px/色を持ち込まず、塗りつぶし→白地+細枠の Apple Calm 原則へ寄せる。

### 2. P34 エラーページにバックリンク「一つ前に戻る」を追加

- **対象ファイル:** `app/components/public/ErrorPage.tsx`, `app/components/public/styles.ts`
- **クライアント境界の確立（ADR-003）:** 現 `ErrorPage` はサーバーコンポーネント（`"use client"` 無し）。`history.back()` は `useRouter().history.back()`（`NoteEditor.tsx:306` の確立パターン）でクライアント実行が要る。**バックリンクと 500 の再読み込みボタンだけを小さな client 子コンポーネント `ErrorNavActions`（`"use client"`）に切り出す**。`ErrorPage` 本体はサーバーのまま保ち、kind と「再読み込みを出すか」を props で渡す。`ErrorPage` 全体を client 化すると公開エラーページの SSR 利点（即時表示・SEO）を損なうため、最小の client 島に閉じる。
  - **境界の切り分け（明示）:** client 島（`ErrorNavActions`）に置くのは **(a) 全バリアントのバックリンク（`router.history.back()`）と (b) 500 の「再読み込み」ボタン（`location.reload()`）の2つだけ**。`err-actions` 内の静的リンク（404 ホーム/検索・403 ログイン/ホーム・410 ホーム・500 ホーム）は `<Link>` のまま `ErrorPage`（サーバー）に残す。`ErrorNavActions` に渡す props は `kind`（バリアント識別）と `showReload`（500 のみ true）に限る。onClick を要する要素だけを client に寄せ、それ以外は SSR を維持する。
- **`BACK_LINK` 定数を新設:** `public/styles.ts` にモック 258-268行をトークン化した定数を追加。`"inline-flex items-center gap-1 text-sm text-ink-tertiary px-2.5 py-1.5 rounded-md transition-colors motion-reduce:transition-none hover:text-ink hover:bg-surface"`。`px-2.5 py-1.5`（10/6px）はモック `padding: 6px 10px` 相当の Tailwind 標準スケール。`gap-1`（4px）= モック `gap:4px`。`text-sm`（13px）= モック `font-size:13px`。リテラル px を持ち込まない。
- **バックリンク描画:** `err-actions` の下に `<button type="button" className={BACK_LINK} onClick={() => router.history.back()}>` + `<Icon icon={ChevronLeft} size={16} />` + 「一つ前に戻る」。モックは `<a>` だが履歴操作なので `<button>` が a11y 上正しい（href を持たない遷移は button）。全バリアントに表示。
- **理由:** Issue 本文が「エラーページのナビ補助（P34）」を主追従ポイントに明示。history.back はクライアント完結でバックエンド非依存。次の行動（直前ページへ戻る）を提示でき UX が向上する。followups は「Yes（機能追加・実装するか判断要）」だが、Issue 本文の明示により**本Iss ュースコープ内と判断**（判断理由は ADR-003）。

### 3. P34 アクションをバリアント別に出し分け

- **対象ファイル:** `app/components/public/ErrorPage.tsx`
- **変更内容:** kind 別のアクション集合をモックに合わせて定義する。
  - **notFound(404):** プライマリ「ホームへ戻る」+ セカンダリ「検索ページを開く」（現状維持）+ 検索ボックス表示。
  - **forbidden(403):** プライマリ「ログイン」（`/login`）+ セカンダリ「ホームへ戻る」。検索ボックス非表示（現状どおり）。
  - **gone(410):** プライマリ「ホームへ戻る」のみ + 検索ボックス表示（現状どおり）。
  - **system(500):** プライマリ「再読み込み」（`location.reload()`・client、ステップ2の `ErrorNavActions` 内）+ セカンダリ「ホームへ戻る」。
  - 実装は `COPY` テーブルに `actions` 派生を足すか、`renderActions(kind)` で分岐する。プライマリは `data-primary=""` を付与（`PILL_BTN` は `data-primary` で accent 解決、無印は surface のコメント `public/styles.ts:25-27` に従う）。
  - **403 のログインリンク:** `<Link to="/login">`。404/410/500 のホームは `<Link to="/" search={HOME_SEARCH}>`、404 の検索は `<Link to="/search" search={{ q: "", limit: 20 }}>`（現状の配線を流用）。
- **検索ボックスの出し分けは現状維持:** `showSearch = notFound || gone` はモック（404/410 のみ検索ボックス）と一致済み。変更不要。
- **理由:** モックの出し分け（403→ログイン誘導、500→再読み込み）は UX 意図的で、固定ペアへ潰すと設計意図を損なう（followups C の指摘）。本Iss ューはモックを正として出し分けを実装に追加する（ADR-004）。クライアント完結（静的リンク + reload）でバックエンド非依存。

### 4. テストの追加・更新

- **対象ファイル:** `app/components/auth/__tests__/`（新規 `SignUpForm.test.tsx` 等、または既存に追記）、`app/components/public/__tests__/ErrorPage.test.tsx`（新規）
- **変更内容:**
  - (a) SignUpForm: 登録失敗時に `.alert`（`role="alert"` + 「登録に失敗しました。」title + body）が描画され、旧 `FORM_ERROR` の塗りつぶしクラスでないこと。
  - (b) LoginForm: ログイン失敗（非 validation）で同様の案D アラート。validation field エラーは従来どおり field 直下（回帰）。未認証（`unverified`）は従来の案D status alert（回帰）。
  - (c) AdminSignUpForm: `setup_token_invalid` / `setup_token_disabled` でそれぞれ正しい title の `.alert alert-error` が出る。一般 summary も案D。
  - (d) ErrorPage: kind 別アクション — 403 で「ログイン」リンク（`/login`）が primary、404 で「検索ページを開く」、500 で「再読み込み」要素、全 kind で「一つ前に戻る」バックリンクが描画される。検索ボックスは notFound/gone のみ（回帰）。
  - (e) `ErrorNavActions` の client 挙動（back / reload）は happy-dom でハンドラ存在を確認（実 navigation はモック）。
- **理由:** 案D 移行・バリアント別アクション・バックリンクの回帰防止。

### 5. 仕上げ

- **対象:** 変更全体
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format`。未使用になった `FORM_ERROR` import を 3 ファイルから除去（`FORM_ERROR` 定数自体は P04/P05 がまだ使うので `auth/styles.ts` からは削除しない）。残課題・別Issue起票候補を `.issue/546/progress.md` に記録（P06 アドレス差分カード = 旧アドレスを DTO に載せる機能追加 / P04・P05 の案D 化はモック更新待ち）。
- **別Issue起票の追跡（#514 親要請）:** スコープ外に落とした主要乖離（P06 アドレス差分カード）は Phase 4 で別Issue起票 or #514 へリンク追跡する。
- **据え置きの記録:** P34 forbidden(403) の desc 文言がモック（「アカウントにログインしている場合は、別のユーザーで…」）と実装 `COPY.forbidden.desc`（「ログインしている場合は、別のアカウントで…」）で微妙に異なる。本Iss ューは案D アラート文言と P34 アクション出し分けが主眼で、この文言微差は追従スコープ外。`progress.md` に「据え置き（モック微差・後続レビューで追従漏れと誤認しないため記録）」として1行残す。

---

## 設計判断

- **ADR-001（認証 form-error の案D 追従）:** P01/P03/P01b のモックは form-error サマリーを `.alert alert-error` 案D に更新済みで、実装だけ旧 `FORM_ERROR`（塗りつぶし）に取り残されている。index.md §250 が「案D 追従要・別 Issue」と明記する受け皿が本Iss ュー（領域7=認証）。共通 `ALERT*` 定数を再利用し新規定数を作らない。P04/P05 はモックに error-summary alert が無いため対象外（モック裏付けの無い UI を勝手に案D 化しない）。
- **ADR-002（P06 アドレス差分カードはスコープ外）:** `.address-summary` は旧→新アドレス対比を描くが、`verifyEmailChange` 応答に旧アドレスが含まれず、DTO/usecase の機能追加を伴う。「モックにあるから」と UI だけ作ると実値の無い飾りになる（#544/#541 と同方針）。別Issue（旧アドレスを応答に載せるデザイン強化）へ。
- **ADR-003（P34 バックリンクは本Iss ュースコープ内 / 最小 client 島）:** followups は「Yes（実装するか判断要）」だが、Issue #546 本文が「エラーページのナビ補助（P34）」を**主追従ポイントに明示**。history.back はクライアント完結でバックエンド非依存のため、本Iss ューで実装する。`ErrorPage` 全体を client 化せず、back/reload を扱う小さな client 子（`ErrorNavActions`）に切り出して SSR 利点を保つ（`NoteEditor.tsx:306` の `router.history.back()` パターンを踏襲）。モックの `<a href="javascript:history.back()">` は a11y 上 `<button>` で実装する（href の無い履歴操作）。
- **ADR-004（P34 バリアント別アクション = モック正で決着）:** followups C は「実装の固定ペア / モックの出し分け、どちらを正とするか保留」とする。モックの出し分け（403→ログイン、500→再読み込み）は UX 意図が明確で、Issue が P34 ナビ補助を主点に挙げる以上、モックを正として実装に出し分けを追加する。すべて静的リンク + `location.reload()` でバックエンド非依存。
- **ADR-005（リテラル px 回避）:** P34 `BACK_LINK` は新規定数化するが、モックの px 値（gap 4 / pad 6·10 / font 13 / radius-md）はすべて Tailwind 標準スケール（`gap-1` / `px-2.5 py-1.5` / `text-sm` / `rounded-md`）に収斂させ、任意値 px を持ち込まない（#461 ノーマライズ準拠）。アイコンはモック 12px だが §7.1 の段階（16/20/24）に従い最小の `size={16}`。

---

## リスクと注意点

- **スコープ侵食。** 領域7は #500/#510 で既に高一致のため、「モックを眺めて差を探す」と P06 アドレス差分カードや P04/P05 のサマリー意匠まで触りたくなる。本Iss ューは (1) 案D 化済みモックに追従漏れの form-error 3 枚、(2) Issue 明示の P34 ナビ補助、に厳格に限定する。P06 は機能追加前提でスコープ外、P04/P05 はモック裏付け無しで据え置き。
- **client 境界の最小化。** P34 の back/reload で `ErrorPage` 全体を `"use client"` 化すると公開エラーページの SSR 利点を失う。back/reload を扱う最小の client 島（`ErrorNavActions`）に閉じ、`ErrorPage` 本体はサーバーのまま保つ（ADR-003）。
- **`FORM_ERROR` 定数の温存。** 案D 移行は P01/P03/P01b の 3 箇所のみ。`FORM_ERROR` 定数は P04（`PasswordResetRequestForm`）/ P05（`PasswordResetConfirmForm`）がまだ使うので `auth/styles.ts` から削除しない。3 ファイルの import だけ整理する。
- **a11y role の取り違え。** form-error サマリーは「失敗の即時通知」なので案D 化後も `role="alert"` を維持する（既存 auth の info/warning は `role=status`/`note` だが、それと混同して `status` に落とさない。index.md §249）。
- **`PILL_BTN` の `data-primary` 依存。** P34 のプライマリアクション（403 ログイン・500 再読み込み等）で `data-primary=""` を付け忘れると accent が当たらず surface 表示になる（`public/styles.ts:25-27` コメント）。必ず付与する。
- **既存テストの回帰。** auth フォームに `FORM_ERROR` のクラス文字列/塗りつぶしを前提にしたテストがあれば案D 構造に合わせて更新する（着手時に grep 確認）。

---

## テスト方針

- **単体（happy-dom / vitest）:**
  - 認証3枚: 送信失敗で `.alert alert-error`（`role="alert"` + 正しい title + body）が出る。validation field エラーは field 直下のまま（回帰）。LoginForm 未認証 status alert・PasswordReset 系の `FORM_ERROR` は不変（回帰）。
  - ErrorPage: kind 別アクション（403=ログイン primary+ホーム / 500=再読み込み+ホーム / 404=ホーム+検索 / 410=ホーム）、全 kind でバックリンク描画、検索ボックスは notFound/gone のみ。
- **型/リント:** `pnpm typecheck && pnpm lint:fix && pnpm format`。
- **ブラウザ確認（manual-test）観点:**
  - `/signup` で既存メール等の登録失敗 → 白地 + error ヘアライン枠 + アイコン + 「登録に失敗しました。」の案D アラート（塗りつぶし箱でないこと）。
  - `/login` でパスワード誤り → 「ログインできませんでした。」案D アラート。未認証アカウント → 従来の status alert + 再送ボタン（回帰）。
  - `/setup` で Setup Token 誤り/未設定 → それぞれ正しい title の案D alert。
  - `/error?kind=403` → 「ログイン」が primary・「ホームへ戻る」secondary・「一つ前に戻る」バックリンク表示。`?kind=500` → 「再読み込み」押下でリロード。`?kind=404`/`410` → 検索ボックス + バックリンク。全バリアントでバックリンク押下が直前ページへ戻る。
  - 各アラート・バックリンクの配色がモック（白地 + ヘアライン枠 + `shadow-xs` / ink-tertiary）と一致、リテラル px 混入なし。
  - 回帰: P02 verify 各状態、P04/P05 reset、P06 success（warning alert + ホームへ進む）、P07 landing が従来どおり。

---

## レビュー履歴

### 1周目: 両視点とも問題点ゼロで終了

2視点（要件カバレッジ / アーキ・リスク）を並列レビュー。両レビュアーとも**問題点（要修正）ゼロ**を報告し、9枚のモック⇄実装の突き合わせ判定・スコープの切り方・client 島切り出し・トークン収斂・a11y 取り扱いがすべて実ファイルと整合していることを確認。終了条件（全レビュアー問題点ゼロ）を満たし1周で終了。

**取り込んだ改善提案**:
- **[S-001 要件視点]** form-error 案D 化の根拠条文を §250（`CALLOUT` 名指し＝別物）から §244/§251 主体へ修正 → 概要に注記を追加。
- **[S-001 アーキ視点]** `FORM_ERROR` 同名定数が3系統（auth/styles.ts:54・layout/styles.ts:88・common/styles.ts:195 の `formError`）あるため、対象は auth 系のみ・他系統は触らない旨を実装ステップ1に明記。
- **[S-002 アーキ視点]** client/server 境界（client 島に置くのは back/reload のみ、静的リンクはサーバー残置・props は `kind`/`showReload`）を実装ステップ2に明示。
- **[S-003 アーキ視点]** P34 forbidden desc のモック⇄実装文言微差を「据え置き」としてステップ5 / progress.md に記録する方針を追加。

**見送った提案とその理由**:
- なし（4件すべて軽微なドキュメント精度向上で、スコープを変えずに取り込めるため反映）。
