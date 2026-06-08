# PR Review #001 — design(#536): 全画面のモバイル向けモックを作成

**PR:** #584
**Date:** 2026-06-08
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 4（1件修正 / 3件は受容・範囲外・誤読として disposition）
- Notes: 多数（良好）
- Verdict: **APPROVED（要 disposition 確認）**

4レイヤー並列レビュー（デザイン一貫性・トークン / モバイルUX・レスポンシブ / アクセシビリティ / 要件カバレッジ・スコープ）。全レイヤーで **Blocker 0件**。49本の `:root` が対応 desktop と byte 一致、desktop 非改変、`app/` 非変更、overflow 49/49 PASS を機械照合で確認。

---

## デザイン一貫性・トークン準拠

#### Blockers
- なし。トークン運用ルール（`:root` 逐語コピー / ローカル短縮名禁止 / 新トークン禁止 / 正式名のみ）すべて遵守。49本の `:root` が対応 desktop と完全一致、desktop 非改変、スコープ外変更 0。

#### Warnings
- **[W1-001] showcase 背景の生値 `#efeff3` が desktop 未使用の2ファイルへ混入** — `P10-bulk-visibility-dialog-mobile.html:144,164`, `P18-merge-tag-dialog-mobile.html:168`。トークンでない生値。
  - **Disposition: 受容（修正しない）**。`#efeff3` は showcase カタログの「枠」背景で、他4本の showcase mobile（bulk-export / common-confirm / view-form / p13a）とその desktop が同じ生値を使う既存慣習。該当2本もこれに揃えた結果 showcase セット内で一貫する。各自の desktop（白背景 `var(--color-bg)`）に合わせると逆に mobile showcase 内で枠色が不統一になる。実ダイアログコンポーネントの見た目ではなくカタログ chrome のため影響軽微。レビュアー自身も「必須ではない」と評価。

#### Notes
- 49本すべてで `:root` が desktop と byte 一致。新規・未知トークンの定義ゼロ。`--w/--h/--p`（P44）は `.switch` スコープのコンポーネント内ヘルパーで desktop 逐語コピー（`:root` トークンの短縮名ではない）。上方ブレークポイントの2カラム復帰は49本すべてから除去済み。P46 は table 偽装でなくネイティブ card markup で再設計（良判断）。index.md §3 追記は diff クリーン。

---

## モバイルUX・レスポンシブ正当性

#### Blockers
- なし。index.md §2.1/§2.4/§2.5/§3 のモバイル方針すべて実体化。SSOT 乖離・横スクロール誘発・a11y 退行いずれも未検出。

#### Warnings
- **[W2-001] P10-home の bulk-bar × cta-bar が静的モックで同時描画** — `P10-home-mobile.html`。実機は排他だが静的モックでは選択中状態の bulk-bar が cta-bar を覆い、レビュアー/実装者が排他を誤読しうる。
  - **Disposition: 修正済み**。cta-bar / bulk-bar の HTML コメントに「両者は排他、実機では選択0件のとき cta-bar・1件以上で bulk-bar」を明示追記。CSS 側の z-index/safe-area 共有コメントは既存。

#### Notes
- 上方BP除去が完全（全49本に `@media (min-width:…)` 0件）。`.main { min-width:0 }` blowout 対策あり。横長要素（table/cost-table/長URL）は内部スクロール or 折り返しで隔離。showcase/実モーダルの区別が gen-rules §5 どおり正確（P13a の hybrid も正しい）。下端固定要素の safe-area/z-index 競合解決が明示的。overflow 49/49 PASS は妥当（上方BP皆無で fluid clamp 単調変化、3点合格で 320–430px 全域カバー）。

---

## アクセシビリティ

#### Blockers
- なし。icon-only な `<button>`/`<a>` で accessible name 欠落は全49本で0件。`aria-modal` 要素はすべて `role="dialog"` + ラベル付き。ステータスピルは可視テキスト併記で SR 退行なし。設定4画面は `<h1 class="sr-only">` で §2.4 視覚非表示 h1 契約を担保。

#### Warnings
- **[W3-001] 装飾インライン SVG への `aria-hidden` 欠落が大半** — 全 mobile 横断。
  - **Disposition: 受容（範囲外）**。対応する desktop モックも同様に未付与で、生成ルール §2「desktop マークアップ逐語コピー」に忠実な結果＝**本PR由来の退行ではない**。実装時は `Icon.tsx` ラッパーが `label` 未指定で自動的に `aria-hidden` を付与し §7.1/§8 契約を React 層で担保する（index.md §8 既述）。静的モック段階で49本＋desktop を一括改修するのは #536 の範囲外。

#### Notes
- showcase 系は `<script>` 0個で静的 `aria-modal` のみ（過剰実装ゼロ）。実モーダル（P13-upload-modal/P13a）は Esc・フォーカストラップ・フォーカス復帰を実装。ステータスピルの SR テキスト併記が模範的。`role="alert"/status/note` の使い分け不整合0件。44px タップ床が全49本で担保（admin も mobile では44、文脈差で仕様通り）。

---

## 要件カバレッジ・スコープ整合性

#### Blockers
- なし。受け入れ基準を完全充足、スコープ逸脱・漏れ・余剰なし。

#### Warnings
- **[W4-001] README の P22 修正記述の class 名** — `.issue/536/manual-test/README.md` §1 が「`.main { min-width:0 }`」と記載。レビュアーは `.session-main` との混同を指摘。
  - **Disposition: 修正不要（レビュアー誤読）**。実ファイル `P22-settings-security-mobile.html:383` で `.main` に `min-width:0` を追加したのが overflow を 15→0 にした修正であり、README は正確。`.session-main { min-width:0 }`（30行）は desktop からの既存定義で別物。

#### Notes
- 49画面カバレッジ厳密一致（`comm` で欠落0・孤児0）。PR #518 追加4画面すべて確認。`git diff main...` で変更56ファイル・deletions=0、desktop 改変0・`app/` 変更0、修正(M)は index.md の1本のみ。受け入れ基準5項目すべて `manual-test/` の記録と突き合わせ済み。common-toast 除外は Issue・SSOT 双方と整合。

---

## Design Decisions

このラウンドで新たな ADR 化が必要な設計判断はなし（既存 ADR-001〜004 の範囲内）。W1-001 の「showcase 背景は desktop の生値慣習に合わせる」は既存パターンの踏襲であり ADR 不要。
