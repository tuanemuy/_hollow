# 実装計画 — Issue #805: refactor(common): 可変単位バイト整形ヘルパ（formatBytes）の重複を共有 util に集約

**Issue:** #805
**作成日:** 2026-07-10
**複雑度:** 中〜大規模

---

## 目的

可変単位（B/KB/MB/GB/TB を `Math.log` で自動選択）のバイト整形ロジックが admin/Dashboard・admin/Metrics・identity/AccountDeleteForm に同一コピーで3重に定義されている。これを #799 で新設した `app/components/common/byteSize.ts` に `formatBytes` として1本化し、既存の表示出力を1文字も変えずに重複を解消する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | `app/components/common/byteSize.ts` に可変単位 `formatBytes(value: number \| null): string` が1本だけ存在し、`formatMegabytes` とは別関数として共存している | Issue「やりたいこと」1点目 / スコープ外2点目 | 1 |
| AC-2 | admin/Dashboard・admin/Metrics・identity/AccountDeleteForm のローカル `formatBytes` 定義が削除され、共有版を import して使う | Issue「やりたいこと」1点目 | 2, 3, 4 |
| AC-3 | 上記3コンポーネントの表示出力（`—` / `0 B` / 各単位・桁）が集約前と1文字も変わらない。**検証手段: 各コピー元のローカル `formatBytes` ロジックと共有版が1文字一致であることを diff で確認する（バイト単位一致が「全入力で出力不変」の本質的根拠）。回帰テスト（AC-5）はこれを代表境界値で機械的に補強する位置づけ。** | Issue「見た目が変わらない」絶対制約 | 2, 3, 4, 5 |
| AC-4 | export/ExportJobDetail（MB 2桁）・ingestion/IngestionJobRow（KB 固定）は共有版に寄せると出力が変わるため現状維持とし、その判断が **ADR-001 に** 記録されている | Issue「やりたいこと」2点目 | 6（判断） |
| AC-5 | 共有 `formatBytes` の境界値（null, 0, B/KB/MB/GB/TB 各境界, `scaled>=100` の桁切替, `i===0` の桁, TB 打ち止め）を回帰テストでカバーする | Issue「テストで担保」 | 5 |

## スコープ

### 含まれないもの
- バリデーションロジックの統合（表示用フォーマッタの集約のみ）。
- `formatMegabytes`（固定 MB）と `formatBytes`（可変単位）の統合 — 用途・ポリシーが異なるため別関数として共存。
- export/ExportJobDetail（B→KB 1桁→MB 2桁）と ingestion/IngestionJobRow（固定 KB 1桁）の集約 — 桁数・単位ポリシーが異なり、共有版に寄せると出力が変わるため現状維持（AC-4 / ADR-001 参照）。

## 調査結果

- 関連ファイル:
  - `app/components/common/byteSize.ts` — #799 新設の共有 util。現在 `formatMegabytes(bytes: number)` のみ。JSDoc で「可変単位 `formatBytes` family とは別ポリシー」と明言済み。ここに `formatBytes` を追加する。
  - `app/components/admin/Dashboard/index.tsx` L43-53 — `formatBytes(value: number \| null)`。`null→"—"`、`0→"0 B"`、以降 `Math.log` 自動選択。呼び出し3箇所（totalStorage, storageR2Bytes, storageDurableObjectBytes）。
  - `app/components/admin/Metrics/index.tsx` L45-55 — Dashboard と**完全同一**の実装（`number \| null`）。呼び出し7箇所（limits 各種 + storage 系）。
  - `app/components/identity/AccountDeleteForm/index.tsx` L54-63 — 同一ロジックだがシグネチャ `(value: number)`・null 分岐なし。呼び出し1箇所（`impact.mediaTotalBytes`）。既存コメントで「admin metrics helper のミラー、YAGNI で inline」と明記。
  - `app/components/export/ExportJobDetail/index.tsx` L40-46 — B(整数)→KB(1桁)→MB(**2桁**) の入れ子分岐。別ポリシー。
  - `app/components/ingestion/IngestionJobRow.tsx` L182 — `(job.byteSize / 1024).toFixed(1)} KB` の固定 KB inline。別ポリシー。
  - `app/components/common/__tests__/byteSize.test.ts` — 既存の `formatMegabytes` テスト。「表示ラベルを verbatim にロックする」方針で、実呼び出し値の閾値をコメント付きで固定している。この方針を踏襲する。
