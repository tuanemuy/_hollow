# PR Review #002 — feat(publication): P14 公開設定に「未保存の変更があります」警告を追加 (#583)

**PR:** #730
**Date:** 2026-06-14
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 16
- Verdict: **APPROVED**

## レイヤー別ファイル

- Frontend: review-002-frontend.md（B: 0 / W: 0）
- Test: review-002-test.md（B: 0 / W: 0）

## 指摘一覧

なし（修正対象の指摘ゼロ）。

## 1回目指摘の解消確認

- [Frontend/Test W-001] autosave 立ち下がりエッジ clear（`>0→0`）の NoteEditor レベル回帰テスト → 追加済み（fake timers でデバウンス flush を刺激）。Test レビュアーがミューテーションテスト（`NoteEditor.tsx:172` の clear 握り潰し）で新規テストが実装経路を通すことを実証。
- [Test W-002] 手動保存 clear と立ち下がりエッジの弁別 → 弁別根拠コメント追加 + 別途 falling-edge テストで分離。
- [Frontend W-002] `role="status"` 二重描画の意図差 → 双方向の WHY コメントを追加。

完了条件「直すべき指摘ゼロのラウンド」を満たし APPROVED。
