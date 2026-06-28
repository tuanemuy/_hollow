# Round 3 レビュー（アーキテクチャ整合性・実現可能性・リスク）— Issue #790

**レビュー観点:** あるべきアーキテクチャとの整合性・実現可能性・リスク
**周回:** 3周目（最終）。1・2周目指摘の反映確認が主眼。

---

## 検証した2周目訂正の正確性（実コード照合）

| 訂正項目 | 実コード | 判定 |
|---|---|---|
| settings での UploadNavItem アンマウント | `AppShellDrawer.tsx` L83 `inSettings = pathname.startsWith("/settings")`、L206 `inSettings && settingsSidebar ? settingsSidebar : sidebar`（`sidebar` 全体が差し替え＝UploadNavItem 完全アンマウント） | 正確 |
| モバイル offcanvas は DOM 残存 | L196-207 単一 `<aside>` を CSS でレスポンシブ制御、`isMobile` は role/aria-modal を切替えるのみで再マウントしない | 正確 |
| grep 拡張（header badge 系コメント） | `UploadForm.tsx:184` / `IngestionJobEditDialog.tsx:31` / `actions.ts:163` / `queueBadgeBus.ts:2` / テスト `UploadDialog`・`UploadForm`・`IngestionJobRow` すべて実在を確認 | 正確（網羅） |
| "queue badge bus"（バス名）は据え置き | テスト名 `notifies the queue badge bus` 等が位置と無関係なバス名参照であることを確認 | 正確 |
| UploadButton.test の Link モックは activeProps を解釈しない | `UploadButton.test.tsx` L35-41 `Link: ({ ...rest }) => <a {...rest}>` で `activeProps` を素通し（ジャンク属性化）。流用すると共存検証が空振りする指摘は正しい | 正確 |
| a11y 非対称（aria-label 上書き） | `aria-label` が子孫テキストを上書き＝NAV_COUNT span は二重読み上げされない。意図的非対称の記録も妥当 | 正確 |
| NAV_ITEM が active スタイルを内蔵 | `styles.ts` L114 `NAV_ITEM` は `relative` と `aria-[current=page]:bg-surface data-[active]:bg-surface` を含む。`ACTIVE_NAV_PROPS`（L26-29）と整合 | 正確 |

2周目の4訂正（settings アンマウント・grep 拡張・Link モック activeProps スプレッド・a11y 非対称）はいずれも実コードと一致し、本文（plan.md）の依存関係・リスク・ADR-001 に正しく反映されている。

---

## 問題点（要修正）

- **[P-001]** ADR-003 Consequences（adr.md L52）に、2周目で訂正したはずの旧前提が残存している。
  - 該当文: 「サイドバーは常時マウントのため購読が安定（モバイルのオフキャンバス時も DOM 上に残り更新が効く）。」
  - **理由:** 2周目修正は「サイドバーは常時マウント／購読は常時生存」という前提を**誤りとして訂正**し、plan.md の依存関係(L60)・リスク(L157-158)・ADR-001 Consequences(L17) には「`/settings/*` では UploadNavItem が完全アンマウントされ購読が切れる」と正しく反映済み。しかし ADR-003 L52 だけは旧前提（「常時マウントのため購読が安定」）を無修飾で断言したままで、ADR-001 と内部矛盾している。括弧内のモバイル offcanvas に関する記述自体は正しいが、その手前の「常時マウントのため購読が安定」という一般化は settings ケースで偽。訂正の波及が ADR-003 に届いておらず、訂正の「正確かつ十分な反映」という今回の主眼を満たしていない。実装者が ADR-003 だけを読むと「購読は常に生存する」と誤解し、mount 時再フェッチでの復帰という設計根拠（AC-3 の真の根拠）を見落とすリスクがある。
  - **提案:** L52 の「サイドバーは常時マウントのため購読が安定（…）」を、ADR-001 / リスク欄と同じ表現に揃える。例:「サイドバーの upload 項目はモバイル offcanvas では DOM 上に残り購読が生存するが、`/settings/*` では settings 用サイドバーに差し替わり UploadNavItem はアンマウントされる。後者でも mount 時再フェッチで復帰するため機能的退行はない（詳細は ADR-001 / リスク欄）」。あるいは当該クロージング文を ADR-001 への参照に置換する。

---

## 改善提案（検討推奨）

- **[S-001]** ステップ1の拡張子判断（`.ts` vs `.tsx`）について、削除後の残存コードに JSX が無いことは `IngestionQueueBadge.tsx` 現物（フックと `uploadButtonLabel` はいずれも JSX を返さない）で確認済みなので、計画の「もし JSX が残るなら .tsx 維持」という条件節は実質発生しない。最終計画として `.ts` で確定と言い切ってよい（防御的記述として残すのも許容、着手判断には影響しない）。

---

## 良い点

- 2周目の最重要訂正（settings アンマウント）が実コード L83/L206 と完全一致し、AC-3 の根拠を「常時マウント」から「mount 時再フェッチによる復帰」へ正しく組み替えている。フックのクリーンアップ（`cancelled`/`unsubscribe`/`removeEventListener`）と再 mount 時 `refresh()` の挙動からも、再マウント復帰・購読重複なしという主張は裏づけられる。
- 依存方向（`layout → ingestion`、既存 `Header → UploadButton` と同型）を逆流させず、Sidebar をサーバーコンポーネントに保ったまま UploadNavItem だけクライアント化する切り出しは、CLAUDE.md のフロントエンド方針およびヘキサゴナル整合に沿う。
- grep 拡張対象が実在ファイルと完全一致し、かつ "header badge"（位置）と "queue badge bus"（バス名）を明確に区別して過剰修正を防いでいる。レビュー履歴の追跡可能性も高い。
- テストの層責務分割（フック挙動＝ingestion / 表示・統合＝layout）と Link モックの差異（宣言的 activeProps vs 命令的 useLocation）の指摘は実コードで裏づけられ、実装着手レベルで具体的。

---

## 総合判断

P-001（ADR-003 の旧前提残存）は **ドキュメント整合性の修正**であり、実装方針・コード構成・受け入れ基準そのものに欠陥はない。一文の文言修正で解消でき、実装ステップは現状のまま着手可能。修正後は最終計画として承認に足る品質。
