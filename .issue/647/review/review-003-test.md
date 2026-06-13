# Review 003 — Test 観点 (PR #729 / Issue #647) — Round 3 フル再レビュー

対象差分（テスト関連）:
- `app/components/common/__tests__/SectionErrorBoundary.test.tsx`
- `app/components/common/__tests__/sectionFailureReportSchema.test.ts`
- 実装: `app/components/common/SectionErrorBoundary.tsx` / `app/components/common/sectionFailureReport.ts`

実行確認: `pnpm vitest run app/components/common/__tests__/SectionErrorBoundary.test.tsx app/components/common/__tests__/sectionFailureReportSchema.test.ts`
→ **2 files / 25 tests passed**（R2 時点 23 → clamp テスト 2 本追加で 25）。

ミューテーション検証（本ラウンドで実施。検証後に実装を完全復元・`git diff` 空を確認）:
- `section.slice(0, 100)` → `.slice(0, 99)` に書き換え → clamp テスト
  (`SectionErrorBoundary.test.tsx:315-334`) が **赤**。`toHaveLength(100)` ＋
  `toBe(longSection.slice(0, 100))` の二段で off-by-one を確実に殺す＝非 vacuous。

---

## Test

### Blockers

なし。

### Warnings

- **[W-002（継続・据え置き妥当）]** server fn handler（`reportSectionFailure.handler`）の
  `warn` / `event:"section_failure"` 構造化メタは自動テストで担保されていない
  （`sectionFailureReport.ts:43-53`）。
  - 評価: 層方針上の許容は **妥当**。`docs/test.md` Frontend 方針（「必要最小限。
    server function の wire 型境界は schema で大枠カバー」）に明示的に沿う。handler 直呼びは
    `errorResponseMiddleware` + `getContainer` の DI スタブを要しコスト高で、得られるのは
    「`logger.warn` に `event` キーが載る」という1行の固定のみ。スキーマ単体（reject/accept
    境界）＋ R2 で実施済みのブラウザ E2E（実ログに `warn`/`event:"section_failure"` が出ることを
    確認済み）で実害はカバーされており、Blocker でも新規 Warning 昇格でもない。
  - 簡潔に閉じる手段（任意・コスト対効果次第）: `getContainer` を `vi.mock` で
    `{ logger: fakeLogger }` を返すスタブに差し替え、`reportSectionFailure` の
    `.handler` だけを抽出して直接 await し、`fakeLogger.byLevel("warn")` のメタに
    `event:"section_failure"` ／ level が `warn`（`error` でない）ことを 1 本固定する。
    ただし現状 handler は `createServerFn(...).handler(...)` でラップされ raw handler を
    export していないため、テスト用に handler 関数を取り出す小改修が要る。回帰検知価値
    （`event`→`kind` 書き戻し・`warn`→`error` 退行）と改修コストが拮抗するため、見送りも引き続き妥当。

### Notes

- **[N-001]** R2 W-001（clamp 未検証）は **解消**。
  - `SectionErrorBoundary.test.tsx:315-334`（section 150→100）と `:336-350`（path 3000→2048）の
    2 ケースが追加。いずれも `toHaveLength(上限)` ＋ truncate 後 prefix の `toBe` 一致で固定。
    ミューテーション検証どおり `.slice(0,99)` 系の off-by-one／削除を殺す。plan 外で N-004 対策として
    入った防御コード（fire-and-forget 経路での silent drop 回避）が回帰保護下に入った。

- **[N-002]** R2 で確認した dedup/count 非 vacuous は本ラウンドでも維持。
  - `:282-313`（arch S-002）が retry-then-rethrow（`invalidate.mockRejectedValueOnce` で
    retry を失敗させ同一 resetKey のまま 2 回目の `componentDidCatch` を実発火）→ dedup で
    送信 1 回維持・`count` は内部で +2 進行（最終 `count===3`）を厳密検証。「count は捕捉カウンタで
    あって送信カウンタではない」を一意固定。`:265-280`（resetKey 変化での増分）と合わせ 2 経路で担保。

