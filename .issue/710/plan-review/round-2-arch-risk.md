# Plan Review — Issue #710 (Round 2: アーキテクチャ整合性・実現可能性・リスク)

レビュー視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク

対象: `.issue/710/plan.md` / `.issue/710/adr.md`（1周目 `.issue/710/plan-review/round-1-arch-risk.md` の反映確認を最優先）

---

## 1周目指摘の反映確認

- **[P-001 反映 OK]** `styles.ts` の `filterChip` JSDoc 同期が実装ステップ 3 の対象ファイルに `styles.ts` を加えた上で「`filterChip` JSDoc（62-77, 68-69 行）から『Directory … shows just the active chip (#497 ADR-001)』を除去し、パンくず表示（#710 ADR-002）＋フォールバック時のみ `filterChip` を使う旨に更新」と具体的に明記された（plan.md:95, 129）。調査結果（plan.md:41）にも乖離箇所が記載され、レビュー履歴（plan.md:177）に対応が記録されている。適切に反映済み。

- **[P-002 反映 OK]** 到達不能な「optimistic≠baseline の過渡状態」分岐が削除され、表示分岐が「(a) `optimisticDirectoryId === undefined` → 非表示／(b) segments 非空 → パンくず／(c) segments 空 → フォールバック」の2軸（undefined 判定 + segments 有無）に整理された（plan.md:89-93, 127, 160、AC-4/AC-5）。コードで裏取り確認: `FilterBar.tsx` の `FilterAction` union に directory 系は `clearDirectory`（undefined 化）のみで `setDirectory` が存在せず（87-88 行に setDate/setVisibility/setReferencing はあるが set directory は無い）、`optimisticDirectoryId` は `undefined`（解除）か `directoryId`（baseline）の二値しか取らない。よって「第三の値の過渡状態は構造上発生しない」という根拠は正確で、`=== directoryId` 一致判定を分岐から外す判断（plan.md:93）も到達不能コード回避として妥当。adr.md:34 も同根拠で「フォールバック発火条件は segments 空に一本化」と整合的に書き直されている。

- **[S-001 反映 OK]** 共有型 `BreadcrumbSegment = Readonly<{ id: string; name: string }>` を `directoryTree.ts` に export して SSOT 化し、既存 `NoteBreadcrumbProps.segments`（現状インライン `readonly { id: string; name: string }[]`、`NoteBreadcrumb.tsx:20` で確認）も `readonly BreadcrumbSegment[]` 参照へ置換する方針が実装ステップ 1 に明記された（plan.md:71, 110）。同形につき互換で描画ロジック不変、置き場が detail/list 中立の `directoryTree.ts` という配置理由も妥当。

- **[S-002 反映 OK]** `nav aria-label` 文言の差別化（`NoteBreadcrumb` の `aria-label="パンくず"` を流用せず一覧ページの landmark 構成を照合して `aria-label="現在のディレクトリ"` 等にする）が設計（plan.md:79）と実装ステップ 2（plan.md:118）に反映された。`NoteBreadcrumb.tsx:38` で詳細側が `aria-label="パンくず"` を使うことを確認済みで、指摘の前提も正しい。

- **[S-003 反映 OK]** root 除外の二重防御（ヘルパーの `name === ""` 除外 + #356 ADR-002 の root id 不渡し）の責務境界を `directoryAncestorSegments` の JSDoc に 1 行残す方針が設計（plan.md:74）と実装ステップ 1（plan.md:112）に明記された。`flattenDirectoryTree`（`directoryTree.ts:30-32`）が root の空名を扱う既存規約とも整合。

1周目の問題点・改善提案はすべて適切に反映され、レビュー履歴（plan.md:175-187）にも修正点・取り込み・見送り（S-001 coverage の AC 化見送り＝妥当）が正確に記録されている。

---

## 問題点（要修正）

問題点ゼロ。

前周指摘の反映で新たな到達不能コード・型不整合・依存逆転などの問題は生じていない。特に P-002 の修正で導入された2軸分岐は、コード上の `FilterAction` union（`clearDirectory` のみ）と照合して到達可能性に矛盾がないことを確認した。S-001 の共有型 SSOT 化も、既存 `NoteBreadcrumbProps` を同形で置換するだけで描画契約（commit 322516ee で確定した区切り規約）を壊さない。

---

## 改善提案（検討推奨）

- **[S-001]** `HomePage.tsx` の `directorySegments` 受け渡しを、現状の `directoryName` と同じ「条件付きスプレッド（値が undefined のとき渡さない）」作法で書くと、segments が空配列のとき prop 未渡し（`undefined`）になるか空配列が渡るかで FilterBar 側の `directorySegments` 受け取り（`?:` optional）の扱いが分かれる。plan.md:100 は「`search.directoryId === undefined` のときは渡さない」としており、これは正しい（directoryId 未選択時は prop 自体不要）。一方 `directoryId` はあるが segments が空（削除直後）のケースでは `directoryAncestorSegments` が空配列を返し、それを prop として渡す経路になる。FilterBar 側の表示分岐（segments 非空 → パンくず／空 → フォールバック）は `optimisticDirectoryId !== undefined` を外枠条件にして segments 長さで分けるため、`directorySegments` が `undefined`（directoryId 自体なし）か `[]`（directoryId あり・解決失敗）かで挙動が変わらないよう、FilterBar 側で `(directorySegments ?? []).length > 0` のように正規化して扱うことを実装時に明示しておくと、prop 受け渡し作法（条件付きスプレッド）と表示分岐の境界が曖昧にならない。スコープ内の軽微な実装ガイドであり計画の方針自体は正しい。

---

## 良い点

- 1周目で指摘した P-001/P-002/S-001〜S-003 がすべて具体的な実装ステップ・対象ファイル・JSDoc 文言レベルまで落とし込まれ、レビュー履歴にトレーサブルに記録されている。修正が「言及だけ」で終わらず検証可能な粒度に達している。

- P-002 の修正根拠がコードの型レベル事実（`FilterAction` union に directory の set 系が無い）に立脚しており、「到達不能だから書かない」という判断が憶測でなく構造的に裏付けられている。adr.md ADR-002（plan.md:34）まで同根拠で一貫して書き直されており、計画・ADR 間の不整合がない。

- presentation 層のみ・追加 I/O 不要という結論が `HomePage.tsx:165-182`（`loadDirectoryTreeFlat` で `flat` をロード済み、各 `FlatDirectory` が `parentId`/`name` 保持）と `directoryTree.ts:14-20` で裏付け済み。`directoryAncestorSegments` を既存純粋ヘルパー SSOT（`directoryTree.ts`）に置き、`loaders.ts`（`serverData(getContainer())` 依存）に純粋ロジックを置かない方針が JSDoc 規約（`directoryTree.ts:6-13`）と完全一致。

- 循環ガード（visited セット）・`parentId` 切れ打ち切り・id 不在時の空配列という `directoryAncestorSegments` の堅牢性要件がヘルパー設計に組み込まれ、対応するユニットテスト（ネスト/root直下/不在/循環）がテストステップ（plan.md:141）に列挙されている。エッジケースの取りこぼしがない。

- ADR-001（`DirectoryBreadcrumb` 新設 vs `NoteBreadcrumb` 流用）の判断が、`NoteBreadcrumb.tsx:19-22, 61-63` の「`noteTitle` 必須・末尾に `aria-current="page"` のタイトル」という確定契約と一覧側末尾（解除 `×`）の意味差に正しく基づく。3つ目のパンくず出現時に共通化検討というフォローアップ余地の認識も健全。

- root 除外・Link search 構築（`{ ...HOME_SEARCH, directoryId: segment.id }`）・nav 語彙スタイル（`filterChip` を使わず `text-sm text-ink-tertiary` 系）が `NoteBreadcrumb` の既存パターン（`NoteBreadcrumb.tsx:24-25, 50-56`）および #356 ADR-002・#497 ADR-001 上書きと整合。レイアウト回帰（チップ列 `filterBar` の横スクロールとパンくず折り返しの干渉）もリスク節（plan.md:163）で `flex-wrap [overflow-wrap:anywhere]` 踏襲として具体的に予防されている。
