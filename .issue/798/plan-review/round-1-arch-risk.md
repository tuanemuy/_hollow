# Plan Review — Issue #798（視点: アーキテクチャ整合性・実現可能性・リスク）

**対象:** `.issue/798/plan.md` / `.issue/798/adr.md`
**レビュー日:** 2026-06-28
**ラウンド:** round-1
**結論:** 計画は実装可能で、styling / a11y / props 契約・既存 ref パターンに沿っている。**要修正の問題点はゼロ。** 改善提案（任意）が3件と、検証で確認した良い点を記す。

---

## 検証で確認した事実（計画の前提が正しいこと）

- `lucide-react` は `ImageIcon` を export 済み（`node -e` で `typeof === object`＝forwardRef コンポーネントを確認）。tiptap の `Image`（`@tiptap/extension-image`、`WysiwygEditor.tsx:4` で import 済み）との名前衝突を `ImageIcon` エイリアスで回避する計画は妥当。
- `EDITOR_TOOLBAR_BTN` は `WysiwygEditor.tsx:129` にモジュールスコープ定数として既在。画像ボタンは同ファイル内なのでこの定数を再利用するのが正しく、`common/styles.ts` へ移す必要はない（styling 規約の「繰り返し文字列の hoist」は既に満たされている）。
- 既存ツールバーボタンは `Icon size={20}`、`type="button"`、`aria-label`+`title`、`role="toolbar"` 内（`WysiwygEditor.tsx:542-572`）。リンクボタンが「個別レンダーの単発アクション（`aria-pressed` を持つが配列外）」の先行例。計画の AC-1/AC-7 の作りはこれに整合。
- `onMediaInsert` の wysiwyg 分岐（`NoteEditor.tsx:197-205`）は `tiptapEditorRef.current.chain().focus().setImage(...)`。WYSIWYG では既に本文下 `MediaUploader` が存在し同じフローで動いているため、トリガー位置を増やすだけの本Issueはフロー無改修＝AC-3 が成立する（既存挙動の回帰なし）。
- モード別マウント（`NoteEditor.tsx:509-560`）は html/inline/wysiwyg を排他レンダー。WYSIWYG ブロックにのみ `inputRef`/`onRequestImage` を配線すれば、ボタンが存在するモード＝対応 `MediaUploader` がマウント済み、という不変条件が構造的に保証される。モード切替でアンマウントされると React が DOM ref の `.current` を null に戻すため stale ポインタにならない。計画の null 安全性の主張は正しい。
- disabled な `<input type="file">` への `.click()` は HTML 仕様上 activation が走らず no-op。アップロード中（`disabled || state.kind === "uploading"`、`MediaUploader.tsx:137`）の二重起動が自然に防がれるという計画の論拠は正しい。

---

## 問題点（要修正）

**問題点ゼロ。**

アーキテクチャ整合性・実現可能性・主要リスク（ref の null 安全、名前衝突、二重起動）はいずれも計画内で正しく処理されており、ブロッカーは見当たらない。

---

## 改善提案（検討推奨）

- **[S-001] `inputRef` のプロップ型は `React.RefObject<HTMLInputElement | null>` に揃えるとコードベース慣習に最も整合する**
  - 理由: 計画は `inputRef?: React.Ref<HTMLInputElement>` を提案している。これは型としては正しく（`useRef<HTMLInputElement>(null)` の戻り値 `RefObject<HTMLInputElement | null>` は `React.Ref<…>` に代入可能で typecheck も通る）が、本コードベースで file input の ref をプロップ受けする既存箇所は **すべて `React.RefObject<HTMLInputElement | null>`**（`ingestion/UploadDialog.tsx:380` の `fileInputRef`、`ingestion/IngestionPreviewForm.tsx:52` の `titleInputRef`）であり、踏襲対象の `editorRef?: React.RefObject<Editor | null>`（`WysiwygEditor.tsx:96`）も `RefObject` 形。`React.Ref` はコールバック ref も許容する広い union で、ここでは親が `useRef` で作る ref object に限定されるため、`RefObject<HTMLInputElement | null>` の方が意図に忠実かつ既存パターンと同型。`<input ref={inputRef}>` への直接配線は DOM ref では正攻法（effect で `.current` 代入する `editorRef` 流儀をまねる必要はない）なので、配線方法はそのままで型だけ揃えれば良い。

