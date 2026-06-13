# Styling / CSS規約レビュー（review-002）— PR #682 / Issue #671

対象: `app/components/public/styles.ts`, `PublicSearch.tsx`, `PublicNoteDetail.tsx`, `SearchFilterDrawer.tsx`
観点: ユーティリティファースト準拠 / `AUTHOR_AVATAR` サイズ衝突根絶 / `max-sm:` translate 軸差し替えの正しさ / 任意プロパティ記法 / トークン使用 / ハードコード px の妥当性 / レスポンシブ一貫性

これは 2 回目のフルレビュー（ゼロベース）。結論: **Blocker なし**。設計（ADR-001/002/003）どおりに実装され、CLAUDE.md の Styling 規約に整合している。typecheck・biome check ともクリーン。`max-sm:` translate 軸差し替えの正しさはマニュアルテスト TC-4 の実機 computed style（閉=rectTop 812／開=rectTop 222、bottom-pinned・rounded-t-lg・max-h 88vh）で実証済み。

## Styling

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001]** `AUTHOR_AVATAR` のサイズ衝突は全消費者で根絶を確認した。
  - 場所: `styles.ts:162-165, 263, 306, 321` / `PublicSearch.tsx:214` / `PublicNoteDetail.tsx:112`
  - 内容: ベースは `rounded-full ... inline-flex items-center justify-center`（サイズなし）に再定義され、`w-7 h-7 text-[11px]` が除去された。全 5 消費者（`AUTHOR_AVATAR_MD`=28px / `ACTIVE_CHIP_AVATAR`=16px / `TOKEN_AVATAR`=16px+shrink-0 / `SUGGESTION_AVATAR`=20px+shrink-0 / `PublicSearch` ヒット行=18px）がいずれも `w-/h-/text-` を**1 回だけ**指定しており、同一プロパティの二重指定は構造的に発生しない。`grep` で漏れ消費者なし。ADR-001 の意図どおり。

- **[N-002]** `max-sm:` translate 軸差し替えは正しい。
  - 場所: `styles.ts:278-279`（`DRAWER`）
  - 内容: 既定 `translate-x-full` + `data-[open]:translate-x-0`（右スライド）に対し、`max-sm:translate-x-0`（右スライド軸の無効化）+ `max-sm:translate-y-full` + `max-sm:data-[open]:translate-y-0`（下からのせり上がり）を併記。Tailwind v4 では `translate-x-*`/`translate-y-*` は別 CSS 変数（`--tw-translate-x`/`--tw-translate-y`）に分かれ、`translate` プロパティで合成されるため軸ごとに独立して制御できる。開状態（`max-sm:data-[open]:translate-y-0`）が閉状態（`max-sm:translate-y-full`）に勝つソース順依存も、TC-4 の実機 computed（閉 rectTop=812＝画面外、開 rectTop=222＝bottom-pinned）で後勝ちが確認済み。`max-sm:` 単独で `translate-x` をリセットしないと sm 既定の `translate-x-full` がモバイルでも残る点を正しく潰している。

- **[N-003]** 任意プロパティ記法・トークン使用ともに既存先例と一貫。
  - 場所: `styles.ts:260, 287`
  - 内容: スクロールバー非表示 `[scrollbar-width:none] [&::-webkit-scrollbar]:hidden` は `common/styles.ts:257 scrollbarHidden` と同記法。safe-area `pb-[calc(var(--space-3)+env(safe-area-inset-bottom))]` は `common/styles.ts`（modal/dropdown）・`BulkActionBar.tsx` と同書式で、トークン `--space-3`（tokens.css:81）を参照。`max-sm:rounded-t-lg` の `--radius-lg`、`duration-[var(--duration-base)]` / `ease-[var(--ease-standard)]` も tokens.css 実在。新規 CSS / `@apply` の追加はゼロ。状態は `data-[open]` バリアントで表現され `data-*` 規約準拠。

- **[N-004]** ハードコード px は妥当（標準スケール非該当のみ）。
  - 場所: `PublicSearch.tsx:214`（`w-[18px] h-[18px]`）、`styles.ts:265`（`max-sm:w-[22px] max-sm:h-[22px]`）、`styles.ts:279`（`max-sm:max-h-[88vh]`）、`styles.ts:289/291`（`max-sm:min-h-[44px]`/`max-sm:min-h-[48px]`）
  - 内容: 18px/22px はモック固定値で Tailwind 標準スケール（16/20px）に該当せず任意値が妥当。44/48px はタップターゲット floor の UX 要件（ADR-002 / plan AC-15）。88vh は相対値で root font-size のフルード clamp に追従（ADR-002 の意図）。`text-[8px]`/`text-[9px]` も既存慣習どおりの極小フォント任意値。いずれも過剰なハードコードではない。

- **[N-005]** レスポンシブ一貫性は保たれている。
  - 場所: `styles.ts:262, 266, 265`（`ACTIVE_CHIP` / `ACTIVE_CHIPS_CLEAR` / `ACTIVE_CHIP_REMOVE`）
  - 内容: 横スクロール行内でチップ（`max-sm:h-8`）・クリアボタン（`max-sm:h-8`）の高さが揃い、両者に `max-sm:shrink-0 max-sm:whitespace-nowrap` が付与され `flex-nowrap` 下で潰れない（coverage S-001 対応）。footer の `DRAWER_RESET`=44px / `DRAWER_APPLY`=48px のタップ高も揃えられ、TC-5/TC-6 の実機計測（チップ全 32px・remove 22px・適用 48px）で一致を確認済み。sm+ は既存の `flex-wrap`・右スライドを維持しデスクトップ非破壊。

- **[N-006]** （任意・スコープ外）`ACTIVE_CHIPS` のスクロールバー非表示記法は `common/styles.ts` の `scrollbarHidden` 定数と同一文字列だが、`max-sm:` プレフィックスが必要なため定数を直接合成できず inline している。`max-sm:${scrollbarHidden}` 相当の合成は Tailwind のバリアント仕様上できない（プレフィックスは各ユーティリティ個別に付く必要がある）ため、現状の inline が妥当。DRY 観点で気になるが本 PR で対処すべき問題ではない。記録のみ。
</content>
</invoke>
