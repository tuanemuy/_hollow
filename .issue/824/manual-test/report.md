# ブラウザ検証レポート — Issue #824: P12 編集中のヘッダー簡略タイトル（モバイル orientation）

**実行日時**: 2026-07-10
**テストソース**: `.issue/824/testing.md`
**サーバー**: http://localhost:3000（`pnpm dev`）
**検証手法**: agent-browser 0.31.0。`set viewport` でモバイル(390×844)/デスクトップ(1280×900)を切替え、`eval` で computed style・DOM 属性・`scrollWidth/clientWidth` を直接検査して CSS 駆動の表示挙動を判定。

## 結果: 全 8 受け入れ基準 PASS（FAIL 0 / 起票なし）

| AC | 内容 | 判定 | 根拠 |
|----|------|------|------|
| AC-1 | 既存タイトル編集は即表示 / 新規は入力で表示 | PASS | edit: mount 時に header-doc がタイトル即表示。new: 空時なし→入力で出現 |
| AC-2 | 長文は truncate、ヘッダーを押し広げない | PASS | ellipsis 実発動（scrollWidth>clientWidth）かつ header 押し広げ false |
| AC-3 | 装飾は aria-hidden、SR はエディタ input のみ | PASS | header-doc `aria-hidden=true` / input アクセシブル名「タイトル」・aria-hidden なし |
| AC-4 | デスクトップは簡略タイトル非表示・検索のみ | PASS | 1280 で header-doc `display:none`・検索 `display:block` |
| AC-5 | 非エディタ shell 画面は従来どおり不変 | PASS | `/`・`/settings` で header-doc 不在・検索表示・data-doc なし（mobile/desktop） |
| AC-6 | 離脱で簡略タイトル消滅・検索復帰 | PASS | 編集→`/` 遷移で header-doc 消滅・検索 `display:block`（unmount クリア） |
| AC-7 | mock 準拠タイポ・左寄せ | PASS | 13px(--text-sm)/500(font-medium)/text-align start（左寄せ、text-center なし） |
| AC-8 | モバイル編集中は検索を置換（同時表示なし） | PASS | 検索ラッパー `data-doc=true` + `display:none`、タイトルのみ表示 |

## エッジケース

- **新規ノート空タイトル**: 検索が出たまま、入力で置換（progressive）— 意図的挙動として確認（AC-1/AC-8）。
- **SSR→hydration**: title=null 始まりで検索を server-render、hydration 後に編集画面のみ切替。装飾要素のため許容（plan リスク項）。

## 既存機能への影響

- 共有シェルヘッダー（`Header.tsx`）を使う `/`・`/settings` 等で、title 未セット時に検索が従来どおり表示され、`data-doc` 属性も付かないことを確認。回帰なし。
- `/notes`・`/notes/public` 等は別レイアウトヘッダーのため本変更の対象外（波及なし）。

## 自動テスト

- 新規ユニット/コンポーネントテスト 3 ファイル（EditorTitleContext / HeaderCenter / useEditorTitleSync）を追加、`pnpm test:unit` 全 4473 件 PASS。`pnpm typecheck` / `lint` / `format` クリーン。
