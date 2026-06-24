# ADR — Issue #615: P22 セッション一覧の表示リッチ化

## ADR-001: device-parser は外部ライブラリを使わず純粋ドメインサービスとして自前実装する

### Status
Proposed

### Context
`userAgent` から OS / ブラウザ / デバイス種別を解析する処理が必要。選択肢は (a) `ua-parser-js` 等の既存ライブラリ採用、(b) 自前の限定パーサ。また置き場所として (i) ドメイン層、(ii) application projection、(iii) presentation のいずれか。device-parser は I/O・ambient time・乱数を伴わない純粋な文字列解析であり、CLAUDE.md は「純粋ロジックはドメイン、DTO projection は application」と定める。

### Decision
- **置き場所はドメイン層**（`app/core/domain/identity/services/deviceInfo.ts`）の純粋関数 `parseDeviceInfo`。projection（`toSessionDTO`）から呼び出し、結果を `SessionDTO.device` に載せる。
- **外部ライブラリは採用せず自前の限定パーサ**にする。主要トークン（macOS / Windows / iOS / iPadOS / Android / Linux、Chrome / Safari / Firefox / Edge）と種別（mobile / tablet / desktop / unknown）のみ判定し、バージョン番号や網羅的な端末名は追わない。判別不能フィールドは `null`、`label` は os+browser が揃ったときだけ合成する。

- **`DeviceInfo` 型の所有と DTO への貫通**: `DeviceInfo` は domain（`deviceInfo.ts`）に定義し、`SessionDTO.device` はその型を**再定義せずそのまま載せる**。`kind`/`os`/`browser`/`label` はいずれもプリミティブで wire-safe であり、presentation（`SecurityForm`）は domain 型を直接 import せず `SessionDTO` 経由でのみ参照する。したがって domain 型を DTO に貫通させても内向き依存方向（presentation→application→domain）を侵さない。

### Consequences
- 良い点: ドメイン層が外部ライブラリ依存を持たず純粋・テスト容易。バンドルサイズ増なし。判別不能を null にすることで虚偽表示禁止を型・実装で担保。`DeviceInfo` をプリミティブのみで構成し DTO に再定義しないことで重複型を増やさず、依存方向も保たれる。
- トレードオフ: 網羅性はライブラリに劣る（新ブラウザ/レア端末は unknown）。だが捏造禁止原則上、不正確に埋めるより unknown のほうが正しい。将来網羅性が必要なら projection 内部の実装差し替えで対応でき、port/DTO 形は不変。

---

## ADR-002: 地名（geo）解決は本 Issue では見送り、別 Issue に切り出す

### Status
Proposed

### Context
モックは `ipAddress` から地域名（「京都 / 日本」等）を表示するが、IP→地名の解決は手元データだけでは不可能で、いずれかの外部依存が要る:
1. **外部 geo API**: presentation→application→新ポート→新アダプターのフルスタック追加。ネットワーク I/O・レート制限・障害時フォールバック・privacy（IP を外部送信）・コストを伴う。
2. **オフライン GeoIP DB**（MaxMind GeoLite2 等）: ~数十 MB のバイナリ + ライセンス同意 + 定期更新運用 + Cloudflare Workers のバンドル/メモリ制約。

device-parser（UA 文字列のみ）・最終アクセス（`updated_at` 列）と異なり、geo は**自己完結データで解決できない唯一の要素**。不正確な geo を出せば虚偽表示禁止原則に反し、正確に出すには本 Issue の「表示リッチ化」に不釣り合いな外部依存・運用負荷が発生する。

### Decision
本 Issue では geo を実装しない。UI は #572 の「IP 素出し（localhost は null で非表示）」を据え置く。geo は外部依存（API ポート追加 or オフライン DB 導入）の設計判断を要する独立タスクとして別 Issue に切り出す。spec / plan に「未実装＝虚偽回避のため意図的に表示しない」ことを記録する。

### Consequences
- 良い点: 外部依存・privacy・運用負荷を本 Issue に持ち込まない。捏造地名のリスクを回避。device-parser / 最終アクセスの確実に実装できる部分を先に届けられる（#572 の段階導入方針と整合）。
- トレードオフ: モックの地名表示は未達のまま。別 Issue 化が必要。表示は IP のみで素朴さが残る。

