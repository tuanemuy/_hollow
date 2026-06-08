# 実装計画 — Issue #545: impl: 領域6「管理（admin）」(P40〜P47) のモック実装追従（#514 子）

**Issue:** #545
**親:** #514 / **上流:** #510（モック確定済み・CLOSED）/ #520（P47 モック新設・追従元）
**作成日:** 2026-06-08
**複雑度:** 中規模（frontend 完結。backend 拡張は一切行わない）

---

## 概要

#510 で確定した領域6「管理（admin）」のモック（P40〜P47）に既存 admin 画面を追従させる。8 モックと現実装を 1 枚ずつ突き合わせた結果、**モックに描かれていて実装に無い実体ある差分の大半は新規 backend（時系列メトリクス provider・アクティビティログ subsystem 等）の新設を伴う**ため、frontend 完結スコープ（兄弟 #540〜544 の鉄則）を超える。本 Issue で frontend だけで完結する追従は次に集約される:

1. **P47 限度テーブルの狭幅レスポンシブ**（`overflow-x-auto` 素テーブル → 狭幅で `data-label` による行積層カード化）— 本 Issue の本命。
2. **P45 / P46 テーブルの `min-width` 整合**（狭幅でセルを潰さず横スクロール）。
3. **P40 / P47 の metric-card・section-desc のトークン/文言整合**（過剰変更しない）。
4. **P41〜P44 フォームの文言・トークン突き合わせ**（乖離があれば軽微追従、無ければ no-op）。

チャート・最近のアクティビティ・履歴・一括操作・ソートはすべて backend 新設前提のため Phase 4 で別 Issue 化する。

### 最重要原則（兄弟 #540〜544 で確立）

**虚偽のヘルプ・プレビュー・数値を出さない。** 表示する制限値・URL・文言・チャート数値はすべて backend（domain / usecase / DTO）の実挙動・実データと一致させる。モックのプレースホルダ値（ダミー数値・ダミードメイン）はそのまま写さない。一致を確認できない表示は出さず、その判断を本 plan に明記する。

---

## スコープ

### 含まれるもの（本 Issue で実装 — frontend 完結）

- **P47 限度テーブルの狭幅行積層**（`Metrics/index.tsx` `LimitsCard`）。モック P47 が `@media (max-width: 767px)` で `thead` を隠し `data-label` の `::before` でラベルを出す積層 CSS を持つ（mock 471-493 行）。実装は `overflow-x-auto` 素テーブルでカード化しない（mock 550-556 行コメントが追従差分として明示）。
- **P45 / P46 テーブルの `min-width` 付与**（`UsersTable/index.tsx`・`Jobs/index.tsx`）。モックは `.table { min-width: 880px }`（P45）/ `920px`（P46）+ 横スクロール。実装は `overflow-x-auto` のみで `min-width` 未指定 → 狭幅でセルが潰れる。
- **P40 / P47 metric-card・status-banner・section-desc のトークン/文言整合**。構造は一致済み。残存リテラル px を標準スケール/トークンへ寄せられるもののみ整合（過剰変更しない）。
- **P41〜P44 の section-title / section-desc 文言・寸法トークンの突き合わせ**。乖離が frontend 完結かつ軽微（文言・トークン）なら追従、新規 backend を要する差分が見つかれば即 Phase 4 へ。一致なら no-op。

### 含まれないもの（Phase 4 で別 Issue 化 — 新規 backend が必要）

**P40 ダッシュボード情報設計（チャート / アクティビティ / 履歴 / プレビュー）**

- **24h チャート（アップロード数 / LLM 呼び出しの時系列 sparkline）** — 時系列メトリクス provider（hourly bucket 集計）が必要。`UsageMetricsProvider` は scalar snapshot のみ（`uploadsToday` / `llmCallsToday` は当日累計の単一値、時系列フィールドは無い。`usageMetricsProvider.ts:20-33` で確認）。
- **「最近のアクティビティ」フィード（新規ユーザー / 大量UL / ジョブ失敗 / 設定変更 / バックアップ）** — アクティビティ / 監査ログ subsystem（イベント記録 + 取得 usecase + DTO + adapter）が必要。`app/core` 全体に `activityLog` / `auditLog` / `recentActivity` 等の provider/repository が皆無（grep で確認）。
- **「期間を変更」「すべて見る」導線** — 上記チャート / アクティビティに従属。

