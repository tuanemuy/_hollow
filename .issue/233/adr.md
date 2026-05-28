# ADR — Issue #233: ノート編集のデフォルトモードを仕様に揃える

## ADR-001: `surface: "new" | "edit"` を `EditorInit` に持たせる

### Status
Proposed

### Context
新規ノートと既存ノートで初期 EditorMode が異なる（仕様 C1 = `wysiwyg`、C2 = `inline`）。この分岐ロジックを `NoteEditor.tsx` の三項演算で書く案と、`createInitialEditorState` の引数として `surface` を受け取る案があった。

### Decision
`EditorInit` に `surface: "new" | "edit"` を**必須**として追加し、`createInitialEditorState` 内で初期 mode を決める。

### Consequences
- 良い点: 初期 mode 決定ロジックを 1 箇所に集約してテスト可能にする。`createInitialEditorState` がすでに「new と edit で差が出る初期値」（`title`、`contentHtml`、`tagInput`）を吸収しているため、surface 派生のロジックを並べる場所として自然
- トレードオフ: `EditorInit` の型が 1 フィールド増え、既存テストの呼出も `surface` を明示する必要が出る。ただし更新範囲は限定的（テスト 8 箇所程度）で、暗黙デフォルトに引きずられるリスクを避けるメリットが上回る

---

## ADR-002: `inline` モードの編集可能化は「テキスト保持ブロック要素の許可リスト方式」

### Status
Proposed（1周目レビュー P-001 で「leaf 要素単位」案から方針転換）

### Context
仕様 C2-2 は「テキストノード単位で編集」と書きつつ、「装飾済みの要素はその意匠を保ったままインラインで文字を編集」とも明示している。「テキストノードを内包する leaf 要素」案では、`<p>foo <strong>bar</strong> baz</p>` のような構造で `<p>` が leaf でなくなるため編集不可になり、仕様 C2-2 のインライン装飾保持を満たせない。

選択肢:
1. **テキストノード単位**: 各テキストノードを `<span contentEditable>` で包む。装飾の入れ子に弱い
2. **leaf 要素単位**: 上記の通り仕様違反
3. **テキスト保持ブロック要素の許可リスト**: `<p>`/`<h1-6>`/`<li>`/`<td>`/`<th>`/`<blockquote>`/`<figcaption>`/`<caption>`/`<dt>`/`<dd>` を `contentEditable=true` にし、内部インライン要素は親の contentEditable を継承して編集可能。構造変化は MutationObserver で rollback

### Decision
選択肢 3（許可リストブロック方式）を採用。

許可リスト（小文字タグ名）:
`p`, `h1`, `h2`, `h3`, `h4`, `h5`, `h6`, `li`, `td`, `th`, `blockquote`, `figcaption`, `caption`, `dt`, `dd`

**`<pre>` の扱い**: 本 Issue では許可リストから除外する。理由は (a) `<pre>` 内では `Enter` が改行として意味を持ち、他のブロック要素と扱いが異なる、(b) シンタックスハイライト等の編集 UX は別 Issue の領域。コードブロックを含む既存ノートを `inline` モードで開いた場合、`<pre>` 部分は表示のみで編集不可となる。仕様 C2-2 を部分的に満たさないが、Issue 完了条件の優先度を考慮しスコープ外として整理する。コードブロック編集が必要なユーザーは `html` モードへ手動切替できる。

**ネスト時の挙動（`<li><p>foo</p></li>` のようなケース）**:
- 内側の `<p>` を `contentEditable=true` にする
- 外側の `<li>` は `contentEditable=true` を付与しない（HTML5 仕様で祖先で false ならその子で true にすると上書きされるが、ここでは内側のみ editable にする意図的な選択）

**混在子（`<blockquote>foo<p>bar</p></blockquote>` のようにテキスト直接子 + 許可リスト子孫が混在するケース）**:
- 外側 `<blockquote>` を `contentEditable=true` にし、かつ内側 `<p>` も `contentEditable=true` にする（HTML5 仕様で `contentEditable=true` の祖先内で子も `true` にすることは害がない。`getEditableContext` の継承的判断が機能する）
- これにより `<blockquote>` 直下のテキスト "foo" も編集可能になる（仕様 C2-2 適合）
- MutationObserver の childList rollback はそのまま機能（外側で構造変化が起きた場合のみ rollback）

