# Round 2 レビュー — アーキテクチャ整合性・実現可能性・リスク（Issue #509）

レビュー視点: **プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク**
対象: `.issue/509/plan.md` / `.issue/509/adr.md`（1周目反映後）

---

## 1周目指摘の反映確認（コード照合済み）

- **[P-001 status 矛盾]** 解消を確認。AC 直下に「DTO status 6 値 → Tone」対応表を新設、AC-3 を「いずれかの状態バリアントにマップ」へ修正。`expired`→`warning` も確定。`admin/Jobs/index.tsx` L141-154 の `exportStatusTag` 実定義（`failed→error` / `pending|processing→info` / `completed→success` / `cancelled|expired→warning`）と plan/ADR-004 の表が**完全一致**。
- **[P-002 data-status 上書き順]** 解消を確認。`data-status` 多分岐を廃し、チップ＝`tagBadge`+`tagTone[exportStatusTag(status)]`（`admin/Jobs/index.tsx` L321 の稼働パターンと同一）、dot＝Tone（4 系統）分岐に倒した。`tagTone` のキーが `info/success/warning/error` の 4 つ（`common/styles.ts` L278-283）であることも確認。上書き順リスクは構造的に消えている。
- **[S-001 影トークン合成]** 反映を確認。ADR-005 新設、`shadow-[var(--shadow-xs),0_0_0_0.5px_rgba(0,0,0,0.04)]` で第1レイヤーをトークン参照に。
- **[S-002 exportStatusTag 流用]** 反映を確認。ADR-004＋ステップ2で共通モジュールへの括り出しを確定。`exportStatusTag` が現状 admin ローカルの**非 export** 関数（L141）であることも実コードで一致。
- **[S-003 リテラル px]** 反映を確認。`--container-max: 1280px` のみで 720/1100 トークンが無い旨を共通方針節に明記、arbitrary 許容を正当化。
- **[S-004 checkbox DOM 順]** 反映を確認。`ExportForm.test.tsx` の `findMediaCheckbox()` は `boxes.item(1)`（L82）で 2 番目を取得、`index.tsx` の DOM 順は FrontMatter（L192）→ メディア（L201）。plan「テスト破壊」注記と一致。

1周目指摘はすべて、実コードと矛盾なく反映されている。

---

#### 問題点（要修正）

- **[P-001]** ADR-004 の `exportStatusTag` 共通化で、戻り値型 `Tone` の移動が計画に含まれていない
  - 理由: `exportStatusTag(status): Tone` の `Tone` 型は `admin/Jobs/index.tsx` L45 に**ローカル `type Tone = "info" | "success" | "warning" | "error"`** として宣言されており、`common/styles.ts` には `Tone` 型の export が無い（`tagTone` は値のみ、`keyof typeof tagTone` 相当の型 export も無い）。`exportStatusTag` を共通モジュールへ移すと、その戻り値型 `Tone` も共通側で定義・export する必要がある。さらに dot 色の「Tone → dot 色」小マッピング（plan ステップ2 / ADR-004）も `Record<Tone, string>` で型付けするなら `Tone` 型に依存する。ステップ2 は「関数を移して admin の import を差し替える」までしか書いておらず、`Tone` 型の所在が宙に浮く。
  - 提案: ステップ2 に「`Tone` 型（`keyof typeof tagTone` を `export type Tone` として共通化、または `tagTone` のキー型を共通 export）も共通モジュールへ移し、admin/Jobs の `type Tone` ローカル宣言を削除して共通 import に差し替える」を 1 行追記する。`ingestionStatusTag` も同じ `Tone` を返す（L109）ため、admin 側の `Tone` をローカルに残すと「共通 Tone」と「admin ローカル Tone」が二重定義になる点も指摘しておく（DRY 観点で共通へ寄せるのが筋）。

---

#### 改善提案（検討推奨）

