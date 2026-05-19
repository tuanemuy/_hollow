# ADR — Issue #37: P12 WYSIWYG モード切替時に未対応タグの損失を警告する

## ADR-001: 未対応タグ検出は「元 HTML のタグ集合から supported を引く」方式にする

### Status
Accepted

### Context
Issue 本文は「元 HTML vs TipTap parse 後 HTML を diff」と書かれているが、具体的な実装方式は明示されていない。3 案あった:

1. **元 HTML のタグ名集合から supported を引く**（pure・高速・DOM 不要）
2. 元 HTML と `editor.getHTML()` のタグ名集合差分（pure・正規表現2回）
3. ProseMirror schema を通した構造 diff（属性差分まで検出可能だが ProseMirror への依存と誤検知が大きい）

### Decision
**案 1（元 HTML のタグ集合から supported を引く）** を採用する。supported 集合は「StarterKit v3 + Link + Image + Mention が表現できるタグ」と「TipTap が等価変換するため警告対象から除外したい alias タグ（`b`, `i`, `u`, `div`, `span`）」の和集合として静的に決める。

### Consequences
- **良い点**:
  - 入力 HTML だけで判定できるため `editor.getHTML()` を待たずに（= TipTap マウント完了前にも）評価できる
  - 正規表現一発の O(n) スキャンで完結し、大本文でも 1ms 未満で完了する
  - `wysiwygUnsupportedTags.ts` 単体で純粋関数として完結し、TipTap / happy-dom を起動せずに単体テストできる（Issue 受入条件「pure 関数として単体テスト可能にする」を直接満たす）
  - SSR / Cloudflare Worker / Node テスト環境のいずれでも動作（DOMParser 等のブラウザ API に依存しない）
- **トレードオフ**:
  - 属性レベルの差分（例: `<a target="_blank">` の `target` が落ちる）は検出できない。本 Issue の動機はサイレントなデータロス防止であり、属性ドロップはサニタイザの責務領域なのでスコープ外と判断
  - supported 集合が静的なため、将来 TipTap 拡張を増やしたら集合を更新する必要がある。これは `wysiwygUnsupportedTags.ts` の JSDoc に「StarterKit v3 時点の構成に依存」と明記して保守性を担保する

---

## ADR-002: autosave 抑止条件に `state.mode === "wysiwyg"` を含める

### Status
Accepted

### Context
受入条件は「警告を確認するまでは autosave が抑止される（または『確認後に編集を始めると失われる』UX を明示）」とある。抑止条件を 2 案検討した:

1. `wysiwygUnsupportedTags.length > 0 && !wysiwygUnsupportedAck` のみ（モード不問）
2. `state.mode === "wysiwyg" && wysiwygUnsupportedTags.length > 0 && !wysiwygUnsupportedAck`（モード限定）

### Decision
**案 2（モード限定）** を採用する。HTML タブで編集している間は autosave を抑止しない。

### Consequences
- **良い点**:
  - HTML タブなら未対応タグは保持されるため、autosave を止める必要がない
  - ユーザーが警告に気づいた後「HTML タブに戻って編集して保存」する動線を妨げない（むしろ推奨する動線になる）
  - 「警告 banner が出ているのに HTML タブで保存できない」という UX の矛盾を避ける
- **トレードオフ**:
  - 条件が 1 つ増える。ただし既存の早期 return ガードと同じ場所に並べるので可読性は維持される
  - WYSIWYG タブから離れても `wysiwygUnsupportedTags` 状態は保持され、autosave ガードは mode 条件で開放される（HTML タブでの編集を妨げない意図的な設計）。`setMode("html")` 等で警告 state をクリアしないことを reducer テストで pin する

---

## ADR-003: ack 後も banner を控えめに残す

### Status
Accepted

### Context
ユーザーが「了解した」を押した後の banner 表示を 3 案検討:

1. ack 後は banner を完全に隠す
2. ack 後も同じ banner を表示し続ける
3. ack 後は控えめなインラインメッセージで「以下の要素は WYSIWYG モードでは保持されません」と継続表示

### Decision
**案 3（控えめなインライン表示で継続）** を採用する。`acknowledged === true` のとき:
- `role="alert"` ではなく `role="note"` を使う
- 「了解した」ボタンは消し、失われるタグ一覧だけ表示する

### Consequences
- **良い点**:
  - 失われたタグ一覧は編集中ずっと参照可能で、ユーザーが「数分後にもう一度確認したい」ときに見られる
  - 受入条件「確認後に編集を始めると失われる UX を明示」を満たす
  - 視覚的な圧力は減らしつつ情報は残す
