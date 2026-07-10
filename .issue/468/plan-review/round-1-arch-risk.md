# Plan Review — Issue #468 / Round 1（アーキテクチャ・実現可能性・リスク視点）

レビュー対象: `.issue/468/plan.md` / `.issue/468/adr.md`
レビュー観点: あるべきアーキテクチャとの整合性・実現可能性・リスク・エッジケース・設計トレードオフ

## 事実確認の結果（計画の主張の裏取り）

計画の「調査結果」節の主張を実コードで検証した。すべて正確だった:

- **`purgeOrphans` 未配線**: `app/core/application/media/purgeOrphans.ts` の呼び出し元はテスト以外に存在しない（grep で確認）。`spec/usecases/media.md` の「Cron 起動」定義との乖離は実在する。
- **infra テンプレートのドリフト**: `infra/templates/wrangler.production.toml.tmpl` の `[env.pruner]`（L199-223）には `r2_buckets` / `R2_OBJECT_BUCKET_NAME` が無い。ローカル `wrangler.toml`（L262-315）には両方ある。DI（`serverCloudflare.ts` L379-387）は binding + presign secrets 3種 + `R2_OBJECT_BUCKET_NAME` の**全部揃い**を要求し、欠けると unavailable フォールバックになる — 計画のリスク記述どおり。
- **「R2 delete は already gone = success」**: `r2ObjectStorage.ts` の `delete` は `bucket.delete`（R2 は missing key で成功する冪等操作）を包み、`StorageUnavailableError` しか投げない。テストの `InMemoryObjectStorage.delete` も `Map.delete` で無害。put 失敗で「行だけ・blob なし」になっても回収経路が機能するという計画の主張は現行アダプターでは正しい（ただし S-003 参照）。
- **マイグレーション不要**: `idx_media_status_updated (status, updated_at)` は `0014_source_file_persistence.sql` で再作成済み。新クエリは status 等値 + updated_at 範囲でこのインデックスに乗り、`kind='source'` は残余フィルタになるが、pending 行の母集団は微小なので妥当。
- **`media.*` イベントは consumer でスキップ**: `dispatchDomainEvent.ts` L108-109 で確認。sweep 起点の `media.orphaned` の下流影響なしという分析は正しい。
- **secrets の実態**: `infra/src/secrets.ts` は「CI は単一ファイルを全 worker に bulk push、スペックはドキュメンテーション」（ADR-007 #110）。pruner を `[...shared, ...dispatchExtras]` に変えても secrets の union は不変で `checkSecrets.ts` を壊さない。計画の「bulk push の実態は変わらない」は正確。
- **`decrementRef(pending) → orphan`**: `entity.ts` L136-152 に「Intake abandoned without ever attaching」としてドキュメント込みで既存。新しい状態・遷移を増やさない判断は実体に即している。
- **`uploadMediaPresigned` JSDoc の誤り**: L28-29「the `PurgeOrphans` worker reclaims it」は実在する誤記（`findPurgeableOlderThan` は pending 非対象）。`spec/usecases/media.md` 側はこの誤った主張をしていないので、JSDoc のみ修正で整合が取れるという判断も正しい。

## アーキテクチャ整合性の評価

