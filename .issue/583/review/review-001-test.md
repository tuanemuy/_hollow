# レビュー review-001 — 視点: Test（Issue #583 / PR #730）

対象差分: `gh pr diff 730`
対象テストファイル:
- `app/components/note/__tests__/unsavedFlag.test.ts`
- `app/components/note/__tests__/unsavedFlag.ssr.test.ts`
- `app/components/note/editor/__tests__/noteEditorUnsavedFlag.test.tsx`
- `app/components/publication/PublishSettings/__tests__/PublishSettings.test.tsx`（追記分）

実行確認: 上記4ファイルを `pnpm vitest run` で実行 → **20 passed / 4 files**。

---

## Test

### Blockers

なし。

plan「テスト方針」の主要ケースは概ね実装されており、偽陽性につながる致命的なザル assertion は見当たらない。受け入れ基準 AC-2/AC-3/AC-4/AC-5/AC-6 を裏付けるテストが、新規テスト（flag sync 層）＋既存 `editorState.test.ts`（dirty 信号源の reducer 層）の組み合わせで成立している。

### Warnings

- **[W-001]** autosave 成功の立ち下がりエッジ（`>0 → 0` → `clearNoteUnsaved`）が NoteEditor レベルで未検証。
  - 場所: `app/components/note/editor/__tests__/noteEditorUnsavedFlag.test.tsx`（全体）。対応する実装は `NoteEditor.tsx:172`（`else if (prev > 0 && curr === 0) clearNoteUnsaved(noteId);`）。
  - 理由: plan のテスト方針は「autosave 成功で `>0 → 0`（立ち下がり）→ `clearNoteUnsaved` 呼出」を明示ケースとして挙げているが、本テストが刺激しているエッジは (a) 立ち上がり `0→>0`（"sets the flag on the first edit"）、(b) 手動保存の明示 clear、(c) 初回マウント `0→0`、(d) `mode="new"` の4つで、**立ち下がりエッジ（autosaveSuccess による `dirtyKeys` 空化 → flag clear）の経路を直接通っていない**。`editorState.test.ts:376` は「`autosaveSuccess` が `dirtyKeys` を空にする」という reducer 事実を担保するが、それが `prevDirtySizeRef` のエッジ判定を経て `clearNoteUnsaved` を呼ぶ配線（line 172 の `else if` 分岐）までは結ぶ test が無い。line 172 が誤って `clearNoteUnsaved` を呼ばない／条件を取り違えても、現行テストは緑のまま通る（偽陰性リスク）。
  - 提案: `noteEditorUnsavedFlag.test.tsx` に1ケース追加する。`useAutosave` のデバウンス flush を待つか、`saveNoteDraftFn`（autosave 経路）を resolve させて `autosaveSuccess` 相当を発火させ、`KEY` が `"1"` → `null` に落ちることを assert する。デバウンス制御が難しければ `vi.useFakeTimers` でタイマを進める。これで line 172 の分岐が実際に踏まれることを保証できる。

- **[W-002]** 手動保存 clear テストが「明示 clear」と「立ち下がりエッジ」を区別できていない（経路の弁別が弱い）。
  - 場所: `noteEditorUnsavedFlag.test.tsx:185-201`（"explicitly clears the flag on manual save success"）。
  - 理由: このケースは「タイプで `1` → 保存ボタン → `null`」を確認するが、`saveNoteMock` は `dirtyKeys` をリセットしない（reducer に該当アクション無し）ため、`null` に至る唯一の経路が `NoteEditor.tsx:352` の明示 `clearNoteUnsaved` であるという**実装事実に暗黙依存**している。テストコメントの ADR-002 記述は正しいが、もし将来 reducer 側に「保存で dirty を空にする」アクションが追加されると、このテストは「明示 clear が消えても」立ち下がりエッジ経由で緑のまま通り、回帰を検知できなくなる。現状の実装では正しく PASS するため Blocker ではない。
  - 提案（任意）: `saveNoteMock` 解決後に `state.dirtyKeys` が非空のまま（=明示 clear だけが flag を落とした）であることを間接確認できると理想だが、これは内部状態への踏み込みになるため過剰。現行で許容可。コメントに「`saveNote` は dirtyKeys を残すので flag=null は明示 clear 由来」という前提を一行残す程度で十分（既にコメントで近い記述あり）。

