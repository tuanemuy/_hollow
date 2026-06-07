# 実装計画 — Issue #543: impl: 領域4「設定」(P21〜P24) のモック実装追従（#514 子）

**Issue:** #543
**親:** #514 / **上流:** #510（モック確定済み・CLOSED）
**作成日:** 2026-06-07（中スコープへ改訂）
**複雑度:** 中規模（frontend 完結。backend 拡張は一切行わない）

---

## 概要

#510 で確定した領域4「設定」モック（P21〜P24）に既存の設定画面を追従させる。

スコープは **「中（frontend で無理なく実装できる範囲）」** に確定（ユーザー決定）。
モックの HTML コメントは多くの豪華機能を「未実装(B 参照)」と宣言しているが、本 Issue ではそのうち **新規 backend を要さず frontend だけで完結できる差分**（戻り導線・文字数カウンタ・公開 URL プレビュー・レート制限ヘルプ・パスワード強度ヘルプ・section-desc 文言整合）を追従する。新規 backend（usecase/domain/adapter/DTO 拡張）が必要な拡充群（アバター配線・アクティブセッション一覧・多段アカウント削除・削除影響の実データ集計・リセット/最終保存）は別 Issue（Phase 4 起票）へ切り出す。

**最重要原則: 虚偽のヘルプ・プレビューは出さない。** 表示する制限値・URL・文言はすべて backend（domain / usecase）の実挙動と一致させる。一致を確認できない表示は出さず、その判断を本 plan に明記する。

### 調査で確定した実値（モックの数値と差異あり — 実値を採用）

| 項目 | モック表示 | backend 実値（採用値） | 根拠 |
|---|---|---|---|
| 自己紹介(bio)最大文字数 | `73 / 160` | **500** | `app/components/identity/schema.ts:5`（`BIO_MAX=500`）、`app/core/domain/identity/valueObject.ts:36,318`（`BIO_MAX_LENGTH=500`） |
| ユーザー名変更レート制限 | 「90日に1回」相当 | **30日に1回** | `app/core/domain/identity/entity.ts:19`（`USERNAME_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000`）、同 :189「Username can only be changed once every 30 days」 |
| 公開プロフィール URL prefix | `hollow.example/` | **`{appUrl}/u/<username>`**（実 appUrl ベース。ハードコードのダミードメインは出さない） | 公開ルート `app/routes/u/$username/`、URL 生成の先行例 `app/components/note/detail/NoteDetail.tsx:99`（`${appUrl}/u/${username}/...`）、`container.config.appUrl`（`APP_URL` env、`app/core/application/di/serverCloudflare.ts:205,323`） |
| パスワード強度 | （モックは強度ヘルプ文言を持たない／実装が正と明記） | **12文字以上 + 英字/数字/記号のうち2種以上** | `app/core/domain/identity/valueObject.ts:32,136-160`（`PASSWORD_MIN_LENGTH=12`、variety ≥ 2） |

> モックの `160` / `90日` / `hollow.example` は**プレースホルダ値**であり、本 Issue は backend 実挙動に合わせて修正した値を出す（モックの数値をそのまま写すと虚偽表示になる）。

---

## スコープ

### 含まれるもの（本 Issue で実装 — frontend 完結）

- **A: 設定ナビの「すべてのノートに戻る」戻り導線**（`SettingsSidebarNav.tsx` に `.sidebar-back` を追加。既存 plan の A-1）。
- **P21 自己紹介(bio) の文字数カウンタ**（client-side 算出。`現在文字数 / 500`。最大値は `BIO_MAX`（実値 500）を使用。モックの 160 は採らない）。
- **P21 ユーザー名の URL prefix 静的表示 + 公開 URL プレビュー**（`{appUrl}/u/` を input 前置 prefix として表示し、入力中の値で `{appUrl}/u/<newUsername>` をプレビュー。`appUrl` は `container.config.appUrl` を Page（server）から取得して Form へ渡す。ハードコードのダミードメインは出さない）。
- **P21 ユーザー名のレート制限ヘルプ**（「ユーザー名は30日に1回まで変更できます。」実値 30 日。`lastUsernameChangedAt` は UserDTO に無いため「次に変更できる日付」は出さず、静的な制限ルールのみ表示）。
- **P22 新パスワードの強度要件ヘルプ**（実 domain ルール「12文字以上、英字・数字・記号のうち2種以上」に沿った文言）。
- **全画面（P21〜P24）の section-desc 文言整合 + デザイントークン整合**（リテラル px 新規持ち込み回避）。
- **P24 アカウント削除 section-desc の「取り消せません」強調**（多段確認フローや実データ集計には踏み込まない）。

