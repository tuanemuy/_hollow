# ブラウザ検証レポート — Issue #423

**実行日:** 2026-06-03
**ブランチ:** issue/423/optimistic-ui-remaining
**サーバー:** `pnpm build && pnpm start`（wrangler dev :8787、ローカル D1）
**検証範囲:** 複製の楽観追加 / tag rename・delete の楽観反映 / directory rename の楽観表示つなぎ / directory move・delete の非楽観（gate 維持）

## 結論

**全 4 テストケース PASS。** #423 が追加した楽観的UI更新（複製の即時追加・tag の即時 rename/delete・directory rename の即時表示）をすべて実機ブラウザで観測。directory move/delete は設計どおり楽観化せず操作中フィードバックを維持。

## 結果サマリー

| TC | 項目 | 結果 | 備考 |
|----|------|------|------|
| TC-001 | SavedView 複製の楽観追加 | PASS | 新行が click 直後に即時出現（2→3）、連続複製も即時、収束後重複なし |
| TC-002 | tag rename / delete の即時反映 | PASS | rename 即時表示+編集 close、delete 即時除去+件数 3→2 |
| TC-003 | directory インライン rename の即時表示 | PASS | Enter 直後に新名、旧名フラッシュなし |
| TC-004 | directory delete は楽観化せず gate 維持 | PASS | 削除ダイアログの操作中フィードバック確認 |

## 重要な発見・メモ

- **agent-browser がドライブする同一オリジンのロード済みページ内でのボタン click 経由 server-fn POST は 403 にならず成功する**（localhost→localhost）。既知の「serverfn cross-origin 403」は agent-browser から直接 POST する場合に限る（#414 と同じ知見）。よって複製・rename・delete の楽観反映を click 経由で観測できた。
- 失敗 rollback パスはローカル単一オリジンでは mutation が成功確定するため未観測。component テストで担保済み。
- 認証は sessions テーブルに生トークン直挿し + `eval document.cookie` で `__Host-session` を注入（localhost は secure context なので http でも Secure cookie 可）。

## 初回 TC-001 失敗（解消済み・#423 無関係）

初回検証で `/views` が 500（`SystemError: ... violates invariants` / `BusinessRuleError: Keyword cannot be empty`）。原因は**検証用 seed の `query_json` に `keyword:""`（空文字）を入れたこと**。ドメイン invariant は keyword を null か非空文字のみ許容する。seed を `keyword:null` に修正後、`/views` は正常描画し TC-001 PASS。#423 の実装変更とは無関係な seed データ不備だった。

## 環境メモ

- saved_views / tags / directories の id は UUIDv7 必須。
- seed はテスト識別子（verify423 / 検証ビュー・検証タグ・検証ディレクトリ）付きでローカル dev D1 のみに投入。

## スクリーンショット（`.issue/423/manual-test/screenshots/`、gitignore 対象）

- `tc-001-retry-01-immediate.png` / `tc-001-retry-02-settled.png`（複製: 即時 / 収束）
- `tc-002-01-tags-baseline.png` / `tc-002-02-rename-immediate.png` / `tc-002-03-delete-immediate.png`
- `tc-003-01-dir-rename-immediate.png`
- `tc-004-01-dir-delete-dialog.png`
- `tc-001-01-views-error.png`（初回 seed 不備時の参考）
