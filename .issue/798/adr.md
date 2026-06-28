# ADR — Issue #798: WYSIWYG toolbar の「画像」ボタンを MediaUploader に配線する

## ADR-001: コンポーネント間連携は「親が file input ref を保持し、ツールバーボタンが `.click()` を呼ぶ」

### Status
Proposed

### Context
WYSIWYG ツールバーの画像ボタン（`WysiwygEditor` 内）から、本文下に別マウントされる `MediaUploader` のファイル選択を起動したい。両者は `NoteEditor` がマウントする兄弟コンポーネントで、直接の親子関係はない。Issue は3案を提示:

- (A) 親（NoteEditor）が `MediaUploader` の file input への ref を保持し、ツールバーの画像ボタンクリックで `.click()` を呼ぶ。
- (B) `MediaUploader` が `useImperativeHandle` + ref で「ファイル選択を開く」関数を公開し、親がそれをツールバーへ渡す。
- (C) dropzone へスクロール+フォーカスする。

制約・既存事情:
- `MediaUploader` の props 契約 `{contentHtml, onInsert, disabled}` をなるべく壊さない。
- 既存 `WysiwygEditor` は `editorRef?: React.RefObject<Editor|null>` を「ref をプロップとして渡し、子が effect で `.current` を設定する」形で親へ公開済み。コードベースに `useImperativeHandle` / `forwardRef` の使用例は無い。
- さらに近い先行例として、`ingestion/UploadDialog`（親が `fileInputRef` を保持し `.value` リセット等に使用）と `ingestion/IngestionPreviewForm`（`titleInputRef`）が **file input / input の DOM ref をプロップとして子へ渡す**実装を既に持つ。`<input ref={inputRef}>` への直接配線は本リポジトリで確立済みの流儀。
- React 19.2 系のため ref は通常プロップとして受け取れる。
- 現状 `MediaUploader` は #795/PR #797 マージ済みの dropzone 版で、`DROPZONE` 定数を使った `<label htmlFor={inputId}>` 内に `<input type="file">` を描画する（uploading 中は dropzone ごとアンマウントされ進捗 UI に差し替わる）。

### Decision
(A) を採用する。`MediaUploader` に契約と直交する任意プロップ `inputRef?: React.RefObject<HTMLInputElement | null>` を1つ追加し、内部の `<input>` に配線するだけにする。型は既存の file input ref プロップ受け（`UploadDialog` の `fileInputRef`、`IngestionPreviewForm` の `titleInputRef`）と同型の `RefObject` 形に揃える（`React.Ref` はコールバック ref も含む広い union だが、ここでは親が `useRef` で作る ref object に限定されるため `RefObject` が意図に忠実）。`NoteEditor` が `mediaInputRef` を保持して WYSIWYG 用 `MediaUploader` にのみ渡し、`onRequestImage = () => mediaInputRef.current?.click()` を `WysiwygEditor` へ渡す。

理由:
- `{contentHtml, onInsert, disabled}` 契約を壊さない（`inputRef` は直交する任意項目）。
- 既存 `editorRef` の ref-as-prop パターンと同型 → コードベースに無い `useImperativeHandle`/`forwardRef` を新規導入せずに済む。とくに `UploadDialog` / `IngestionPreviewForm` が **file input の ref をプロップ受けする実績**を既に持つため、「DOM input ノードを親へ露出する」ことは本リポジトリの確立した流儀であり、(A) のカプセル化トレードオフは既存範囲内に収まる。
- 「ファイル選択を開く」操作の SSOT は input 要素そのもの。親がそれを参照すれば `.click()` で素直に起動でき、アップロード状態（idle/uploading/error/done）を親へ漏らす必要がない。uploading 中は dropzone（input を含む）がアンマウントされ `mediaInputRef.current` が null になるため `.click()` は no-op になり、加えて `runUpload` 先頭の uploading ガードもあるため二重起動が自然に防がれる。

### Consequences
- 良い点: 最小変更。`MediaUploader` は「自分の input 参照を渡す」だけでアップロードロジックは不変。既存パターンに整合し読み手の認知負荷が低い。
- トレードオフ: DOM input ノードを親へ露出する（B のメソッド公開よりカプセル化は弱い）。ただし既存 `editorRef` が Editor インスタンス丸ごとを露出済みで、本プロジェクトの確立された流儀と一致する。input は dropzone label 内にあり、uploading 中はその dropzone ごとアンマウントされる（ref が null になる）点に依存している。将来 dropzone の構造や uploading 時の差し替え方を変える際は親の `.click()` 呼び出し前提を見直す必要がある（その時点で B への移行を再検討）。

---

## ADR-002: トリガー挙動は「ファイル選択ダイアログを開く」（scroll+focus dropzone は採らない）

### Status
Proposed

### Context
Issue は画像ボタンの挙動として「hidden file input の click」または「dropzone へスクロール+フォーカス」を挙げる。現状 `MediaUploader` は #795/PR #797 マージ済みの dropzone 版で、`<label className={DROPZONE}>` 内に `<input type="file">` を持つ（uploading 中は dropzone ごとアンマウントされる）。

### Decision
画像ボタンは `mediaInputRef.current?.click()` でファイル選択ダイアログを直接開く。dropzone へ scroll+focus する方式は採らない。dropzone の UI 構造も変更しない（現状 UI を正とする）。

### Consequences
- 良い点: 1クリックでファイル選択に到達し、最短の操作で目的（画像追加）を達成。dropzone が存在する現状でも、ボタンからはダイアログ直開きが最短。アップロード後はカーソル位置へ挿入されるため WYSIWYG の文脈を保てる。
- トレードオフ: dropzone へのスクロール誘導は行わないため、ユーザーが「下に何が追加されたか」を直接見るには本文下のアップローダー UI（進捗/エラー表示）に視線を移す必要がある。今後「ボタン＝dropzone へスクロール+フォーカス」へ寄せたくなった場合は ADR-001 の `.click()` 前提とあわせて再検討する。

---
