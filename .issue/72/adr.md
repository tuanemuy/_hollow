# ADR — Issue #72: prefers-reduced-motion 対応

## ADR-007: motion-reduce バリアント併用方式の採用（`@layer base` グローバル抑制案は不採用）

### Status

Accepted: 2026-05-21 (PR #123)

### Context

Issue #70 の utility-first 移行で UI 全域に `transition-colors` / `active:scale-[0.985]` / `transition-all` / `transition-[<arbitrary>]` 等のモーション系 utility が増えた。一方で `prefers-reduced-motion: reduce` ユーザー向けの抑制は未対応で、レビュー（`.issue/70/review/review-001.md` N-A-004）で別 Issue 起票が推奨された。

対応方式として 2 案がある:

**A) `motion-reduce:` バリアント併用方式**
各モーション系 utility に `motion-reduce:transition-none` / `motion-reduce:active:scale-100` 等を同位置に追記する。約 59 箇所への併用追加が必要。

**B) `@layer base` グローバル抑制方式**
`app/styles/index.css` の `@layer base` に以下を追記:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

1 ファイル数行で完結する代わりに、`!important` でグローバルカスケードを上書きする。

### Decision

**A 案（motion-reduce バリアント併用）を採用する。** B 案は不採用。

理由:

1. **ADR-002 との整合性（緩和表現）**: ADR-002 は「`@apply`/handwritten component-level CSS を作らない、例外は `dangerouslySetInnerHTML` のような技術的制約のみ」と定めている。B 案の `@layer base` + `@media (prefers-reduced-motion: reduce) { *, ... }` は **`@apply` を使わずグローバルリセット系のメディアクエリ** なので、ADR-002 の禁止対象（`@apply`-based component classes）に厳密に該当するかは議論の余地がある。ただし「`tokens.css` / `index.css` 以外で handwritten CSS を増やさない」という ADR-002 の精神には触れる方向であり、A 案を採用しても整合性を損なわない。本判断の主たる根拠は次項以降の独立した利点に置く。
2. **先行例との一貫性**: `app/components/tag/styles.ts:15` で既に `motion-safe:animate-pulse` を採用済み。「ロード演出は reduce motion 時に止める」というオプトイン側の表現で、本 Issue の `motion-reduce:transition-none` と対称的なポリシー。utility 側で粒度コントロールする既存設計を踏襲する。
3. **個別オプトアウトの可能性**: 将来「このアニメは reduce motion でも見せたい」（例: ローダー、ステータスインジケータ）が出た時、A は「その箇所だけ `motion-reduce:` を付けない」で個別対応できる。B は `!important` でグローバル抑制するため、特定 utility だけ除外するには逆向きの `!important` を追加するなど複雑になる。
4. **Tailwind JIT との親和性**: A は Tailwind JIT が「motion-reduce バリアントが付いた utility がどこで使われているか」を静的にスキャンできる。B は CSS 側にルールが孤立する。
5. **CSS バンドルへの影響は同等**: A の約 59 箇所への併用追加でも、Tailwind JIT が同一バリアントを共有するため増加量は数百バイト程度。B との差は実用上無視可能。
6. **可読性**: コード上で「この transition は reduce motion で止まる」が明示される。B は CSS 側を見ないと挙動が分からない暗黙ルールになる。
7. **Variant ordering の慣用化**: 疑似要素やインタラクション擬似クラスを対象にする際は `motion-reduce:` を**先頭**に置く（`motion-reduce:after:transition-none` / `motion-reduce:active:scale-100`）。これにより以下のメリットが得られる:
   - **grep ベース検知の容易さ**: 運用ルールとして「motion 系 utility に `motion-reduce:` を併用」を CLAUDE.md で担保するため、`grep "motion-reduce:"` だけで全併用箇所を機械的に列挙できる。`after:motion-reduce:` のように途中に挟まる形式と混在すると検知が複雑化する
   - **Tailwind 公式 variant ordering 推奨との整合**: 「動作条件 → 対象セレクタ」の英語的な読み順
   - **生成 CSS の意味は同等** だが、ソース上での統一は読みやすさ・grep ヒット率の双方を改善する

B のメリット（漏れ可能性ゼロ、新規 utility 追加時の対応不要）は認める。これらは:

- `CLAUDE.md` の Styling セクションに「モーション系 utility 追加時は `motion-reduce:` バリアントを併用する」を運用ルールとして明文化することで、構造的にはカバーしないが運用上の漏れ防止策とする。
- CI ガード（grep ベース等）の導入は YAGNI として見送る。漏れが顕在化したタイミングで別途検討する。

### Consequences

- **良い点:**
  - ADR-002 / utility-first 方針と一貫性のある実装
  - 個別オプトアウトの柔軟性が保たれる
  - `motion-safe:animate-pulse` 先行例との対称性
  - `dangerouslySetInnerHTML` 例外（`.note-detail-content`）を増やさずに済む
- **トレードオフ:**
  - 約 59 箇所への併用追加が必要で、各 utility 定数の文字列が長くなる（`styles.ts` への集約と Tailwind 慣用の `motion-reduce:` 直後配置で可読性は維持）
  - 将来のモーション utility 追加時に対応漏れが起き得る → `CLAUDE.md` 運用ルールで担保
  - CI レベルの構造的な保証はない（YAGNI 判断、将来必要になれば別 Issue で対応）

### Related

- ADR-002 (`.issue/70/adr.md`): `@apply`/handwritten CSS 原則禁止、例外は技術制約のみ
- `.issue/70/review/review-001.md` N-A-004: 本 Issue の起源
- 先行例: `app/components/tag/styles.ts:15` (`motion-safe:animate-pulse`)
- **spec/design との整合性メモ**: `spec/design/index.md` L69 / L127 は「`@media (prefers-reduced-motion: reduce)` 時は transition を抑制」と CSS 表現で記載されているが、本実装は utility 併用で同等の効果を達成する。実行時に生成される CSS は同じ media query を含むため、SSOT の意図は満たされている。spec-sync 実行時に解釈差異を「乖離」として誤検出しないよう、本 ADR が表現方式の選択根拠となる。
