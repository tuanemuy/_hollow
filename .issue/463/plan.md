# 実装計画 — Issue #463: feat(settings): 設定画面のスタイリングを実装する＋UserMenu の設定ボタンが開いた瞬間グレーになる挙動を修正

**Issue:** #463
**作成日:** 2026-06-04
**複雑度:** 中〜大規模

---

## 目的

2つの見た目の問題をまとめて解消する。

1. 設定画面（`/settings` レイアウト＋4つの identity フォーム）が無スタイルの素 HTML 状態。既存の `tokens.css` デザイントークンと utility-first Tailwind 規約に沿ってスタイリングし、他の出荷済み画面に視覚的に馴染ませる。
2. `UserMenu` のポップアップを**マウスで開いた瞬間**に先頭「設定」項目がグレー（`bg-surface`）でハイライトされる不自然な挙動を直す。

ロジック（server-fn 呼び出し・state・a11y 属性）は一切変更しない。対象はビジュアル層と UserMenu のハイライト挙動のみ。

## スコープ

### 含まれるもの

- `app/routes/settings/route.tsx`（レイアウト + errorComponent）のスタイリング
- `app/components/identity/{ProfileForm,SecurityForm,PromptsForm,AccountDeleteForm}/` のスタイリング
- 各 `app/components/identity/{...}/Page.tsx` の見出し重複整理
- 設定画面共有スタイル定数 `app/components/identity/styles.ts` の新設
- `app/components/layout/styles.ts` の `USER_MENU_ITEM` を `focus-visible:` 化

### 含まれないもの

- ロジック変更（server-fn 呼び出し、useActionState、バリデーション、a11y 属性の追加/削除）
- `/settings` への header/sidebar shell の新規追加（トップレベル独立ページの構造は維持）
- 新規デザイントークンの定義（`tokens.css` への追加）
- 新規 CSS ファイル / `@apply` の追加
- `directory` アクションメニュー（`app/components/directory/styles.ts` の同型 `focus:bg-surface`）の修正 — 同じ「開いた瞬間グレー化」バグが存在するが、本 Issue は UserMenu に限定。Phase 4 で別 Issue 化を検討する。

## 実装ステップ

### 1. UserMenu のハイライト挙動を修正

- **対象ファイル:** `app/components/layout/styles.ts`
- **変更内容:** `USER_MENU_ITEM` の `focus:bg-surface` を `focus-visible:bg-surface` に変更。`hover:bg-surface` はそのまま維持。**同時に `data-[danger]:focus-visible:bg-error-surface` を併記する（確定）** — danger 項目（ログアウト）は現状 `focus` 用背景を持たず `data-[danger]:hover:bg-error-surface` のみのため、`focus:` を単に `focus-visible:` に置換するとキーボードで矢印移動した際に danger のハイライトが完全に消えて視認性が後退する。non-danger は `focus-visible:bg-surface`、danger は `data-[danger]:focus-visible:bg-error-surface` で両立させる。
- **理由:** `UserMenu.tsx:91-96` の roving-tabindex がメニューを開くと先頭項目へプログラム的に `.focus()` する。`focus:` はマウス由来フォーカスでも発火するため開いた瞬間グレー化する。`focus-visible:` はキーボード操作時のみ発火し、マウスで開いた場合はハイライトされない（王道の修正）。`UserMenu.tsx` 側のオートフォーカスは WAI-ARIA メニューの正しい挙動なので変更しない。

### 2. 設定フォーム用の共有スタイル定数を新設

