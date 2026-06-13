# Adversarial Review — Issue #670 「no-repro（再マウント/編集内容喪失は再現せず）」結論の反証検証

**レビュー日:** 2026-06-13
**対象:** docs-only PR（コミット `d0d5017d`）。Step 0 実証で #670 を no-repro としてクローズ提案。
**スタンス:** 結論を積極的に反証する。反証できなければ妥当と判定。デフォルトは懐疑。

---

## 結論

**結論妥当性: 妥当（反証できず）**

「invalidate 起因の再マウントで編集内容を失う」という #670 の前提は、コードを精査した結果どのルートでも成立する経路が見当たらず、Step 0 の実測結論（reconcile であって remount ではない、value 保持）はコード構造と整合する。重大な穴（P 級）は発見できなかった。フォーカス喪失を別 Issue (#680) に分離する判断にも論理的瑕疵は無い（後述 N-002）。

以下、4観点それぞれについて反証を試みた記録。

---

## 観点1: 実測手法の妥当性（テスト invalidate と本番 routerInvalidate の等価性）

### 検証

`routerInvalidate.ts` を精査。本番フィルタは次の3条件 AND:

```
match.routeId !== "/_app"
  && !["/_app/notes/$noteId/edit", "/_app/notes/new"].includes(match.routeId)
  && (filter?.(match) ?? true)
```

Step 0 の発火は `window.__TSR_ROUTER__.invalidate({ filter: m => m.routeId !== '/_app' })`（タスク提示）または step0-results.md の記述では「`_app`・エディタールートを除外」。**両者には差分がある**（テスト版はエディタールート除外を欠く可能性）。

### 反証の試み → 失敗（差分は対象3ルートに無影響）

対象3ルートは `/_app/views/`, `/admin/prompts`, `/_app/settings/prompts`。エディタールート除外条件（`/_app/notes/...`）は**これら3ルートのいずれにもマッチしない**ため、除外する/しないで3ルートの invalidate 対象判定は一切変わらない。`/_app` 除外は両版で共通。よってテストフィルタと本番フィルタは **対象3ルートに対して恒等的に同一の invalidate を発火する**。フィルタ差は結論に影響しない。

- 補足: step0-results.md は「raw invalidate（`_app` 含む）でも同一結果」も記録しており、フィルタの広狭に対する頑健性が二重に確認されている。
- 軽微: step0-results.md L11 の「同一フィルタ（`_app` とエディタールートを除外）を忠実に再現」という文言は、タスク提示のテストコード（`_app` のみ除外）と厳密には一致しない。**記述の正確性として N-001 を指摘**（結論には無影響）。

---

## 観点2: テスト網羅性（未実測ルートへの外挿の妥当性）

views inline rename と admin prompts のみ実機観測。個人 prompts / ViewFormDialog(編集) / 新規ダイアログは未実測。「同一パターンだから安全」の外挿をコードで検証した。

### 各コンポーネントの seed 構造をコードで確認

| 対象 | seed | 再 seed effect | key | open/可視性の所有 |
|---|---|---|---|---|
| `PromptRow`（個人, identity/PromptsForm L139） | `useState(override?.text ?? "")` | **無し** | `key={purpose}`（L116, 安定） | n/a |
| `PromptCard`（admin L108-111） | `useState(current.isOverridden ? current.text : "")` ほか | **無し** | `key={descriptor.purpose}`（L296, 安定） | n/a |
| `SavedViewRow` rename（L240-241） | `useState(view.name)` / `useState(false)` | **無し** | 行は `key={view.id}`（L197, 安定） | row 内 `useState` |
| `ViewFormDialog` 編集（L95-123） | 約12個すべて `editView?.* ?? default` | **無し**（`useEffect` 自体が存在しない） | n/a（行に内包） | `editDialogOpen` を `SavedViewRow` が所有（L243, L572） |
| `NewViewButton` 新規（NewViewButton.tsx） | 空文字 seed（`mode="create"`, `editView===null`） | **無し** | n/a | `open` を `NewViewButton` が所有 |

### 反証の試み → 失敗（外挿は妥当。むしろ未実測ルートはより安全側）

