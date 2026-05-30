# 実装計画 — Issue #182: handle queue visibility timeout risk in user.deleted fan-out (Issue #159 follow-up)

**Issue:** #182
**作成日:** 2026-05-30
**複雑度:** 中〜大規模（設計判断あり）

---

## 目的

`user.deleted` の fan-out（`publication.handleUserDeletedEvent` → `export.handleUserDeletedEvent` を dispatcher 内で逐次 await）が、公開ノート・in-flight export job の多いユーザーで累積ハンドラレイテンシがキューの処理上限を超え、メッセージが再配信されて重複 fan-out（冪等設計で副作用は安全だが非効率）を招くリスクに対処する。

## 調査で判明した重要事実（Issue 前提の是正）

Issue 本文は「Cloudflare Queues の visibility timeout ~5分」を前提とし、ミティゲーション候補2に「visibility timeout を増やす」を挙げるが、**push（Worker）consumer の実態はこれと異なる**（Cloudflare 公式ドキュメントで確認）:

1. **`visibility_timeout_ms` は push consumer に存在しない設定キー**。pull-based consumer 専用（そちらのデフォルトは 12 時間）。`[[queues.consumers]]`（push）の有効フィールドは `queue` / `max_batch_size` / `max_batch_timeout` / `max_retries` / `max_concurrency` / `retry_delay` / `dead_letter_queue` のみ。本プロジェクトの consumer は push なので、**候補2（visibility timeout を TOML で延ばす）は技術的に実行不可能**。
2. **push consumer に「処理中（mid-flight）の再配信」は存在しない**。バッチは consumer Worker invocation の上限内に完了するか、上限超過で失敗して再試行されるかのいずれか。Issue が恐れる「prior handler 完了前にメッセージが再エンキューされる」シナリオ自体が push consumer では発生しない。
3. push consumer invocation の上限: **wall-clock 最大 15 分** / **CPU 時間デフォルト 30 秒（`limits.cpu_ms` で最大 5 分=300000ms まで延長可、CPU 時間は I/O・ネットワーク待ちを除外）**。本リポジトリには `limits` ブロックが無く、CPU はデフォルト 30 秒。
4. バッチ内 1 件失敗時は全体再試行が基本だが、**`handleQueue`（`app/worker/cloudflare/handlers.ts`）は既に per-message `ack()` / `retry()` を行っている**。成功イベントは個別 ack 済みなので、後続イベントの失敗で巻き添え再配信されない。つまり「重い `user.deleted` が同一バッチの無関係イベントを道連れに重複処理させる」懸念は**既存コードで既に緩和済み**。残るのは invocation 自体が CPU/wall 上限超過で kill され、ack 未確定のまま全体再試行されるケースのみ。

→ 結論: Issue が想定したリスクの大半（mid-flight 再配信・道連れ重複）は push consumer では起きないか既に緩和済み。残存リスクは「heavy user の `user.deleted` 単体が 1 invocation の CPU 30 秒 / wall 15 分上限を超える」場合に限られる。そして CPU 30 秒上限に近づくか（CPU bound）/ wall 15 分上限に近づくか（I/O bound）は**実測しないと分からない**。

## スコープ

### 含まれるもの

- **候補4（モニタリング）の軽量実装** — `user.deleted` dispatch の fan-out 所要時間を構造化ログ（`durationMs`）で出力。残存リスク（CPU/wall 上限への近接）を実トラフィックで観測でき、将来の対処要否・対処手段（`limits.cpu_ms` 延長か、候補1/3 か）の定量的根拠になる。
- **ドキュメント / ADR の是正と記録** — push consumer の正確な再配信セマンティクス（`visibility_timeout_ms` 非対応、15分/30秒上限、per-message ack 済み）を docs に明記し、Issue 前提の誤りと判断経緯を ADR に残す。

### 含まれないもの