- **ドメイン内側から設計されている**: 「blob は誕生時点から必ず DB 行を持つ」という不変条件の回復を出発点に、既存の状態機械（`decrementRef(pending) → orphan`）をそのまま使い、新状態・新イベントを増やさない。回収ロジックの中核はエンティティに既にあり、猶予期間（cutoff 計算）は `MediaService.listAbandonedSourceIntakes` として `listPurgeCandidates` と対称にドメインサービスへ置く。アダプターは status/kind フィルタのみ。配置の判断はすべて CLAUDE.md の原則に沿っている。
- **依存方向の順で実装ステップが並んでいる**: ポート(1) → ドメインサービス(2) → アダプター(3) → ユースケース(4,5) → worker 配線(6) → infra(7) → E2E テスト(8) → spec(9)。正しい。
- **ポート最小性**: `ObjectStorage` に `list` を足さない判断（ADR-002）は、キーレイアウト `{ownerId}/{kind}/{id}`（`buildStorageKey` で確認 — source 共通プレフィックス無し）という実装事実に根拠があり、Issue 本文の「キー走査バッチ」提案を退ける理由が具体的。sweeper がグローバルなキー名前空間の知識を持たされる結合の指摘も的確。
- **worker パターンの踏襲**: `sweepAbandonedSourceIntakes` は `purgeOrphans` と同型（per-row try/catch、`{ swept, failed }`）、`runPruneTick` への追加は `purgeExpiredExports`（#783 ADR-005）の確立済みパターン（独立 try/catch + swallow + 戻り値契約不変）。CLAUDE.md「worker → root が唯一の broad catch」に合致。
- **過剰でも過少でもない**: TTL を「導入しない」と正式決定して ADR + spec に明文化する（実装ゼロ）のは Issue 課題1 の要求（「要否を決める」）に正確に応えており、opt-in TTL の実装まで踏み込まない線引きは適切。逆に `purgeOrphans` の配線と infra ドリフト解消は「回収機構が実際に動く」という AC の前提であり、スコープクリープではなく要件充足に必要な既存乖離の解消。kind='image'|'video' の stale pending を別 Issue に切る判断（ADR-004）も、誤回収リスク（編集中ドラフトの attach 待ち）という実害ベースで正当。

## エッジケースの検討状況

計画が拾えているもの: put 失敗（行だけ残る→sweep）、put 後クラッシュ、UoW ロールバック、同一 commit の再試行（新 mediaId で再 put、旧 pending は sweep）、猶予内の進行中 commit（AC-4）、orphan 化後の `updatedAt` 再スタンプによる二重猶予、`media.orphaned` の下流影響、pruner の unavailable objectStorage フォールバック。主要な異常系は網羅されている。

commit 冒頭の VO パース（`parseDirectoryPathToCreate` 等）が stage (a) より前にある現行構造により、transport-shape / VO 失敗では行も blob も作られない点も維持される（確認済み）。

---

#### 問題点（要修正）

問題点ゼロ。

（計画は Issue の2課題に正確に対応し、主張した既存コードの事実はすべて検証で裏付けられた。実装を阻害する欠陥・見落とされた依存関係は見つからなかった。）

#### 改善提案（検討推奨）

- **[S-001]** ステップ 8 の `purgeOrphans` の動作記述「age 0 → markDeleting、再実行で purge 完了」は実装と食い違う。
  - 理由: `purgeOrphans` は候補ごとに 1st UoW（markDeleting）→ 2nd UoW（purge）を**同一呼び出し内で**完走する（`purgeOrphans.ts` L57-101）。「再実行」が必要なのは前回 R2 失敗で `deleting` に stall した行の再開パスだけ。記述どおり2回呼ぶテストでも通る（2回目は no-op）が、実装者がこの記述から「1回目は markDeleting まで」という誤ったメンタルモデルでテストを書くと意図の読めないテストになる。また grace/age 0 でも候補条件は strict `<`（`updatedAt < cutoff`）なので、sweep と purge が同ミリ秒に走るとフレークしうる。
  - 提案: ステップ 8 の記述を「`purgeOrphans`（age 0）1回で markDeleting → purge が完了する」に正し、既存 `purgeOrphans.integration.test.ts` が使うクロックピン留め（`container.clock` 差し替え）/ `updatedAt` バックデートのヘルパーパターンをテスト方針に明記する。
- **[S-002]** ステップ 6 のテスト対象に `app/worker/cloudflare/__tests__/handlers.integration.test.ts` が挙がっていない。
  - 理由: 実 DB で `runPruneTick` を回す integration テストが同ディレクトリに存在する。新設2ステップは best-effort try/catch なので既存テストを壊す可能性は低い（objectStorage は unavailable フォールバック + 候補ゼロで no-op になるはず）が、tick のステップが増える変更である以上、この実DBテストへの影響確認（と可能なら sweep→purge のハッピーパス1本の追加）を計画に含めておくと確実。
  - 提案: ステップ 6 の対象ファイルに `handlers.integration.test.ts` を追記し、「既存が green であることの確認 + 必要なら実DB経路の追加」を明記する。
