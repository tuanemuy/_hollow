# PR #807 レビュー (Round 2) — Frontend

対象: PR #807 / Issue #790（ヘッダーCTAの未処理アップロード件数バッジをサイドバー upload ナビ項目へ移設）
観点: Frontend（コンポーネント設計・責務分割、server/client 境界、Styling 規約、依存方向、件数表示ロジック、UX、購読リーク、命名）
方式: ゼロベース再レビュー（R1 修正の反映確認を含む）

## 総評

純UI層リファクタリングとして完成度が高い。レイヤー責務（件数データ=ingestion / ナビ表示=layout、依存方向 `layout → ingestion`）は既存の `Header → UploadButton` と同型で一貫。server/client 境界（`Sidebar` はサーバーのまま、`UploadNavItem` だけクライアント化）も RSC の正攻法。Styling は `NAV_COUNT`/`ACTIVE_NAV_PROPS` の集約定数と `data-*` 規約に正しく沿い、件数表示ロジック（0非表示・`99+`・可視は丸め/`aria-label` は実数）・a11y 契約（件数を一度だけアナウンス）も設計どおり。死にコード（`IngestionQueueBadge`/`BADGE_CHIP`）は完全除去され、改名・stale コメント更新も漏れなし（`grep` で残存ゼロ確認）。対象テスト 17 件 PASS、モック（desktop/mobile P13）同期済み。**Blocker・Warning ともなし。**

### Frontend

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** バス名 `queueBadgeBus` / `resetIngestionQueueBusForTest` に "Badge" 表記が残る（UIに badge はもう無く、インライン count）。場所: `app/components/ingestion/queueBadgeBus.ts`。JSDoc 本文（L2 "for the sidebar upload nav item count"）と全コメントは更新済みで実害なし。plan が「バス名 `queueBadgeBus` は表示位置と無関係なので据え置く」と明示的にスコープ外としており妥当。将来 bus 名の整理を行うなら別タスクで。

- **[N-002]** 件数のハイドレーション後出現。サーバーは初期値 0 で count スパンを描かず、クライアントの初回フェッチ成功後にスパンが追加されるため、件数>0 のとき軽微なレイアウトシフトが起きうる。場所: `app/components/layout/UploadNavItem.tsx:27-31`。ライブ件数の性質上不可避で、移設前（ヘッダーチップ）と同じ挙動。許容。

- **[N-003]** `data-active` の表現差。`UploadButton` は `data-active={active || undefined}` で `data-active="true"` を、サイドバー各 Link / `UploadNavItem` は `ACTIVE_NAV_PROPS` の `"data-active": ""` で `data-active=""` を描画する。Tailwind `data-[active]:` は属性の存在のみ判定するため両者とも同一に発火し、いずれも CLAUDE.md ADR-003（動的=`value || undefined` / 静的=`""`）に準拠。問題なし（確認結果として記載）。

## 確認した受け入れ基準

- **AC-1**（サイドバー件数表示・0非表示・`99+`・`NAV_COUNT` 右寄せ）: OK。`UploadNavItem.tsx` で `count > 0` ガード、`count > 99 ? "99+" : count`、`className={NAV_COUNT}`。ライブラリ note 件数と同一見た目。
- **AC-2**（ヘッダーCTAが純粋ボタン・バッジ削除・静的 `aria-label="アップロード"`・`data-primary`/`pillBtnPrimary`/先頭配置維持）: OK。`UploadButton.tsx` から件数依存・`relative` を除去、`Header.tsx` で先頭・`pillBtnPrimary` 維持。陳腐化コメントも除去済み。
- **AC-3**（イベント駆動更新が新位置で動作）: OK。`useIngestionQueueCount` を `UploadNavItem` が購読。notify/visibility/mount 再フェッチ・seq ガード・失敗時前回値保持を `useIngestionQueueCount.test.tsx` が網羅。cleanup で unsubscribe + removeEventListener、購読リークなし。
- **AC-4**（件数を一度だけアナウンス）: OK。`<Link aria-label={uploadQueueLabel(count)}>` が子孫テキスト（`アップロード` + count スパン）を上書きし二重読み上げ回避。`activeProps` の `aria-current="page"`（状態）と共存。可視は `99+` 丸めだが `aria-label` は実数（意図的、コメント明記）。WCAG Label-in-Name も満たす（可視 "アップロード" を accessible name が包含）。
- **AC-5**（実装とモック一致）: OK。count span class が `.nav-item .count`（`NAV_COUNT`）規約と一致、desktop/mobile 両 P13 の upload ナビ項目（active）に `<span class="count">3</span>` 同期済み、ヘッダーCTAは両モックとも件数なし。

backend 2ファイル（`countActiveIngestionJobs.ts` / `ingestionJobRepository.ts`）の変更は "header queue badge" → "sidebar upload nav item count" の JSDoc 修正のみでロジック不変。plan のスコープ（データソース不変）と矛盾せず、stale コメント更新指示（ステップ8）の範囲内。
