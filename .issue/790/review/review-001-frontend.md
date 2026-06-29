# Frontend レビュー — PR #807 (Issue #790)

対象: `gh pr diff 807` / `.issue/790/plan.md` / `.issue/790/adr.md`
観点: コンポーネント設計・責務分割、server/client 境界、Styling 規約、依存方向、件数表示ロジック、UX、購読/再レンダリング、命名

## 総評

純UI層のリファクタリングとして計画・ADR に忠実で、Frontend に関わる受け入れ基準（AC-1/AC-2/AC-3/AC-5）はいずれも満たされている。`Sidebar` はサーバーコンポーネントのまま保たれ、ライブ件数の表示だけが新クライアント `UploadNavItem` に隔離されている。死にコード（絶対配置チップ・`uploadButtonLabel`・`BADGE_CHIP`・`data-queue-badge`）の残存はなく、陳腐化コメントも `actions.ts` / `queueBadgeBus.ts` / `Header.tsx` / テストまで漏れなく更新済み。Blocker なし。

### Frontend

#### Blockers

なし

#### Warnings

- **[W-001]** 可視 count は `99+` でキャップされるが `aria-label`（`uploadQueueLabel`）は実数を読み上げる / 場所: `app/components/layout/UploadNavItem.tsx:24,28` + `app/components/ingestion/useIngestionQueueCount.ts:62-64` / 理由: count=120 のとき可視は `99+`、SR アナウンスは「未処理 120 件」と分岐する（`UploadNavItem.test.tsx:94-102` で固定済み）。SR ユーザーには実数の方が情報量が多く defensible だが、plan/ADR はこの可視/アナウンスの分岐を明示しておらず、意図的かどうかが文面から読み取れない。AC-5（モック一致）はモックが count=3 のため検証範囲外で、99超の挙動は実装独自判断になっている。/ 提案: ADR-002 に「99超時は可視 `99+`・アナウンスは実数」という分岐が意図的である旨を一文添えるか、もし可視と揃えたいなら `uploadQueueLabel` 側も `99+` 相当（例: 「未処理 99 件以上」）に寄せるか、どちらかに意図を固定する。実装変更は必須ではなく意図の明文化で足りる。

#### Notes

- **[N-001]** server/client 境界が正しい。`UploadNavItem` のみ `"use client"` で、`Sidebar`（ディレクトリツリー/保存ビュー/他ナビのサーバーレンダリング）は退行していない。`useState(0)` 初期値によりサーバーは count スパン無しでレンダリングし、クライアント初期描画も 0 で一致するためハイドレーションミスマッチ・ちらつきがない（ADR-003 の論拠どおり）。
- **[N-002]** 依存方向が既存パターンと一致。`UploadNavItem`(layout) → `useIngestionQueueCount`/`uploadQueueLabel`(ingestion) は `Header → UploadButton`(ingestion) と同型で、`ingestion → layout` の逆流を持ち込んでいない。
- **[N-003]** Styling 規約準拠。可視件数は集約定数 `NAV_COUNT`（ライブラリ note 件数と同一の `ml-auto text-xs text-ink-tertiary`）を再利用し、アクティブ状態は `ACTIVE_NAV_PROPS`（`data-active=""` + `aria-current="page"`）を `styles.ts` に集約して `Sidebar`/`UploadNavItem` で共有。`data-*` 属性 + Tailwind 直書きの方針に沿う。
- **[N-004]** 件数表示ロジックが要件どおり。`count > 0` のときのみ span を描画（0非表示）、`count > 99 ? "99+" : count` で上限表示。`aria-label` が子孫テキストを上書きするため可視 count が二重アナウンスされず、AC-4 の「ちょうど一度」を満たす。`activeProps`（状態）と `aria-label`（名前）の共存も WAI-ARIA 上正しい。
- **[N-005]** テストの層責務分離が計画どおり。フック挙動（notify/visibility 再フェッチ・hidden スキップ・unmount 停止・失敗時前回値保持・seq ガード）は ingestion 配下の `useIngestionQueueCount.test.tsx` に薄いハーネスで残し、表示/統合（可視 count・`aria-label`・`activeProps` 共存）は layout 配下の `UploadNavItem.test.tsx` に分離。後者の `Link` モックは `activeProps` をアクティブ時にアンカーへスプレッドする実装になっており、共存検証が空振りしない（plan のリスク [P-001 arch] 反映済み）。
- **[N-006]** モック同期が desktop / mobile 両 P13 に反映済み（`spec/design/pages/P13-upload.html:1086-1087` / `mobile/P13-upload.html:1034-1035`、いずれも `<span class="count">3</span>`）。ヘッダーCTAは両モックとも `aria-label="アップロード"` のまま（件数なし）で AC-2 と一致。
- **[N-007]** ADR の Status が全件 `Proposed` のまま。実装が入った以上 `Accepted` に更新しておくと整合的（ドキュメント nit、Frontend 実装には影響なし）。