> P40 のチャート・アクティビティを frontend で描くと **ダミー数値の虚偽表示**（鉄則違反）になるため描かない。現状の「管理メニュー」案内セクション（モックに無いが honest な filler）は虚偽でないため維持する。

**P45 / P46 一覧の一括操作 / ソート**

- **一括操作（select-all チェックボックス + バルクバー）** — 確定モック P45/P46 自体に一括操作 UI が無い（Issue 本文の追従ポイント列挙はモック確定前の文言）。導入には bulk usecase の新設も要る。
- **列ソート（aria-sort 等）** — 確定モック P45/P46 に操作可能な列ソート UI（aria-sort 付き）が無い。`loadJobsSnapshot` は `findRecent`（固定の最新 N 件順）を直接呼び、ユーザー操作可能なソート引数を持たない（`getIngestionJobs` に `order` 引数はあるが「全件の更新日時昇降順」で、モックが要求する列ソート UI とは別物）。`loadAdminUsers` も同様にソート引数を持たない。

**admin シェルのヘッダー検索・通知（P40〜P47 共通）**

- index.md §2.4 が SSOT 上「維持」と宣言しつつ「実装追従は別 Issue」と明記。#500 横断 #7 が去就の最終判断を所有 → 本 Issue 対象外。

### 既存 Issue でカバー（本 Issue では触れない）

- **#520**: P47 metrics モック新設（完了済 → 追従元）。
- **#471**: `/admin/users` ローダーエラー（loader/RSC バグ修正）。本 Issue は UI 追従のみで loader に触れない。
- **#268**: admin Jobs の `IngestionJob` Wire 境界（`errorReason` 漏出遮断）。`Jobs/index.tsx` の errorReason 表示ロジックは変更しない。
- **#160**: `index_jobs` DLQ 行（attempts≥3）可視化・再駆動 UI。
- **#58**: P46 自動パージ失敗アラート（履歴永続化）。`CleanupSection` の「実行履歴未対応」文言は #58 確定まで維持（実挙動一致）。

---

## 調査結果

### 関連ファイル（モック ⇄ 実装 ⇄ ルート ⇄ backend）

| モック (SSOT) | コンポーネント実装 | ルート | backend データ源 |
|---|---|---|---|
| P40-admin-dashboard | `app/components/admin/Dashboard/{index,action}.tsx` | `app/routes/admin/index.tsx` | `getUsageMetrics`（scalar snapshot のみ） |
| P41-admin-llm | `app/components/admin/LLMSettingsForm/*` | `app/routes/admin/llm.tsx` | `loadInstanceSettings` 系 |
| P42-admin-prompts | `app/components/admin/PromptsForm/*` | `app/routes/admin/prompts.tsx` | プロンプト設定 usecase |
| P43-admin-tokens | `app/components/admin/DesignTokensForm/*` | `app/routes/admin/design.tsx` | デザイントークン設定 |
| P44-admin-registration | `app/components/admin/RegistrationForm/*` | `app/routes/admin/registration.tsx` | RegistrationPolicy |
| P45-admin-users | `app/components/admin/UsersTable/{index,Page,action}.tsx` | `app/routes/admin/users.tsx` | `loadAdminUsers`（UserDTO[]） |
| P46-admin-jobs | `app/components/admin/Jobs/{index,Page,action}.tsx` | `app/routes/admin/jobs.tsx` | `loadJobsSnapshot`（Ingestion/Export DTO） |
| P47-admin-metrics | `app/components/admin/Metrics/index.tsx` | `app/routes/admin/metrics.tsx` | `getUsageMetrics` + `loadInstanceSettings` |

共通シェル: `app/routes/admin/route.tsx`（admin ヘッダー + 管理ナビ）。共有スタイル: `app/components/common/styles.ts`。トークン: `app/styles/tokens.css`（SSOT）／`spec/design/tokens.md`（mirror）。

### あるべきアーキテクチャ（CLAUDE.md / index.md / tokens.md）

