# PR Review #002 — feat(ingestion): 取り込み元ファイルを永続保存し閲覧・ダウンロード可能にする

**PR:** #462
**Date:** 2026-06-04
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 8（Round 1 修正の検証結果）
- Verdict: **APPROVED**

Round 1 の Blocker 2件（B-001 note purge の source orphan 化＋冪等、B-002 overwrite の旧 source orphan 化）と Warning 4件（W-T1 署名/disposition テスト、W-T2 getNoteDetail 射影テスト、W-A1 temp 欠損 graceful skip、W-D1 イベント破棄コメント、W-F1 noreferrer）をすべて修正。Round 2 で各修正が指摘どおり正しく入り、追加テストが偽陽性でない有効なライフサイクル検証であることを確認。新たな Blocker/Warning の混入なし。

---

## Round 2 検証

#### Blockers
なし

#### Warnings
なし

#### Notes
- **[N-001]** B-001: note purge の source orphan 化＋冪等テスト — 実 DB 行 seed で decrement 分岐を実走、orphan/refCount=0 を DB 直検証。updatedAt 不変 + 既 orphan への decrement throw の二重で冪等を堅牢に証明。
- **[N-002]** B-002: overwrite の旧 source orphan 化テスト — attached 旧 source を bind したノートを overwrite し、新 asset 差し替え＋旧 source orphan/refCount=0 を両アサート。
- **[N-003]** W-A1: temp 欠損 graceful skip — not-found のみ log+null（commit 成功・source 無しで進む）、transient は rethrow。型ガードで cause.message 参照も型安全。skip 時に orphan blob を書かない。JSDoc と実装一致。
- **[N-004]** W-T1: buildAttachmentDisposition export＋テスト — ASCII/非ASCII/クォート/制御文字/空文字を網羅、実装の2段 regex に照合して正確。presign の署名済みクエリ含有も検証。export 化で挙動変更なし。
- **[N-005]** W-T2: getNoteDetail の sourceFile 射影 — 有り（mediaId/originalFileName/mimeType 一致）/無し（null）の2テスト。
- **[N-006]** W-D1: イベント破棄の why コメント — dispatcher-skip + purge worker の status クエリ回収を明記。
- **[N-007]** W-F1: 閲覧リンク rel=noopener noreferrer — テストアサーションも追従。
- **[N-008]** 全体: typecheck クリーン、unit 3105 passed / integration 570 passed。Round 1 見落としの重大問題なし。

---

## Design Decisions

特になし。

---

## 完了

**1ラウンドクリーン（Round 2 で Blocker 0 / Warning 0）で完了条件達成。** PR を Ready for review に切り替える。
