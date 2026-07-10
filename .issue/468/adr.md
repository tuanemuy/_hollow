# ADR — Issue #468: ソースファイルのストレージ衛生: 保持期間ポリシー(TTL)と孤児blobの回収

## ADR-001: 時間ベース TTL は導入せず、「Note ライフサイクル連動」を source の正式な保持ポリシーとする

### Status
Proposed

### Context
Issue 課題1 は「TTL の要否・対象・猶予期間」の決定を求めている。選択肢:

1. **時間ベース TTL**（例: commit から N 日で source を自動削除）
2. **admin instance setting による opt-in TTL**（デフォルト無期限、運用者が期限を設定可能）
3. **TTL なし** — 保持は Note のライフサイクルに連動（現行実装の明文化）

source は #452 で「取り込んだノートの元ファイルを閲覧/ダウンロードできる」という受け入れ条件のために永続保存されたユーザーデータの原本であり、Note と `notes.source_file_id` で 1:1 に紐付く。

### Decision
**3 を採用する。** 保持ポリシーを次のとおり正式化し `spec/domains/media.md` に明文化する:

- **対象**: `MediaAsset(kind='source')` 全件。
- **保持**: 参照元 Note が存在する限り無期限保持。生存中の Note の source を時間経過で消すことは、#452 の受け入れ条件（閲覧/DL）を運用側の都合で破壊することになり、ユーザーデータの黙示的削除でもあるため行わない。
- **回収**: 参照が外れた時点で `decrementRef` により orphan 化し、標準 purge 機構が回収する。参照が外れる契機は (a) overwrite commit での差し替え、(b) note purge（`handleNotePurgedEvent`）、(c) commit 不成立で放棄された intake（本 Issue の ADR-002 で新設）。trash 中は Note が復元可能なため保持する（#452 ADR-005 踏襲）。
- **猶予期間**: orphan → purge は既存の 24h、intake 放棄 → orphan も 24h（ADR-002）。
- **再検討トリガー**: 運用でストレージコストが顕在化した場合、opt-in の admin instance setting（選択肢 2）として別 Issue で設計する。per-owner の使用量は `MediaAssetRepository.aggregateByOwner` で既に観測可能であり、判断材料は揃っている。

### Consequences
- 良い点: ユーザーデータを黙って消さない。#452 の機能を破壊しない。ポリシーが「参照グラフ」という単一の真実に基づき、時刻ベースの例外規則が増えない。実装コストはドキュメントのみ。
- トレードオフ: 生存 Note の source によるストレージ消費は単調増加のまま（1 note あたり上限はアップロード上限で拘束される）。コスト顕在化時には追加設計が必要だが、その escape hatch（opt-in TTL）と判断材料（aggregateByOwner）を明記して備える。

---

## ADR-002: 孤児 blob 対策はキー走査バッチではなく「metadata-first + abandoned-intake sweep」（DB 駆動）で行う

### Status
Proposed

### Context
commit のステージ (a)（UoW 前の `objectStorage.put`）成功後に UoW がロールバックすると、`MediaAsset` 行を持たない source blob が残り、`status IN ('orphan','deleting')` を対象とする purge 機構では回収できない。選択肢:

1. **キー走査バッチ**（Issue 本文の提案）: `ObjectStorage` ポートに `list(prefix, cursor)` を追加し、`{ownerId}/source/{mediaId}` キーを走査して対応する `MediaAsset` 行が無い blob を削除する。
2. **metadata-first + sweep**: commit ステージ (a) で put の**前に** `pending` 行を独立 UoW で永続化し、「blob は誕生時点から必ず DB 行を持つ」不変条件を回復する。放棄された `pending(kind='source')` 行は猶予期間後に sweep が `decrementRef` で orphan 化し、既存 purge 機構に回収を一本化する。

### Decision
**2 を採用する。** 理由:

- **キーレイアウトが走査に向かない**: キーは `{ownerId}/source/{mediaId}` で source 共通のプレフィックスが無い。走査するにはバケット全走査（media / avatar / export artifact など全機能のキー命名への結合が生じる）か、全ユーザー列挙 × per-owner prefix list が必要になり、sweeper がグローバルなキー名前空間の知識を持ってしまう。
- **ポート最小性**: `ObjectStorage` に回収のためだけの `list` を足すより、既存の状態機械（`decrementRef(pending) → orphan`、エンティティに「Abandoning a pending intake」として既にドキュメント済み）を使う方がドメイン設計に沿う。
- **誤削除リスクの構造的排除**: キー走査は「put 直後・UoW commit 前」の in-flight blob を誤検知しうるため blob の `uploadedAt` に基づく猶予が別途必要になる。DB 駆動なら猶予は行の `updatedAt` で一元管理でき、orphan 猶予（24h）と合わせて二重の猶予が入る。
- **`uploadMediaPresigned` と同型**: 「行が先・bytes が後」は presigned upload フローの既存パターンであり、新規性が低い。

