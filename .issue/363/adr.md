# ADR — Issue #363: 取り込みのディレクトリ提案: 新規ネストパス（多階層）の作成をサポートする

本 Issue は #355 ADR-004（新規提案を root 直下単一名に縮退）を正式に解除する。前提として #355 の ADR-004 / ADR-005 を参照。

## ADR-001: 新規ネストパスのデータモデルは既存単一文字列 + `/` デリミタの意味拡張で表現する

### Status
Proposed

### Context
新規ネストパス（`技術/AI`）を表現するデータモデルとして (a) 既存 `suggestedDirectoryName: string | null` の意味を「`/` 区切り正準パス文字列」に拡張、(b) VO 内部を `readonly DirectoryName[]` のセグメント列に変更し wire は別途文字列化、(c) wire/DTO に新規フィールド（パス列）を追加、の3案がある。`DirectoryName` は `/` を禁止文字とするため、いずれにせよ利用時はセグメント列への展開が必要。

### Decision
(a) を選ぶ。`suggestedDirectoryName` の型（`string | null`）はそのまま、意味を「root 除外・先頭スラッシュ無し `親/子` 正準パス」へ拡張する。利用時（VO 構築・commit）は必ず split→`DirectoryName[]` に展開する二段構えとする。

### Consequences
- 良い点: wire/DTO/schema を3層またぐ新フィールド追加・serialize 境界・既存 previewing ジョブのリハイドレートへの波及を回避。後方互換（単一名は1セグメントのパスとして矛盾なく解釈）。ADR-005 の `canonicalizeDirectoryPaths` が生成する `親/子` 正準形と提案右辺の表現が揃う。
- トレードオフ: 保存は文字列だが利用時に必ずセグメント分解が要る。VO 内部をセグメント列にする (b) よりドメイン的な純度はわずかに落ちる。

---

## ADR-002: ネスト ensure はドメインサービス `DirectoryService.ensureNestedPath` に集約する

### Status
Proposed

### Context
commit 経路で「中間ディレクトリを順に ensure しながら末端まで作成」する処理を、usecase 内にインラインで書くか、ドメインサービスに切り出すか。深さ・兄弟名一意の不変条件はドメインが所有すべき。

### Decision
`DirectoryService` に `ensureRoot` と対称な `ensureNestedPath(ownerId, segments, ...)` を新設し、commit の同一 UoW 内で root から findBySiblingName→再利用 or `Directory.create`→insert を順次実行する。usecase は文字列→`DirectoryName[]` の分解のみ担当し、ドメイン不変条件は持ち込まない。

`ensureNestedPath` が依存する repository API（`findBySiblingName` / `findChildren` / `findRoot` / `insert`）は `DirectoryRepository` ポートに実在するため新規 port 追加は不要。`segments` が空配列のときは root id を返す契約とし、commit 側の「空パス → root フォールバック」分岐をドメインに寄せる。

### Consequences
- 良い点: 冪等性（中間既存なら再利用＝部分パス合流）と深さ/兄弟名一意を1箇所に閉じ込める。`ensureRoot` と一貫した API。新規 port 不要。
- トレードオフ: ドメインサービスの API 表面が増える。

---

## ADR-003: `MAX_DIRECTORY_DEPTH` 検証はプレビュー段階と commit 段階で扱いを分ける

### Status
Proposed

### Context
深さ上限超過をどこでどう扱うか。LLM が暴走して深すぎるパスを提案する場合と、ユーザーが手入力で深いパスを指定する場合がある。

### Decision
二重に置き、扱いを分ける。(a) VO 構築時（`IngestionPreview.create`）はセグメント数超過を「採用可否」として best-effort 判定し超過なら null 化（ジョブを失敗させない＝既存 over-long leaf 哲学）。(b) commit の `ensureNestedPath` 内は `Directory.create`/`DirectoryDepth.next` が `TooDeep` を throw（ユーザー明示入力の超過は業務エラーとして弾く、`createDirectory` と同じ扱い）。

### Consequences
- 良い点: プレビュー段階の LLM 暴走は非致命に、ユーザー明示入力の超過は業務エラーに、と意味に応じて分離。
- トレードオフ: 深さ検証ロジックが2箇所に分散する（ただし役割が異なる）。

---

## ADR-004: 既存 `DirectoryPicker` の共用を壊さず、ネストパス意味は ingestion 側で扱う

### Status
Proposed

### Context
`DirectoryPicker` は ingestion プレビューフォームと NoteEditor 通常編集で共用。ネストパス意味を一律導入すると NoteEditor 側の `createDirectoryFn`（単一名前提の可能性）と齟齬を起こしうる。

### Decision
ingestion 専用 prop `allowNestedPath?: boolean` を**必ず導入**する。NoteEditor 経路は `pendingDirectoryName` を `createDirectory({ name })` → `DirectoryName.create` に渡し、`DirectoryName` の禁止文字（`/\<>:|?*\0`）が `/` を弾くため、ヒントを一律変更すると NoteEditor 利用者の `技術/AI` 入力が確実に保存失敗する。よって prop を条件付きでなく確定で導入し、true（ingestion）のみネスト意味・`/` ヒントを有効化、false（NoteEditor）は従来どおり単一名とする。

### Consequences
- 良い点: 共用コンポーネントの回帰を構造的に防ぐ。NoteEditor 側の単一名作成を完全に保護。
- トレードオフ: `DirectoryPicker` に条件分岐が1つ増える。
