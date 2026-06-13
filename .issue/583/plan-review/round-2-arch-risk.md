# Round 2 レビュー — アーキテクチャ整合性・実現可能性・リスク（Issue #583）

レビュー対象: `.issue/583/plan.md` / `.issue/583/adr.md`（round-1 反映後）
視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク

## 実コードで再確認した事実（すべて plan/adr の記述と一致）

- **autosaveSuccess が dirtyKeys を空にする唯一のアクション**: `editorState.ts:497-503` の `autosaveSuccess` で `dirtyKeys: EMPTY_DIRTY`。他に `dirtyKeys` を空に戻す reducer ケースは無い（`autosaveError` L504-509 は `autosave` のみ更新し dirty 不変、`autosaveDiscarded` L510-523 も「`dirtyKeys` is intentionally preserved」とコメント明記で dirty 不変）。plan ステップ2(b) / ADR-002 の「手動保存は dirtyKeys をリセットしない」前提は正しい。
- **createInitialEditorState の初期値**: `editorState.ts:219` で `dirtyKeys: EMPTY_DIRTY`。plan の「初回 effect は `0 → 0` で何もしない」根拠は正確。
- **setTagDraft は dirty を積まない**: `editorState.ts:487-493`、コメントで「Editing the draft alone does not mark tags dirty」。`addTag`（L460-480）/`removeTag`（L481-486）は `withDirty(..., "tags", ...)`。AC-2 の「draft 入力では dirty にならず確定で立つ」は正しい。
- **判別ユニオンと noteId 正規化**: `NoteEditorProps`（`NoteEditor.tsx:78-90`）は `{ mode: "new" } | { mode: "edit"; noteId: string; ... }` で `new` に `noteId` プロパティ無し。`const noteId = props.mode === "edit" ? props.noteId : null;`（L106）。ガード対象は `noteId === null`。
- **手動保存パス**: `onSubmit` の `mode !== "new"` 分岐（L318-334）で `await saveNote(...)`（L319）→ `await router.navigate(...)`（L330）。dispatch 無し。ステップ2(b) の「`saveNote` の await 直後・navigate 前に `clearNoteUnsaved(props.noteId)`」は型・位置とも成立（この分岐内 `props.noteId` は `string`）。
- **useAutosave の noteId ガード**: `shouldFlushAutosave`（`useAutosave.ts:136-151`）冒頭 `if (noteId === null) return false;`。ガード条件 `if (noteId === null) return;` に揃える方針は整合。
- **PublishSettings の close-reset effect**: `index.tsx:142-149`、依存 `[open, data.visibility]`、冒頭 `if (open) return;`。ステップ3 の「`if (!open) { reset...; setHasUnsaved(false); return; }` に書き換え、open 側で read」は実構造どおり実装可能。`noteId: string`（Props L96）なので read 時の noteId は非 null 保証。
- **URL preview / apply ボタン位置**: `selected === "public"` の preview（L244-249）→ apply ボタン（L250-258）。ステップ3 の挿入位置（preview と apply の間）はモック順（preview → safety-check → apply）と一致。
- **モック safety-check**: `P14-publish-settings.html:963-973`、`role="status"`（L964）、title「未保存の変更があります」（L969）、body「公開には最後に保存した版が使われます。最新版を反映したい場合は先にノートを保存してください。」（L970）。plan ステップ4 の文言と verbatim 一致。
- **ALERT プリミティブ / 前例**: `common/styles.ts` に `ALERT`(L418)/`ALERT_WARNING`(L428)/`ALERT_ICON`(L434)/`ALERT_CONTENT`(L437)/`ALERT_TITLE`(L440) 実在。`UploadForm.tsx` に `ALERT_WARNING` + `AlertTriangle` + `Icon size={20}` の実 JSX 前例あり。ステップ4 は前例どおり組める。
- **NoteActions の noteId 伝搬**: `NoteActions.tsx:261` で `<PublishSettings ... noteId={noteId} ... />`。ステップ3 が読む noteId は伝搬済み。
- **stateRef の commit-phase ミラー前例**: `NoteEditor.tsx:152-155` に `useRef(state)` + `useEffect` ミラーの既存前例。ADR-002 が言う「`stateRef` 同様の前例」は実在。

## 1周目指摘の解消確認