### 含まれないもの（別 Issue — 新規 backend が必要なため Phase 4 で起票）

いずれもモック自身の HTML コメントが「未実装(B 参照)」と宣言し、`.issue/500/followups.md` で「別Issue化候補: Yes」。追従に新規 backend（usecase/domain/adapter/DTO 拡張）が必須なため frontend 完結のスコープを超える。

- **アクティブセッション一覧**（端末ごとの行・行単位ログアウト・「このセッション」バッジ）— セッション一覧取得 usecase が新規必要（現状 `revokeSession` / 一括失効はあるが**一覧取得は無い**）。
- **多段アカウント削除確認**（同意チェック + DELETE 語入力 + パスワード再検証）— `deleteAccount` usecase は `confirmation`（username 一致）のみ。パスワード再検証拡張が必要。
- **削除影響の実データ集計リスト**（件数/容量/410 Gone/限定公開リンク失効数）— 複数ドメイン横断の集計 usecase が新規必要。
- **アバターアップロード配線**（avatar-large + アップロード/削除 + プレビュー）— media usecase はあるが UI/プレビュー/削除フローの新規構築が必要。
- **action-row「リセット」/「最終保存」タイムスタンプ** — `lastSavedAt` は UserDTO に無く backend 拡張が必要。リセット単体は frontend で可能だが「最終保存」とセットの UI なので、別 Issue「設定フィールド拡充」に同梱する。
- **P23 プロンプトプレビュー**（入出力サンプル・「サンプルで実行」）— LLM 実行プレビュー機構の新規構築が必要。
- **設定サブナビ配置の再構築**（`settings-grid`）— 実装は左サイドバー差し替え方式（index.md §2.4 が SSOT）で確定済み。再構築不要・対象外（ADR-001）。

### 「実装が正」とモック comment が認める箇所（変更しない — ADR-005）

- **P22**: メール変更が「現在のパスワード」を要求する点、パスワード変更の「他の端末からはログアウトする」任意チェック。
- **P23**: 各カード独立保存（グローバル「未保存の変更があります」は採らない）、実装 5 用途（モックは代表 3 用途のみ描画）。

---

## 調査結果

### 関連ファイル

- ルート:
  - `app/routes/_app/settings/route.tsx` — `/_app/settings` レイアウト。
  - `app/routes/_app/settings/{index,profile,security,prompts,account-delete}.tsx` — 各画面ルート（Page 呼び出し）。
- 設定シェル差し替え:
  - `app/routes/_app/route.tsx:129` — `AppShellFrame` に `settingsSidebar={<SettingsSidebarNav />}` を渡す。
  - `app/components/layout/AppShellDrawer.tsx:83,190` — `pathname.startsWith("/settings")` で設定ナビと通常サイドバーを切り替え（モック §2.4「左サイドバー差し替え」方式の実装本体）。
