# Review 001 — Test 観点 (PR #729 / Issue #647)

対象差分:
- `app/components/common/__tests__/SectionErrorBoundary.test.tsx`（拡張）
- `app/components/common/__tests__/sectionFailureReportSchema.test.ts`（新規）
- 実装: `app/components/common/SectionErrorBoundary.tsx` / `app/components/common/sectionFailureReport.ts`

実行確認: `pnpm vitest run` で両ファイル 21 tests passed。

---

## Test

### Blockers

- **[B-001]** dedup（同一 resetKey 再 throw → 送信1回・count 増分）の中核ロジック `lastReportedKey` が実質テストされていない
  - 場所: `app/components/common/__tests__/SectionErrorBoundary.test.tsx:282-291`（"rolls up a re-throw under the same resetKey to one send while count still increments (#647 arch S-002)"）
  - 理由: このテストは 1) `renderBoundary(undefined, "q=a")` で捕捉→送信1回、2) 同じ resetKey `"q=a"` で再 render、を行い `reportMock` が 1 回のままであることだけを assert している。しかし実装の `getDerivedStateFromProps`（`SectionErrorBoundary.tsx:80-88`）は `resetKey === prevResetKey` のとき `hasError=true` を維持し、フォールバックを表示したまま **Child を再マウントしない**。つまり 2 回目の render では `componentDidCatch` は発火せず、`onCatch` も呼ばれない。よって「`reportMock` が増えない」のは `lastReportedKey` による dedup の結果ではなく、**そもそも 2 回目の捕捉が起きていない**から。
    - plan/テスト方針（arch S-002, plan.md:134/174）が要求したのは「同一 resetKey で**再 throw（再捕捉）させたとき**、送信は 1 回に丸められる一方で `count` は捕捉ごとに増分する」ことの明示検証。本テストは (a) 2 回目の捕捉を発生させていない、(b) `count` が増分する assertion が**存在しない**（テスト名に "while count still increments" とあるのに `count` を一切検証していない）、の二点で要求を満たさない。`lastReportedKey` 早期 return（`SectionErrorBoundary.tsx:171`）はデッドコードのままパスする。
    - 影響: AC-5 の「同一 resetKey 再 throw で送信1回・count 増分」が一意に検証されていない（レビュー指示の Test 観点 3 番目を直撃）。StrictMode 二重 mount・retry 後の再 throw という plan が挙げた多重送信シナリオも未カバー。
  - 提案: 同一 resetKey で `componentDidCatch` を実際に二度発火させるケースを足す。例えば `Boundary.reset()`（retry 経由）でいったん `hasError=false` に戻して Child を再マウント→再 throw させ、resetKey は不変のまま 2 回目の捕捉を起こす。そのうえで `reportMock` が 1 回のまま（dedup）かつ送信ペイロードの `count` が増えている（捕捉カウンタは進む）ことを assert する。retry → 再 throw は実装の `SectionErrorFallback.retry`（`SectionErrorBoundary.tsx:116-127`）の `onReset()` で `hasError=false` に戻る経路で再現できる（既存 "keeps the fallback when invalidation rejects" テストが同じ経路を使っている）。なお `count` は `componentDidCatch` ごとに増分するが、retry 経路では実際に Child が再 throw して初めて 2 回目の onCatch が走る点に注意。

### Warnings

- **[W-001]** AC-5 "increments count" テストは「resetKey 変化」だけを検証し「同一インスタンスでの捕捉累積」セマンティクスとは別物
  - 場所: `SectionErrorBoundary.test.tsx:265-280`
  - 理由: このテストは resetKey を `q=a`→`q=b` と変えて 2 回送信させ count 1→2 を確認する。これは AC-5 の「resetKey 変化で再送」（dedupeKey が変わるので送る）と「count 増分」を同時に通している点で有効。ただし dedupeKey が変わっているため、count 増分と「dedup を貫通した送信」が**同じ resetKey 変化で起きており**、count が「捕捉累積回数（送信が丸められても増える）」であることの証明にはなっていない（送信と捕捉が 1:1 で対応しているケースしか踏んでいない）。「送信が丸められても count は増える」という count のセマンティクス本体は B-001 の修正でしか担保されない。本テスト単体は誤りではないが、テスト名から読者が期待する「count = 捕捉累積（送信非依存）」の保証はここには無い、という認識を持つべき。

- **[W-002]** スキーマ単体テストに正常境界値（boundary OK 側）の検証が無い
  - 場所: `sectionFailureReportSchema.test.ts:16-54`
  - 理由: reject 側の境界（`section` 101 文字 / `path` 2049 文字 / `count` 0・1.5・1001）は丁寧に網羅されている。一方で「ちょうど上限は通る」accept 側（`section` 100 文字, `path` 2048 文字, `count` 1000, `count` 1）が無い。off-by-one（`.max(100)` を `.max(99)` に書き間違える等）が reject 側テストだけでは検出できない。`path` は `min` 指定が無く `""` を許容する仕様（実装 `z.string().max(2048)`）だが、空 path を accept する意図がテストで固定されていない（`window.location.pathname` は最低 `"/"` だが、スキーマ契約として空許容かは明示されていない）。
  - 提案: `section: "x".repeat(100)`, `path: "x".repeat(2048)`, `count: 1000` が success=true になる accept 境界ケースを 1 本足す。空 path 許容が意図なら `path: ""` の accept も明示。

