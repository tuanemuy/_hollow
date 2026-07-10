# 実装計画 — Issue #821: chore(frontend): 日付整形の TZ 未指定による hydration mismatch を横断修正し共有ヘルパーに集約

**Issue:** #821
**作成日:** 2026-07-10
**複雑度:** 中〜大規模

---

## 目的

`ja-JP` の `Date#toLocale*` / `Intl.DateTimeFormat` を `timeZone` 未指定で呼ぶ同型パターンを横断的に洗い出し、SSR（Workers=UTC）とクライアント（ブラウザ TZ）の出力差による hydration mismatch と UTC 誤表示を解消する。整形を `ja-JP` + `Asia/Tokyo` 固定の共有ヘルパー（プレゼンテーション層）に集約し、逐語重複（#817 W-001）と再発を断つ。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | `app/components/common/dateFormat.ts` に `ja-JP` + `timeZone: "Asia/Tokyo"` を固定した共有整形ヘルパーが存在し、NaN 入力では入力文字列をそのまま返す | Issue 提案（共有ヘルパー集約） | 1 |
| AC-2 | ヘルパーの単体テストが、境界インスタント（例 `2026-01-01T16:00:00Z` = JST 翌日01時）で JST 側の日付・時刻を出力することを検証し、TZ=UTC / TZ=Asia/Tokyo いずれのランナーでも同一出力になる（＝ TZ 未指定なら失敗する）ことを担保する | Issue 提案（TZ=UTC と Asia/Tokyo で同一出力を担保） | 2 |
| AC-3 | `"use client"` かつ SSR される対象コンポーネント（ProfileForm・SecurityForm（`formatLoginTime`）・PublishSettings・TagList・ListView/TileView（`listSelectors.formatDate`）・relativeTime フォールバック（SecurityForm が消費））の日付整形が共有ヘルパー経由になり、hydration mismatch warning が出ない | Issue 本文（横断修正） | 3 |
| AC-4 | RSC 側の対象（admin/Dashboard・NoteMetaPanel・NoteHistoryList・NoteRevisionDetail・TrashList）も共有ヘルパー経由になり、JST で一貫表示される（UTC・既定ロケール表示が解消） | Issue 本文（同型パターン網羅）/ ADR-003 | 4 |
| AC-5 | #817 で TZ 固定済みの UsersTable / Jobs も共有ヘルパー経由に移行し、W-001 の逐語重複が解消される（表示は不変） | Issue 提案（W-001 解消） | 5 |
| AC-6 | 対象外と判断した箇所（CalendarView・PublicNoteViews の date-key 整形、client 解決 TZ を渡す `groupNotesByDay`）は変更しない | Issue 本文（対象外の明示） | — |
| AC-7 | 既存テスト（特に `ProfileForm/__tests__/index.test.tsx` の期待値再構築）が新方針と整合し、`pnpm typecheck && pnpm lint && pnpm test:unit` が通る | 品質ゲート | 3, 6 |

## スコープ

### 含まれないもの
- **CalendarView.formatDay / PublicNoteViews.formatDay** — 入力が既にバケット化済みの date-key（`` `${dateKey}T00:00:00` `` = ローカル深夜）で instant ではなく、同一ローカル TZ で日付のみ整形するため TZ 非依存（SSR/クライアントで同日）。CalendarView は grouping 側で既にクライアント解決 TZ を使用（`groupNotesByDay`）。Issue も明示的に対象外。
- **`listSelectors.groupNotesByDay`** — 既に `Intl.DateTimeFormat().resolvedOptions().timeZone` をクライアントで解決して引数で渡す方式。閲覧 TZ 追従が正しいバケット化用途で、対象外。
- **表示 TZ をユーザー設定で切り替える仕組み** — アプリは `ja-JP`/`Asia/Tokyo` 前提（ADR-001）。閲覧 TZ 追従は既存の client 解決方式に限る。
- **視覚フォーマットの統一** — 各サーフェスのフォーマット（日付のみ/日時/時刻のみ等）は意図的に異なる。ヘルパーはオプション透過で既存の見た目を維持する（ADR-002）。

