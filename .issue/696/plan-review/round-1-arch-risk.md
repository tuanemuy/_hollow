# Plan Review — Issue #696 / Round 1（アーキテクチャ整合性・実現可能性・リスク）

レビュー視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク
対象: `.issue/696/plan.md` / `.issue/696/adr.md`
実コード照合: `NoteEditor.tsx` / `EditorModeSwitch.tsx` / `editorState.ts` / `ConfirmDialog.tsx` / `WysiwygEditor.tsx` / `InlineEditor.tsx` / `wysiwygUnsupportedTags.ts` / `noteEditorModeChange.test.tsx`

---

## 総評

計画は全体として実コードに正しく根ざしており、アーキテクチャ整合性は高い。フロントエンドのみの変更で
ドメイン／ユースケース／アダプターに波及しないという判断は正しく、`spec/pages/index.md` P12 が
編集画面の WYSIWYG を元々想定していたという「機能解禁」の位置づけも妥当。reducer をモデル状態に限定し
一過性 UI 状態（`pendingWysiwygSwitch`）を orchestrator local state に置く設計、`wysiwygUnsupportedAck`
の latch 仕様（空配列 no-op / `setsEqual` で ack 維持）に依拠して二重同意を回避するロジックは、実 reducer
（`editorState.ts` L547-568）と一致しており機能する。ConfirmDialog の `submit` が `stopPropagation`
する契約（L105-115）も実在し、外側 `<form>` 内配置の安全性は裏づけられている。

ただし **1 件、計画の前提を崩しうる重大な見落とし**（InlineEditor の onChange が blur で flush されない＝
`stateRef.current.contentHtml` の鮮度が保証されない）がある。これは AC-2/AC-5 の判定精度に直結するため
要修正とした。

---

#### 問題点（要修正）

- **[P-001]** InlineEditor の `onChange` は 50ms debounce で、`onModeChange` の `blur()` ではフラッシュされない。`stateRef.current.contentHtml` が「直前の編集を反映済み」とは限らない。
  - 理由: 計画の「設計」5・「リスクと注意点（`stateRef` の鮮度 / `detectUnsupportedTags` の対象）」は、未保存確認と同じく「blur 強制 → `stateRef` を読めば取りこぼさない」と述べているが、これは FrontMatter の commit-on-blur を念頭にした既存挙動であって、**InlineEditor には当てはまらない**。実コードを確認すると:
    - InlineEditor の emit は `input` イベント（および compositionend）を起点に `ONCHANGE_DEBOUNCE_MS = 50` の `setTimeout` で `onChange` を呼ぶ（`InlineEditor.tsx` L474-486, L736-742）。
    - `blur()`（focusout）が走っても emit を**同期フラッシュする経路は無い**。focusout ハンドラ（L779-786）は `<pre>` の再ハイライトのみで、debounce タイマーには触れない。
    - したがって編集画面（`mode="edit"` の既定 = `inline`）で文字を打った直後（<50ms）に WYSIWYG タブを押すと、`onModeChange` の `blur()` 実行時点で pending タイマーが残り、`stateRef.current.contentHtml` は**1 つ前の HTML**のままになりうる。
    - 影響: ただしこのケースで実害が出るのは「ユーザー編集により非対応タグの有無が変化した」狭い場合に限られる（タグ集合は通常テキスト編集では変わらない）。とはいえ「直前に `<section>` を含む構造を貼り付け→即タブ切替」のようなパスでは AC-2/AC-5 の判定対象がズレ、警告が出ない／古いタグ一覧が出る可能性がある。さらに既存の未保存確認分岐（`isDirty`）でも、debounce 未フラッシュだと `dirtyKeys` に `content` がまだ入っておらず未保存確認自体が出ないという既存からの限界も同根。
  - 提案: 以下のいずれかを計画に明記する。
    1. **割り切る（推奨・低コスト）**: 「非対応タグ集合は通常のテキスト編集では変化しないため、debounce 未フラッシュによる判定ズレは実用上無視できる。判定は `state.contentHtml`（最後にコミットされた HTML）に対して行う」と明示し、リスク欄の「blur 強制で取りこぼし防止」という**過剰な保証の記述を訂正**する（現状の記述は実装が満たせない約束になっている）。AC のテストも「コミット済み HTML に対する判定」で固定する。
    2. 厳密性を取るなら、InlineEditor に blur/unmount 時の同期フラッシュ手段（例: emit タイマーの即時実行）を足す——ただしこれはスコープ拡大かつ別コンポーネント改修になるため、本 Issue では 1 を推す。
  - 補足: いずれにせよ「`stateRef` を読めば直前編集が必ず反映される」という前提文言は実コードと矛盾するので、計画・ADR-002・リスク欄の該当記述の修正は必須。