### Notes

- **[N-001]** `unsavedFlag.test.ts` のカバレッジは plan のテスト方針を完全充足。mark→read=true / clear→read=false / 未設定→false / `"0"`等の非`"1"`値→false / getItem throw→false / setItem・removeItem throw を呑む / ノート単位キー分離（cross-note bleed なし）をすべて網羅。`hollow3:note:note-1:dirty` の literal key を直接 assert（L29）しており、キー生成のズレも検知できる。SSR 版（`@vitest-environment node`）も `window` 無し→read=false / mark・clear は no-op を確認しており、plan の「window 無し→false」を別環境で正しく分離している。良い設計。

- **[N-002]** `PublishSettings.test.tsx` の既存テストへの副作用は適切に処理されている。`beforeEach` の `window.sessionStorage.clear()` 追加（L93）は #477・N-005 の既存ケースに影響なし（それらは sessionStorage 非依存）。`role="status"` の first-match 衝突は、新規ヘルパ `unsavedWarning()`（L351-355）が「全 `[role="status"]` を走査し本文に『未保存の変更があります』を含むものだけを拾う」find ベースで、copy-status span（空文字 or 「コピーしました」）と確実に弁別できる。逆に N-005 の `copyStatus()`（L241-247、`querySelector` の first-match）は sessionStorage クリーンアップにより未保存警告 `role="status"` が描画されない前提で動くため、`beforeEach` clear と整合。テスト独立性は保たれている。

- **[N-003]** `searchInternalLinkTargetsFn` のモック追加（`noteEditorUnsavedFlag.test.tsx:45,60,75`）は妥当。`actions.ts:394` に実在する export で、`NoteEditor` がマウント時に参照する server fn を網羅的にスタブしないと `useServerFnRouter` のルーティングで未登録エラーになるため、追加は必要。`mockResolvedValue([])` で内部リンク候補空を返すのも副作用なく適切。

- **[N-004]** `PublishSettings` の「次 open で再読込」テスト（L412-441）は、close（flag reset）→ shut 中に storage set → re-open で warning 出現、という close-reset effect（`index.tsx:153-166`）の `open` 立ち上がり read を正しく刺激している。`hasUnsaved` を `useState` 初期値で読まず effect 経由にした実装意図（SSR で `window` 未定義）と合致した検証。`does not key off another note's flag`（L395-410）でキー分離も消費側で再確認しており、`unsavedFlag.test.ts` の単体分離テストと二重で守られている。

- **[N-005]** plan テスト方針の「フラグ true で警告描画・false で非描画・close→再 open で再読込」は AC-4/AC-5 とともに充足。警告本文の verbatim 一致（「公開には最後に保存した版が使われます」L374-376）も assert しており、モック文言からのズレを検知できる。`role="status"` の存在（AC-6）も `unsavedWarning()` の走査対象セレクタで担保。

- **[N-006]** タグ AC-2（draft のみ非 dirty / 確定で dirty）は新規テストではなく既存 `editorState.test.ts`（`setTagDraft` →非 dirty L360-366、`addTag` →dirty L319-352）でカバーされている。dirty 信号源は reducer 層、flag 同期は NoteEditor 層、という責務分割は妥当で、PR が新規にタグ起点の flag テストを書いていないのは設計上の冗長回避として許容できる。ただし「タグ確定 → flag set」のエンドツーエンドは W-001 と同様に NoteEditor レベルでは未検証（title 編集での rising edge で代表させている）。タグ固有経路の回帰検知が欲しければ補ってもよいが必須ではない。