- **Utility-first only**。新規手書き CSS / `@apply` は禁止。寸法・色は `tokens.css` → Tailwind utility 経由、リテラル px の新規持ち込みを避ける。
- 状態は `data-*` 属性 + `data-[name]:` variant で表現。
- index.md §2.4: admin は専用シェル。ヘッダー検索・通知の実装追従は別 Issue。P40=概況／P47=詳細の粒度分担。
- index.md §2.5: admin 一覧はテーブル基調・密度優先。
- index.md §3 / §7.1: admin はデスクトップ密度優先で 24px 床を許容。

### 既存実装の状態（P40〜P47ごと）

- **P40 ダッシュボード**: status banner・4 metric-card（実値 nullable + "取得失敗"）は**一致**。モックの 24h チャート・最近のアクティビティは実装に無く、その位置に「管理メニュー」案内セクション（honest filler）を置く。
- **P41 LLM / P42 プロンプト / P43 トークン / P44 登録制御**: 既存フォームは充実実装。Issue 本文の追従ポイントにフォーム個別項目は挙がらない → 突き合わせ主体。
- **P45 ユーザー**: page-title・subtitle・フィルタ（検索＋状態のみ。mock 111 行コメントと一致）・行アクションは**一致**。一括操作・ソート列はモック・実装ともに無し（一致）。差分: `min-width` 未指定。
- **P46 ジョブ監視**: 6 セクション・列構成・section-desc がほぼ一致。subtitle は実装が動的 `最新 {N} 件`（実値が正）。状態チップ・自動リフレッシュ・タブ・失敗展開行はモックコメントが「未実装＝実装が正」と明記。差分: `min-width` 未指定。
- **P47 利用状況**: metric-card・アラート条件描画・上限テーブル・登録ポリシーは構造一致。mock 550-556 行コメントが追従差分を 2 点明示: (1) ヘッダー検索・通知（→ §2.4 で別 Issue）、(2) 限度テーブルが狭幅で行積層すべきだが実装 `LimitsCard` は `overflow-x-auto` でカード化しない。

### backend 実値・実データの確認結果（モックのプレースホルダと差異 → 実値を採用）

| 項目 | モック表示 | backend 実挙動（採用値） | 根拠 |
|---|---|---|---|
| P40/P47 metric-card 数値 | ダミー固定値 | nullable scalar（取得不能時 `null`→"取得失敗"/"—"） | `getUsageMetrics.ts`, `usageMetricsProvider.ts:20-33`（既に実値表示） |
| P40 24h チャート（時系列 sparkline） | SVG path（固定） | **時系列データは backend に存在しない**（snapshot は scalar のみ） | `usageMetricsProvider.ts` に hourly/timeseries フィールド無し（grep 確認） |
| P40 最近のアクティビティ | ダミー6行 | **アクティビティ/監査ログ subsystem が存在しない** | `app/core` に該当 provider/repository 不在（grep 確認） |
| P46 ジョブ subtitle | 固定「最新 24 件」 | 動的 `最新 {N} 件`（実 DTO 件数） | `Jobs/index.tsx`（既に動的） |
| P47 限度テーブル値 | ダミー | `InstanceSettingsDTO.limits` 実値 | `Metrics/index.tsx:55-86`（既に実値 bind 済み） |

### 依存関係

- backend 変更: 本 Issue の確定スコープは**不要**。
- 既存 Issue 境界は「既存 Issue でカバー」節を参照（#520/#471/#268/#160/#58）。

---

## 実装ステップ

> 全ステップ frontend 完結・backend 非依存。寸法・色はトークン経由。触る箇所のみ最小変更（スコープ越えの共通化リファクタはしない）。

### 1. P47 限度テーブルの狭幅行積層（本命）