- あるべきアーキテクチャ: これは純粋なフロントエンド表示用ユーティリティの集約。ドメイン/アプリ層には一切影響しない。CLAUDE.md の「Repeated 〜 を module-scoped に hoist」「共有ユーティリティは `app/components/common/` に集約（styles.ts, dateFormat.ts, relativeTime.ts 等の先例）」に沿い、`byteSize.ts` へ寄せるのが正。JSDoc は library-level に付ける（既存 `formatMegabytes` のスタイルに合わせる）。
- 既存実装の状態: 3コピーは「あるべき姿（共有 util）」から乖離。本 Issue で共有版へ寄せて解消する。`byteSize.ts` の `formatMegabytes` JSDoc は既に「variable-unit `formatBytes` family」の存在を前提に書かれており、`formatBytes` を同ファイルに置くのは設計意図どおり。
- 依存関係: 影響は上記5コンポーネントのみ。他に `formatBytes` の定義・利用はない（grep 済み）。`—` は U+2014（EM DASH, バイト列 `e2 80 94`）で統一されており、共有版でも同一文字を返す必要がある。

## 設計

### ドメインモデルへの影響
なし。表示用フォーマッタの集約であり、ドメイン/アプリ/アダプタ層には触れない。

### ユースケース / アプリケーションロジック
なし。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション
- `app/components/common/byteSize.ts` に可変単位 `formatBytes` を追加。シグネチャは3コピーの**上位互換**である `(value: number | null): string` を採用する（ADR-001）。
  - 実装は Dashboard/Metrics のコピーと完全に同一のロジック（`null→"—"`, `0→"0 B"`, `Math.log` 単位選択, `toFixed(scaled >= 100 || i === 0 ? 0 : 1)`）。
  - AccountDeleteForm は現状 `number` のみ渡すため、`number` を `number | null` 引数に渡す形になるが型安全であり、null 分岐に入らないため出力は不変。
- 3コンポーネントのローカル `formatBytes` を削除し、`import { formatBytes } from "@/components/common/byteSize"`（既存の import 記法・エイリアスに合わせる）へ置換。AccountDeleteForm では既存の説明コメントも削除する（共有化により YAGNI コメントは陳腐化）。
- export/ExportJobDetail・ingestion/IngestionJobRow は変更しない（ADR-001）。

## 実装ステップ

### 1. 共有 `formatBytes` を追加
- **対象ファイル:** `app/components/common/byteSize.ts`
- **変更内容:** `formatMegabytes` の下に可変単位 `formatBytes(value: number | null): string` を追加。ロジックは Dashboard/Metrics のコピーと1文字も違わないもの（`null→"—"`, `0→"0 B"`, `units = ["B","KB","MB","GB","TB"]`, `i = Math.min(units.length-1, Math.floor(Math.log(value)/Math.log(1024)))`, `scaled = value/1024**i`, `` `${scaled.toFixed(scaled >= 100 || i === 0 ? 0 : 1)} ${units[i]}` ``）。`—` は U+2014 を使う。library-level JSDoc を既存 `formatMegabytes` のスタイルで付け、「variable-unit で null→"—"、固定 MB の formatMegabytes とは別ポリシー」を明記。あわせて AccountDeleteForm から引き継ぐ設計根拠ポインタ（表示整形はプレゼンテーション層の関心事 = `#573`、出自 = `#799`）をこの JSDoc に載せる（ステップ4参照）。
  - **サブタスク（既存 JSDoc の整合修正）:** 隣接する既存 `formatMegabytes` の JSDoc 文言を、新 `formatBytes` と整合させる。具体的には (a) 「variable-unit `formatBytes` **family**」という表現を、集約後は単一関数になるため実態に合わせて修正し、(b) 単位列に **TB** が欠落している点を補って `B/KB/MB/GB/TB` の正確な単位列にする。相互参照（`formatBytes` を指すポインタ）も新関数の実体に合わせて正確化し、同ファイルが「可変単位=`formatBytes` / 固定MB=`formatMegabytes`」の2関数構成であることを JSDoc レベルでも一貫させる（ADR-001 Consequences の狙いと整合）。
