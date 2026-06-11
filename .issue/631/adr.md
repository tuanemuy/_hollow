# ADR — Issue #631: デザインモックの可視ロゴ Vesica ロックアップ追従

## ADR-001: wordmark はテキストではなくアウトライン path を埋め込む

### Status
Accepted

### Context
Issue 本文は「インライン Vesica SVG + wordmark テキスト」と書いているが、wordmark のフォントは Avenir Next（macOS 専用）。`<text>` 要素では他環境でフォールバックし、完了条件「実装 BrandLockup と視覚一致」を満たせない。

### Decision
実装 `BrandLogo.tsx` の `WORDMARK_PATH` と同一のアウトライン path を verbatim で埋め込む（`.issue/582/adr.md` ADR-001 と同じ理由）。

### Consequences
- 良い点: 全環境で実装と完全に視覚一致する。
- トレードオフ: 1ファイル約3KB増 × 71 ≈ 210KB増。モックは自己完結が原則なので許容。

---

## ADR-002: viewBox は実装の `-5 -1 480 86` を採用

### Status
Accepted

### Context
マスター資産 `spec/design/icons/hollow-lockup.svg` は tight box（`0 0 473.84 84.48`）で、マークのストロークが箱外にはみ出てクリップされる（BrandLogo.tsx 内コメントに明記）。

### Decision
実装と同じ `-5 -1 480 86` を使う。

### Consequences
- 良い点: ストロークが欠けず、実装とレンダリングが一致。
- トレードオフ: マスター SVG と viewBox が異なるが、実装が正という方針に整合。

---

## ADR-003: admin モックの header-right は触らない

### Status
Accepted

### Context
#628 のヘッダー再設計はアプリのグローバルヘッダー限定。実装 `app/routes/admin/route.tsx` はヘッダー右に AD アバターを維持している。

### Decision
admin モック（P40〜P47 系 17ファイル）はロゴのみ差し替え、header-right は現状維持。

### Consequences
- 良い点: 実装との整合（実装が正）。
- トレードオフ: なし。

---

## ADR-004: drafts/ はロゴのみ差し替え、ヘッダーは維持

### Status
Accepted

### Context
`drafts/P10-header-options.html` 等は #628 の検討過程を記録した資料。ヘッダーを書き換えると資料価値が失われる。一方、完了条件の grep は `spec/design/pages/` 全体に掛かる。

### Decision
drafts/ はロゴ置換のみ行い、ヘッダーは触らない。

### Consequences
- 良い点: 受け入れ grep を満たしつつ検討資料を保全。
- トレードオフ: drafts 内のヘッダーは旧形のまま（意図的）。

---

## ADR-005: フッターロゴも水平ロックアップで統一

### Status
Accepted

### Context
Issue 本文は「フッター用ロゴ（Landing 等、縦積みロックアップ）も対象」と書くが、実装 `LandingPage.tsx` のフッターも水平 `BrandLockup` を使っており、縦積みロックアップは実装に存在しない。

### Decision
全箇所一律で水平ロックアップ SVG を使う（実装が正）。

### Consequences
- 良い点: 実装と完全一致、スニペットが1種で済む。
- トレードオフ: Issue 文言とは異なるが、ADR-001 と同型の「実装優先」判断。

---

## ADR-006: `.logo` に `display:flex; align-items:center` を追加

### Status
Accepted

### Context
height=16 の SVG を font-size 21px のラインボックスに置くと、ベースライン揃えで下に約4–5pxの descender ギャップが出て縦中央からずれる。

### Decision
各ファイルの基底 `.logo` ルールに `display: flex; align-items: center;` を追加。media query 内の `.logo { display:none }`（後置）や `.footer-brand .logo { display:block }`（高特異度）は追加分を上書きするため既存レスポンシブ挙動は無傷。

### Consequences
- 良い点: ロゴの縦位置が実装と揃う。
- トレードオフ: なし。

---

## ADR-007: ヘッダー sweep で参照される `.pill-btn.text` 等の CSS も同時移植

### Status
Accepted

### Context
確定形 header-right の HTML は `.pill-btn.text` バリアントを参照するが、多くのページにその CSS が存在しない（P18 系は `.pill-btn` 体系自体が無い）。

### Decision
P10-home.html から `.pill-btn.text` 一式（必要に応じ base/primary も）をコメントごと移植。`.sidebar-user` の `margin-top:auto` を効かせるため `.sidebar` に `display:flex; flex-direction:column` も追加（確定形と同形）。

### Consequences
- 良い点: 各モックが自己完結のまま確定形と同じ描画になる。
- トレードオフ: ページ間で CSS が重複するが、モックの自己完結原則どおり。

---

## ADR-008: mobile/P12-editor の検索導線はヘッダーから消える

### Status
Accepted

### Context
mobile/P12-editor の旧 header-right には検索 icon-btn があったが、#628 確定形（アップロード＋新規作成のみ）への総入れ替えで消える。P12 の中央列はドキュメントタイトルで検索 input が無い。

### Decision
確定形準拠を優先（実装の Header.tsx も header-right に検索を持たない）。

### Consequences
- 良い点: 実装との整合。
- トレードオフ: モック上のエディタ画面から検索導線が消える。実装側エディタヘッダー仕様と要照合（progress.md に記録）。

---

## ADR-009: mobile/P20-views の sidebar-brand もロックアップ化

### Status
Accepted

### Context
mobile/P20-views.html のみドロワー内に `sidebar-brand` というプレーンテキスト「Hollow」を持つ（受け入れ grep `class="logo">Hollow` の対象外だが可視ロゴ）。同様に mobile admin 3ファイル（P43/P44/P45）は inline-style 付き `.logo` で受け入れ grep に掛からなかった。

### Decision
補助 grep `>Hollow<` で検出した4箇所もすべてロックアップ SVG に置換（Issue の意図は「可視ロゴ全部」）。

### Consequences
- 良い点: プレーンテキストロゴの完全撲滅。
- トレードオフ: なし。

---
