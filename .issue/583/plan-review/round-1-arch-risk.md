# Round 1 レビュー — アーキテクチャ整合性・実現可能性・リスク（Issue #583）

レビュー対象: `.issue/583/plan.md` / `.issue/583/adr.md`
視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク

実コードで確認済みの事実:
- edit / detail は別ルート・別 RSC ツリー（`routes/_app/notes/$noteId/edit.tsx` の `renderNoteEditor` server fn、detail 側 `NoteActions`）。Context 橋渡し不可は事実。
- `editorState.ts` の `dirtyKeys` は編集 setter で積まれ `autosaveSuccess` で `EMPTY_DIRTY` にリセット（L497-503）。「dirty の唯一の真実」は正しい。
- `displayPreference.ts` は SSR ガード + try/catch の純関数群（前例として妥当、テストも `displayPreference.test.ts` / `displayPreference.ssr.test.ts` で前例あり）。
- `publishedAt` は public 遷移のたびに `now` で再スタンプ・private で null（`publication/entity.ts:62-86`、不変条件 L25/50-60）。案2 不成立の ADR 主張は実コードと一致。
- モック `P14:962-975` は URL preview → safety-check（`role="status"`、title「未保存の変更があります」、body「公開には最後に保存した版が使われます。…」）→ apply ボタンの順。plan のテキスト・位置・role は verbatim 一致。
- `UploadForm.tsx` に `ALERT_WARNING` + `AlertTriangle` の実 JSX 前例あり。

---

#### 問題点（要修正）

- **[P-001]** ステップ2 の「`dirtyKeys.size === 0` なら `clearNoteUnsaved`」を `useEffect` 同期にすると、**エディタ初回マウント時に必ず clear が走り、別タブ/別経路で立っていたフラグを誤って消す**おそれがある。
  - 理由: `createInitialEditorState` は `dirtyKeys: EMPTY_DIRTY` で初期化される（`editorState.ts:219`）。`useEffect([dirtyKeys])` は初回マウントでも必ず1回発火するため、編集前のエディタを開いただけで `clearNoteUnsaved(noteId)` が走る。通常フローでは「編集していないのだから clear で正しい」が、`sessionStorage` は同一タブ内のすべてのルート遷移をまたいで生きるので、`detail → edit → (未編集で) detail` のような往復や、エディタを開いて何もせず戻る操作で、過去セッションで残っていた dirty フラグが消える。plan の AC-3（autosave 成功で clear）の意図は「保存したら消す」であって「エディタを開いただけで消す」ではない。供給側の責務が「dirty を立てる/降ろす」両方になっていて、降ろす条件が広すぎる。
  - 提案: clear のトリガーを「`autosaveSuccess` が起きた（= dirty が非空から空に落ちた）」に限定する。具体的には `useEffect` 内で「前回 size > 0 かつ今回 size === 0」のエッジ（`useRef` で前回値を保持）でのみ `clearNoteUnsaved` を呼ぶ。マウント直後の `0 → 0`（初期 EMPTY のまま）では何もしない。これにより「保存で消える」「編集で立つ」のみが storage を動かし、未編集オープンが既存フラグを巻き込まない。plan はこの「立ち下がりエッジ限定」を明示すべき。

- **[P-002]** ステップ2 の `mode === "new"` ガードは「edit ルートでのみ書き込む」と書いているが、**`NoteEditor` の props は判別ユニオンで、`mode === "new"` のとき `noteId` プロパティ自体が型に存在しない**。plan の文面（「noteId が未確定/仮の場合」）は実型と食い違う。
  - 理由: `NoteEditorProps` は `{ mode: "new" } | { mode: "edit"; noteId: string; ... }`（`NoteEditor.tsx:78-90`）。`new` では `noteId` は undefined ではなく「型に無い」。実コードでは `const noteId = props.mode === "edit" ? props.noteId : null;`（L106）で `string | null` に正規化済み。「仮の noteId が入る」前提の記述は誤りで、実際は `noteId === null` になる。
  - 提案: plan の「mode === "new"（noteId が未確定/仮の場合）」の表現を「`new` では正規化後の `noteId` が `null`」に直し、ガードは `if (noteId === null) return;`（= `props.mode === "edit"` と同値）に統一する。`useAutosave` も同じく `noteId === null` で全 no-op にしている（`useAutosave.ts:140`）ので、それに揃えるのが整合的。`markNoteUnsaved`/`clearNoteUnsaved` を呼ぶ前に `noteId === null` を弾けば storage キーが無意味になる懸念は型レベルで消える。

#### 改善提案（検討推奨）

