# PR Review #001 — fix(note): サイドバーのディレクトリ選択をノート一覧に反映する

**PR:** #391
**Date:** 2026-06-01
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2（Test W-001 = 要修正 / Frontend W-001・W-002 = 確認のみ修正不要）
- Notes: 多数（実装が計画・ADR に厳密準拠との確認）
- Verdict: **BLOCKED**（Test W-001 + Frontend N-005 を修正して再レビュー）

---

## Domain / Adapter

#### Blockers
- なし
#### Warnings
- なし
#### Notes
- ADR-001（直下equality一致）に完全準拠。adapter は `conditions.push(eq(notes.directoryId, ...))` を dateRange 直後・candidateSets 構築前に追加。空集合短絡に巻き込まれない。
- count/items 整合が型レベルで担保（`NoteOwnerCountOpts` の Pick に directoryId 追従）。
- host-var 影響なし（単一 eq バインド、idScope chunk 経路に載らない）。
- `idx_notes_directory_status (directoryId, status, updatedAt)` に乗る。JSDoc も WHY 付きで正確。

## Use Case / Loader

#### Blockers
- なし
#### Warnings
- なし
#### Notes
- usecase は静的型を信頼して opts へ条件付き spread のみ（再 validate なし）。referencingNoteId と同型。
- loader の `DirectoryId.create` try/catch フォールバックは referencingNoteId と完全対称（transport 境界の value-object 構築）。
- 検索経路（生文字列 → usecase 内 create → NotFoundError）の非対称は意図どおり維持、非回帰。
- cache キー分離・count 整合・二重処理なしを確認。

## Frontend

#### Blockers
- なし
#### Warnings
- **[W-001]**（確認のみ・修正不要）`clearDirectory` の page 据え置きは `clearReferencingNoteId` と同型で正しい。
- **[W-002]**（確認のみ・修正不要）ディレクトリ選択 setter が無く解除のみだが、出所一致ガードで transition 中も誤名は出ず、snap-back で整合。設計どおり。
#### Notes
- P-001（optimistic 即時解除）・P-003（チップラベル出所一致ガード）が referencingNoteId と厳密対称に実装。
- clearAll 全置換で directoryId 確実に落ちる（P-002どおり）。スタイリング規約（CHIP 再利用・data-active・aria-label）準拠。
- **[N-005]**（任意堅牢化 → 本ラウンドで対応）`directoryName ?? "ディレクトリ"` は root（name `""`）を URL 直叩きした場合に空文字ラベルになりうる。`??` を `||` にすれば空文字も汎用ラベルへ落とせる。

## Test

#### Blockers
- なし
#### Warnings
- **[W-001]**（要修正）`describe("count reflects filters")` ブロックに directoryId の「count > limit」専用ケースが無い。他フィルタ（visibility 等）は count > limit ケースを持つのに directoryId は items 件数 == count のケースのみで、「directoryId が count クエリ where に乗るが limit で切られない」回帰（= `NoteOwnerCountOpts` の Pick 追従破壊の症状）を取りこぼす。場所 `listNotesByOwner.integration.test.ts` の count ブロック。提案: root 直下に limit を超える件数を置き `notes.length===limit` かつ `count===直下総数(>limit)` を検証するケースを1本追加。
#### Notes
- 計画要求の3ケース（直下のみ＋count一致 / 親→子非表示ネガティブ / directoryId×tagIds 併用）実装済み。アサーションは中身（id 配列照合・not.toContain）まで突いており本質的。
- FilterBar コンポーネントテスト不在は妥当（referencingNoteId チップにも存在せず、純粋UI挙動は manual-test TC で担保。チップ解除は navigate で server-fn mutation ではない）。
- `pnpm test:integration` 518 テスト PASS。

---

## Design Decisions

特になし（ADR-001 で既に記録済みの方針に沿った実装であることを確認）。

## 仕分け

- **本PRで修正**: Test W-001（count > limit 回帰ケース追加）、Frontend N-005（`??`→`||`）。いずれも同一機能内・低コスト・スコープ内。
- **修正不要（確認のみ）**: Frontend W-001・W-002。
