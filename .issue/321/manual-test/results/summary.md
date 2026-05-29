# テスト実行サマリー — Issue #321 内部リンクの後追い再解決

**実行日時**: 2026-05-29
**テストソース**: .issue/321/testing.md
**サーバー**: http://localhost:3000（pnpm dev / InlineRelayTrigger でイベント同期処理）

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | 作成時バックフィル＋バックリンク出現 | 正常系 | PASS | - |
| TC-002 | 改名時の解除＋再解決（content_updated経由） | 正常系 | PASS | - |
| TC-003 | trashで解除 / restoreで再解決 | 正常系 | PASS | - |

**合計**: 3 件（PASS: 3 / FAIL: 0）

## 各TCの核心SQL証跡

### TC-001 作成時バックフィル
- 改名前: `[[未来のノート321]]` → resolved_note_id = null（broken）
- ノートA（`未来のノート321`）作成直後: → resolved_note_id = 019e7396-86e6-...（A）にバックフィル解決。バックリンク「1件」にノートB321出現。

### TC-002 改名（content_updated 経由）
- `未来のノート321` をエディタ保存でタイトル `改名後321` に変更（→ note.content_updated 発行）
- B321 の `[[未来のノート321]]` → null に解除（現タイトル不一致による stale 解除、ADR-010）
- C321 の `[[改名後321]]` → 019e7396-86e6-...（改名先）に解決
- **round-1 で両レビュアーが指摘した「タイトル変更は content_updated 経由でも起きる」経路が正しく機能することを実機確認**

### TC-003 trash/restore
- trash: target status=trashed, C321 リンク resolved_note_id=null（FK set null は物理削除のみ作動 → 明示解除が機能）
- restore: target status=active, C321 リンク resolved_note_id=019e7396-86e6-...（再解決）

## 統合テストでカバー済み（ブラウザ検証では省略）
以下は `app/core/application/note/__tests__/internalLinkBackfill.integration.test.ts`（D1, 7ケース, 全PASS）で担保:
- 同名タイトル複数時の決定規則（title asc, id asc 先頭、#127 ADR-003 整合）
- 自己参照除外（#127 ADR-005）
- 本文のみ編集（タイトル不変）の no-op
- purge は FK 対応で handler 不要
- 冪等（同一イベント2回 dispatch で不変）
- バックフィル運用 usecase

## 備考（製品バグではない手順上の留意点）
- WYSIWYG(TipTap/ProseMirror)への入力は agent-browser の type が届かず、`editor.commands.insertContent` の eval で挿入（内部リンクはプレーンテキスト `[[title]]` 保存の設計）。
- 内部リンク候補popup・作成ボタンのクリック横取りは eval `.click()` で回避。
- agent-browser の並列invokeは daemon 衝突を起こすため1コマンドずつ逐次実行。
- TC-002 は Anthropic API の一時的 500 でサブエージェントが2回中断したが、3回目で完遂（環境/コード起因ではない）。
