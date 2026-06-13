# ADR — Issue #696: ノート編集画面に WYSIWYG モードを追加（切り替え時に装飾消失の警告ダイアログ）

## ADR-001: 装飾消失警告に ConfirmDialog を流用し、`subject` は使わない

### Status
Proposed

### Context
切り替え時の警告は構造的に「失われる要素」を提示する必要がある。選択肢:

- (A) `window.confirm()` — 既存の未保存確認と同じ手段。だが要素一覧を構造的（`<code>` リスト）に提示できず、Issue の「失われる要素を構造的に提示」要件を満たせない。
- (B) 専用の警告ダイアログを新規作成 — 既存パターンと重複し、a11y（`role="alertdialog"`、`aria-describedby`、フォーカストラップ）を再実装することになる。
- (C) 既存 `ConfirmDialog`（`role="alertdialog"`）を流用 — a11y・フォーカス・スクロールロックが揃っている。ただし全既存呼び出し元が破壊的操作専用で、`subject` を渡すと「削除対象」ラベル + `Trash2` アイコンがハードコードで出る。confirm ボタンも danger パレット固定。

### Decision
(C) を採用する。ただし `subject` プロップは**使わない**。失われる要素は `description`（`React.ReactNode`）に `<code>{`<${tag}>`}</code>` のリストとして描画する（`WysiwygEditor` 既存バナーと同じ描画パターン）。confirm ボタンの danger パレット固定はそのまま受け入れる — 「装飾が失われる」操作は破壊的トーンが妥当であり、`ConfirmDialog` に variant を足す改修（YAGNI として一度削除された経緯あり）は本 Issue のスコープ外とする。

### Consequences
- 良い点: a11y・モーダル挙動を再実装せず、Issue の構造的提示要件を満たせる。`ConfirmDialog` への破壊的変更が無く既存呼び出し元に影響しない。
- トレードオフ: 「削除対象」を強調する `subject` のリッチ表示は使えず、`description` 内に要素一覧を自前で組む。confirm ボタンが danger 色になる（許容）。

---

## ADR-002: 未保存確認と装飾消失警告の順序・統合、ゲート状態の置き場所、二重同意の回避

### Status
Proposed

### Context
切り替え時に 2 種類の確認が絡む:

1. 未保存変更確認（既存・`window.confirm`、`onModeChange` 冒頭で `dirtyKeys`/`autosave` を見て発火）。
2. 装飾消失警告（本 Issue・`ConfirmDialog`、WYSIWYG への切り替え時に非対応タグがあれば発火）。

さらに WYSIWYG ペイン内には既存の「非対応タグ警告バナー」があり、`onCreate` で `detectUnsupportedTags` を実行し `wysiwygUnsupportedAck` で同意を取る（同意まで autosave 停止）。素朴に実装すると、(2) で同意した直後に (3) のバナーでも同じ装飾喪失について再同意を求めることになり、二重同意になる。

論点は 3 つ:
- (2) と (1) の順序・統合をどうするか。
- (2) の保留状態（ダイアログ開閉・保留中の遷移先）をどこに持つか — reducer か orchestrator local state か。
- (2) の同意と (3) のバナーをどう整合させるか。

### Decision
- **順序**: 「未保存確認(1) → 装飾警告(2)」の直列とする。`onModeChange` 既存フロー（blur → dirty 再評価 → 未保存 confirm → abortInFlight）を維持し、その**後**に `nextMode === "wysiwyg"` のときだけ `detectUnsupportedTags(stateRef.current.contentHtml)` を実行して (2) を判定する。統合（1 つのダイアログにまとめる）はしない — 関心（未保存 vs 装飾喪失）が異なり、未保存確認は全モード切替共通、装飾警告は WYSIWYG 切替限定で発火条件が違うため。
  - **判定対象の鮮度（割り切り）**: 判定は「最後にコミットされた `state.contentHtml`」に対して行う。InlineEditor の `onChange` は `ONCHANGE_DEBOUNCE_MS = 50` の debounce で emit され、`blur()`（focusout）では同期フラッシュされない（focusout ハンドラは `<pre>` 再ハイライトのみで debounce タイマーに触れない）。したがって「blur 強制で `stateRef` の鮮度を担保できる」という保証は成立せず、debounce 未フラッシュの編集分は判定に含まれ得ない。ただし非対応タグ集合は通常のテキスト編集では変化しないため、判定ズレは実用上無視できると割り切る。InlineEditor へ同期 flush を足す改修は本 Issue のスコープ外とする。なお `detectUnsupportedTags` はサニタイズ済み HTML 前提（regex ベースで `<script>` 等を素通し）であり、「HTML タブで生入力直後に WYSIWYG 切替」パスでは未サニタイズ HTML が対象になりうるが、実害は警告精度のみ（保存時にサーバー再サニタイズ）。
