# PR Review #002 — fix(frontend): #821 日付整形の TZ を Asia/Tokyo 固定し共有ヘルパーに集約

**PR:** #823
**Date:** 2026-07-10
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 9
- Verdict: **BLOCKED**（W を修正して再レビュー）

## レイヤー別ファイル

- Frontend: review-002-frontend.md（B: 0 / W: 1 / N: 4）
- Test: review-002-test.md（B: 0 / W: 1 / N: 5）

## 指摘一覧

- [W-001/FE] ProfileForm の mounted ゲート説明コメントが TZ 固定化で陳腐化（ローカルTZ整形を mismatch 源と誤誘導） — `app/components/identity/ProfileForm/index.tsx:131-136`（Frontend）
- [W-001/Test] 境界テスト (a)/(b) の「TZ 未指定なら失敗」コメントがランナー TZ 依存で JST ランナーでは空振り。実際のピン除去ガードは runner-independent な (c) が担保 — `app/components/common/__tests__/dateFormat.test.ts:4-9,13-33`（Test）

## 仕分け

- **[W-001/FE] → このPRで直す**: コメント更新のみ。同一ファイル内で完結、挙動変更なし。
- **[W-001/Test] → このPRで直す**: 誤解を招くコメント文言を、(c) が runner-independent なピン除去ガードで、(a)/(b) は JST 出力値の検証（非JSTランナーではピンも証明）という実態に合わせて正す。テスト構造は (c) が既に担保しているため変更不要、コメント精度の修正に限定。
