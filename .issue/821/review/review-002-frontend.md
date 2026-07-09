# PR #823 レビュー (round 2 / フル再レビュー)

**観点:** Frontend
**対象:** PR #823 / Issue #821
**レビュー日:** 2026-07-10
**判定:** Approve（Blocker なし）

## 検証サマリー

`gh pr diff 823` で最新差分を取得。共有ヘルパー `dateFormat.ts` と全 15 の移行先、対象外の CalendarView/PublicNoteViews/listSelectors.groupNotesByDay を実コードで突合した。

受け入れ基準の Frontend 該当分（AC-1〜AC-7）はいずれも満たされている:

- **AC-1**: `app/components/common/dateFormat.ts` に `formatJstDateTime(iso, options)` が存在。`ja-JP` + `timeZone: "Asia/Tokyo"` 固定、NaN 入力で raw string 返却。`{ ...options, timeZone: "Asia/Tokyo" }` の順で TZ を最後に固定し、呼び出し側の誤 TZ 上書きを防ぐ設計も計画どおり。JSDoc に「presentation 層の責務」「date-only オプションなら date-only を返す（`toLocaleDateString` 代替）」を明記済み。
- **AC-2**: `__tests__/dateFormat.test.ts` が境界 instant `2026-01-01T16:00:00Z` で JST 側（`2026年1月2日` / `01:00`）を assert。加えて caller が `timeZone` を渡しても JST が勝つ spread-order 安全網テスト・NaN フォールバックテストあり。**実機で `TZ=UTC` / `TZ=America/New_York` 双方で走らせ同一結果を確認**（AC-2 の「ランナー TZ 非依存＝ UTC/Asia/Tokyo 同一出力」を実証）。テスト内コメントも Issue 提案との対応を明示。
- **AC-3**: client 経路（ProfileForm `formatTimestamp`/`formatDay`・SecurityForm `formatLoginTime`・PublishSettings `formatLastAccess`・TagList `formatLastUsed`・listSelectors `formatDate`・relativeTime 絶対フォールバック）すべてヘルパー経由に移行。オプション・シグネチャ・前後文字列・独自ガードを保存。
- **AC-4**: RSC 側（Dashboard `formatActivityTime`・NoteMetaPanel `formatDate`・NoteHistoryList・NoteRevisionDetail・TrashList `formatDate`）も移行。history 2 件は素の `toLocaleString()` から明示 `ja-JP` 日時オプションへ（ADR-002 の意図的変更）。
- **AC-5**: UsersTable `formatDate` / Jobs `formatDateTime` の #817 逐語ボイラープレート＋WHY コメントをヘルパー呼び出しへ集約。オプション不変で表示は不変。
- **AC-6**: CalendarView.tsx / PublicNoteViews.tsx は差分に含まれず未変更。listSelectors は `formatDate` のみ変更で `groupNotesByDay`（client 解決 TZ 渡し）は不変。対象外判断は正しく維持。
- **AC-7**: `pnpm typecheck` パス。affected 単体テスト（dateFormat / relativeTime / ProfileForm）24 件パス。`relativeTime.test.ts` の絶対フォールバック期待値（`2026-05-08T00:00:00.000Z` → `2026年5月8日`）は JST 09:00 同日で不変、追加修正不要という計画予測どおり。ProfileForm test は line 289 に `timeZone: "Asia/Tokyo"` を追加して期待値を再構築済み。

## Frontend

### Blockers
なし

### Warnings

