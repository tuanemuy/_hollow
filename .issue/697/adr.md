# ADR — Issue #697: FrontMatterモードを廃止し、メタデータを下部に常設

## ADR-001: 常設化後の `onModeChange` blur/commit ロジックの整理

### Status
Proposed

### Context
現状の `NoteEditor.onModeChange`（180-216 行）は「本文モード切替で、フォーカス中の FrontMatter 入力がアンマウントされる」ことを前提に、冒頭で `document.activeElement.blur()` を呼び、KeyRow / 新規キー入力の保留中 commit（rename/add）をアンマウント前に走らせている。コメントもこの前提を明示している。

FrontMatter を下部常設にすると、本文モードを切り替えても FrontMatter 入力はアンマウントされない。したがって「アンマウント前に commit する」という当初の目的は本文モード切替に対しては消滅する。一方で `onModeChange` には別の責務（未保存変更の confirm、discard 時の `abortInFlight`、**WYSIWYG 装飾消失ゲート**）が同居しており、これらは本文モード切替（inline/wysiwyg/html 間）で引き続き必要。

特に **WYSIWYG 装飾消失ゲート（Issue #696）** は main 実装に存在し、`surface === "edit" && nextMode === "wysiwyg"` のとき `detectUnsupportedTags(latest.contentHtml)` で消失するタグを検出して `ConfirmDialog` を開く。このゲートは `latest.contentHtml`（blur 後の `stateRef.current`）を読むため、blur で未フラッシュの入力を確定させてから検出する順序が意味を持つ。本 Issue はこのゲートを**温存**する。

論点：
- blur 呼び出しを残すか除くか。
- blur を「現在の `dirtyKeys`/`autosave` の鮮度を担保する」目的で残すべきか。

選択肢:
- (A) blur 呼び出しを完全に削除し、confirm/abort のみ残す。
- (B) blur 呼び出しは残すが、コメントを「FrontMatter アンマウント前提」から「フォーカス中フィールド（タイトル・タグ・FrontMatter 等）の未コミット入力を確定させ、後続の dirty 再評価を正しくするため」に書き換える。

### Decision
(B) を採用する。理由：
- `onModeChange` は blur 後に `stateRef.current` から `dirtyKeys`/`autosave` を読んで confirm 要否を判定している。タイトル入力やタグ draft、FrontMatter の KeyRow buffer など、フォーカス中フィールドの未コミット入力が blur で確定（dispatch）されれば、その直後の dirty 再評価がより正確になる。FrontMatter 入力がアンマウントされなくても、blur による commit 自体は引き続き有益（特に KeyRow の rename は blur で commit する設計）。
- ただし「FrontMatter アンマウント前提」という根拠コメントは事実と食い違うため削除し、上記の「未コミット入力の確定 + dirty 鮮度」の根拠に書き換える。
- confirm（未保存変更）・`abortInFlight`（discard 時の in-flight saveDraft 中断）・**WYSIWYG 装飾消失ゲート（ConfirmDialog / `pendingWysiwygSwitch` / `confirmWysiwygSwitch`）**は本文モード切替で必要なので**すべて維持する**。本 Issue は FrontMatter タブ除去と常設化のみを行い、これらの分岐には手を入れない。
- FrontMatter の構造/生トグル時の blur（`FrontMatterEditor.handleToggleMode`）は本文モード切替とは別経路で、常設化と無関係に必要なため変更しない。

### Consequences
- 良い点：既存の confirm/discard セマンティクス（`noteEditorModeChange.test.tsx` で pin 済み）を壊さず、blur による未コミット入力の確定という実利を保てる。FrontMatter 編集内容が本文モード切替で失われない（AC-5）。
- トレードオフ：blur 呼び出しの根拠が「アンマウント前提」から「dirty 鮮度 + 未コミット確定」へ変わるため、コメントの正確性をレビューで確認する必要がある。`onModeChange` のテストは挙動不変なので原則通るが、FrontMatter が常設で DOM に残ることで `container.textContent` 系アサートに干渉しないかは結合テストで確認する。

---

## ADR-002: `frontMatterMode`（structured/raw）を reducer に残し EditorMode と直交させる

### Status
Proposed