メイン UoW 側は `MediaAsset.create + markAttached` から `findById → isPending ガード → markAttached` に変わる。put 失敗時は行だけが残るが、purge の R2 delete は「already gone = success」なので回収経路はそのまま機能する。

**`ObjectStorage.delete` の冪等性をポート契約として固定する**: 本設計により「blob なし `pending` 行」が purge 経路へ定常的に流入するため、`delete` が missing key を成功として扱うこと（現行の R2 アダプター / InMemory フェイクの挙動であり、ポート JSDoc にも既に記載）は本 ADR の回収チェーンが構造的に依存する契約となる。missing key で `StorageNotFoundError` を投げるアダプターが将来書かれると blob なし行が `deleting` で永久 stall するため、JSDoc を依存関係込みで補強し、blob なし行 → sweep → purge 完走の integration テストで契約を検証する（レビュー arch-risk S-003）。

**採用しないことによる残余**: 本修正のデプロイ以前に漏れた blob（#452 マージ以降の commit DB 失敗のみ。発生確率は極小）は自動回収されない。必要になった場合の手動リコンサイル手順を運用ノートとして残す: `wrangler r2 object` / S3 API で `*/source/*` キーを列挙し、`media_assets.storage_key` に存在しないキーを突合して削除する（一回限りの運用作業であり、恒常機構としては持たない）。

### Consequences
- 良い点: 「行なし blob」という不可視状態が構造的に発生しなくなる。回収は既存の purge 機構に一本化され、新しい削除経路が増えない。ポートは不変。
- トレードオフ: commit に小さな UoW が 1 つ増える（低頻度操作なので許容）。過去に漏れた blob は自動回収されない（上記の手動手順で補完）。commit 失敗を放置するたびに pending 行 + blob が 1 組残るが、sweep が定期回収する。

---

## ADR-003: 回収バッチは新規 worker を立てず既存 pruner tick に組み込み、未配線だった `purgeOrphans` もここで配線する

### Status
Proposed

### Context
調査の結果、`purgeOrphans` ユースケースは実装・テスト済みで `spec/usecases/media.md` にも「Cron 起動」と定義されているにもかかわらず、**どの entry point からも呼ばれていない**ことが判明した。#452 ADR-005 の「orphan 化して標準 purge worker に回収させる」も、本 Issue の回収チェーン（sweep → orphan → purge）も、この配線がなければ動かない。起動方法の選択肢:

1. **専用 cron worker を新設**（`[env.media-gc]` 等）
2. **既存 pruner tick（日次 03:00 UTC）へ組み込み**

### Decision
**2 を採用する。** `runPruneTick` は既に `purgeExpiredExports` を `createRequestContainer`（UoW + objectStorage を持つ）で best-effort 実行する前例（#783 ADR-005）を持ち、「独立した try/catch を並べ、失敗は swallow + ログ、戻り値契約は不変」というパターンが確立している。`sweepAbandonedSourceIntakes` → `purgeOrphans` の順で同パターンに追加する。

- **頻度**: 日次で十分。回収対象は稀な異常系の残骸であり、猶予期間（24h）より短い周期で回しても意味がない。worker を増やすと wrangler env・デプロイ・secrets 配布の面積が増えるだけで利点がない。
- **前提となるインフラ修正**: production/staging テンプレートの pruner には `OBJECT_STORAGE` binding / `R2_OBJECT_BUCKET_NAME` が無い（#783 由来のドリフト。ローカル `wrangler.toml` には有る）。これを追加しないと本番の purge は unavailable objectStorage で空振りする。R2 presign secrets は CI の bulk push で全 worker に配布済みのため追加作業は不要だが、`infra/src/secrets.ts` の仕様記述を実態（pruner が消費する）に合わせる。

### Consequences
- 良い点: `purgeOrphans` が spec どおり Cron 起動になる（既存乖離の解消）。#783 の export purge の本番動作も同時に直る。デプロイ面積が増えない。
- トレードオフ: pruner tick のステップ数がさらに増える（確立済みパターンの反復なので複雑度の増加は限定的）。回収レイテンシは最悪 約2日（sweep 猶予 24h + orphan 猶予 24h）だが、衛生バッチとして問題ない。

---

## ADR-004: sweep の対象は `pending` かつ `kind='source'` に限定する

