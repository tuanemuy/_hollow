# Frontend レビュー Round 3（フル再レビュー） — PR #729 (Issue #647)

対象: `SectionErrorBoundary` が捕捉したセクション失敗を `reportSectionFailure` server fn 経由で `Logger` ポートへ流す実装。

レビュー範囲のファイル:
- `app/components/common/SectionErrorBoundary.tsx`
- `app/components/common/sectionFailureReport.ts`
- `app/components/common/__tests__/SectionErrorBoundary.test.tsx`
- `app/components/common/__tests__/sectionFailureReportSchema.test.ts`
- `app/routes/__root.tsx`（server fn 登録 import の追加）

検証: `pnpm test:unit`（244 ファイル / 3850 件 PASS）／`pnpm typecheck`（PASS）。

## Round 2 からの差分

フロントエンドの実コード（`SectionErrorBoundary.tsx` / `sectionFailureReport.ts` / 両テスト）は Round 2 レビュー時点から**バイト単位で不変**（両ファイルに触れた最終コミットは Round 1 修正の `9c0897df`）。Round 2 以降に PR に入った唯一の差分は `app/routes/__root.tsx` への `import "@/components/common/sectionFailureReport"` 追加で、これは `"use client"` の `SectionErrorBoundary` チェーン経由でしか到達しない server fn を RSC ビルドの静的グラフに登録して未登録ルートでの 500 を防ぐ措置（#718 と同型）。presentation 層の transport 登録であり、レンダリング／hooks／UX には影響しない。`_app/*`・`admin/*`・public note（`u/*` / `notes/public/*`）すべてから `SectionErrorBoundary` が使われている（grep で 19 ファイルの利用を確認）ため、all-routes root への一括登録は ADR-006 の未認証公開受け口方針とも整合し、登録漏れによる経路依存の 500 を残さない正しい配置。

## 受け入れ基準（Frontend 関連）の検証

- **AC-1（componentDidCatch で報告送信）**: 満たす。`Boundary.componentDidCatch(_error, _info)` が `this.props.onCatch?.()` のみ呼ぶ（`SectionErrorBoundary.tsx:94-96`）。関数コンポーネント側で `useServerFn(reportSectionFailure)` を取得（`:158`）し、`onCatch` で fire-and-forget 送信（`:187 void report({ data: payload }).catch(() => {})`）。class は section / scope / path / reporting を一切知らない観測非依存（arch P-001）。テスト `:230-254` が「子 throw で報告 fn が1回・許可キーのみで呼ばれる」を検証。

- **AC-5（多重送信抑止＋count 増分）**: 満たす。`catchCount`（`useRef`）を捕捉ごとに +1（`:169`）、`lastReportedKey`（`useRef`）で `dedupeKey` 一致時は早期 return（`:174`）。同一 resetKey の retry-then-rethrow → 送信1回・`count` は増分（1→2 deduped→3 sent）を `:282-313` で固定。新 resetKey での再 catch → count 2 を `:265-280` で検証。`count` は実送信回数ではなく境界インスタンスの累積捕捉回数というセマンティクスがテストで明示固定済み。クランプ漏れもスキーマ `count ≤ 1000` で bounded（実害なし）。

- **AC-6（UX/a11y 不変・送信失敗が UI を壊さない）**: 満たす。`render` / `SectionErrorFallback`（`role="alert"`・fallbackHeading・retry・scope・resetKey・装飾 Spinner）は無改変。既存 a11y / リトライ / resetKey テスト（`:93-228`）が無修正で PASS。report reject 時に fallback 維持を `:352-360` で検証。送信は `.catch(() => {})` で握り潰され、報告エラーが境界へ再 throw されない。

AC-2（最小情報・negative assertion）も `:239-253` の許可キー4つ限定＋`message`/`stack`/`error` 不在 assert、スキーマ `.strict()`（`sectionFailureReport.ts:23`）＋スキーマテストの「extra keys 拒否」（`sectionFailureReportSchema.test.ts`）で構造的に担保。

## ゼロベース再検証（観点別）

- **componentDidCatch → useServerFn 注入**: class の `componentDidCatch` 内で hooks は呼べないため、関数コンポーネントで `useServerFn(reportSectionFailure)` を解決し `onCatch` コールバックとして注入する形（arch P-001 / B-001 前例）に完全準拠。raw server fn の直接 import 呼び出しは存在しない。正しい。