## 調査結果

### 各候補箇所の判断表

区分の凡例: **client** = `"use client"` で SSR→hydrate 経路に乗る（真の mismatch 源）。**RSC** = `renderServerComponent` 経由で初回描画のみ（mismatch は起きないが UTC 誤表示）。

| 箇所 | 区分 | 整形の性質 | 判断 | 根拠 |
|---|---|---|---|---|
| `admin/Dashboard/index.tsx:145` `formatActivityTime` | RSC（`AdminDashboard` は async, `renderServerComponent`） | 時刻のみ, TZ 未指定 | **修正** | RSC ゆえ厳密には mismatch ではないが UTC 時刻で誤表示。JST へ集約（ADR-003） |
| `identity/ProfileForm/index.tsx:86` `formatTimestamp` | client | 日時 | **修正** | SSR/hydrate mismatch。加えて `__tests__/index.test.tsx:289` の期待値再構築も TZ 追随が必要 |
| `identity/ProfileForm/index.tsx:96` `formatDay` | client | 日付のみ（instant 由来の `Date`） | **修正** | instant を日付整形するため深夜帯で日付ずれ → mismatch。入力が `Date` のためヘルパーへは `d.toISOString()` で橋渡し（ヘルパーは `iso: string` 受け）。詳細は実装ステップ3 |
| `identity/SecurityForm/index.tsx:114` `formatLoginTime` | client | 日時（dateStyle/timeStyle） | **修正** | mismatch |
| `publication/PublishSettings/index.tsx:87` `formatLastAccess` | client | 日時（年なし） | **修正** | mismatch |
| `note/detail/NoteMetaPanel.tsx:39` `formatDate` | RSC（`NoteDetailContent` の子） | 日時 | **修正** | UTC 誤表示（ADR-003） |
| `note/history/NoteRevisionDetail.tsx:65` | RSC（async） | `toLocaleString()` ロケール/オプション未指定 | **修正** | 既定ロケール＋UTC。明示 `ja-JP`+JST 日時へ（ADR-002 例外） |
| `note/history/NoteHistoryList.tsx:110` | RSC（async） | `toLocaleString()` ロケール/オプション未指定 | **修正** | 同上 |
| `trash/TrashList.tsx:28` `formatDate` | RSC（route で `renderServerComponent`） | 日付のみ（instant 由来） | **修正** | instant を日付整形 → UTC 側で日付ずれ（ADR-003） |
| `tag/TagList.tsx:44` `formatLastUsed` | client | 日付のみ（instant 由来） | **修正** | mismatch（深夜帯の日付ずれ） |
| `common/relativeTime.ts:34`（絶対日付フォールバック） | client 経由（`SecurityForm` が使用） | 日付のみ（instant 由来） | **修正** | 7日超の絶対フォールバック分岐が mismatch 源 |
| `note/list/listSelectors.ts:20-28` `formatDate` | client（`ListView`/`TileView` が `updatedAt` を整形） | 日付のみ（instant 由来） | **修正** | mismatch（日付ずれ） |
| `admin/UsersTable/index.tsx:96` `formatDate` | client（#817 で TZ 固定済み） | 日付のみ | **修正（集約のみ）** | 挙動不変。W-001 の重複解消のため共有ヘルパーへ移行 |
| `admin/Jobs/index.tsx:164` `formatDateTime` | client（#817 で TZ 固定済み） | 日時 | **修正（集約のみ）** | 同上 |
| `note/list/CalendarView.tsx:18` `formatDay` | client | date-key（ローカル深夜） | **対象外** | instant 非依存で TZ 安定。grouping は client 解決 TZ 使用 |
| `public/PublicNoteViews.tsx:198` `formatDay` | — | date-key（ローカル深夜） | **対象外** | 同上。Issue 明示の対象外 |

**要確認だった `formatMonthLabel`**: `listSelectors.ts` に `formatMonthLabel` は存在しない（Issue の推測表記）。当該ファイルの `toLocale*` は `formatDate`（line 20-28）のみで、上表のとおり修正対象。