- **対象ファイル:** `app/components/identity/styles.ts`（新規）
- **変更内容:** `auth/styles.ts` に倣い、`common/styles.ts` の primitive を import して合成。レイアウト系（`SETTINGS_WRAP`/`SETTINGS_TITLE`/`SETTINGS_SUBTITLE`/`SETTINGS_GRID`/`SETTINGS_NAV`/`SETTINGS_NAV_ITEM`/`SETTINGS_CONTENT`/`SETTINGS_BACK_LINK`/`SETTINGS_ERROR_*`）とフォーム系（`SECTION`/`SECTION_TITLE`/`SECTION_DESC`/`SECTION_DIVIDER`/`FORM`/`FIELD`/`FIELD_LABEL`/`FIELD_INPUT`/`FIELD_TEXTAREA`/`FIELD_ERROR`/`SUCCESS_MSG`/`CHECKBOX_ROW`/`ACTION_ROW`/`BTN_PRIMARY`/`BTN_SECONDARY`/`BTN_DANGER`/`CURRENT_VALUE`、PromptsForm 用 `PROMPT_*`）を定義。最終名は実装時に既存命名へ寄せる。
  - **`SETTINGS_NAV_ITEM` のアクティブ表現:** デザイン P21 はブレークポイントで active 配色が異なる（mobile 横スクロール時 active=`bg-ink text-white`、`lg:` 時 active=`bg-surface text-ink`）。`layout/styles.ts` の `NAV_ITEM`（`aria-[current=page]:bg-surface` 単一）はそのまま流用できないため、`max-lg:aria-[current=page]:bg-ink max-lg:aria-[current=page]:text-white lg:aria-[current=page]:bg-surface lg:aria-[current=page]:text-ink` のように出し分ける。CLAUDE.md 規約に合わせ `data-active={active||undefined}` 属性も付与する（`aria-current` は既存維持）。
  - **入力欄の error バリアント:** ProfileForm/SecurityForm は `data-[error]` を持つフォーム。`common/fieldControl` は error バリアントを持たないが、`auth/styles.ts` の `INPUT` は `data-[error]` 完備。入力欄自体にエラー視覚フィードバックを出すなら `auth` の `INPUT` 系統を再利用するのがデザイン準拠度が高い（ただしエラーは `<p role="alert">` で既に出ているため必須ではない）。どちらを SSOT にするか実装前に確定し、`identity/styles.ts` のコメントに根拠を残す。
- **理由:** CLAUDE.md「繰り返すユーティリティ文字列は module-scoped 定数へ括り出す」慣習に従い、4フォームと layout で共有する。`common/styles.ts` の primitive を最大限再利用して重複を避ける。

### 3. 設定レイアウト route をスタイリング

- **対象ファイル:** `app/routes/settings/route.tsx`
- **変更内容:** `SettingsLayout` のルート div / 戻りリンク / h1「設定」/ サブタイトル / サブナビ（各 Link に `data-active={active || undefined}` ＋ アクティブバリアント、`aria-current` は既存維持）/ Outlet ラッパに定数を適用。`errorComponent` も `role="alert"` を維持しつつスタイル付与。
- **理由:** Issue 指定の無スタイル箇所（:46-51, :54-82）を規約準拠化。アクティブナビを `data-*` + バリアントで表現する規約に合わせる。

> **ステップ4〜7 共通のスコープ注記:** 既存の DOM 構造に対するスタイリングのみを行う。デザイン HTML（P21〜P24）に登場するが実装に存在しない UI 要素（アバターアップロード、char-counter、URL プレビュー、external-link、最終保存時刻、input-group の prefix 等）は**追加しない**。Issue はスタイリングであり機能追加ではない。

### 4. ProfileForm をスタイリング

- **対象ファイル:** `app/components/identity/ProfileForm/index.tsx`（および `Page.tsx`）
- **変更内容:** `<section>`/`<h2>`/`<label>`/`<input>`/`<textarea>`/エラー/成功/`<button>`/`<hr>` に対応する定数を適用。a11y属性・state・server-fnロジックは不変。
- **理由:** 無スタイル箇所の解消。デザイン P21 の field/section 構造に合わせる。

### 5. SecurityForm をスタイリング

- **対象ファイル:** `app/components/identity/SecurityForm/index.tsx`
- **変更内容:** ProfileForm と同様に SECTION/FIELD/INPUT/BTN/区切りを適用。チェックボックス行は `CHECKBOX_ROW`、現在値表示（メール）は `CURRENT_VALUE`。
- **理由:** 同上。3フォーム中最大の無スタイル領域。

