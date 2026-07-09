# ADR — Issue #821: 日付整形の TZ 未指定による hydration mismatch を横断修正し共有ヘルパーに集約

## ADR-001: 表示タイムゾーンは Asia/Tokyo 固定を基本線とする（#817 ADR-001 を踏襲）

### Status
Accepted

### Context
アプリ全体が `ja-JP` ロケールをハードコードしており、その自然な対になる表示 TZ は JST。`Date#toLocale*` / `Intl.DateTimeFormat` を `timeZone` 未指定で呼ぶと、SSR（Cloudflare Workers / workerd は `Intl` 既定 TZ が UTC）とクライアント（ブラウザ TZ）で出力がずれる。#817 は admin の2ファイルを `timeZone: "Asia/Tokyo"` 固定で解消済み（#817 ADR-001）。本 Issue はその方針を横断適用する。

### Decision
共有ヘルパーおよび全対象コンポーネントの表示 TZ を **`Asia/Tokyo` 固定**とする。詳細な根拠（選択肢1〜3の比較、`suppressHydrationWarning` を採らない理由、DTO 側整形を採らない理由）は **#817 ADR-001 を参照**。

閲覧 TZ に追従させたい画面は、CalendarView / PublicNoteViews が既に採る「クライアントで `Intl.DateTimeFormat().resolvedOptions().timeZone` を解決して引数で渡す」方式に統一する（本 Issue ではそのような画面は新規に発生しない）。

### Consequences
- 良い点: SSR/クライアントが同一文字列になり mismatch が消える。日付が閲覧環境に依存せず常に JST で一貫表示される。
- トレードオフ: 非 JST 環境から見た場合も JST 固定表示になるが、`ja-JP` 前提のアプリでは妥当。

---

## ADR-002: 共有ヘルパーは「オプション透過」型 API とし、固定プリセットにはしない

### Status
Proposed

### Context
対象の整形関数は12超あり、Intl オプションの粒度が現状バラバラ（`month` が `2-digit`/`short`/`long`、`year` の有無、時刻の有無、`dateStyle`/`timeStyle` 指定など）。単一プリセットへ一律集約すると多数の画面で表示フォーマットが変わり、#817 が守った「既存の見た目・粒度を維持」に反する。一方で逐語重複（#817 レビュー W-001）の実体は、各所に散る `new Date(iso)` → `Number.isNaN` ガード → `toLocale*("ja-JP", { …, timeZone })` という**定型ボイラープレートと WHY コメント**であって、オプション集合そのものではない。

選択肢:
1. 固定プリセット（`formatDate` / `formatDateTime` など決め打ちフォーマットを数種）
2. オプション透過（`formatJstDateTime(iso, options)` — ロケール `ja-JP` と `timeZone: "Asia/Tokyo"` と NaN ガードだけを固定し、書式オプションは呼び出し側が渡す）

### Decision
**選択肢2（オプション透過）** を採る。`app/components/common/dateFormat.ts` に、`iso` 文字列を受け取り NaN ガードのうえ `ja-JP` + `Asia/Tokyo` を固定して呼び出し側の `Intl.DateTimeFormatOptions` を適用する単一関数を置く。各呼び出し側は自前の5行ボイラープレートを1行の呼び出しに置き換え、既存のフォーマット（オプション）はそのまま引数として保持する。

### Consequences
- 良い点: W-001 の重複（ボイラープレート＋WHY コメント）を1箇所に集約。TZ 固定の唯一の責任点を作ることで mismatch クラスを恒久的に閉じられる。各画面の見た目は不変（#817 の「維持」原則と整合）。
- トレードオフ: 視覚フォーマットの統一まではしない。ただし各サーフェスの粒度差（一覧は日付のみ、詳細は日時、等）は意図的なものであり、本 Issue の目的（mismatch 解消・TZ 固定の集約）には不要。将来同一オプション集合が3箇所以上で重複したら薄いプリセットを本ヘルパー上に足せばよい。
- 例外: `toLocaleString()` を**ロケール・オプション未指定**で呼んでいた2箇所（`NoteRevisionDetail` / `NoteHistoryList`）は、移行にあたり明示的な `ja-JP` 日時フォーマットを与える。既定ロケール＋UTC のバラつきを正す意図的な変更。

---

## ADR-003: RSC（サーバーコンポーネント）の該当箇所も対象に含める

### Status
Proposed

### Context
候補のうち `admin/Dashboard`・`note/detail/NoteMetaPanel`・`note/history/{NoteHistoryList,NoteRevisionDetail}`・`trash/TrashList` は `renderServerComponent` 経由の RSC（またはその子）で、初回描画後にクライアントで再実行・再ハイドレートされない。したがって厳密には「hydration mismatch」は起きない。一方で `"use client"` の `ProfileForm`・`SecurityForm`・`PublishSettings`・`TagList`・`ListView`/`TileView`（`listSelectors.formatDate`）・`SecurityForm` 経由の `relativeTime` フォールバックは SSR→hydrate 経路に乗るため真に mismatch を起こす。

RSC 側を「mismatch ではないから対象外」とするか、表示の正しさと集約の観点で対象に含めるかが判断点。

### Decision
RSC 側も**対象に含めて共有ヘルパーへ移行する**。理由:
- RSC は mismatch こそ起こさないが、Workers 既定 TZ の UTC で描画されるため**表示値そのものが誤り**（JST であるべき時刻・日付が UTC で出る。日付のみ整形でも instant 由来なら深夜帯で日付が1日ずれる）。`NoteHistoryList`/`NoteRevisionDetail` は加えて既定ロケール表示になっている。
- 共有ヘルパーへの集約（Issue の明示目的）は RSC 側も含めて初めて完了する。
- 将来その画面が `"use client"` 化された場合の潜在 mismatch も同時に閉じられる。

判断表（各箇所の client/RSC 区分・mismatch か表示正確性か）は plan.md「調査結果」に記載する。

### Consequences
- 良い点: 全サーフェスで JST 一貫表示。集約が完結し、TZ 未指定の同型パターンがコードベースから一掃される。
- トレードオフ: RSC 側の変更は厳密には「mismatch 修正」ではなく「表示正確性＋集約」。plan の受け入れ基準ではこの区別を明記する。

---