### 関連ファイル・アーキテクチャ
- あるべきアーキテクチャ: 整形はプレゼンテーション層の責務（`app/components/common/relativeTime.ts` JSDoc に明記）。共有ヘルパーは `app/components/common/` に置き、ドメイン/アプリケーション層には持ち込まない。
- 既存参考: `relativeTime.ts`（相対時刻の共有ヘルパー、`app/components/common/__tests__/relativeTime.test.ts` のテスト様式）、`listSelectors.groupNotesByDay`（client 解決 TZ を渡すパターン）、#817 `UsersTable`/`Jobs`（`timeZone: "Asia/Tokyo"` 固定の先行実装）。
- 依存関係: すべて表示整形のみ。DTO・ユースケース・ドメイン・アダプターへの変更は不要（渡されるのは ISO 文字列）。

## 設計

### ドメインモデルへの影響
なし。表示整形のみでドメイン・ユースケース・アダプター・DTO は不変。

### UI / プレゼンテーション

**共有ヘルパー** `app/components/common/dateFormat.ts`（新規）:

```ts
/**
 * Format an ISO 8601 instant in the app's fixed display zone (JST) with a
 * ja-JP locale. Pinning locale + timeZone makes SSR (Workers defaults Intl
 * to UTC) and the client render byte-identical, closing the hydration
 * mismatch class at a single point (#821 / #817 ADR-001). Unparsable input
 * returns the raw string, matching each call site's prior guard.
 *
 * Despite the `DateTime` name, passing date-only options returns a date-only
 * string (`toLocaleString` honors the option set), so this is also the drop-in
 * replacement for prior `toLocaleDateString` call sites.
 */
export function formatJstDateTime(
  iso: string,
  options: Intl.DateTimeFormatOptions,
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", { ...options, timeZone: "Asia/Tokyo" });
}
```

- **オプション透過設計**（ADR-002）: ロケール `ja-JP`・`timeZone: "Asia/Tokyo"`・NaN ガードだけを固定し、書式オプションは各呼び出し側が渡す。呼び出し側が誤って `timeZone` を渡しても JST に倒すため、`timeZone` はスプレッドの**後**に置く（`{ ...options, timeZone: "Asia/Tokyo" }`）。
- `toLocaleString` は日付のみオプションでも日付のみを返すため、既存の `toLocaleDateString` 呼び出し（日付のみ）とも等価に置換できる。名前 `formatJstDateTime` は日時専用の印象を与えるが、`TagList`/`TrashList`/`listSelectors.formatDate`/`ProfileForm.formatDay`/`relativeTime` フォールバックなど日付のみ整形でも共用する。名称は現状維持とし、**この「日付のみオプションなら日付のみを返す（`toLocaleDateString` 相当の置換にも使える）」旨を上記 JSDoc に明記して読者の誤解を防ぐ**（arch S-002）。
- `relativeTime.ts` の絶対フォールバックは本ヘルパーを呼ぶ（同一ディレクトリ）。

各コンポーネントは自前の `new Date()` + NaN ガード + `toLocale*("ja-JP", {...})` を、`formatJstDateTime(iso, { …既存オプション… })` の1行に置換する。既存フォーマット（オプション）は保持。

## 実装ステップ

内側（共有ヘルパー）→ 外側（各コンポーネント）の順。

### 1. 共有ヘルパー `dateFormat.ts` を新規作成
- **対象ファイル:** `app/components/common/dateFormat.ts`（新規）
- **変更内容:** 上記 `formatJstDateTime(iso, options)` を実装。JSDoc に「整形はプレゼンテーション層の責務」「TZ 固定で mismatch を閉じる（#821/#817 ADR-001）」の WHY を記す。
- **理由:** TZ 固定の唯一の責任点を作り、W-001 の重複と mismatch 再発を断つ（AC-1）。