- **useCallback 依存配列**: `[section, scope, resetKey, report]`（`:188`）は `onCatch` が閉じ込めた自由変数を網羅。`catchCount` / `lastReportedKey` は `useRef`（identity 不変）なので依存に含めないのが正しい。`window` はグローバルで依存対象外。過不足なし。

- **dedup（JSON.stringify）**: `JSON.stringify([section, resetKey ?? null])`（`:173`）。型混在（`12` vs `"12"`）・section 内セパレータ衝突を構造的に回避（N-002 解消済み）。`resetKey ?? null` で undefined を null に正規化し、JSON 表現を安定化。健全。

- **count**: 捕捉ごとに無条件 +1（`:169`）、送信前に dedup 判定（`:174`）。dedup されても count は進む＝捕捉カウンタとして一貫。

- **clamp**: `section.slice(0, 100)` / `path.slice(0, 2048)`（`:182-184`）でスキーマ上限にクランプしてから送るため、fire-and-forget 経路で `validateInput` reject による無音 drop が起きない（N-004 解消済み）。fallback UI に渡す `section`（`:198`）は元値で無改変＝表示文言不変。境界値テスト（exactly 100 / 2048）でオフバイワン変異も捕捉。

- **fire-and-forget**: `void report(...).catch(() => {})`（`:187`）。reject を握り潰し UI 非ブロッキング。AC-6 テストで担保。

- **UX / a11y 不変**: fallback DOM・`role="alert"`・retry・スピナー decorative・fallbackHeading の document order すべて既存テストで無修正 PASS。回帰なし。

- **perf**: `useServerFn` の戻り値はラッパ関数で実コスト無視可。`useCallback` で `onCatch` を安定化。再レンダリングコストは無視できる範囲。最適化不要。

## Round 1 / Round 2 指摘の状態

- **N-002（dedup 区切り衝突）**: 解消（`:173` JSON.stringify）。
- **N-004（over-long の無音 drop）**: 解消（`:182-184` clamp）。
- **N-001（StrictMode remount 跨ぎ dedup）**: 未コード化だが、router root に `StrictMode` は wired されていない（grep 再確認: 使用は `inlineEditor` テスト / `InlineEditor` / `Dialog` の局所のみ、`__root.tsx` には無し）。本番・dev とも非発火。将来 StrictMode 有効化時も影響は「remount ごと最大1件の追加 warn」に留まり、フラッディング上限「1ページあたり境界数で bounded」は不変。低リスク評価を維持（下記 N-001 に再掲）。

## Frontend 観点での結論

Round 2 から実コードは不変で、追加された `__root.tsx` の server fn 登録は presentation の登録漏れ防止であり frontend 挙動を変えない。AC-1 / AC-5 / AC-6 はいずれも満たし、componentDidCatch→useServerFn 注入・useCallback 依存・dedup・count・clamp・fire-and-forget・UX/a11y 不変・perf いずれにも新たな問題は検出されない。テスト 3850 件・typecheck とも PASS。

### Frontend

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- **[N-001]** StrictMode 二重 mount の dedup は「同一インスタンス内」前提で、mount→unmount→remount は突破しうる — `app/components/common/SectionErrorBoundary.tsx:162-166`
  `catchCount` / `lastReportedKey` は `useRef`＝インスタンスローカルのため、StrictMode の mount/unmount/remount サイクルでは 2 回目 mount で refs がリセットされ remount 後の再 catch は再送されうる。リスクは低い: router root に `StrictMode` 未 wired（grep 確認済み）で本番・dev とも非発火／フラッディング上限「1ページあたり境界数で bounded」は不変／`warn`＋小ペイロードでコスト小。マージを妨げない。将来 StrictMode 導入時の誤解防止に JSDoc へ「dedup はインスタンス内、remount は対象外」と一文添える余地がある程度。Round 2 から状況変化なし。

## まとめ

設計（plan / ADR）に忠実。Round 1 の修正可能 Notes（N-002 / N-004）は解消済み。Round 2 → Round 3 で frontend 実コードは不変、追加差分（`__root.tsx` 登録）も frontend 挙動に影響なし。Blocker / Warning なし。残る Note 1 件は本番非発火の将来向け留意で、マージ可。
