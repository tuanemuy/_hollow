# ADR — Issue #309: ボタン形態ガイドライン (#292) 横断適用

## ADR-001: WysiwygEditor 書式ツールバーを icon-only 化する

### Status
Accepted

### Context
WysiwygEditor の書式ツールバー（B / I / S / H2 / H3 / List / Quote / Code / Link 等 10 ボタン）は現状すべてテキストラベルのみ。spec §7.1「ボタン形態の使い分け」では高密度ツールバーは「アイコンのみ」が第一候補とされる一方、Issue 自身も「テキストラベル + ツールチップでも妥当な可能性」と明記しており、現状維持＋ADR 記録（テキストのみで形態は揃っているため §7.1 MUST 違反なし）も許容される。

### Decision
**icon-only 化を採用する**（ユーザー確定）。lucide-react の named import（Bold/Italic/Strikethrough/Heading2/Heading3/List/ListOrdered/Quote/Code/Link2）を `Icon` ラッパー経由で使い、各ボタンを `<Icon size={20} />` に置換。既存の `aria-label`（`ariaLabel`）・`aria-pressed` トグルは維持し、`title` を追加（SHOULD）。タップ領域 44×44px（`max-sm:min-h-[44px]`）を満たす。

各書式機能は別意味を持つため、icon-only MUST「同種の icon-only を並置しない」には抵触しない（同種＝同じ意味の重複ボタン、の意）。

### Consequences
- 良い点: spec §7.1 第一候補に整合。高密度ツールバーの視覚密度が下がり、形態が揃う
- トレードオフ: lucide アイコンの形状は既存テキストと印象が変わるため視覚回帰リスクあり。マニュアルテストで確認

---

## ADR-002: サイドバーはテキストのみ維持とする

### Status
Accepted

### Context
サイドバーのナビ項目（すべてのノート / タグ / ゴミ箱 / アップロード）はテキストのみ。Issue は「lucide アイコンを付与してアイコン+ラベル化」か「テキストのみ維持して §7.1 適用例として明文化」の 2 候補を挙げる。`NAV_ITEM` は元々 `flex items-center gap-2` でアイコン併置可な形だが、装飾アイコンは現状未使用。対象ファイルは `Sidebar.tsx`（`SIDEBAR_SECTION_TITLE` / `NAV_ITEM`）と `DirectorySidebarSection.tsx`。両ファイルとも SVG / `Icon` は皆無。

### Decision
**テキストのみ維持**とする。spec §7.1 は「サイドバーのセクションタイトルにアイコンを使わない」と明記し、賑やかしアイコンを増やさない原則と整合する。LandingPage プレビュー内のアイコン付きサイドバーはあくまでビジュアルモック（`aria-hidden` の装飾）であり、実機サイドバーの指針ではない。

### Consequences
- 良い点: §7.1 の「テキストのみ」適用例として一貫。実装変更ゼロでリスクなし
- トレードオフ: なし（レビュアーの誤判定を防ぐため本 ADR で明示）

---

## ADR-003: 領域3 のスコープを auth サーフェス全体に拡大する

### Status
Accepted

### Context
Issue 領域3 が名指しするのは `LandingPage.tsx` と `AdminSignUpForm/index.tsx` のみ。一方、完了条件は「auth 系の inline SVG → Icon 置換」であり、LoginForm / VerifyEmail / EmailChangeConfirm 等にも装飾 inline SVG が多数存在する。名指しファイルのみに絞ると「auth 系 inline SVG 置換」が不徹底になる。

### Decision
**auth サーフェス内の装飾 inline SVG をすべて `Icon` ラッパー経由に置換する**（ユーザー確定）。LandingPage + AdminSignUpForm + LoginForm + VerifyEmail + EmailChangeConfirm 等を対象とし、完了条件を徹底する。

### Consequences
- 良い点: 完了条件「auth 系 inline SVG 置換」を漏れなく満たす。auth サーフェス全体の視覚・a11y 一貫性が向上
- トレードオフ: 変更ファイル数が増え視覚回帰の確認範囲が広がる。マニュアルテストでカバー

---

## ADR-004: 純装飾ドットは Icon 置換の対象外とする

### Status
Accepted

### Context
LandingPage の HERO_EYEBROW の小円（11px）や PREVIEW_BAR_DOT（CSS の `w-2.5 h-2.5` 円）は SVG/CSS の円形装飾であり、線画系（stroke）アイコンではない。

