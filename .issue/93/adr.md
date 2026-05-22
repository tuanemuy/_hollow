# ADR — Issue #93: bulkRebuildFromSnapshots を呼ぶ admin operation / worker 経路の配線

## ADR-001: 配線は admin route + usecase + presentation（候補 A）を採用、ADR-002 の責務分担を確定

### Status
Proposed

### Context
`.issue/50/adr.md` ADR-002 の Consequences で、「`bulkRebuildFromSnapshots` を将来 production 経路に繋ぐ場合は本 ADR を再評価」と明示されていた。本 Issue でその再評価を行い、配線方針を確定する。

選択肢:
- **A**: admin route (`/admin/...`) + usecase + presentation
- **B**: pruner / consumer 系と並ぶ rebuild worker（cron）
- **C**: CLI / wrangler 経由

### Decision
**A**（admin route + usecase + presentation）を採用する。同時に、`.issue/50/adr.md` ADR-002 の決定（migration 内 `INSERT … SELECT FROM search_documents`）は **そのまま維持** する。両者は補完関係:

- **migration 内リビルド**: schema 変更時の決定的経路。host table `search_documents` の中身をそのまま FTS 索引に再投入する。host table 自体が壊れている時には機能しない。
- **admin operation リビルド（本 Issue 新設）**: upstream Note を source of truth として projection を再計算する整合性回復経路。host table が破損 / 古くなった場合の唯一の修復手段。

### B 不採用の理由
- rebuild は「schema 変更時」「索引破損時」にだけ走らせたい意図的な操作。cron 定期実行は contraindicate（書き込み増幅・無駄な負荷）
- "on demand" trigger を作るなら結局 Service Binding fetch endpoint = 隠れた admin endpoint で A と等価
- Worker 追加で `wrangler.*.toml` 4 ファイル更新、CI / Pulumi infra 更新、deployment script 増設と追加コストが大きい
- Cloudflare Worker の 15 min 上限は B のメリットだが、本 corpus 規模（数千ノート想定）では A の 30s で十分

### C 不採用の理由
- wrangler で TS コードを実行する経路は存在しない（`wrangler d1 execute` は SQL 専用）
- HTTP 経由で叩くなら結局 admin endpoint = A
- admin が SQL を直接書く運用は Issue 概要が「これ以外の経路を作りたい」と言っている動機そのもの
- 「port 契約を実配線する」という Issue の意図（port → adapter → usecase の通電）を満たさない

### A 採用の理由
- 既存 admin server-fn パターン（`requireAdminUser` + `loadServerDeps` + `errorResponseMiddleware`）にきれいに乗る
- admin UI に「最終 rebuild 時刻」「件数」を表示でき、`/admin/jobs` のジョブ監視と並列で運用情報になる
- cron 不要、wrangler 設定変更最小、スコープが本 Issue にぴったり収まる
- 30s 上限を超えた時の拡張余地（resumable rebuild）を残せる

### Consequences
- 良い点:
  - 既存パターンに完全準拠
  - infra 変更ゼロ
  - port → adapter → usecase → presentation の通電が完成
  - `.issue/50/adr.md` ADR-002 の deferred 判断を本 Issue で決着
- トレードオフ:
  - 30s CPU/wall time 上限 — 本 corpus サイズでは余裕。corpus 拡大時の段階的拡張は **`ctx.waitUntil` 越しに background 化 → さらなる拡大で resumable rebuild（cursor 永続化）** の 2 段階を想定。本 Issue ではどちらも実装しない
  - admin の手動操作が必要（自動修復ではない）— rebuild の性質上、意図的操作が正解
  - migration 内リビルドと運用経路リビルドの両方を維持するため、運用者が「どちらを使うか」の判断知識が必要 → spec/usecases/adminSettings.md と docs/runtime_cloudflare.md に「いつどちらを使うか」を 1 文で書く

---

## ADR-002: ページングサイズ独立定数 50 / per-page UoW / bulkRebuild 全体は UoW の外 / userRepository.listAll は cursor ベース

### Status
Proposed

### Context
`rebuildSearchIndex` ユースケースは大量の note を AsyncIterable で stream する必要がある。読み取りは複数の repository を跨ぐ（noteRepository, directoryRepository, tagRepository, publicationStateRepository）。`userRepository.listAll` の port シグネチャは `{ limit: number; cursor?: UserId }` で cursor ベース、`noteRepository.findByOwner` は offset ベースのページング。

