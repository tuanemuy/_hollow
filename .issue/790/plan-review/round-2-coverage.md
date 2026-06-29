# Issue #790 計画レビュー（2周目）— 要件カバレッジ・スコープ整合性

レビュー対象: `.issue/790/plan.md` / `.issue/790/adr.md`
視点: Issue要件のカバレッジ・スコープ整合性

## 検証した事実

- モック実在: `spec/design/pages/P13-upload.html` / `spec/design/pages/mobile/P13-upload.html` 両方を確認。両モックとも管理セクションの `アップロード` ナビ項目は件数なし、ヘッダーCTAは `aria-label="アップロード"`（件数なし）。`.nav-item .count` CSS（L390）と既存 count span 使用（desktop L1053 = ライブラリ 127）も実在。→ ステップ7・AC-5 の前提は正確。
- `IngestionQueueBadge.tsx`: `useIngestionQueueCount` / `IngestionQueueBadge`(`BADGE_CHIP`・`data-queue-badge`・`aria-hidden`) / `uploadButtonLabel` の3 export を確認。→ ステップ1・ADR-002 の記述は正確。
- `Sidebar.tsx`: `/upload` Link（L122-130, `NAV_ITEM`+`ACTIVE_NAV_PROPS`, 件数なし）、ローカル `ACTIVE_NAV_PROPS`（L26）、ライブラリ count（L171 `NAV_COUNT`）を確認。→ ステップ2・3・4 の前提は正確。
- `UploadButton.tsx`: `useIngestionQueueCount`/`IngestionQueueBadge`/`uploadButtonLabel` import、`aria-label={uploadButtonLabel(...)}`、`relative`、`useLocation`/`data-active` を確認。→ ステップ5 の記述は正確。
- `styles.ts`: `NAV_COUNT = "ml-auto text-xs text-ink-tertiary"` を確認。→ 正確。

## Issue AC ↔ 計画 AC の対応（全件マップ済み）

| Issue AC | 計画 AC | 実装ステップ紐づけ |
|---|---|---|
| サイドバー upload 項目に件数表示 | AC-1 | 1,3,4 ✓ |
| ヘッダーCTAを純粋ボタンに | AC-2 | 5 ✓ |
| イベント駆動更新が新位置で動作 | AC-3 | 1,3 ✓ |
| アクセシブル表現を保持（一度・欠落なし・重複なし） | AC-4 | 1,3 ✓ |
| 実装とモックが一致 | AC-5 | 3,4,5,7 ✓ |
| 品質ゲート | AC-6 | 8 ✓ |

漏れなし。各 AC に実装ステップが紐づき、ステップ側にも対応 AC が記載されている。

## 4つの設計の問いへの結論（全件解決済み）

1. ヘッダーバッジ remove/relocate-only → ADR-001 完全移設（remove）。明確。
2. アクセシブル名の扱い → ADR-002 `aria-label`（`uploadQueueLabel`）で一度だけアナウンス。明確。
3. #628 とのオーダリング整合 → AC-2/ステップ5 で `data-primary`/`pillBtnPrimary`/先頭配置維持を明記。整合。
4. クライアント境界 → ADR-003 専用 `UploadNavItem`、`Sidebar` はサーバーのまま。明確。

## 1周目指摘の反映確認

- [P-001 coverage] モバイル P13 同期: ステップ7 が desktop/mobile 両 P13 を明示、Sidebar 共有コンポーネント根拠も記載、AC-5 検証対象に両方を含む。→ 反映済み（両ファイル実在も確認）。
- [S-001 coverage] AC-5 の対応ステップに 3,4 追加（`3,4,5,7`）。→ 反映済み。

## スコープ整合性

- 含む/含まないが明確に区分。データソース・pub-sub・notify 呼び出し側の不変を明示。
- 改名（`IngestionQueueBadge.tsx`→`useIngestionQueueCount.ts`、`uploadButtonLabel`→`uploadQueueLabel`）は「移設」を超える作業だが、ADR-001/002 の完全移設＝死にコード/誤称残存回避として正当化済み、ステップ8 grep 検証も計画。1周目 S-002 coverage で議論済み・維持判断。スコープ逸脱とは言えない。
- ステップ2 の `ACTIVE_NAV_PROPS` 集約も「Sidebar/UploadNavItem 共有分のみ」と範囲限定し、他コンポーネント統合をスコープ外と明記。整合。
- `P10-home.html` 全面同期を別タスク（spec-sync）に切り出す判断も妥当。

---

#### 問題点（要修正）

問題点ゼロ。

Issue の全 AC（6件）とアクセシビリティ要件が計画 AC に漏れなく写され、各 AC が検証可能な形（0非表示/`99+`/`aria-label` 文言/モック一致対象の特定）で記述されている。4つの設計の問いはすべて ADR で結論済み。1周目指摘（モバイルモック同期・AC-5 紐づけ）も適切に反映され、関連コード・モックの前提も実体と一致している。スコープ外作業の混入もない。

#### 改善提案（検討推奨）

- **[S-001]** サイドバー内の a11y パターンの非対称性を計画に一言補足するとよい。既存のライブラリ count 項目（「すべてのノート」+ `NAV_COUNT`、`Sidebar.tsx` L164-172）は `aria-label` を持たず、件数は可視テキストとして自然に読み上げられる。一方 upload 項目は `aria-label={uploadQueueLabel}` で子孫テキストを上書きする。同一サイドバー内の隣接 count 項目で件数アナウンス方式が分岐する。upload 側は「未処理 N 件」という説明的表現を保つ意図があり妥当な判断だが、この非対称が意図的であることを ADR-002 に一文添えると、レビュー/将来の保守時に「ライブラリ count に合わせて aria-label を外すべきでは」という揺り戻し検討を防げる。/ 理由: 要件（AC-4 一度だけアナウンス）は両方式とも満たすため必須ではないが、スコープ整合性（同一コンポーネント内パターン一貫性）の観点で意図の明文化が望ましい。

#### 良い点

- Issue の「Design questions」4件をそのまま ADR-001/002/003 に対応づけ、各問いに Decision/Consequences で結論を出している。問い→決定のトレーサビリティが明確。
- AC-5 の「実装とモックが一致」を、対象モックを P13（desktop/mobile）に特定し、`P10-home.html` の既存乖離を別タスクへ切り出すことで「検証可能な形」に絞り込めている。曖昧な「モックと一致」で終わらせていない。
- スコープ「含まれないもの」が4項目で具体的（データ層不変・管理セクション構成不変・P10全面同期除外・視覚差別化しない）。スコープ膨張の歯止めが効いている。