- **候補2（`visibility_timeout_ms` を TOML で設定）** — push consumer に存在しないキーのため技術的に不可能。実行しない。
- **`limits.cpu_ms` の延長 / `max_batch_size` の縮小** — 残存リスクが CPU bound か I/O bound か未測定の段階で値を変えても、binding な上限に効くか不明（fan-out は D1 I/O 主体なので CPU 上限が binding でない可能性が高い）。候補4のログで実測してから判断する事項として ADR に残す。
- **候補1（ハンドラ最適化: バッチ化 / 並列クエリ）** — 「1ノート=1UoW」「1ジョブ=1UoW」は #159 ADR-001/004 が冪等性＋部分失敗 retry の単純さを理由に意図的に選んだ設計。D1 は interactive tx 不可（`db.batch` のみ）でバッチ化は UoW 境界・イベント収集の再設計を伴い、並列化は OCC・部分失敗 retry を複雑化させる。実測根拠なしの着手は過剰実装。
- **候補3（fan-out を別 queued event に分解）** — 新イベント型・relay/consumer routing・順序保証の再担保が必要で、ADR-004 の論理順序の明快さと retry セマンティクスの読みやすさを犠牲にする。残存リスクが実測で確認されるまで時期尚早。再検討条件を ADR に記録。

## 実装ステップ

### 1. `user.deleted` dispatch の所要時間を計測してログ出力（候補4）

- **対象ファイル:** `app/core/application/workers/dispatchDomainEvent.ts`（297-313行の `user.deleted` case）
- **変更内容:** VO validation（`UserId.create`）の後・ハンドラ呼出の前に `container.clock.now()` で開始 `Date` を取得。publication / export 両ハンドラ完了後に `container.clock.now()` を再取得し `end.getTime() - start.getTime()` で経過 ms を算出。`container.logger.info("[dispatch] user.deleted fan-out complete", { eventId: event.id, userId: payload.userId, durationMs })` を出力。
- **理由:** 候補4の軽量実装。残存リスク（CPU/wall 上限への近接）を実測でき、将来判断の根拠になる。clock/logger とも既存 port（`ConsumerContainer` の `SharedDeps`）経由なので決定的・テスタブル。
- **注意:** VO validation は #159 ADR-005 通り計測区間の前に置く（validation 失敗を所要時間に含めない／`UserId.create` の `BusinessRuleError` は計測開始前なので durationMs ログに到達しない）。`durationMs` は `Date` 同士の `.getTime()` 差分で算出（型安全のため明示）。

### 2. テストの追加と既存テストの維持

- **対象ファイル:** `app/core/application/workers/__tests__/dispatchDomainEvent.test.ts`
- **変更内容:**
  - **`makeStubContainer`（160-191行付近）に `clock` を追加する** — 現状 stub は `clock` を持たず、ステップ1で `container.clock.now()` を呼ぶと `user.deleted` の既存テストが実行時 `TypeError` で全滅する。`now()` を呼ぶたびに進む fake clock（例: 呼び出しカウンタで 1回目→固定起点、2回目→起点+NN ms）を仕込み、`durationMs` が 0 以外で検証できるようにする。
  - 既存3ケース（routing 順序 / partial failure×2 / BusinessRuleError）が green のままであることを確認。
  - 新規1ケース: fan-out 完了時に `logger.info` が `durationMs`（number, > 0）と `userId` を含む meta で呼ばれることを検証。ログメッセージ文字列まで厳密一致させるかは `durationMs` キーの存在・型検証に留め、文言変更で脆くならないようにする（既存の `info` 回数 assert ケースと干渉しない設計）。
- **理由:** clock 利用追加が既存テストを壊さないことを保証し、計測ログがリグレッションで消えないことを担保する。

### 3. ドキュメント / ADR の是正・記録

- **対象ファイル:** `docs/runtime_cloudflare.md`（「Queues」節）、`.issue/182/adr.md`（改訂）
- **変更内容:**
  - docs の「Queues」節に、push consumer の正確な再配信セマンティクスを追記: `visibility_timeout_ms` は pull consumer 専用で push には適用されない / push の上限は wall-clock 15分・CPU 30秒（`limits.cpu_ms` で最大5分まで延長可）/ `handleQueue` は per-message ack 済みで部分失敗の道連れ再配信を防ぐ / `user.deleted` fan-out の所要時間は `durationMs` 構造化ログで観測する。
  - `.issue/182/adr.md` に (a) Issue 前提（visibility timeout ~5分）が push consumer では誤りである是正、(b) 候補1〜4の評価と「候補4軽量版のみ採用、候補2は技術的に不可能、候補1/3 と `limits.cpu_ms`/`max_batch_size` 調整は実測後の判断事項として deferred」、(c) 将来の対処を検討するトリガー条件を記録。