- **理由:** 単一の正とするため。JSDoc で共存意図を残すのは既存規約。既存 JSDoc は `formatBytes` の存在を前提に書かれているので、実体追加と同時に文言を実態へ合わせる。

### 2. admin/Dashboard を共有版へ置換
- **対象ファイル:** `app/components/admin/Dashboard/index.tsx`
- **変更内容:** ローカル `formatBytes`（L43-53）を削除し、共有版を import。呼び出し3箇所はそのまま。
- **理由:** 重複解消（AC-2）。シグネチャ同一のため呼び出し側は無変更で出力不変。

### 3. admin/Metrics を共有版へ置換
- **対象ファイル:** `app/components/admin/Metrics/index.tsx`
- **変更内容:** ローカル `formatBytes`（L45-55）を削除し、共有版を import。呼び出し7箇所はそのまま。
- **理由:** 同上。

### 4. identity/AccountDeleteForm を共有版へ置換
- **対象ファイル:** `app/components/identity/AccountDeleteForm/index.tsx`
- **変更内容:** ローカル `formatBytes`（L54-63）と直前の説明コメント（L51-53）を削除し、共有版を import。呼び出し1箇所（`formatBytes(impact.mediaTotalBytes)`）は `number` を `number | null` 引数に渡す形になるが出力不変。
  - **削除コメントの設計根拠ポインタの扱い（明示）:** L51-53 のコメントには「Mirrors admin helper / YAGNI で inline」という陳腐化情報と、「humanization is a presentation concern（`#573`）」という設計根拠ポインタ（Issue/ADR 参照）が混在している。前者は共有化により正しく陳腐化するため破棄する。後者の `#573` provenance は「表示整形はプレゼンテーション層の関心事」という設計判断の根拠であり、共有 `formatBytes`（および出自 `#799`）へ意味が移る。したがって **`#573` の provenance は共有 `formatBytes` 側の JSDoc に引き継ぐ**（`#NNN`/ADR 参照は設計根拠ポインタとして保持するリポジトリ運用に従い、宙に浮かせない）。関数ごと消えることで参照が失われないよう、この引き継ぎをステップ1の JSDoc 追記に含める。
- **理由:** 重複解消。共有化に伴い「inline に留める（YAGNI）」旨のコメントは事実と矛盾するため除去。一方で `#573` 設計根拠ポインタは安易に消さず共有 util 側へ移す（意味が移るなら破棄可、というプロジェクト規約に沿った判断）。

### 5. 回帰テストを追加
- **対象ファイル:** `app/components/common/__tests__/byteSize.test.ts`
- **変更内容:** 既存 `formatMegabytes` describe に加えて `formatBytes` の describe を追加。既存の「出力ラベルを verbatim にロック」方針を踏襲し、以下の期待値を固定:
  - `null → "—"`（U+2014）
  - `0 → "0 B"`
  - B レンジ（`i===0`, 整数表示）: `512 → "512 B"`, `1023 → "1023 B"`
  - KB 境界: `1024 → "1.0 KB"`
  - KB で `scaled >= 100` の0桁切替: `100*1024 → "100 KB"`
  - MB 境界: `1024**2 → "1.0 MB"`、`scaled>=100`: `100*1024**2 → "100 MB"`
  - GB 境界: `1024**3 → "1.0 GB"`
  - TB 境界: `1024**4 → "1.0 TB"`
  - TB 打ち止め（`i` が `units.length-1` で clamp）: `1024**5 → "1024 TB"`
  - 小数丸め確認: `1536 (1.5*1024) → "1.5 KB"`
  - 実呼び出し閾値のロック（コメント付き）: admin limits の代表値・storage 系の想定値を1〜2件、集約前の出力に一致させる。
- **理由:** 「見た目が変わらない」絶対制約を機械的に担保（AC-3 / AC-5）。