- **[coverage P-001 / 手動保存 clear 取りこぼし]** → ステップ2(b) + ADR-002 で解消。`saveNote` 成功直後の明示 `clearNoteUnsaved(props.noteId)` を追加。AC-3 を手動保存ケース込みの外形検証に拡張済み。**実コードと整合。**
- **[arch P-001 / dirty clear トリガー広すぎ（初回マウント誤 clear）]** → ステップ2(a) + ADR-002 で「`useRef` 前回 size + 立ち上がり/立ち下がりエッジ限定、`0→0` は no-op」に書き換え済み。`createInitialEditorState` の `EMPTY_DIRTY` 初期化により初回 effect が `0→0` で no-op になる根拠も実コードで確認。**解消。**
- **[arch P-002 / mode==="new" の noteId 型]** → ステップ2(c) + リスク欄 + ADR-002 で「判別ユニオン上 noteId 無し、正規化で null、`if (noteId === null) return;` に統一」へ修正。「仮の noteId」の誤記は除去済み。**解消。**
- **[arch S-001 / open 時 read の相乗り具体化]** → ステップ3 で「`if (!open) { reset...; setHasUnsaved(false); return; }` に書き換え、open 側で `setHasUnsaved(readNoteUnsaved(noteId))`」と早期 return の書き換え方まで具体化。**反映。**
- **[arch S-002 / unsavedFlag.ts 配置]** → ステップ1 で `app/components/note/editor/` から `app/components/note/` 直下へ移動。editor が書き publication が読む2ドメイン横断のため editor 内部依存を避ける根拠を明記。`note/` 直下に横断モジュール（`actions.ts` 等）が並ぶ事実も確認済み。テストパスも `note/__tests__/` に更新。**反映。**
- **[arch S-003 / autosaveError 残留は正しい挙動]** → リスク欄 + ADR-002 Consequences に「autosaveError で残るのは実際に未保存だから true で正しい、過剰検知ではない」を明記。**反映。**
- **[coverage P-002 / AC-3 を外形で検証]** → AutosaveIndicator 保存済み表示 / 手動保存後 detail で警告なし、の外形検証文言に修正済み。
- **[coverage S-001 / モック行番号]** → 実体 `:963-973`、`role="status"` は `:964`、文言 `:969-970`、Issue 本文 `:717-746` は旧版/CSS 参照、を調査結果・リスク欄に注記。実ファイルと一致。
- **[coverage S-002 / タグ dirty 仕様]** → AC-2 に明記済み。

## 新設 ADR-002 と実コードの整合検証

ADR-002 の「エッジ追跡 + 手動保存明示 clear」の2系統は、reducer の実挙動（`autosaveSuccess` のみが dirty を空に戻す / 手動保存・autosaveError・autosaveDiscarded は dirty を残す）と完全に一致する。

- 立ち下がりエッジ（`>0 → 0`）が起きるのは `autosaveSuccess` のときだけ → autosave 成功で確実に clear。
- 手動保存は dirty を残すため立ち下がりエッジが起きない → ステップ2(b) の明示 clear が唯一の降ろし口で、これが無いと誤検知が恒常化するという ADR の論証は reducer の実挙動から導けて妥当。
- `autosaveDiscarded`（モード切替 discard）は dirty を保存するため、フラグは true のまま残る。これは「編集はまだ未保存」なので正しく、ADR-002 の安全側の整理と一貫。
- 初回マウント `0→0` no-op は `EMPTY_DIRTY` 初期化で成立。

2系統の実装可能性に技術的破綻は無い。`useEffect([state.dirtyKeys])` + `useRef` のエッジ判定、`onSubmit` 成功分岐への1行追加、いずれも既存パターン内で完結する。

---

#### 問題点（要修正）

問題点ゼロ。

round-1 で指摘した要修正2点（dirty clear トリガーの限定、mode==="new" の noteId 型）はいずれも実コードに接地した形で解消され、改善提案3点も全て反映されている。新設 ADR-002 は reducer の実挙動と矛盾せず、`editorState.ts` の reducer・`NoteEditor.tsx` の保存パス（autosave 立ち下がり + onSubmit 手動 clear）の双方と整合し、実装可能。レイヤー方針（dirty を sessionStorage の純クライアント境界に閉じ、domain/usecase/DTO/adapter を一切触らない）は CLAUDE.md と完全に一致。

#### 改善提案（検討推奨）

