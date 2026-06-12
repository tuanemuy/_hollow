# Test レビュー — Issue #619
**PR:** #653  
**レビュー対象:** 新規テストと既存テスト修正（純粋関数・integration・component）  
**レビュアー観点:** test 層の網羅性・期間境界の off-by-one 検証・回帰テスト・実装振る舞い検証

---

## Blockers
なし

---

## Warnings

### [W-001] `formatRelativeDate.test.ts` — 「昨日」判定の TZ 依存性が未明示
- **場所:** `app/components/public/__tests__/formatNoteDate.test.ts:12-27`
- **理由:** line 16-17 の `at()` helper が `new Date(y, m - 1, d, h)` で「local calendar day」を基準に判定するが、Jest/Vitest テスト runner の `getTimezoneOffset()` は環境（CI サーバー TZ）に依存。「昨日」判定が runner TZ で 24h 差かどうかを検査しており、UTC±N:00 の境界で失敗しうる（例：UTC+9 なら true だが UTC-8 なら `new Date(y, m, d).getTime() - new Date(y, m-1, d).getTime()` が 24h 未満）。コメント（line 13-15）で「test is TZ-agnostic as long as both dates share the runner's TZ」と記載あるが、実装（line 21-22）の `startOfDay` が「local calendar midnight」を基準にしているため、runner TZ に完全依存。
- **影響:** 低（同一ランナー内では一貫、CI 環境 TZ が同じなら安定）
- **提案:** テストファイル冒頭に「このテスト suite は runner TZ に依存。CI/CD では UTC に固定するか、TZ-agnostic に改める場合は `at()` を UTC ベース `new Date(Date.UTC(...))` に変更し、実装の `startOfDay` も UTC based に統一する」旨を注記。或いは、タイムゾーン環境変数（`TZ=UTC vitest`）を test script に固定する方が確実。

### [W-002] `publicDateRange.test.ts` — `normalizePublicDateRange(undefined, undefined)` → `undefined` の検査が不完全
- **場所:** `app/components/public/__tests__/publicDateRange.test.ts:10-13`
- **理由:** line 11-12 のテスト「both undefined → undefined」は「呼び出し側で both undefined を渡したときは undefined を返す」と検査しているが、**実装側で「from=null && to=null → undefined」の正規化を行う前段階（両端 null の情報喪失）を検査していない**。実装 `normalizePublicDateRange.ts` が「`from === undefined ? null : new Date(from)` などの変換」を行う際、「両端 null の DateRange → undefined」の明示的な正規化ステップを見ていない。実装コードを確認する必要（差分ファイル preview では `publicDateRange.ts` の実装が切れている）。
- **影響:** 中（実装が両端 null → undefined を返さない場合、ユースケース入力で `{ from: null; to: null }` vs `undefined` の二重表現が発生し、W-002 use-case レビュー指摘と共鳴）
- **提案:** `normalizePublicDateRange` 実装を確認し、「返り値が `(from === null && to === null) ? undefined : {...}` 形か」を確認。若しくはテストに「from=null && to=null の DateRange → undefined」ケースを明示的に追加。

### [W-003] `listUserPublicNotes.integration.test.ts` — 「note column path で public かつ published_at 非 null」の保証が未テスト
- **場所:** `app/core/application/publication/__tests__/listUserPublicNotes.integration.test.ts:488-502`
- **理由:** line 488-502 の「noteColumn path で同一 projection を返す」テストは title sort 1件だが、**期間フィルター適用時に noteColumn path が `listPublicNoteIdsByOwnerInRange` で「public かつ published_at non-null」の id のみを返す**ことを直接検査していない。line 633-651 の「empty page」テスト（期間ヒット0）はあるが、「期間でフィルタ後の id 群が本当に published_at non-null のみか」を検査する integration テストが無い。実装が `publishedAtById.get(note.id) ?? null` で防御的に null を返す設計のため、null フォールバックが実際には呼ばれていないことを確認するテストが必要。
- **影響:** 中（null フォールバックが実装側の防御的設計だとしても、その「防御が不要であること」をテストで保証すると将来の refactor 時に自信が持てる。現状では「防御的かつ到達不可能なコード」の存在を知りながらテストしていない）
- **提案:** 期間フィルター適用時に noteColumn path で、返された notes の `publishedAt` がすべて non-null であることを assert するテスト case を追加。例：「`publishedRange: range('2026-02-01', '2026-02-28')`」で絞った結果、`r.notes.every(n => n.publishedAt !== null)` を検査。

