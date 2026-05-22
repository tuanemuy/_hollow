# ADR — Issue #104: Dialog プリミティブの背景クリック / × ボタンによる close オプション

## ADR-001: backdrop click の誤閉じ防止に origin guard を採用

### Status
Proposed

### Context
backdrop click で close するモーダルでは、panel 内のテキスト選択ドラッグが panel 外で離れたケース、フォーム input ドラッグが backdrop 上でリリースされたケース等で意図せず close する事故が起きる。Issue 設計判断のひとつ「フォーム途中入力での誤閉じ対策」に対応する必要がある。

選択肢:
1. 単純な `onClick` で `e.target === e.currentTarget` のみチェック
2. mousedown の起点と click の currentTarget の一致を要求する origin guard
3. backdrop に `pointer-events: none` を付けて panel 外 click を拾わない方針（panel の外側を実装で囲む）

### Decision
**選択肢 2（origin guard）を採用**。`mousedownTargetRef` を持ち、`onClick` 時に `e.target === e.currentTarget` かつ `mousedownTargetRef.current === e.currentTarget` の双方を満たすときだけ `onClose` を呼ぶ。さらに panel `<div>` に `onMouseDown={(e) => e.stopPropagation()}` を付けて panel 起点の mousedown が backdrop に伝播しないようにする。

### Consequences
- 良い点: panel 内テキスト選択ドラッグや input ドラッグでの誤閉じを完全に防げる。Radix UI / Headless UI 等が採用する業界標準パターン。
- トレードオフ: ref と handler が増える分わずかに複雑化するが、a11y / UX の堅牢性で十分元が取れる。

---

## ADR-002: × ボタンの a11y label を固定文字列 `閉じる` とする

### Status
Proposed

### Context
× ボタンの `aria-label` をどう与えるか。選択肢:
1. 固定文字列 `閉じる` をハードコード
2. props `closeButtonLabel?: string` で consumer から渡せるようにする
3. i18n 抽象化（i18n ライブラリ導入）

### Decision
**選択肢 1（固定文字列 `閉じる`）を採用**。プロジェクト全体が日本語 UI 前提で、Dialog title やキャンセルボタンも日本語ハードコードされている。CLAUDE.md にも i18n 抽象化の指示はない。

### Consequences
- 良い点: 最小変更、API surface も最小。将来 props 化や i18n 化が必要になっても破壊変更なしで追加可能。
- トレードオフ: ボタンの文言を変えたい consumer が現れたら API 追加が必要。ただし現状そのニーズなし（YAGNI）。

---

## ADR-003: × アイコンの実体は U+00D7 文字

### Status
Proposed

### Context
× の見た目をどう実現するか。選択肢:
1. U+00D7 MULTIPLICATION SIGN (`×`) を `<span aria-hidden="true">` で描画
2. SVG アイコンライブラリ（lucide-react 等）を導入
3. インライン SVG を直接書く

### Decision
**選択肢 1（U+00D7 文字）を採用**。

### Consequences
- 良い点: アイコンライブラリ依存を増やさず、CLAUDE.md の「utility-first / 最小依存」方針と整合。文字サイズ調整は Tailwind utility（`text-xl` 等）で完結。SR は `aria-hidden` で読まれない。
- トレードオフ: 細かい線の太さ・ストロークの調整は不可。ただし dialog の close button としては視覚的に十分。将来デザインシステム上アイコン化が必要になればプリミティブ層を差し替えれば良い。

---

## ADR-004: × ボタンは Tab cycle 内・初期 focus 候補外

### Status
Proposed

### Context
WAI-ARIA Dialog Pattern では「dialog 起動直後は意味のあるコントロール（最初の入力欄等）に focus が当たるべき」とされる。× ボタンを panel の最初の子として描画すると、既存の初期 focus ロジック（`useEffect` 内 `requestAnimationFrame` で `panel.querySelectorAll(FOCUSABLE_SELECTOR)` の先頭にフォーカス）は × にフォーカスを当ててしまう。

選択肢:
1. × ボタンを panel の末尾に描画して初期 focus 順を保つ
2. × ボタンに識別マーカー（`data-dialog-close=""`）を付け、初期 focus 探索ブロックのみ別 selector で除外
3. × ボタンの `tabIndex={-1}` で Tab cycle からも外す

### Decision
**選択肢 2 を採用**。**× ボタンは Tab cycle 内には含める（Tab で辿り着ける）が、初期 focus 候補からは除外する**。具体的には panel 先頭（視覚的に右上）に描画し、`data-dialog-close=""` を付与。初期 focus 専用の selector を `INITIAL_FOCUS_SELECTOR = \`${FOCUSABLE_SELECTOR}:not([data-dialog-close])\`` としてモジュールスコープに hoist し、`useEffect` 内 `requestAnimationFrame` ブロックの非 alertdialog 枝で使用。Tab cycle 用の `FOCUSABLE_SELECTOR` は据え置き。

### Consequences
- 良い点: 視覚配置（右上）と DOM 順序を分離できる。Tab で × に辿り着けるためキーボードユーザーの close 経路は確保。WAI-ARIA 推奨の初期 focus も満たす。
- トレードオフ: 初期 focus 用に追加 selector が必要だが、CSS attribute selector 1 つで完結する小さなコスト。

---

## ADR-005: `dialog` 定数に `relative` を追加

### Status
Proposed

