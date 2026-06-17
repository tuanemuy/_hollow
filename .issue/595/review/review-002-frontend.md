# PR #746 レビュー（Round 2）— Frontend

対象: `app/components/admin/Dashboard/{index.tsx,action.ts,chart.ts}` + `__tests__/chart.test.ts` / `app/components/common/styles.ts`（共通バッジ SSOT）/ `app/components/admin/Jobs/index.tsx`（バッジ共通化の被影響側）
基準: `.issue/595/plan.md`（AC-1/2/3/4/5/8）/ モック `spec/design/pages/P40-admin-dashboard.html`（655-751 行・`.tag` CSS 529-543 行）/ CLAUDE.md §Styling
前ラウンド: `.issue/595/review/review-001-frontend.md`（N-001〜N-005）

注記: Round 2 の修正（チャート純粋関数の `chart.ts` 抽出・共通バッジの `styles.ts` 抽出・Jobs の SSOT 化・`row.key` 追加）はワークツリー差分として存在し、committed PR head の上に積まれている。レビューはこのワークツリー状態（= Round 2 の最終形）を対象とした。

## Frontend

総評: 前ラウンドの Note 5 件（N-001〜N-005）はすべて適切に解消されている。チャートの純粋関数は `chart.ts` に切り出され `chart.test.ts`（14 ケース）で 0 と null の区別・空状態・モック整合の tone・空状態判定を検証しており、`pnpm typecheck` はクリーン、`pnpm exec vitest run chart.test.ts` は全パス。共通バッジ（`tagBadge`/`tagTone`/`tagToneNeutral`）はモック `.tag` CSS とバイト一致で、Jobs 画面に視覚回帰は無い。虚偽表示禁止の鉄則（null=取得失敗 と 0=平坦線 の区別、機能しない導線の非表示、空状態と導線非表示の二重表示回避、実データでの対象/詳細埋め、LLM 系列の非描画）も全層で維持。Blocker・Warning なし。Note は軽微 1 件のみ。

### Blockers

なし。

### Warnings

なし。

### Notes

- **[N-101] `RecentActivityRowDTO.severity` がフロントで未消費**（場所: `getRecentActivity.ts:25` で `severity: ActivitySeverity` を投影しているが、N-002 修正で tag tone は `chart.ts` `activityTagTone(row.kind)` から導出するようになったため `index.tsx` の `ActivityRow` は `row.severity` を一切参照しない）。バックエンドに記録された正規フィールドであり DTO 契約として残す判断自体は妥当（将来用途・テスト整合）だが、フロントの DTO 表面に「描画に使われないフィールド」が残る。projection 由来の severity を UI 表示に使わない方針（N-002）を採るなら、(a) コメント一行で「表示は kind 由来・severity は記録メタとして保持」と明記するか、(b) フロント向け DTO から severity を落として記録専用にするか、どちらかで意図を固定すると読み手の混乱が減る。実害は無く Note 止まり。

### 前ラウンド指摘（N-001〜N-005）の解消確認

- **N-001（2 カラムにチャート 1 枚で空セル）→ 解消**: `index.tsx:296` は `grid grid-cols-1 gap-4`（`sm:grid-cols-2` を撤去）で単独カードを全幅化。`:293-295` に「LLM 系列はデータ源無しで非描画、入れば 2 カラムに戻す」旨のコメントを残しており判断が追える（AC-2 / 虚偽表示禁止）。
- **N-002（severity→tone がモックと食い違う）→ 解消**: tone は `chart.ts` `activityTagTone(kind)` で算出し、モックの `.tag` バリアントと完全一致を確認 — user_created=info / large_upload=warning / job_failed=error / settings_changed=neutral（モックの variant-less `.tag`）/ export_completed=success。neutral 用に `tagToneNeutral`（`bg-surface text-ink-secondary`）を新設し、モックの無印 `.tag` 基底（surface / ink-secondary）と一致。`severity`（projection メタ）を tone に使わない設計で application 層の契約を侵さない。`chart.test.ts:85-102` が 5 種を網羅検証。
- **N-003（バッジが Jobs と二重定義・形不揃い）→ 解消**: `common/styles.ts:271` に `tagBadge`（`inline-flex items-center gap-[5px] px-[9px] py-[2px] rounded-pill text-xs font-medium whitespace-nowrap`）と `tagTone` を SSOT 化。Dashboard 旧 `px-2`/`rounded-full` の発散を解消し Jobs 値へ収斂。CLAUDE.md §Styling「繰り返しは module-scoped 定数へ」とも整合。
- **N-004（sparkline の `<title>` と `aria-label` 重複）→ 解消**: `<title>` を撤去し `role="img"`＋`aria-label` のみで命名（`index.tsx:79-83`）。二重読み上げ回避の意図をコメントで明示。
- **N-005（React key がデータ依存で衝突しうる）→ 解消**: DTO に安定 `key` を追加（`getRecentActivity.ts:20,52`）。直接投影行は `row.id`、大量アップロード派生行は `large_upload:{ownerId}:{windowStart}` の決定的合成キー（`activityLogRepository.ts:127,199-202`）。`index.tsx:345` は `key={row.key}` を使用し、合成キー衝突の余地が無くなった。

