# 動作確認計画 — Issue #309: ボタン形態ガイドライン横断適用

**Issue:** #309
**作成日:** 2026-05-29

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。本Issueは純粋なフロントエンドの視覚・a11y 変更で、DB スキーマ変更はない。

### 検証環境の起動

```bash
# ローカル D1 にマイグレーション適用（初回・未適用時のみ）
pnpm db:apply:local

# 開発サーバー起動（Cloudflare 向け vite dev）
pnpm dev
```

### デプロイ方法

なし（検証環境のみで確認できる視覚・a11y 変更）。

## 確認項目

### 1. Landing ページ（領域3）

- **目的:** inline SVG → `Icon` 置換後もアイコンが正しく描画され、レイアウトが崩れないこと
- **手順:**
  1. 未認証状態で `/`（未認証時に LandingPage が描画される）を開く
  2. FEATURE カード 4 つのアイコン（アップロード / メタデータ / 公開・共有 / エクスポート）を確認
  3. プレビューパネル左サイドのアイコン（すべてのノート / 最近更新 / お気に入り / Research / 日記）を確認
  4. TEASER「公開検索を試す」リンク末尾の chevron を確認
  5. HERO_EYEBROW の小円・プレビューバーのドットが従来通り（CSS/SVG の塗り円のまま）であることを確認
- **期待結果:** すべてのアイコンが描画され、カード・サイドのレイアウトが崩れない。純装飾ドットは見た目変化なし
- **確認ポイント:** FEATURE_ICON（48px 箱に 24px アイコン）の中央配置、サイドアイコン（16px）の text-ink-secondary 色継承

### 2. AdminSignUpForm（領域3/4）

- **目的:** Setup Token 表示トグルがアイコン切替で動作し、モバイルでタップ領域 44×44px を満たすこと
- **手順:**
  1. `/setup` を開く（`ADMIN_SETUP_TOKEN` が設定されている環境でのみ表示。未設定だと 404）
  2. Setup Token フィールド右の表示トグルボタンをクリック
  3. アイコンが Eye ⇔ EyeOff で切り替わり、入力が password ⇔ text で切り替わることを確認
  4. ボタンに hover してツールチップ（title）が出ることを確認
  5. CALLOUT（特権操作の注意）の Info アイコン、Setup Token エラー時の FORM_ERROR アイコンを確認
  6. DevTools をモバイル幅（<640px）にしてトグルボタンの実寸が 44×44px 以上であることを確認
- **期待結果:** Eye/EyeOff 切替が機能し、モバイル幅で 44×44px、デスクトップで 36×36px。`aria-label` が状態に応じて変化
- **確認ポイント:** トグルボタンの accessible name（aria-label）が二重化していない（Icon は aria-hidden）

### 3. WysiwygEditor 書式ツールバー（領域1）

- **目的:** テキストラベル → icon-only 化後、各書式ボタンが機能・a11y・タップ領域を満たすこと
- **手順:**
  1. ログインしてノート編集画面を開き、エディタを WYSIWYG モードにする
  2. ツールバーの各ボタン（Bold/Italic/Strike/H2/H3/箇条書き/番号付き/引用/コード/リンク）がアイコン表示になっていることを確認
  3. 各ボタンをクリックして書式が適用され、`aria-pressed`（背景反転 = data-primary）でアクティブ状態が判別できることを確認
  4. 各ボタンに hover してツールチップ（title）が出ることを確認
  5. DevTools をモバイル幅にして各ボタンが 44×44px 以上であることを確認
- **期待結果:** 全ボタンがアイコンのみで機能。アクティブ時に accent 背景反転。モバイルで 44×44px
- **確認ポイント:** アクティブ状態の視認性（icon-only でも判別可能か）、ツールバー全体の形態統一

### 4. 他 auth 画面（領域3）

- **目的:** LoginForm / VerifyEmail / EmailChangeConfirm の装飾アイコン置換でレイアウト崩れがないこと
- **手順:**
  1. `/login` でエラー（誤ったパスワード）を発生させ FORM_ERROR の AlertCircle を確認
  2. 未確認アカウントでログインし CALLOUT の再送リンク（chevron）を確認
  3. メール確認リンク（`/verify-email?token=...`）の各状態（success/expired/used 等）で STATUS_ICON（72px 円内のアイコン）を確認
- **期待結果:** STATUS_ICON は 72px 円の中央に Check/Clock/AlertCircle（24px）が表示。レイアウト崩れなし
- **確認ポイント:** 36→24 の縮小で円内の余白が増えるが許容範囲か

## エッジケース・異常系

### 1. アイコンの a11y（スクリーンリーダー）

- **目的:** 装飾アイコンが SR に読まれず、icon-only ボタンの accessible name が正しいこと
- **手順:**
  1. DevTools のアクセシビリティツリーで Landing/auth の装飾アイコンが `aria-hidden` であることを確認
  2. WysiwygEditor・REVEAL_BTN の icon-only ボタンの accessible name が aria-label のみ（二重化なし）であることを確認
- **期待結果:** 装飾アイコンは hidden、icon-only ボタンは単一の accessible name

## 既存機能への影響確認

- WysiwygEditor の書式適用・リンク挿入・`[[` 内部リンクサジェスト・未対応タグ警告が従来通り動作すること（icon-only 化はツールバー見た目のみの変更）
- AdminSignUpForm の登録フロー（送信・バリデーション）が従来通り動作すること

## 確認チェックリスト

- [ ] Landing: 全アイコン描画・レイアウト維持・純装飾ドット不変
- [ ] AdminSignUpForm: Eye/EyeOff トグル動作・モバイル 44×44px・title 表示
- [ ] WysiwygEditor: 全ボタン icon 表示・書式適用・aria-pressed 判別・モバイル 44×44px・title 表示
- [ ] 他 auth: STATUS_ICON / CALLOUT / FORM_ERROR のアイコン描画・レイアウト維持
- [ ] 装飾アイコンが aria-hidden、icon-only ボタンの accessible name が二重化していない
- [ ] WysiwygEditor の既存機能（書式・リンク・サジェスト・未対応タグ警告）が動作
- [ ] DevTools で lucide が named import（barrel でない）、`Icon` に w-*/h-* が渡っていない