- **対象ファイル:** `app/components/admin/Metrics/index.tsx`（`LimitsCard`）
- **採用方式:** モック P47（471-493 行）は `thead { display:none }` + `td::before { content: attr(data-label) }` でラベルを出す積層 CSS だが、**実装では `data-label` + `::before` 方式は採らず、ラベルを実 DOM 要素として持つ**（ADR-004）。理由は (1) Tailwind v4 の `content-[attr(data-label)]` が生成 CSS で機能するか不確実（リポジトリに前例ゼロ）、(2) `::before` content はスクリーンリーダーで読まれず、`thead` 非表示と合わさると SR ユーザーに列ラベルが届かない（index.md §8 の a11y 契約に反する）。実 DOM ラベルなら両問題が原理的に解消し、虚偽表示にもならない。
- **変更内容:** `md` 未満（mock `max-width: 767px` = Tailwind `max-md:`）で:
  - `<thead>` を `max-md:hidden`
  - `<table>` / `<tbody>` / `<tr>` / `<td>` を `max-md:block w-full`
  - 各 `<tr>` を狭幅でカード化（`max-md:border max-md:border-hairline max-md:rounded-lg max-md:mb-3 max-md:p-3`）
  - 各 `<td>` 内にラベル `<span>`（"項目" / "値"）を実 DOM 要素として描画し `md:hidden`（広幅では非表示、狭幅でのみ表示）。色・サイズはモック準拠（`text-ink-tertiary` / `text-xs`、幅はモックの `132px` 相当をラベル span に当てるか inline-block で寄せる）
  - 値セルは積層時 `max-md:text-left`、`md` 以上は従来どおり右寄せ `font-mono`
  - **`overflow-x-auto` ラッパの扱い:** P47 限度表は 2 列・短文で `md` 以上でも横スクロール不要（モックも min-width 指定なし）。積層時にラッパが block 化セルへ干渉しないよう、`overflow-x-auto` は削除 or 無害化する（着手時に確認。P45/P46 の min-width + 横スクロール維持とは扱いが異なる）。
- **理由:** mock 550-556 行コメントが追従差分として明示。index.md §2.5 + モバイル方針（テーブルのカード化）に整合。

### 2. P45 / P46 テーブルの `min-width` 付与

- **対象ファイル:** `app/components/admin/UsersTable/index.tsx`・`app/components/admin/Jobs/index.tsx`
- **変更内容:** `<table>` に `min-w-[...]` を付与（P45=880px / P46=920px 相当）。既存の `overflow-x-auto` ラッパと組み合わせ、狭幅でセルを潰さず横スクロール。
- **理由:** 現状 `overflow-x-auto` だけだと狭幅でセルが潰れる。モックは min-width + スクロールで密度を保つ。
- **注意:** **P45/P46 は積層しない**（モックに `data-label` 積層 CSS が無い）。P47 限度テーブルだけ積層。両者を取り違えない。モック固定 px（880/920）は SSOT が明示する構造寸法であり、Tailwind 任意値 or 近傍コンテナトークンで当てる（着手時に判断。「リテラル px 持ち込み回避」は偶発的な任意値散布の抑止が趣旨で、モック明示の構造寸法は対象外と解釈）。

### 3. P40 / P47 metric-card・section-desc のトークン/文言整合

- **対象ファイル:** `app/components/admin/Dashboard/index.tsx`・`app/components/admin/Metrics/index.tsx`
- **変更内容:** 構造は一致済み。**線引き:** モックの CSS と px が一致している箇所は意図的指定として維持し（例 `Metrics/index.tsx` の `px-[5px] py-[1px]` 等はモック `padding: 1px 5px` の写し）、モックに対応宣言が無い／モックとずれているリテラル px のみ整合対象。section-desc 文言がモックと乖離していれば軽微追従。ステータスドットの `shadow-[...]` 等モック準拠の意図的指定は維持。**実質 no-op に近い可能性が高い。**
- **理由:** トークン経由・文言整合（Issue「デザイントークン経由で寸法・色を当てる」）。
- **注意:** **チャート / アクティビティセクションは追加しない**（backend データ源なし → 虚偽表示。Phase 4）。「管理メニュー」filler は維持。

### 4. P41〜P44 フォームの文言・トークン突き合わせ

- **対象ファイル:** `LLMSettingsForm/*`・`PromptsForm/*`・`DesignTokensForm/*`・`RegistrationForm/*`
- **変更内容:** section-title / section-desc 文言・寸法トークンの乖離確認。frontend 完結かつ軽微な乖離のみ追従。新規 backend を要する差分（プロンプトプレビュー等）が見つかれば即 Phase 4 へ。一致なら no-op。
- **理由:** Issue 本文の追従ポイントにフォーム個別項目は含まれず充実実装済み。過剰な再設計を避ける。

### 5. テスト整合

- 変更に関わる既存テスト（`app/components/admin/__tests__/schema.test.ts` 等）の回帰確認。`LimitsCard` 積層・テーブル min-width は視覚 + a11y を手動確認。必要なら軽量レンダリングテストを追加検討。

