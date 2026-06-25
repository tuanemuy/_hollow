# レビュー round-1 — アーキテクチャ整合性・実現可能性・リスク (#615)

レビュアー視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク

## サマリー
- 問題点: 3 / 改善提案: 4
- 計画全体は内向き依存・レイヤー責務（device-parser=domain、projection=application、相対時刻=presentation）を正しく押さえており、#572 の段階導入方針とも整合する。geo 見送りの判断も妥当。
- ただし `recordActivity` を `getCurrentUser`（全認証リクエストの唯一経路、try/catch なし）に `await` 注入する設計に、**認証経路を巻き込む例外伝播リスク**が残っている。ここが最重要の要修正点。

---

#### 問題点（要修正）

- **[P-001]** `recordActivity` の失敗が `getCurrentUser` 経由で全認証リクエストを落とす（例外伝播・副作用の見落とし）
  - 理由: `app/lib/server/currentUser.ts` の `getCurrentUser` は `cache()` 内で `resolve` → `userRepository.findById` を呼ぶだけで **try/catch を持たない**。計画ステップ6は `resolve` 成功直後に `await container.sessionService.recordActivity(token)` を入れる。`recordActivity` は D1 `UPDATE` を行い `mapDbError` でラップされるため、D1 の一時障害やロック競合で `SystemError` を throw しうる。その場合、**セッション解決自体は成功しているのに**「最終アクセス時刻の更新」という付随的な書き込み失敗が `getCurrentUser` から伝播し、ページ全体（`requireCurrentUser` / `requireAdminUser` 含む）が落ちる。認証は読み取り成功で完結すべきで、活動時刻更新は best-effort であるべき。これは「最終アクセスを出す」というリッチ化のために**認証の可用性を下げる**回帰であり、リスク欄の「write-on-read の負荷」だけでは捉えきれていない副作用。
  - 提案: `recordActivity` を best-effort 化する。具体策は2つ:
    1. Cloudflare の `ExecutionContext.waitUntil` でレスポンス後にデタッチ実行する（`serverCloudflare.ts` に既に `waitUntil` ブリッジがある — L115-118 / L356 / L423）。ただし `waitUntil` を `getCurrentUser` 層まで通す配線が必要で、`getContainer()` 経由で `waitUntil` を取得できるか要確認。
    2. 配線が重いなら、最小限として `recordActivity` 呼び出しを `getCurrentUser` 内で `try/catch` し、失敗をログのみに留めて握り潰す（CLAUDE.md「broad try/catch は明示的境界のみ」だが、ここは「付随書き込みの partial-failure tolerance」という正当な境界に該当する旨を ADR-003 に明記する）。
    いずれにせよ「resolve は成功しているのに recordActivity 失敗で認証経路を落とさない」ことを設計判断として ADR-003 に追記すべき。現状の plan/ADR はこの分岐に無言。

- **[P-002]** `getCurrentUser` の `cache()` 内に副作用（書き込み）を持ち込むセマンティクスの逸脱
  - 理由: `getCurrentUser` の JSDoc は「one-line port access (sessionService + userRepository **read**) that does not need a usecase wrapper」と read-only を明示している。ここに `recordActivity` という**書き込み副作用**を `cache()` でメモ化された関数の中に入れると、(a) 関数の意味が read から read+write に変わり JSDoc と乖離する、(b) `cache()` は「同一リクエスト内で結果を共有する」ためのものであり、副作用の実行回数を保証する契約ではない（React の `cache` はメモ化であって at-most-once 副作用ランナーではない）。計画は「`cache()` でリクエスト単位1回」を負荷見積りの前提にしているが、これは `getCurrentUser` が同一リクエストで複数回呼ばれ初回だけ実体評価される、という現状の振る舞いに依存している。書き込み副作用の回数保証をメモ化に暗黙依存させるのは脆い。
  - 提案: 副作用を `getCurrentUser` の memoized body に直接埋めず、(a) `recordActivity` を冪等かつスロットル付き（ADR-003 の WHERE スロットル）にしてあるので「複数回呼ばれても害がない」ことを設計の主軸に据え、`cache()` の1回保証は best-effort の最適化として扱う、もしくは (b) 活動時刻更新を `getCurrentUser` 本体から切り出し、`requireCurrentUser` など「ページがユーザーを要求する」入口側で1回だけ明示的に呼ぶ形に整理する。少なくとも JSDoc を read+activity-touch に改訂し、副作用が入ることを明記する。P-001 と合わせて「どこで・何回・失敗時どうするか」を ADR に確定させること。

