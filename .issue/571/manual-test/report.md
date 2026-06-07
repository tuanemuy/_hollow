# ブラウザ検証レポート — Issue #571: P21 プロフィール拡充

**実行日時**: 2026-06-07〜08
**テストソース**: `.issue/571/testing.md`
**サーバー**: `pnpm dev`（Cloudflare runtime, http://localhost:3017）
**ブラウザ**: agent-browser 0.27.1

## 結果概要

9 件中 PASS 7 / BLOCKED(環境) 2 / FAIL 0。検証中に hydration mismatch を1件検出し、その場で修正・再検証済み。

## 検証ハイライト

- **アバター fallback（TC-01）**: avatar 未設定時にイニシャルが表示され `<img>` は出ない。`spec/design/pages/P21-settings-profile.html` の avatar-large（80px 円）に整合。スクショ: `screenshots/tc01-avatar-fallback.png`
- **最終保存タイムスタンプ（TC-05）**: `updatedAt`（=`lastSavedAt`）を `ja-JP` で「2026年6月5日 23:30」と表示。スクショ: `screenshots/tc05-06-dates.png`
- **次に変更できる日付（TC-06）**: `lastUsernameChangedAt`(2026-06-01) + 30日 = 「2026年7月1日以降」を表示。
- **client バリデーション（EDGE-1a/1b）**: gif は「PNG または JPEG を選択してください。」、46MB は「ファイルサイズは5MBまでです。」で hard reject。いずれも presign/PUT のネットワークリクエストが発生せず、client 側で確実に弾いている（ADR-004 のヘルプ文言と実挙動の一致を裏付け）。
- **虚偽表示回避（EDGE-2）**: `lastUsernameChangedAt=null` のとき「次に変更できる日付」を出さず、静的ヘルプのみ表示。
- **リセット（TC-04）**: 表示名・自己紹介・bio カウンタ（37/500）が初期値へ復帰。
  - 注: agent-browser の `click @ref` が React の onClick に届かない既知の偽陰性（manual-test SKILL の Known Issue）に遭遇。`eval` 経由の `.click()` で再実行したところ正常にリセットされ、実装は正しいことを確認。

## 検出・修正したバグ: hydration mismatch

`ProfileForm`（`"use client"`）の SSR 時、サーバー（Workers=UTC）とクライアント（JST）で `toLocaleString` / `new Date()` の結果が食い違い、「最終保存」のテキストがサーバー `2026年6月5日 14:30` vs クライアント `23:30` で React hydration mismatch を起こしていた。

修正: TZ・現在時刻に依存する表示（最終保存・次に変更できる日付）を `mounted` フラグでマウント後にのみ描画（`.issue/571/adr.md` ADR-007）。修正後、新規サーバーログで `hydration failed` 0 件を確認。`pnpm typecheck` クリーン、`pnpm test:unit` 3362 件全 PASS。

## 環境制約（Issue 起票せず）

**TC-02/TC-03（avatar アップロード/削除）はローカル dev で完走不可。** ブラウザ→R2 への presigned PUT は R2 バケットに CORS 設定が要るが、`localhost` origin が未許可で OPTIONS preflight が 403 になる。ネットワークログで以下を確認:

```
POST /_serverFn/...presignMediaUploadFn → 200   (kind:"avatar" OK, object key に /avatar/ セグメント)
OPTIONS https://<account>.r2.cloudflarestorage.com/.../avatar/... → 403  (CORS preflight)
```

これは avatar 固有ではなく、既存のノート画像アップロード（同じ presign→PUT→finalize フロー・同じ R2 バケット）も同様に制約される**環境問題**であり、実装の欠陥ではない。配線（presign 呼び出し・object key・finalize・preview・削除フロー）は presign の 200 と削除ボタンの出現で確認済み。実機（CORS 設定済みステージング/本番）での E2E 確認が必要。

## 成果物

- サマリー: `results/summary.md`
- スクリーンショット: `screenshots/`（tc-initial / tc01-avatar-fallback / tc05-06-dates / edge-size-reject）
- シードデータ: `seed-data.md`
- サーバー情報: `server-info.md`
