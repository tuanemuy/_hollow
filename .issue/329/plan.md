# 実装計画 — Issue #329: 内部リンクバックフィル運用 usecase の起動口（管理経路 / CLI）整備

**Issue:** #329
**作成日:** 2026-06-03
**複雑度:** 中〜大規模

---

## 目的

Issue #321 で実装済みの owner スコープ運用 usecase `backfillInternalLinkResolution`（`note_internal_links.resolved_note_id IS NULL` 行を再解決する）を、本番で起動できる経路が無い状態を解消する。管理者向けの起動口を1つ整備し、#127 修正前から滞留している既存 NULL 行を運用で解消可能にする。

## スコープ

### 含まれるもの

- 全 owner を対象に `backfillInternalLinkResolution` を回す admin オーケストレーション usecase の新設（`assertAdmin` 認可 + `userRepository.listAll` カーソルページング）。
- 結果 DTO（解決行数・走査回数・owner 数・開始/終了時刻）の追加。
- admin server function の追加（`requireAdminUser` + CSRF/error middleware）。
- `/admin/jobs`（ジョブ監視）ページへのメンテナンスセクション追加（実行ボタン + 結果/エラー表示）。
- 新 admin usecase の統合テスト。

### 含まれないもの

- 既存 owner スコープ usecase `backfillInternalLinkResolution` 本体・ポート・決定規則・既存テストの変更（再利用のみ）。
- cron / worker での自動定期実行（ADR-009 で手動起動の運用 usecase と位置づけられており、worker entry + wrangler env + DI wiring の新設は本 Issue の「起動口を1つ」というスコープに対し過剰。ADR-001 参照）。
- CLI 起動口（本プロジェクトに admin CLI 基盤が無く新設コストが高い。ADR-001 参照）。
- owner 個別指定 UI（滞留行は全 owner に存在しうるため全 owner walk を採る。ADR-002 参照）。
- kind=id リンク行のバックフィル（既存 usecase の仕様通り対象外）。

## 実装ステップ

### 1. admin オーケストレーション usecase を新設

- **対象ファイル:** `app/core/application/note/backfillAllOwnersInternalLinkResolution.ts`（新規）
- **変更内容:** `rebuildSearchIndex` と同型に実装する。
  1. 独立 UoW で `assertAdmin(userRepository, input.actorUserId)` を実行。
  2. `userRepository.listAll({ limit, cursor? })` で全 owner をカーソルページング（page size はモジュール定数 `BACKFILL_OWNER_PAGE_SIZE`、`rebuildSearchIndex` の `REBUILD_USER_PAGE_SIZE=50` に倣う）。
  3. 各 owner について既存 `backfillInternalLinkResolution({ container, input: { ownerId: user.id } })` を呼ぶ。
  4. `scannedNotes` / `resolvedRows` を合算、`ownerCount` をカウント。
  5. `startedAt = container.clock.now()`、`finishedAt = container.clock.now()` を含む結果を返す。
  - 入力型 `{ actorUserId: string }`。出力型 `{ ownerCount, scannedNotes, resolvedRows, startedAt: Date, finishedAt: Date }`。
  - JSDoc に「`scannedNotes` は走査回数で distinct count ではない」「冪等・再実行で収束」「認可は本 usecase が持ち、owner usecase は無認可なので必ずこれ経由で呼ぶこと」を明記。
- **理由:** 既存 owner usecase は admin 認可も全 owner ループも持たない。`rebuildSearchIndex` が確立した「admin が全 owner を回すメンテナンス usecase」層をそのまま踏襲し、owner usecase を改変せず再利用することで決定規則・冪等性を継承する。

### 2. 結果 DTO と変換関数を追加

- **対象ファイル:** `app/core/application/dto/adminSettings.ts`（編集）
- **変更内容:** `BackfillInternalLinksResultDTO`（`ownerCount` / `scannedNotes` / `resolvedRows` の number 群 + `startedAt` / `finishedAt` は `Instant`）と `toBackfillInternalLinksResultDTO(result)` を追加。`scannedNotes` のセマンティクス（走査回数であり distinct count でない）を JSDoc に明記。
- **理由:** `rebuildSearchIndex`（`toRebuildSearchIndexResultDTO`）と同じく結果を DTO で返す規約に従い、domain branded id を越境させずに件数・時刻を UI に渡す。

### 3. admin server function を追加

- **対象ファイル:** `app/components/admin/Jobs/action.ts`（編集）
- **変更内容:** `rebuildSearchIndexFn` と同型に `backfillInternalLinksFn = createServerFn({ method: "POST" }).middleware([errorResponseMiddleware, csrfMiddleware]).handler(...)` を追加。handler 内で `requireAdminUser()` → `loadServerDeps(() => import("@/core/application/note/backfillAllOwnersInternalLinkResolution"))` → usecase 実行 → `toBackfillInternalLinksResultDTO` で返す。入力なしなので `inputValidator` 不要。
- **理由:** 既存の入力なし admin maintenance server function パターン（`rebuildSearchIndexFn` / `reencryptApiKeyFn`）に完全一致。CSRF/error middleware・admin ガード・lazy import・DTO 返却の規約を踏襲。