### 2. ヘルパー単体テストを追加
- **対象ファイル:** `app/components/common/__tests__/dateFormat.test.ts`（新規）
- **変更内容:** (a) 境界インスタント `2026-01-01T16:00:00Z` を `{year:"numeric",month:"short",day:"numeric"}` で整形 → `2026年1月2日`（JST 側）を期待。(b) 同 instant を日時オプションで整形 → JST の 01:00 台を期待。(c) `Number.isNaN` 入力（`"not-a-date"`）で入力文字列がそのまま返ることを期待。ヘルパーは `timeZone` を明示するのでランナーの `process.env.TZ` に依存せず同一出力になる（TZ を落とすと (a) が UTC 側 `1月1日` となり失敗＝回帰検出）。**テスト名/コメントに「ランナー TZ に依存せず同一出力（＝ Issue の TZ=UTC / TZ=Asia/Tokyo 同一出力提案を満たす）」を明示**し、レビュー時に Issue 提案（S-001）との対応が一目で追えるようにする。`relativeTime.test.ts` のスタイルに倣う。
- **理由:** TZ=UTC/Asia/Tokyo で同一出力を担保し再発を防ぐ（AC-2）。

### 3. client コンポーネント（真の mismatch 源）を移行
- **対象ファイル:**
  - `app/components/identity/ProfileForm/index.tsx`（`formatTimestamp`・`formatDay`）。**`formatDay` は `Date` 入力（`formatDay(nextChange)` で `nextChange` は算出済み `Date`）なので、字義どおりの「iso 文字列直渡し」は当てはまらない。内部で `formatJstDateTime(d.toISOString(), {…})` と橋渡しする（他の呼び出し側は ISO 文字列を直渡し）。ラッパーのシグネチャ（`formatDay(d: Date)`）は不変に保つ**
  - `app/components/identity/ProfileForm/__tests__/index.test.tsx`（line 289 の期待値再構築に `timeZone: "Asia/Tokyo"` を追加、または `formatJstDateTime` を import して期待値を作る）
  - `app/components/identity/SecurityForm/index.tsx`（`formatLoginTime`）
  - `app/components/publication/PublishSettings/index.tsx`（`formatLastAccess`）
  - `app/components/tag/TagList.tsx`（`formatLastUsed`）
  - `app/components/note/list/listSelectors.ts`（`formatDate` — `ListView`/`TileView` が使用）
  - `app/components/common/relativeTime.ts`（line 34 の絶対フォールバックを `formatJstDateTime` 経由に）
- **変更内容:** 各ローカル整形関数の本体を `formatJstDateTime(iso, {…既存オプション…})` に置換。関数シグネチャ・呼び出し側・戻り値型は不変。逐語 WHY コメントは削除（ヘルパー JSDoc に集約）。
- **理由:** SSR/hydrate 経路の mismatch を解消（AC-3, AC-7）。

### 4. RSC 側（UTC 誤表示）を移行
- **対象ファイル:**
  - `app/components/admin/Dashboard/index.tsx`（`formatActivityTime` — 時刻のみオプションで `formatJstDateTime` へ）
  - `app/components/note/detail/NoteMetaPanel.tsx`（`formatDate`）
  - `app/components/note/history/NoteRevisionDetail.tsx`（line 65 の `toLocaleString()` を明示 `ja-JP` 日時フォーマットで `formatJstDateTime` へ）
  - `app/components/note/history/NoteHistoryList.tsx`（line 110 同上）
  - `app/components/trash/TrashList.tsx`（`formatDate`）
- **変更内容:** ヘルパー経由に置換。history 2件はロケール/オプション未指定だったため明示的な `ja-JP` 日時オプション（例: `{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}`）を与える。**Dashboard は唯一 `Intl.DateTimeFormat("ja-JP", {...}).format()`（NaN ガードなし）からの移行で、`formatJstDateTime`（`toLocaleString` 等価 + NaN ガードあり）に置換すると、NaN 入力時の出力が `Invalid Date` → iso 素通しに微変する（改善方向、同一オプションでの正常出力は等価）。実装時に取りこぼさないよう留意する。**
- **理由:** JST 一貫表示・集約完了（AC-4）。ADR-003。

