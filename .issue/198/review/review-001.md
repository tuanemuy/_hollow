# PR Review #001 — design(issue/198): エラー UI の設計成果物化 (spec/design)

**PR:** #343
**Date:** 2026-05-30
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 多数（良好）
- Verdict: **BLOCKED**（Warning 2件を修正してから再レビュー）

---

## デザイン / フロントエンド

### Blockers
- なし。3ファイルとも well-formed、トークン正式名参照、ハードコード色値の新規混入なし、ADR-001〜004 すべて準拠。

### Warnings
- **[W-001]** `.variant-label` の `letter-spacing: 0.02em` がトークン非準拠（ハードコードリテラル）
  - 場所: `spec/design/pages/P01-signup.html` / `P01b-admin-setup.html` / `P03-login.html` の `.variant-label` 定義
  - 理由: tokens.md §2.4 の `--tracking-*` は全て負値で、正の字間用トークンが無い。§9「リテラルを避けトークン正式名を使う」精神から外れる。モック補助ラベル限定だが解消すべき。
  - 提案: 非トークンリテラルを除去（`letter-spacing` 行を削除し既定の本文字間に委ねる）。

### Notes
- id 衝突なし・label↔input 対応完全（`-a`〜`-e` サフィックス一貫）
- a11y 整合（aria-invalid / role=alert・status / aria-hidden / aria-label / button type=button）
- フォーカスリングがエラー状態でも維持
- ADR-004 配色（neutral surface + accent）正しく実装、warning 配色と明確に区別
- §9 自己完結（P01/P03 に `.form-error` コピー）、レスポンシブ破綻なし、既存成功状態モック非破壊
- 既存本体 `.form-error` の SVG stroke は 1.8、新規バリアントは 1.5（新規は規約準拠、既存側は本PRスコープ外・非破壊）

## 要件カバレッジ・文言忠実性・セキュリティ抽象化

### Blockers
- なし

### Warnings
- **[W-002]** validation の field hint 文言が「現実装が実際に生成する文字列」と一致していない（発明されたコピー）
  - 場所: `spec/design/pages/P01-signup.html` / `P01b-admin-setup.html` / `P03-login.html` の validation バリアントの field-hint
  - 該当: 「メールアドレスの形式が正しくありません。」「8文字以上で入力してください。」「英数字とハイフンのみ使用できます。」「パスワードを入力してください。」「Setup Token を入力してください。」
  - 理由: `app/components/auth/schema.ts` の Zod スキーマは `message:` 未指定で、`validator.ts` は `issue.message`（Zod デフォルトの英語文言）をそのまま `fieldErrors` に格納する。errorMap / i18n 層も無い。つまり現行が実際に出す validation 文言は英語デフォルトであり、モックの日本語は「転記」ではなく設計提案。PR説明の「一字一句一致」が validation だけ成立しない。
  - 提案: validation バリアントに「日本語 hint は設計提案で、現行 Zod デフォルト（英語）と異なる。日本語化は #201 申し送り」と HTML コメントで明示。review/005.md の clarify 記述（「現実装の挙動を再現」）も実態に合わせ修正。

### Notes
- errorDisplay.ts 由来本文・form プレフィックス・Setup Token 2分岐・P03 未認証 callout 文言は全て一字一句一致を実コードと照合確認
- セキュリティ抽象化（system/unknown 抽象維持・認証失敗の存在判別回避・conflict あり版の #201 委譲コメント）完全維持
- ADR-004 配色は styles.ts の CALLOUT/CALLOUT_ICON と一致
- スコープ整合性 OK（app/ 非変更、3ページ以外不変更、トークン追加なし）
- 全エラーケース網羅

---

## Design Decisions

- 新規の設計判断なし。W-002 は validation 文言の日本語化方針を #201 に申し送る形で整理する（既存 ADR の範囲内）。