- 全コンポーネントが lazy/eager 問わず `useState` の初期化引数を mount 後に無視する seed-once 等価構造で、**`useEffect` による再 seed が一つも存在しない**。reconcile（props 更新）では `useState` 値は不変＝value 保持。これは実測2ルートと同一機序で、外挿は構造的に裏付けられる。
- key はすべて安定識別子（`purpose` / `descriptor.purpose` / `view.id`）で、loader が返す可変値に由来する key は皆無（`grep key=` で全件確認）。invalidate で key が変わって remount する経路は無い。
- 個人 prompts は本番 `staleTime: Infinity`（settings/prompts L19 `DEV ? 0 : Infinity`）。invalidate されても cache fresh で loader 再実行されない公算が高く、再レンダーすら起きない＝**さらに安全側**。step0-results.md / testing.md はこの非対称性を区別して記録するよう求めており、扱いは適切。
- ViewFormDialog 編集の `open` と SavedViewRow の `editDialogOpen`・`isEditing` は **行（`key={view.id}` で安定）内の `useState` が所有**。行が reconcile される限り可視状態も保持される。「invalidate で勝手にダイアログが閉じる/開く」退行の経路も無い。
- 新規ダイアログは loader seed を一切持たない（ADR-002 の整理どおり）。#670 の主眼（loader=既存値の喪失）には定義上該当しない。

→ 「未実測だが同一パターン」の外挿に穴は見つからない。むしろ未実測の3対象は実測2対象より構造的に安全（再 seed effect 皆無・本番 Infinity・loader seed 無し）。

---

## 観点3: 再マウントが起きる隠れ条件（Suspense / key / staleTime / optimistic 並べ替え）

最も疑わしい経路として、3ページすべてが `<Suspense>` 境界を持つ点を重点的に検証した。

### Suspense 再 fallback による unmount の可能性

- `SavedViewsList/Page.tsx`: `<Suspense fallback={ListPageSkeleton}>` 配下に `ViewsSection`、別境界に `NewViewButtonSection`。
- `admin/PromptsForm/Page.tsx`: `<Suspense fallback={AdminTableSkeleton}>` 配下に `PromptsSection`。
- `identity/PromptsForm/Page.tsx`: `<Suspense fallback={FormSkeleton}>` 配下に `PromptsSection`。

**反証仮説:** invalidate → loader 再実行中に Suspense が fallback に落ち、client subtree（フォーム）が unmount → 再 attach 時に remount し編集内容を失う。

### 反証の試み → 失敗（pending fallback は発生しない構成）

- `router.tsx` は `defaultPendingComponent` も `defaultPendingMs` も設定せず、各ルート定義（views/admin/settings の `Route`）にも `pendingComponent` は無い（`grep` 全件確認）。
- TanStack Router の再 validation（既にデータが存在するルートの `invalidate`）は、デフォルトで**旧 `useLoaderData()` を表示したままバックグラウンドで loader を再実行**し、完了後に RSC ペイロードを差し替える。pendingComponent 未設定のため pending UI は描画されない。
- 差し替え時、新ペイロード内の `<Suspense>` は子データが既に解決済み（loader 完了後にコミット）なので **fallback に落ちない**。React は同 type・同位置の `<Suspense>` とその子（`SavedViewsList` 等の client component）を reconcile する。mount プローブが "1" のままだった実測はこの挙動と一致。
- → Suspense 経由の隠れ remount 経路は構成上塞がれている。これが no-repro 結論の急所だったが、反証できなかった。

### その他の隠れ経路

- **動的 key**: 観点2のとおり loader 由来の可変 key は皆無。無し。
- **optimistic 由来の並べ替え**: `SavedViewsList` の `useOptimistic`（L133 `reduceViews`）は add/remove のみで、各行は `key={view.id}`。並べ替えは起きず、既存行の identity は保たれる。rename 中の行は optimistic name 変更でも key 不変＝remount しない。穴無し。
- **loader データ shape 変化**: 各 loader は固定 shape（`views/directories/tags`、`prompts/promptDefaults`、`defaults/overrides`）を返す。invalidate で要素 type が変わる分岐は無い。
- **`ViewsRoute` / `AdminPromptsPage` / `PromptsRoute` の本体**: いずれも `return Route.useLoaderData()` のみ。RSC ペイロード（React 要素）をそのまま返すだけで、ラップ要素・条件分岐・key 付与が無く、remount を誘発する余地が無い。

---

## 観点4: 結論の論理（防御機構不要・フォーカスの別 Issue 分離）

### 「value 保持・再マウント無し」→「防御機構不要」