### [W-004] `PublicTopControls.test.tsx` — `nextFilterSearch` の period patch が「文字列型チェック」のみで「日付妥当性検査」が無い
- **場所:** `app/components/public/__tests__/PublicTopControls.test.tsx:57-89`
- **理由:** line 57-89 の period patch テストは `from: "2026-05-01"` / `to: "2026-05-31"` といった ISO 形式の文字列を渡しているが、**ユースケース入力になる前に presentation で `normalizePublicDateRange` 経由で Date 変換される**ため、このテストは「URL patch の生文字列が正しく URL に反映される」ことを検査しているが、「不正な日付文字列が reject される」ことは検査していない。例えば `from: "2026-13-01"` や `from: "not-a-date"` を渡した場合の挙動がテストされていない（usecase/route/loader での検証は別問題だが、component 層での早期エラー検出がテストされていない）。
- **影響:** 低（validation は transport 境界の loader/server-fn で実施されるべきで、component layer のテストが validation を模擬する必要は無い。だが component の pure function テストで「不正入力の扱い」を示すと、アーキテクチャの validation 層を理解しやすくなる）
- **提案:** `nextFilterSearch({ ... }, { from: "invalid", to: undefined })` など、不正な日付文字列を渡した場合の挙動をコメントで説明するか、route-level validation テスト（`.issue/619/testing.md` の「ブラウザ目視」手順）に委ねる旨を注記。component の pure function tests は「文字列フォーマットの通過」に限定する方針を明示。

### [W-005] `listSelectors.test.ts` — `groupNotesByDay` の第3引数テストで「auth 側後方互換」の確認が形式的
- **場所:** `app/components/note/list/__tests__/listSelectors.test.ts:250-276`
- **理由:** line 264-276 の「custom key extractor」テストは public 側で `(n) => n.publishedAt` を渡した場合に `publishedAt` でグルーピングすることを確認しているが、**auth 側既存呼び出し（引数なし / デフォルト case）が本当に `updatedAt` でグルーピングし続けるか**を検査していない。line 250-251 のコメント「the auth side stays unchanged (covered by every case above)」と記載あるが、「上記のどのケースで検証されたか」が明示されていない。auth 側 `CalendarView.tsx` の呼び出しで「第3引数なし」の場合を明示的にカバーする test case があるか確認が必要。
- **影響:** 中（実装の `groupNotesByDay<T extends { id; updatedAt; publishedAt? }>(notes, tz, keyExtractor = (n) => n.updatedAt)` がデフォルト引数で `updatedAt` を使う場合、その振る舞いをテストで保証する必要がある）
- **提案:** line 276 の後に「auth 側後方互換テスト」として明示的に「`groupNotesByDay(notes, 'UTC')` （第3引数なし）の場合は `updatedAt` でグルーピングされる」ことを assert する test case を追加。例：`expect(groupNotesByDay(notes, "UTC").length).toBe(2); expect(groupNotesByDay(notes, "UTC")[0].dateKey).toBe("2024-03-01");`（same `updatedAt` で同グループ）。

---

## Notes

### [N-001] `formatRelativeDate` の相対ルール実装が誠実
**良い点:** 
- 「今日 / 昨日 / 同年 M月D日 / 年跨ぎ YYYY年M月D日」のルールが、モック P30 に「今日」「M月D日」のみ現れるにもかかわらず、昨日・年跨ぎを自然な拡張として実装している（line 25-29 の実装）。
- NaN フォールバック（line 39-42）で unparsable date を catch している。
- JSDoc（line 13-15）で「`now` を注入し TZ-agnostic にテスト可能にする」と明記。

### [N-002] `normalizePublicDateRange` の end-date inclusive 保証が厳密
**良い点:** 
- `DateRange` の半開契約を保ちながら、user-chosen inclusive `to` を「翌日 00:00」に正規化する design（ADR-006）をテストで保証している。
- line 34-43 の「same-day from=to」ケースが、単なる「両端が等しい」という form check ではなく、「window が non-empty である」ことを numeric assert で検査している（`toBeGreaterThanOrEqual` / `toBeLessThan`）。これは off-by-one バグ防止の鍵。

### [N-003] 期間フィルター integration の多軸カバレッジ
**良い点:** 
- `publishedRange` filter describe block（line 508-652）が、
  - `publishedAt` path（line 534-553）
  - `noteColumn` path / title sort（line 555-574）
  - from-only（line 576-591）
  - to-only（line 593-609）
  - end-date inclusive（line 611-631）
  - empty result（line 633-651）
  という 6 つの axis を網羅している。