- **[W-001]** ProfileForm の `mounted` ゲート説明コメントが本 PR の TZ 固定により陳腐化している。
  - 場所: `app/components/identity/ProfileForm/index.tsx:131-136`
  - 現状のコメントは「hints format instants in **the viewer's local timezone** … On the server (UTC) those render differently than on the client (local tz), so emitting them during SSR causes a hydration mismatch」と、**ローカル TZ 整形が mismatch 源**であることを mounted ゲートの根拠として挙げている。本 PR で `formatTimestamp` / `formatDay` が JST 固定になったため、この根拠はもはや成立しない（SSR/client で整形結果は一致する）。mounted ゲートが今も必要なのは `nextChange`（`nextUsernameChangeAt(..., new Date())` が**現在時刻**と比較するため SSR/client で結果が変わる）側の理由のみ。
  - 影響: 動作は正しい（ゲートは残っていて害はない）。ただしコメントが「整形 TZ が mismatch 源」と誤誘導するため、将来の読者が誤った箇所を触るリスクがある。加えて `最終保存: {formatTimestamp(user.lastSavedAt)}`（index.tsx:427-429）は固定 instant を JST 固定整形するだけになったので、**このフィールドに関しては mounted ゲートが冗長**（SSR 直描画しても mismatch は起きない）になった。
  - 提案: コメントを「残る mismatch 源は `nextChange` の現在時刻比較」に更新する。`最終保存` のゲート解除は表示挙動変更となりスコープ外なので任意（本 PR の趣旨は整形集約であり、ゲート設計 #571 ADR-007 の見直しは別 Issue が妥当）。最小対応としてはコメント更新のみで十分。

### Notes

- **[N-001]** `ProfileForm.formatDay` は `Date` 入力を `d.toISOString()` でヘルパーへ橋渡しする（計画 arch S-001 どおり、シグネチャ `formatDay(d: Date)` は不変に保たれている）。ただし無効な `Date` を渡すと `toISOString()` が `RangeError` を投げる（従来の `toLocaleDateString` は `"Invalid Date"` 文字列を返して throw しなかった）。唯一の呼び出し元 `formatDay(nextChange)`（index.tsx:475）は `nextChange !== null` ガード下でのみ呼ばれ、`nextUsernameChangeAt`（usernameCooldown.ts:24-32）が NaN を弾いた**有効な Date のみ**返すため、現状この throw は到達不能で実害なし。`formatDay` が汎用ヘルパーとして再利用された場合の潜在的な脆さとして記録に留める（今回の対応は不要）。
  場所: `app/components/identity/ProfileForm/index.tsx:94-100`

- **[N-002]** `TagList.formatLastUsed` は独自 NaN ガードのため `const d = new Date(iso)` を保持したまま、ヘルパーには `iso`（内部で再パース）を渡す二重パースになっている。`iso === null` → `"未使用"`、NaN → `"未使用"` という**独自フォールバック（ヘルパーの raw-string フォールバックとは異なる）は正しく保存**されており、機能的に正しい。二重パースはコスト無視できる範囲。`formatJstDateTime(d.toISOString(), ...)` に寄せる余地はあるが N-001 と同じ throw リスクを招くので現状維持で妥当。
  場所: `app/components/tag/TagList.tsx:38-46`

- **[N-003]** 移行全般の質が高い。各移行先で Intl オプション集合・関数シグネチャ・戻り値型・前後文字列（`最終使用 ` / `に保存`）・`<time dateTime>` 属性・独自ガード（TagList の `"未使用"`）が漏れなく保存されている。Dashboard は `Intl.DateTimeFormat().format()`（NaN ガードなし）→ ヘルパー（NaN ガードあり）への移行で NaN 時挙動が `Invalid Date` → iso 素通しに改善（計画 coverage S-003 どおり）。PublishSettings / TagList では陳腐化した「共有ヘルパーが無いのでローカル保持」旨の WHY コメントも適切に削除。relativeTime → dateFormat は同一 `common/` 内の相対 import で循環なし。

- **[N-004]** manual-test 結果（TC-01〜TC-08）でブラウザ TZ `America/New_York` にて全 8 ページ hydration warning ゼロを確認。特に UTC `2024-01-01T00:00` seed が ProfileForm で `2024年1月1日 09:00`、SecurityForm で `2024/01/01 9:00`（+9h）と JST 固定表示され、TZ 依存なら前日 19:00 になるはずのところがずれない決定的証拠が取れている。PublishSettings / NoteMetaPanel / 履歴系は seed データ不足で実機日付表示は未確認だが、ヘルパー単体テスト＋型チェックでカバーされており妥当。

---
**[W-001] → 修正済み（round-2）**: mounted ゲートの説明コメントを実態に合わせて更新。ゲートは `nextChange` の `new Date()` 依存（現在時刻比較）のために残す必要があり、TZ 整形は `formatJstDateTime` の JST ピンで SSR-safe になった旨に訂正。挙動変更なし。