- **理由:** Issue #159 ADR-004 が本 Issue を follow-up として参照しているため、判断経緯を ADR として残すのがプロジェクト慣習。Issue 前提の誤りを是正し、将来の貢献者が無効な `visibility_timeout_ms` 設定を試みたり過剰実装に走るのを防ぐ。

## 設計判断

詳細は `.issue/182/adr.md` を参照。

- **本 Issue の対処は観測（候補4軽量版）に絞る** — Issue 前提のリスクの大半が push consumer では成立せず（mid-flight 再配信なし・道連れは per-message ack で緩和済み）、残存リスクが CPU bound か I/O bound か未測定であるため、まず実測する。
- **ログレベルは `info`** — 閾値近接の判定ロジックはコードに持たず（過剰実装回避）、`durationMs` を構造化 meta に出すに留め、アラート・集計は Cloudflare tail / Logpush の運用に委ねる。

## リスクと注意点

- **既存テストの破壊（最重要の実装注意）:** `makeStubContainer` が `clock` を持たないため、ステップ1の `container.clock.now()` 追加はステップ2の stub 改修とセットでなければ `user.deleted` 既存テストが全滅する。必ず同時に対応する。
- **fake clock の単調増加:** `durationMs > 0` を検証するには、`now()` が呼び出しごとに進む fake clock が必要（固定 stub だと差分0で検証が無意味になる）。
- **`limits` ブロック非存在:** 現状 CPU はデフォルト 30 秒。実測で CPU 上限近接が判明したら `limits.cpu_ms` 延長を別途検討（本 Issue スコープ外、ADR に deferred として記録）。

## テスト方針

- **ユニット（自動）:**
  - `dispatchDomainEvent.test.ts` の `user.deleted` 既存3ケースが green であることを確認（stub に clock 追加後）。
  - fake clock で `logger.info` が `durationMs`（number, > 0）と `userId` を含む meta で呼ばれる1ケースを追加。
- **実機/負荷（ユニット不可、testing.md 参照）:**
  - staging に多数の公開ノート＋多数の in-flight export job を持つテストユーザーを用意し `user.deleted` を発火 → consumer の tail ログで `durationMs` を観測。CPU 30秒 / wall 15分上限に対する余裕を実測し、将来の対処要否を判断する。
  - 重複再配信（`hasProcessed` skip ログ）が発生していないことを tail で確認。

## レビュー履歴

### 1周目
**修正した点（最重要の方針転換）**:
- アーキ・リスク視点 [P-001/P-002]: 当初の中核だった候補2（`visibility_timeout_ms` を TOML 設定）が、Cloudflare 公式ドキュメント確認の結果 **push consumer には存在しないキー（pull 専用）** と判明。計画全体を「候補4（fan-out 所要時間ログ）+ ドキュメント是正」に転換。Issue 前提（visibility timeout ~5分）の誤りも明文化。
- アーキ・リスク視点 [P-003]: `makeStubContainer` が `clock` を持たないため、`container.clock.now()` 追加は既存 user.deleted テストを全滅させる。ステップ2に stub への fake clock 追加を明記。
- 調査追記: push consumer の正確な上限（wall 15分 / CPU 30秒・`limits.cpu_ms` で最大5分）、`handleQueue` が既に per-message ack 済みで道連れ再配信を緩和している事実を反映。

**取り込んだ改善提案**:
- 要件視点 [S-001]: `durationMs` 算出は `.getTime()` 差分で型安全に。
- 要件視点 [S-002]: 新規テストはログ文言厳密一致ではなく `durationMs` キー存在・型で検証。

### 2周目
**両視点とも問題点ゼロで終了。**

取り込んだ改善提案:
- 要件視点 [S-001]: 将来の対処は別 Issue 起票で再評価する旨を ADR に明記。
- 要件視点 [S-002] / アーキ視点（暗黙）: `durationMs` は wall-clock 差分のため CPU bound 判定には `cpuTime` メトリクス併用が要る旨を ADR トリガー条件に補足。
- アーキ視点 [S-002]: fake clock は呼び出しごとに進む単調増加 stub（`let t = 0; { now: () => new Date((t += 1000)) }` 等）にする。
- アーキ視点 [S-004]: docs 244行の現状の誤記述（visibility timeout が `[[queues.consumers]]` に置けるとの記載）を是正対象として確認。
