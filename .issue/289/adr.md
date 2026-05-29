# ADR — Issue #289: DirectoryActionsMenu の menuitem 内キーボードナビゲーション（roving tabindex）

## ADR-001: フォーカス管理は roving tabindex（実 DOM フォーカス）を採用し、`aria-activedescendant` は採らない

### Status
Proposed

### Context
WAI-ARIA Menu パターンのキーボードフォーカス管理には 2 方式がある:
- **roving tabindex**: アクティブな 1 要素のみ `tabIndex=0` + 実 DOM フォーカスを持ち、他は `tabIndex=-1`。
- **`aria-activedescendant`**: コンテナにフォーカスを保持し、属性で論理アクティブ要素を指す。

`DirectoryActionsMenu` は既に実 DOM フォーカス前提で組まれている（open 時に先頭 menuitem を `focus()`、Escape でトリガーへ `focus()` 復帰、`onMouseDown` preventDefault でフォーカス維持）。隣接する `DirectoryTree` の treeitem も `tabIndex={-1}` + 実フォーカスで統一（#232 ADR-006）。

### Decision
roving tabindex（実 DOM フォーカス移譲）を採用する。`activeIndex` state で「いま `tabIndex=0` を持つ項目」を管理し、`useEffect` で該当 menuitem に実フォーカスを当てる。

### Consequences
- 良い点: 既存のフォーカス制御（open 時フォーカス・Escape 復帰・blur クローズ）とモデルが一致し、フォーカスの真実が常に実 DOM に一本化される。`DirectoryTree` のフォーカス方針とも揃う。
- トレードオフ: `aria-activedescendant` 方式に比べ、項目移動のたびに実フォーカスが動くため、コンテナの `onBlur`（離脱クローズ）との相互作用に注意が必要（移動先 menuitem は同一コンテナ内なので `relatedTarget` 判定で誤クローズしない）。

---

## ADR-002: Type-ahead（先頭文字ジャンプ）は本 Issue ではスコープ外

### Status
Proposed

### Context
APG Menu パターンは type-ahead を任意要件として挙げる。ただし本メニューの項目ラベルは日本語（「子ディレクトリを作成」「リネーム」「移動」「削除」）で、ローマ字/かな先頭文字検索は IME 状態に依存し挙動が安定しない。項目数も 4 と少なく、矢印 + Home/End で十分到達可能。

### Decision
type-ahead は実装しない。必須キー（ArrowDown/ArrowUp/Home/End）+ 既存の Enter/Escape のみを実装する。

### Consequences
- 良い点: IME 干渉のリスクを避け、スコープを Issue の意図（roving tabindex 化）に集中できる。
- トレードオフ: 大量項目メニューでの高速ジャンプは不可。項目数が増えた場合は再検討（フォロー余地）。

---