- **ゲート状態の置き場所**: orchestrator(`NoteEditor`) の `useState`（`pendingWysiwygSwitch: { lostTags } | null`）に置く。reducer(editorState) には足さない。理由: これはダイアログ開閉という一過性のビュー UI 状態で、保存対象でもモデル遷移グラフの一部でもない。editorState は content/mode/autosave/dirty といったモデル状態に限定する既存方針（editorState 冒頭 JSDoc）に従う。`pendingDirectoryName`（保存時に作成される保留）とは性質が異なる。
- **二重同意の回避**: (2) の `ConfirmDialog` で同意したら、`dispatch(setMode "wysiwyg")` と同時に `dispatch({ type: "wysiwygUnsupportedAck" })` を発行する。これによりペイン内バナー(3) は「同意済み」状態（`role="note"` の控えめ表示、autosave 非停止）でマウントされ、同じ喪失について再度同意を求めない。`wysiwygUnsupportedDetected` は latch（空配列 dispatch は no-op、同一集合は ack 維持）なので、`onCreate` の再検出が先行 ack を消すこともない。

### Consequences
- 良い点: ユーザーは装飾喪失について 1 回だけ同意すればよい。reducer はピュアなモデル状態に保たれ、ダイアログ UI 状態が混ざらない。未保存確認と装飾警告は独立に保守できる。
- トレードオフ: 未保存 + 非対応タグの両方があると `window.confirm` → `ConfirmDialog` が連続で出る（2 ダイアログ）。ただし関心が別なので二重「装飾」同意ではなく、UX 上も妥当。`setMode` の同意処理で `wysiwygUnsupportedAck` を併発する暗黙の結合があり、テストで pin する必要がある。

---

## ADR-003: 編集画面の WYSIWYG タブの位置とラベル

### Status
Proposed

### Context
`TABS_EDIT` は現状 `[ビジュアル(inline), FrontMatter, HTML]`。`TABS_NEW` は `[WYSIWYG, FrontMatter, HTML]`。編集画面に WYSIWYG を足すとき、ラベルと並び順を決める必要がある。`inline` は仕様 C2-4 の「ビジュアル ⇄ HTML」に合わせて「ビジュアル」と呼ばれており、WYSIWYG と並ぶと「ビジュアル」「WYSIWYG」が紛らわしい可能性がある。

### Decision
- ラベルは新規作成と同じく「WYSIWYG」を使う（`TABS_NEW` と統一）。
- 並び順は `[ビジュアル(inline), WYSIWYG, FrontMatter, HTML]` とし、編集画面の既定モード `inline`（=「ビジュアル」）を先頭に残したまま WYSIWYG をその直後に置く。既定モードのタブ位置を動かさないことで既存ユーザーの操作記憶を保つ。

### Consequences
- 良い点: 新規/編集でラベルが一貫する。既定モードのタブ位置が不変。
- トレードオフ: 「ビジュアル」と「WYSIWYG」が隣接し、両者の違い（inline=構造保全のテキスト編集 / WYSIWYG=TipTap リッチ編集、ただし非対応タグは喪失）がラベルだけでは伝わりにくい。装飾消失警告ダイアログが実質的にこの差を補足する。ラベル文言の再検討はフォローアップ余地として残す。

---

## ADR-004: 同意ハンドラの dispatch 順序（tags seed → ack → setMode）

### Status
Accepted（実装時に確定）

### Context
ADR-002 は「同意時に `setMode "wysiwyg"` と `wysiwygUnsupportedAck` をまとめて発行し、ペイン内バナーを二重同意させない」と決めたが、実装で `setMode` + `wysiwygUnsupportedAck` の 2 つだけを dispatch したところ、切り替え直後に WYSIWYG ペインがマウントされて `onCreate` が走り、`detectUnsupportedTags(value)` が同じ非対応タグ集合（例: `section`）を再検出して `wysiwygUnsupportedDetected` を dispatch する。

`editorState` reducer の `wysiwygUnsupportedDetected` は「現在の `wysiwygUnsupportedTags` と**異なる**集合を受け取ると `wysiwygUnsupportedAck` を `false` にリセットする」latch である。同意時点では `wysiwygUnsupportedTags` はまだ空配列なので、`onCreate` 由来の「空 → `["section"]`」という集合変化が ack を打ち消し、ペイン内バナーが再び「了解した」を要求してしまう（happy-dom 上の結合テストで実際に再現した）。ADR-002 が前提とした「同一集合なら ack 維持（`setsEqual` 短絡）」は、ack 発行時に tags が既に同一集合でなければ成立しない。

