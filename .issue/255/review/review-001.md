# PR Review #001 — Issue #226 follow-up refactor (Issue #255)

**PR:** #266
**Date:** 2026-05-28
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 8
- Notes: 22
- Verdict: **BLOCKED** (Warnings をすべて潰してから APPROVED)

---

## Frontend / Components

### Blockers
なし

### Warnings

- **[W-F-001]** `admin/Jobs/index.tsx` で `IngestionJobDTO.errorReason` がそのままクライアントへ流出している
  - 場所: `app/components/admin/Jobs/index.tsx:8, 207-208, 294-295`
  - 理由: ADR-001 のゴールは「`errorReason` の内部実装漏洩を境界で構造的に遮断」。owner 側の Wire 化は完了したが admin 経路は `IngestionJobDTO` を `"use client"` コンポーネントに直接渡し `{job.errorReason}` を表示しており、原則が片肺。
  - 提案: 別 Issue でフォローアップ起票し、ADR-001 に "admin/Jobs 経路は本 PR スコープ外" を明記して将来の盲点を防ぐ。

- **[W-F-002]** `useServerFnRouter` の `fallback` が単一インスタンスを共有
  - 場所: `app/components/_test-utils/serverFnMock.ts:22-27`
  - 理由: リファクタ前は `useServerFn` が未マッチ時に **dispatch ごとに新しい `vi.fn()`** を返していた。新実装は `fallback` を mock 設定時に 1 回評価して同一インスタンスを毎回返すため、未マッチ呼び出しの回数累積が発生する。
  - 提案: `fallback` を factory 化（`fallback?: () => T`）するか、未マッチ時は throw して loud にする。

- **[W-F-003]** `useServerFnRouter` の戻り値型が `T | undefined` のままで production の `useServerFn` シグネチャと非互換
  - 場所: `app/components/_test-utils/serverFnMock.ts:22-27`
  - 提案: 関数オーバーロード等で `fallback` 有無に応じて戻り型を切り替える。または未マッチ時を throw に変えて `T` を返すように統一。

- **[W-F-004]** `app/components/_test-utils/` が production component tree に同居
  - 場所: `app/components/_test-utils/serverFnMock.ts`
  - 理由: 既存テスト規約は `__tests__/` だが、本 PR で新ディレクトリ `_test-utils/` を追加。
  - 提案: 配置の妥当性を ADR で確認（vitest の include パターンから漏れない事実を記録）か、`__tests__/_utils/` に寄せる。

- **[W-F-005]** `directoryTree.ts` の JSDoc にある "server-only" 記述が事実と乖離
  - 場所: `app/components/note/directoryTree.ts:6-9`
  - 理由: `loaders.ts` には `"use server"` も `import "server-only"` も無く構造的には通常モジュール。"server-only" と書くと保守者が誤解する。
  - 提案: 文言を「`loaders.ts` は server-side data loader 専用モジュールで pure helper を混ぜると関心の分離が崩れる」程度に修正。

### Notes
- N-F-001〜N-007 は review-001 source 参照。要約: ADR-001 設計が正しく反映 / `as unknown as string` の妥当削除 / Tailwind 規約遵守 / 既存テスト整合性 / 将来課題は別 Issue 候補。

---

## Architecture / Boundary

### Blockers
なし

### Warnings
なし

### Notes
- DTO / Wire / Domain の責務分離は完全。ADR-001 と実装が完全整合。
- `directoryTree.ts` / `wire.ts` の配置は presentation 層内で適切。依存方向（presentation → application → domain）が守られている。
- domain/usecase 層のテストは温存され、`errorReason` のドメイン挙動は引き続き検証されている (`eventDecoders.test.ts`, `runIngestionJob.integration.test.ts` 等)。
- ADR `Status: Proposed` のまま — PR マージ前に `Accepted` に更新が望ましい。

---

## Test

### Blockers
なし

### Warnings

- **[W-T-001]** `useServerFnRouter` 戻り型に `undefined` が含まれ production シグネチャ (`useServerFn<Fn>(fn): Fn`) と乖離（Frontend W-F-003 と同じ）

- **[W-T-002]** `serverFnChainStub` の Proxy が `.bind` / `.call` 等のプロパティ以外操作で chain しない
  - 場所: `app/components/_test-utils/serverFnMock.ts:7-13`
  - 提案: JSDoc に「property-access + call chain のみサポート」を 1 行追記。

- **[W-T-003]** `useServerFn` mock の `entries` の `ref` 引数が `unknown` で型が緩い
  - 提案: JSDoc に「`ref` は production 側で `useServerFn(<ref>)` に渡される関数 (= `vi.mock` で差し替えた mock 自身)」と明記。

### Notes
- `vi.mock` factory のホイスティング問題は本 PR では発生せず（POC で確認済み、plan の fallback `vi.hoisted` 切り替えは不要だった）。
- `errorReason` フィクスチャ撤去整合性 OK、未削除 string 残存ゼロ。
- helper API 設計は `fallback` パラメータで `NotePickerDialog` 単一 fn パターンも綺麗に収まる。
- 新規キャスト・`any` の混入なし。

---

## Design Decisions

特になし（W-F-001 を ADR で記録し別 Issue 起票する判断を本ラウンドで採用）。