### Status
Proposed

### Context
stale な `pending` 行は source 以外にも存在しうる（`uploadMedia` / `uploadMediaPresigned` で作られ attach されないまま放置された image / video）。sweep を pending 全般に広げれば `uploadMediaPresigned` の JSDoc が主張する「pending も PurgeOrphans が回収する」を実態にできるが、image / video の pending は**編集中のエディタで正当に attach 待ち**の可能性があり、「古い pending = 放棄」という推定が成り立たない（長期間開かれたドラフトの画像を誤回収し、保存時に参照切れを起こすリスク）。

一方 source の pending は commit リクエスト内で数秒後に attach されるため、猶予（24h）を超えて pending のままの source は放棄と断定できる。

### Decision
sweep（ポートメソッド `findAbandonedSourceIntakes` を含む）は `kind='source'` に限定し、対象の限定をメソッド名で表明する。image / video の stale pending の扱いは、放棄判定の基準（エディタのドラフト寿命との整合）という別の設計問題を含むため本 Issue のスコープ外とし、`uploadMediaPresigned` の誤った JSDoc は実態に合わせて修正するに留める。

### Consequences
- 良い点: 「古い pending = 放棄」が常に真である集合だけを対象にし、誤回収リスクをゼロにする。Issue スコープ（source のストレージ衛生）に正確に収まる。
- トレードオフ: image / video の放置 pending 行（blob 含む）は引き続き残る（既存の許容の継続）。将来対応する場合はポートメソッドの追加または一般化が必要。

---

## 実装時の追加決定

### 決定: `SourcePersist` の受け渡しを `mediaId` のみに縮小する

#### コンテキスト
metadata-first 化以前は、ステージ (a) が `mediaId / storageKey / mimeType / byteSize / originalFileName` を main UoW に渡し、main UoW 側で `MediaAsset.create` していた。#468 で `create` がステージ (a) の小 UoW に移動し、main UoW は `findById → isPending ガード → markAttached` になった。

#### 決定内容
ステージ (a) → main UoW のハンドオフ型 `SourcePersist` を `{ mediaId }` のみに縮小した。

#### 理由
main UoW は永続化済みの行を id で再読するため、メタデータのフィールドを二重に運ぶと「行の値と projection の値のどちらが真か」という不要な曖昧さが生まれる。真実は DB 行に一本化する。

### 決定: sweep の per-row 失敗分離テストは unit（フェイク repo の失敗注入）で担保する

#### コンテキスト
計画のテスト方針は sweep の integration テスト項目に「per-row 失敗分離」を挙げていた。しかし実 D1 経路では特定行の `save` だけを失敗させる注入点がなく、実現するにはアダプター内部への spy など経路をねじ曲げる手段が必要になる。

#### 決定内容
per-row 失敗分離（1 行の save 失敗 → failed 計上 + ログ、他の行は続行）は `sweepAbandonedSourceIntakes.test.ts`（unit）で、`failSaveIds` を持つフェイク repo により検証する。integration は計画どおり orphan 化・猶予・kind 限定・クエリレベル冪等・purge 接続・blob なし行の purge 完走をカバーする。

#### 理由
fresh `findById` ガードと同様、「候補列挙後の状態変化」「特定行の書き込み失敗」は integration の実 DB 経路では作為なしに再現できない。挙動の所在（アプリ層のオーケストレーションループ）に対して unit のフェイク注入が最も直接的な検証手段であり、`purgeOrphans` の既存テスト分担（storage 失敗は ThrowingObjectStorage で integration、と分けている）とも整合する。

### 決定: prune tick の実DB ハッピーパスは「2 tick + updatedAt バックデート」で検証する

#### コンテキスト
計画ステップ 6 は `handlers.integration.test.ts` に「tick 経由の sweep → purge ハッピーパス1本」を求めるが、tick はオプション上書きなしのデフォルト猶予（sweep 24h / orphan 24h）で走り、コンテナのクロックも SystemClock のため注入できない。1 tick では sweep と purge の両方を通過できない。

#### 決定内容
1 本のテスト内で tick を 2 回実行する: tick 1 で 25h 前の pending/source が orphan 化されることを assert し、orphan の再スタンプされた `updatedAt` を DB 直接 UPDATE でバックデートしてから tick 2 で blob + 行の削除を assert する。

#### 理由
プロダクションコードにテスト用のオプション貫通（tick への猶予上書き引数）を追加せずに、container → adapter → D1/R2 の配線を実経路で検証できる。バックデートは「時間経過」の代替として既存テスト群（purgeOrphans integration のクロックピン留めと同種）で確立された手法。
