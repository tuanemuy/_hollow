# Review 002 — Test 観点 (PR #729 / Issue #647) — Round 2 フル再レビュー

対象差分（テスト関連）:
- `app/components/common/__tests__/SectionErrorBoundary.test.tsx`（拡張）
- `app/components/common/__tests__/sectionFailureReportSchema.test.ts`（拡張）
- 実装: `app/components/common/SectionErrorBoundary.tsx` / `app/components/common/sectionFailureReport.ts`

実行確認: `pnpm vitest run app/components/common/__tests__/SectionErrorBoundary.test.tsx app/components/common/__tests__/sectionFailureReportSchema.test.ts` → **2 files / 23 tests passed**。

ミューテーション検証（本レビューで実施。検証後に実装は完全復元・`git diff` 空を確認）:
- 実装の dedup 早期 return（`SectionErrorBoundary.tsx:174` `if (lastReportedKey.current === dedupeKey) return;`）を削除 → arch S-002 テストが **赤**。
- `count` を「捕捉カウンタ」から「送信カウンタ」（送信時のみ +1）へ書き換え → arch S-002 テストが **赤**。
- 両ミューテーションで落ちることから、Round 1 B-001 で問題だった「dedup テストが vacuous（2回目の捕捉が発生していない）」は**解消**。retry 経路（`onReset` → `hasError=false` → Child 再マウント → 同一 resetKey で 2 回目の `componentDidCatch` 発火）が実際に走り、`count===3` の assertion が「捕捉回数であって送信回数ではない」ことを一意に固定している。

---

## Test

### Blockers

なし。

Round 1 B-001（dedup テストが vacuous）は解消済み。`SectionErrorBoundary.test.tsx:282-313`
"rolls up a retry-then-rethrow under the same resetKey to one send while count still increments (#647 arch S-002)"
が以下を厳密に検証している：
1. 初回捕捉 → 送信1回・`count===1`（`:286-289`）。
2. `invalidate.mockRejectedValueOnce` で retry を失敗させ `onReset()` → `hasError=false` に戻し Child を再マウント、同一 resetKey `"q=a"` のまま 2 回目の `componentDidCatch` を実際に発火（`:296-299`）。bare re-render 経路（`getDerivedStateFromProps` が `hasError=true` を維持しフォールバックを保持＝再捕捉しない）とは別の、本物の retry 経路を踏んでいる。
3. dedup により `reportMock` は 1 回のまま（`:303`）。
4. resetKey を `"q=b"` に変えて dedup を破り送信させ、その `count===3`（1→2 deduped→3 sent）で「丸められた 2 回目の捕捉も内部カウントされた」ことを間接かつ一意に証明（`:308-312`）。
ミューテーション検証どおり、2 回目の捕捉が空振りなら（dedup を消すと送信が 2 回になる／count を送信カウンタにすると 3 にならない）落ちる assertion になっており、非 vacuous。

### Warnings

- **[W-001]** 実装に追加された input clamp（`section.slice(0,100)` / `path.slice(0,2048)`、`SectionErrorBoundary.tsx:182,184`）に対するテストが無い
  - 理由: Round 1 後に N-004 対策として「over-long 入力を schema の max でクライアント側 truncate してから送る」コードが入った（plan には無い実装上の追加）。これは fire-and-forget 経路で `validateInput` の reject による silent drop を防ぐ意図だが、`section` が 101 文字以上のときに 100 文字へ丸めて送る／`path` が 2048 超で丸める、という挙動を固定するテストが無い。境界（100/2048）が `sectionFailureReportSchema.test.ts` で accept されることは担保されたが、SectionErrorBoundary 側で「丸めた結果がちょうど上限に収まる」回帰は守られていない。`.slice(0,100)` を誤って `.slice(0,99)` や削除に書き換えても全テスト緑。
  - 影響: 小。実害は「観測ログのわずかなノイズ or 稀な silent drop」に留まり UX には影響しない。ただし plan 外で入った防御コードが完全に未検証である点は記録に値する。
  - 提案（任意）: `section="x".repeat(150)` の境界でレンダリングし、`reportMock` 呼び出し payload の `section.length===100` を assert する 1 ケースを足すと clamp が固定される。

