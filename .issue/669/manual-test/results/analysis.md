# TC-007 フォーカス喪失の原因分析

## 分類

**既存バグ（main 由来）** — ただし Issue #669 のスコープ内（「2. 編集中にフォーカスが外れる」）なので、本ブランチで即時修正すべき。

## 根拠

### 本ブランチの変更は無関係

`git diff origin/main -- app/components/note/editor/InlineEditor.tsx` の差分は className 2行のみ（`mt-4` 削除と `min-h-[320px]` → `min-h-[480px]`）。onChange / value リシンク / MutationObserver / self-emit ガードのロジックは main と完全に同一。NoteEditor 側の変更（要素並べ替え、mb-* / gap 撤去、routerInvalidate 除外、保存後 invalidate 削除、reducer の lazy seed 化）はいずれも InlineEditor への props 配線（`value={state.contentHtml}` / `onChange` → `dispatch(setContent)`）を変えていない。スタイル変更で DOM 再構築やフォーカス移動が起きる経路はない。

### 真の原因: effect cleanup が self-emit ガードを無効化している

`app/components/note/editor/InlineEditor.tsx` の DOM ライフサイクル effect は `[value]` 依存（L797）で、cleanup（L776-794）の末尾に **`host.replaceChildren()`（L793）** がある。

キー入力後のシーケンス:

1. キー入力 → MutationObserver → debounce 50ms → `emit()`: `lastEmittedHtmlRef.current = next` をセットして `onChange(next)`（L520-527）
2. 親 NoteEditor が `state.contentHtml` を更新 → `value` prop が変化
3. React は **effect 本体の前に cleanup を実行** → リスナー解除 + `host.replaceChildren()` でホストが空になる
4. effect 本体の self-emit ガード（L464）は `value === lastEmittedHtmlRef.current && host.childNodes.length > 0` — value は一致するが **childNodes.length が 0**（手順3で空にされた）のためガードがすり抜け、DOMParser での全再構築（L475-512）に進む
5. `host.replaceChildren()` で編集中ノードが破棄 → focusout 発火、フォーカスは BODY へ落ちて復帰しない

つまり「self-emit ガードのすり抜け」は、ガード条件自体が cleanup の破壊的処理と矛盾しており、**value が変わる限り毎回必ず全再構築になる**構造的バグ。TC-007 の約217ms（debounce 50ms + React 再レンダー + parse/rebuild）とも整合し、文字が失われないのは再構築のソースが emit 済みの最新 `value` だから。

なお、仮にガードが効いた場合（L464-467 で early return）でも cleanup 済みのリスナー・observer が再登録されないため、ガードを直すだけでは編集不能になる。effect の構造ごと直す必要がある。

### autosave / invalidate ではない

autosave は 1500ms、TC-007 の発生は約217ms。また本ブランチで `routerInvalidate` を編集画面から除外済みのため、loader 再実行による再マウント経路は既に塞がれている。残ったのが上記の InlineEditor 内部経路。

## 関連 Issue

- #669（本ブランチ対象）: 「編集中にフォーカスが外れる」を明記 — 本事象はこの項目そのもの
- #670: invalidate 起因の再マウントによる編集内容喪失（別経路、本事象とは異なる）
- #498: inline コードブロックの focusin/focusout ハイライト機構（本 effect の複雑化の背景）
- フォーカス喪失そのものを扱う既存 Issue は他に見つからず

## 推奨アクション

**本ブランチで即時修正**（#669 のスコープ内であり、新規 Issue 起票は不要）。

修正方針案:

- マウント/リスナー登録のライフサイクルと value リシンクを分離する。具体的には:
  - cleanup の `host.replaceChildren()`（L793）はアンマウント時のみ必要。`[value]` 依存の effect から DOM 破棄を切り離す（例: マウント専用 effect `[]` + リシンク専用 effect `[value]`、リシンク側は `value !== lastEmittedHtmlRef.current` のときだけ再構築）
  - もしくは effect を `[value]` のまま維持する場合、self-emit 時は cleanup 自体をスキップできないため、リスナー/observer を ref 化して再利用し、cleanup では破棄しない構造に変える
- 修正後、TC-007 の手順（inline モードで1キー入力 → 200ms 後もフォーカスとキャレットが維持されること、続けて入力が連続できること）で再検証する
- 既存の rollback / highlight（#498）経路はホスト DOM を直接差し替えるため、リシンク分離後も `lastEmittedHtmlRef` 更新との整合を保つこと