選択肢:
- **A**: 認可 + 各ページ取得ごとに新しい UoW、`bulkRebuildFromSnapshots` 呼び出し全体は UoW の外
- **B**: 単一 UoW で全 note を一気に読む（generator 内では UoW を再利用）
- **C**: UoW を完全に使わず、container.deps から直接 repository を取り出す

### Decision
**A** を採用。`const REBUILD_PAGE_SIZE = 50;`（ノート / ページ）と `const REBUILD_USER_PAGE_SIZE = 50;`（ユーザー / ページ）を `SearchLimit` から **独立した定数**として usecase ファイル冒頭に宣言する。owner enumerator は port シグネチャに従い **cursor ベース**（最後の `user.id` を次の `cursor` に渡す）、per-owner notes はオフセットページング。

### B 不採用の理由
- D1 では UoW は `db.batch` 単発で flush するモデル（CLAUDE.md の D1 transactional model 記述参照）。open しっぱなしの UoW は概念的に成立しない
- 単一 UoW で全件読むと statement budget（D1 1 トランザクションあたり 1000 statements）に大規模 corpus で抵触する

### C 不採用の理由
- usecase が repository を UoW 外から直接触る pattern は HexArc 違反。`UnitOfWorkProvider.run` を経由するのが規約
- 認可とロジックで UoW の使い方が non-uniform になり、コードレビューでの予測可能性が下がる

### A 採用の理由
- 認可は `UnitOfWorkProvider.run` で `userRepository` を引き、`assertAdmin` を呼ぶ規約に従う
- 各ページの note + tags + directories + publication_states 読み込みも同一 UoW 内に閉じる（`REBUILD_PAGE_SIZE`=50 × ~4 repository ≒ 200 statements/UoW で D1 のトランザクションあたり 1000 statements に対し安全）
- `searchIndex.bulkRebuildFromSnapshots` は port 越しの単一呼び出しで、内部の DELETE + chunked INSERT は adapter の責務。usecase からは AsyncIterable を注ぐだけ
- `REBUILD_PAGE_SIZE` を `SearchLimit` から独立した定数にすることで、UI 側ページサイズ調整が rebuild 性能と coupled になる事故を避ける（偶然 50 で一致しても意味的に独立）

### Consequences
- 良い点:
  - 規約に完全準拠
  - D1 statement budget 内で安全
  - 拡張時のページサイズ調整が定数 1 つで済む（`SearchLimit` と独立）
  - cursor ベースの user 列挙は offset drift が起きない（port JSDoc の意図に従う）
- トレードオフ:
  - per-page UoW は overhead がページ数に比例。corpus 規模が桁違いに増えたら resumable rebuild に切り替える余地を残す
  - `REBUILD_PAGE_SIZE`=50 は経験則。実測で最適値が出た場合は調整

---

## ADR-003: rebuild 排他は採用しない（eventual consistency に任せる）

### Status
Proposed

### Context
`bulkRebuildFromSnapshots` 内部の最初の `DELETE FROM search_documents` 後、rebuild が完了する前に通常の `searchIndex.upsert` / `delete` が並走した場合、host table への書き込みが rebuild と混ざる可能性がある。同様に rebuild 自体が二重実行された場合も。

選択肢:
- **A**: モジュールレベル `let isRunning = false` で軽量排他
- **B**: instance_settings テーブルに `searchRebuildLockedAt` カラム追加で永続的排他
- **C**: container に `searchRebuildLock` port を立て、DI で in-memory 実装を provide
- **D**: 排他を行わない（idempotency に任せる）

### Decision
**D**（排他しない）を採用。

当初案では A を検討したが、レビューで次の問題が浮上し却下:
- モジュールレベル可変フラグは CLAUDE.md「application 層は stateless / pure functional を優先」に反する
- Vitest の module caching で同 isolate 内テストが互いに `isRunning` を汚染し、test isolation が壊れる
- throw 経路で `isRunning = false` のリセット漏れが発生すると以降のテスト/実行が全滅
- DI から差し替え不可で、test での fake injection ができない
- Cloudflare の複数 isolate を跨いで意味を持たない（best-effort 以下）

