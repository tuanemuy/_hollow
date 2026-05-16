# ADR 008: Outbox は claim-based exclusive locking で実装する

## ステータス

承認済み（2026-05-16）

## コンテキスト

初期の DB 設計（[spec/database/index.md](../database/index.md) 旧 outbox_events セクション）では、Outbox の並列ディスパッチを以下の単純な lease ベースで行う想定だった:

- `lease_owner` / `lease_expires_at` カラムを worker が claim 時に書き換える
- `dispatched_at IS NULL AND (lease_expires_at IS NULL OR lease_expires_at <= now)` で次の行をポーリング
- `dispatched_at` の有無で「完了 / 未完了」を二値判定

実装に進む段階で以下の不足が判明した:

- **失敗扱いの欠落**: `attempts` をインクリメントし続けるだけでは「永続的に失敗した行」を quarantine できない。リレーループが同じ行を無限に拾い続けてしまう
- **発生時刻の喪失**: イベント発生時刻と outbox 行作成時刻が同一の `created_at` に混ざっており、リプレイや監査ログで「ユースケース内で何時に起きたか」を復元できない
- **backoff スケジューリングの欠落**: 一定間隔のポーリングしかできず、過渡的エラー時の指数バックオフを表現できない

リレー worker は Cloudflare Workers の Queues consumer として複数同時起動するため、「同じ行を 2 つの worker が掴まない」と「クラッシュした worker の claim を別 worker が引き継げる」の両立が必須である。

## 決定

**Outbox は claim-based exclusive locking + quarantine + scheduled retry の 3 点セットで実装する**。

スキーマ変更点:

- `lease_owner` → `claimed_by`、`lease_expires_at` → `claimed_at` に改名し、意味も「リース期限」から「claim を取った時刻」に変更する。再 claim 可否はリレー設定の `leaseMs` を使って `claimed_at <= now - leaseMs` で判定する（worker クラッシュ時のリース失効と等価）
- `dispatched_at` → `processed_at` に改名
- `failed_at` カラムを追加し、リトライ上限超過後は `processed_at IS NULL AND failed_at IS NOT NULL` の quarantine 状態に遷移させる
- `occurred_at` カラムを追加し、ドメインイベント発生時刻と outbox 行作成時刻 (`created_at`) を分離する
- `next_attempt_at` カラムを追加し、backoff スケジューリングを行に持たせる
- ポーリング用インデックスを `idx_outbox_pending (next_attempt_at, created_at, id) WHERE processed_at IS NULL AND failed_at IS NULL` の部分インデックスに変更する

## 結果

- spec/database/index.md の outbox_events 表とポーリング動作の記述を上記スキーマに合わせて更新済み
- worker の挙動は app/worker/cloudflare/relay.ts の実装に従う（CLAUDE.md「Outbox / domain events」セクション参照）
- 既存の「at-least-once / no ordering」契約は変わらず、consumer の冪等性要求も維持
