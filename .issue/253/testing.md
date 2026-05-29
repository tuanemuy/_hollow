# 動作確認計画 — Issue #253: regenerateIngestionPreview の実装と spec を一致させる（LLM 再駆動を復活させる）

**Issue:** #253
**作成日:** 2026-05-29

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm dev
```

Cloudflare Workers + D1 を模した Vite + Wrangler 環境で `http://localhost:5173`（または表示された URL）が起動する。初回アップロードと同様、ローカル dev でも domain event の dispatch（relay/consumer 経由で `runIngestionJob` 再駆動）が動作する前提。

### デプロイ方法

なし（本 Issue の動作確認は検証環境のみで完結する。staging/production への反映は通常のリリースフロー `pnpm deploy:staging:all` / `pnpm deploy:production:all` に従う）。

---

## 確認項目

### 1. プレビュー編集モーダルからの再生成（メイン動線）

- **目的:** #226 のプレビュー編集モーダルに復活させた「再生成」ボタンで LLM が再実行され、新しい preview が生成されること（本 Issue の核心）。
- **手順:**
  1. ログインしてアップロードモーダルを開く
  2. ファイルを1件投入し、`waiting → editing`（プレビュー編集フォーム）まで進む
  3. アクションバーに「再生成」ボタン（`RefreshCw` アイコン、「破棄」と「登録」の間）が表示されることを確認
  4. タイトルやタグなど preview の中身をメモしてから「再生成」ボタンを押下
- **期待結果:**
  - ボタン押下中は二重押下が抑止され、全アクションボタンが `disabled` になる
  - モーダルが `waiting` view に切り替わり、ポーリングが始まる
  - ジョブが `pending → processing → previewing` を辿り、LLM 由来の**新しい preview**（再生成前と異なるタイトル/タグ/本文の可能性）が `editing` view に表示される
  - 再生成後の preview を確認・編集して「登録」でノート化できる
- **確認ポイント:** 再生成前後で preview の内容が確実に作り直されていること（no-op で同じ内容のまま戻らないこと = 本 Issue の修正点）。

### 2. `/upload` キュー画面の `IngestionJobRow` 再生成ボタン

- **目的:** 既存の `IngestionJobRow` カードの「再生成」ボタンが実際に LLM 再駆動するようになったこと（従来は no-op だった不整合の解消）。
- **手順:**
  1. previewing 状態のジョブがある状態で `/upload` に移動
  2. 対象ジョブカードの「再生成」ボタンを押下
  3. `routerInvalidate` 後のカード状態を観察
- **期待結果:**
  - 押下直後はジョブが `pending`（または `processing`）に変わる
  - しばらく後（再読込/再取得）に `previewing` へ復帰し、新しい preview が付いている
  - `regenerationCount` が 1 増えている（DB や UI 上の表示で確認できる範囲で）
- **確認ポイント:** 従来 no-op だったボタンが実際に LLM を再実行すること。

### 3. 再生成カウントの上限（MAX_REGENERATIONS = 5）

- **目的:** 上限を超えた再生成が `regeneration_limit_exceeded` で弾かれること（cap バイパスが起きないこと）。
- **手順:**
  1. 同一ジョブに対して「再生成」を繰り返し実行（各回 previewing 復帰を待つ）
  2. 6 回目（上限超過）の再生成を試みる
- **期待結果:**
  - 上限到達後の再生成は `regeneration_limit_exceeded` 相当のエラーがインライン表示される
  - ジョブが壊れた状態にならず、既存 preview は保持される（または既定のエラー表示に留まる）
- **確認ポイント:** `regenerationCount` が回を追うごとに増え、上限で正しく停止すること。

## エッジケース・異常系

### 1. 再生成中の LLM 失敗

- **目的:** 再生成で起動した `runIngestionJob` が LLM 失敗したときの挙動（#57 ADR-003 の既知の限界を新たに悪化させていないこと）。
- **手順:**
  - 開発時に LLM プロバイダー側で失敗を発生させる（モック注入または一時的に無効な API キー）
  - previewing ジョブで「再生成」を押下
- **期待結果:**
  - retry 経路と同じ挙動で失敗が扱われる（`failed` 化、またはレート制限時は `processing` 固着という既存の限界を踏襲）
  - 本 Issue 起因の新しいクラッシュ・データ破損が起きない

### 2. 再生成イベントの二重配信（冪等性）

- **目的:** `ingestion.regenerated` が at-least-once で複数配信されても安全なこと。
- **手順:**
  - 通常操作では発生しないため、可能なら dispatch を二重発火させる開発時シナリオで確認（難しければ単体/integration テストの冪等性アサーションで代替）
- **期待結果:**
  - 2 回目以降はジョブが既に `processing` のため `isPending` ガードで no-op となり、二重処理されない

## 既存機能への影響確認

- **初回アップロードフロー**: `ingestion.created → dispatch → runIngestionJob` の通常フロー（`select → uploading → waiting → editing → 登録`）が引き続き動作すること（dispatch ルーティング追加が既存経路を壊していない）。
- **admin retry フロー**: `failed → pending` + `ingestion.retryRequested` の retry が引き続き動作すること（同じ dispatch table を共有）。
- **commit / discard**: previewing ジョブの commit / discard が引き続き動作すること。

## 確認チェックリスト

- [ ] プレビュー編集モーダルに「再生成」ボタンが表示される（破棄と登録の間、RefreshCw アイコン）
- [ ] モーダルから再生成 → `waiting` 再遷移 → 新しい preview が表示される
- [ ] 再生成中は全アクションボタンが disabled（二重押下抑止）
- [ ] `/upload` の `IngestionJobRow` 再生成ボタンが LLM 再駆動する（従来 no-op の解消）
- [ ] 再生成後 `regenerationCount` が増える
- [ ] 上限（5回）超過で `regeneration_limit_exceeded` が表示される
- [ ] 初回アップロードフローが引き続き正常動作
- [ ] admin retry フローが引き続き正常動作
- [ ] commit / discard が引き続き正常動作