### Context
× ボタンを `absolute top-3 right-3` で配置するには、親 panel が `relative` で position context を持つ必要がある。既存の `dialog` 定数（`app/components/note/styles.ts`）には `relative` がない。

選択肢:
1. `dialog` 定数に `relative` を追加（既存 7 コンシューマ全てに波及）
2. 新規 `dialogPanel` 定数を切り Dialog プリミティブだけがそれを使う
3. × ボタン側で fixed 配置（panel 外座標になり破綻）

### Decision
**選択肢 1（`dialog` 定数に `relative` を追加）を採用**。

### Consequences
- 良い点: 最小変更。`relative` 自体は子要素に `absolute` がなければ見た目を変えない。事前 grep の結果、Dialog 内に現れる `absolute` 子要素は `SR_ONLY`（`clip:rect(0,0,0,0)` で実質非表示の SR 専用テキスト）のみで、視覚的な `absolute` は存在しない（NotePickerDialog 36 行付近の SR_ONLY、FilterBar 内 SR_ONLY 等）。`SR_ONLY` は clip 済みなので `relative` 追加で見た目影響ゼロ。新規 token を増やさない。
- トレードオフ: 万一実装中に新たな視覚的 `absolute` 子要素を発見した場合は新規 `dialogPanel` 定数への切り替えが必要。確率は事前 grep 結果からほぼゼロと見込む。

---

## ADR-006: キャンセルボタンとの共存方針はプリミティブで規定せず consumer 判断とする

### Status
Proposed

### Context
× ボタンを有効化したダイアログで、フッターの「キャンセル」ボタンを残すか撤去するかの方針。Issue 本文も「コンシューマ判断 or プリミティブで指針提示」を提起している。

選択肢:
1. プリミティブで共存方針を規定（例: × 有効時はキャンセルを推奨/非推奨）
2. consumer 判断に委ねる（プリミティブは経路提供のみ）

### Decision
**選択肢 2（consumer 判断）を採用**。プリミティブ層の責務は close 経路の提供までとし、共存方針は各 Dialog 採用時の UX 文脈（破壊的操作確認なら両方、軽量 picker なら × だけで十分、等）で判断する。`Dialog` の JSDoc に「× を有効化しても dialog body 内のキャンセルボタンは独立——両方残す/片方撤去はコンシューマ判断」と添える。

### Consequences
- 良い点: 層の境界が汚れない。各 Dialog の UX 文脈に最適な選択ができる。
- トレードオフ: プロジェクト全体での一貫性は consumer 側のレビューで担保する必要がある。

---

## ADR-007: `INITIAL_FOCUS_SELECTOR` はカンマ区切りの各クローズに `:not([data-dialog-close])` を分配する

### Status
Accepted（実装時に発覚し採用）

### Context
plan.md の指示通り `INITIAL_FOCUS_SELECTOR = \`${FOCUSABLE_SELECTOR}:not([data-dialog-close])\`` で実装したところ、初期 focus のテストが失敗した。原因は CSS のセレクタリスト構文: `a, b, c:not(x)` は `c` だけに `:not(x)` がかかり、`a` と `b` は除外されない。CSS の comma-separated selector list はカンマ単位で独立評価されるため、文字列連結ではフィルタが末尾の selector にしかかからない。

選択肢:
1. 文字列連結で末尾だけにフィルタ（plan.md 当初案・誤動作）
2. `FOCUSABLE_SELECTOR.split(", ").map(s => \`${s}:not([data-dialog-close])\`).join(", ")` で各クローズに分配
3. selector を分けずに初期 focus 取得後 JS で `closest('[data-dialog-close]')` を確認してフォールバック

### Decision
**選択肢 2 を採用**。モジュールスコープで一度だけ計算するため runtime コストはゼロ。意図が selector に直接表れる。

### Consequences
- 良い点: CSS のセレクタ分配セマンティクスを実装で明示。テストが green。実装内コメントで「カンマ区切りは distributive ではない」旨を明文化したので将来の誤改修を防げる。
- トレードオフ: なし。

---

## ADR-008: backdrop と panel の `<div>` インタラクティブハンドラに biome 抑制を追加

### Status
Accepted（実装時に発覚し採用）

### Context
backdrop `<div>` に `onMouseDown` / `onClick`、panel `<div>` に `onMouseDown` を付与したところ biome の `lint/a11y/noStaticElementInteractions` と `lint/a11y/useKeyWithClickEvents` が発火した。

- backdrop は WAI-ARIA Dialog Pattern 上 role を持たない（modal の "外側" 領域で、focusable でない）。キーボード close 経路は document 全体の Esc キー listener で別途実装済み。
- panel の `<div>` は既に `role={dialog|alertdialog}` を持つが biome が動的 prop を解析できず "static" 扱いになる。さらに `onMouseDown` は propagation 停止だけが目的で、新たなユーザ操作を導入していない。

### Decision
両 div に対し WHY を含めた `biome-ignore` を追加。
- backdrop: `noStaticElementInteractions` と `useKeyWithClickEvents` の両方を抑制（Esc が document-level keydown でカバーされていること、backdrop が非 focusable であることを理由に明記）
- panel: `noStaticElementInteractions` を追加抑制（dynamic role の限界 + propagation 停止専用ハンドラであることを理由に明記）

### Consequences
- 良い点: a11y 契約は document-level Esc + focus trap + role で担保されており、抑制理由がコメントで自己文書化される。
- トレードオフ: 将来 biome がより精緻な解析を持った場合に再評価が必要。