- **[S-001]** ADR-003 の行アクション（`pillBtnPrimary`/`pillBtnGhostDanger`/`pillBtnGhost`）には**ペアの `data-*` 属性が必須**である旨をステップ4/5 に明記する
  - 理由: `common/styles.ts` の `pillBtnPrimary`(L48) / `pillBtnDanger`(L62) / `pillBtnGhostDanger`(L86) / `pillBtnGhost`(L105) は、JSDoc が明記するとおり**色は `data-[primary]:` / `data-[danger]:` / `data-[ghost-danger]:` / `data-[ghost]:` バリアント側にあり、対応する `data-primary=""` / `data-danger=""` 等の属性を要素に付けないと色が出ない**（同一プロパティの生成順対策で意図的にこの設計）。admin/Jobs も `data-sm=""`(L262 等) を付けている。ADR-003 / ステップ4 は「`pillBtn`+`pillBtnSmDense`(+primary/danger/ghost)」と書くが、`data-primary=""`/`data-danger=""` の付与に言及していない。これを落とすと「クラスは当たっているのに色が出ない」沈黙バグになり、ビルド/型/テストでは検出されない（目視レビュー頼み）。
  - 補足: 詳細 Link（`<a>`）に danger/ghost 系を当てる場合も同様に属性が要る。`pillBtn` は anchor 対応済み（ADR-003 で確認済み）なので構造問題は無く、属性付与の明記だけで足りる。

- **[S-002]** 一覧の進捗バー描画条件（`processing` 限定）と現状 DOM の差を 1 行明記すると実装ブレを防げる
  - 理由: 現状 `ExportJobsList/index.tsx` は status に関わらず常に `{processed}/{total}` を素 span で描く（L82-84、確認済み）。plan ステップ4 は「進捗バーは `processing` かつ `total>0` のとき」とするが、これは現状 DOM に無い**バーの新規追加**（装飾要素の追加）。「count テキストは全 status 維持・バーは processing 時のみ装飾追加」という棲み分けを明記しないと、count を消してバーに置換する誤実装になりうる。スタイリングのみスコープ上、既存 count span は残すのが正。
  - 補足: これは機能追加ではなく装飾要素の付加なのでスコープ内だが、「既存 DOM を消さない」点だけ釘を刺すと安全。

- **[S-003]** 全 ADR の Status が `Proposed` のまま
  - 理由: ADR-001〜005 すべて `Status: Proposed`。計画は2周のレビューを経て確定段階に入る。実装着手前に `Accepted` へ更新しておくと、実装フェーズで「未確定の選択肢が残っている」と誤読されない。軽微。

---

#### 良い点

- **1周目指摘がすべて実コード照合と矛盾なく反映されている**: `exportStatusTag` のマッピング・`tagTone` の 4 キー・`findMediaCheckbox` の `item(1)`・`STATUS_LABEL` の export 元・`--container-max` の単一値・`SECTION_LABEL` が layout/common に無い（→ export local 新設が妥当）まで、plan/ADR の主張が実装と 1:1 で一致。机上で閉じず grep 裏取りした跡がある。

- **P-002 解消の方式が「上書き順リスクを構造的に消す」筋の良い設計**: `data-status` 6 分岐を関数マッピング（`tagTone[exportStatusTag(status)]`）に置換し、分岐を Tone の 4 系統へ畳んだことで、CSS 生成順勝負そのものが発生しない。admin で稼働中の同一パターンを流用しており、再発明でなく既存資産の整理になっている。

- **ADR-004 の「二重定義回避のための関数移動 1 件」のスコープ判断が誠実**: スタイリングのみの Issue に純関数の置き場所変更が混じることを「トレードオフ」として明示し、DRY と引き換えに許容と判断。横依存（admin→export）を避けるため共通モジュールへ寄せる方向も依存方向として正しい。

- **「モック vs 実装の機能差を意匠で埋めない」統制が2周目でも維持**: expiry 残日数の色分けを付けない、対象ラジオ/実行モード/推定サイズを描かない、page-subtitle はモック既存文言のみ転記、といった釘刺しが一貫。スタイリング限定スコープが機能追加へ膨らまない。

- **ADR-001/002/003 の判断が `<ul><li>` 構造・JIT 制約・既存 a11y と整合**（1周目評価を維持）。card-list 採用・動的幅 inline style・テキスト付き小ピルのいずれも、実装 DOM とプロジェクト規約に照らして妥当。