- **[W-003]** `reportMock` の戻り値型と実態の乖離（過剰でないが将来の脆さ）
  - 場所: `SectionErrorBoundary.test.tsx:21`、`useServerFnRouter([[reportMock, reportMock]], reportMock)`（同 24 行）
  - 理由: `vi.mock("../sectionFailureReport")` で `reportSectionFailure` を `reportMock` に差し替え、かつ `useServerFn(reportSectionFailure)` も `reportMock` を返す二重差し替え。`useServerFnRouter` の entry `[reportMock, reportMock]` は「ref===reportMock のとき reportMock を返す」を意味し、`vi.mock` で `reportSectionFailure===reportMock` になっているので機能上は正しい。ただし fallback も `reportMock` なので entry が無くても動く（entry がドキュメント的役割しか持たない）。UserMenu パターン（`logOutMock` ひとつ）と同形で実態と乖離はないが、`reportSectionFailure` を直接参照する entry に書き換えると意図がより明確になる（`[reportSectionFailure, reportMock]`）。現状でも誤りではないため Warning 止まり。

### Notes

- **[N-001]** AC-2 negative assertion は厳格で良い
  - `SectionErrorBoundary.test.tsx:239-253` がペイロードを `toEqual` で完全一致＋キー集合 `sort` 一致＋`message`/`stack`/`error` 不在の三段で固めており、AC-2 の「許可キーのみ・redact 詳細を含まない」を構造的に担保している。スキーマ側 `sectionFailureReportSchema.test.ts:63-71` の `.strict()` による extra キー拒否（`message`/`stack` 混入）と二重で守られており、レビュー指示の最重要 AC-2 は十分。実装 `SectionErrorBoundary.tsx:175-180` のペイロード構築も 4 キー固定で一致。

- **[N-002]** AC-6（送信失敗が UI を壊さない）の検証は妥当
  - `SectionErrorBoundary.test.tsx:293-301` が `reportMock.mockRejectedValueOnce` でフォールバックが保持されることを確認。実装は `void report(...).catch(() => {})`（`SectionErrorBoundary.tsx:181`）で fire-and-forget。テストは reject を投げてもフォールバック文言が残ることを assert しており妥当。ただし `.catch(() => {})` が無い場合に unhandled rejection でテストが赤くなるか、という negative 側の保証までは無い（happy-dom + 同期 assert のため reject が next tick で握り潰されるのを待たずに通っている）。AC-6 は「UI を壊さない」が主眼なので現テストで足りるが、`.catch` ハンドラ自体の存在は実装レビュー側の担保。

- **[N-003]** 既存回帰（UX/a11y/retry/resetKey）は不変で温存されている
  - happy-path 描画・role=alert フォールバック・fallbackHeading 順序（#649）・router invalidate の filter（page/shell scope）・retry reset・resetKey clear/keep・pending spinner decorative（#636）・invalidation reject 時のフォールバック保持、の既存 8 ケースが残存し全て pass。`@tanstack/react-start` を新たに `vi.mock` した影響で既存テストが壊れていないことを確認済み。AC-6 の「既存 UX/a11y 契約不変」は満たされている。

- **[N-004]** モック戦略は確立パターン（UserMenu）に忠実で過剰モックではない
  - `serverFnChainStub` + `useServerFnRouter` + `vi.mock("../sectionFailureReport")` の三点セットは `UserMenu.test.tsx` と同形（plan arch P-002 準拠）。`createServerFn` チェーンの top-level 評価を回避しつつ `useServerFn` 戻り値を spy に差し替える必要最小限の構成で、実装詳細（チェーンの中間メソッド名等）には密結合していない。`reportMock` の引数（`{ data: payload }`）を assert している点だけが実装の呼び出し形に依存するが、これは契約そのものなので妥当。

- **[N-005]** server fn handler（`reportSectionFailure.handler`）の直接テストは無いが、層方針上許容
  - `sectionFailureReport.ts:43-53` の handler（`getContainer().logger.warn(...)` 転送）に対するユニットテストは無い。`event: "section_failure"` キーや `warn` レベル（AC-3）はテストでなく実装＋手動確認（`.issue/647/testing.md` 確認項目1）に委ねられている。`docs/test.md` の Frontend 方針「必要最小限。server function の wire 型境界は schema で大枠カバー」に沿っており、handler を直接呼ぶには `errorResponseMiddleware`/`getContainer` の DI スタブが要りコスト高。AC-3 はスキーマ＋手動でのカバーが層方針上は妥当。ただし「`event` キーであり `kind` でない」(ADR-005) の構造的担保は自動テストには無い点は記録しておく（将来 `kind` に書き戻される回帰は手動でしか気付けない）。

- **[N-006]** `scope` default 解決テストは有効だが injection 経路の本質を踏み切れていない
  - `SectionErrorBoundary.test.tsx:256-263` が scope 未指定で `"page"` 送信を確認。これは AC（arch S-004）を満たす。ただし実装の default 解決は関数引数デフォルト `scope = "page"`（`SectionErrorBoundary.tsx:152`）であり、plan が懸念した「injection 経路で undefined が `z.enum` に漏れる」事故は、関数コンポーネント引数で既に解決済み＝`onCatch` クロージャは常に解決済み `scope` を閉じ込む。テストは結果として正しい値を確認できているが、`scope ?? "page"` という防御コード（plan 想定）は実装に無く引数デフォルトのみ。テストとしては十分。