- 設定コンポーネント（`app/components/identity/`）:
  - `SettingsSidebarNav.tsx` — 設定ナビ（4 項目）。**`.sidebar-back` 欠落**。
  - `styles.ts` — 設定面の共有クラス文字列（`SECTION`/`SECTION_TITLE`/`SECTION_DESC`/`FIELD_*`/`ACTION_ROW`/`PROMPT_*` 等）。
  - `schema.ts` — zod 入力スキーマ。`BIO_MAX=500` / `DISPLAY_NAME_MAX=50` / `USERNAME_MAX=30`（transport 上限。domain は 32）/ `PASSWORD_MAX=128`。
  - `ProfileForm/{index,Page,action}.tsx` — 表示名・自己紹介（updateProfile）+ ユーザー名変更（changeUsername）の 2 フォーム。Page は server component（`requireCurrentUser`）。
  - `SecurityForm/{index,Page,action}.tsx` — パスワード変更・メール変更・セッション一括失効の 3 セクション。
  - `PromptsForm/{index,Page,action,schema}.tsx` — 用途別カスタムプロンプトカード。
  - `AccountDeleteForm/{index,Page,action}.tsx` — `ConfirmDialog`（ユーザー名一致のみ）経由の削除。
- backend / 実値の根拠（本 Issue では原則変更しない）:
  - `app/core/domain/identity/valueObject.ts` — `Bio.MAX_LENGTH=500`、`RawPassword`（12..128、英字/数字/記号のうち2種以上）、`Username`（3..32）。
  - `app/core/domain/identity/entity.ts:19,170-199` — `changeUsername` の 30 日クールダウン（`USERNAME_CHANGE_COOLDOWN_MS`）。
  - `app/core/application/identity/changeUsername.ts` — usecase は domain のクールダウンに委譲。
  - `app/core/application/dto/identity.ts` — `UserDTO`。`bio` は保持（カウンタ算出可）。**`lastUsernameChangedAt` / `lastSavedAt` は無い**（次回変更日・最終保存は frontend から取れない）。
  - `app/core/application/di/{types.ts:60, serverCloudflare.ts:205,323}` — `config.appUrl`（`APP_URL` env）。
  - 先行 URL 生成例: `app/components/note/detail/NoteDetail.tsx:99`（server で `appUrl` を受け取り `${appUrl}/u/${username}/...` を構築）、route loader `app/routes/_app/notes/$noteId/index.tsx:23-31`（`getContainer().config.appUrl`）。
  - 既存ヘルプ/ヒントのパターン: `app/components/auth/styles.ts`（`FIELD_HINT`/`FIELD_HINT_ERROR`/`FIELD_OPTIONAL`）、`app/components/auth/SignUpForm/index.tsx:215-221`（パスワードヒント「12文字以上。英数字と記号を組み合わせると安全です。」を `aria-describedby` 付きで表示する既存例）。
  - `app/core/application/identity/revokeSession.ts` — 個別セッション失効 usecase はあるが**一覧取得 usecase は無い**（含まれないものの根拠）。

### 既存実装 vs モック（in-scope 差分のみ）

#### P21 プロフィール（`ProfileForm`）

| モック | 現状実装 | 本 Issue の扱い | 実値 |
|---|---|---|---|
| section-desc「公開プロフィールページや共有時の表示に使われます。」 | desc 無し | **追従**（追加） | — |
| 自己紹介の文字数カウンタ（73/160） | 無し | **追従**（client 算出、`x / 500`） | BIO_MAX=500 |
| ユーザー名 prefix（`hollow.example/`） | 素の input | **追従**（`{appUrl}/u/` prefix。ダミードメインは不可） | appUrl + `/u/` |
| 公開 URL プレビュー | 無し | **追従**（`{appUrl}/u/<入力値>`） | 同上 |
| 90日レート制限ヘルプ | 無し | **追従**（「30日に1回まで」） | 30日 |
| アバターアップロード行 | 無し | スコープ外（別 Issue） | — |
| action-row「リセット」/「最終保存」 | 保存ボタンのみ | スコープ外（`lastSavedAt` 無し） | — |

#### P22 セキュリティ（`SecurityForm`）