---

## 設計判断

詳細は adr.md を参照。要点:

- **P40 のチャート/アクティビティを「描かない」** — backend に時系列・活動ログのデータ源が一切無く、描けば虚偽数値表示になるため（虚偽表示禁止の鉄則）。兄弟 #543/#544 と同じ切り分け基準。
- **P45/P46 は積層せず横スクロール、P47 だけ積層** — モック CSS の実機差（P45/P46 は min-width + scroll、P47 限度表のみ `data-label` 積層）を逐語確認した結果に従う。画面最適を優先（index.md §2.5）。
- **モック固定 px（min-width: 880/920）の扱い** — モックが SSOT として明示する構造寸法は「リテラル px 持ち込み回避」の対象外と解釈。

## リスクと注意点

- **#471 が未修正だと P45 の手動検証が不能** — `/admin/users` がローダーエラーで描画されない既知事象。P45 のブラウザ突合は #471 解消後 or seed/loader を回避できる範囲で行う。className 検証は実機なしでも可能。
- **テーブル積層（P47）の a11y** — `data-label` の `::before` content は SR で読まれない。積層時の列見出し可読性を着手時に確認。
- **共有テーブルクラスのスコープ** — `Jobs` の `TABLE_CLASS`・`UsersTable` の table className・`Metrics` の table は各ローカル定義。3 箇所の共通化リファクタは本 Issue のスコープを越える → 触る箇所のみ最小変更。
- 各変更後に `pnpm typecheck && pnpm lint:fix && pnpm format`（CLAUDE.md）。

## テスト方針

- **静的検証:** `pnpm typecheck && pnpm lint:fix && pnpm format`。
- **ユニット:** `pnpm test:unit`（既存 admin テストの回帰）。
- **ブラウザ手動/自動（manual-test スキル / `pnpm dev`）:** admin セッションで `/admin`, `/admin/metrics`, `/admin/users`, `/admin/jobs` を開きモックと突合。
  - P47: 限度テーブルが `md` 未満で行積層、`md` 以上で従来テーブル。
  - P45/P46: 狭幅で `min-width` により横スクロールし、セルが潰れない。
  - P40: チャート/アクティビティを追加していないこと（虚偽数値が出ていない）、metric-card が実値/取得失敗を出すこと。
  - **#471 未修正時は P45 が描画不能な可能性**を織り込む。
- **レスポンシブ:** `base` / `md` / `lg` で P47 積層↔テーブル切替、P45/P46 横スクロールを確認。

---

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスク 並列）

**要件カバレッジ視点**: 問題点ゼロ。スコープ判断（frontend完結に絞りチャート/アクティビティ/一括操作/列ソートをPhase4送り）が一次情報（モックCSS行番号・backend grep）で全件裏付け確認された。

**アーキ・リスク視点で指摘 → 反映した修正**:
- **[P-001対応]** P47 積層ラベルを `before:content-[attr(data-label)]`（Tailwind v4 で実現性不確実）から**実 DOM 要素 `<span className="md:hidden">` 方式**へ変更（ステップ1 / ADR-004 新設）。
- **[P-002対応]** 同上。実 DOM ラベルにより `thead` 非表示時も SR に列ラベルが届き、a11y 懸念（index.md §8）を原理的に解消。

**取り込んだ改善提案**:
- **[S-001/アーキ]** ADR-003 に「880/920 は列構成由来の局所値でトークン化の必然性は低い」を追記。
- **[S-002/アーキ]** ステップ3 に px 整合の線引き（モック一致 px は維持、対応宣言なし/ずれのみ整合。実質 no-op に近い）を明記。
- **[S-003/アーキ]** ステップ1 に P47 `overflow-x-auto` ラッパの扱い（2列短文で横スクロール不要 → 削除/無害化）を明記。
- **[S-001/要件]** 「列ソート」スコープ外節を `loadJobsSnapshot`=`findRecent` 固定順・`order` 引数との違いを含めて精緻化。

**収束判断**: 要件視点は問題点ゼロ。アーキ視点の P-001/P-002 は同一の実 DOM ラベル方式で確定的に解消し、新たな設計リスクを生まないため、本周で収束とする（2周目は実施せず）。S 系は全て取り込み済み。