- plan/ADR-001 の防御機構 (a)/(b)/(c) はいずれも「**再マウントから state を守る**」ための仕組み。再マウントが起きず value も保持されるなら、守るべき対象が存在しない。機構導入は plan 自身が「最大リスク」とした「Step 0 を飛ばした過剰設計」に該当する。論理は一貫。
- ADR-001 が ADR-003 に supersede され、plan 冒頭バナーと step0-results.md と adr.md ADR-003 の3点で結論が一致している（記述整合は良好）。

### AC への対応

- AC-1（再マウント実証記録）: 充足。
- AC-2/3/4 の「入力内容保持」: 全ルートで value 保持を実証＝充足。
- AC-5（保存→最新値再表示）: コード変更なし＝既存挙動維持。各フォームは保存後 `routerInvalidate` → reconcile で最新 props 反映（`editing=false` 相当の seed 追従は seed-once + reconcile で成立）。退行無し。
- **AC-2/3/4 の「フォーカス保持」: 未充足のまま #670 をクローズ提案している点が唯一の論点**（下記 N-002）。

### フォーカス喪失の別 Issue 分離 — 反証の試み → 部分的懸念（N-002, ただし P 級ではない）

- 受け入れ条件の文言上、AC-2/3/4 は「入力内容**とフォーカス**が失われない」を含む（plan AC 表）。フォーカスは実測で**失われる**（activeElement→BODY）。したがって厳密には #670 の AC は完全充足ではない。
- ただし:
  - フォーカス喪失の真因は再マウント/state 喪失ではなく、RSC ペイロードコミット時の DOM subtree detach/再 attach（推定）であり、plan/ADR が用意した (a)/(b)/(c) では**原理的に直せない**（守る state も防ぐ remount も無い）。同一 Issue 内で扱っても解けない。
  - 入力内容は保持されるため即時の致命性は低い（再クリックで継続可能）。
  - **ユーザー判断で #670 のスコープ外として別 Issue 化**する旨が ADR-003 Decision 3 に明記。スコープ判断はレビュアーが覆す類のものではない。
- → 別 Issue 分離は論理的に正当。ただし #670 を「no-repro」と表現すると「AC が全て満たされた」かのように読めるため、**クローズ理由は「前提（再マウント起因の編集内容喪失）が no-repro。フォーカス喪失は別機序で #680 に移管」と明示すべき**（N-002）。adr.md / step0-results.md は実際にこの区別を明記しており、PR 説明文・Issue クローズコメントでも同じ精度を保てば問題ない。

---

## 指摘一覧

P 級（結論を覆す重大な穴）: **0 件**

N 級（記述の正確性・運用上の注意。結論は覆らない）:

- **N-001（記述）**: step0-results.md L11 は「`_app` とエディタールートを除外して忠実に再現」とするが、タスク提示のテストコードは `{filter: m => m.routeId !== '/_app'}`（エディタールート除外なし）。対象3ルートはエディタールートに該当しないため invalidate 判定は同一＝結論に無影響だが、文言は実際の発火フィルタと厳密一致させるか、「対象3ルートに対しては本番フィルタと恒等」と注記するのが正確。
- **N-002（運用）**: AC-2/3/4 はフォーカス保持を含むため、#670 を単に「no-repro」とクローズすると AC 全充足と誤読されうる。クローズ理由を「再マウント起因の編集内容喪失は no-repro／フォーカス喪失は別機序のため #680 へ分離」と明示すること（adr.md ADR-003・step0-results.md は既にこの区別を記載済みなので、PR/クローズコメントに反映すれば足りる）。

---

## 反証の総括

4観点すべてで反証を試みたが、結論（再マウント・編集内容喪失は再現せず＝防御機構不要）を覆す経路を発見できなかった。特に最有力の反証候補だった **Suspense 境界経由の unmount は、pendingComponent 未設定 + 再 validation はバックグラウンド loader 再実行という TanStack Router の挙動により構成上塞がれている**。seed 構造・key・再 seed effect の全件確認でも remount/value 喪失の経路は無く、未実測3ルートへの外挿も構造的に妥当（むしろより安全側）。

**判定: 反証できず＝結論は妥当。** docs-only でのクローズ提案を支持する。N-001/N-002 はクローズコメント・PR 説明文の文言精度に関する軽微な注記であり、コード/結論の修正は不要。
