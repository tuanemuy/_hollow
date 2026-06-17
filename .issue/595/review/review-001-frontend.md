# PR #746 レビュー — Frontend

対象: `app/components/admin/Dashboard/{index.tsx,action.ts}`
基準: `.issue/595/plan.md`（AC-1/2/3/4/5/8）/ モック `spec/design/pages/P40-admin-dashboard.html`（655-751 行）/ CLAUDE.md §Styling

## Frontend

総評: 虚偽表示禁止の鉄則（null=取得失敗 と 0=平坦線 の区別、機能しない導線の非表示、空状態と導線非表示の二重表示回避、実データでの対象/詳細埋め、LLM 系列の非描画）はすべて正しく実装されている。Blocker なし。スタイルは utility-first・トークン経由で、狭幅レスポンシブは #545/#589 ADR-004 の実 DOM ラベル方式に揃っている。指摘は Warning 0・Note 5（モック差分の意図確認とコード整合のみ）。

### Blockers

なし。

### Warnings

なし。

### Notes

- **[N-001] 「直近 24 時間」セクションが 2 カラムグリッドにチャート 1 枚で sm 以上に空セルが残る**（場所: `index.tsx:322` `grid grid-cols-1 gap-4 sm:grid-cols-2` 内に `アップロード数` カード 1 枚のみ）。モックはアップロード/LLM の 2 枚構成だが、LLM 系列はデータ源無しで正しく非描画（AC-2 / 虚偽表示禁止）。結果 sm 幅以上で右半分が空く。機能上の問題ではなく honest だが、1 枚なら `sm:grid-cols-2` を外して単独カードを全幅 or 中央寄せにする方が見栄えが整う（LLM 記録源が将来入れば 2 枚に戻す前提なら現状維持も妥当）。判断を残すなら一言コメントがあると親切。

- **[N-002] 活動行 severity がモックの tag バリアントと一部食い違う**（場所: `handleIngestionCreatedEvent`/`activityLogRepository.ts:200` `large_upload` → `severity: "info"`、`handleInstanceSettingsUpdatedEvent.ts:43` `settings_changed` → `"info"`）。モックでは大量アップロード=`warning`（橙）、設定変更=無印（neutral）。UI 側 `ACTIVITY_TAG_TONE`（`index.tsx:145-150`）は info=accent-surface にマップするので、大量アップロードが橙でなくグレー寄り、設定変更も neutral でなく accent で出る。実害は無く実データ整合だが、モック準拠の色設計（warning で注意喚起、設定変更は控えめ）から外れる。意図的なら ADR/コメントに残すと良い。`ActivitySeverity` に `neutral` を足してモックの無印 tag に合わせる選択肢もある。

- **[N-003] 活動 tag のスタイルが既存 Jobs バッジ規約と二重定義**（場所: `index.tsx:152-153` `ACTIVITY_TAG_BASE` = `inline-flex items-center px-2 py-[2px] rounded-full text-xs font-medium whitespace-nowrap` と `ACTIVITY_TAG_TONE`）。`app/components/admin/Jobs/index.tsx:43` に既に同等のバッジ基底（`inline-flex items-center gap-[5px] px-[9px] py-[2px] rounded-pill text-xs font-medium whitespace-nowrap` + `bg-success-surface text-success` 等のトーンマップ）がある。値が微妙に違う（`px-2`/`rounded-full` vs `px-[9px]`/`rounded-pill`）ため管理画面内でバッジ形が不揃いになる。共通バッジを `common/styles.ts` 等に抽出して両所で使い回すと一貫性が上がる（CLAUDE.md §Styling の「繰り返しは module-scoped 定数へ」方針とも整合）。少なくとも Jobs と同じ値に寄せたい。