- **[S-003]** 「blob なし行」が purge 経路に定常流入するようになるため、`ObjectStorage.delete` の冪等性（missing key = 成功）をポート契約として明文化するとよい。
  - 理由: 計画の回収チェーンは「put 失敗で行だけ残る → sweep → purge」で、purge の `storage.delete` が存在しないキーに対して成功することに依存する。現行の R2 アダプターと InMemory フェイクはどちらも冪等だが、`MediaService.purge` の JSDoc は「`StorageNotFoundError` を含め伝播する」と書いており、delete が NotFound を投げるアダプターが将来書かれると blob なし行が `deleting` で永久 stall する。この暗黙の前提は #468 で初めて構造的に踏まれる。
  - 提案: ステップ 1 か 5 のついでに `objectStorage.ts` ポートの `delete` JSDoc に「missing key は成功として扱う（冪等）」を1行明記し、sweep の integration テストに「put 失敗相当（blob なし pending 行）→ sweep → purge 完了」の1ケースを足す（ステップ 8 は blob ありの経路のみ）。
- **[S-004]** ステップ 5 のテスト④「二重実行は冪等（既に orphan の行はスキップ）」は、記述どおりだと `findAbandonedSourceIntakes` の status フィルタ（=ステップ 3 で検証済み）を再確認するだけで、sweep 内の fresh `findById` → pending/source 再ガード（候補取得と per-row UoW の間の遷移に対する防御）を実質exercise しない。
  - 理由: orphan 行はそもそも候補クエリに載らないため、④はガード無しでも通ってしまう。ガードパスの実効的な検証は候補列挙と処理の間に行を変異させる注入が必要で、現行シグネチャでは難しい。
  - 提案: ④の意図を「クエリレベルの冪等性確認」と正直に書き直すか、ガードパスは unit レベル（repo フェイクで候補返却後に状態を変える）で1本カバーする。防御コード自体は `purgeOrphans` と同型で妥当なので、テストできない場合も防御は残すこと。

#### 良い点

- **不変条件ベースの設計転換**: Issue 本文が示唆したキー走査バッチ（対症療法）ではなく、「blob は誕生時点から必ず DB 行を持つ」という不変条件の回復（原因除去）を選び、その根拠をキーレイアウトの実事実・ポート最小性・誤削除リスクの構造的排除・`uploadMediaPresigned` との同型性の4点で具体的に示している。ADR-002 は模範的な品質。
- **既存ドメインモデルの活用**: `decrementRef(pending) → orphan` がエンティティに「intake 放棄」としてドキュメント済みであることを見つけ、新状態・新イベント・新遷移をゼロで済ませている。ドメインに置くべきロジックの漏出がない。
- **既存乖離の同時解消が要件に紐付いている**: `purgeOrphans` 未配線、infra テンプレートドリフト、`uploadMediaPresigned` JSDoc 誤記の3つの乖離を発見し、いずれも「直さないと AC が満たせない/嘘のドキュメントが残る」という必要性ベースでスコープに入れている（ついで修正の詰め込みではない）。特にテンプレート修正は #783 の export purge の本番動作も直す副次効果まで特定済み。
- **保持ポリシーの決定が原則的**: ADR-001 は「ユーザーデータの黙示的削除をしない」「参照グラフという単一の真実」を軸に据え、再検討トリガーと escape hatch（opt-in TTL + `aggregateByOwner` という判断材料）まで明記しており、"決めない" のではなく "導入しないと決める" になっている。
- **受け入れ基準 → ステップの対応表**があり、各 AC の検証手段（どのテストで実証するか）まで追跡可能。
- **リスク節が実装上の落とし穴を先回りしている**: read-modify-write 化への SystemError ガード必須、回収レイテンシ最悪約2日の許容判断、pruner コンテナの secrets 依存、デプロイ順序の帰結（過去分は回収されない）が明示されている。
