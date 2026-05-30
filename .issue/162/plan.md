# 実装計画 — Issue #162: [spec-sync] PurgeOrphans: R2 削除失敗時の再試行強化

**Issue:** #162
**作成日:** 2026-05-30
**複雑度:** 中〜大規模

---

## 目的

PurgeOrphans の 2 段階 UoW で 2nd UoW（R2 delete + DB delete）が失敗すると、行が `status='deleting'` のまま残り、`findOrphansOlderThan` が `status='orphan'` だけをフィルタするため次の cron tick で拾われず **永久に stuck** する。この行を次回以降の sweep で再試行対象に含め、R2 が一時的に落ちても自然回復するようにする。

採用方針は **Option A**（候補プールに `status='deleting'` も含める）。詳細なトレードオフは adr.md ADR-001 を参照。

## スコープ

### 含まれるもの
- `MediaAssetRepository.findOrphansOlderThan` の where 句を `status IN ('orphan','deleting') AND updatedAt < cutoff` に拡張
- 上記に伴い、`orphan` 専用でなくなったメソッド名を実態に合わせて `findPurgeableOlderThan` にリネーム（port / adapter / service / export スタブ / テスト）
- ドメインサービス `listOrphanCandidates` → `listPurgeCandidates` にリネーム
- `purgeOrphans` ユースケースのループを、`orphan` と `deleting` の両方を処理できるよう改修（`deleting` 行は 1st UoW の `markDeleting` を skip して 2nd UoW の purge から再開）
- 統合テスト・ドメインサービステストの更新と、再試行挙動を pin する新規テスト追加
- `spec/testcases/media/index.md` の PurgeOrphans「R2 削除失敗」行を新挙動に合わせて更新（spec-sync の本旨）

### 含まれないもの
- `deleteAttempts` カラム追加による再試行回数上限管理（Option C）— マイグレーション要・#58 と整合する別案件。再試行は無制限のまま（adr.md ADR-002 参照）
- 2 段階 UoW の 1 UoW 統合（Option B）
- 楽観ロック等の厳密な並行制御機構の追加（idempotency と猶予期間で許容、adr.md ADR-003 参照）

## 実装ステップ

### 1. port のメソッドリネーム

- **対象ファイル:** `app/core/domain/media/ports/mediaAssetRepository.ts`
- **変更内容:** `findOrphansOlderThan` → `findPurgeableOlderThan`。JSDoc を「purge 対象（orphan または前回 purge 途中で stuck した deleting）で、`updatedAt` が cutoff より古いものを返す」に更新。
- **理由:** deleting 行も返すようになるため、`Orphans` という名前が実態と乖離する。

### 2. アダプターの where 句拡張とリネーム

- **対象ファイル:** `app/core/adapters/d1/repositories/mediaAssetRepository.ts`
- **変更内容:** `findOrphansOlderThan` を `findPurgeableOlderThan` にリネームし、where 句を `and(inArray(mediaAssets.status, ["orphan", "deleting"]), lt(mediaAssets.updatedAt, cutoff))` に変更。`inArray` は既に import 済み。
- **理由:** Option A の中核。stuck した `deleting` 行を再び候補に含める。

### 3. ドメインサービスのリネーム

- **対象ファイル:** `app/core/domain/media/service.ts`
- **変更内容:** `listOrphanCandidates` → `listPurgeCandidates`、内部で `repo.findPurgeableOlderThan` を呼ぶ。JSDoc を更新（「orphan 猶予期間」→「purge 猶予期間／再試行猶予」）。`MediaService` エクスポートのキーも更新。
- **理由:** 候補が orphan 限定でなくなったため。

### 4. ユースケースのループ改修

- **対象ファイル:** `app/core/application/media/purgeOrphans.ts`
- **変更内容:**
  - 候補取得を `MediaService.listPurgeCandidates` に更新。
  - ループ冒頭ガードを `if (!MediaAsset.isOrphan(candidate) && !MediaAsset.isDeleting(candidate)) continue;` に変更。
  - 1st UoW の分岐:
    - `fresh === null` → `null`
    - `MediaAsset.isOrphan(fresh)` → `markDeleting` して save + collectEvents、entity を返す（従来どおり）
    - `MediaAsset.isDeleting(fresh)` → そのまま `fresh` を返す（**再開**。re-mark せず、`media.deleting` イベントも再発火しない）
    - それ以外 → `null`
  - 関数頭の JSDoc を更新（「前回 R2 失敗で `deleting` のまま残った行も、猶予期間経過後に 2nd UoW から再開する」旨）。