- **[N-003]** AC-2 negative assertion は厳格（`:230-254`）。
  - payload の `toEqual` 完全一致＋キー集合 `sort` 一致＋`message`/`stack`/`error` 不在の三段。
    実装ペイロードも 4 キー固定（`SectionErrorBoundary.tsx:181-186`）。スキーマ側 `.strict()`
    （`sectionFailureReport.ts:23`）＋ `sectionFailureReportSchema.test.ts:85-93` の extra キー拒否で
    二重担保。redaction 詳細の混入は構造的に弾かれる。コメント（`SectionErrorBoundary.tsx:90-93`）も
    「error/info は受け取るが送らない」意図を明示しており plan arch S-001 を満たす。

- **[N-004]** スキーマ accept/reject 境界の網羅は十分。
  - accept: well-formed、上限ちょうど（section 100 / path 2048 / count 1000）、count 1、空 path。
  - reject: section 空/101、scope enum 外、path 2049、count 0/1.5/1001、必須欠落、extra キー。
    off-by-one（max を 1 ずらす誤記）が accept 境界テストで検出可能。`path` の `.min` 無し（空許容）が
    意図であることも `:32-36` で固定。SectionErrorBoundary 側 clamp 上限（100/2048）とスキーマ max が
    一致しており、clamp 後の値が必ず schema を通る整合も両テストで間接的に守られている。

- **[N-005]** AC-6（送信失敗が UI を壊さない）の検証は妥当（`:352-360`）。
  - `reportMock.mockRejectedValueOnce` でフォールバック文言保持を確認。実装は
    `void report(...).catch(() => {})`（`SectionErrorBoundary.tsx:187`）の fire-and-forget。
    reject は next tick のため同期 assert では握り潰し完了を待たないが、AC-6 の主眼
    「report 失敗が render を壊さない」は満たす。

- **[N-006]** 既存回帰（UX/a11y/retry/resetKey）は不変で温存・全 pass。
  - happy-path、role=alert フォールバック、fallbackHeading 順序（#649）、router invalidate filter
    （page/shell scope）、retry reset、resetKey clear/keep、pending spinner decorative（#636）、
    invalidation reject 時のフォールバック保持。`@tanstack/react-start` を `vi.mock` した影響で
    既存テストが壊れていないことを確認済み。AC-6「既存 UX/a11y 契約不変」は満たされている。

- **[N-007]** モック戦略は確立パターン（UserMenu / arch P-002）に忠実で過剰モックではない。
  - `serverFnChainStub`（`then` 除外で誤 await 防止）＋ `useServerFnRouter`（identity-dispatch・
    unmatched は throw）＋ `vi.mock("../sectionFailureReport")` の三点。`createServerFn` チェーンの
    top-level 評価を回避しつつ `useServerFn(reportSectionFailure)` 戻り値を spy へ差し替える必要最小限。
    実装詳細（チェーン中間メソッド名）に密結合しない。`{ data: payload }` の引数 assert は契約そのもの。

- **[N-008]** 脆さは低い。
  - clamp path テスト（`:336-350`）は `window.history.replaceState` で path を設定し、assert も
    `window.location.pathname.slice(0, 2048)` と実 pathname に追従させており、happy-dom の pathname
    正規化に対してハードコード比較ではなく堅牢。`shouldThrow` モジュール変数は各ケース先頭で明示再設定
    （実行順依存なし）。clamp section テストは `renderBoundary` を介さず直接 `root.render` で long section を
    渡す自己完結形。新たな flakiness 要因は無い。

- **[N-009]** 新たな問題は検出されなかった。R1〜R2 の指摘（B-001 / W-001 / W-002 / W-003）はすべて
  解消または層方針上の許容として整理済み。
