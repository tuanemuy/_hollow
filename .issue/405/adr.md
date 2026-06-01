# ADR — Issue #405: 保存ビュー管理UIの拡充

#394 の `.issue/394/adr.md` ADR-003（編集/複製/修復をスコープ外）・ADR-004（汎用文採用）を本 Issue で覆す。以下はその新方針。

## ADR-A: 壊れた条件の具体名は「削除時スナップショット」で保持する（Option A）

### Status
Accepted

### Context
P20 カンプは「削除済みディレクトリ `Research / Papers` を参照しています」と具体名を出す。一方、参照先の tag/directory は hard-delete、note は purge で物理削除され、削除イベント payload は ID のみを持つ。

検討案:
- **Option B（表示時解決）**: `listSavedViews` で壊れた ID を `findById` して名前を引く。→ 行が既に消えているため**原理的に不可能**。
- **Option A（削除時スナップショット）**: 削除 usecase 内（entity がまだ在る時点）で名前を event payload に載せ、ハンドラ経由でマーカーへ焼き付ける。

### Decision
Option A を採用。`BrokenConditionMarker` に `lastSeenName` を追加し、削除イベント payload（`tag.deleted`/`directory.deleted` に name、`note.purged` に title）→ decoder → ハンドラ → マーカーへ伝播する。

### Consequences
- 良い点: 削除済み参照の具体名を正確に表示できる。`broken_conditions_json` は JSON テキストカラムなので **DB マイグレーション不要**（JSON 内構造の拡張のみ）。
- トレードオフ: 削除イベント payload・decoder・ハンドラ・VO・DTO・adapter JSON を跨ぐ横断変更。
- 非対称性: イベント経路のマーカーは name 付き、`detectBrokenConditions`（list/create/update の再スキャン）経路は name なし。後者は削除済み行の名前を引けないため、フォールバック文言で degrade する。
- 後方互換: 旧 payload（name なし）・旧 JSON 行（lastSeenName 欠落）は decode フォールバックで「削除済みの{kind}」と表示する。

## ADR-B: マーカーのマージは (kind,id) 同一性のみで判定し、name 付きを優先保持する

### Status
Accepted

### Context
`SavedView.markBroken` は同一 (kind,id) のマーカーをマージする。ADR-A の非対称性により、同じ参照に対して name 付き（イベント経路）と name なし（detect 経路）のマーカーが時間差で来うる。

### Decision
マーカーの同一性（`equals`）は (kind,id) のみで判定し、`lastSeenName` は同一性に含めない。マージ時、既存マーカーが name を持ち incoming が name を持たない場合は既存の name を保持する（name なしが name 付きを潰さない）。

### Consequences
- 良い点: detect 経路の再スキャンが、過去にイベント経路で得た具体名を消さない。
- トレードオフ: マージロジックがわずかに複雑化。回帰テストで担保する。

## ADR-C: 編集と新規作成は共通 `ViewFormDialog` を mode 違いで共有する

### Status
Accepted

### Context
home 側の `SaveViewDialog` は URL search（`searchToViewQuery`/`homeRoute.useSearch`）に密結合で、「現在のフィルタを保存」という別ユースケース。`/views` の編集・新規作成は `SavedViewDTO`（タグは ID 保持）を白紙/初期値にフィルタ条件を直接編集する。

### Decision
フィルタ条件を直接編集できる共通 `ViewFormDialog` を新設し、編集（機能1）と新規作成（機能4）で mode 違い共有する。home の `SaveViewDialog` は別責務として残置。タグは UI 上は名前で扱い、編集初期値は loader で `tagIds`→名前へ逆解決、server fn 側は `resolveTagNamesToIds` で名前→ID（`createSavedViewFn` と同一パターン）。

### Consequences
- 良い点: 編集・新規作成のフォームUIを一本化。home の保存導線は無傷。
- トレードオフ: ID↔名前の双方向解決が必要。

## ADR-D: `?kind=` search param は現状維持（両表示）

### Status
Accepted

### Context
`/views` の `?kind=` は route loader から Page に渡るが Page 側で無視され、個人/共有を常に両表示している。本 Issue の主目的は5機能の実装。

### Decision
本 Issue では `?kind=` のタブ化は行わず現状の両表示を維持する。タブUIは行数増で主目的から逸れるため別途検討とする。

### Consequences
- 良い点: スコープを5機能に集中。
- トレードオフ: `?kind=` は引き続き装飾的なまま。

## ADR-E: 実装時の補足判断（バックエンド層）

### Status
Accepted

### Context
ADR-A / ADR-B をコードに落とす際、計画では明示されていなかった細部の判断が必要になった。

### Decision
- **空 name のドメイン VO 化を回避**: `lastSeenName` は VO ではなく素の `string`。イベント payload の name は `TagName` / `DirectoryName` / `NoteTitle` という非空制約付き VO だが、decoder の後方互換フォールバック（旧 payload で name 欠落）では空文字を許す必要がある。`TagName.create("")` 等は空文字で throw するため、decoder では `(p.name ?? "") as TagName` と **VO factory を通さずキャスト**する。空文字はマーカー側で「具体名なし」を表すセンチネルであり、ビジネス不変条件ではないため、この緩和は妥当。
- **`markBroken` の変更検知をマージ後フィールド比較に拡張**: `BrokenConditionMarker.equals` を (kind,id) のみに変更した結果、`equals` だけでは name / lastSeenAt の更新を検知できなくなった。そこで `markBroken` の no-op 判定では `equals` に加えて `lastSeenName` と `lastSeenAt` も明示比較する。これにより「同一参照だが name が新たに付いた／timestamp が進んだ」場合に version が正しく bump される。
- **`note.trashed` 経路の view ハンドラは title="" 固定**: `handleNotePurgedEvent` は `note.trashed` と `note.purged` の両方から呼ばれる。`note.trashed` event は title を持たない（trash 時点ではノートは物理削除されていない）ため、dispatch は title="" を渡す。後続の `note.purged`（title 付き）が来れば ADR-B のマージで title が焼き付く。なお trashed のままなら参照先はまだ生存しており、本来 broken ではない点に留意（既存の挙動を踏襲、本 Issue で変更せず）。
- **`directory.deleted` の name 取得**: `DirectoryService.deleteSubtree` は ID のみ返すため、`deleteDirectory` usecase 内の削除前サブツリー走査（旧 `collectMediaRefsInSubtree`）を `collectSubtreeSnapshot` に拡張し、mediaRefs と並行して `Map<DirectoryId, DirectoryName>` を収集。emit 時にこのマップから name を引く。
- **DI 配線は不要**: server function は `loadServerDeps(() => import("@/core/application/view/..."))` で usecase を動的 import するため、`duplicateSavedView` / `repairSavedView` を DI コンテナに登録する必要はない。新規ファイルを置くだけでフロントから到達可能。

### Consequences
- 後方互換: 旧 outbox payload・旧 `broken_conditions_json` 行は decode フォールバックで空 name に degrade し、マイグレーション不要。
- マイグレーション不要を維持（`broken_conditions_json` は JSON テキストカラム）。
