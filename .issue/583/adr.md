# ADR — Issue #583: P14 公開設定の「未保存の変更があります」警告（dirty 伝搬方式）

## ADR-001: dirty 伝搬は「案1（共有 store）の sessionStorage 実装」を採用し、案2（DTO 近似比較）は採らない

### Status
Proposed

### Context

未保存警告（モック `P14-publish-settings.html:963-973` の `.safety-check` warning alert）を出すには、エディタの dirty 状態を公開設定モーダル `PublishSettings` まで運ぶ必要がある。Issue は2案を提示している:

- **案1: ページ横断の dirty 状態伝搬（Context / 共有 store）**
- **案2: `publishedAt` vs `note.updatedAt` の DTO 近似比較**

実コードでルーティング構造とデータ構造を確認した。

#### ルーティング構造（案1 の「Context」が成立するかの分岐点）

edit と detail は **完全に独立した別ルート**である:

- `app/routes/_app/notes/$noteId/edit.tsx` — `renderNoteEditor` server fn が `NoteEditor` を RSC レンダリングするページ。
- `app/routes/_app/notes/$noteId/index.tsx` — `renderNoteDetail` server fn が `NoteDetail` を RSC レンダリングする別ページ。`NoteDetail` 配下の `NoteActions`（`app/components/note/detail/NoteActions.tsx`）が `PublishSettings` を描画する。

両者は別 loader・別 RSC ツリーで、`NoteActions` の編集導線も `<Link to="/notes/$noteId/edit">`（フルページ遷移）。エディタの dirty 状態（`editorState.ts` の `dirtyKeys`、`NoteEditor` ローカルの `useReducer`）は **detail へ遷移した時点で React ツリーごと破棄される**。したがって React Context / 同一ツリー内 store では原理的に橋渡しできない。「綺麗な案1（Context）」はこのルーティング構造では不可能。

#### 案2 が不成立である理由（誤検知ではなく、そもそも無意味）

`publishedAt` と `note.updatedAt` は **別の事象を計測する別クロック**であり、比較しても dirty を表さない:

- `note.updatedAt`（`app/core/application/dto/note.ts:34`）はタイトル・本文・FrontMatter・タグ・ディレクトリの **あらゆる編集保存で進む**。
- `publishedAt`（`app/core/domain/publication/entity.ts:70-79`）は **public/unlisted への遷移のたびに `now` で再スタンプ**され、private では常に `null`（不変条件 L25）。「最後に保存した本文版」とは無関係。

帰結として案2 は構造的に破綻している:
- private ノート（`publishedAt === null`）では比較対象がそもそも無い。
- 公開後に一切編集していなくても、`publishedAt`（公開時刻）より `updatedAt`（最後の編集=公開前）が古い/新しいは公開操作との前後関係で決まり、未保存編集の有無とは無相関。常時警告 or 常時非表示のどちらかに張り付き、意味のある dirty 判定にならない。

よって案2 は「中規模だが誤検知リスク」どころか **要件を満たせない**。却下する。

### Decision

**案1 を「ルート跨ぎでも生き残る軽量な共有 store」として実装する。** 具体的には `sessionStorage` にノート単位の dirty フラグを置き、エディタが書き、`PublishSettings` が読む。

- 既存に同型の前例がある: `app/components/note/list/displayPreference.ts`（Issue #650 ADR-001）が「usecase に到達しない純クライアント表示状態」を SSR-safe な `localStorage` ラッパで永続化している。dirty も同じく純クライアント UI 状態で、ドメイン/usecase/DTO に出す概念ではない。本件はこのパターンの素直な踏襲。
- ストレージは `sessionStorage` を選ぶ（`localStorage` ではない）。未保存警告は「このタブ・このセッション中に編集したがまだ保存していない」という揮発的な事実であり、タブを閉じれば消えてよい。`localStorage` だとデバイス越し・タブ越しに残留し、別タブ・翌日の閲覧で誤って警告が出る。`displayPreference` が `localStorage` なのは「デバイスの恒久的な好み」だからで、性質が異なる。
- キーはノート単位（`hollow3:note:<noteId>:dirty`）。複数ノートを並行編集しても混線しない。
- 書き込みタイミング: `NoteEditor` 側で「dirty が立った瞬間にフラグを set」「autosave 成功（`dirtyKeys` が空に戻る）でフラグを clear」。両者は `editorState` の `dirtyKeys` を唯一の真実として同期する。
- 読み取りタイミング: `PublishSettings` がモーダル open 時にフラグを読み、true なら warning alert を描画。

これは Issue の言う案1（共有 store）に分類されるが、Context ではなく `sessionStorage` を媒体に選ぶことで別ルート間の橋渡しを成立させた点が肝。

### Consequences

- 良い点:
  - 別ルート間でも dirty が確実に伝わる（Context 不可能、案2 不成立の制約下で唯一機能する選択）。
  - dirty を `sessionStorage` という純クライアント境界に閉じ込めるため、**ドメイン/usecase/アダプター/DTO への影響ゼロ**。レイヤーの内側を一切汚さない。
  - 既存 `displayPreference` の SSR-safe ラッパ構造をそのまま踏襲でき、設計の一貫性が保てる。新規ライブラリ・新規 Context Provider 不要。
- トレードオフ:
  - フラグの真実性は「エディタが書いた最後の値」に依存する。autosave がフラグ clear 前にタブが落ちると true が残るが、`sessionStorage` なので次セッションでは消える。過剰検知方向（保存済みでも警告が残りうる）であり、未保存を見逃す方向ではないので安全側。
  - 別タブで同一ノートをエディタ/detail で同時に開くと `sessionStorage` はタブ間で共有されないため、エディタを別タブで開いた dirty は detail タブに伝わらない。ただしこれは「同一セッション・同一タブの編集フロー」という主ユースケースの外であり、要件（編集 → 公開設定を開く一連の操作）はカバーされる。`localStorage` + `storage` イベントで全タブ同期する案もあるが、誤検知（別ノート・別デバイス残留）のデメリットが上回るため採らない。