### B 不採用の理由
- DB スキーマ変更 + migration が必要で、本 Issue スコープを大きく超える
- rebuild は admin が稀に手動で叩く操作で、永続ロックのコストに見合わない

### C 不採用の理由
- port 追加は実装範囲が広がる
- 「lock を持つ唯一の port」のために port を新設するのは over-engineering

### D 採用の理由
- spec/domain/search.md の「index is a derived projection」「整合性は eventual」と整合
- `searchIndex.upsert` は `ON CONFLICT DO UPDATE` で idempotent、`delete` も冪等、`bulkRebuildFromSnapshots` 全体も「DELETE + INSERT」で複数回流しても最終状態が一意（最後の snapshot に収束）
- application 層が stateless でいられる（CLAUDE.md「prefer stateless, pure functional code」）
- test 間で state が漏れない、DI 差し替え不要
- 並走時の最悪ケースは「index が片方のスナップショットに一時的に偏る」だが、次の upsert / 次の rebuild で eventual に解消
- UI 側でボタン disable / ペンディング表示などの **クライアント側の多重押下防止** だけ行い、サーバー側は serialize しない

### Consequences
- 良い点:
  - application 層が完全に stateless
  - test isolation がクリーン
  - 実装が最小
  - rebuild 結果の冪等性が ADR 上 explicit になる
- トレードオフ:
  - 2 admin が同時に rebuild を叩いた場合の保証は無い（受け入れる）
  - クライアント側の多重押下防止 UX は presentation 層の責務
- 拡張余地: 完全排他が必要になったら専用 port または DB lock を別 Issue で導入

---

## ADR-004: ユースケースの所属先は adminSettings/（search/ ではなく）

### Status
Proposed

### Context
`rebuildSearchIndex` は search index を rebuild する操作だが、admin 専用 operation でもある。所属ディレクトリの選択肢:

- **A**: `app/core/application/adminSettings/rebuildSearchIndex.ts`
- **B**: `app/core/application/search/rebuildSearchIndex.ts`

### Decision
**A**（adminSettings/）を採用。

### B 不採用の理由
- 既存 search/ 配下のユースケース（`searchOwnNotes`, `consumeIndexJob` 等）は user-facing / worker-driven。admin operation を並べると性質が非対称
- `assertAdmin` 共有が冗長になる

### A 採用の理由
- spec/usecases/adminSettings.md が admin operation の集約地点
- `assertAdmin` の入口規約に自然に従える
- 関連の admin operations（`updatePromptTemplate`, `setRegistrationOpen` 等）と並んで配置することで、admin 運用者が「これは admin 操作」と一目でわかる

### Consequences
- 良い点: spec と実装が一致、admin operations が一箇所に集まる
- トレードオフ: 「search 関連の admin operation はどこにある？」を `adminSettings/` 配下まで辿る必要がある → spec/usecases/search.md の冒頭に相互参照を 1 行残す

---

## ADR-005: `buildNoteSnapshots` の directory 解決は `findById` + `DirectoryService.computePath` を per-id でキャッシュする

### Status
Accepted（実装時に確定）

### Context
plan.md の `buildNoteSnapshots` 依存リストに `directoryRepository.findByIds` を含めていたが、実装段階で `DirectoryRepository` ポートには `findByIds` が存在しないことが判明した（`spec/domains/directory.md` のポート定義にも該当メソッドは無い）。

選択肢:
- **A**: 既存ポートのまま、ヘルパ内で `directoryRepository.findById` を unique directoryId ごとに 1 回呼び、結果を `Map<DirectoryId, string>` にキャッシュ
- **B**: `DirectoryRepository` ポートに `findByIds` を追加（ドメイン契約変更）
- **C**: 呼び出し側で directory 解決済みの map を作って渡す（ヘルパ API 変更）

### Decision
**A** を採用。

### B 不採用の理由
- 本 Issue のスコープを越える（ドメイン契約の変更は別 Issue で検討すべき）
- 既存呼び出し側（getNoteDetail など）も同じパターン（`findById` + `DirectoryService.computePath`）を使っており、それと整合的

### C 不採用の理由
- ヘルパの責務が薄まり、呼び出し側に N+1 防止のロジックが漏れる
- 将来の再利用性が下がる

