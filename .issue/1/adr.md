# ADR — Issue #1: [spec-sync] frontend P10/P11/P12 乖離解消

## ADR-001: 公開状態フィルタ / 内部リンク参照フィルタはスコープ外

### Status
Superseded by Issue #8 (filter 経路は完全解消、`.issue/8/adr.md` ADR-010 参照)

### Context
spec/pages/index.md P10 では「フィルタバー（タグ / 期間 / 公開状態 / 内部リンク参照）」が要求されている。しかし:
- `NoteOwnerListOpts`（`listNotesByOwner` 引数）には `visibility` も `referencingNoteId` も無い
- `NoteListItemDTO.visibility` は現状 `listNotesByOwner.ts` 内で `'private'` 固定で返している（PublicationState aggregate と join していない）
- 純フロントで全件取得して post-filter するのは大量データ時に破綻

### Decision
本 PR では公開状態フィルタと内部リンク参照フィルタの UI を出さない。Phase 4 で別 Issue を起票し、`NoteOwnerListOpts` への `visibility` / `referencingNoteId` 追加 + projection で実 visibility を join するバックエンド変更とセットで対応する。

### Consequences
- 良い点: 不正確な UI を提供するリスクを回避。バックエンド変更を伴う変更を別 PR に分離できる
- トレードオフ: spec 100% カバレッジは達成しない。spec 側に「現状未対応、別 Issue で追跡」を注記する

---

## ADR-002: 本格 WYSIWYG は新規ライブラリ導入せず別 Issue へ。HTML モード + サニタイズプレビューで代替

### Status
Superseded by Issue #9 (TipTap を採用し WYSIWYG タブを enabled 化、`.issue/9/adr.md` ADR-001 参照)

### Context
spec/pages/index.md P12 は「WYSIWYG モード / HTML モード切替」を要求。検討した実装案:
- 案A: TipTap / Lexical / ProseMirror 等の本格 WYSIWYG ライブラリ導入
  - 課題: Cloudflare Workers のバンドルサイズに直撃、React 19 RSC との互換性検証コスト、既存 `HtmlSanitizer` との保存パイプライン整合コスト、PR 規模が桁違いに膨らむ
- 案B: `contenteditable` + `document.execCommand` の自前簡易 WYSIWYG
  - 課題: `execCommand` は非標準でブラウザ実装差が大きく不安定、保存形式が暗黙的になり予期しない HTML 生成リスク
- 案C: HTML モードのまま据え置き + サニタイズプレビュー併設
  - spec の「サニタイズプレビュー」要件は満たせる

### Decision
案C を採用。WYSIWYG タブは UI 上に disabled 状態で表示し、tooltip で「将来実装」を明示する（将来枠の確保）。本格 WYSIWYG は Phase 4 で別 Issue を起票。

### Consequences
- 良い点: 新規依存ゼロ、Workers バンドルサイズ無影響、保存パイプラインが既存サニタイザに完全依存で予測可能
- トレードオフ: spec の「WYSIWYG モード」が disabled 表示にとどまる。UX 上「WYSIWYG が将来追加される」ことが明示される必要がある（コメント + tooltip で対応）

---

## ADR-003: FrontMatter 編集は「既知キー構造 UI + 生 JSON モード」。YAML パーサ追加は別 Issue

### Status
Accepted

### Context
spec P12 は「FrontMatter 既知キー構造編集 / 生 YAML 編集モード切替 / schema 検証」を要求。`yaml` / `js-yaml` パッケージ追加は依存最小化原則と Workers バンドルサイズ観点で避けたい。`FrontMatter.create` のドメイン VO は既に object を受け取る前提なので、クライアント側パース結果さえ object であれば良い。

### Decision
- 既知キー（`title`, `date`, `tags`, `description`, `slug`）の構造編集 UI を提供
- 「生編集」モードは YAML ではなく **JSON テキスト**として実装（クライアント `JSON.parse` のみ）
- UI 文言は「生編集（JSON）」とし、将来 YAML 対応は Phase 4 で別 Issue 起票

### Consequences
- 良い点: 新規依存ゼロ、object 入出力で型整合性が高い、JSON エラーはインライン表示しやすい
- トレードオフ: 既存ノートで YAML 形式の FrontMatter を扱うユーザー体験が不完全になる可能性。バックエンドは FrontMatter を object として保存しているため、表示上の問題は無いが、編集時に「YAML で書きたい」要望が出る可能性

---

## ADR-004: URL 駆動状態（validateSearch）を採用、クライアント state を最小化

### Status
Accepted

### Context
P10 のフィルタ・表示形式・ビュー選択・キーワード検索は「ブックマーク可能」「リロードで復元可能」「サイドバーからリンクで遷移可能」「保存ビューから復元可能」であることが望ましい。

