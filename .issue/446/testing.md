# 動作確認計画 — Issue #446: admin surface ローカルボタンの common pill 統一

**Issue:** #446
**作成日:** 2026-06-04

---

## 確認環境

このIssueの変更（CSS クラス定義の寄せ）を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm db:migrate   # ローカル D1 にマイグレーション適用（初回または未適用時のみ）
pnpm dev          # Cloudflare runtime ローカル開発サーバー起動
```

admin 画面は認証必須。agent-browser での認証付き検証手順はメモ리 `browser-verify-authed-routes` に従う（sessions テーブルへ生トークン直挿し＋`eval document.cookie` で `__Host-session` 注入）。

### デプロイ方法

なし（検証環境のみで確認できる純粋な UI リファクタ）。

## 確認項目

### 1. UsersTable の small ボタン（4 箇所）

- **目的:** `BTN_SM_CLASS` → `${pillBtn} ${pillBtnSm}` 寄せ後も h-7 small surface ボタンが視覚不変
- **手順:**
  1. admin にログインしユーザー管理画面を開く
  2. 各ユーザー行の操作ボタン（昇格/降格/停止/復帰）を確認
  3. hover・押下（active）・disabled 状態を確認
- **期待結果:** ボタンは h-7・px-3・text-xs の small サイズ、surface 背景、アイコン+ラベル間隔（gap-1.5）が従来どおり
- **確認ポイント:** `data-sm` が効いて h-9 に膨らんでいないか。hover で surface-hover、押下で軽い scale が出るか

### 2. Jobs の small ボタン（5 箇所）

- **目的:** UsersTable と同型の寄せ。backfill ボタン（#329 追加分）含め全 5 箇所
- **手順:**
  1. admin のジョブ画面を開く
  2. 各操作ボタン（再取り込み/再エクスポート/索引再構築/APIキー再暗号化/内部リンク backfill）を確認
  3. hover・押下・disabled を確認
- **期待結果:** 項目 1 と同じく small surface ボタンが視覚不変
- **確認ポイント:** 全 5 箇所に `data-sm` が付与され small サイズで表示されること

### 3. LLMSettingsForm の surface ボタン（1 箇所）

- **目的:** `BTN_CLASS` → `pillBtn` 寄せ後も h-9 surface ボタンが視覚不変
- **手順:**
  1. admin の LLM 設定画面を開く
  2. 接続テストボタン（surface）を確認。隣の primary 保存ボタンと並べて比較
- **期待結果:** h-9・px-4・text-sm の surface ボタン。primary ボタンとサイズ・形が揃う
- **確認ポイント:** surface ボタンが accent 色に化けていないか

### 4. admin/route の `<Link>` ボタン（2 箇所）

- **目的:** `ADMIN_BTN_CLASS` → `pillBtn` 寄せ後も anchor surface ボタンが視覚不変
- **手順:**
  1. admin 配下のエラー画面や戻り導線で「ホームへ」「admin トップへ」リンクを確認
  2. hover を確認
- **期待結果:** h-9 surface pill。クリックで該当先へ遷移
- **確認ポイント:** anchor なので押下時に scale フィードバックが出る（gain）。レイアウト崩れなし

## エッジケース・異常系

### 1. モバイル幅でのタップ下限

- **目的:** small ボタンの `max-sm:min-h-0`（#442 ADR-004）が効き、h-9 ボタンは `max-sm:min-h-[44px]` が効くこと
- **手順:** ビューポートを sm 未満（〜639px）にして項目 1〜4 を再確認
- **期待結果:** small ボタンは h-7 のまま（44px に膨らまない）、h-9 surface ボタンは min 44px のタップ領域を確保

### 2. 生成 CSS の variant 後勝ち

- **目的:** `data-[sm]:h-7/px-3/text-xs` が base `h-9/px-4/text-sm` に後勝ちすること
- **手順:** `pnpm build` 後の生成 CSS で各 utility の byte-offset 順を確認、または DevTools で `data-sm` 要素の computed height が 1.75rem
- **期待結果:** small variant が base に後勝ち

## 既存機能への影響確認

- 各ボタンの onClick / 遷移ハンドラは変更なし。className のみの変更なので機能影響はないはずだが、ボタン押下で従来どおりのアクション（昇格・ジョブ再実行・接続テスト・遷移）が走ることを確認

## 確認チェックリスト

- [ ] UsersTable 4 ボタンが small surface で視覚不変
- [ ] Jobs 5 ボタンが small surface で視覚不変
- [ ] LLMSettingsForm 接続テストボタンが h-9 surface で視覚不変
- [ ] admin/route 2 リンクが h-9 surface で視覚不変・遷移動作OK
- [ ] hover / active / disabled 各状態が回帰なし
- [ ] モバイル幅で small は h-7・h-9 は min 44px
- [ ] `pnpm typecheck && pnpm lint:fix && pnpm format` パス
- [ ] 各ボタンの機能（アクション・遷移）が従来どおり
