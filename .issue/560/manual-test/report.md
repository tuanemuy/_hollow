# ブラウザ検証レポート — Issue #560: 共有リンクのパスワード失敗カウンタ永続化／ロックアウト発火

**実行日時**: 2026-06-07
**テストソース**: `.issue/560/testing.md`
**サーバー**: `pnpm dev`（http://localhost:3000 / ローカル D1・miniflare）
**シード**: `.issue/544/manual-test/seed.sql`（冪等。`...030` を変更する TC の前に都度再投入してクリーン状態から開始）
**ツール**: agent-browser 0.27.1（テストケースごとに `verify-tc-NNN` セッションを分離）

## 結果サマリー

| TC | テスト名 | 結果 |
|----|---------|------|
| TC-001 | 誤パスワード1回で `failed_attempts` が 1 に increment（回帰の核） | PASS |
| TC-002 | 5回目でロックアウト武装、6回目で `role="status"` 警告 | PASS |
| TC-003 | 正パスワードで成功し `failed_attempts` が reset | PASS |
| TC-004 | revoked リンクで失効エラー（カウンタ不変） | PASS |

**合計 4 件 / PASS 4 / FAIL 0**。本 Issue の核心（失敗カウンタの DB 永続化と、それに伴う #544 ロックアウト UI の実機発火）を実機で確認した。

## 各テストケース詳細

### TC-001 — 失敗カウンタの永続化（回帰の核, regression for #560）

- 前提: `share_links(...030)` failed_attempts=0 / version=0。
- 操作: `/share/test-share-passworded-0001` に誤パスワード `wrong-pass` を1回送信。
- 結果: インラインエラー（`role="alert"`）「パスワードが正しくありません。」表示。
- DB 事後: **failed_attempts=1 / locked_until=NULL / version=1**。
- 判定: PASS。修正前は throw により batch が破棄され failed_attempts=0 のままだった箇所が、確実に永続化されている。
- 証跡: `screenshots/tc-001/step-01.png`, `step-02.png`

### TC-002 — ロックアウト境界（最重要）

- 操作: 誤パスワード `nope` を5回送信 → 6回目アクセス。
- 1〜5回目: いずれもインラインエラー「パスワードが正しくありません。」（仕様どおり5回目も invalid 応答）。
- DB（5回送信後）: **failed_attempts=5 / locked_until=2026-06-07T15:09:08.959Z（未来時刻セット）/ version=5**。
- 6回目: ページ再 open 直後はパスワードフォームが出るが、resolve 契機（送信）で **`role="status"` のロックアウト警告**「試行回数の上限に達しました。しばらく時間をおいて再度お試しください。」に切替。入力欄・送信ボタンとも `disabled`。
- ロックアウト応答後も failed_attempts=5 / version=5 で不変 → 6回目は increment 前に短絡（早期 `share_link_locked` throw）していることを確認。
- 判定: PASS。#544 で実装済みのロックアウト UI が #560 の修正により初めて実機で観測可能になった。
- 証跡: `screenshots/tc-002/step-05.png`, `step-06-lockout.png`

### TC-003 — 成功時 reset

- 操作: 誤パスワード `nope` を2回（failed_attempts=2 / version=2 を確認）→ 正パスワード `test1234` を送信。
- 結果: `http://localhost:3000/notes/public/01950000-0000-7000-8000-000000000020` へ遷移し公開ノート本文（見出し「Issue 544 検証用 公開ノート」、著者「Dev Admin (@dev-admin)」）を表示。
- DB 事後: **failed_attempts=0 / locked_until=NULL / last_accessed_at=2026-06-07T14:56:39.190Z（更新）/ version=4**（reset + recordAccess で version 進行）。
- 判定: PASS。成功パスの reset / アクセス記録が従来どおり永続化されており、修正による回帰なし。
- 証跡: `screenshots/tc-003/step-01-after-2fails.png`, `step-02-success.png`

### TC-004 — revoked リンク（異常系）

- 前提: `share_links(...031)` status=revoked / failed_attempts=0 / version=1。
- 操作: `/share/test-share-revoked-0002` にアクセス → 送信。
- 結果: STATE3 失効画面（heading「リンクは無効です」、本文「リンクが失効しているか、削除された可能性があります。」、「トップへ戻る」CTA）を表示。
- DB 事後: **failed_attempts=0 / version=1（不変）**。revoked 判定は `resolveShareLink.ts` で `save()` より前の早期 throw のため書き込みが積まれない。
- 判定: PASS。
- 証跡: `screenshots/tc-004/step-01-revoked.png`, `step-02-revoked-error.png`

## 観察事項（スコープ外・Issue 起票なし）

- 共有ページの GET（loader）は共有リンクの状態（locked / revoked）に関わらず常にパスワードフォームを表示し、状態判定は submit 時の `resolveShareLink` 実行で初めて行われる。そのため revoked リンクでも一旦パスワードフォームが出てから失効画面に遷移する。これは #544 の共有ゲート既存仕様であり、#560（失敗カウンタ永続化のバックエンド修正）のスコープ外。機能上の不具合ではないため Issue 起票はしない。

## 結論

全 4 テストケース PASS。Issue #560 の修正（失敗時に UoW 外 throw でカウンタ／ロックアウト状態を確実に永続化）が実機で意図どおり機能し、回帰も検出されなかった。FAIL が無いため Issue 起票は行わない。