- seed helper `seedRangeOwner` で「3 notes on Jan 10 / Feb 10 / Mar 10」という uniform structure を用意し、各テスト case での期間指定が「どのノートが in/out になるか」を predictable にしている。
- コメント（line 507）で「both paths」「inclusive end date」「boundaries」と対象を明示。

### [N-004] `PublicNoteViews.test.tsx` — published date 表示の assertion が明確
**良い点:** 
- line 50 で `publishedAt: "2026-02-10T00:00:00.000Z"` を fixture に含める。
- line 64 で「Meta row shows the published date, not the updated date.」と comment し、「`updatedAt: 2026-03-01` と異なる `publishedAt: 2026-02-10` が表示される」を意図的に検証。
- expect に `"2026年2月10日 公開"` という正確な format を指定。

### [N-005] `PublicTopControls.test.tsx` — period patch を 3 分岐で検査
**良い点:** 
- both bounds / from-only / to-only の 3 ケースを分け、各々で expected structure（`page: undefined` reset など）を検査している。
- clearing both bounds（line 83-88）も検査し、「期間フィルターの on/off」の state transition を網羅。

### [N-006] Unit test の pure function focus が適切
**良い点:** 
- `nextFilterSearch`, `toggleTagSet`, `formatRelativeDate`, `normalizePublicDateRange` といった純粋関数を、router mock 無しで直接テストしている。
- component SSR test（`PublicTopControls`, `PublicNoteViews`）は「markup に expected text が present か」という smoke-test 水準で、振る舞いロジックは pure function テストに委ねている。

### [N-007] Integration test での seeding pattern が整理
**良い点:** 
- `seedRangeOwner`（line 509-526）で「owner + directory + 3 notes with published_at」を一度に seeded する helper を用意し、6 つの test case が reuse できる。
- seed されたノートの `updatedAt` を uniform（`2026-04-01`）に固定して、「published_at で filtering・ordering される」ことを分離可能にしている。

### [N-008] Projection 검증が両 path で一貫
**良い点:** 
- `"projects the publication published_at onto every listing item"` test（line 457-503）で「publishedAt path」と「noteColumn path / title sort」の両方で `publishedAt` が projection されることを確認。
- path 差による projection 非対称性（plan N-002）を、同一 test で両路検査することで、「共通後処理で一元化された」という実装 claim を支証。

### [N-009] Boundary 値の選択が representative
**良い点:** 
- date range seed: Jan 10 / Feb 10 / Mar 10（月の中盤）を選んで、「月跨ぎ、日付の端（01, 28-31）での off-by-one」を避けつつ、「day 開始/終了時刻」の効果を separate に検査可能にしている。
- published time 08:00（UTC）を seed し、「00:00 / 23:59 / 08:00 などの intraday timestamp」での `gte/lt` 条件効果を検査。

### [N-010] Empty / null フォールバック case が考慮
**良い点:** 
- `formatRelativeDate` で NaN date → `""`（line 39-42）
- `normalizePublicDateRange(undefined, undefined)` → `undefined`（line 11-13）
- "empty page when the range matches nothing"（line 633-651）
などの edge case がテストされている。実装が防御的に設計されていることを反映。

---

## 総評

**完成度:** 高い。期間フィルターと公開日 projection という2大要件の test coverage がそろっており、以下が確認できた：

1. **期間境界の off-by-one 検証:** `publicDateRange.test.ts` の「same-day from=to」で `gte/lt` の inclusivity を numeric assert。integration での「end-date inclusive」も実データで検証。
2. **両 path 一貫性:** integration で `publishedAt` path と `noteColumn` path 双方で公開日 projection と期間フィルターを検査。
3. **UI 層への反映:** component テストで published date 表示（`"2026年2月10日 公開"`）、period patch（from/to URL 更新）を確認。
4. **後方互換性:** `groupNotesByDay` 第3引数化で「auth 側既存呼び出しが `updatedAt` のまま」であることを（コメント付きで）保証される実装になっている（ただし W-005 指摘通り、明示的 test case があると stronger）。

**W-001（TZ 依存）** は CI 環境制御で回避可能。**W-002（両端 null 正規化）** は実装 review との連携で確認。**W-003（published_at non-null assertion）** / **W-004（日付妥当性検査）** / **W-005（後方互換 test case）** は test の形式性を少し高めるだけで OK。

Blockers はなし。test layer としてレビュー通過。