### A 採用の理由
- 既存ポート契約を変更せず追加コストゼロ
- `DirectoryService.computePath` は内部で `findAncestors` を呼ぶため、1 directoryId あたり 2 round-trip だが、page size 50 では実測 100 statements/UoW 程度に収まり ADR-002 の budget 試算（~200）内
- ノートが同じ directory に属する場合は Map cache でヒットするため、実効的なオーバーヘッドは更に小さい
- `findByIds` の追加が将来必要になれば、その時点でヘルパを差し替えれば良い

### Consequences
- 良い点: ドメイン契約変更なし、既存パターンと一貫
- トレードオフ: 厳密な意味での「N+1 防止」は directory 取得部分には適用されないが、`Map` キャッシュにより重複呼び出しはゼロ化されている

---

## ADR-006: `frontMatter['date']` の解釈は `Date` インスタンス / ISO 文字列 / epoch ミリ秒（finite な number）の 3 形式を受け入れる

### Status
Accepted（実装時に確定）

### Context
`Note.frontMatter` はドメイン側で `FrontMatterValue = string | number | boolean | string[] | nested object` として制約されている。`date` キーは慣習的なフィールドであり、ドメインでは値の意味を解釈しない。Search 側で `dateForCalendar` の fallback として使うため、`buildNoteSnapshot.parseFrontMatterDate` で `Date | null` に正規化する必要がある。

### Decision
受け入れる形式:
- `Date` インスタンス → `getTime()` が finite ならそのまま返す
- `string` → `new Date(value)` が finite な timestamp を返せば採用、それ以外は `null`
- `number` → finite かつ `new Date(value)` が finite なら採用（epoch ミリ秒として解釈）、それ以外は `null`
- それ以外（`null` / `undefined` / `boolean` / `array` / `object`） → `null`

`SearchDocument.fromSnapshot` は `frontMatterDate ?? updatedAt` のフォールバックを持つため、`null` は安全な「fallback 発火」シグナルとして機能する。

### Consequences
- 良い点: 不正値で例外が出ず、UI / 検索が degrade せずに動く
- トレードオフ: 「不正な date 値」を運用者に通知する仕組みは無い（surface するなら logger 経由が候補だが、本 Issue では実装しない）

---

## ADR-007: rebuild の `findByOwner` は `sort: 'createdAt', order: 'asc'` で固定化する

### Status
Accepted（review-001 を受けて確定）

### Context
当初実装は `noteRepository.findByOwner` を sort 未指定で呼んでおり、adapter の既定は `updatedAt desc`（`adapters/d1/repositories/noteRepository.ts:392,401-404`）。rebuild は秒〜分単位の長尺操作で、その間に Note の `save` が走ると `updatedAt` が移動し、offset ベース walk は同一行を 2 回 yield する／別行を skip する可能性がある。これは ADR-003 の "eventual consistency" 想定の範囲外（並走 upsert で index に重複 noteId が一時的に残ると `bulkRebuildFromSnapshots` 内部の chunked INSERT が PK 衝突を起こすリスクがある）。

選択肢:
- **A**: `findByOwner` 呼び出しで `{ sort: 'createdAt', order: 'asc' }` を明示し、immutable 列を offset 基準にする
- **B**: ID-cursor 化（user 列挙と同形）— port シグネチャ拡張が必要
- **C**: 既定のまま受け入れる（実害は稀）

### Decision
**A** を採用。

### B 不採用の理由
- `noteRepository.findByOwner` は現状 offset/limit ベースで、cursor 経路への切り替えは本 Issue スコープを越える
- `createdAt` で sort 固定するだけで実質的な安定性は得られる

### C 不採用の理由
- 並走 upsert は production で起きる現実的なシナリオで、PK 衝突は admin に "失敗した rebuild" として可視化される
- `sort` 明示は 2 行の変更で済むため、コスト < リスク

### A 採用の理由
- `createdAt` はドメイン契約上 immutable（spec/domains/note.md にも renumber / 書き換え経路は無い）
- 既存 port シグネチャ内で完結
- offset の意味が「createdAt 昇順 N 行目以降」に固定され、並走 upsert と完全に独立

### Consequences
- 良い点: 並走 upsert に対して offset walk が安定し、PK 衝突リスクが消える
- トレードオフ: rebuild 中に新規 INSERT された note は途中ページの末尾以降に新たに現れるため、`createdAt > 開始時刻` のものはその run でカバーされない可能性がある（次回 rebuild または event consume で同期される。eventual consistency の範疇）