### 補足: warning UI 自体は既存プリミティブで完結

警告ボックスは `app/components/common/styles.ts` の `ALERT` + `ALERT_WARNING` + `ALERT_ICON` + `ALERT_CONTENT` + `ALERT_TITLE` + `ALERT_BODY` と `lucide-react` の `AlertTriangle` で組む（`app/components/ingestion/UploadForm.tsx:112-138` に実 JSX 前例）。モックの `role="status"` も踏襲する。新規スタイル・新規 CSS は不要。

---

## ADR-002: dirty フラグの set/clear トリガーは「dirty の立ち上がり/立ち下がりエッジ」と「手動保存の明示 clear」の2系統で駆動する

### Status
Proposed

### Context

ADR-001 は「`NoteEditor` が `dirtyKeys` を唯一の真実として `sessionStorage` のノート単位フラグに同期する」とだけ述べていた。round-1 レビューで実コードを精査した結果、素朴な「`dirtyKeys.size > 0` なら set / `=== 0` なら clear」の `useEffect([dirtyKeys])` ミラーには2つの欠陥が判明した。

1. **clear 契機が autosave に閉じている（coverage P-001 / arch-risk S-003 関連）**
   `dirtyKeys` を `EMPTY_DIRTY` にリセットする reducer アクションは **`autosaveSuccess` ただ1つ**（`editorState.ts:497-503`）。保存ボタン経由の手動フル保存は `NoteEditor.tsx:319` で `saveNote` server fn を呼び、成功すると `:330` で detail へ navigate するだけで、**`dirtyKeys` をリセットする dispatch を一切行わない**。したがって「編集 → 保存ボタン → 即 detail → 公開設定を開く」という最も自然な保存フローでは、遷移直前まで `dirtyKeys` が非空のまま残り、`sessionStorage` には `dirty=true` が書かれたまま detail に着く。素朴なミラーでは「正しく保存したのに『未保存の変更があります』が出る」誤検知が主ユースケースで恒常的に起きる。

2. **初回マウントで clear が誤発火する（arch-risk P-001）**
   `createInitialEditorState` は `dirtyKeys: EMPTY_DIRTY` で初期化する（`editorState.ts:219`）。`useEffect([dirtyKeys])` は初回マウントでも必ず1回発火するため、「未編集でエディタを開いただけ」「`detail → edit →（無編集で）detail` の往復」でも `0 → 0` のまま clear が走り、同一タブ・同一セッション内で過去に立てた他経路のフラグを巻き込んで消す。`sessionStorage` は同一タブのルート遷移をまたいで生きるので、これは実害になりうる。

### Decision

フラグ駆動を **「`dirtyKeys` のエッジ追跡」+「手動保存成功時の明示 clear」** の2系統で実装する。

- **エッジ追跡（set/clear の自動同期）**: `useRef` で前回 `dirtyKeys.size` を保持し、`useEffect([dirtyKeys])` 内で遷移を判定する。
  - 前回 `=== 0` かつ今回 `> 0`（**立ち上がりエッジ**）→ `markNoteUnsaved(noteId)`。
  - 前回 `> 0` かつ今回 `=== 0`（**立ち下がりエッジ** = autosave 成功で空に戻った瞬間）→ `clearNoteUnsaved(noteId)`。
  - `0 → 0`（初期 EMPTY のまま=未編集オープン）と `>0 → >0`（編集継続）では **何もしない**。これにより初回マウントの誤 clear が消え、未編集オープンが既存フラグを巻き込まない。
- **手動保存の明示 clear**: `NoteEditor.onSubmit` の `mode === "edit"` 成功分岐（`saveNote` 成功直後、`router.navigate` の前）で `clearNoteUnsaved(props.noteId)` を直接呼ぶ。手動保存は `dirtyKeys` を空にしない（reducer に該当アクションが無い）ため、エッジ追跡だけでは clear されない。保存=サーバ確定の事実をフラグに反映する唯一確実な経路として、ここで明示的に降ろす。`onSubmit` の成功分岐は usecase を経ない純クライアント後処理（`setCreatingDirectory` 等）を既に含む箇所なので、ここに storage clear を足すのは設計上自然。
- **noteId ガード**: いずれの呼び出しも、正規化済み `noteId`（`const noteId = props.mode === "edit" ? props.noteId : null;`、`NoteEditor.tsx:106`）が `null` のときは no-op。`mode === "new"` は判別ユニオン上 `noteId` プロパティ自体を持たず、正規化で `null` になる（`useAutosave` も `noteId === null` で全 no-op、`useAutosave.ts:140`）。ガード条件は `if (noteId === null) return;` に統一する。

### Consequences

- 良い点:
  - autosave 成功（立ち下がりエッジ）と手動保存（明示 clear）の双方でフラグが確実に降り、主ユースケースの誤検知が解消する。
  - 初回マウント・未編集オープン・無編集往復で既存フラグを誤消去しない。set/clear が「実際に編集した／実際に保存した」契機にのみ反応する。
- トレードオフ:
  - `autosaveError` で保存に失敗したまま放置されたケースは `dirtyKeys` が非空のまま＝フラグ true のまま残る。これは「**実際に未保存**だから true で正しい」挙動であり、過剰検知ではない（arch-risk S-003）。
  - エッジ追跡のため `useRef`（前回 size）を1つ持つが、`stateRef` 同様の commit-phase ミラーで `NoteEditor` には既に同種の前例がある。

---
