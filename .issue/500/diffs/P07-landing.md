# P07-landing 突き合わせ
対応: route=app/routes/_app/index.tsx（未認証時のランディング。about.tsx は legal「about」ページで別物）, components=[landing/LandingPage], styles=[LandingPage.tsx 内モジュール定数]

注: mapping.md は P07→about.tsx としていたが、`about.tsx` は LegalDocument（about.md）を PublicLayout で描く別ページ。LandingPage は `_app/index.tsx` が userDto===null のとき（Outlet 経由）に表示する。実体は LandingPage コンポーネント。

## A. モック修正（実装に寄せた＝モックを書き換えた）
- [x] header にボーダー無し / 観点:layout / 旧モック:`.header` に border-bottom 無し → 実装:`HEADER` に `border-b border-hairline` / 修正内容:`.header` に `border-bottom: 1px solid var(--color-hairline)` を追加
- [x] header nav の項目数 / 観点:component / 旧モック:機能 / 公開検索 / ログイン / アカウント作成 の4項目 → 実装:機能 / ログイン / アカウント作成 の3項目（header に「公開検索」リンク無し） / 修正内容:nav から「公開検索」リンクを削除
- [x] footer タグラインの構造 / 観点:component / 旧モック:単一 `<p>` に `<br>` で2文 → 実装:`FOOTER_TAGLINE` を2つの独立 `<p>`（2文目に mt-2） / 修正内容:2つの `<p>` に分割（2文目に margin-top space-2）

hero（eyebrow=accent-surface ピル / title clamp(36,6vw,64) / subtitle clamp(16,1.4vw+12,20) / actions primary+secondary=pillBtnTall min-w-200 / preview-bar h36=h-9 / dot 10px / preview-side-item active=bg-surface / note meta tag=accent・sep=hairline-strong / pub-dot 6px）、features（card padding space-8 space-6 / icon 48px radius-lg / 1→2→4 列）、teaser（accent-surface / link px-5 py-3）、footer-grid（1→1.4fr 1fr 1fr 1fr）はトークン水準で実装一致。

## B. 実装フォローアップ（モックを正に残した＝未実装）
- なし

## C. 要判断（曖昧）
- 見出し最大幅の指定方式 / 論点:モックは `.hero-title{max-width:14ch}` / `.hero-subtitle{max-width:40ch}` / `.section-title{max-width:22ch}` / `.section-lead{max-width:56ch}` / `.footer-tagline{max-width:36ch}` と `ch` 単位で行長を制御。実装は `text-balance`/`text-pretty` + `max-w-[34rem]`/`max-w-[44rem]`/`max-w-[30rem]`（rem）で制御し、title 系は max-width 無し（balance のみ）。視覚的な折返し結果は近いが、制御手法（ch vs rem+balance/pretty）が根本的に異なり、モックの static CSS に balance/pretty 相当を厳密移植できない（ブラウザ依存）。`ch`→`rem` 値の機械変換も font 依存で非自明。手法差として要判断に記録し、モックは `ch` のまま据え置き
