# PR Review #002 — feat(#363): 取り込みのディレクトリ提案で新規ネストパス作成をサポート

**PR:** #381
**Date:** 2026-05-31
**Round:** 2回目（収束確認）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 数件（反映漏れ注意＝コミット要のみ）
- Verdict: **APPROVED**

1周目の Warning 2件（Frontend / Test 各1）を修正し、該当レイヤーを再レビュー。Domain / Use Case + Adapter は1周目で Blocker・Warning ゼロかつ本ラウンドで未変更のため再レビュー不要。

---

## Frontend

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- 1周目 W-001 解消済み。`DirectoryPicker.tsx` のヒント文言を `MAX_DIRECTORY_DEPTH` のテンプレート補間に変更。frontend からのドメイン定数 import は `schema.ts` に同一前例があり一貫（presentation → domain）。文言は「最大10階層」と正しく展開、新規問題なし。

## Test

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- 1周目 W-001 解消済み。新テスト `reuses an existing intermediate via case-insensitive sibling match` は seed `Tech`・ensure `tech` でケースが実際に異なり、`DirectoryName.equals` の `toLowerCase()` マッチ経路を非空虚に検証（件数＋parentId の二点で判別性あり）。既存テストの誤解を招くコメントも実態に合わせて訂正。全21件 PASS。

---

## Design Decisions

新たな設計判断なし。

## 完了

Step 7 の完了条件（Blocker 0 かつ Warning 0）を2周目で満たした。1ラウンドクリーンで完了の方針に従い、レビューループ終了 → Ready for review へ。