---

#### 改善提案（検討推奨）

- **[S-001]** ConfirmDialog の確認ボタンが danger 固定である点を、テストで pin するだけでなく UX 上の妥当性も明記する。
  - 理由: ADR-001 は「失われる操作だから破壊的トーンは妥当」と判断しているが、これは「切り替え」というユーザーの主操作を danger 色で提示することを意味する。許容は妥当だが、レビュー時に「なぜ切り替えが赤いのか」が再燃しやすい。ADR-001 の判断を尊重しつつ、確認ボタンのラベルを「切り替える」とし danger 色になる旨を spec/design 観点で 1 行残しておくと、後続レビューでの蒸し返しを防げる（既に ADR に記載済みなので、計画リスク欄にも軽く反映する程度でよい）。

- **[S-002]** `wysiwygUnsupportedAck` を切り替え同意時に**先行 dispatch**するタイミングと、WysiwygEditor の `onCreate` 再検出の順序関係をテストで明示的に pin する。
  - 理由: 計画/ADR-002 は「`wysiwygUnsupportedDetected` は latch（同一集合なら ack 維持）なので onCreate 再検出が先行 ack を消さない」と述べており、これは reducer 実コード（L558 `setsEqual` で同一集合は state 参照を返す→ack 維持）と一致している。ただし `detectUnsupportedTags` は結果を `.sort()` して返し（`wysiwygUnsupportedTags.ts` L111）、reducer 側も `setsEqual`（順序非依存）で比較するため一致するが、**「ConfirmDialog で見せた lostTags」と「onCreate で再検出される tags」が同一集合であること**が ack 維持の前提になっている。両者とも同じ `detectUnsupportedTags(同一 HTML)` 由来なので一致するはずだが、`pendingWysiwygSwitch.lostTags` をダイアログ表示用に別途保持する設計なので、ここが将来ズレると二重同意が再発する。テストで「同意 → WYSIWYG マウント → バナーが `role="note"`（ack 済み控えめ表示）で出る・再同意ボタンが無い」を pin する計画は既にあるので、その意図（latch 依存の暗黙結合）をテストコメントに残すこと。