### Decision
**純装飾ドットは Icon 置換せず CSS/SVG のまま残す**。spec §7「線画系アイコン」の対象外であり、`Icon` の size 3 段階（16/20/24）に丸めると見た目が崩れる。置換対象は stroke 系の意味あるアイコン SVG に限定する。

### Consequences
- 良い点: 装飾の見た目を維持しつつ、意味あるアイコンのみ SSOT に寄せる
- トレードオフ: 「すべての inline SVG を置換」ではないため、置換範囲の判断基準を本 ADR で明示

---

## ADR-006: サイズスナップと WysiwygEditor 正方形ボタンの方針

### Status
Accepted

### Context
`Icon` ラッパーは `size` を 16/20/24 の 3 段階に型レベルで制限し（`Icon.tsx`）、`strokeWidth` を 1.5 に固定する。一方、置換対象の既存 inline SVG には 11/14/18/20/24/36px と中間サイズ・36px が混在し、`strokeWidth` も 1.6〜2.0 とばらつく。レビューで「36→24 / 18→20 / 11→16 のスナップで視覚が変わる」「pillBtn の px-4 を上書きできず icon-only ボタンを正方形にできない」と指摘された。

### Decision
1. **サイズは §7.1 の 3 段階にスナップする**（plan.md「アイコンマッピング表」で各箇所を確定）。特に STATUS_ICON の 36px は最大 tier の `size={24}` にスナップする（72px 円の中で 36→24 に縮小する視覚変化を許容）。`strokeWidth` は `Icon` 固定の 1.5 に統一される。
2. **WysiwygEditor の icon-only 化は共有 `pillBtn` を編集しない**。`pillBtn` の `px-4` は Tailwind の生成順で `px-0` を上書きできないため、WysiwygEditor 内に正方形の専用定数 `EDITOR_TOOLBAR_BTN`（`inline-flex items-center justify-center h-9 w-9 rounded-pill ...` + `max-sm:min-w-[44px] max-sm:min-h-[44px]` + `data-[primary]:` 状態）を定義する。これは既存の bespoke icon-button（`dialogCloseButton` / `REVEAL_BTN`）と同じ方針。`aria-pressed`/`data-primary` トグルの視覚状態は `data-[primary]:bg-accent data-[primary]:text-white` の背景反転で icon-only でも判別可能。

### Consequences
- 良い点: SSOT（size 3 段階・strokeWidth 1.5）を一切緩めずに全 inline SVG を `Icon` に統合できる。icon-only ボタンが 44×44px（モバイル）を高さ・幅とも満たす
- トレードオフ: 36→24 等のスナップで一部アイコンの見た目寸法が変わる。SEO 重要画面（Landing）含めマニュアルテストでレイアウト崩れ・視覚許容性を確認する

---

## ADR-005: 領域4 の password reveal は実態と乖離（記録のみ）

### Status
Accepted

### Context
Issue 領域4 は「全 auth password reveal ボタンの a11y 監査」を求めるが、実装を調査すると `REVEAL_BTN` の使用箇所は AdminSignUpForm の Setup Token 表示/非表示トグル 1 件のみで、SignUp / Login / PasswordReset の password reveal ボタンは実在しない。

### Decision
**実態に合わせて REVEAL_BTN（Setup Token トグル）のみを対象**とし、存在しない password reveal への過剰対応を避ける。本 ADR で実態乖離を記録する。

REVEAL_BTN は唯一の auth icon-only ボタンで、既に動的 `aria-label`（`showToken ? "トークンを隠す" : "トークンを表示"`）を持つため、完了条件「全 auth icon-only ボタンが aria-label を持つ」は本ボタンで充足済み。あわせて、現状は `showToken` の値に関わらず単一の eye 形状を描画しているが、本 Issue では **Eye / EyeOff のアイコン形状トグルを導入**する（視覚で状態が分かる a11y 改善。MUST ではなく SHOULD 相当の上乗せ）。これは純粋な SVG 置換を超えるスコープ追加だが、`Icon` 化に伴い lucide の標準ペアを使う方が自然なため採用する。

### Consequences
- 良い点: 実在しない対象への無駄な作業を回避。Eye/EyeOff トグルで表示状態が視覚的にも判別可能になる
- トレードオフ: アイコン形状トグルの導入は厳密には置換+α。ADR で明示することで意図的な判断だと辿れる