| モック | 現状実装 | 本 Issue の扱い | 実値 |
|---|---|---|---|
| パスワード変更 desc「変更後、他のすべてのセッションは…」 | 確認要 | desc 整合確認・追従 | — |
| 新パスワード強度ヘルプ | （文言なし） | **追従**（実ルール文言を追加） | 12文字以上 + 2種以上 |
| メール変更 desc / 現在のパスワード要求 / 「他端末ログアウト」チェック | 整合（実装が正） | 変更しない（ADR-005） | — |
| アクティブセッション一覧 | 一括失効のみ | スコープ外（一覧取得 usecase 無し） | — |

#### P23 プロンプト（`PromptsForm`）

| モック | 現状実装 | 本 Issue の扱い |
|---|---|---|
| section-desc「各用途について…空欄なら既定の動作」 | 確認要 | desc 整合確認・追従 |
| 用途別カード / 5 用途 / 独立保存 | 整合（実装が正） | 変更しない（ADR-005） |
| プロンプトプレビュー | 無し | スコープ外（別 Issue） |

#### P24 アカウント削除（`AccountDeleteForm`）

| モック | 現状実装 | 本 Issue の扱い |
|---|---|---|
| section-desc「取り消せません」強調 | 強調なし平文 | **追従**（強調） |
| 多段確認（同意 + DELETE 入力 + パスワード再入力） | username 一致のみ | スコープ外（usecase 拡張要） |
| 削除影響の実データ集計リスト | desc 1 段落 | スコープ外（集計 usecase 要） |

### 設定ナビの差分

- **欠落: `.sidebar-back`（「すべてのノートに戻る」）** — モック 4 画面すべてが設定ナビ最上部にこの戻り導線を持つ。設定シェルでは通常サイドバーが設定ナビに差し替わるため、ロゴ以外でアプリへ戻る導線が消えており UX 上も追従価値がある。これは frontend 完結の実体ある差分。

### 依存関係

- `SettingsSidebarNav.tsx` の変更は `app/routes/_app/route.tsx`（settingsSidebar prop）経由で P21〜P24 全画面に反映。`AppShellDrawer` の focus-trap（`FOCUSABLE_SELECTOR`）に `.sidebar-back` の `<a>` が 1 つ加わる（最上部 = Tab 先頭、モック通り）。
- `ProfileForm` の URL プレビューは `appUrl` を要する → `ProfilePage`（server）で `getContainer().config.appUrl` を取得し prop で渡す（client コンポーネントは `config` を直接読めないため）。
- `identity/styles.ts` への追加（char-counter / field-help / input-group prefix 用クラス）は該当フォームのみに波及。

---

## 実装ステップ

### A. 設定ナビ — 「すべてのノートに戻る」戻り導線

- **対象:** `app/components/identity/SettingsSidebarNav.tsx`、`app/components/identity/styles.ts`（`SIDEBAR_BACK` 定数追加）
- **変更:** `<nav>` の前（設定ナビ最上部）に、ホーム（`/`）へ戻る `<Link>` を追加。`lucide-react` の `ArrowLeft` を `common/Icon` でラップ。`text-sm`（`--text-sm` = 13px 相当、リテラル px 回避）/ `gap-2`/`px-3`/`py-1.5`/`rounded-md`/`text-ink-secondary`/`hover:bg-surface`/`hover:text-ink`/`mb-5` 相当のユーティリティで構成し `identity/styles.ts` に `SIDEBAR_BACK` として集約。アクセシブル名「すべてのノートに戻る」。
- **型・規約上の必須事項（review P-001）:** ホームルートの `validateSearch`（`note/schema.ts:77-83`）の出力型により `<Link to="/">` は `search={HOME_SEARCH}`（`@/components/auth/links` からインポート）が無いと `MakeRequiredSearchParams` を満たせず typecheck が落ちる。**必ず `<Link to="/" search={HOME_SEARCH}>` の形にする。** 既存の戻り導線 `app/components/trash/TrashList.tsx:60`（`<Link to="/" search={HOME_SEARCH}>` + `<Icon icon={ArrowLeft} />` + ラベル）のパターンを踏襲し、型・スタイル両面で安全に。
- **理由:** モック 4 画面の SSOT 要求 + 設定シェルからの離脱導線。