---

## ADR-003: updatedAt 更新は port `recordActivity` + adapter スロットルで実現し、専用列・イベント駆動を導入しない

### Status
Proposed

### Context
「最終アクセス」を実データ化するには `sessions.updatedAt` を活動ごとに進める経路が要る。現状 `updatedAt` は `issue` 時のみ設定され `resolve` は触れない（#572 ADR-002）。選択肢:
1. **resolve 経路で `updated_at` を更新**（`getCurrentUser` が `resolve` を呼ぶ唯一の認証経路）。
2. 専用の `last_active_at` 列を追加してマイグレーション。
3. ドメインイベント / outbox で非同期に更新。

また 1 は全認証リクエストで書き込みが走るため、D1 書き込み負荷の懸念がある。

### Decision
- 既存 `updated_at` 列を最終アクセス時刻として使い、**専用列・マイグレーションは追加しない**。
- port に冪等な `recordActivity(token)` を追加し、`getCurrentUser`（`cache()` でリクエスト単位 1 回）の `resolve` 成功直後に呼ぶ。
- **adapter 側で WHERE スロットル**: 既存スキーマは `updated_at` を **ISO 8601 文字列**で保存している（`issue` が `now.toISOString()` で挿入、`resolve`/`listForUser` も `gt(expiresAt, now.toISOString())` の文字列比較）。よって SQLite の `datetime()` 算術には頼らず、アダプター内で `cutoff = new Date(clock.now().getTime() - ACTIVITY_THROTTLE_MS).toISOString()` を算出し、`UPDATE sessions SET updated_at = now.toISOString() WHERE token = ? AND updated_at < cutoff`（drizzle: `and(eq(sessions.token, token), lt(sessions.updatedAt, cutoff))`）で更新する。直近更新済み（`updated_at >= cutoff`）なら 0 行更新となり実書き込みを間引く。`ACTIVITY_THROTTLE_MS`（ms 単位、例 5 分）は既存 `DEFAULT_SESSION_TTL_MS` と同じ adapter ローカル定数スタイル。
- **スロットルは adapter WHERE に寄せ、呼び出し側ガードは採らない**: `resolve` の戻り（`ResolvedSession`）に `updatedAt` を含めて「スロットル超のときだけ呼ぶ」呼び出し側判定も選択肢だが、port 型（`ResolvedSession`）を表示都合で膨らませることになる。port 型を汚さず判定を adapter に閉じるため WHERE スロットルを採用する。
- **best-effort（P-001）**: `recordActivity` は認証成否に影響しない付随書き込みである。`getCurrentUser` は現状 try/catch を持たない読み取り専用ヘルパーで、`recordActivity` の D1 一時障害・ロック競合は `mapDbError` 経由で `SystemError` を throw しうる。`resolve` は既に成功＝認証は完結しているのに、活動時刻更新の失敗が認証経路（`requireCurrentUser`/`requireAdminUser` 含む全ページ）を落とすのは可用性の回帰。そこで `getCurrentUser` 内で **`recordActivity` 呼び出しのみを限定的に `try/catch` で囲み、失敗はログのみに留めて握り潰す**。これは CLAUDE.md「broad try/catch は明示的境界のみ」に反しない「付随書き込みの partial-failure tolerance」という正当な境界。
  - **握り潰しログはポート越し（S-002）**: 失敗時のログは `console.*` 直書きでなく、`getCurrentUser` が既に保持する `container.logger`（`SharedDeps.logger: Logger` — `app/core/application/di/types.ts` L102 で公開、`serverCloudflare.ts` で `ConsoleLogger` を注入）の `logger.warn(...)` を使う。CLAUDE.md「cross-cutting（logging）はポート越し」原則に従い、ログ手段を注入済みポートに統一する（新規配線は不要）。
  - **UoW 外で呼ぶ（S-001）**: `recordActivity` は `resolve` 同様 `unitOfWorkProvider.run`（findById 用の read-only callback）の**外側**で呼ぶ。セッションはアグリゲート外・UoW 対象外であり、付随書き込みを findById のトランザクションに紛れ込ませない。`sessionService` は port/adapter 設計上 UoW の外で binding に直接実行される。