### Decision
ルート `/` に `validateSearch: zodValidator(noteListSearchSchema)` を追加し、`display`/`tagNames`/`from`/`to`/`directoryId`/`q`/`viewId`/`page`/`limit` を URL に乗せる。クライアント `useState` は選択集合（複数選択 ID）など URL に乗せられない一時状態に限定する。

### Consequences
- 良い点: ブックマーク・リロード・戻る進む・ビュー復元が自然に動く。テスト時に search を組み立てて検証可能。Sidebar とフィルタ連動が宣言的 Link で実現
- トレードオフ: URL が長くなりがち（タグ多選時）。タグは名前ベース（短く読みやすい）+ サーバ側で `listTags` から ID 解決でケア

---

## ADR-005: pure / side-effect の境界を明確化、reducer は pure 関数として export

### Status
Accepted

### Context
React Testing Library 未導入のため、UI コンポーネント単体のテスト基盤が無い。一方、選択 reducer・エディタ状態機械・HTML 挿入・URL ↔ ViewQuery 変換は本質的に純粋関数。

### Decision
- ディレクトリを `list/` / `detail/` / `editor/` に再編
- 表示専用 pure component（`ListView`/`TileView`/`CalendarView`/`NoteMetaPanel`/`FrontMatterPanel`/`AutosaveIndicator`/`EditLockBanner`/`EditorModeSwitch`/`DisplayModeSwitch`/`FilterBar`）は副作用ゼロ・props のみ
- side-effect 持ち island（`*Toolbar`/`*ActionBar`/`*Actions`/`*Uploader`/`NoteEditor` 親/`*Dialog`）は server-fn 呼び出しの薄いシェル
- 状態管理ロジック（reducer / `groupNotesByDay` / `searchToViewQuery` / `insertMediaIntoHtml`）は React 非依存の pure 関数として `listSelectors.ts` / `editorState.ts` / `mediaInsert.ts` に切り出し vitest 対象に

### Consequences
- 良い点: 既存テスト基盤（vitest）だけで網羅テストが書ける。pure 関数の入力 × 出力で完全検証可能
- トレードオフ: ディレクトリ移動で破壊的変更が大きい（既存 import 元の更新が必要）

---

## ADR-006: 編集ロックはベストエフォート、リアルタイム衝突通知は別 Issue

### Status
Accepted

### Context
spec P12 は「編集ロック / 衝突警告（同時編集）」を要求。`acquireEditLock` / `extendEditLock` / `releaseEditLock` usecase は存在するが、SSE / WebSocket / poll などリアルタイム通知インフラは未整備。

### Decision
- マウント時に `acquireEditLockFn` を呼び、失敗（他者保持中）時は `EditLockBanner` で警告表示（編集は許可、`saveNote` の `requireLock: false` 維持）
- `setInterval(extendEditLockFn, EDIT_LOCK_RENEW_INTERVAL_MS)` で延長
- unmount / blur 時 `releaseEditLockFn`、タブクローズは TTL に任せる
- リアルタイム衝突通知は Phase 4 で別 Issue 起票

### Consequences
- 良い点: spec の「警告」要件を最小実装で満たす。インフラ追加を伴う変更を別 PR に分離
- トレードオフ: 他者編集中の警告は「ページ開いた時点での状態」のみで、編集中の衝突検知はできない（OCC version 衝突時に保存失敗で気づく）

---

## ADR-008: server-fn の `frontMatter` 受け渡しは JSON 文字列ラップ

### Status
Accepted

### Context
ドメイン `FrontMatterValue` は recursive な `Record<string, FrontMatterValue> | string | number | boolean | null | FrontMatterValue[]`。既存 `actions.ts` 冒頭コメントで「`frontMatter: Record<string, unknown>` は TanStack Start の transport-serialisation が型チェックを拒否」と明示されており、`createNoteFn` 現実装は `frontMatter: {}` 固定で回避している。Zod `z.record(z.string(), z.unknown())` でも transport-shape 経由で型エラーが再発する可能性がある。

### Decision
- server-fn の `inputValidator` は `frontMatterJson: z.string().optional()` の **文字列フィールド** で受ける
- handler 内で `JSON.parse(frontMatterJson ?? '{}')` → `FrontMatter.create(parsed)` → 失敗時は `BusinessRuleError` で返す
- 戻り値には `frontMatter` を含めず（scalar のみ）、再表示は `router.invalidate()` で RSC 再フェッチ
- 既存 `createNoteFn` / `saveNoteFn` も同方式に揃え、`frontMatter: {}` 固定箇所を置換