### 4. Jobs ボードにバックフィルセクションを追加

- **対象ファイル:** `app/components/admin/Jobs/index.tsx`（編集）
- **変更内容:** `SearchIndexSection` を雛形に `InternalLinkBackfillSection`（`useServerFn(backfillInternalLinksFn)` + `useTransition` + 結果/エラー表示）を追加し、`JobsBoard` の `<SearchIndexSection />` 付近に配置。
  - import に `backfillInternalLinksFn`（`./action`）、`BackfillInternalLinksResultDTO`（型）、lucide アイコン（`Link2`）を追加。
  - 結果文言は `resolvedRows` を主表示（例「N 件のリンクを解決しました」）、`scannedNotes` は「走査 N 回（distinct ノート数ではない）」、再実行可能である旨を補足。
- **理由:** 既存の管理メンテナンスサーフェスにそのまま乗せるのが最も自然。`scannedNotes` の非 distinct 性を UI 文言で明示し運用者の誤解を防ぐ。

### 5. route の side-effect import 確認（変更不要見込み）

- **対象ファイル:** `app/routes/admin/route.tsx`（確認のみ）
- **変更内容:** `import "@/components/admin/Jobs/action"` は既存。新 server function は同ファイルに追加するため追加 import 不要であることを確認する。
- **理由:** action 登録漏れがあると RSC manifest に server fn が載らず実行できないため、既存 import で網羅されることを保証する。

### 6. 統合テストを追加

- **対象ファイル:** `app/core/application/note/__tests__/backfillAllOwnersInternalLinkResolution.integration.test.ts`（新規。`internalLinkBackfill.integration.test.ts` の仕込みヘルパを流用）
- **変更内容:** 実 D1 で以下を検証。
  1. 非 admin actor → `ForbiddenError('FORBIDDEN_ADMIN_ONLY')`。
  2. 複数 owner にまたがる未解決 title リンクを仕込み → 全 owner walk で全件解決され `resolvedRows` が合算される。
  3. 冪等性（2回目実行で `resolvedRows === 0`）。
  4. owner ページング境界（`BACKFILL_OWNER_PAGE_SIZE` を跨ぐ owner 数）。
- **理由:** admin 認可・全 owner 集約・冪等性・ページング境界という新 usecase 固有のロジックを担保する。

## 設計判断

詳細は `.issue/329/adr.md` 参照。

- **ADR-001:** 起動口の方式は管理画面メンテナンスアクション（Jobs ページ）を採用。cron / CLI は見送り。
- **ADR-002:** 「全 owner ループ」を採用（owner 個別指定ではなく）。新 admin usecase が `userRepository.listAll` で全 owner を walk。
- **ADR-003:** owner usecase を改変せず、新 admin usecase でラップして再利用。

## リスクと注意点

- **実行時間:** 全 owner × 全 active note の走査は規模次第で server function の実行時間制約に当たりうる。冪等なので途中失敗・タイムアウトしても再実行で収束する（usecase JSDoc の保証）。UI に「再実行可能」を明示。`rebuildSearchIndex` が同規模の walk を既に server function で許容している前例に乗る。
- **二重起動:** client 側は `useTransition` + ボタン `disabled` で抑止（`SearchIndexSection` と同パターン）。サーバ側ロックは持たないが冪等なので並行実行も収束する。
- **認可:** 新 admin usecase で `assertAdmin` を必ず呼ぶ。server function 側でも `requireAdminUser()` が走る二重ガード。owner usecase は無認可なので必ず admin usecase 経由で呼ぶ（owner usecase を直接 server function から呼ばない）。
- **DTO 越境:** `User.id`（domain brand）を presentation に出さない。集計値（number）と時刻（Instant）のみ返す。

## テスト方針

- **自動テスト（統合）:** 上記ステップ6。
- **型/lint:** `pnpm typecheck && pnpm lint:fix && pnpm format`。
- **ブラウザ手動確認:** `/admin/jobs` でセクション実行 → 結果文言・pending 中のボタン無効化を確認。非 admin / 未ログインで拒否を確認。事前に滞留行を仕込み、実行後に解決・再実行で no-op を確認。詳細は `.issue/329/testing.md`。

## レビュー履歴

### 1周目: 両視点とも問題点ゼロで終了

計画は検証済みの既存アナログ `rebuildSearchIndex`（admin 全 owner walk メンテナンス usecase）と完全に同型であり、関連ファイル（`backfillInternalLinkResolution.ts` / `rebuildSearchIndex.ts` / `adminSettings.ts` DTO / `Jobs/action.ts` / `Jobs/index.tsx` / `authorization.ts`）を実物確認済み。要件カバレッジ・アーキ整合性ともに問題なしと判断。