### バッジ共通化による Jobs 画面の回帰確認（重点）

- **回帰なし（視覚同値）**: committed HEAD の Jobs ローカル定義（`TAG_BADGE`/`TAG_TONE`）と、新設の共通 `tagBadge`/`tagTone` を値比較した結果、基底クラス文字列（`gap-[5px] px-[9px] py-[2px] rounded-pill text-xs font-medium whitespace-nowrap`）・4 トーン（info=`bg-accent-surface text-accent-ink` / success=`bg-success-surface text-success` / warning=`bg-warning-surface text-warning` / error=`bg-error-surface text-error`）ともバイト一致。Jobs は `tagBadge`/`tagTone` を import して使用に切り替えただけで、出力クラスは不変。`Tone` ユニオン・`ingestionStatusTag`/`exportStatusTag` のマッピングも変更なし。

### chart.ts 純粋関数の妥当性

- **sparkline path / 0-vs-null（AC-3）**: `buildSparkline`（`chart.ts:23-43`）は `max===0` で全点をベースライン（`CHART_HEIGHT - CHART_PAD_Y`）に落とし平坦線を描く（0=実データを正直に描画）。`points.length===0` は空パスを返し、`null` 系列はそもそもこの関数に到達せず呼び出し側（`index.tsx:306-309`）が「取得失敗」プレースホルダを描く。0 と null が `buildSparkline`（実データのみ）と呼び出し側（null 分岐）の 2 層に正しく分離。`provider` 側も 24 バケット 0 埋め保証で平坦線の前提が成立。
- **tone / 空状態判定**: `activityTagTone`（`:80-93`）は switch の網羅（fallthrough 無し・default 無しで型網羅）。`hasActivityRows(rowCount)`（`:59-61`）は単一述語で空状態と「すべて見る」非表示の排他分岐を一点に固定。
- **テスト妥当性（`chart.test.ts`, 14 ケース全パス）**: 全 0=平坦線で全 y がベースライン一致・非 0 でピークが上限バンド到達かつ y が多値・x の等間隔配置・空系列で空パス・area の閉路がベースライン隅へ戻ることを検証。`sumCounts` は 0 が null でなく 0 に合算されることを検証。`activityTagTone` は 5 種をモック tone で網羅＋全 ActivityKind 網羅。`hasActivityRows` は 0/1/20 で空状態↔リンク排他を検証。AC-3 の核心（0 vs null）と AC-8（空状態＋導線非表示の共存）を過不足なくカバー。

### スタイル / 規約 / アクセシビリティ

- utility-first・トークン経由を維持（`accent-surface`/`accent-ink`/`warning-surface`/`success-surface`/`ink-secondary`/`ink-tertiary`/`hairline`/`surface` は tokens.css に実在を確認）。新規ハンド CSS・`@apply` の追加なし。意図的 px（chart 600×140・stack ラベル幅 64px）はモック準拠で許容。
- レスポンシブは #545/#589 ADR-004 の実 DOM ラベル方式（`ACTIVITY_STACK_LABEL` = `hidden max-sm:inline-block`、`thead` は `max-sm:hidden`、行は `max-sm:block` カード積層）で Jobs の `STACK_LABEL` と同方式。条件付きクラス文字列での state 表現は不使用（data-* 規約違反なし）。
- RSC / loader: `action.ts` は `loadUsageMetrics`/`loadRecentActivity` を `cache(serverData(...))` で既存パターン踏襲、`index.tsx:182-185` で 2 loader を `Promise.all` 並列。`serverData` には内部 `actor.id` のみ渡し外部入力を通していない。
- a11y: section に `aria-label`、alert に `role="alert"`、SVG に `role="img"`＋`aria-label`、table に `thead`/`th`（単純表で `scope` 省略は許容）。`<title>` 重複は解消済み。