### 6. export/ExportJobDetail・ingestion/IngestionJobRow の据え置き確認
- **対象ファイル:** （変更なし）`app/components/export/ExportJobDetail/index.tsx`, `app/components/ingestion/IngestionJobRow.tsx`
- **変更内容:** 変更しない。ADR-001 の判断（寄せると出力が変わる）を plan / adr に記録するのみ。
- **理由:** MB 2桁・固定 KB は共有 `formatBytes` と出力が異なる（後述）。Issue のデフォルト方針「変わるなら別管理のまま」に従う。

## 設計判断

- **ADR-001**: 共有 `formatBytes` のシグネチャを `(value: number | null)` の上位互換とし、AccountDeleteForm の `number` 呼び出しも型安全に吸収する。export/ExportJobDetail・ingestion/IngestionJobRow はポリシー相違で出力が変わるため据え置き（オプション引数での吸収も行わない）。詳細は `.issue/805/adr.md`。

## リスクと注意点

- `—` の文字違い（U+2014 EM DASH と U+2013 EN DASH やハイフンの取り違え）で表示が変わるリスク。共有版は U+2014 を使い、テストでも U+2014 リテラルで期待値を固定する。
- import パスのエイリアス（`@/components/...` か相対か）を各ファイルの既存 import に揃えないと lint/typecheck で落ちる。
- AccountDeleteForm の `number → number | null` 引数渡しは型的に問題ないが、レビューで「シグネチャが緩くなった」と見える。JSDoc とテストで意図を明示する。
- ExportJobDetail/IngestionJobRow を「ついでに」寄せると出力が変わり絶対制約に違反する。スコープを守る。

## テスト方針

- 単体（vitest）: ステップ5の `formatBytes` 境界値テストで、集約前の各呼び出し出力を verbatim にロック。`pnpm test:unit` で緑を確認。
- 静的検査: `pnpm typecheck && pnpm lint:fix && pnpm format`。3コンポーネントから未使用 import / 未使用関数が残らないこと。
- 差分の目視: 3コンポーネントのローカル `formatBytes` ロジックと共有版が1文字一致であることを diff で確認（コピー元と完全一致なら出力は自明に不変）。
- 手動確認（任意）: 管理ダッシュボードのストレージ表示・アカウント削除の影響サイズ表示が集約前と同一であること。

## レビュー履歴

### 1周目
両視点（要件カバレッジ・アーキテクチャ/リスク）とも **問題点ゼロ**。改善提案4件をすべて反映して終了。

**取り込んだ改善提案**:
- **coverage [S-001]**: AC-3 に検証手段（各コピー元ローカル `formatBytes` と共有版の1文字一致 diff が「全入力で出力不変」の本質的根拠であり、回帰テスト AC-5 はその境界値補強という位置づけ）を受け入れ基準セル内に明記し、基準の自己完結性を上げた。
- **coverage [S-002]**: AC-4 の「判断が記録されている」に記録先 **ADR-001** への参照を追記し、受け入れ確認をワンステップ化した。
- **arch-risk [S-001]**: 実装ステップ1に「既存 `formatMegabytes` の JSDoc を新 `formatBytes` と整合させる」サブタスクを追加。TB を含む正確な単位列（B/KB/MB/GB/TB）への修正と、"family" 表現・相互参照の正確化を明記した（実際の JSDoc 修正は実装フェーズで実施）。
- **arch-risk [S-002]**: 実装ステップ4に、AccountDeleteForm から削除するコメント（L51-53）の扱いを明示。陳腐化する「Mirrors admin helper / YAGNI」情報は破棄、設計根拠ポインタ `#573`（表示整形はプレゼンテーション層の関心事）は意味が共有 util 側へ移るため共有 `formatBytes` の JSDoc へ引き継ぐ（`#NNN`/ADR 参照は宙に浮かせないというリポジトリ運用に沿った判断）と記載。ステップ1の JSDoc 記述にも引き継ぎ（`#573` / 出自 `#799`）を反映した。

**見送った提案とその理由**:
- なし（4件すべて反映）。