### 6. PromptsForm をスタイリング

- **対象ファイル:** `app/components/identity/PromptsForm/index.tsx`
- **変更内容:** 外側 section / 各 PromptRow カード / 小見出し / 状態説明 / `<details>/<summary>/<pre>` / textarea / 保存・デフォルト復帰ボタンに定数を適用。
- **理由:** 同上。デザイン P23 のカード状プロンプト編集に寄せる。

### 7. AccountDeleteForm の外枠をスタイリング

- **対象ファイル:** `app/components/identity/AccountDeleteForm/index.tsx`
- **変更内容:** 既存の `pillBtn`/`pillBtnDanger`/`ConfirmDialog` は維持。無スタイルの `<section>/<h2>/<p>` に `SECTION`/`SECTION_TITLE`/`SECTION_DESC`/`FIELD_ERROR` を付与。ロジック・属性は不変。
- **理由:** 部分スタイル済みだが外枠が無スタイルのため、他フォームと視覚的に揃える。

### 8. Page.tsx の見出し重複を整理

- **対象ファイル:** `app/components/identity/{...}/Page.tsx`
- **変更内容:** layout 側の大見出し「設定」＋各 Page の `<h1>...</h1>`＋フォーム内 `<h2>` の三重見出しが、スタイルを当てると視覚的に破綻する。デザイン P21 ではコンテンツ側に大 h1 は無く section-title（h2 相当）のみ。**対応は sr-only 案に確定** — 各 Page の `<h1>` は `className="sr-only"` で視覚的に隠しつつページごとに1つ保持する（h1→h2 への「降格」案は、フォーム内の既存 h2 と同レベルの重複見出しが並びアウトラインが破綻するため不採用）。`SR_ONLY` という共有定数はコードベースに存在しない（`sr-only` ユーティリティクラス直書きが既存慣習）ため、`className="sr-only"` を直接付与する。
- **理由:** 二重見出しの視覚的破綻を避けつつ、ページごとに h1 を1つ保持して文書アウトラインの a11y を維持する。

### 9. 検証

- `pnpm typecheck && pnpm lint:fix && pnpm format` を通す。続けて `pnpm dev` で目視確認。

## 設計判断

- **UserMenu の修正方針:** `focus:bg-surface` → `focus-visible:bg-surface`（Issue の王道案）を採用。オートフォーカス抑制案は WAI-ARIA メニューの初期フォーカス契約を崩すため非推奨。danger 項目のキーボードハイライト消失を防ぐため `data-[danger]:focus-visible:bg-error-surface` を併記する。
- **Page.tsx の見出し:** sr-only 案に確定。各 Page の h1 を `sr-only` で隠してページごとに1つ保持し、フォーム内 h2 群を配下に置く正しいアウトラインにする。h2 への降格は重複見出しを招くため不採用。
- **danger ハイライトのクラス順序依存:** `focus-visible:bg-surface`（non-danger）と `data-[danger]:focus-visible:bg-error-surface`（danger）は danger 行で同一プロパティ（background）を争う。Tailwind 生成 CSS では2段スタック variant（`data-[danger]:focus-visible:`）が単一 `focus-visible:` より後にソートされ決定的に勝つ。先例: `auth/styles.ts` の `INPUT`（`focus-visible:bg-bg` を `data-[error]:bg-error-surface` が上書き）、ADR-003（`.issue/273/adr.md`）。実装時はクラス文字列の並び順を誤らないこと。
- **styles.ts の置き場所:** `app/components/identity/styles.ts` を新設。`layout/styles.ts` はアプリシェル専用で、設定画面はトップレベルの独立サーフェスのため意味的に別。共有 primitive は `common/styles.ts` から import して合成。
- **`.input` のスタイル系統:** デザイン HTML は `border-hairline-strong bg-bg` 系だが、実装の一貫性（admin/auth と同系統）を優先し `common` の `fieldControl` 系を再利用。寸法・階層感はデザインに寄せる。
- **設定レイアウトの shell:** デザイン HTML はアプリ header/sidebar 込みだが、`/settings` はトップレベルで shell を継承しない独立ページ。header/sidebar shell の新規追加はスコープ外。サブナビ＋コンテンツのレイアウトのみデザインに寄せる。

