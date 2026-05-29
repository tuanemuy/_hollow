# PR Review #001 — feat(ingestion): owner が failed ジョブを再試行できるようにする

**PR:** #326
**Date:** 2026-05-29
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 4
- Notes: 多数（全レイヤーで positive）
- Verdict: **BLOCKED**（Warning 4 件を修正のため）→ 全件修正済み

レイヤー: Use Case + 認可・セキュリティ / Frontend / Test + Spec の 3 並列レビュー。

---

## Use Case + 認可・セキュリティ

#### Blockers
- なし

#### Notes（要点）
- owner 認可は `regenerate`/`discard` と逐語的に同等。エラーコード（`INGESTION_JOB_NOT_FOUND` / `INGESTION_JOB_FORBIDDEN`）も一致。
- admin retry を流用せず副作用なし（`assertAdmin` 不使用、ドメイン・dispatch・admin usecase 無変更）。
- IDOR/認可バイパス経路なし（actor はサーバ取得、jobId のみ受理、`ownerId !== actor` で 403）。
- UoW / collectEvents / OCC（expectedVersion）正しい。二重 retry は OCC conflict で防止。
- ADR-001/002/003 の判断は実装で裏取り済みで妥当。

## Frontend

#### Blockers
- なし

#### Warnings
- **[W-001]** FailedView の retry 中に「キュー画面で詳細を見る」Link が無効化されない（軽微・実害ウィンドウ短い）。
- **[W-002]** `llm_failure` の本文が「再生成をお試しください」だが提示ボタンは「再試行」で齟齬。failed カードに「再試行」を新設したことで顕在化。

#### Notes（要点）
- server fn / schema / onRetried 配線 / アクション並び順 / 多重発火防止 / errorReason 非投影 / Tailwind・a11y すべて規約準拠。

## Test + Spec

#### Blockers
- なし

#### Warnings
- **[W-001]** 新設した admin retry の spec 節がエラーコントラクトを誤記（`INGESTION_JOB_FORBIDDEN` → 実装は `FORBIDDEN_ADMIN_ONLY`）。
- **[W-002]** retry 失敗時のインラインエラー表示がフロントテストで未検証。

#### Notes（要点）
- usecase integration テストは plan 要求 + α（NotFound、admin が他人 job でも owner-only で 403）を高品質にカバー。
- UploadDialog の状態機械テスト（failed→retry→waiting→editing）は質が高い。
- spec 更新は owner 節・domains 節は実装と一致（乖離は admin 節 1 箇所のみ）。

---

## 修正内容（全 4 Warning を解消）

1. **[Test+Spec W-001]** `spec/usecases/ingestion.md` の admin retry エラーケースを実装に合わせ修正:
   `FORBIDDEN_ADMIN_ONLY`（非 admin）/ `USER_NOT_FOUND`（actor 不在）/ `INGESTION_JOB_NOT_FOUND`（job 不在）を正しく記載。
2. **[Frontend W-002]** `errorDisplay.ts` の `llm_failure` 文言を「しばらくしてから再試行をお試しください」に変更（failed カードの「再試行」動線と一致）。failed ジョブにのみ付く errorCode のため全経路で整合。
3. **[Frontend W-001]** `UploadDialog.tsx` FailedView の「キュー画面で詳細を見る」Link に `aria-disabled={isPending || undefined}` + `aria-disabled:pointer-events-none aria-disabled:opacity-50` + `tabIndex` を付与し、retry 中の離脱を防止。
4. **[Test+Spec W-002]** `UploadDialog.test.tsx` / `IngestionJobRow.test.tsx` に「retry 失敗 → インラインエラー表示・waiting 非遷移 / router.invalidate 非呼び出し」テストを追加。

### 検証
- `pnpm typecheck` clean
- `pnpm test:unit app/components/ingestion app/core/presentation/__tests__/errorDisplay.test.ts` — 109 PASS
- `pnpm test:integration app/core/application/ingestion` — 52 PASS
- biome: 変更ファイルに新規警告なし（line 87 の non-null assertion は既存・スコープ外）

---

## Design Decisions

特になし（既存 ADR-001/002/003 の範囲内。errorCode 修正・文言修正はバグ修正であり新規設計判断ではない）。