### B. P21 プロフィール

#### B-1. section-desc の追従

- **対象:** `app/components/identity/ProfileForm/index.tsx`
- **変更:** `<h2>プロフィール</h2>` 直後に `<p className={SECTION_DESC}>公開プロフィールページや共有時の表示に使われます。</p>` を追加。

#### B-2. 自己紹介(bio) 文字数カウンタ

- **対象:** `app/components/identity/ProfileForm/index.tsx`、`app/components/identity/styles.ts`（`CHAR_COUNTER` 定数）
- **実値:** 最大 **500**（`BIO_MAX`。モックの 160 は採らない）。
- **変更:** bio textarea を controlled もしくは `onChange` で文字数 state を持ち、textarea 直下に `<p className={CHAR_COUNTER} aria-live="polite">{count} / {BIO_MAX}</p>` を表示。初期値は `user.bio?.length ?? 0`。`maxLength={BIO_MAX}` は既存どおり維持。`CHAR_COUNTER` は `text-xs text-ink-tertiary text-right mt-1`（モック `.char-counter` 相当、リテラル px なし）。
- **理由:** モック追従。client 完結（backend 不要）。表示する上限は実 domain 値に一致。

#### B-3. ユーザー名 URL prefix + 公開 URL プレビュー + レート制限ヘルプ

- **対象:** `app/components/identity/ProfileForm/index.tsx`、`ProfileForm/Page.tsx`、`app/components/identity/styles.ts`（`INPUT_GROUP` / `INPUT_GROUP_PREFIX` / `URL_PREVIEW` 定数）
- **実値:**
  - prefix / プレビューのベース = **`container.config.appUrl` + `/u/`**（公開ルート `/u/$username` に一致）。**ハードコードのダミードメイン（hollow.example）は出さない。**
  - レート制限 = **30日に1回**（`USERNAME_CHANGE_COOLDOWN_MS`）。
- **変更:**
  1. `ProfilePage`（server）で `getContainer().config.appUrl` を取得し `<ProfileForm user={...} appUrl={appUrl} />` で渡す（`ProfileForm` の props に `appUrl: string` を追加）。
  2. 新ユーザー名 input を `INPUT_GROUP`（flex のボーダー枠）でラップし、左に `<span className={INPUT_GROUP_PREFIX}>{prefixHost}/u/</span>`（`prefixHost` = `appUrl` から `https://` を除いたホスト表示。表示はホストのみでも可。リンク生成・コピーには絶対 URL を使う）を置く。input は枠内透明背景。
  3. input の `onChange` で現在値を state 化し、`<p className={URL_PREVIEW}>{base}/u/{newUsername || user.username}</p>` をプレビュー表示。**`base` は `appUrl.replace(/\/$/, "")` で末尾スラッシュを除去してから連結する（review S-001）。** `APP_URL` が末尾スラッシュ付きだと `//u/` の二重スラッシュになるため。先行例 `NoteDetail.tsx:99` と同じ正規化。
  4. レート制限ヘルプ `<p className={FIELD_HINT}>ユーザー名は30日に1回まで変更できます。</p>`（`FIELD_HINT` は `auth/styles.ts` 同等を `identity/styles.ts` に追加 or 既存 `CURRENT_VALUE` 系を流用）。`aria-describedby` で input と関連付け。
- **理由:** モック追従（中スコープ in-scope）。**全表示値が backend 実挙動に一致**（実 appUrl ベース・実クールダウン 30 日）。
- **見送り判断:** 「次に変更できる日付（例: 2026年X月Y日以降）」は `lastUsernameChangedAt` が UserDTO に無いため frontend から算出不可 → **出さない**（虚偽になる）。静的ルール文言（30日に1回まで）のみ表示する。

### C. P22 セキュリティ

#### C-1. section-desc 文言の整合確認・追従