### Consequences
- 良い点: 仕様 C2-2 の「装飾済みの要素はその意匠を保ったままインラインで文字を編集」を素直に満たす。ProseMirror が採用しているアプローチに近く、実装パターンが確立されている
- トレードオフ:
  - ブロック内で `Enter` を押すと新規 `<p>`/`<li>` などが生まれる可能性があるが、`keydown` で `preventDefault` + MutationObserver の childList rollback で二重防御
  - `<pre>` 内のコードブロックは編集不可（上記参照）
  - 許可リスト外のブロック要素（カスタム要素など）内のテキストは編集できない。本 Issue の対象は標準 HTML 要素なので影響なし

---

## ADR-003: 構造変化のロールバックは「characterData 常時 + childList/attributes は IME 中またはテキストノードのみ add/remove なら許容」のハイブリッド方式

### Status
Proposed（1周目レビュー P-002 で IME 中間状態を考慮、2周目 P-001 でテキストノード add/remove の許容を Decision に正式統合）

### Context
1周目レビューで「`characterData` のみ通す純粋な許可リスト方式は IME 確定や貼り付け、改行入力などで内部的に発生する『テキストノード分割 → `<br>` 挿入 → テキストノード結合』を `childList` MutationRecord として拾ってしまい、正常なテキスト編集までロールバックされる」リスクが指摘された。2周目レビューで `Backspace` 結合などの純粋な編集経路も `childList` 通知を生むため、IME 中の許容ルールだけでは編集不能化が発生する懸念が再指摘された。

### Decision
`MutationObserver` のコールバック内で、MutationRecord の `type` ごとに以下のルールで分類する。**いずれかの許可条件を満たすレコードのみ通し、それ以外を含む変化を検出したらロールバック実行**:

1. **`characterData`**: 常時許可（テキスト編集の本流）
2. **`childList`**: 以下のいずれかを満たす場合のみ許可
   - (a) `isComposingRef.current === true`（IME 入力中）
   - (b) `target` が許可リストブロック要素または `contentEditable=true` の継承下にある要素、かつ `addedNodes` / `removedNodes` がすべて `nodeType === Node.TEXT_NODE`（Backspace/Delete によるテキストノード結合・分割、insertText によるテキスト追加）
3. **`attributes`**: 以下のいずれかを満たす場合のみ許可
   - (a) `isComposingRef.current === true`
   - 上記以外は常にロールバック対象
4. **`compositionend` ハンドラ**: IME 確定時、`host.innerHTML` と `snapshotBodyRef.cloneNode(true)` の構造（タグ名・属性のシリアライズ結果）を比較し、構造が変化していたらロールバック実行

許可されないレコードを 1 件でも含む `MutationRecord[]` バッチを検出したら、バッチ全体をロールバック対象として扱う（ロールバックは全体置き換えなので、許可された変化も巻き戻るが、これは構造保持の保守的な選択として受容）。

### Consequences
- 良い点:
  - IME 中の内部的な構造変化を許容しつつ、確定後に構造を検証することで仕様 C2-3「構造を壊さない」を保証
  - 通常編集（`Backspace` 結合・`insertText`）が `childList` 通知を生んでも、テキストノードのみの add/remove なら許可されるため編集不能化を回避
- トレードオフ:
  - `MutationObserver` コールバックのロジックが複雑化するが、テストで個別ケース（テキストノード add のみ、要素 add、IME 中の要素 add）を pin できる範囲
  - 「許可された変化を含むバッチに禁止変化が混入したらバッチ全体をロールバック」は保守的すぎる挙動だが、許可分だけ通そうとすると DOM 状態の再構築が複雑になるため避ける
  - IME 確定処理が `compositionend` のリスナに依存（happy-dom テストでは `dispatchEvent(new CompositionEvent('compositionend'))` で再現可能）
  - **装飾要素削除の制約**: ブラウザによっては Backspace で装飾要素 (`<strong>` / `<em>` / `<a>` 等) の境界を跨いで削除した場合、要素そのものが `removedNodes` に含まれる `childList` 通知が出る。ルール (b) では Element の add/remove は不許可なのでロールバックされ、結果として「`<strong>` を Backspace で消せない」UX 制約が生じる。これは仕様 C2-3「構造を壊さない」と整合的だが、装飾要素自体を削除したい場合は `html` モードへ切替する必要がある
  - **装飾範囲ペーストの制約**（review-001 W-F-002）: 装飾要素を含む選択範囲のペーストは現状の保守的バッチ rollback により反映されない（例: `<p>foo<strong>bar</strong>baz</p>` の "foo" 〜 "baz" を選択してペーストすると `<strong>` が `removedNodes` に Element として混入し、バッチ全体が rollback される）。テキスト編集領域内の caret 位置にのみカーソルを置いた状態でのペーストは正常にテキストとして挿入される。装飾範囲を含めて差し替えたい場合は `html` モードへ切替する必要がある

