# TC-EDITOR 結果 — Issue #776 編集モード tabs（APG Tabs / manual activation）

実行日: 2026-06-26
対象: `/notes/new`（surface = "new"）の編集モードコントロール `aria-label="編集モード"`
セッション: `verify-tc-editor`（dev-login@example.com でログイン）

## サマリー

| TC | 内容 | 判定 |
| --- | --- | --- |
| TC-EDITOR-1 | 編集モード tabs が APG Tabs（manual activation）として動作 | PASS |
| TC-EDITOR-2 | 確認ゲートが活性化時のみ発火（AC-6） | PASS |

確認項目3（AC-4, AC-5）と確認項目4（AC-6）はいずれも期待どおり。問題なし。

---

## TC-EDITOR-1: APG Tabs / manual activation

### ARIA 契約（eval / getAttribute 生結果）

```json
{
  "tablistRole": "tablist",
  "ariaOrientation": "horizontal",
  "tabs": [
    {"role":"tab","ariaSelected":"true","tabindex":"0","ariaControls":"editor-body-panel","id":"editor-mode-tab-wysiwyg","text":"WYSIWYG"},
    {"role":"tab","ariaSelected":"false","tabindex":"-1","ariaControls":"editor-body-panel","id":"editor-mode-tab-html","text":"HTML"}
  ],
  "panelExists": true,
  "panelRole": "tabpanel",
  "panelLabelledby": "editor-mode-tab-wysiwyg",
  "labelledbyMatchesSelectedTab": true
}
```

| 確認点 | 期待 | 実際 | 判定 |
| --- | --- | --- | --- |
| tablist role | "tablist" | "tablist" | PASS |
| aria-orientation | "horizontal" | "horizontal" | PASS |
| 各 tab role | "tab" | "tab" ×2 | PASS |
| aria-selected | 選択 true / 他 false | wysiwyg=true, html=false | PASS |
| roving tabindex | 選択 0 / 他 -1 | wysiwyg=0, html=-1 | PASS |
| aria-controls → 実在 panel | editor-body-panel が存在 | panelExists=true | PASS |
| panel role | "tabpanel" | "tabpanel" | PASS |
| panel aria-labelledby | 選択中 tab の id | editor-mode-tab-wysiwyg（一致） | PASS |
| labelledbyMatchesSelectedTab | true | true | PASS |

注: `/notes/new`（surface="new"）のため tab は WYSIWYG / HTML の2枚。inline（ビジュアル）タブは edit surface のみ（仕様どおり）。

### manual activation キーボード検証（生結果）

初期: focus=wysiwyg, selected=wysiwyg, tabindex0=wysiwyg

| 操作 | active(focus) | selected(aria-selected=true) | tabindex0 | panelLabelledby | 選択変化 | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| ArrowRight | editor-mode-tab-html | editor-mode-tab-**wysiwyg** | html | wysiwyg | なし | PASS |
| ArrowLeft | wysiwyg | wysiwyg | wysiwyg | - | なし | PASS |
| ArrowLeft（端でラップ） | html | wysiwyg | html | - | なし | PASS |
| ArrowRight（端でラップ） | wysiwyg | wysiwyg | wysiwyg | - | なし | PASS |
| End | html | wysiwyg | html | - | なし | PASS |
| Home | wysiwyg | wysiwyg | wysiwyg | - | なし | PASS |
| Enter（focus=html で活性化） | - | editor-mode-tab-**html** | html | editor-mode-tab-html | **あり** | PASS |

- 矢印 / Home / End は **フォーカスと tabindex=0 のみ移動し、aria-selected は不変**（manual activation の肝）。両端ラップも確認。
- Enter で初めて aria-selected が html に移り、tabpanel が切替（panelLabelledby=html, 本文が textarea=HTMLソース化、WYSIWYG ツールバーが消失）。

活性化後の本文確認: `{panelTabName:"editor-mode-tab-html", hasTextarea:true, hasWysiwygToolbar:false}` → エディタ本文が HTML ソースに切替済み。

判定: **PASS**

---

## TC-EDITOR-2: 確認ゲートが活性化時のみ発火（AC-6）

手順: 本文に "Hello bold world" を入力して未保存（dirty）状態を作成。`window.confirm` をスパイ（呼び出し記録）に差し替えて検証。

### 矢印キー通過 → ダイアログ暴発しないこと

操作: 選択中 tab にフォーカス → ArrowRight → ArrowLeft → End → Home

生結果:
```json
{"confirmCalls": [], "focusedTab": "editor-mode-tab-wysiwyg", "selectedTab": "editor-mode-tab-wysiwyg"}
```

| 確認点 | 期待 | 実際 | 判定 |
| --- | --- | --- | --- |
| 矢印通過中の confirm 呼び出し | 0 回（暴発しない） | confirmCalls=[]（0回） | PASS |
| 矢印通過中の選択 | 不変 | wysiwyg のまま | PASS |

### 活性化（Enter）時にゲートが発火すること

(1) confirm スパイが false（キャンセル）を返す場合:
```json
{"confirmCalls":["未保存の変更があります。保存せずに切り替えますか？"], "selectedTab":"editor-mode-tab-wysiwyg"}
```
→ Enter で window.confirm が1回発火。キャンセルすると切替がブロックされ選択は wysiwyg のまま。

(2) confirm スパイが true（承認）を返す場合（focus=html を明示してから Enter）:
```json
{"confirmCalls":["未保存の変更があります。保存せずに切り替えますか？"], "selectedTab":"editor-mode-tab-html", "panelLabelledby":"editor-mode-tab-html", "hasTextarea":true, "hasToolbar":false}
```
→ 承認すると従来どおり切替が進行（selected=html, tabpanel が HTML ソースに切替）。

| 確認点 | 期待 | 実際 | 判定 |
| --- | --- | --- | --- |
| 活性化時に未保存 confirm 発火 | 発火する | 1回発火 | PASS |
| キャンセル時 | 切替されない | 選択 wysiwyg 維持 | PASS |
| 承認時 | 従来どおり切替 | html へ切替・本文 HTML 化 | PASS |

### 補足: 装飾喪失 ConfirmDialog について

実装（`NoteEditor.tsx` の `onModeChange`）上、装飾喪失の `ConfirmDialog` は `surface === "edit" && nextMode === "wysiwyg"` に限定（コード内コメント AC-6）。本検証の `/notes/new` は surface="new" のため、装飾喪失 ConfirmDialog は設計上発火せず、未保存 `window.confirm` のみが適用される。`/notes/new` での AC-6 の肝（矢印で暴発しない／活性化時のみ発火）は上記で確認済み。装飾喪失 ConfirmDialog 経路は edit surface（既存ノート編集）でのみ到達するため、本 TC の範囲外。

判定: **PASS**

---

## 構造的根拠（実装確認）

- `EditorModeSwitch.tsx`: `useRovingTablist({ manualActivation: true })` を使用。矢印はフォーカス移動のみ、活性化は native `<button>` の `onClick={() => onChange(...)}`。よって確認ゲート（`onChange` 内の window.confirm / ConfirmDialog）は矢印走査では構造上発火しない。
- tab ↔ panel の関連は静的 id（`editor-mode-tab-${mode}` / `editor-body-panel`）で配線（生成 id ではない）。

## 気づいた問題

なし。ARIA 契約・manual activation・確認ゲートいずれも期待どおり。
