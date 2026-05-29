# 動作確認計画 — Issue #152: disabled 中の hover utility 無効化を pill button ファミリーに横断適用

**Issue:** #152
**作成日:** 2026-05-29

---

## 確認環境

このIssueの変更（CSS utility 文字列のみ）を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm dev
```

`vite dev`（Cloudflare 構成）でローカル開発サーバーが起動する。表示された URL をブラウザで開く。

### デプロイ方法

なし（検証環境のみで確認できる。CSS の見た目変更でありデータ・マイグレーション不要）。

## 確認項目

### 1. disabled な primary pill ボタンに hover しても色が変わらない

- **目的:** `pillBtn` + `pillBtnPrimary` の `<button disabled>` で hover による背景色変化が起きないこと。
- **手順:**
  1. disabled な primary pill ボタンを含む画面を開く（例: 履歴復元パネルで対象ノートがゴミ箱にある場合の「この版に復元」ボタン、または各種フォームで未入力時に disabled になる送信系ボタン）。
  2. その disabled ボタンにマウスカーソルを乗せる。
- **期待結果:** 背景色・文字色が変化しない。押下スケール（縮み）も起きない。`cursor-not-allowed` のままで opacity も下がったまま。
- **確認ポイント:** hover 前後で背景色が同一であること。

### 2. aria-disabled な pill 要素に hover しても色が変わらない

- **目的:** アンカー（`<Link>`）含む `aria-disabled="true"` の pill 要素で hover 色変化が起きないこと（ADR-001）。
- **手順:**
  1. `note/history/NoteRevisionRestorePanel` の「この版に復元」ボタンが trashed（ゴミ箱内ノート）で `aria-disabled="true"` になる状態を作る、もしくは pillBtn を使う Link が無効化される動線を開く。
  2. その要素に hover する。
- **期待結果:** hover で背景色・文字色が変化しない。
- **確認ポイント:** DevTools で対象要素に `aria-disabled="true"` が付いていることを確認した上で hover する。

### 3. 有効な pill ボタンの hover は従来通り変化する（リグレッション確認）

- **目的:** 修正が有効状態の hover 挙動を壊していないこと。
- **手順:**
  1. 有効な（disabled でない）primary / 通常 / danger の pill ボタンに hover する。
  2. ダイアログを開き、×ボタン（`dialogCloseButton`）に hover する。
  3. WYSIWYG エディタを開き、ツールバーボタン（`EDITOR_TOOLBAR_BTN`）に hover する。
- **期待結果:** いずれも従来通り hover で背景色が変化し、active（押下）でも従来通りの見た目になる。
- **確認ポイント:** primary は accent-hover、通常は surface-hover、danger は error-surface、×ボタンは surface/ink に変わること。

## エッジケース・異常系

### 1. disabled な danger pill ボタンの hover

- **目的:** `pillBtnDanger` の disabled 時に hover で error-surface に変化しないこと。
- **手順:** danger variant の pill ボタンが disabled になる動線で hover する。
- **期待結果:** 背景色が変化しない。

## 既存機能への影響確認

- 全 pill ボタン消費箇所（`pillBtn` / `dialogCloseButton` 利用コンポーネント、WYSIWYG ツールバー）で、有効時のクリック・hover・active が従来通り動作すること。挙動を変えるのは「disabled 時の hover/active のみ」。

## 確認チェックリスト

- [ ] disabled な primary pill ボタンに hover → 色変化なし
- [ ] aria-disabled な pill 要素に hover → 色変化なし
- [ ] disabled な danger pill ボタンに hover → 色変化なし
- [ ] 有効な pill ボタン（通常/primary/danger）の hover → 従来通り変化
- [ ] ダイアログ×ボタンの有効時 hover → 従来通り変化
- [ ] WYSIWYG ツールバーボタンの有効時 hover/active → 従来通り変化
- [ ] `pnpm build` の生成 CSS に `not-aria-disabled:` 由来の class が出力されている