- **トレードオフ**:
  - banner の表示状態が 3 つ（非表示 / 警告 / 確認済み）になるため JSX が少し複雑になる。ただし条件分岐は単純なので可読性は維持される

---

## ADR-004: 警告 banner は `WysiwygEditor` 内 inline で実装し、別コンポーネントに切り出さない

### Status
Accepted

### Context
banner の置き場所を 3 案検討:

1. `app/components/note/editor/WysiwygUnsupportedTagsBanner.tsx` のような別ファイルに切り出す
2. `WysiwygEditor.tsx` 内に JSX を直接書く
3. `NoteEditor.tsx` 内に JSX を直接書く

### Decision
**案 2（`WysiwygEditor` 内 inline）** を採用する。

### Consequences
- **良い点**:
  - CLAUDE.md の「Don't add features … beyond what the task requires」「Three similar lines is better than a premature abstraction」原則に沿う
  - banner は 1 箇所でしか使われないため、別コンポーネントに切り出してもファイル数とインポート数が増えるだけ
  - `WysiwygEditor` 内に置くことで「WYSIWYG タブ表示時のみ banner が出る」条件レンダリングを追加せずに済む（`NoteEditor` の wysiwyg ブロック内でしか mount されないため）
- **トレードオフ**:
  - `WysiwygEditor` の責務が「TipTap マウント + 警告 UI」に拡張される。ただし両者は密結合（警告対象は WYSIWYG モード固有）なので妥当
  - 将来 banner デザインが複雑化したら別コンポーネントへ切り出す。本 Issue ではその段階ではない

---

## ADR-005: 検出を `onCreate` のみで実行し、reducer 側でも空集合 dispatch を無視する latch を持つ

### Status
Accepted

### Context
当初の計画は検出を 2 箇所で行う設計だった:
1. `WysiwygEditor` の `onCreate` 内
2. `WysiwygEditor` の `useEffect([editor, value])` 内（外部 `value` 差し替え後の検出）

しかしレビューで以下の致命的経路が発見された:
1. WYSIWYG タブを開く → 初回検出で `["table","mark"]` → banner 表示 / autosave 抑止
2. ユーザーが ack 前に WYSIWYG モードで何か 1 文字打つ
3. TipTap の `onUpdate` → `onChange(getHTML())` → 親の `state.contentHtml` がロス済み HTML に置き換わる
4. 親が `value` prop を更新 → `WysiwygEditor` の `useEffect([editor, value])` が走る
5. `detectUnsupportedTags(value)` が `[]` を返す（既にロス済みのため）
6. 「異なる集合だから ack をリセット」する reducer ロジックが発動 → banner 消える / autosave ガード解除
7. autosave 走行 → **データが永久に失われる**

これは Issue 受入条件「警告を確認するまでは autosave が抑止される」を満たさない。

### Decision
以下の二重対策を採用する:

1. **検出は `onCreate` 内でのみ実行**。`useEffect([editor, value])` での再検出は行わない
2. **reducer は空集合 `[]` の `wysiwygUnsupportedDetected` dispatch を無視**（state を変更しない latch 動作）

WYSIWYG タブから離れた場合は `NoteEditor.tsx` の条件レンダリングで `WysiwygEditor` が unmount される。再度タブに戻ると新規 mount で `onCreate` が再走し、新しい `value` を起点に検出される。これにより HTML タブで編集 → WYSIWYG タブで再警告という動線も自然にカバーされる。

### Consequences
- **良い点**:
  - ユーザーが ack 前に編集を始めても banner が消える経路を構造的に排除（=データロス防止が確実）
  - 検出ロジックの呼出回数が減るのでパフォーマンス的にも有利
  - reducer 側の latch は呼出側の実装ミス（誤って空集合を dispatch しても）に対する防衛線として機能
- **トレードオフ**:
  - WYSIWYG タブ表示中に親が `value` を差し替える（autosave 復元等）動線では再検出されない。本 Issue のシナリオでは差し替え経路がない（HTML タブ → WYSIWYG タブの遷移は unmount/remount を伴う）ため許容
  - 「ユーザーが ack せず WYSIWYG モードで編集 → 新しい未対応タグを追加」というケースは theoretical には reducer の「異なる集合なら ack リセット」が発動しないが、StarterKit の WYSIWYG モードで未対応タグを増やすことはできない（StarterKit が解釈しないので入力できない）ため実害なし
