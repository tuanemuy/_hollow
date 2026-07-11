# PR Review #010 — feat(media): #468 source blob のストレージ衛生

**PR:** #834
**Date:** 2026-07-11
**Round:** 10回目（最終）

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 24
- Verdict: **APPROVED**

## レイヤー別ファイル

- Domain: review-010-domain.md（B: 0 / W: 0）
- Use Case: review-010-usecase.md（B: 0 / W: 0）
- Infrastructure: review-010-infrastructure.md（B: 0 / W: 0）
- Test: review-010-test.md（B: 0 / W: 0）

## 指摘一覧

なし（全レイヤーで修正対象の指摘ゼロ）。

参考 Note のみ:
- ローカル wrangler.toml の `R2_OBJECT_BUCKET_NAME` var コメントの #468 言及が微小に非対称（Infra N-004）
- sweep の `DEFAULT_BATCH_SIZE`(100) は未ピン — 別Issue のスループット設計時に併せて推奨（Test N-005）
- 初回デプロイで #452 以降の orphan バックログの purge が始まるのは正常挙動（周知用、Infra N-006）

## 既知の見送り（別Issue対応、adr.md 記録済み）

- purge 回収スループットの drain ループ設計（バッチ上限引き上げ時は CF サブリクエスト上限を考慮）
- malformed 行に対する候補列挙の per-row 耐性
- attach / re-stamp 経路の構造的封鎖（reconcileRefs / updateProfile / finalizeUpload）
- テンプレート↔ローカル wrangler.toml の binding パリティテスト
