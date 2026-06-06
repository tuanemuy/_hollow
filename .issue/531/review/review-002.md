# PR Review #002 — fix(sanitizer): isSafeUrl の HTML エンティティ表記バイパスを塞ぐ

**PR:** #537
**Date:** 2026-06-06
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 6
- Verdict: **APPROVED**（Security は round-1 で 0/0・変更なし、Test は W-001 解消を確認）

---

## Test（再レビュー）

### Blockers
なし

### Warnings
なし

W-001 は妥当に反映済み。回帰 `it.each`（"keeps legitimate URL: %s"）が `html` も取得し、`expect(removed).not.toContainEqual(...)`（除去されていない）＋ `expect(html).toContain("href=")`（出力に href 残存）の双方向検証になった。攻撃側 `rejectsHref` ヘルパ（出力不在＋`removed` 記録）の契約を鏡写しにしており、「別理由で href が黙って落ちた場合をすり抜ける」弱点が解消。

### Notes
- **[N-001]** 双方向 assert は非空虚。既存テストが出力を `href="..."` 形式で固定しており `toContain("href=")` は有効な存在チェック。
- **[N-002]** 攻撃側（出力不在＋`removed` 記録）と回帰側（`removed` 不在＋出力存在）が両方向とも二重 assert に揃い対称。
- **[N-003]** 全51テスト PASS。既存テストは diff 上で削除・改変ゼロの純粋追加で退行なし。
- **[N-004]** greedy-hex-chain pass ケースも同じ双方向スタイルを踏襲済みで一貫。
- **[N-005]** 新たな漏れ・退行は検出されず。
- **[N-006]**（参考・Test スコープ外）レビュアーが「PR diff 上で `.issue/531/plan.md` / `adr.md` が Binary 表示」と指摘。調査の結果、ドキュメント執筆時に C0 制御文字の範囲表記 `[\u0000-\u0020]` を**実体の制御文字**で書いてしまい NUL バイトが混入していた。実コード（`htmlSanitizer.ts` の `LEADING_C0_OR_SPACE = /^[\u0000-\u0020]+/`）は正しいエスケープ表記で無傷。ドキュメントを読める表記に修正してテキスト化済み。

---

## Design Decisions

特になし。