- **[N-004] sparkline の `<title>` と `aria-label` が重複**（場所: `index.tsx:106-113` `role="img"` + `aria-label="..."` + `<title>...</title>` が同文）。スクリーンリーダーによっては二重読み上げになりうる。`aria-label` を持つなら `<title>` は省略可、または `<title>` のみにして `aria-label` を外す方が冗長性が減る。モックは SVG に `aria-hidden="true"`（純装飾扱い）だが、こちらは実データ可視化なので名前付けは妥当な改善。重複だけ整理を。

- **[N-005] アクティビティ行の React key がデータ依存で衝突しうる**（場所: `index.tsx:372` `key={`${row.kind}-${row.occurredAt}-${row.target}-${row.detail}`}`）。`occurredAt` は HH:MM ではなく ISO 文字列なので通常一意だが、同一 owner が同一ミリ秒で大量アップロード窓を 2 つ持つ等の極端ケースで重複しうる。DTO に安定 id を載せていないための妥協で実害は小さいが、`getRecentActivity` の `RecentActivityRowDTO` に `id`（または合成キー）を持たせて index フォールバックを避けると堅い。現状でも degrade はしないため Note 止まり。

### 確認できた良い点（参考）

- **AC-3 / 虚偽表示禁止**: `buildSparkline`（`index.tsx:61-79`）は `max===0` で全点をベースラインに落として平坦線を描き、`uploadsHourly===null` のときのみ「取得失敗」プレースホルダ（`index.tsx:332-335`）。provider 側も 24 バケット 0 埋めを保証（`usageMetricsProvider.ts:86-89`）し、失敗時のみ系列 null（`:90-95`）。0 と null の区別が UI・provider 両層で一貫。
- **AC-2**: LLM 系列は DTO に存在せず（`getUsageMetrics.ts` コメント `:24-26`）チャートも描かない。既存 scalar「LLM 呼び出し (24h)」カードは `:302-312` で `null→取得失敗` のまま（#545 一致・挙動不変）。
- **AC-4/5**: 4 列（時刻/種類/対象/詳細）。対象/詳細は projection ハンドラで実データ埋め — `handleUserCreatedEvent` は username を UoW 引きして ID 直書きを回避（`:28-44`）、`handleIngestionFailedEvent` は originalFileName + errorReason（`:35-45`）、burst は owner handle 解決（`activityLogRepository.ts:186-202`）。エンティティ purge 済みのみ raw id にフォールバックするが「失敗は実際に起きた」ので honest。空文字・ID 直書きの形式的充足は無し。
- **AC-8 / 二重表示回避**: 「期間を変更」「すべて見る」はコメントのみで未描画（`:320`, `:351-352`）。空状態（`:354-357` 「アクティビティはまだありません」）は導線非表示と排他で二重表示にならない。
- **レスポンシブ（ADR-004）**: `ACTIVITY_STACK_LABEL`（`:167-168` `hidden max-sm:inline-block max-sm:w-[64px] ... uppercase tracking-[0.04em]`）は Jobs の `STACK_LABEL`（`Jobs/index.tsx:76-77`）と同方式の実 DOM ラベル。`thead` は `max-sm:hidden`、行は `max-sm:block` でカード積層。data-* 規約違反なし（条件付き状態属性は不使用）。
- **スタイル**: 全て utility-first・トークン経由（`ink-secondary`/`ink-tertiary`/`hairline`/`*-surface`/`bg` 等は tokens.css に実在を確認）。新規ハンド CSS・@apply の追加なし。意図的 px（chart 600×140・stack ラベル幅）はモック準拠で許容範囲。
- **RSC / loader**: `action.ts` の `loadRecentActivity` は `loadUsageMetrics` と同じく `cache(serverData(...))` で既存パターン踏襲。`index.tsx:211-214` で 2 loader を `Promise.all` 並列。serverData は内部 actorUserId のみ渡し外部入力を通していない。
- **アクセシビリティ**: table に `thead`/`th`（`scope` は無いが単純表で許容）、section に `aria-label`、alert に `role="alert"`、SVG に `role="img"`。
