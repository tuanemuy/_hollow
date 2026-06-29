# PR #807 レビュー — Accessibility 観点

対象 PR: #807 / Issue #790（ヘッダーCTAバッジをサイドバー upload 項目へ移設）
レビュー視点: アクセシビリティ（AC-4: 件数のアクセシブルなテキスト表現を保持・ちょうど一度だけアナウンス・欠落なし・重複なし）
検証対象コード:
- `app/components/layout/UploadNavItem.tsx`
- `app/components/ingestion/useIngestionQueueCount.ts`（`uploadQueueLabel`）
- `app/components/ingestion/UploadButton.tsx`
- `app/components/layout/Sidebar.tsx` / `app/components/layout/styles.ts`
- `spec/design/pages/P13-upload.html` / `spec/design/pages/mobile/P13-upload.html`

---

### Accessibility

#### Blockers

なし。

AC-4 のアクセシビリティ契約は ADR-002 の設計どおり正しく実装されており、件数の欠落・二重アナウンス・状態と名前の役割混在のいずれも発生しない。Blocker 相当の問題は検出されなかった。

#### Warnings

なし。

#### Notes

- **[N-001]** `aria-label` への件数包含・0件フォールバックが正しい。
  場所: `app/components/ingestion/useIngestionQueueCount.ts:62-64`, `app/components/layout/UploadNavItem.tsx:24`
  `uploadQueueLabel(count)` は `count > 0` のとき `アップロード（未処理 ${count} 件）`、0件で `アップロード` を返し、`<Link aria-label={uploadQueueLabel(count)}>` に渡している。件数の欠落なし・0件時に静的名へ縮退する挙動が AC-4 を満たす。可視ラベルとアクセシブル名の真実点が単一関数に集約されており乖離リスクも低い。

- **[N-002]** 可視 `NAV_COUNT` スパンの二重読み上げは構造的に発生しない（防御的 `aria-hidden` は不要）。
  場所: `app/components/layout/UploadNavItem.tsx:24-29`
  `<Link>`（`<a>`）に `aria-label` が付与されているため、アクセシブル名計算（accname spec step 2C）で子孫テキスト（`<span>アップロード</span>` + `NAV_COUNT` スパン）は名前ソースから除外される。リンクは単一のインタラクティブ要素として `aria-label` の値のみで一度だけアナウンスされ、可視 count が別途読み上げられることはない。ADR-002 の「`aria-hidden` 不要・防御的に付けてもよい」という判断は妥当で、付けていない現状で重複なし。全主要ブラウザ/AT で安定した仕様挙動。

- **[N-003]** `aria-current="page"` / `data-active`（状態）と `aria-label`（名前）の役割分離が正しく共存している。
  場所: `app/components/layout/UploadNavItem.tsx:23-24`, `app/components/layout/styles.ts:124-127`
  `activeProps={ACTIVE_NAV_PROPS}`（`{ "data-active": "", "aria-current": "page" }`）と `aria-label` は WAI-ARIA 上直交し、アクティブ時は「アップロード（未処理 N 件）, 現在のページ」と名前+状態が一度ずつ読み上げられる。`data-active` は可視スタイル専用で読み上げに影響しない。状態のアナウンスが名前へ混入したり失われたりしない。共有定数 `ACTIVE_NAV_PROPS` を Sidebar の他ナビ項目（`Sidebar.tsx:85,93,104,114,158,193,205`）と同一定義で使用しており、a11y 状態表現の一貫性も保たれている。

- **[N-004]** ヘッダー CTA の静的 `aria-label="アップロード"` が保たれ、アイコンのみ折りたたみ時のアクセシブル名を担保している。
  場所: `app/components/ingestion/UploadButton.tsx:33`, `app/components/layout/Header.tsx:54-59`
  子に `<Icon icon={Upload} />` + `<span className="max-sm:hidden">アップロード</span>` を持ち、`sm` 未満では可視ラベルが隠れアイコンのみになるが、`aria-label="アップロード"` がラベル消失時でも名前を保証する。`aria-label` が子孫を上書きするため、可視テキストが残る desktop でも二重読み上げにならず、件数はヘッダーから完全に除去されている（モック P13 desktop L1033 / mobile L983 の `aria-label="アップロード"` と一致）。`data-primary` / `pillBtnPrimary` / 先頭配置も維持（#628 ADR-003）。

- **[N-005]** サイドバー内 a11y パターンの非対称（ライブラリ note count は `aria-label` なし / upload は `aria-label` 上書き）は ADR-002 で意図的と明記済みで問題なし。
  場所: `app/components/layout/Sidebar.tsx:158-163`（ライブラリ）vs `app/components/layout/UploadNavItem.tsx:20-30`（upload）
  「すべてのノート」項目は `aria-label` を持たず可視 count（`<span>すべてのノート</span><span>{noteCount}</span>`）がそのまま「すべてのノート 35」と読み上げられる一方、upload は `aria-label` で「未処理 N 件」という説明的表現に上書きする。どちらも件数を一度だけアナウンスし AC-4 を満たす。両者の差は「要対応の滞留件数」を説明文として保つ upload 側の意図的な選択であり、ADR-002 Consequences に「揺り戻ししない」と固定されている。設計どおりで一貫性の破綻ではない。

- **[N-006]** （情報）件数 > 99 のとき可視表現「99+」とアクセシブル名の実数（例「未処理 150 件」）が乖離する。
  場所: `app/components/layout/UploadNavItem.tsx:28`（`count > 99 ? "99+" : count`）vs `useIngestionQueueCount.ts:63`（実数を埋め込み）
  可視は「99+」、SR は正確な実数を読み上げる。これは SR 利用者にとってむしろ精緻な情報提供であり退行ではない。WCAG 2.5.3（Label in Name）の観点でも、コントロールのラベル語「アップロード」はアクセシブル名に含まれ満たされる（count ≤ 99 では可視の数字もアクセシブル名に出現する）。受け入れ可能。実装変更の必要はないが、将来 99+ の可視/SR 整合を厳密に揃えたい場合の既知差分として記録する。

- **[N-007]** 件数のライブ更新を `aria-live` で能動的にアナウンスしていないのは AC-4 と整合し、正しい判断。
  場所: `app/components/ingestion/useIngestionQueueCount.ts:18-56`
  `notifyIngestionQueueChanged` / visibility 復帰で `aria-label` の値は更新されるが、live region による割り込み読み上げは行わない。AC-4 は「ちょうど一度だけアナウンス」を求めており、毎回の件数変化を `aria-live` で読み上げると逆に重複・割り込みになる。次にナビ項目へフォーカス/ナビゲートした際に最新の件数込み名が読まれる挙動で十分。移設前のヘッダーバッジ挙動とも整合し、件数取得・通知契約も不変（スコープ内）。