### Context
従来は本文モード `EditorMode` の一値 `frontMatter` がメタデータ編集画面を表し、その内部に構造/生トグル `frontMatterMode`（structured/raw）が入れ子になっていた。常設化にあたり、メタデータの表示状態（構造/生）をどこに持つかを決める必要がある。

選択肢:
- (A) `frontMatterMode` を reducer の state から外し、`FrontMatterEditor` の local `useState` に移す（常設なので orchestrator から制御する必要が薄い、という発想）。
- (B) `frontMatterMode` を reducer に残し、本文モード `EditorMode`（inline/wysiwyg/html）と直交した独立次元として保持する。

### Context補足
`frontMatterMode` の遷移（`toggleFrontMatterMode`）は単なる表示切替ではなく、構造→生で `frontMatterRawJson` を `frontMatter` から resync し、生→構造で raw を再パースして `frontMatter`/`frontMatterJsonError` を更新するという、FrontMatter モデル状態と密結合した遷移である（editorState.ts:389-431）。これらは autosave gate（`frontMatterJsonError !== null`）にも波及する。

### Decision
(B) を採用する。`frontMatterMode` / `frontMatterRawJson` / `frontMatterJsonError` を reducer に残し、`toggleFrontMatterMode` 等のアクションも不変とする。本文モード `EditorMode` から `frontMatter` を外すのみで、FrontMatter の状態次元はそのまま独立させる。Issue の方針3「`frontMatterMode`（structured/raw）の状態自体は引き続き保持」とも一致する。

### Consequences
- 良い点：`frontMatterMode` の遷移が `frontMatter`/`frontMatterRawJson`/`frontMatterJsonError`/autosave gate とモデルとして一貫したまま reducer に閉じる。reducer の純粋性（editorState 冒頭 JSDoc）を保ち、テスト可能性を維持。型変更の波及が「`EditorMode` の一値としての frontMatter」に限定され、最小差分で済む。
- トレードオフ：reducer がモデル状態に限るという方針（一過性ビュー状態は orchestrator local state、#696 ADR-002）との境界判断が必要だが、`frontMatterMode` は raw/structured で保存対象（`frontMatterRawJson`）と parse 状態に影響する「モデル寄り」状態であり、純粋なビュー開閉状態とは性質が異なるため reducer 保持が妥当。

---

## ADR-003: `editorModeSwitch.test.tsx`（#696 由来）の期待値更新

### Status
Accepted

### Context
`app/components/note/editor/__tests__/editorModeSwitch.test.tsx` は Issue #696 / PR #715（編集画面に WYSIWYG タブを追加）由来のタブ構成テスト。

**ベースブランチ確認済み（2026-06-13）**: PR #715（commit `c4ec3652`）は **origin/main に既にマージ済み**。本 Issue は main から切ったブランチで実装するため、`editorModeSwitch.test.tsx` は **git 追跡済み**であり、main 時点の期待値は:
- 編集 surface: `["ビジュアル","WYSIWYG","FrontMatter","HTML"]`（main の `TABS_EDIT` = inline/wysiwyg/frontMatter/html）
- 新規 surface: `["WYSIWYG","FrontMatter","HTML"]`（main の `TABS_NEW` = wysiwyg/frontMatter/html）

本 Issue は FrontMatter タブのみを除去する（WYSIWYG タブは #715 由来で温存）。

### Decision
本 Issue 後の実装に即して期待値から FrontMatter のみを除去する:
- `TABS_EDIT` 期待値 → `["ビジュアル","WYSIWYG","HTML"]`（inline + wysiwyg + html）。
- `TABS_NEW` 期待値 → `["WYSIWYG","HTML"]`。
- `Issue #696` 参照コメントは「WYSIWYG タブの存在」を pin する元の意図を保ちつつ、本 Issue で FrontMatter タブが消えた旨を追記する。

追跡済みファイルの期待値更新のみで、`git add` の新規追跡や二段構えの分岐判断は不要（#715 は main にあると確定済み）。

### Consequences
- 良い点：タブ構成（WYSIWYG あり・FrontMatter なし）の回帰を pin できる（AC-1）。#715 のテスト資産を壊さず本 Issue の変更だけを反映。
- トレードオフ：なし。ベースが main で確定しているため曖昧さは解消済み。

---
