# PR #807 レビュー (Round 2) — Accessibility

対象: Issue #790 / ヘッダーCTAバッジのサイドバー upload 項目への移設
観点: Accessibility（AC-4 中心）
判定: **APPROVED**（Blockers 0 / Warnings 0 / Notes 2）

検証ファイル:
- `app/components/layout/UploadNavItem.tsx`
- `app/components/ingestion/UploadButton.tsx`
- `app/components/ingestion/useIngestionQueueCount.ts`
- `app/components/layout/Sidebar.tsx`
- `app/components/layout/styles.ts`（`ACTIVE_NAV_PROPS` / `NAV_COUNT` / `NAV_ITEM`）
- `app/components/layout/Header.tsx`, `app/components/common/Icon.tsx`
- `app/components/layout/__tests__/UploadNavItem.test.tsx`

## Accessibility

### Blockers

なし。

AC-4（件数のアクセシブルなテキスト表現・ちょうど一度だけアナウンス・欠落/重複なし）は満たされている。検証結果:

- **件数の包含と0件フォールバック**: `uploadQueueLabel(count)` が `アップロード（未処理 N 件）`（count>0）/ `アップロード`（0件）を返し、`<Link>` の `aria-label` に常時付与される（`UploadNavItem.tsx` L24, `useIngestionQueueCount.ts` L62-64）。0件でもアクセシブル名は欠落せず "アップロード" が残る。欠落なし。
- **二重読み上げ回避**: `aria-label` は子孫テキスト（`<span>アップロード</span>` と `NAV_COUNT` スパン）の accessible name を上書きするため、可視 count スパンは accessible name 計算に寄与せず、件数は `aria-label` 内の一度だけ。ADR-002 の根拠どおりで、`aria-hidden` を付けずとも重複は発生しない。重複なし。
- **役割の分離・共存**: `ACTIVE_NAV_PROPS`（`styles.ts` L124-127）の `aria-current="page"`（状態）と `aria-label`（名前）は ARIA 上独立し、SR は「アップロード（未処理 N 件）, current page」と件数1回・状態1回で読み上げる。`UploadNavItem.test.tsx` L104-115 が共存をアサート（`Link` モックが active 時に `activeProps` をアンカーへスプレッドする実装になっており、空振りしない）。ちょうど一度。
- **ヘッダーCTAの静的 aria-label**: `UploadButton.tsx` L33 で `aria-label="アップロード"` 固定。アイコン（`Header.tsx` L57 の `<Icon icon={Upload}>` は `label` 省略で `aria-hidden="true"`、`Icon.tsx` L52-59）は decorative で競合せず、`max-sm` 折りたたみ時もアクセシブル名が保持される。`data-primary`/`pillBtnPrimary`/先頭配置・`aria-current` のアクティブ連動も維持。件数は一切持たず、移設先と二重アナウンスにならない（ADR-001 整合）。

### Warnings

なし。

### Notes

- **N-001（受容可能・対応不要）** `99+可視と実数読み上げの乖離`: 可視は `count > 99 ? "99+" : count`、`aria-label` は実数（例 "未処理 120 件"）を読み上げる（`UploadNavItem.tsx` L27-31, `UploadNavItem.test.tsx` L94-102）。これは SR に正確な滞留件数を伝える意図的分岐で、ソースにも WHY コメントが付く。actionable な可視ラベル "アップロード" は accessible name に内包されており WCAG 2.5.3（Label in Name）は満たす。count は補助情報であり、可視 "99+" と読み上げ実数の差は許容範囲。改善不要。

- **N-002（情報・スコープ外）** 件数更新はライブリージョン非依存: `useIngestionQueueCount` の再フェッチで `aria-label` は更新されるが、`aria-live` は無いため SR 利用者へ即時アナウンスはされない。ただし移設前のヘッダーバッジ（`aria-label` 更新のみ）と同等の挙動で、AC-4 が要求するのは「ちょうど一度・欠落/重複なし」という静的構造であってライブ通知ではない。退行なし・本Issueスコープ外。仕様として現状で問題ない。

### a11y 非対称の妥当性

同一サイドバー内で、ライブラリ "すべてのノート" 項目（`Sidebar.tsx` L153-164）は `aria-label` を持たず可視 count を内容として読み上げるのに対し、upload 項目は `aria-label` で「未処理 N 件」に上書きする。この分岐は ADR-002 Consequences に「意図的な a11y 非対称」として明記され、要対応ニュアンスを説明文で保つ設計判断として正当化済み。妥当。