- **[S-001]** ステップ3 の「close 時に `hasUnsaved` を false に戻す」を既存 close-reset effect（`PublishSettings/index.tsx:142-149`）に相乗りさせる設計は妥当だが、**read のタイミングは「open 監視 effect」ではなく `open` が false→true に変わった瞬間に限定**すべき。
  - 理由: 既存 effect は `[open, data.visibility]` 依存で、`data.visibility` が変わるたびにも再実行される（`routerInvalidate` 後の loader 再評価で起こりうる）。その effect は冒頭 `if (open) return;` で「閉じているときだけ reset」する構造なので、ここに open 時 read を足すなら「`if (!open) { reset...; return; }` の else 側で read」する形になる。ただし `data.visibility` 変化での再 read は無害（同じフラグを読み直すだけ）なので大きな問題ではない。plan は「open 監視 effect に相乗り」とだけ書いているが、`if (open) return;` の早期 return をどう書き換えるか（open 側分岐を新設するのか別 effect にするのか）まで具体化しておくと実装ブレが減る。`useState` 初期値で読むのは SSR で `window` 未定義のため不可（モーダルはクライアントだが Dialog 自体はマウント済み）なので effect 経由は正しい選択。

- **[S-002]** `unsavedFlag.ts` の置き場所が `app/components/note/editor/` 配下になっているが、**書き込みは editor、読み取りは `publication/PublishSettings`** と2ドメインから参照される。
  - 理由: `displayPreference.ts` は home-route 専用だったので `note/list/` に置く判断に JSDoc で言及がある（「Revisit location when reused」）。本件は最初から2ドメイン横断なので、editor 配下に置くと publication 側から editor 内部実装を import する向きの依存が生まれる。致命的ではないが、`app/components/note/` 直下や共有寄りの場所（あるいは note と publication の共通の親）に置くほうが「dirty フラグは特定コンポーネントの内部ではなくノート単位の横断状態」という意味論に合う。plan は editor 配下を前提にしているので、配置の根拠を一言添えるか、共有寄りに置くか再検討するとよい。スコープは増えない。

- **[S-003]** リスク節の「autosave clear 前にタブが落ちると true が残る」は `sessionStorage` で次セッション解消、という整理で妥当。加えて **autosave が `autosaveError` で失敗したまま放置されたケース**も「dirty が残る = フラグ true のまま」で、これは「実際に未保存」なので正しい挙動。plan のリスク整理に「失敗時もフラグが残るのは正しい（実際に未保存だから）」を一文足すと、レビュー時の「過剰検知では?」という誤読を防げる。スコープ追加なし。

#### 良い点

- ADR の案2 却下根拠が実コード（`publishedAt` の public 再スタンプ・private null 不変条件、`updatedAt` は全編集で進む）と精密に一致しており、「誤検知リスク」ではなく「構造的に dirty を表せない=要件を満たせない」と一段踏み込んで結論づけているのは正確かつ説得力がある。Issue 本文の「中規模だが近似」という楽観評価を実コードで覆した点は質が高い。
- dirty を「純クライアント UI 状態」と位置づけ、ドメイン/usecase/DTO/アダプターに一切手を入れない方針は CLAUDE.md（ポートの内側は決定的・I/O フリー、検証は境界2点）と完全に整合。`displayPreference` という既存の同型前例に乗せる判断もアーキテクチャの一貫性を保つ正しい選択。
- `localStorage` ではなく `sessionStorage` を選ぶ理由（揮発性=タブ閉じで消える、別タブ・翌日の誤検知回避、`displayPreference` の「デバイス恒久設定」との性質差）が明文化されており、媒体選択のトレードオフが適切に言語化されている。
- 実装ステップが「共有ヘルパ → 供給側(editor) → 消費側(modal) → 表示」の順で並んでおり、内側レイヤー変更が無い本件に対して依存方向（参照される側を先に作る）として正しい。
- 警告 UI を新規スタイルなしで既存 `ALERT_WARNING` + `AlertTriangle` プリミティブで組む方針、モック文言の verbatim 転記、`role="status"` の踏襲は、モック（`P14:962-975`）と既存前例（`UploadForm`）の両方と一致。スタイル規約（utility-first、新規 CSS 不可）にも沿う。
- スコープ（含まれないもの: ナビゲーションガード新設・案2 DTO 比較・複数タブ同期）を明示し、Issue の範囲を超えた理想形追求を避けている。SSR ガード + try/catch で storage 無効環境に degrade する方針も堅牢。
- テスト方針が既存テスト構造（`displayPreference.test.ts` / `.ssr.test.ts`、`PublishSettings.test.tsx`、editor 系）に倣っており、実在の前例に接地している。

---

### 総評

アーキテクチャ整合性・媒体選択・案2 却下根拠はいずれも実コードに精密に接地しており、レイヤーの内側を汚さない方針も正しい。**FE 状態伝搬の設計の核心（sessionStorage 媒体・displayPreference 同型・SSR ガード・案2 不成立）に構造的な誤りは無い。** 要修正は実装詳細レベルの2点に限られる:
- P-001: clear トリガーを「dirty 立ち下がりエッジ」に限定しないと、未編集オープンで既存フラグを誤消去しうる。
- P-002: `mode === "new"` 時の noteId の扱いが実型（判別ユニオン、正規化で `null`）と食い違う記述。`noteId === null` ガードに統一。

問題点: 2 / 改善提案: 3