### Consequences
- 良い点: transport 型チェックが文字列に閉じるため、TanStack Start の制約に確実に整合。recursive 型問題が完全に消える
- トレードオフ: 二重バリデーション（zod + JSON.parse + FrontMatter.create）でハンドラがやや複雑化。エラー文言を3層で揃える必要あり

---

## ADR-009: メディア URL は `/media/<id>` ルートで統一、R2 直 URL は使わない

### Status
Accepted

### Context
`app/core/domain/note/service.ts:51` の `MEDIA_ID_FROM_URL = /\/media\/([0-9a-z-]+)/i` は、ノート HTML 内の `<img>`/`<video>`/`<audio>`/`<source>` `src` から **`/media/<id>` 形式の URL** のみを抽出する。これにより `MediaService.reconcileRefs` が `mediaIds` を集計し refCount を更新する。R2 直 URL（`https://<account>.r2.cloudflarestorage.com/...`）を `src` に入れると抽出されず、`PurgeOrphans` 実行時にサイレント削除されるデータロス事故になる。

加えて sanitizer の `GLOBAL_ATTRS` ホワイトリストは `data-internal-link` のみで、`data-media-ref` 属性は無条件で剥がされるため、属性ベースの参照集計は機能しない。

### Decision
- 本 PR で `app/routes/media/$mediaId.tsx` を新規追加し、`downloadMedia` usecase の presigned URL に 302 リダイレクトする
- `MediaUploader` は挿入時 `<img src="/media/<id>" alt="">` 形式の HTML を生成し、`data-media-ref` 等のカスタム属性は使わない
- R2 CORS 設定の確認手順を PR 説明に追記

### Consequences
- 良い点: `MEDIA_ID_FROM_URL` パターンと完全整合、refCount が正しく更新され `PurgeOrphans` が誤削除しない。URL の保持責任がアプリ側に閉じ、R2 移行や CDN 切替に強い
- トレードオフ: 画像表示ごとに `/media/<id>` ルート経由で 302 リダイレクトする CPU コスト（presigned URL を即時返却するだけのため小さい）

---

## ADR-010: bulk 操作の `noteIds` は schema 段階で max(100) 上限

### Status
Accepted

### Context
`bulkMoveNotes` / `bulkTrashNotes` / `bulkChangePublicationVisibility` は per-note シーケンシャル処理。Cloudflare Workers の CPU time 制限（10ms-30s）を超えると Worker が強制終了する。無制限な配列を受け付けると DoS リスクもある。

### Decision
- `BULK_NOTE_IDS_MAX = 100` を定数化（`note/constants.ts`）
- `bulkMoveSchema` / `bulkTrashSchema` / `bulkVisibilitySchema` / `bulkExportSchema` の `noteIds` に `.max(BULK_NOTE_IDS_MAX)` を必須
- UI 側は選択上限を明示せず、「100 件まで」の文言をエラー時に表示

### Consequences
- 良い点: Worker CPU 超過事故を schema 段階で防ぐ。DoS 緩和
- トレードオフ: 100 件超のノートを一度に処理したい UX が制限される（spec 想定外の規模なので問題ない）

---

## ADR-007: ヘッダー検索クエリは P10 内で `searchOwnNotes` に切り替える

### Status
Accepted

### Context
ヘッダー検索ボックスから自分のノートを検索する場合、spec は「結果は P10 を絞り込み表示」と規定。一方、フィルタのみ（タグ/期間）の場合は `listNotesByOwner` で十分。

### Decision
- ルートの `validateSearch` で `q` を受け、loader 内で:
  - `q` 非空 → `searchOwnNotes(SearchQuery.create({ keyword: q, tagNames, directoryId, dateRange }))`
  - `q` 空 → `listNotesByOwner`
- `SearchQuery.create('')` が許容されない場合は `q` 有時のみ search 切替に縮退

### Consequences
- 良い点: 一つの URL schema でフィルタと検索を統合、ヘッダー検索の遷移先が自然に動く
- トレードオフ: 2つの usecase の出力 DTO 差（cursor vs offset, hit highlight 有無）を `NoteList.tsx` で吸収する必要あり

---

## ADR-011: `loadSavedViewById` は per-id usecase を新設せず `listSavedViews` を再利用する

### Status
Accepted

### Context
B-7 / A-3 の SavedView 復元（`?viewId=...`）のため、単体 SavedView を読む loader が必要になった。アプリケーション層には `listSavedViews` / `validateSavedView` / `createSavedView` / `updateSavedView` / `deleteSavedView` / `setDefaultSavedView` は存在するが、**id 指定の読み取り専用 usecase は無い**。