---

## ADR-004: モード切替時の確認ダイアログは `window.confirm` で実装。発動条件は `dirty || autosave === "saving" || autosave === "error"`、順序は blur → dirty 再評価 → confirm → dispatch

### Status
Proposed（1周目レビュー P-001（req）/ P-005（arch）で発動条件と順序を明示するよう更新）

### Context
仕様 C2-4 で「ビジュアル ⇄ HTML」の切替が必要。Issue 完了条件で「未保存変更がある場合は確認ダイアログを出す」と要求されている。

既存の `NoteEditor` 側では「FrontMatter 編集中はモード切替前に `document.activeElement.blur()` で保留中の rename/add を確定する」契約（Issue #230 ADR-003）がある。confirm の順序を誤ると、blur で commit された rename が dirty を増やして「直前に dirty が無かったのに confirm が出る」あるいは「先に confirm を出してから blur で dirty が増える」など、不整合が起きる。

### Decision
- 発動条件: `state.dirtyKeys.size > 0` OR `state.autosave.kind === "saving"` OR `state.autosave.kind === "error"`
- 順序: blur（既存の `document.activeElement.blur()`） → dirty 再評価 → confirm 表示 → `false` ならキャンセル / `true` なら dispatch
- 対象遷移: 全モード切替（dirty 検出条件で十分制御できるため、特定ペアに限定する根拠が無い）

### Consequences
- 良い点: 同期的に切替判断を返せるため state 遷移が単純。独自モーダル新規実装コストがゼロ。Issue #230 ADR-003 と整合
- トレードオフ:
  - ブラウザ標準ダイアログは UX が地味。将来 UX 強化したいなら別 Issue
  - autosave が `saving` 中に「破棄」を選んでも in-flight な保存リクエスト自体はキャンセルされない（autosave のキャンセル/ロールバックは別 Issue）
  - テストでは `vi.spyOn(window, "confirm").mockReturnValue(true/false)` を使う

---

## ADR-005: `inline` モードの `onMediaInsert` は文字列追記経路を使う

### Status
Proposed

### Context
`MediaUploader` の挿入は WYSIWYG モードでは TipTap 命令、それ以外では文字列追記。`inline` モードでも C4 メディア挿入経路を維持する必要がある。

### Decision
`inline` モードの `onMediaInsert` も文字列追記（`dispatch({ type: "setContent", value: nextHtml })`）経路を使い、`InlineEditor` の `useEffect([value])` 同期によって新メディアが DOM に反映されるようにする。

### Consequences
- 良い点: `MediaUploader` の既存契約が変わらない。`useEffect([value])` の再初期化で MutationObserver が新スナップショットを取り直すため、挿入後の編集も問題なく続行できる
- トレードオフ: `insertMediaIntoHtml` は文字列末尾追記なので、結果 HTML が「`<img>` だけのトップレベル要素」を持ちうる。これは許可リストブロック要素ではないので `contentEditable=true` が付かない（=その `<img>` 直後にインライン編集はできない）。本 Issue スコープ外として別 Issue で扱う

---

## ADR-006: `inline` モードに autosave ゲートを追加しない

### Status
Proposed

### Context
`useAutosave.shouldFlushAutosave` は WYSIWYG モードで未対応タグ検出時に autosave を抑止するゲートを持つ（ADR-005 of Issue #37）。`inline` モードでも同様のゲートが必要か検討。

### Decision
`inline` モードには autosave ゲートを追加しない（既存のフルパスを通す）。

### Consequences
- 良い点: 構造保持を MutationObserver で保証しているため、サイレントなデータロスは発生しない。autosave を抑止する理由がない
- トレードオフ: なし。WYSIWYG ゲートのみが特殊扱いされる現状の設計が維持される

---

