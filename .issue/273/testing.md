# 動作確認計画 — Issue #273: pillBtn (common) と PILL_BTN (layout) を 1 系統に集約する

**Issue:** #273
**作成日:** 2026-05-29

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。純粋なスタイル定数の統合のため、追加のマイグレーション・シードは不要。

### 検証環境の起動

```bash
pnpm dev
```

（`vite dev --config vite.config.cloudflare.ts` が起動する。ブラウザで表示された localhost URL を開く）

### デプロイ方法

なし（検証環境のみで確認できる）。

## 確認項目

### 1. primary pill ボタンの表示・動作

- **目的:** 移行後も primary variant（アクセント色）が従来どおり表示・動作すること
- **手順:**
  1. ログインしてヘッダー右上の「新規作成」ボタン（`Header.tsx`）を確認
  2. タグ管理画面でタグ作成フォームの作成ボタン（`CreateTagForm.tsx` / `TagActions.tsx` の編集系）を確認
  3. アップロードプレビューの「登録」ボタン（`IngestionPreviewForm.tsx`）を確認
- **期待結果:** アクセント色背景・白文字で表示され、hover でアクセントの hover 色に変わる
- **確認ポイント:** 色・角丸・高さが従来と同じであること

### 2. 通常 pill ボタンの表示・動作

- **目的:** plain variant（surface 背景）が従来どおり表示されること
- **手順:**
  1. ヘッダーのアップロードボタン（`Header.tsx`）
  2. ゴミ箱画面の「復元」「ホームへ」ボタン（`TrashRowActions.tsx` / `TrashList.tsx`）
  3. ジョブ一覧の「再生成」「ノートを開く」（`IngestionJobRow.tsx`）
- **期待結果:** surface 背景・通常文字色で表示され、hover で surface-hover 色に変わる

### 3. danger pill ボタンの表示・動作（hover で赤維持）

- **目的:** danger variant が表示され、hover でも赤を維持すること（ADR-002）
- **手順:**
  1. アカウント削除画面の「削除を開始」ボタン（`AccountDeleteForm`）
  2. ゴミ箱の「完全に削除」（`TrashRowActions.tsx`）
  3. ジョブ行の「破棄」（`IngestionJobRow.tsx`）、タグの「削除」（`TagActions.tsx`）
- **期待結果:** 赤系（error-surface 背景・error 文字色）で表示され、**hover しても赤のまま**（従来は灰色寄りになっていた）
- **確認ポイント:** hover で赤が外れて灰色化しないこと

### 4. 押下アニメ（全 pill 共通）

- **目的:** 全 pill ボタンが押下時に微かに縮むこと（`active:scale-[0.985]`）
- **手順:**
  1. 任意の pill ボタン（common 系・layout 系どちらでも）を click & hold する
- **期待結果:** 押している間ボタンが微かに縮小（0.985 倍）し、離すと戻る
- **確認ポイント:** common 系ボタン（ダイアログのキャンセル/確定、ノート操作など）でも同じアニメが出ること

## エッジケース・異常系

### 1. prefers-reduced-motion 環境

- **目的:** reduced-motion 設定時に押下アニメが無効化されること
- **手順:**
  1. OS/ブラウザで「視差効果を減らす / reduce motion」を有効化
  2. 任意の pill ボタンを押下
- **期待結果:** 押下時のスケールアニメが発生しない（`motion-reduce:active:scale-100`）

### 2. disabled / aria-disabled 状態

- **目的:** 無効状態の見た目が従来どおりであること
- **手順:**
  1. フォーム送信中などで disabled になる pill ボタン（各ダイアログの送信ボタン等）を確認
- **期待結果:** opacity 55% + cursor not-allowed で表示される

## 既存機能への影響確認

- **モバイル幅（< sm）の最小高さ**: 全 pill ボタンが `min-h-[44px]` を保ち、タップ領域が確保されていること（既存挙動の維持）
- **common 系の既存 ~28 consumer**: ダイアログ・ノート操作・ディレクトリ操作などの pill ボタンが、押下アニメ追加以外は従来どおり表示・動作すること

## 確認チェックリスト

- [ ] primary pill ボタンが従来どおり表示・hover する（#1）
- [ ] 通常 pill ボタンが従来どおり表示・hover する（#2）
- [ ] danger pill ボタンが赤で表示され hover でも赤を維持する（#3）
- [ ] 全 pill ボタンに押下アニメが出る（#4）
- [ ] reduced-motion で押下アニメが無効化される（エッジ #1）
- [ ] disabled 状態が従来どおり（エッジ #2）
- [ ] モバイル幅で min-h 44px が保たれる
- [ ] common 系既存ボタンに退行がない
