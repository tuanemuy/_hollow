# 動作確認計画 — Issue #418: テキストリンク装飾を common primitive へ統一する

**Issue:** #418
**作成日:** 2026-06-03

---

## 確認環境

このIssueの変更は `app/components/common/styles.ts`（`textLink` 追加）/ `app/components/auth/styles.ts`（3 定数を合成へ）/ `app/components/public/PublicLayout.tsx`（死蔵再エクスポート削除）のスタイル定数・className のみ。対象のテキストリンクはすべて auth 画面（ログイン・サインアップ・パスワードリセット）にあり、未認証で到達できるためログイン不要で検証できる。

### 検証環境の起動

ライブソースを HMR で確認する（フロントの styling 変更なので vite dev で十分）:

```
pnpm dev
```

対象は auth 画面のみで DB シード不要（フォーム表示と装飾の確認のみ）。

`pnpm start`（`wrangler dev`）はビルド済み `dist` を配信するため、live source は反映されない。本 Issue は dev サーバーでの確認を基本とする。

### 生成 CSS の同一性確認

`CALLOUT_ACTION` の合成置換で hover トークンの並びが変わっても最終 CSS が不変であることをビルドで裏取りする:

```
pnpm build
```

### デプロイ方法

なし（検証環境のみで確認できる）。

## 確認項目

### 1. AUTH_FOOTER_LINK（フッターリンク）の装飾

- **目的:** `textLink` 合成後もフッターリンクが従来どおりの accent 色・hover 下線・3px offset で表示される。
- **手順:**
  1. `/login` を開く。
  2. 画面下部の「アカウントを作成」リンク（フッター）を確認する。
  3. リンクにマウスホバーする。
- **期待結果:** リンク文字が accent 色。ホバー時に下線が表示され、下線は文字から 3px のオフセットを持つ。
- **確認ポイント:** ホバー前は下線なし、ホバーで下線が出る。色・オフセットが従来と同一。

### 2. FIELD_LINK（フィールド内リンク）の装飾

- **目的:** `text-sm ${textLink}` 合成後も「パスワードを忘れた」リンクが従来どおり表示される。
- **手順:**
  1. `/login` を開く。
  2. パスワード入力欄ラベル行の「パスワードをお忘れですか？」相当のリンクを確認する。
  3. ホバーする。
- **期待結果:** small サイズ（text-sm）の accent 色リンク。ホバーで 3px offset の下線。
- **確認ポイント:** フォントサイズが本文より小さい（text-sm）こと、色・下線挙動が AUTH_FOOTER_LINK と同質であること。

### 3. CALLOUT_ACTION（確認メール再送ボタン）の装飾

- **目的:** `inline-flex ... ${textLink} ... disabled:opacity-60` 合成後もボタンが従来どおり表示・挙動する。
- **手順:**
  1. 未確認メールアドレスのアカウントでログインを試みるか、確認メール再送の callout が表示される状態にする（callout 内に「確認メールを再送」ボタンがある画面）。
  2. ボタンの色・アイコン（ChevronRight）並び・font-medium を確認する。
  3. ホバーで下線、クリックで pending（disabled）状態を確認する。
- **期待結果:** accent 色・font-medium・アイコン付き。ホバーで 3px offset の下線。pending 中は opacity 60% で disabled。
- **確認ポイント:** inline-flex レイアウト（アイコンと文字が gap-1 で並ぶ）、disabled 時の半透明が従来どおり。

## エッジケース・異常系

### 1. PUBLIC_TEXT_LINK_SIGNUP（public ヘッダ）が無影響

- **目的:** 死蔵再エクスポート削除が public ヘッダの「サインアップ」リンク表示に影響しないこと。
- **手順:**
  1. `/`（public トップ）を開く。
  2. ヘッダ右側の「サインアップ」リンク（`PUBLIC_TEXT_LINK_SIGNUP`）を確認する。
- **期待結果:** 従来どおり surface-hover の pill 風リンクとして表示される（accent 下線リンクには変わらない）。

## 既存機能への影響確認

- auth 各フォーム（LoginForm / SignUpForm / PasswordResetRequestForm / PasswordResetConfirmForm / AdminSignUpForm）のフッターリンクが全画面で従来どおり表示されること。
- public ヘッダの「サインアップ」リンクが無変化であること。

## 確認チェックリスト

- [ ] AUTH_FOOTER_LINK: accent 色・hover 下線・3px offset
- [ ] FIELD_LINK: text-sm + accent 色・hover 下線
- [ ] CALLOUT_ACTION: inline-flex・font-medium・hover 下線・disabled 半透明
- [ ] PUBLIC_TEXT_LINK_SIGNUP: 無影響（pill 風のまま）
- [ ] `pnpm build` が通り、生成 CSS に視覚差分が出ない
