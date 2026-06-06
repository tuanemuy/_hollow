# PR Review #001 — refactor(#493): note-content adapter を markdown-it / ultrahtml へ置き換え

**PR:** #523
**Date:** 2026-06-06
**Round:** 1回目

---

## Summary

- Blockers: 1（**修正済み**）
- Warnings: 3（**修正済み**）
- Notes: 多数（良好）
- Verdict（修正前）: **BLOCKED** → 修正後 round-2 で再検証

レビューレイヤー: Security / Adapter、Test / アーキテクチャ整合（2 視点並列）。

---

## Security / Adapter

### Blockers

- **[B-001]** ultrahtml `renderSync` の属性値非エスケープによる属性ブレイクアウト型ストアド XSS（**main からの回帰**）
  - 場所: `app/core/adapters/sanitizer/htmlSanitizer.ts`（`sanitizeAttributes` の `clean[name] = value` + `renderSync`）
  - 理由: `renderSync` は属性値中の `"` を再エスケープしない。サニタイザは parse 済みツリーの属性マップに対して検査するため、値に埋め込まれた生 `"` で属性を閉じて `onerror=...` を注入する攻撃が全検査を素通りし、serialize 時にライブ属性へ展開される。実測: `<img src="/media/x" alt='x"onerror="alert(1)'>` → `<img src="/media/x" alt="x"onerror="alert(1)">`（live onerror、`removed: []`）。HTML アップロード取り込み経路（`runIngestionJob.ts` の `kind === "html"`）で attacker 制御の生 HTML が直接 `sanitize()` に入り到達可能。出力は `.note-detail-content` の `dangerouslySetInnerHTML` で描画され任意 JS 実行。旧サニタイザは属性値を `&quot;` 化して無害化していた。
  - **対応（修正済み）**: 属性値の生 `"` → `&quot;` を `escapeAttrValue` で escape、テキストノードの生 `<`/`>` → `&lt;`/`&gt;` を `escapeTextValue` で escape。ultrahtml がエンティティを literal 保持するため `&` は触らず二重エンコードを回避。再現 4 ケースを `htmlSanitizer.test.ts` の "attribute-value breakout" describe に回帰テストとして追加（出力を ultrahtml で再パースし live な `on*` 属性が無いことを検証）。

### Warnings

- **[W-001]** `sanitizeChildren` が parse 済みノードを in-place 破壊変異（ADR-007 の「新ツリーに積む」方針から逸脱）
  - **対応（修正済み）**: text / element / root を spread で新オブジェクト化し、parse 結果を変異しない不変 transform に変更。
- **[W-002]** `allowInternalLinks` がサニタイザ内で未参照なのにコメントが「true のとき通す」と乖離
  - **対応（修正済み）**: コメントを実態（policy 値に関わらず text passthrough、flag は advisory）に修正。

### Notes（良好）
- markdown 段の id 検証（`stripUnsafeIds` core ルール + `allowedAttributes:["id"]`）は健全。
- `[[wikilink]]` verbatim、`language-xxx` クラス保持、media `<img>` の `mediaPattern` マッチ、`"disallowed tag"` reason、port シグネチャ・`SystemError` 包み、disallowed 要素のサブツリー DROP すべて正しく維持。
- バージョン pin 適切。

---

## Test / アーキテクチャ整合

### Blockers
なし（typecheck クリーン、命名規約 stale 参照ゼロ、依存 pin 正、スコープ遵守、コメント方針適合）。

### Warnings

- **[W-003]** `removed` 監査アサーションの抜け 2 件
  - 場所: `htmlSanitizer.test.ts`（event-handler テスト / `data:` テスト）
  - 理由: event-handler 除去テストが `removed.some(r => r.tag === "p")` の弱いアサーションで reason を pin していない。`data:` 除去テストは `removed` を一切検証していない（`javascript:` 側は pin 済みで非対称）。
  - **対応（修正済み）**: event-handler は実際の reason `disallowed attribute: onclick`（`on*` は allowlist 外のため URL 検査前に disallowed attribute として捕捉される）を `toContainEqual` で pin。`data:` テストに `{ tag: "img", reason: "unsafe URL scheme: src" }` の検証を追加。

### Notes（良好）
- 命名追従 5 か所すべて反映、スコープ遵守、コメント方針適合、ADR 整合。
- `[[wikilink]]` の true/false 両経路テストは「flag を一度も読まない」ため構造上自明で実益低い（N で整理）。

---

## Design Decisions

- 属性値・テキストの自前エスケープ（`renderSync` 非エスケープ対策）を ADR-009 として追記。`&` を escape しない理由（ultrahtml のエンティティ literal 保持による二重エンコード回避）を含む。
