# TC-NOTE-3: 編集ロック・履歴・内部リンク補完

**結果: PASS（内部リンク補完のみ「要確認」= agent-browser ツール制約により未検証）**

編集ロック取得・編集保存（新規版作成）・履歴一覧・版閲覧・版復元はいずれも従来どおり動作。内部リンク補完（`[[`）はツール側の制約で UI 上の発火を確認できず、実装バグとは判断しない。

## 実行ログ

| Step | 操作 | 結果 | 観察 |
|------|------|------|------|
| 1 | 編集画面を開く（ロック取得） | PASS | `/notes/{id}/edit` 表示。ロック競合バナーなし＝ロック取得成功 |
| 2 | 本文を編集（「追記テキスト」追加）して保存 | PASS | 保存後詳細へ遷移、本文に「追記テキスト」反映（新規版作成） |
| 3 | 履歴ページ（`/notes/{id}/history`）で版一覧 | PASS | 「全2件」。作成時版・編集後版の2件を表示 |
| 4 | 1版を開く（閲覧） | PASS | `/notes/{id}/history/{revId}` で過去版表示（旧本文「本文テキスト」）。「この版に復元」ボタンあり |
| 5 | その版へ復元（restoreNoteRevision） | PASS | 確認ダイアログ → 復元実行。詳細へ遷移し本文が旧版「本文テキスト」に戻る（追記が消える）ことを確認 |
| 6 | エディタで `[[` を入力し内部リンク候補 | 要確認 | 候補ポップアップ（`role=listbox` aria-label「内部リンク候補」）が出現せず。ただし下記理由により実装バグとは断定しない |

## スクリーンショット

- `screenshots/tc3-01-edit-lock.png`
- `screenshots/tc3-02-after-save.png`
- `screenshots/tc3-03-history.png`
- `screenshots/tc3-04-revision.png`
- `screenshots/tc3-05-after-revision-restore.png`
- `screenshots/tc3-06-internallink-empty.png`
- `screenshots/tc3-07-internallink-query.png`
- `screenshots/tc3-08-internallink-A.png`
- `screenshots/tc3-09-internallink-press.png`

## 内部リンク補完が確認できなかった理由（要確認の根拠）

- 実装は存在し、ユニットテストもある（`app/components/note/editor/internalLinkExtension.ts` / `internalLinkSuggest.ts` / `InternalLinkSuggestPopup.tsx`、テスト `__tests__/internalLinkSuggest.test.ts` / `internalLinkSuggestPopup.test.tsx`）。
- トリガーは TipTap の Suggestion プラグイン（`char: "[["`, `allowSpaces: true`）。これは ProseMirror のトランザクション処理経由で発火する。
- agent-browser の `keyboard type` / `press` で投入したテキストは ProseMirror の DOM には入る（本文に `[[A` 等が反映されるのを確認）が、TipTap Suggestion の発火に必要な実ユーザー入力パイプライン（beforeinput / composition）を満たさず、候補ポップアップが起動しなかった。
- これはブラウザ自動化（CDP 合成入力）と TipTap Suggestion プラグインの相性に起因する既知の偽陰性パターンで、本 Issue #489（id 型を string へ統一する型レベルリファクタ）とは無関係。`searchInternalLinkTargets` の server fn 自体が壊れている証拠は得られていない。
- 確実な検証には手動操作（実キーボードで `[[` を入力）が必要。

## 備考（agent-browser 偽陽性）

- 保存ボタン・ダイアログ確定ボタンは `eval` の `element.click()` で操作（`agent-browser click` の一部未達を回避）。
- 本文編集は ProseMirror 上で Selection API によりキャレットを末尾へ置いてから `keyboard type` で投入した。
