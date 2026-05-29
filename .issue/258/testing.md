# 動作確認計画 — Issue #258: UploadDialog ポーリング effect の view 依存による re-mount を解消する

**Issue:** #258
**作成日:** 2026-05-29

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm db:migrate   # ローカル D1 にマイグレーション適用（未適用の場合）
pnpm dev          # vite dev (Cloudflare runtime) を起動
```

### デプロイ方法

なし（検証環境のみで確認できる）。

## 確認項目

### 1. 単一ファイルアップロードの waiting → editing が従来どおり動く

- **目的:** リファクタ後もポーリングが正しく `previewing` を検知して editing view に遷移すること。
- **手順:**
  1. ログインしてアップロードダイアログを開く
  2. Markdown など 1 ファイルをドロップ/選択する
  3. 「LLM がタイトルとメタデータを提案中...」スケルトン（waiting view）が表示されることを確認
  4. ブラウザ DevTools の Network タブで `getIngestionJobFn`（ポーリング）の呼び出しを観察
  5. LLM 推論完了後、プレビュー編集フォーム（editing view）に遷移することを確認
- **期待結果:** waiting → editing に遷移し、タイトル入力にフォーカスが当たる。
- **確認ポイント:** Network タブで getJob 系の呼び出し間隔が概ね **1.8 秒間隔**で安定していること。短時間に連続して 2 本以上発火する（バースト）状態が無いこと。

### 2. 再生成（再生成ボタン）で waiting に戻り再ポーリングする

- **目的:** `onRegenerated` 経路でカウンタがリセットされ、再ポーリングが正常に動くこと。
- **手順:**
  1. 確認項目 1 で editing view まで進む
  2. 「再生成」ボタンを押す
  3. waiting view に戻り、再びポーリングが始まることを確認
- **期待結果:** waiting に戻り、推論完了後に再び editing view へ遷移する。
- **確認ポイント:** 再ポーリングでも Network タブの間隔が ~1.8 秒で安定。

## エッジケース・異常系

### 1. transient 失敗時にポーリング間隔が縮まないこと（本Issueの核心）

- **目的:** transient（system/unknown）失敗が発生してもポーリングが高頻度化（re-mount による timer churn）しないことを確認する。
- **手順（自動テスト主体）:**
  1. `pnpm test:unit` を実行し、`UploadDialog.test.tsx` の transient 失敗系ケース（W-T-002 と本Issueで追加するリグレッションガード）が緑であることを確認する。
  2. ブラウザで自然に transient 失敗を起こすのは難しいため、必要なら DevTools の Network throttling/offline を waiting 中に一時的に切り替えて getJob を失敗させ、復帰後もポーリングが ~1.8 秒間隔を維持する（失敗直後に間隔が極端に縮まない）ことを目視する。
- **期待結果:** 3 連続 transient 失敗で `select` view に戻りエラー表示。それ未満の失敗ではポーリングが継続し、間隔は ~1.8 秒を保つ。

## 既存機能への影響確認

- 複数ファイルアップロード（multiResult view）— ポーリングを使わない経路。本変更の影響を受けないことを確認。
- failed / timedOut view への遷移 — ポーリング結果による遷移ロジックは不変。
- ダイアログ再オープン時に select view にリセットされ、前セッションの状態を引きずらないこと。

## 確認チェックリスト

- [ ] `pnpm test:unit` 全緑（`UploadDialog.test.tsx` 含む）
- [ ] `pnpm typecheck` パス
- [ ] 単一ファイル: waiting → editing 遷移、Network 間隔 ~1.8 秒安定
- [ ] 再生成: waiting に戻り再ポーリング、間隔 ~1.8 秒安定
- [ ] transient 失敗系の自動テストが緑（高頻度ポーリング非発生のガード）
- [ ] 複数ファイル / failed / timedOut / 再オープン の既存挙動が不変