## リスクと注意点

- `focus-visible` 化でキーボード操作（Tab/矢印キーで開閉）時のハイライトが消えないか実機確認する。
- danger 項目のキーボードフォーカス時に背景が付かなくなる可能性（上記設計判断）。矢印キーでログアウトへ移動した時の視認性を確認。
- レスポンシブ: 設定サブナビは desktop（`lg:`）縦／active=`bg-surface`、mobile 横スクロール／active のデザイン差がある。`max-lg:`/`lg:` バリアントで表現し、新規 `@media` は書かない（`--breakpoint-*` 重複定義に触れない）。
- Page.tsx の h1 を sr-only/降格すると文書アウトラインが変わるため、見出し階層が崩れないよう注意。
- 既存テスト: identity フォームに DOM/スナップショットテストがあれば `className` 追加で壊れうるため、実装前に `app/components/identity/**/__tests__` を確認する。

## テスト方針

- `pnpm typecheck && pnpm lint:fix && pnpm format` を通す。
- `pnpm dev` で `/settings/{profile,security,prompts,account-delete}` を目視確認（タイトル/サブナビ/アクティブ状態/フォームが他画面と馴染むか）。
- UserMenu: マウスクリックで開いた瞬間に先頭がグレー化しないこと、キーボード（Enter/Space→矢印）でハイライトが正しく出ること、Escape クローズ・フォーカス復帰が壊れていないことを確認。
- レスポンシブ: `sm`/`lg` ブレークポイント前後でサブナビのレイアウト切替を確認。
- 既存の identity 関連テストがあれば `pnpm test:unit` で回帰確認（調査時点で `app/components/identity/**/__tests__` にコンポーネントテストは存在せず、`className` 追加による回帰リスクは実質ゼロ）。

## レビュー履歴

### 1周目

**修正した点（要件カバレッジ視点は問題点ゼロ、アーキ・リスク視点から2件）**:
- P-001（ステップ8の見出し整理）: sr-only 案に確定。h2 への降格は重複見出し・アウトライン破綻を招くため不採用と明記。`SR_ONLY` 共有定数は存在しないため `className="sr-only"` 直書きに訂正。
- P-002（UserMenu の danger ハイライト消失）: `data-[danger]:focus-visible:bg-error-surface` の併記を「検討」から「確定」に格上げし、ステップ1と設計判断に反映。

**取り込んだ改善提案**:
- S-002（アーキ視点）: サブナビ active 配色のブレークポイント出し分け（mobile=`bg-ink text-white` / `lg:`=`bg-surface text-ink`）をステップ2に明示。
- S-003（アーキ視点）: デザインにあるが未実装の UI 要素は追加しない旨をステップ4〜7のスコープ注記に明記。
- S-001（要件視点）: `SR_ONLY` 定数は存在せず `sr-only` クラス直書きが慣習である点を訂正（P-001 対応に統合）。
- S-001（アーキ視点）: 入力欄の error バリアント（auth `INPUT` vs common `fieldControl`）の選択指針をステップ2に追記。

**見送った提案とその理由**:
- なし（指摘はすべて反映、または既に計画に織り込み済み）。

### 2周目

両視点とも **問題点ゼロ** で終了（収束）。

**取り込んだ改善提案**:
- S-001（アーキ視点）: danger ハイライトが Tailwind クラス順序依存で勝つ点（ADR-003 と同根拠）を設計判断に明記。
- S-002（アーキ視点）: 同型バグが `directory` メニューにも存在する旨を「含まれないもの」に追記（Phase 4 で別 Issue 化を検討）。
- S-001（要件視点）: 入力欄 error バリアントの SSOT は `common/fieldControl` 系（admin/auth と同系統）に倒す方針が妥当 — ステップ2の指針として確認済み。

