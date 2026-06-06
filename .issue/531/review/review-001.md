# PR Review #001 — fix(sanitizer): isSafeUrl の HTML エンティティ表記バイパスを塞ぐ

**PR:** #537
**Date:** 2026-06-06
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 1（W-001 → このPRで修正済み）
- Notes: 13
- Verdict: **APPROVED**

---

## Security

検証は Node で `normalizeUrlForSafetyCheck` / `isSafeUrl` のロジックを再現し、~60 のバイパス候補を総当たり。ultrahtml の parse/render ラウンドトリップ（エンティティ literal 保持）、`new URL()` 解決、`entities@7.0.1` による HTML5 named entity の危険集合の網羅性を実証して実施。

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** バイパス総当たりで抜けなし。Issue の3ケース＋計画の全攻撃ケース（数値10進/16進、`;`有無、ゼロ埋め、大文字X、named、大文字named、先頭C0、Tab/LF/CR注入、bsolプロトコル相対、`/\`・`\/`混在、`data:`/`vbscript:`）はすべて reject。正当URLはすべて通過。51件 PASS、typecheck クリーン。
- **[N-002]** 単一パスデコードの browser-faithful 性を実機で確認。ultrahtml はデコードせず renderSync も verbatim 出力。ブラウザは出力 HTML を1回だけ HTML デコードし URL パーサは `&sol;` を再デコードしない。「既知 named がリテラル残存なら相対扱いで許可」という案B 除外判断は正しく、ADR-003 の単一 alternation・再走査なし不変条件が守られている。
- **[N-003]** `&#0;//evil.com` の許可は意図どおりで脆弱性ではない（`cp>0` ガードで literal 残存、ブラウザも NULL を U+FFFD 置換で先頭が `//` にならず外部遷移しない。両者結論一致）。
- **[N-004]** named テーブルの網羅性を `entities@7.0.1` で実証。`/`,`\`,`:`,Tab,LF に decode する HTML5 named は `sol`/`bsol`/`colon`/`Tab`/`NewLine` の5件のみで全てテーブルに在る。`Colon`(U+2237) 等は別物で case-sensitive 参照が正しい。案A 単独でも網羅でき、案B は将来の多層防御。
- **[N-005]** `firstSeparatorIndex` の区間境界は操作不能。未知 named を分離子の後ろ（path/query）に逃がしても host を変えられず、案B のスキャン範囲（scheme/authority のみ）は的確。path/query 中の未知 named は誤検知せず通過。
- **[N-006]** ReDoS なし（正規表現すべて線形）。200万文字入力でも1桁ms。
- **[N-007]** `https:/\evil.com` 等の scheme 混在は本PR以前から同挙動で、許可スキームの正当外部リンクのためスコープ外（参考）。
- **[N-008]** `toPlainText`/`decodeEntities`/`HTML_ENTITIES` 未変更で副作用ゼロ。renderSync の非エスケープ前提も維持、既存の attribute-value breakout 防御に regression なし。

## Test

### Blockers
なし

### Warnings
- **[W-001]** 正当URL回帰の `it.each` が偽陽性にやや弱い（`removed.not.toContainEqual(...)` のみで、href が別理由で除去された場合をすり抜ける）。攻撃側と同じ双方向 assert にするため `expect(html).toContain("href=")` を追加すべき。
  → **このPRで修正済み**: 回帰 `it.each` で `html` を取得し `expect(html).toContain("href=")` を追加。

### Notes
- **[N-001]** plan.md テスト方針の全ケース（攻撃14＋greedy-hex pass＋回帰15）が実装済みで漏れなし。攻撃は `rejectsHref` ヘルパで N-001 規約（出力不在＋`removed` 記録の両 assert）を一貫適用。
- **[N-002]** 既存テストは `git diff` 上で削除行ゼロの純粋追加。`decodeEntities`/`HTML_ENTITIES` 不変で `toPlainText` テストも無改変。全51 PASS、typecheck クリーン。
- **[N-003]** エッジケースの期待値がブラウザ近似挙動・plan の宣言と一致（大文字 named の fallback B 経由 reject は vacuous でない、greedy-hex pass、NULL/mailto local named/二重エンコードの fail-open 判定が browser-faithful）。
- **[N-004]** `it.each` のラベル付けが適切で失敗時に原因特定可能。
- **[N-005]** テストは振る舞いベース（公開 `sanitize()` 経由）で内部実装に非結合。適切な抽象度。

---

## Design Decisions

特になし（実装は ADR-001〜004 に忠実。新規の設計判断なし）。