- **[P-003]** スロットル WHERE `updated_at < (now - THROTTLE_MS)` を D1/SQLite の式として成立させる具体方針が未定義（実現可能性）
  - 理由: 計画ステップ5は `UPDATE sessions SET updated_at = now WHERE token = ? AND updated_at < (now - ACTIVITY_THROTTLE_MS)` と書くが、既存スキーマでは `updated_at` は **ISO 8601 文字列**（`updatedAt: now.toISOString()` で挿入、`resolve`/`listForUser` も文字列比較 `gt(sessions.expiresAt, now.toISOString())`）。つまり「`updated_at`（文字列）から THROTTLE_MS を引いた値と比較」ではなく、**アプリ側で `cutoff = new Date(now - THROTTLE_MS).toISOString()` を計算し、`lt(sessions.updatedAt, cutoff)` で文字列比較する**形にしないと既存の時刻表現と一致しない。SQLite の `datetime()` 算術に頼るとミリ秒・TZ・フォーマットが既存挿入値とズレる危険がある。計画の擬似 SQL のままだと実装者が `datetime(updated_at, '-5 minutes')` 等に流れ、既存の `toISOString()` 値と非互換になりうる。
  - 提案: ステップ5の記述を「`cutoff` をアダプターで `clock.now()` から算出し、drizzle の `and(eq(sessions.token, token), lt(sessions.updatedAt, cutoff))` で更新。`now`/`cutoff` とも `toISOString()` 文字列で既存 `expiresAt`/`createdAt` 比較と統一する」と明確化する。`ACTIVITY_THROTTLE_MS` 定数の単位（ms）と、既存 `DEFAULT_SESSION_TTL_MS` と同じ adapter-local 定数スタイルにする旨も合わせて。

---

#### 改善提案（検討推奨）

- **[S-001]** `recordActivity` を「無条件 UPDATE のみ」にしてスロットル判定を read 由来にしない設計の確認
  - 理由: P-003 の WHERE スロットルは「直近更新済みなら 0 行 UPDATE で書き込みを抑える」狙いだが、D1 では条件付き UPDATE でも `WHERE` 評価のための行アクセスは発生する。書き込み課金/負荷の主因は実際の書き込み行数なので WHERE スロットルで十分効果はあるが、`resolve` が既に該当行を select 済みであることを踏まえると、`resolve` の戻りに `updatedAt` を含めて「スロットル超のときだけ `recordActivity` を呼ぶ」呼び出し側ガードも選択肢。ただし `ResolvedSession` 型を膨らませる副作用があるため、**現行の WHERE スロットル案のままで良い**と考えるが、ADR-003 に「呼び出し側ガードを採らず adapter WHERE に寄せた理由（port 型を汚さない）」を一行残すと判断が明確になる。

