# PR Review #001 — fix(sanitizer): プロトコル相対 URL (//host) が isSafeUrl を通過する問題を修正

**PR:** #529
**Date:** 2026-06-06
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 3（W-001 / W-002 → 別Issue #531 で対応、W-003 → このPRで修正済み）
- Notes: 5
- Verdict: **APPROVED**（宣言スコープ内に欠陥なし。entity バイパスは #531 へ分離）

---

## General Review（Security）

### Blockers

なし

修正そのもの（`/^[/\\]{2}/` で先頭2文字スラッシュ系を reject）は plan.md / adr.md と整合し、
`//evil.com` および `/\`,`\/`,`\\` 変種を正しく落とす。正当な相対パス（`/media/abc`, `#anchor`,
`?q=1`, `./x`, `foo/bar`）と絶対 URL（`http(s)://`, `mailto:`, 大文字スキーム）は通過する（実測確認済み）。

### Warnings

- **[W-001]** 数値/named エンティティ表記の `//` が新しいプロトコル相対チェックをバイパスする
  → **別Issue #531 で対応**
  - 場所: `app/core/adapters/sanitizer/htmlSanitizer.ts`（`isSafeUrl`）
  - 理由: ultrahtml は属性値のエンティティをデコードせず literal 保持、`isSafeUrl` も生値判定のため、
    `&#47;&#47;evil.com` / `&sol;&sol;evil.com` が「相対パス」と誤判定され通過する。ブラウザが
    `//evil.com` にデコードして外部解決する。実測でサニタイズ後出力にエンティティが残ることを確認。
  - 判断: 完全修正には包括的エンティティデコードが必要（既存 `decodeEntities` は `&sol;` 等を取りこぼす）で
    軽微でない。#524 の literal `//host` スコープを越えるため #531 に分離。ADR-003 参照。

- **[W-002]** エンティティ表記のコロンで `javascript:` スキーム検査をバイパス可能（pre-existing XSS）
  → **別Issue #531 で対応**
  - 場所: `app/core/adapters/sanitizer/htmlSanitizer.ts`（`isSafeUrl` の scheme 抽出）
  - 理由: `&#106;avascript&#58;alert(1)` は `:` を含まないため scheme 検査に到達せず「相対パス」と
    誤判定され通過。ブラウザがデコードして `javascript:alert(1)` を実行（クリックで XSS）。実測確認済み。
  - 判断: W-001 と同一根因。open-redirect ではなく XSS で #524 の宣言スコープ（「XSS ではない」）外。
    独立セキュリティレビューが望ましく #531 に分離。ADR-003 参照。

- **[W-003]** プロトコル相対チェックのコメントが回りくどい（否定形で誤読の余地）
  → **このPRで修正済み**（コミット）
  - 場所: `app/core/adapters/sanitizer/htmlSanitizer.ts:176-179`
  - 対応: 「`//host` は scheme colon を持たないため allowlist が相対パスと誤分類して通してしまう → ここで
    直接 reject する」と明快な一文に書き換え。

### Notes

- **[N-001]** テスト品質良好。`removed.toContainEqual({ tag, reason: "unsafe URL scheme: ..." })` を
  assert しているため、`evil.com` 不在が「サニタイザの除去結果」であることを保証（偽陽性でない）。
- **[N-002]** `trim()` は tab/LF/CR/VTab/FF/NBSP/全角空白を除去するため、先頭ホワイトスペース挟み込み
  （`\t//evil.com`, `　//evil.com`）も trim 後に正しく reject される。
- **[N-003]** `https:/\evil.com` 等のスキーム混在は scheme が `https:` なので許可（プロトコル相対ではない）。
  ブラウザの authority 正規化に委ねて妥当。
- **[N-004]** 単一バックスラッシュ `\evil.com` の許可は ADR-002 の意図通り（同一オリジン `/evil.com` 正規化）。
- **[N-005]** スコープは adapter 層の純粋関数のみ・UI 変更なし・ユニットテスト完結で plan/testing.md と一致。

---

## Design Decisions

- ADR-003 を追記: エンティティ表記バイパス（W-001/W-002）を別Issue #531 に分離する判断とその根拠。