- **対象:** `app/components/identity/SecurityForm/index.tsx`
- **変更:** パスワード変更 desc「変更後、他のすべてのセッションは自動的にログアウトされます。」、メール変更 desc「新しいアドレスに確認メールを送信します。…」の有無・文言を確認し、不足・乖離があればモックへ寄せる。実装挙動（現在のパスワード要求・他端末ログアウト任意チェック）は変えない（ADR-005）。

#### C-2. 新パスワード強度要件ヘルプ

- **対象:** `app/components/identity/SecurityForm/index.tsx`、（必要なら）`app/components/identity/styles.ts`（`FIELD_HINT`）
- **実値:** **12文字以上、英字・数字・記号のうち2種以上**（`RawPassword`: `PASSWORD_MIN_LENGTH=12`、variety ≥ 2）。
- **変更:** 「新しいパスワード」input 直下に `<p className={FIELD_HINT} id={...}>12文字以上。英字・数字・記号のうち2種以上を含めてください。</p>` を追加し、input の `aria-describedby` に紐付け。文言は既存 `SignUpForm` のパスワードヒント（`auth/SignUpForm/index.tsx:219-221`）と整合させ、実 domain ルール（2種以上）を正確に反映。
- **理由:** モック追従 + 実バリデーションルールの可視化。**実 domain ルールに厳密一致**（食い違うヘルプは禁止）。
- **注記:** transport schema（`changePasswordSchema.newPassword`）は `min(1)` のみで、実強度は domain `RawPassword` が enforce する。ヘルプは domain ルールを基準にする。

### D. P23 プロンプト

#### D-1. section-desc 文言の整合確認・追従

- **対象:** `app/components/identity/PromptsForm/index.tsx`
- **変更:** 「カスタムプロンプト」desc「各用途について、あなたの分析の意図を補足できます。空欄のままなら システム既定の動作が適用されます。」の有無・文言を確認し追従。カード構造・5 用途・独立保存は変えない（ADR-005）。

### E. P24 アカウント削除

#### E-1. section-desc の文言・強調の追従

- **対象:** `app/components/identity/AccountDeleteForm/index.tsx`
- **変更:** desc を「この操作は<strong className="font-medium text-ink">取り消せません</strong>。…」の形へ。多段確認・詳細リストには踏み込まない（含まれないもの / ADR-002・003）。

### F. トークン整合・px 棚卸し（全画面横断）

- **対象:** `app/components/identity/styles.ts`
- **変更:** 既存任意値 px（`PROMPT_TEXTAREA` の `min-h-[140px]`/`max-h-[300px]`、`SETTINGS_ERROR_BOX` の `max-w-[720px]` 等）と、新規追加クラス（char-counter / input-group / url-preview / field-hint）に新規リテラル px を持ち込まないことを確認。モック `.char-counter`(11px) / `.prefix`(13px font / 10px 12px padding) は `text-xs`/`text-sm`/`px-3`/`py-2.5` 等の既存ユーティリティへ写す。原則 no-op + 新規分のトークン整合。

---

## 設計判断

詳細は `.issue/543/adr.md` を参照。要点:

- **ADR-001:** 設定サブナビは「左サイドバー差し替え」を維持（`settings-grid` 再構築はしない）。
- **ADR-002:** backend 拡張が必要な拡充群（セッション一覧・多段アカウント削除・削除影響集計・アバター配線・リセット/最終保存）は本 Issue スコープ外。frontend 完結のもののみ追従。Phase 4 で「設定画面のフィールド拡充（backend 拡張要）」として 1 本に束ねて起票。
- **ADR-003:** 「実装が正」とモック comment が認める箇所（P22 メール変更のパスワード要求・「他端末ログアウト」チェック、P23 各カード独立保存・5 用途）は変更しない。
- **ADR-004:** ヘルプ/プレビュー表示は backend の実挙動に厳密一致させる（虚偽ヘルプ禁止）。実値が取れない表示（最終保存日・次回ユーザー名変更可能日・モックの 160/90日/hollow.example）は出さない。

---

## リスクと注意点