- **[S-003]** `pendingWysiwygSwitch` の同意時に dispatch する順序（`setMode` と `wysiwygUnsupportedAck` の発行順）を計画で確定する。
  - 理由: 両 dispatch は同一イベントハンドラ内で連続発火され React がバッチするため、reducer 適用順は dispatch 順に従う。`setMode "wysiwyg"`（L450-453）→ `wysiwygUnsupportedAck`（L565-568）はどちらの順でも最終 state は同じ（mode=wysiwyg かつ ack=true）になるので機能上の差は無いが、計画に「2 dispatch をまとめて発行、ack=true でマウントさせる」と明記しておくと実装ブレを防げる。なお ADR-002 の「`dispatch(setMode) と同時に dispatch(wysiwygUnsupportedAck)」の記述で十分カバーされている。

- **[S-004]** `detectUnsupportedTags` の入力が「サニタイズ済み HTML 前提（`<script>`/`<style>` 非対応）」である制約（`wysiwygUnsupportedTags.ts` L17-31, L88-99）を計画で軽く確認する。
  - 理由: 切り替え前判定の入力は `state.contentHtml` で、これは保存済み HTML（サーバーサニタイズ済み）または編集中の HTML。inline 編集中の中間 HTML もサニタイズ済み構造から派生するため前提を満たすが、「HTML タブで生入力した直後に WYSIWYG へ切替」というパスでは未サニタイズ HTML が判定対象になりうる。`detectUnsupportedTags` は regex ベースで `<script>` 等を素通しするため、悪意ある入力で誤判定する余地は理論上ある。実害は警告の精度のみ（XSS にはならない＝保存時にサーバーで再サニタイズ）だが、計画の「対象 = `state.contentHtml`」に「サニタイズ前提を満たす範囲で」と一言添えると正確。スコープ拡大は不要。

---

#### 良い点

- **アーキテクチャ整合性**: 「フロントエンドのみ、ドメイン/UC/アダプター不変」「P12 が編集画面 WYSIWYG を元々想定＝乖離補修ではなく機能解禁」という位置づけが正確。Issue #233 ADR-001（`wysiwyg` を new 専用にしていた暫定）を仕様に寄せるという文脈づけも実態（`EditorModeSwitch.tsx` JSDoc / `editorState.ts` JSDoc）と合致。

- **状態配置の判断が実コードの方針と一致**: reducer をモデル状態（content/mode/autosave/dirty）に限定する既存方針（`editorState.ts` 冒頭 JSDoc L1-44）を引用し、一過性のダイアログ UI 状態を orchestrator local state に置く判断は妥当。`pendingDirectoryName`（保存に絡む保留）との性質差の説明も的確。

- **二重同意回避ロジックが reducer 実装で実際に機能する**: `wysiwygUnsupportedDetected` の latch（空配列 no-op = L554、`setsEqual` で同一集合は ack 維持 = L558、新規集合のみ ack=false リセット = L562）を正しく読み解き、「同意時に `wysiwygUnsupportedAck` 併発 → onCreate 再検出が先行 ack を消さない」という結論は reducer の実挙動と一致。これは見落としがちな点を正確に押さえている。

- **ConfirmDialog の form 内配置が安全である根拠が実在**: `submit` ハンドラの `event.stopPropagation()`（`ConfirmDialog.tsx` L105-115、コメントに「NoteEditor 等の外側 form の submit を発火させない」と明記）により外側保存フォームの誤送信は起きない、という計画の主張は実コードで裏づけられている。

- **`subject` を使わない判断が正しい**: `subject` を渡すと「削除対象」ラベル + `Trash2` がハードコードで出る（`ConfirmDialog.tsx` L142-154）ことを正確に把握し、`description` に `<code>` リストで構造表示する設計は `WysiwygEditor` 既存バナーの描画（L496-502）と一貫。

- **styling 規約準拠**: 新規 CSS を書かず Tailwind utility / token（`warning-surface` 等）/ `data-*` variant を踏襲する方針で、CLAUDE.md の styling 規約に沿う。EditorModeSwitch のタブも既存 `pillBtn`/`data-primary` パターンを再利用するため逸脱なし。

- **既存テストへの影響評価が妥当**: `noteEditorModeChange.test.tsx` が `tabByLabel("HTML")` 経由で confirm 経路を pin している（L114-205）こと、HTML タブ経路にはダイアログを挟まないため壊れないことを正しく見ている。WYSIWYG タブ追加で `tablist` の要素は増えるが `tabByLabel` は label 完全一致で拾うため既存ケースは緑のまま、という読みも正しい。

---

## 結論

計画はアーキテクチャ・実現可能性ともに概ね健全で、設計判断（reducer vs local state、latch 依存の二重同意回避、
form 内 ConfirmDialog、subject 不使用）はすべて実コードで裏づけられる。**唯一の要修正は P-001**: InlineEditor の
debounce emit が blur で flush されない事実に反して、計画・ADR・リスク欄が「blur 強制で `stateRef` の鮮度を
担保できる」と過剰に約束している点。判定対象を「コミット済み `state.contentHtml`」と割り切る方針に訂正すれば、
実装は素直に成立する。S-001〜S-004 は計画の精度を上げる補強で、いずれもスコープ拡大は不要。