- **[S-002] ADR-001 の「先行例」に file input ref のプロップ受け渡し実績を追記すると決定の説得力が増す**
  - 理由: ADR-001 は連携方式 (A) の根拠を `editorRef` の ref-as-prop パターンに置いているが、より近い先行例として `UploadDialog`／`IngestionPreviewForm` が **file input の ref をプロップとして渡す**実装が既にある（`UploadDialog` は親が `fileInputRef` を保持し `.value` リセット等に使用）。「DOM input ノードを親へ露出するのはカプセル化が弱い」というトレードオフ記述に対し、本リポジトリでは既に確立した流儀だと示せるため、(A) 採用の正当性が補強される。

- **[S-003] アップロード中に画像ボタンが「見た目 enabled だが no-op」になる点を UX 注意として明文化**
  - 理由: 計画の設計上、画像ボタンの `disabled` はエディタ準備状態（`isDisabled || onRequestImage === undefined`）のみで判定し、`MediaUploader` の uploading 状態は追わない（契約を増やさないため＝妥当な判断）。結果、アップロード中はボタンが押下可能に見えてクリックしても `.click()` が no-op になる。機能上の不具合ではなく ADR-002／リスク節の意図どおりだが、「ボタンは押せるが反応しない」短時間ウィンドウが生じることを既知の許容事項としてリスク節に1行残すと、後続のレビュー・QA が「バグではない」と判断しやすい。本文下のアップローダー UI に進捗が出るため致命的ではない。

---

## 良い点

- **責務分担が層構造に忠実。** capability（`MediaUploader`）→ 仲介（`NoteEditor` オーケストレーター）→ トリガー（`WysiwygEditor`）の三分割が、既存の `tiptapEditorRef`／`editorRef`＝「親が ref を保持し子へ配る」構図と完全に同型。新パターン（`useImperativeHandle`/`forwardRef`）をコードベースに持ち込まない判断が CLAUDE.md の「既存流儀を尊重」原則に合致。
- **props 契約 `{contentHtml, onInsert, disabled}` を厳守。** 追加する `inputRef` は契約と直交する任意項目で、html/inline 側の既存呼び出しは無改修。AC-4 が構造的に満たされる。
- **モード別挙動の差異を「配線の所在」で表現。** wysiwyg ブロックにのみ `inputRef`/`onRequestImage` を渡すことで、「画像ボタンが存在する＝対応 input がマウント済み」の不変条件を成立させ、ref の null 安全性を実行時チェックではなく構造で担保している。`make illegal states unrepresentable` の精神に沿う。
- **主要リスクを事前に正しく特定。** lucide `Image` と tiptap `Image` の衝突回避、disabled input `.click()` の no-op による二重起動防止、モード切替時の ref null 化を、いずれも計画／ADR 内で根拠付きで処理済み。レビューで独立検証してもすべて正しかった。
- **スコープ規律が明確。** #795/PR #797 の dropzone 刷新が未マージである現状を正とし、可視 input の hidden 化やフロー変更に踏み込まないと明言。ADR-002 が「dropzone 導入後の再検討」を将来分岐として残しており、過剰実装を避けている。
- **a11y 規約の網羅。** `role="toolbar"` 内配置、`aria-label`+`title`、`type="button"`、`TOUCH_TARGET_SQUARE`、トグルでないため `aria-pressed`/`data-primary` を付けない（AC-7）まで、既存ツールバーボタンのパターンを正確に踏襲。

---

## 補足（参考・スコープ外）

- 既存ツールバー（`role="toolbar"`）は roving tabindex / 矢印キーナビゲーションを実装していない（全ボタンが Tab フォーカス可能）。これは **本Issue以前からの状態**で、ボタンを1つ増やしても劣化しない。ARIA APG 準拠を厳密に追うなら別Issue。本計画の範囲外として扱って問題ない。
