# Plan Review round-1 — アーキテクチャ整合性 / 実現可能性 / リスク（Issue #805）

対象: `.issue/805/plan.md`, `.issue/805/adr.md`
視点: あるべきアーキテクチャとの整合性・実現可能性・リスク

## 検証したこと（実コードと突き合わせ）

- **行番号・シグネチャ**: plan の記述はすべて実ファイルと一致。
  - Dashboard L43 `formatBytes(value: number | null)`（呼び出し3箇所: totalStorage / storageR2Bytes / storageDurableObjectBytes）。
  - Metrics L45 は Dashboard と完全同一実装（呼び出しは limits 4 + storage 3 = 7箇所、L61/65/67/70/181/184/185）。
  - AccountDeleteForm L54 `formatBytes(value: number)`（null 分岐なし、呼び出し1箇所 L151 `formatBytes(impact.mediaTotalBytes)`）。直前 L51-53 に YAGNI コメント。
  - ExportJobDetail L40 `B(整数)→KB(1桁)→MB(2桁)`、GB/TB なし。IngestionJobRow L182 `(byteSize/1024).toFixed(1)} KB` 固定。
  - grep で `formatBytes` の定義・利用は上記5ファイルのみ（他に波及なし）を確認。
- **`—` の文字**: Dashboard の該当行を xxd で確認、`e2 80 94`（U+2014 EM DASH）。plan の主張どおり。
- **import 記法**: 3コンポーネントは `@/components/common/...` エイリアス既存。plan の「既存に揃える」と一致。テストは既存 `byteSize.test.ts` が `../byteSize` の相対 import（plan の追記もこれに乗る）。
- **テスト配置・記法**: `app/components/common/__tests__/byteSize.test.ts` に追記。`docs/test.md` の命名規約 `**/__tests__/<target>.test.ts` に合致。既存ファイルは `vitest` の `describe/it/expect` + 「出力を verbatim ロック（IEEE754 の toFixed 込み、手計算ではなく実出力を固定）」方針。plan はこれを踏襲。
- **境界値の実出力を node で実測**し、plan step5 の期待値が実行時出力と全一致することを確認:
  `null→"—"`, `0→"0 B"`, `512→"512 B"`, `1023→"1023 B"`, `1024→"1.0 KB"`, `102400→"100 KB"`, `1024²→"1.0 MB"`, `100·1024²→"100 MB"`, `1024³→"1.0 GB"`, `1024⁴→"1.0 TB"`, `1024⁵→"1024 TB"`, `1536→"1.5 KB"`。浮動小数の境界ズレ（`Math.floor(Math.log(1024^n)/Math.log(1024))`）は該当値で発生せず。
- **既存の破壊リスク**: Dashboard の `__tests__` は `chart.test.ts` のみ（formatBytes 非依存）。AccountDeleteForm の `index.test.tsx` は fixture に `mediaTotalBytes: 1024*1024` を持つが、`"1.0 MB"` 等の描画テキストをアサートしていない（getByText/toHaveTextContent なし）。よってコンポーネント側テストは refactor で壊れない。plan が component render テストの改修を挙げていないのは妥当。

## 総評

Issue の要件（3コピーの1本化、別ポリシー2件の据え置き判断、見た目不変のテスト担保）をすべて満たし、スコープを正確に守っている。行番号・シグネチャ・文字コード・境界値がすべて実コードと一致しており、実現可能性・リスク管理とも問題なし。ADR-001 の「`number | null` 上位互換 / オプション引数で肥大化させない / 別ポリシー2件は据え置き」は根拠が明快で、CLAUDE.md の設計原則（表示 util の `app/components/common/` 集約、library-level JSDoc、illegal state を型で吸収）とも整合している。

## 問題点（要修正）

問題点ゼロ。

## 改善提案（検討推奨）

- **[S-001]** 既存 `formatMegabytes` の JSDoc 文言を `formatBytes` 追加時に微修正する
  - 理由: 現 JSDoc は「the variable-unit `formatBytes` **family** that auto-selects **B/KB/MB/GB**」と書いており、(a) 集約後は単一関数なので "family" は不正確、(b) 実装は TB まで扱うのに TB が抜けている。plan step1 は新 `formatBytes` に JSDoc を付けるとしているが、隣接する `formatMegabytes` 側の記述との整合まで触れていない。同ファイル内で「可変単位=`formatBytes` / 固定MB=`formatMegabytes`」の2関数構成にする狙い（ADR-001 Consequences）を JSDoc レベルでも一貫させたい。

- **[S-002]** AccountDeleteForm から削除するコメントの `#573` 設計根拠ポインタの扱いを明示する
  - 理由: 削除対象コメント（L51-53）は「humanization is a presentation concern **(#573)**」という設計根拠ポインタと「Mirrors admin helper / YAGNI で inline」という陳腐化情報が混在している。後者は集約により正しく陳腐化するが、前者（#573 由来の provenance）はプロジェクト規約上「残すべき参照」に該当する（リポジトリでは `#NNN`/ADR 参照を設計根拠ポインタとして保持する運用）。関数ごと削除するため参照が宙に浮くので、共有 `formatBytes` の JSDoc 側に `#573`（および出自 `#799`）の provenance を引き継ぐか、意図的に落とすかを plan step4 で一言明示しておくと、後続の comment-cleanup / レビューでの往復を防げる。

## 良い点

- 「3コピーが1文字一致 → 出力は自明に不変」という diff レベルの担保に加え、境界値テストで機械的にロックする二段構えが堅い。plan step5 の期待値を実測で裏取りした結果もすべて一致。
- ADR-001 が選択肢1/2/3 と別ポリシー2件の据え置きを、Issue のデフォルト方針「変わるなら別管理のまま」と結び付けて論理的に整理できている。オプション引数での肥大化を明確に退けた判断が良い。
- シグネチャを `number | null` 上位互換にし、AccountDeleteForm の `number` 呼び出しを部分型として型安全に吸収する設計は、CLAUDE.md「illegal state を型で表現」「境界で検証・中間は静的型を信頼」に沿う。緩くなる型の懸念を JSDoc + テストで補う旨まで risk 節に明記済み。
- U+2014 取り違えという実際に起きうる罠を先回りしてリスク化し、テストで U+2014 リテラル固定まで指定している。
