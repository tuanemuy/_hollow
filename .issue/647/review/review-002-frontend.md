# Frontend レビュー Round 2（フル再レビュー） — PR #729 (Issue #647)

対象: `SectionErrorBoundary` が捕捉したセクション失敗を `reportSectionFailure` server fn 経由で `Logger` ポートへ流す実装。

レビュー範囲のファイル:
- `app/components/common/SectionErrorBoundary.tsx`
- `app/components/common/sectionFailureReport.ts`
- `app/components/common/__tests__/SectionErrorBoundary.test.tsx`
- `app/components/common/__tests__/sectionFailureReportSchema.test.ts`
- `app/components/_test-utils/serverFnMock.ts`（モック基盤・既存）
- `docs/runtime_cloudflare.md`（追記）

検証: `pnpm test:unit`（全 244 ファイル 3848 件 PASS）／`pnpm typecheck`（PASS）。

## 受け入れ基準（Frontend 関連）の検証

- **AC-1（componentDidCatch で報告送信）**: 満たす。`Boundary.componentDidCatch(_error, _info)` が `this.props.onCatch?.()` のみを呼ぶ（`SectionErrorBoundary.tsx:94-96`）。関数コンポーネント側で `useServerFn(reportSectionFailure)` を取得し（`:158`）、`onCatch` で fire-and-forget 送信（`:187 void report({ data: payload }).catch(() => {})`）。class は観測非依存に保たれる。テスト `:230-254` が「子 throw で報告 fn が1回呼ばれる」を検証。
- **AC-5（多重送信抑止＋count 増分）**: 満たす。`catchCount`（`useRef`）を捕捉ごとに +1（`:169`）、`lastReportedKey`（`useRef`）で `dedupeKey` 一致時は早期 return（`:174`）。同一 resetKey 再 throw → 送信は1回・`count` は増分、という arch S-002 のセマンティクスを `:282-313` で明示固定（1→2 deduped→3 sent と検証）。`count` のクランプ漏れもスキーマ `count ≤ 1000` で bounded（実害なし）。
- **AC-6（UX/a11y 不変・送信失敗が UI を壊さない）**: 満たす。`render` / `SectionErrorFallback`（`role="alert"`・fallbackHeading・retry・scope・resetKey）は無改変。既存 a11y/リトライ/resetKey テスト（`:129-228`）が無修正で PASS。report reject 時に fallback 維持を `:315-323` で検証。送信は `.catch(() => {})` で握り潰され、報告エラーが境界へ再 throw されない。

3基準とも、plan / ADR どおりに実装・テストされている。AC-2（最小情報・negative assertion）も `:239-253` の許可キー4つ限定＋`message`/`stack`/`error` 不在 assert、スキーマ `.strict()`（`sectionFailureReport.ts:23`）で構造的に担保。

## Round 1 指摘の解消確認

- **N-002（dedup キーの区切り文字衝突）**: 解消。`dedupeKey = JSON.stringify([section, resetKey ?? null])`（`:173`）に変更され、型混在（`12` vs `"12"`）・section 内セパレータの衝突が構造的に潰れた。コメントにも N-002 由来を明記。
- **N-004（over-long section の report サイレント drop）**: 解消。`section.slice(0, 100)` / `path...slice(0, 2048)`（`:182-184`）でスキーマ上限にクランプしてから送るため、`validateInput` reject による無音 drop が起きない。コメントに N-004 由来を明記。スキーマ側は `path` の `.min(1)` 不在を「意図的」とテストで明示（`sectionFailureReportSchema.test.ts:32-36`）＝Round 1 N-005 も意図確定。
- **N-001（StrictMode remount 跨ぎ dedup）**: 未コード化だが ADR/JSDoc に `StrictMode double-mount` を dedup 対象として言及（`:164`）。アプリ root に `StrictMode` は wired されておらず（grep 確認: 使用は `inlineEditor`/`Dialog` 等の局所のみ、router root には無し）、本番・dev とも発火しない。実害は将来 StrictMode 有効化時に「remount ごと最大1件の追加 warn」に留まり、フラッディング上限「1ページあたり境界数で bounded」は不変。Round 1 の低リスク評価は維持。下記 N-001 に再掲（情報の精緻化のみ）。

## クランプ（slice）導入による副作用の確認

`section.slice(0, 100)` の追加は新たな挙動だが問題なし:
- 報告 payload の `section` のみがクランプ対象で、**fallback UI に表示する `section`（`SectionErrorFallback` へ渡す prop）は無改変**（`:198` は元の `section` を渡す）。表示文言は不変＝AC-6 を侵さない。
- 現行 section ラベルは全て短い静的日本語（「ノート一覧」「ツールバー」等）でクランプは発火しない。クランプは将来の動的 section 名に対する防御で、観測の取りこぼし回避（正の効果）。

## React セマンティクス / hooks ルールの確認

- `useCallback` 依存配列 `[section, scope, resetKey, report]`（`:188`）は閉じ込めた全自由変数を網羅。`catchCount`/`lastReportedKey` は ref（identity 不変）なので依存不要で正しい。
- `useServerFn` / 2本の `useRef` / `useCallback` は class 外のトップレベルで無条件呼び出し＝hooks ルール準拠。注入形（arch P-001）の制約上 lazy 化不可だが、`useServerFn` の戻り値はラッパ関数で実コスト無視可（Round 1 N-003 と同評価、最適化不要）。
- `window.location.pathname` は client-only な `onCatch`（`componentDidCatch` 由来、SSR では発火しない）内でのみ参照され、SSR を汚さない。
- `resetKey` の条件付き spread（`:192`）と `getDerivedStateFromProps` の clamp（`prevResetKey` 比較）は既存挙動を保持。

## Frontend 観点での結論

Round 1 で挙げた堅牢性 Notes のうち修正可能な2件（N-002 / N-004）が実コードで解消され、実装はさらに堅くなった。React セマンティクス・hooks ルール・`useServerFn` 注入規約（B-001 前例）・fire-and-forget の非ブロッキング性・a11y/UX 不変・最小情報（AC-2）いずれも満たす。新たな Frontend 問題は検出されず。

### Frontend

#### Blockers
- なし

#### Warnings
- なし

#### Notes

- **[N-001]** StrictMode 二重 mount の dedup は「同一インスタンス内」前提で、mount→unmount→remount は突破しうる — `app/components/common/SectionErrorBoundary.tsx:162-166`
  `catchCount` / `lastReportedKey` は `useRef`＝インスタンスローカル。StrictMode の mount/unmount/remount サイクルでは2回目 mount で refs がリセットされ、remount 後の再 catch は dedup されず再送されうる。現状リスクは低い: アプリ root に `StrictMode` が wired されていない（grep 確認済み）ため本番・dev とも発火しない／フラッディング上限「1ページあたり境界数で bounded」は不変／`warn`＋小ペイロードでコスト小。Round 1 から状況変化なし（マージを妨げない）。将来 StrictMode を入れる際の誤解防止に JSDoc へ「dedup はインスタンス内、remount は対象外」と一文添える余地がある程度。

## まとめ

設計（plan / ADR）に忠実で、Round 1 の修正可能な Notes（N-002 / N-004）は解消済み。Blocker / Warning なし。残る Note 1件は本番非発火（StrictMode 未 wired）の将来向け留意で、マージ可。