- **虚偽表示の混入回避（最重要）**: モックの数値（bio 160 / レート 90日 / ドメイン hollow.example）は backend 実値（500 / 30日 / 実 appUrl）と異なる。モックを写すと虚偽になる。**実値を採用**し、取れない値（次回変更可能日・最終保存）は出さない。レビューで実値一致を確認する。
- **appUrl の client 受け渡し**: `config` は client から直接読めないため、`ProfilePage`（server）→ `ProfileForm` props 経由で渡す（先行例: `NoteDetail`）。env 未設定時 `appUrl` が空のケースを考慮し、空ならホスト prefix を出さず相対 `/u/` 表示にフォールバックする（誤誘導回避）。
- **戻り導線とドロワー a11y**: A で `SettingsSidebarNav` に `<a>` を 1 つ足すと `AppShellDrawer` の focus-trap に含まれる。最上部 = Tab 先頭でモック通り。ドロワー閉じは pathname 変化 useEffect が担う。
- **char-counter の制御方式**: bio を controlled にすると IME 入力の確定挙動に注意。`onChange`/`onInput` で `value.length` を state 化し、textarea は uncontrolled（`defaultValue`）+ `onChange` でカウントのみ更新でも可（既存 `defaultValue` 構成を尊重）。
- **リテラル px 持ち込み禁止**: 新規クラス（char-counter/prefix/url-preview/hint）はすべて既存トークン由来ユーティリティで構成。
- **既存テストへの影響（review P-002）**: `app/components/identity/` 配下の既存テストは `AccountDeleteForm/__tests__/index.test.tsx` の 1 本のみ（`SettingsSidebarNav` / `ProfileForm` / `SecurityForm` のテストは**存在しない**）。よって `SettingsSidebarNav`・`ProfileForm`・`SecurityForm` のテストは「更新」ではなく**新規追加**になる。`AccountDeleteForm` の既存テストは desc 文言を assert していない（username 一致フローのみ）ため E-1 の `<strong>` 化で壊れない見込みだが、念のため確認する。`ProfileForm` に props（`appUrl`）を追加するため、新規テストではその prop を渡す。
- **section-desc 追従の過剰反応回避**: B-1/C-1/D-1 は desc が無い/文言が違う場合のみ追加・調整。整合済みなら no-op。

---

## テスト方針

詳細は `.issue/543/testing.md` を参照（plan 確定後に作成）。要点:

- **自動テスト（`pnpm test:unit`）** — `SettingsSidebarNav`/`ProfileForm`/`SecurityForm` は既存テストが無いため新規追加（review P-002）:
  - `SettingsSidebarNav`: 戻りリンクのレンダリング/href(`/`)/アクセシブル名。
  - `ProfileForm`:
    - bio 文字数カウンタが `初期値 / 500` を表示し、入力で更新されること。
    - URL prefix/プレビューが `appUrl` prop から `…/u/<入力値>` を構築すること、`appUrl` が空ならフォールバック表示になること。
    - レート制限ヘルプ「30日に1回」が表示されること（90日でないこと）。
  - `SecurityForm`: 新パスワード強度ヘルプ「12文字以上…2種以上」が表示され `aria-describedby` で input に紐づくこと。
  - `AccountDeleteForm`: desc の「取り消せません」強調を反映した既存テスト更新。確認フロー（ユーザー名一致）は不変。
  - `pnpm typecheck && pnpm lint:fix && pnpm format` を通す。
- **手動ブラウザ確認**（`docs/test.md` 準拠）:
  - P21〜P24 各画面で左サイドバー上部「すべてのノートに戻る」が出てホームに戻ること。
  - P21 で bio カウンタ・URL プレビュー（実 appUrl ベース）・30日ヘルプを目視。
  - P22 で新パスワードヘルプを目視。
  - モバイル幅でドロワーを開き戻りリンクが focus-trap 内・Esc で閉じること。
- **スコープ外機能の非実装確認**: アバター/セッション一覧/多段削除/プロンプトプレビュー/リセット・最終保存は本 Issue で追加しないことをレビューで明示（ADR-002 の根拠とともに）。