- **read+activity-touch セマンティクス（P-002）**: `getCurrentUser` の JSDoc を read-only から「read + best-effort activity-touch」へ改訂し副作用を明記する。`recordActivity` を冪等かつ WHERE スロットル付きにすることで「同一リクエストで複数回呼ばれても害がない」ことを設計の主軸に据え、`cache()` のリクエスト単位 1 回は**負荷見積りの前提ではなく best-effort の最適化**として扱う（React の `cache` はメモ化であって at-most-once 副作用ランナーではなく、副作用回数の保証をメモ化に暗黙依存させない）。
- **スロットル幅と相対表示の整合（S-004）**: スロットル幅（`ACTIVITY_THROTTLE_MS`）は `formatRelativeTime` の「たった今」上限粒度以下に収める（スロットル幅 ≤ 吸収粒度）。これで「たった今活動したのに『N 分前』」という違和感を避ける（詳細は ADR-004）。
- イベント駆動は採用しない（最終アクセスは強整合・即時性を要さず、outbox を挟むのは過剰）。

### Consequences
- 良い点: マイグレーション不要。`updated_at` のセマンティクスが「最終アクセス」に自然に一致。文字列 `cutoff` 比較で既存の時刻表現（`expiresAt`/`createdAt`）と統一でき非互換を避けられる。スロットルで書き込み負荷を抑制。更新ロジックが adapter に閉じ、port は冪等な 1 メソッド追加のみ。best-effort 化で認証可用性を下げない。
- トレードオフ: スロットル幅内の活動は反映されないため「最終アクセス」は厳密値でなく近似（相対時刻表示なので実害小）。`updated_at` を「行の最終保存」一般ではなく「セッション活動」専用の意味で使うことを spec/JSDoc に明記する必要がある。write-on-read を全認証リクエストに導入する（スロットルで緩和）。`getCurrentUser` が read-only でなく付随副作用を持つことを JSDoc で明示する必要がある。

---

## ADR-004: 相対時刻ヘルパーは presentation 層に新規追加し now 注入で決定的にする

### Status
Proposed

### Context
モックは「たった今 / 2時間前 / 3日前 / 2026年5月8日」のような相対時刻を表示する。コードベースに相対時刻整形の共有ヘルパーは存在せず、各所が `toLocaleString` を直書きしている。`Intl.RelativeTimeFormat` を使うか自前整形かの選択、および配置層・テスト容易性が論点。

### Decision
- `app/components/common/relativeTime.ts` に `formatRelativeTime(instant: string, now?: Date): string` を新規追加（**presentation 層**: 表示整形は presentation の責務）。
- たった今 / N分前 / N時間前 / N日前を出し、一定しきい値（例 7 日）超は `toLocaleDateString("ja-JP")` の絶対日付にフォールバック（モックの「2026年5月8日」に対応）。
- `now` を任意引数で注入可能にし、テストを決定的にする（既定は `new Date()`）。日本語固定文言は自前整形でも `Intl.RelativeTimeFormat("ja")` でもよいが、モック文言（「たった今」）に正確に合わせるため境界は自前制御する。
- **スロットル幅との粒度整合（S-004）**: 「たった今」と表示する上限（最小粒度）は ADR-003 の `ACTIVITY_THROTTLE_MS`（スロットル幅）以上に取る。スロットル幅内の活動は `updated_at` に反映されないため、スロットル幅 ≤「たった今」上限であれば「たった今活動したのに『N 分前』」という違和感をその粒度で吸収できる。逆にスロットル幅を相対表示の最小粒度（分単位）より大きく取りすぎると最終アクセスがガサつくので、両定数はこの関係を満たすよう選ぶ。

### Consequences
- 良い点: 共有ヘルパー化で他画面（ノート履歴等）からも将来再利用可能。`now` 注入でユニットテストが決定的。presentation 層配置が責務分離と整合。
- トレードオフ: 既存の `toLocaleString` 直書き箇所を一括置換まではしない（本 Issue のスコープは P22）。重複は残るが、段階的に寄せていける。