### Decision
同意ハンドラ（`NoteEditor.confirmWysiwygSwitch`）で 3 つの action を**この順序**で 1 つの React イベント内に dispatch する:

1. `wysiwygUnsupportedDetected({ tags: pending.lostTags })` — ダイアログが提示したのと**同一集合**で `wysiwygUnsupportedTags` を先に seed する。これにより `onCreate` の再検出は `setsEqual` 短絡に当たり、reducer は state を据え置く（ack を消さない）。
2. `wysiwygUnsupportedAck` — tags を seed した**後**に ack を立てる（手順 1 の reset-on-change に巻き込まれない）。
3. `setMode "wysiwyg"` — ペインをマウントする。

3 つは同一イベントハンドラ内で同期 dispatch され、1 回の再レンダリングに batch される（最終 state: tags=lostTags, ack=true, mode=wysiwyg）。

### Consequences
- 良い点: ペイン内バナーが「同意済み（`role="note"`・autosave 非停止）」でマウントされ、ユーザーは装飾喪失について 1 回だけ同意すればよい（AC-7）。ADR-002 の意図を実コードの latch 挙動に合わせて達成する。
- トレードオフ: 同意ハンドラがバナー latch の内部仕様（reset-on-change）に依存する暗黙結合を持つ。`noteEditorModeChange.test.tsx` の AC-7 ケースで「同意 → WYSIWYG マウント → `onCreate` 再検出後もバナーは `role="note"` で再同意ボタン無し」を pin し、コメントで結合理由を明示してリグレッションを防ぐ。
- 補足: 非対応タグが 0 件のパス（AC-3）は手順 1〜2 を経由せず、`onModeChange` 内で直接 `setMode` するだけ（このゲート自体に入らない）。

---

## ADR-005: 装飾消失ゲートを編集画面（`surface === "edit"`）のみに限定する

### Status
Accepted（PR #715 Round 2 レビューで確定）

### Context
初版実装では装飾消失ゲートの発火条件を `nextMode === "wysiwyg"` のみとし、`surface` を見ていなかった。新規作成画面（`mode="new"`）は既定が WYSIWYG・初期 content が空のため通常はダイアログが出ないが、「HTML タブに切り替えて `<section>` 等を含む生 HTML を入力 → WYSIWYG タブ」という経路では本 PR 以降に新たに装飾消失 `ConfirmDialog` が出るようになっていた。これは AC-6「新規作成画面のタブ構成・切り替え挙動は変わらない」と食い違う（PR 前の新規作成画面ではこの経路にゲートは無く、同意は WYSIWYG ペイン内バナーのみが担っていた）。約束（AC-6）・実装（surface 共通）・テスト（空 content のみ pin）の三者にズレがあった。

選択肢:
- (A) AC-6 の文言を「ゲートは surface 共通だが新規は通常 content 空のため通常はダイアログ非発火」と実態に合わせて緩め、新規でもゲートが効くことを意図挙動として pin する。
- (B) ゲートを `surface === "edit"` 限定に絞り、新規作成画面の挙動を PR 前と完全一致に保つ。

### Decision
(B) を採用する。`NoteEditor.onModeChange` のゲート条件を `surface === "edit" && nextMode === "wysiwyg"` とし、`useCallback` の依存配列に `surface` を追加する。新規作成画面（`surface === "new"`）はゲートを通さず、装飾消失の警告は従来どおり WYSIWYG ペイン内バナーのみが担う。AC-6 を厳守し、約束・実装・テストのズレを解消する。

### Consequences
- 良い点: 新規作成画面の挙動が PR 前と完全一致（AC-6 厳守）。回帰テスト（new-surface で `<section>` 生入力 → WYSIWYG 切替でダイアログ非発火）で pin。編集画面のゲートは従来どおり機能する。
- トレードオフ: 新規作成画面の「HTML → WYSIWYG」経路は事前ダイアログ無しでペイン内バナーのみの警告となり、編集画面（事前ダイアログ）との間に軽微な UI 一貫性の差が残る。装飾喪失について新規ではマウント後のバナーで、編集では切替前のダイアログで同意を取るという二系統になるが、新規作成は「まだ保存されていない下書き」であり喪失リスクが相対的に低いこと、および AC-6（既存挙動の維持）を優先する判断として許容する。

---
