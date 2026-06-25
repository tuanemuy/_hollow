# テスト実行サマリー — Issue #776

**実行日時**: 2026-06-26
**テストソース**: .issue/776/testing.md
**サーバー**: http://localhost:3000

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-TAG-1 | 並び替え軸 segmented が radiogroup として動作（キーボード） | 正常系 | PASS | - |
| TC-TAG-2 | 並び替え軸の sort/order 選択・URL 反映が不変 | 正常系 | PASS | - |
| TC-EDITOR-1 | 編集モード tabs が APG Tabs（manual activation） | 正常系 | PASS | - |
| TC-EDITOR-2 | 編集モードの確認ゲート（未保存）が活性化時のみ発火 | 正常系 | PASS | - |

**合計**: 4 件（PASS: 4 / FAIL: 0）

## ARIA 契約 eval 生結果

### 並び替え軸 segmented（sort=name）
```json
{"groupRole":"radiogroup","ariaOrientation":"horizontal","items":[{"role":"radio","ariaChecked":"true","tabindex":"0","text":"名前"},{"role":"radio","ariaChecked":"false","tabindex":"-1","text":"ノート数"},{"role":"radio","ariaChecked":"false","tabindex":"-1","text":"作成日時"},{"role":"radio","ariaChecked":"false","tabindex":"-1","text":"最終使用"}],"hasTablist":false,"ariaSelectedAny":false}
```

### 編集モード tabs（/notes/new）
```json
{"tablistRole":"tablist","ariaOrientation":"horizontal","tabs":[{"role":"tab","ariaSelected":"true","tabindex":"0","ariaControls":"editor-body-panel","id":"editor-mode-tab-wysiwyg","text":"WYSIWYG"},{"role":"tab","ariaSelected":"false","tabindex":"-1","ariaControls":"editor-body-panel","id":"editor-mode-tab-html","text":"HTML"}],"panelExists":true,"panelRole":"tabpanel","panelLabelledby":"editor-mode-tab-wysiwyg","labelledbyMatchesSelectedTab":true}
```

両コントロールとも期待 ARIA 契約と完全一致。`role="tablist"`/`role="tab"`/`aria-selected` の誤用は並び替え軸から完全に除去され、編集モードは tabpanel を伴う完全な APG Tabs に。

## manual activation 検証（編集モード・肝）

- ArrowRight/Left/Home/End: フォーカス・tabindex は移動するが **aria-selected は不変**（選択を変えない）
- Enter 活性化: そのとき初めて aria-selected が移り、エディタ本文（tabpanel）が切替
- 未保存 `window.confirm`: 矢印走査では暴発せず（confirmCalls=[]）、Enter 活性化時のみ1回発火

## 観察事項（PASS だが要追跡 — スコープ外）

- **並び替え軸の連続矢印キーでフォーカスが脱落する**: 矢印1回での選択・URL更新は成功するが、`/tags` は RSC ルートで sort が `loaderDeps` に含まれるため、選択ごとに loader が再実行され `renderServerComponent(<TagManager>)` がサブツリーごと再レンダーされる。この再レンダーでクライアントアイランド（TagListToolbar）のフォーカスが `<body>` に脱落し、再フォーカスせずに連続で矢印を押すと2回目以降が無視される。
  - これは #776 の ARIA role 変更（tab→radio）が原因ではなく、データ駆動ルートの RSC loader ナビゲーションに内在する既存特性。#660 の DisplayModeSwitch は `display` が loaderDeps 外（クライアントのみのスワップ）なので再実行が起きずフォーカスを保持できていた特殊ケース。
  - 単発選択（AC-2 の happy path）は動作し全 AC は PASS。フォーカス復元は共有 `useRovingTablist` への非自明な変更を要し、#660 含む全 consumer に影響するためフォローアップ Issue として追跡する。
- 環境メモ: agent-browser で `__Host-`/クエリ付き URL の full open 後にログインセッションが数回脱落し、都度 /login で再ログインして継続（テスト対象外のセッション Cookie 永続性の問題）。
