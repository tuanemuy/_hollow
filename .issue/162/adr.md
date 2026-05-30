# ADR — Issue #162: PurgeOrphans R2 削除失敗時の再試行強化

## ADR-001: Option A（候補プールに `status='deleting'` を含める）を採用

### Status
Accepted（ユーザー確認済み 2026-05-30）

### Context
2nd UoW（R2 delete + DB delete）失敗時に行が `status='deleting'` のまま残り、`findOrphansOlderThan` が `status='orphan'` のみをフィルタするため次の sweep で拾われず stuck する。Issue は 3 案を提示:
- A: 候補に `deleting` も含め、`deleting` 行は markDeleting を skip して purge から再開
- B: 2 段階を 1 UoW に統合し R2 失敗時に rollback
- C: `deleteAttempts` カラム追加で再試行回数を管理

### Decision
Option A を採用。
- `findOrphansOlderThan` の where 句を `status IN ('orphan','deleting') AND updatedAt < cutoff` に拡張（実態に合わせ `findPurgeableOlderThan` にリネーム）。
- `markDeleting` は `updatedAt = now` をセットするため、`deleting` に遷移した行は猶予期間（`orphanAgeSec`、既定 24h）が再び経過するまで候補に入らない。この猶予期間が **実質的なリース** として働き、orphan→deleting 直後の二重処理を構造的に防ぐ。
- B は D1 トランザクション外で R2 を呼ぶ構造上 atomicity を得られず、結局リトライセマンティクスが必要になるため本質的解決にならない。
- C はマイグレーションを要し、再試行回数の永続化・可観測性は #58（自動パージジョブの履歴永続化）と整合させて扱うべきなので本 Issue のスコープから外す。

### Consequences
- 良い点: 構造変更が最小、マイグレーション不要、R2 一時障害からの自然回復、猶予期間が即時の二重 grab を防ぐ。
- トレードオフ: 再試行回数の上限・可観測性は持たない（ADR-002）。resume パスの並行性は厳密でない（ADR-003）。

---

## ADR-002: 再試行回数の上限を設けない

### Status
Accepted

### Context
Option C は `deleteAttempts < N` で無限ループを防ぐ。Option A 単体では恒久的に R2 削除が失敗する行（バケット削除・権限喪失等）が毎回の対象 sweep で再試行され続ける。

### Decision
本 Issue では上限を設けない。再試行回数の永続化・しきい値超過時のアラート/DLQ 化は、履歴永続化を扱う #58 に委ねる。

### Consequences
- 良い点: スキーマ変更ゼロ、スコープを「stuck 解消」に限定できる。
- トレードオフ: 恒久失敗行は無制限に再試行される。`logger.error` には毎回記録されるため検知の足がかりは残る。

---

## ADR-003: resume パスで `updatedAt` を再スタンプしない（並行制御は冪等性で許容）

### Status
Accepted

### Context
`deleting` 行を再試行する際、(a) `updatedAt` を `now` に bump して猶予期間をリースとして使い回す、(b) bump せず purge のみ再実行する、の 2 択がある。(a) は厳密なリースになるが再試行間隔が常に猶予期間ぶん伸び、ドメインに「再試行用の遷移」を追加する必要がある。Issue が選んだ Option A の意図（「`deleting` 行は markDeleting を skip」）は (b)。

### Decision
(b) を採用。resume パスでは `findById` で取得した `deleting` 行をそのまま 2nd UoW の purge に渡し、再 save も `media.deleting` イベント再発火も行わない。並行 tick が同一 `deleting` 行を二重に拾うリスクは、`storage.delete`（`StorageNotFoundError` を無視）と `repo.delete`（id 指定削除）がいずれも冪等であることで吸収する。

### Consequences
- 良い点: ドメインに余計な遷移を足さない、再試行が猶予期間に縛られず迅速、実装が最小。
- トレードオフ: overlapping tick で同一行を二重処理した場合、`purged` カウントが二重計上され、`media.purged` イベントも 2 回 outbox に積まれ得る（データ破損はなし）。後者は outbox の at-least-once 配信前提（consumer は冪等必須、CLAUDE.md）で吸収される。Cloudflare cron の tick 間隔と purge 所要時間からも実害はまれと判断。
- 補足（W-001）: resume パスで `media.deleting` を再発火しないため、最初の `markDeleting` のイベントが何らかの理由で配送されないと当該行の `media.deleting` consumer は起動しないが、`media.deleting` は purge 完了の前提条件ではなく（consumer は装飾的・冪等）、purge 自体は 2nd UoW の `media.purged` で完結する。`media.deleting` を「purge の必須トリガー」とする consumer を将来追加する場合は本判断を見直すこと。

---