- **理由:** Option A の中核。orphan は従来フロー、deleting は purge から再開。

### 5. export ユースケースのスタブ更新

- **対象ファイル:** `app/core/application/export/runExportJob.ts:263`
- **変更内容:** インラインの `MediaAssetRepository` スタブの `findOrphansOlderThan` を `findPurgeableOlderThan` にリネーム。
- **理由:** port のメソッド名変更に追従（型エラー回避）。

### 6. テスト更新

- **対象ファイル:** `app/core/domain/media/__tests__/service.test.ts`
  - `findOrphansOlderThan` スタブ・`MediaService.listOrphanCandidates` 呼び出し・describe 名を新名称に更新。
- **対象ファイル:** `app/core/application/media/__tests__/purgeOrphans.integration.test.ts`
  - 既存「R2 削除失敗 → deleting で残る」テストの ADR-004 #15 コメントを「次の sweep で再試行される」前提に更新（1 回の sweep 内では deleting で残る点は維持）。
  - `seedDeleting` ヘルパー（`status: "deleting"`）を追加。
  - 新規: 「猶予期間内の `deleting` 行は skip される」テスト。
  - 新規: 「猶予期間を過ぎた `deleting` 行は再試行され、R2 復旧後に purge 完了する」テスト（クロックを進めた 2 回目 sweep、または `seedDeleting` で古い updatedAt を用意）。
  - 新規（推奨）: 「1 回目 sweep で R2 失敗 → deleting 残存 → クロック進めて 2 回目 sweep で purge 完了」のエンドツーエンドな再試行テスト。

### 7. spec の更新（spec-sync 本旨）

- **対象ファイル:** `spec/testcases/media/index.md`（PurgeOrphans セクション、現 line 48）
- **変更内容:** 「R2 削除失敗」行の期待結果を新挙動に更新。例: 「`status=deleting` のまま failed に計上。猶予期間経過後の次の sweep で `deleting` 行も再試行対象となり、R2 復旧後に purge 完了（再試行回数の上限なし）」。
- **理由:** ADR-004 #15 が指摘した spec ⇔ 実装の乖離を解消する。

## 設計判断

詳細は adr.md を参照。
- ADR-001: Option A を採用（最小変更・猶予期間によるリース・マイグレ不要）
- ADR-002: 再試行回数上限は設けない（無制限。上限管理は #58 と合わせて別案件）
- ADR-003: 並行制御は idempotency + 猶予期間で許容し、楽観ロックは導入しない

## リスクと注意点

- **並行 tick の二重処理:** resume パスでは `updatedAt` を bump しないため、猶予期間を過ぎた `deleting` 行は overlapping な tick で同時に拾われ得る。ただし `storage.delete`（NotFound 無視）と `repo.delete`（id 指定 delete）はいずれも冪等で、データ破損は起きない。最悪 `purged` カウントの二重計上のみ。Cloudflare cron の tick 間隔（>= 数分）と purge の所要時間からも重複はまれ。
- **無制限再試行:** 恒久的に R2 削除が失敗する行（バケット権限喪失等）は毎回拾われ続ける。アラート/上限は #58 側で扱う。
- **猶予期間 = 再試行間隔:** `orphanAgeSec`（既定 24h）が再試行間隔も兼ねる。短縮したい場合は cron 呼び出し時の `orphanAgeSec` で調整可能。

## テスト方針

- ユニット/統合テストで担保（cron sweep のため UI なし）。`pnpm test:unit && pnpm test:integration`。
- 手動確認はステージングの pruner cron をトリガーして R2 を一時的にエラーにする…までは不要。自動テストで再試行・冪等性・猶予を網羅する。

## レビュー履歴

（issue-implement Phase 3 の pr-review で記録）