## ADR-007: `note-detail-content` クラスを `InlineEditor` のホスト要素に再利用する

### Status
Proposed（1周目レビュー P-004 で正当性の明示を求められたため追加）

### Context
CLAUDE.md は「Utility-first only」「Repeated utility strings can be hoisted into a module-scoped string constant」を原則とし、`.note-detail-content` は `app/styles/index.css` の `@layer components` に唯一の documented exception として存在する（`.issue/70/adr.md` ADR-002）。理由は「`dangerouslySetInnerHTML` 由来の子孫要素に utility class を後付けできないため」。

`InlineEditor` はホスト要素に DOM を `appendChild`/`replaceChildren` で**プログラム的に**注入するため、ホスト要素自身には utility class を付与できるが、注入される子孫要素（既存ノートの `<p>`/`<h2>`/`<ul>`/...）には class を後付けできない。

### Decision
`InlineEditor` のホスト要素に `className="note-detail-content"` を付与し、`.note-detail-content` の子孫スタイルを再利用する。ホスト要素自身に対する追加のスタイル（フォーカス・disabled 等）は Tailwind utility / `data-*` attribute variants で記述。

### Consequences
- 良い点: 既存ノートの表示（`/notes/$noteId`）と編集（`/notes/$noteId/edit`）で同じ視覚スタイルを保てる。`.issue/70/adr.md` ADR-002 の documented exception の精神に沿う（dangerouslySetInnerHTML と同様、子孫に class を後付けできない経路）
- トレードオフ: 既存の唯一の exception を別経路（DOM 注入）でも参照することになる。新規 utility-first 違反を増やさないため、ADR-002（of Issue #70）のレファレンスを `InlineEditor.tsx` の JSDoc に明記して誤読を防ぐ

---

## ADR-008: モード切替時の dirty 再評価に stateRef パターンを採用

### Status
Proposed（PR #282 review-001 W-S-001 / W-F-006 で発覚）

### Context
ADR-004 で「blur → dirty 再評価 → confirm → dispatch」の順序を主張したが、React のバッチ更新により `active.blur()` 由来の `dispatch` 結果は同イベントハンドラ内の `state` クロージャに反映されない。これにより blur で発生する dirty（FrontMatter の rename / add commit など）が confirm 評価時に見えないという論理欠陥があった。

解決策の候補:
1. `flushSync(() => active.blur())` で同期 flush → blur 由来の dispatch を即時 commit する
2. `stateRef = useRef(state)` + `useEffect([state])` で常に最新 state を ref に書き戻し、ハンドラ内では ref を読む

### Decision
選択肢 2（stateRef パターン）を採用する。`NoteEditor` 内に `stateRef = useRef(state)` を導入し、`useEffect([state])` で commit phase に常に最新の state を ref に書き戻す。`onModeChange` は `stateRef.current.dirtyKeys` / `stateRef.current.autosave` を読むことで、blur 由来 dispatch 後の最新 dirty を捕捉する。

### Consequences
- 良い点:
  - `flushSync` を使わないため React のレンダーを同期化しない。autosave 経路など他の effect への副作用が小さい
  - React 公式パターン（"reading latest state in event handlers" のレシピ）に近く、複雑な同期境界を持ち込まない
  - `useCallback` の依存配列を空にできるため、ハンドラ identity が安定し、子コンポーネントの memo を阻害しない
- トレードオフ:
  - `useEffect` は同イベントハンドラ内では実行されず、commit phase（ハンドラ return 後）に走る。よって **同一イベント内で `active.blur()` が起こす同期 dispatch を `onModeChange` のクロージャや stateRef で同期的に読み出すことはできない**。本パターンが解決するのは「**別イベント**で dirty 化 → モード切替タブをクリック」というメインの UX 経路で、ハンドラ間で stateRef が確実に最新を反映するケース
  - 同一イベント内で blur → 即 confirm 経路を厳密に守りたい場合（FrontMatter の `commitKey` 由来の dispatch を含めて捕捉したい場合）は `flushSync(() => active.blur())` が別途必要。本 PR では実用上の影響を限定的とみて `flushSync` を採用せず stateRef のみとする。blur 由来の差分は次の autosave で確実に拾われるため致命的ではない
  - `useCallback` の依存配列を空にできるため、ハンドラ identity が安定し、子コンポーネントの memo を阻害しない