- **[W-002]** server fn handler（`reportSectionFailure.handler`）の `warn`/`event:"section_failure"` 構造化メタは自動テストで担保されていない（Round 1 N-005 から継続）
  - 理由: AC-3（`Logger` 経由・`event` タグ付き構造化ログ）と ADR-005（`kind` ではなく `event` キー）は handler 本体（`sectionFailureReport.ts:43-53`）で実装されているが、handler を直接呼ぶユニットテストが無く、スキーマ単体＋手動確認に委ねられている。将来 `event` が `kind` に書き戻される／`warn` が `error` に変わる回帰は自動テストでは検知できない。
  - 影響: 小〜中。`docs/test.md` Frontend 方針（「必要最小限。server function の wire 型境界は schema で大枠カバー」）に沿っており層方針上は許容。handler 直呼びは `errorResponseMiddleware`/`getContainer` の DI スタブが必要でコスト高。Blocker ではない。
  - 提案（任意）: もし AC-3 の構造的固定が必要なら、`getContainer` を `FakeLogger` 供給でスタブし handler を直接呼んで `logger.byLevel("warn")` のメタに `event:"section_failure"` が載ることを 1 本検証する。コスト対効果で見送りも妥当。

### Notes

- **[N-001]** Round 1 の指摘はすべて適切に解消・取り込み済み。
  - B-001（Blocker）→ arch S-002 テストを retry-then-rethrow に書き換えて解消（上記）。
  - W-001（count が resetKey 変化だけの検証）→ `:265-280`（resetKey 変化での増分）と `:282-313`（同一 resetKey 再捕捉での内部増分）の 2 ケースで「送信非依存の捕捉累積」セマンティクスを明示。
  - W-002（accept 境界値欠如）→ `sectionFailureReportSchema.test.ts:16-36` に上限ちょうど（section 100 / path 2048 / count 1000 / count 1）と空 path の accept を追加。off-by-one を捕捉できる。
  - W-003（mock entry の冗長性）→ 残置だが機能上正しく Warning 止まりだった通り、実害なし。

- **[N-002]** AC-2 negative assertion は厳格。
  - `SectionErrorBoundary.test.tsx:239-253` が payload を `toEqual` 完全一致＋キー集合 `sort` 一致＋`message`/`stack`/`error` 不在の三段で固める。スキーマ側 `.strict()`（`sectionFailureReport.ts:23`）＋ `sectionFailureReportSchema.test.ts:85-93` の extra キー拒否で二重に担保。実装ペイロードも 4 キー固定（`SectionErrorBoundary.tsx:181-186`）。redaction 詳細の混入は構造的に弾かれる。

- **[N-003]** スキーマ accept/reject 境界の網羅は十分。
  - reject: section 空/101、scope enum 外、path 2049、count 0/1.5/1001、必須欠落、extra キー。
  - accept: well-formed、上限ちょうど（100/2048/1000）、count 1、空 path。
  - off-by-one（max を 1 ずらす誤記）が accept 境界テストで検出可能。`path` の `.min` 無し（空許容）が意図であることも `:32-36` で固定された。

- **[N-004]** AC-6（送信失敗が UI を壊さない）の検証は妥当。
  - `:315-323` が `reportMock.mockRejectedValueOnce` でフォールバック文言保持を確認。実装は `void report(...).catch(() => {})`（`SectionErrorBoundary.tsx:187`）の fire-and-forget。`.catch` ハンドラの存在自体は実装レビュー側の担保（reject は next tick のため同期 assert では握り潰しを待たない）だが、AC-6 の主眼「UI を壊さない」は満たす。

- **[N-005]** 既存回帰（UX/a11y/retry/resetKey）は不変で温存。
  - happy-path 描画、role=alert フォールバック、fallbackHeading 順序（#649）、router invalidate filter（page/shell scope）、retry reset、resetKey clear/keep、pending spinner decorative（#636）、invalidation reject 時のフォールバック保持、の既存ケースが残存し全 pass。`@tanstack/react-start` を新規 `vi.mock` した影響で既存テストが壊れていないことを確認済み。AC-6「既存 UX/a11y 契約不変」は満たされている。

- **[N-006]** モック戦略は確立パターン（UserMenu / arch P-002）に忠実で過剰モックではない。
  - `serverFnChainStub` + `useServerFnRouter` + `vi.mock("../sectionFailureReport")` の三点セット。`createServerFn` チェーンの top-level 評価を回避しつつ `useServerFn(reportSectionFailure)` 戻り値を spy へ差し替える必要最小限の構成。実装詳細（チェーン中間メソッド名）には密結合していない。`{ data: payload }` の引数 assert は契約そのものなので妥当。

- **[N-007]** scope default 解決テストは有効（`:256-263`）。実装の default は関数引数デフォルト `scope="page"`（`:153`）で、injection 経路で undefined が `z.enum` に漏れる事故は引数デフォルトで解決済み。テストは結果値を正しく固定している。

- **[N-008]** 脆さは低い。
  - retry-then-rethrow テストは `invalidate.mockRejectedValueOnce` で意図的に retry を失敗させ再捕捉を作る（既存 "keeps the fallback when invalidation rejects" と同じ確立経路）。`shouldThrow` モジュール変数の取り回しは既存テストと同形で、各ケースが先頭で明示再設定しており実行順依存は無い。`window.history.replaceState` での path 設定もケース内で完結。
