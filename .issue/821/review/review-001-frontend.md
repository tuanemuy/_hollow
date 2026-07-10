# PR #823 レビュー — Frontend 観点（review-001）

**対象:** PR #823 / Issue #821
**レビュー日:** 2026-07-10
**レビュー範囲:** 共有ヘルパー `formatJstDateTime` の API 設計、14 箇所の移行の挙動保存、対象外判断の維持、CLAUDE.md スタイル規約準拠。

## 検証サマリー

計画（plan.md）の判断表「修正」14 行すべてがヘルパー経由へ移行済みであることを diff で確認した。
「対象外」3 箇所（CalendarView / PublicNoteViews の date-key 整形・`groupNotesByDay`）は未変更で、`grep` でも
残存する `toLocale*` / `Intl.DateTimeFormat` はこの 3 箇所（と client TZ 解決）のみ。AC-1〜AC-7 の Frontend
関連基準はすべて満たされている。

- **AC-1**: `dateFormat.ts` に `ja-JP` + `timeZone: "Asia/Tokyo"` 固定・NaN で iso 素通しの `formatJstDateTime` が存在。✓
- **AC-2**: 単体テストが境界 instant `2026-01-01T16:00:00Z` で JST 側（`2026年1月2日` / `01:00`）を検証、NaN で素通しも検証。ランナー TZ 非依存の意図もコメントに明記。✓
- **AC-3 / AC-4 / AC-5**: client・RSC・#817 済みの全対象が移行済み。既存オプションは全て context 行として保持（変更行はボイラープレート除去のみ）。✓
- **AC-6**: 対象外 3 箇所は未変更（grep 実測で確認）。✓
- **AC-7**: `TZ=America/New_York pnpm vitest run`（dateFormat / relativeTime / ProfileForm）で 23 件全 PASS。✓

### Frontend

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** ヘルパー API 設計は計画どおりで正しい。`{ ...options, timeZone: "Asia/Tokyo" }` の順序で TZ を
  最後に固定し呼び出し側の誤上書きを防ぐ防御的設計、NaN ガードで入力素通し、オプション透過とも計画・ADR-002 と一致。
  JSDoc に「整形はプレゼンテーション層の責務」「日付のみオプションなら日付のみを返す（`toLocaleDateString` 相当の置換）」の
  WHY を集約しており、CLAUDE.md の「WHY のみ・逐語 WHY はヘルパーへ集約」規約に沿う。
  - 場所: `app/components/common/dateFormat.ts:1-21`

- **[N-002]** `toLocaleDateString` からの置換（UsersTable / TrashList / listSelectors / TagList / relativeTime /
  ProfileForm.formatDay）で内部実装が `toLocaleString` に変わるが、ECMA-402 の `ToDateTimeOptions(options,"any","all")`
  では日付フィールドのみ指定時に時刻デフォルトが付与されないため出力は日付のみで等価。単体テスト (a) `2026年1月2日` が
  この等価性を実証しており、表示挙動は保存されている。

- **[N-003]** `ProfileForm.formatDay(d: Date)` の `d.toISOString()` 橋渡しは正しい。呼び出し元
  `formatDay(nextChange)` の `nextChange` は `nextUsernameChangeAt`（`usernameCooldown.ts:24-27` で NaN ガードし
  invalid なら `null` を返す）由来で、`nextChange !== null` ガード下でのみ呼ばれるため、常に有効な `Date`。
  invalid Date で `toISOString()` が `RangeError` を投げる経路は存在しない。ラッパーのシグネチャ（`(d: Date) => string`）も不変。
  - 場所: `app/components/identity/ProfileForm/index.tsx:94-100`, `474-476`

- **[N-004]** RSC 系の移行は意図どおり。Dashboard は唯一 `Intl.DateTimeFormat("ja-JP",{...}).format()` からの移行で
  NaN ガードが新たに付与される（`Invalid Date` → iso 素通し、改善方向）。コメントも「viewer's locale time zone」→「in JST」に
  更新され表示実態と一致。history 2 件（NoteHistoryList / NoteRevisionDetail）はロケール・オプション未指定の
  `toLocaleString()` から明示 `ja-JP` 日時（`year/month:short/day/hour/minute`）へ変更され、ADR-002 の意図的改善に合致。
  `<time dateTime={...}>` の機械可読属性は不変でロケール差異による崩れなし。

- **[N-005]** TagList の「未使用」独自ガードが保持されている。`iso === null` と `Number.isNaN` 双方で `"未使用"` を返す
  固有分岐を残したまま、正常系のみヘルパー経由に置換。ヘルパー内部でも再度 parse する二重パースになるが、
  `"未使用"`（≠ iso 素通し）という固有フォールバックを保つための意図的なもので、計画の「固有ガード保持」方針と整合。挙動保存として妥当。
  - 場所: `app/components/tag/TagList.tsx:36-44`

- **[N-006]** `relativeTime.ts` の絶対フォールバック移行は、既存テスト `relativeTime.test.ts:34-35`
  （instant `2026-05-08T00:00:00.000Z` → 期待 `2026年5月8日`）を非 JST ランナーでも安定 PASS させる。
  移行前の TZ 未指定 `toLocaleDateString` は `America/New_York` 等の非 UTC ランナーで `2026年5月7日` となり得て
  latent なテスト脆弱性だったが、JST 固定でこれも解消。副次的な堅牢化。

- **[N-007]** 対象外判断（CalendarView:18 / PublicNoteViews:202 の date-key 整形、listSelectors:183 の
  `en-CA` + client 解決 TZ 引数の `groupNotesByDay`、CalendarView:39 / PublicNoteViews:168 の
  `Intl.DateTimeFormat().resolvedOptions().timeZone` 解決）は全て未変更。instant 非依存 or 閲覧 TZ 追従が正しい用途で、
  誤った巻き込みなし。AC-6 を満たす。

- **[N-008]** PublishSettings の `formatLastAccess` から削除された JSDoc は「listSelectors への cross-domain 依存を避けて
  local に持つ」理由の説明で、共有 `common/` ヘルパー採用によりその前提自体が消えるため削除は妥当。WHY の喪失なし。