選択肢:
- 案A: 新規に `getSavedView` usecase を application 層へ追加
- 案B: `listSavedViews` を kind ごとに呼び、戻り値から id でフィルタする loader を frontend 層に置く

### Decision
案B を採用。`app/components/note/loaders.ts` の `loadSavedViewById` で `personal` → `public` の順に `listSavedViews` を叩き、最初に一致したものを返す。

理由:
- SavedView は per-user の総数が小さい（spec 想定で数十件オーダー）
- `listSavedViews` は同じ UoW 内で `detectBrokenConditions` を走らせるため、復元時の整合性検証が同時に得られる
- 単純な read-only 機能のために application 層 API を増やすより、本 PR の Phase A スコープ内で済ませる方が変更面を狭く保てる

将来 SavedView 件数が膨らんだ場合は、`getSavedView` usecase 追加で差し替え可能（loader の interface は変わらない）。

### Consequences
- 良い点: application 層への新規追加ゼロ、Phase A の影響範囲を最小化
- トレードオフ: 1 回の復元で最大 2 回 `listSavedViews` を叩く。件数増加時にコスト線形に増える

---

## ADR-012: `searchOwnNotes` 結果の `NoteListItemDTO` projection は MVP では退化形

### Status
Accepted (search 経路の visibility 実値化は Issue #8 スコープ外、別 Issue で対応予定。`.issue/8/adr.md` ADR-008 / ADR-010 参照)

### Context
home page loader は `q` 有無で `searchOwnNotes`（`SearchHitDTO` を返す） / `listNotesByOwner`（`NoteListItemDTO` を返す）を切り替える。両者は共通の表示用 view-model に集約する必要があるが、`SearchHitDTO` には `directoryId` / `slug` / `updatedAt` / `visibility` が含まれず、`NoteListItemDTO` の `excerpt` / `tagNames` も別経路から来る。

### Decision
本 PR の `OwnedNotesResult` では:
- search 経路: `directoryId = ""`, `slug = ""`, `updatedAt = new Date(0)`, `visibility = "private"` のプレースホルダで埋める
- filter 経路: そのまま `NoteListItemDTO` の値を載せる
- 共通 view-model に `mode: "filter" | "search"` を持たせ、UI 側で必要に応じて分岐する余地を残す

理由: search 経路で `directoryId` / `updatedAt` を正しく出すには `NoteRepository.findByIds` を search 結果に対して二次クエリで実行する必要があり、Phase A のスコープを超える。Phase B 以降で「検索結果でも updatedAt を出す」要件が立ってから対応する。

### Consequences
- 良い点: Phase A での二次クエリ追加を回避し、loader の関心を「URL → 1 つの list/search 切り替え」に閉じ込められる
- トレードオフ: search 経路では list / tile / calendar の表示で `updatedAt` がエポック値になり、`CalendarView` が日付グルーピングできない。Phase B で UI 側が `mode === "search"` を検知して calendar mode を強制的に list へ落とすか、二次クエリの追加が必要

---

## ADR-013: Phase B では visibility バッジ / フィルタを search 経路にのみ出す

### Status
Superseded by Issue #8: filter 経路で visibility 実値化済、`showVisibilityBadge = mode === "filter"` に切替。公開状態 select は両モード常時表示（`.issue/8/adr.md` ADR-008 / ADR-010 参照）

### Context
Phase B の表示モード（list / tile）で公開状態バッジを描画する設計だが、`listNotesByOwner` 経路では `NoteListItemDTO.visibility` が `'private'` 固定で返ってくる（ADR-001 / ADR-012）。filter 経路でバッジを出すと「すべて非公開と表示される」誤情報になる。

### Decision
- `NoteList` server component で `mode === "search"` のときだけ `showVisibilityBadge = true` を `ListView` / `TileView` に渡す
- `FilterBar` の「公開状態」select も `searchActive`（= `mode === "search"`）の場合のみ描画する。filter 経路では非表示にすることで「フィルタが効かない / バッジが嘘」の二重問題を回避
- バッジ自体のスタイル（`chip.public` / `chip.unlisted` / `chip.private`）は仕込んでおき、`listNotesByOwner` の projection 拡張（別 Issue）が入った瞬間に `showVisibilityBadge` を `true` に切り替えるだけで完成する形にする

### Consequences
- 良い点: 誤情報を出さない。UI を spec 要件に部分準拠させつつ、バックエンド拡張で「全モードで使える」状態に自然移行できる
- トレードオフ: 同じ画面で「フィルタ条件によって UI が増減する」体験になり、ユーザーは戸惑う可能性。filter 経路でも「公開状態」select を grayed-out で表示する代替案もあったが、disabled は混乱を増やすだけと判断して非表示に倒した

---

## ADR-014: CalendarView は search 経路ではフォールバック文言を表示する

### Status
Accepted

### Context
ADR-012 で search 経路の `updatedAt` を `new Date(0)` のエポック値プレースホルダで埋めた結果、`groupNotesByDay` がすべての検索ヒットを `1970-01-01` バケットに集約してしまう。これでは「カレンダー表示」として機能せず、誤った日付情報を提示することになる。

### Decision
- `CalendarView` は props で `mode: "filter" | "search"` を受ける
- `mode === "search"` のときはノートを描画せず、フォールバック文言「検索結果はカレンダー表示に対応していません。リスト表示で結果をご確認ください。」を表示する
- 表示形式切替 (`DisplayModeSwitch`) を強制的に list に戻すことはしない — URL は `display=calendar` のままで、ユーザーが手動で切り替える形にする（戻り先のフィルタ条件に対しては calendar が有効なため、画面遷移で意図が失われない）

### Consequences
- 良い点: 検索ヒットの誤った日付グルーピングを完全に回避。`updatedAt` projection が拡張された段階で（別 Issue）この分岐を削除するだけで search 経路もカレンダー表示できる
- トレードオフ: ユーザーが「カレンダーで検索したい」と思った場合、リスト表示への切替を自分で行う必要がある。`DisplayModeSwitch` 周辺に「カレンダーは検索結果非対応」のヒントを添える案もあったが、Phase B の UI 密度を上げすぎないために省いた

---

## ADR-015: Sidebar からのディレクトリ遷移は他フィルタを保持しない

### Status
Accepted

### Context
B-8 の Sidebar `DirectoryNode` を `<Link to="/" search={{ directoryId }}>` に変更したことで、選択中ディレクトリのリンクをクリックすると現在の `tagNames` / `from` / `to` / `q` / `viewId` などの他フィルタがすべて破棄される（TanStack Router の `search` プロパティに function ではなく object を渡しているため、置換される）。

選択肢:
- 案A: `search={(prev) => ({ ...prev, directoryId })}` で他フィルタを保持
- 案B: 現状の `search={{ directoryId }}` で他フィルタを破棄（= フィルタリセット）

### Decision
案B を採用。理由:
- Sidebar はナビゲーション要素として「別の場所に移動する」セマンティクスを持つ。フィルタを引きずると「同じディレクトリ内で別のフィルタを当てたい」UX しか作れず、「フィルタを全リセットして別のディレクトリを見たい」UX が難しくなる
- ヘッダー検索（`?q=`）も `<form action="/" method="get">` で同じく他フィルタを破棄する挙動であり、Sidebar もこの規約に揃える方が整合性が高い
- ユーザーが「同じフィルタを保持して別ディレクトリへ」したい場合は、`FilterBar` の chip / 期間 input から条件を取り戻す（保存ビューで復元する）方が明示的

### Consequences
- 良い点: ナビゲーションの責務とフィルタの責務が明確に分離する。`<Link>` 1 行で意図が読める
- トレードオフ: 「同じタグをかけたまま隣のディレクトリへ」のような遷移は 2 アクション必要になる。実利用上の頻度が高ければ将来 SavedView から復元する導線で吸収する

---

## ADR-016: 選択 UI は Set ベース useReducer Context、URL には載せない

### Status
Accepted

### Context
ADR-004 で URL 駆動状態を採用しているが、複数選択（チェックボックス）の対象 ID 集合まで URL に載せると以下の問題が起きる:
- 100 件選択時に URL が 100 個の UUID で膨らみ、ブラウザ / プロキシの URL 長制限に抵触
- 戻る / 進むで選択集合が変わると、操作中に意図せず選択が消える
- 別ユーザーへの URL 共有時に「他人のノート ID」が漏れる可能性

### Decision
- 選択集合は `SelectionContext` 配下で `useReducer(selectionReducer, emptySelection)` 管理
- `selectionReducer` は `app/components/note/list/listSelectors.ts` に **pure 関数として export** し、`vitest` で全アクションをカバー（5 ケース実装済み）
- reducer の `clear` アクションは状態が空のとき同じ参照を返し、不要な React 再レンダーを抑止
- URL 駆動が活きるのは「フィルタ / 表示形式 / ビュー復元」までで、UI の一時状態（ダイアログ open / 選択集合）は通常の React state に閉じる

### Consequences
- 良い点: URL 長問題 / 共有時の漏洩 / 戻る進むの違和感を一括回避。pure reducer なので将来 selectAll / selectInRange など拡張しても回帰しにくい
- トレードオフ: 選択状態がリロード / 戻る進むで消える（ただしこれは仕様、選択は瞬間的な操作セマンティクスのため）。ページ遷移を跨いだ選択保持が必要になったら `sessionStorage` を介在させる別 Issue を起票する

---

## ADR-017: P11 NoteActions は `MoveNoteDialog` を SelectionProvider でラップして単体再利用する

### Status
Accepted

### Context
Phase C の操作メニュー（編集 / 公開設定 / 移動 / URL コピー / 複製 / エクスポート / 履歴 / 削除）の「移動」では、Phase B で実装済みの `MoveNoteDialog`（`app/components/note/list/MoveNoteDialog.tsx`）を再利用したい。このダイアログは `useSelection()` フック（`SelectionContext`）に依存しており、`noteId` プロパティが渡されたときは選択集合（`state.ids`）を無視して単体ノート用にフォールバックする実装になっている。ただし `useSelection` フック自体は Provider が無い時 throw するため、何らかの Provider 配下に置く必要がある。

選択肢:
- 案A: `MoveNoteDialog` を P11 用に複製（コード重複）
- 案B: `MoveNoteDialog` を Provider 非依存にリファクタ
- 案C: P11 の `NoteActions` 内で空の `SelectionProvider` を立て、`MoveNoteDialog` を `noteId` プロパティ付きで使う（既存の単体モードを活用）

### Decision
案C を採用。`NoteActions` 内部で `SelectionProvider` を立て、`MoveNoteDialog` には `noteId` を渡して単体モードで使う。Provider は空の選択状態で初期化され、`dispatch({ type: 'clear' })` 呼び出しもノーオペとして問題なく終わる。

理由:
- Phase B で `MoveNoteDialog` の単体モード（`noteId` プロパティ）が既に実装済み
- リファクタを避け、両用途で 1 ファイルに収束したまま再利用できる
- `SelectionProvider` のオーバーヘッドは無視できる（空 Set 1 つ）

### Consequences
- 良い点: コード重複ゼロ。Phase B の bulk dialog と Phase C の単体 dialog が同じ実装を共有
- トレードオフ: `NoteActions` 内で本来 P11 では不要な `SelectionProvider` がぶら下がる。ただし副作用は無く、`useSelection` の API 契約に意味的に整合

---

## ADR-018: P11 URL コピー先は visibility 値で分岐、share-link は最初の active を採用

### Status
Accepted

### Context
spec の操作メニューに「URL コピー」がある。共有用 URL は visibility によって意味が変わる:
- `public` / `unlisted`: 外部に共有できる URL が必要（`listShareLinks` で得られる `ShareLinkDTO.url`）
- `private`: 共有できる URL は無いが、内部のブックマーク用として `/notes/<id>` を返す方が UX 上有用

share-link は 1 ノートに対し複数発行可能で revoked も含む。どれを「正準 URL」とするかは設計判断。

### Decision
- `visibility ∈ {public, unlisted}` かつ `links.find(l => l.status === 'active')` が存在 → そのリンクの `url` をコピー
- それ以外（active リンクが無い / private） → `location.origin + /notes/<id>`（クライアント側で `location` が無いビルド時は相対 URL `/notes/<id>` をフォールバック）
- `UrlCopyButton` は `aria-live="polite"` で成功/失敗をスクリーンリーダに通知し、2 秒後に状態をリセット

### Consequences
- 良い点: 公開ノートはそのまま共有可能、未公開は内部ブックマーク代用、という直感的挙動。`navigator.clipboard` 未対応環境ではエラー文言で誘導
- トレードオフ: 複数 active share-link がある場合は最初のものを採用する単純規則。複数リンク管理は `/notes/$noteId/publish` で行う想定で問題なし

---

## ADR-019: P11 FrontMatter パネルの未知キーは `<details>` で折り畳む

### Status
Accepted

### Context
ドメインの `FrontMatter` は深さ 3 までの recursive JSON。spec は「既知キー優先表示 + その他折り畳み」を要求しており、表示ロジックは pure コンポーネントに閉じる必要がある（ADR-005）。

### Decision
- 既知キー順序: `title` / `date` / `tags` / `description` / `slug`（spec 通り）
- 未知キーは数だけ summary に出して `<details>` で折り畳む
- 値レンダリングは `renderFrontMatterValue(value)` を pure recursive 関数として export（配列 / オブジェクト / プリミティブを分岐レンダリング）

### Consequences
- 良い点: pure 関数として export しているのでテスト容易。ネストした FrontMatter も再帰的に綺麗に表示
- トレードオフ: 配列要素の `key` には index を使う（値が pure なので問題ないが lint コメントで明示）

---

## ADR-020: editLock 競合の検出は実コードに合わせて `edit_locked_by_other` を採用

### Status
Accepted

### Context
plan.md D-8 では editLock 競合時の business コードを `edit_lock_held_by_other` と表記していたが、ドメイン側 (`app/core/domain/note/errorCode.ts:18`) に実際に定義されているのは `edit_locked_by_other` だった。両者で文字列が異なるため、hook の分岐がそのまま空振りすれば「他者編集中」のバナーが永遠に出ない。

### Decision
- `useEditLock` は `HELD_BY_OTHER_CODES` という `Set<string>` を持ち、`edit_locked_by_other`（実コード）と `edit_lock_held_by_other`（plan 表記）の両方を受理する
- 実装コメントで「ドメインの実コードに優先で合わせる」旨を残し、将来コードを統合する際に hook 側の集合を減らせる

### Consequences
- 良い点: plan の表記揺れに引きずられて、本来検出すべき競合を取り逃がす事故を防ぐ
- トレードオフ: 集合に2要素持つことで「どちらが正規か」が一見で読みづらい。errorCode 側の定数を ADR-020 でも参照していると JSDoc に明記して補う

---

## ADR-021: editor reducer は FrontMatter を構造表現と raw 文字列で二重に保持する

### Status
Accepted

### Context
P12 では FrontMatter を「構造 UI」と「生 JSON 編集」のどちらでも編集できる必要がある（spec L130 / ADR-003）。これを単一の値で扱うと「構造 UI で `tags` を編集 → raw 表示が更新されない」「raw 編集中に JSON が壊れた瞬間に構造表現がロストする」のいずれかが発生する。

### Decision
- `EditorState` に `frontMatter: Record<string, unknown>` と `frontMatterRawJson: string` を独立に持ち、`frontMatterMode: 'structured' | 'raw'` で表示の主役を切り替える
- 構造 UI からの編集（`setFrontMatterField`）は parsed を更新し、raw 文字列を `stringifyFrontMatter` で再生成する
- raw 編集（`setFrontMatterRawJson`）は raw 文字列を即時反映し、parse できた場合のみ parsed も更新する。parse 失敗時は `frontMatterJsonError` を立て、ユーザー入力中の生テキストを失わない
- 構造モードに戻す `toggleFrontMatterMode` は raw を parse 試行し、失敗時は raw に留めずモード遷移は許可しつつエラーを表示する（ユーザーが「とりあえずタブを切り替えたい」シーンを塞がない）
- snapshotForSubmit は parsed 側を JSON 文字列化して送る（ADR-008）。raw が parse できない状態では save ボタン側を disabled にして送信を防ぐ

### Consequences
- 良い点: 編集中のタイプ済みテキストが parse 失敗で消えない。構造 / raw 双方からの編集が可逆。autosave も parse できた最新値だけが送られる
- トレードオフ: 状態が 2 つになる分、reducer の "同期" 不変条件を読み手が常に意識する必要がある。テスト (`editorState.test.ts`) で双方向の遷移を網羅して挙動をピン留めしている

---

## ADR-022: メディアアップロード経路の MIME → kind マッピングは画像/動画の 2 値に絞る

### Status
Accepted

### Context
`presignMediaUploadFn` の `kind` は `"image" | "video" | "avatar"` を受け付ける（`media/schema.ts`）。ノートエディタからのアップロードは本文挿入が目的で、avatar は別経路（identity 系画面）が責務。誤って `kind: "avatar"` を選んでもサーバ側で reject はされないが、`MediaAsset` の用途分類が崩れる。

### Decision
- `MediaUploader` 内の `kindForMime(mimeType)` は `video/*` → `"video"`、それ以外 → `"image"` の 2 値固定
- avatar 用アップロードはノートエディタからは選択不可（input の `accept` も `image/*,video/*` で絞る）
- 将来 avatar をエディタから扱う要求が来た場合は別 prop / 別コンポーネントで対応する

### Consequences
- 良い点: アップロードの用途を 1 ファイルで決定できる。MediaAsset 集約が「ノート本文用」と「アバター用」で混線しない
- トレードオフ: MIME が `application/pdf` などの未対応値だった場合 `image` 扱いで presign されてしまう。サーバ側のホワイトリスト（既存）に依存する

---

## ADR-023: Phase E のユニットテストは zod 境界条件に限定、RTL は導入しない

### Status
Accepted

### Context
Phase E では P10/P11/P12 で追加した pure ロジック（`listSelectors`, `editorState`, `mediaInsert`）に加え、transport boundary を担う `app/components/note/schema.ts` を網羅する必要がある。React コンポーネント側にも振る舞いはあるが、本プロジェクトには React Testing Library が未導入で、新規ライブラリ追加は CLAUDE.md の依存最小化原則および Workers バンドル前提に反する。

### Decision
- 新規テストは `app/components/note/__tests__/schema.test.ts` に zod 境界条件のみを追加する
- カバー範囲: `noteListSearchSchema` の `.optional().catch(undefined)` / `.default()` 挙動、`bulk{Move,Trash,Visibility,Export}Schema` の `BULK_NOTE_IDS_MAX` / `EXPORT_BULK_LIMIT` 境界、`saveDraftSchema` の各フィールド境界、`createNoteSchema` / `saveNoteSchema` / `renameNoteSchema` / `moveNoteSchema` / `restoreNoteSchema` の null 許容と空文字拒否、tagNames trim、PDF format 必須フィールドの相互制約、noteId-only 系スキーマ（`delete` / `purge` / `duplicate` / `acquire` / `extend` / `releaseLock`）の共通契約
- UI 振る舞いの統合検証は手動テスト（`spec/manual-tests/`）と既存の usecase 統合テストに委ねる

### Consequences
- 良い点: 新規依存ゼロで transport boundary の不変条件を vitest で固定化できる。`.catch(undefined)` フォールバックが Sidebar の partial Link search に対する防御になっていることがテストで明示される
- トレードオフ: コンポーネント自体の振る舞い（reducer と JSX の結線、dialog open/close の DOM 状態）は手動テスト依存のまま。RTL 導入は別 Issue で再検討する

---

## ADR-024: tag.integration.test.ts の既存失敗はスコープ外として記録のみ

### Status
Accepted

### Context
`pnpm test:integration` 実行時、`app/core/application/tag/__tests__/tag.integration.test.ts` で 18 件の UNIQUE constraint 違反（`users.username`）が発生している。Phase E 着手前の `git stash` 状態でも同じ失敗が再現することを確認済み (`Test Files  1 failed | 12 passed (13)`, `Tests  18 failed | 150 passed (168)`)。

### Decision
Phase E のスコープ（pure ロジックの境界テスト追加）と無関係な既存失敗のため、Issue #1 の作業では修正しない。テスト間の DB seed 分離（`seedUser` の username 衝突）を見直す別 Issue として起票候補に挙げる。

### Consequences
- 良い点: スコープを膨らませず Phase E を完了できる
- トレードオフ: 統合テストが赤のまま PR を出すことになる。PR 説明に「pre-existing on the branch、本 PR では未対応」と明記する必要がある

---

## ADR-025: サブエージェント並列実行は同一ファイルへの修正で逐次化する

### Status
Accepted

### Context
Issue #1 PR レビュー Round 2 で 3 つの修正 agent を並列起動した結果、3 つ目のテスト追加 agent が `useAutosave.ts` / `useEditLock.ts` / `MediaUploader.tsx` で「pure helper を export する」修正を行う際に、別 agent が並列で行っていた「signature を `useServerFn` ラップ用に変更する」修正を上書きで巻き戻した。両方とも同じファイルを触る変更で、独立タスクではなかった。

### Decision
- サブエージェント並列実行ポリシーは「独立した作業は並列」を原則とするが、**同一ファイルに対する修正タスクは逐次化する**ことを補足する
- 修正タスクを並列起動する前にファイル単位の touch graph を確認し、重複があれば順序化 or 統合する
- 並列 agent の出力を merge した後、`git diff` で意図しない巻き戻しが発生していないか確認するチェックを入れる

### Consequences
- 良い点: regression を防ぐ
- トレードオフ: 並列度が下がる

---

## ADR-026: ホームルートの validateSearch は他ルートと意図的に divergence

### Status
Accepted

### Context
Round 2 で `validateSearch` を他ルート (`search.tsx`, `views/index.tsx` 等) の `(search) => schema.parse(search)` パターンに揃える修正を試みたが、`<Link to="/">` / `redirect({ to: "/" })` を呼ぶ 8 ファイル + `NoteListToolbar.tsx` の `search: (prev) => ...` updater で TypeScript の `MakeRequiredSearchParams` 要求が厳しくなり型エラーが発生する。`validateInput()` ラッパは入力を `unknown` に広げる効果があり、`<Link to="/">` から `search` prop を省略できる仕様を成立させている。

### Decision
- ホームルートは `validateInput(noteListSearchSchema)` を継続使用、他ルートとの divergence を**意図的に**維持
- divergence の根拠を `app/routes/index.tsx` にコメントで明示
- 統一化は Phase 4 で別 Issue として検討

### Consequences
- 良い点: 既存ルート群との後方互換が保たれる、`<Link to="/">` の省略が許可される UX が維持される
- トレードオフ: throw 経路が他ルートと不統一（`AppServerError` vs `ZodError`）