- **[S-002]** `DeviceInfo` 型の所有レイヤーと presentation への到達経路を ADR に明記
  - 理由: 計画は `SessionDTO.device: DeviceInfo` とし、`DeviceInfo` を domain（`deviceInfo.ts`）に定義する。presentation（`SecurityForm`）は `SessionDTO` 経由で `device` を受け取るので **domain 型を直接 import しない**（現状 presentation が domain から import しているのは `USERNAME_CHANGE_COOLDOWN_MS` のような定数のみ）。これは依存方向として正しい。ただし「DTO のフィールド型が domain 型をそのまま再利用してよいか（DTO は通常 application で完結する素の構造体）」は判断が要る。`Instant`（application の common）とは違い `DeviceInfo` は domain 由来の型を DTO に貫通させることになる。`kind`/`os`/`browser`/`label` はいずれもプリミティブで wire-safe なので問題ないが、ADR-001 に「`DeviceInfo` は domain 定義のまま DTO に載せる（再定義しない）。プリミティブのみで構成され presentation は DTO 経由でのみ参照するため依存方向を侵さない」と明記しておくと、後続の spec-sync/architecture-audit でのブレを防げる。

- **[S-003]** 実装ステップの依存順は概ね正しいが、テストステップの配置を内→外に揃える
  - 理由: ステップ順（1 domain → 2 dto → 4 port → 5 adapter → 6 lib → 7 presentation helper → 8 UI → 9 spec → 10 test）は依存方向として妥当。ただしステップ3（domain 単体テスト）が2の後、ステップ10（adapter/dto/frontend テスト）が末尾と分かれている。`deviceInfo` のテスト（3）は実装（1）直後で良いが、`toSessionDTO` の device projection テストは dto 実装（2）に紐づくのに10へ回っている。テスト容易性の観点では問題ないが、レビュー時の追跡性のため「各実装ステップにそのレイヤーのテストを併記」する構成（implement-* スキルの慣習）に寄せると、抜け漏れ検知が容易になる。必須ではない。

- **[S-004]** 「最終アクセス」ラベル文言とスロットル幅の不一致リスクへの UI 配慮
  - 理由: リスク欄が指摘するとおり、スロットル幅（例5分）内の活動は `updated_at` に反映されない。相対時刻表示なので実害は小さいが、`formatRelativeTime` のしきい値（「たった今」を何分まで出すか）を **スロットル幅以下に設定しない**と、「たった今活動したのに『5分前』」のような違和感が出る。逆にスロットル幅を相対表示の最小粒度（例「N分前」が分単位）より大きくしすぎると最終アクセスがガサつく。ADR-003/ADR-004 に「スロットル幅と relativeTime の最小粒度の関係（スロットル幅 ≤ 相対表示が無意味になる粒度）」を一文添えると、後で値を調整するときの指針になる。

---

#### 良い点
- device-parser をドメイン層の純粋関数として置き、外部ライブラリ依存を避け、判別不能を `null`（捏造しない）にする判断は CLAUDE.md の「純粋ロジック=domain / illegal states を型で表現 / 虚偽表示禁止」と完全に整合。ADR-001 のトレードオフ（網羅性 vs 捏造回避）も妥当。
- geo 見送り（ADR-002）の判断が秀逸。外部 API ポート追加 vs オフライン GeoIP DB の両案を運用負荷・privacy・Cloudflare バンドル制約まで具体的に評価し、「手元データのみで解決不能な唯一の要素」と切り分けて別 Issue 化している。スコープ管理として理想形を追い過ぎず、かつ #572 の段階導入方針とも一貫。
- projection を application（`toSessionDTO`）に集約し presentation は確定値のみ受け取る、相対時刻整形は presentation 層に置き `now` 注入で決定的にする、というレイヤー責務の割り当てが正確。
- `updated_at` 既存列の再利用でマイグレーション不要・port 追加は冪等1メソッドのみ、という最小侵襲設計。`SessionService` 実装が `D1SessionService` 単一で fake/stub 無し（real D1 テスト基盤）なので port 拡張の型波及が無いという既存実装の把握も正確。
- 受け入れ基準（AC-1〜AC-7）が検証可能な形で書かれ、各ステップへトレースされている。AC-6（geo は出さない=虚偽回避）を明示的な受け入れ基準にしている点が原則を体現している。