---

## Phase 4 で起票するフォローアップ候補

下記は新規 backend（usecase/domain/adapter/DTO 拡張）が必要なため本 Issue スコープ外。**テーマ「設定画面のフィールド拡充（backend 拡張要）」として 1 本の Issue に束ねて起票**する方針。

- **アクティブセッション一覧**: 端末ごとの行・行単位ログアウト・「このセッション」バッジ（セッション一覧取得 usecase + SessionService 拡張が必要）。
- **多段アカウント削除確認**: 同意チェック + DELETE 語入力 + パスワード再検証（`deleteAccount` usecase のパスワード再検証拡張 + 確認 UI 構築）。
- **削除影響の実データ集計リスト**: 件数/容量/410 Gone/限定公開リンク失効数（複数ドメイン横断の集計 usecase）。
- **アバターアップロード配線**: avatar-large + アップロード/削除 + プレビュー（media usecase はあるが UI/プレビュー/削除フローの新規構築）。
- **action-row「リセット」+「最終保存」タイムスタンプ**: `lastSavedAt` を UserDTO に載せる DTO/usecase 拡張（リセット単体は frontend で可能だが最終保存とセットの UI のため同梱）。
- **P23 プロンプトプレビュー**: 入出力サンプル・「サンプルで実行」（LLM 実行プレビュー機構）。

> 根拠: 各項目はモック HTML コメントが「未実装(B 参照)」と宣言し、`.issue/500/followups.md` で「別Issue化候補: Yes」。ユーザーがスコープ「中（frontend 完結）」を決定したため、backend 拡張を伴うこれらは束ねて切り出す。

---

## レビュー履歴

### 1周目（2視点並列）

**要件カバレッジ視点**: 問題点ゼロ。in-scope 7 項目すべてが実装ステップに落ち、実値（bio500/レート30日/パスワード12文字2種/URLベース=appUrl+/u/）がモックの飾り値ではなく backend 実挙動に整合、スコープ外項目の混入なしと確認。

**アーキ・リスク視点**: 全実値を一次ソースで裏取り済み・虚偽ヘルプ混入なしと確認。問題点 2 件を反映:
- **[P-001]** 戻り導線は `<Link to="/" search={HOME_SEARCH}>`（`@/components/auth/links`）にしないと typecheck が落ちる → ステップ A に明記、`TrashList.tsx:60` パターン踏襲を追記。
- **[P-002]** `SettingsSidebarNav`/`ProfileForm`/`SecurityForm` の既存テストは無い（identity 配下は `AccountDeleteForm` の 1 本のみ）→「更新」ではなく「新規追加」とリスク欄・テスト方針を修正。

**取り込んだ改善提案**:
- **[S-001/アーキ]** URL プレビューは `appUrl.replace(/\/$/, "")` で末尾スラッシュ正規化（二重スラッシュ回避、`NoteDetail.tsx:99` と同じ）→ B-3 に明記。

**見送った/対応不要の提案**:
- **[S-001/要件]** P22/P23 の section-desc 逐語転記 → C-1/D-1 に既に逐語掲載済みのため対応不要。
- **[S-002/要件]** P24 `danger-note` 行 → in-scope 列挙に無く、見送りでも整合は崩れないため見送り（多段確認フロー周辺は別 Issue）。
- **[S-002/アーキ]** `styles.ts` の既存 arbitrary px → F の主旨は「新規追加クラスに新規 px を持ち込まない」で正しく、既存分は規約違反でないため棚卸しのみ。
- **[S-003/アーキ]** `USERNAME_MAX` transport(30) vs domain(32) 差 → 本 Issue では無害（対応不要）。

**収束判定**: 要件視点は当初から問題点ゼロ、アーキ視点の P-001/P-002 は機械的なドキュメント修正で完全反映済み。改善提案も取捨選択済み。計画は両視点で問題なしと判断し、1周で収束とする。