- **[S-001]** ステップ2(a) のエッジ追跡 effect の依存配列を、`state.dirtyKeys`（参照）にするか size（プリミティブ）にするか一言決めておくとブレが減る。`editorState.ts` の reducer は `dirtyKeys` を変化時のみ新しい `Set` 参照に差し替える（`addDirty` は変化が無ければ同一参照を返す `editorState.ts:239`、`autosaveSuccess` は常に共有 `EMPTY_DIRTY` 参照）ため、`useEffect([state.dirtyKeys])` で過不足なく発火する。プリミティブ size を依存にすると `>0 → 別の>0` の中間 effect が省け、`prevDirtySizeRef` を別途持つ設計とも素直に噛み合う。どちらでも正しく動くが、計画が「`useEffect([state.dirtyKeys])`」と書いている（ステップ2(a)）ので、その参照安定性（変化時のみ新参照）に依存している点を一行補足しておくと実装者が安心できる。スコープ増なし。

- **[S-002]** ステップ2(b) の手動保存 clear は `onSubmit` の `mode === "edit"`（実コードでは `else` = `props.mode !== "new"`）分岐の `saveNote` 成功**後**に置くが、実コードでは直後に `await router.navigate(...)`（L330）が続く。`clearNoteUnsaved` は best-effort 同期で例外を呑む純関数なので navigate を阻害しないが、「`await saveNote` の直後・`router.navigate` の前」という配置（plan の明記どおり）を厳守すること。navigate 後に置くと遷移で実行機会を失う可能性がある。計画は既に正しい位置を指定済みなので確認のみ。スコープ増なし。

#### 良い点

- ADR-002 が round-1 で発見された2つの欠陥（手動保存の clear 取りこぼし・初回マウント誤 clear）を独立した設計判断として切り出し、reducer の実挙動（`autosaveSuccess` だけが dirty を空にする / `autosaveDiscarded` は dirty 保持）を根拠に「エッジ追跡 + 明示 clear」という最小で正確な2系統に落とし込んでいる。実コードの reducer 全ケースを精査した上での結論で、論証に飛躍が無い。
- 「`dirtyKeys` の立ち下がりエッジが起きるのは autosaveSuccess のときだけ」「手動保存は dirty を残す」という非自明な不変条件を ADR が明示しており、将来 reducer に dirty を空にする別アクションが追加されたときに本フラグ同期を見直すべき箇所が ADR から辿れる。保守性が高い。
- `unsavedFlag.ts` を `note/` 直下に置く配置根拠が「2ドメイン横断 / editor 内部への依存回避 / `displayPreference` は home 専用で性質が異なる」と明文化され、`displayPreference.ts` の JSDoc（home-route 専用・再利用時に配置見直し）とも整合。依存方向（publication が editor 内部を import しない）を崩さない正しい判断。
- AC-3 が「保存済み（autosave 完了 / 手動保存）で警告が出ない」という過剰検知抑制を外形（AutosaveIndicator 表示・detail での警告有無）で検証する形になっており、内部状態に依存しないテスト可能な受け入れ基準になっている。
- リスク欄が「autosaveError 残留＝実際に未保存だから正しい」「clear 前タブ落ちは sessionStorage で次セッション解消・安全側」「別タブ非共有は主ユースケース外」と、過剰検知/見逃しの方向性を一貫して安全側（未保存を見逃さない）に整理している。`sessionStorage` 媒体選択（揮発性・別タブ/翌日誤検知回避）の根拠も ADR-001 で明文化。
- DTO/usecase/domain/adapter に一切触らず presentation 層のクライアント境界に閉じる方針が CLAUDE.md（ポートの内側は決定的・I/O フリー、検証は境界2点）と完全整合。新規 Context Provider もライブラリ追加も無く、既存 `displayPreference` の SSR-safe ラッパ構造をそのまま踏襲。

---

### 総評

round-1 の全指摘（要修正2 / 改善3）が実コードに接地した形で解消・反映されている。新設 ADR-002 は `editorState.ts` の reducer 挙動（`autosaveSuccess` のみ dirty クリア・手動保存/autosaveDiscarded は dirty 保持）と `NoteEditor.tsx` の保存パス（onSubmit `saveNote` 成功 → navigate、dispatch 無し）の双方と矛盾せず、立ち上がり/立ち下がりエッジ追跡 + 手動保存明示 clear の2系統は実装可能。配置・媒体選択・レイヤー方針はいずれもプロジェクトのアーキテクチャ規約と整合し、構造的なリスクは検出されなかった。改善提案2点はいずれも実装ブレ防止のための補足レベルで、スコープを増やさない。

問題点: 0 / 改善提案: 2