### 5. #817 済みの UsersTable / Jobs を集約（W-001 解消）
- **対象ファイル:** `app/components/admin/UsersTable/index.tsx`・`app/components/admin/Jobs/index.tsx`
- **変更内容:** `formatDate`/`formatDateTime` 本体を `formatJstDateTime` 呼び出しに置換（既存オプションをそのまま渡す）。表示は不変。逐語 WHY コメントを削除。
- **理由:** W-001 の逐語重複を解消し集約を完結（AC-5）。

### 6. 品質ゲート
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format` と `pnpm test:unit` を実行。`ProfileForm` テスト・`listSelectors`/`relativeTime` 既存テストの整合を確認。
- **理由:** 回帰なしを担保（AC-7）。

## 設計判断

- ADR-001: 表示 TZ は `Asia/Tokyo` 固定（#817 ADR-001 踏襲）。
- ADR-002: 共有ヘルパーは「オプション透過」型 API。固定プリセットにはしない。
- ADR-003: RSC 側も表示正確性＋集約の観点で対象に含める。

## リスクと注意点

- **既存テストの期待値ずれ**: `ProfileForm/__tests__/index.test.tsx:289` は期待値を `toLocaleString("ja-JP", {...})`（TZ 未指定）で再構築している。コンポーネントに TZ 固定を入れると非 JST ランナーで不一致になりうるため、同テストの期待値にも `timeZone: "Asia/Tokyo"` を反映（またはヘルパー import）する。他の対象コンポーネントに同型テストがないか着手時に grep で確認する。
- **history 2件の表示変更**: `toLocaleString()`（既定ロケール）→ `ja-JP` JST 日時に変わるため、見た目が変化する（意図的な改善）。manual-test / スクショで確認。
- **`timeZone` の上書き順序**: ヘルパーは `{ ...options, timeZone: "Asia/Tokyo" }` の順で TZ を最後に固定し、呼び出し側が誤って TZ を上書きしても JST に倒す。
- **RSC は mismatch ではない点の明示**: 受け入れ基準・レビューで「RSC 側は mismatch 修正ではなく表示正確性＋集約」と区別すること（過大な主張を避ける）。
- `Intl` の `timeZone: "Asia/Tokyo"` は Workers・主要ブラウザともサポート済み（#817・`listSelectors` で実績あり）。

## テスト方針

- 共有ヘルパー単体テスト（AC-2）: 境界インスタントで JST 出力・NaN フォールバックを検証。TZ を落とすと失敗する回帰ガード。
- 既存ユニットテストの整合維持（ProfileForm・relativeTime・listSelectors 周辺）。
- `pnpm typecheck && pnpm lint && pnpm format:check` 通過。
- ブラウザ検証（manual-test）: 対象画面（/admin、プロフィール、セキュリティ、公開設定、ノート詳細・履歴、ゴミ箱、タグ、ノート一覧）を開き、hydration mismatch warning が出ないこと・日付が JST で正しく読めることを確認。

## レビュー履歴

- **1周目**: 要件カバレッジ・スコープ整合性／アーキテクチャ整合性・実現可能性・リスクの両視点とも問題点ゼロ（must-fix なし）。スコープ内の改善提案6件を計画に反映した:
  - coverage S-001: AC-2 のテスト名/コメントに「ランナー TZ 非依存＝ TZ=UTC / Asia/Tokyo 同一出力提案を満たす」意図を明示（ステップ2）。
  - coverage S-002: AC-3 の対象列挙で重複していた「SecurityForm」を役割別（`formatLoginTime` / relativeTime フォールバックの消費者）に整理し1回ずつに。
  - coverage S-003: Dashboard は唯一 `Intl.DateTimeFormat().format()` からの移行で NaN ガード挙動が微変する旨をステップ4に追記。
  - arch S-001: `ProfileForm.formatDay(d: Date)` は `Date` 入力のため `d.toISOString()` でヘルパーへ橋渡しする旨を調査表・ステップ3に明記。
  - arch S-002: ヘルパー名が日付のみ整形にも使われる点を JSDoc で補足する方針を設計セクション・JSDoc 例に追記。
