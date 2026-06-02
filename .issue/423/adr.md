# ADR — Issue #423: 楽観的UI更新の残スコープ

## ADR-001: 複製の楽観"追加"を実施し、server fn の戻り値契約を `{ view }` に変更する

### Status
Proposed

### Context
#414 ADR-002 は複製・アップロードの楽観"追加"を「新項目の id・既定名・brokenConditions を client で合成できず、baseline 収束時にちらつき / key 衝突するリスク」を理由に見送った。本 Issue 起票時もこの前提を引き継いでいた。

しかし実コードを精査すると、`duplicateSavedView` usecase は **最初から `{ view: SavedViewDTO }` を返している**（server 採番 id、`buildCopyName` で確定したコピー名、`SavedViewService.detectBrokenConditions` で検出済みの brokenConditions すべて込み）。捨てているのは presentation 層の `duplicateSavedViewFn` server fn が `return { ok: true }` で値を握りつぶしている 1 行のみ。

つまり #414 ADR-002 が「client 合成が必要」とした前提は、複製に関しては**事実と異なっていた**（usecase が server 側で全フィールドを確定して返している）。

### Decision
複製の楽観追加を実施する。`duplicateSavedViewFn` の戻り値を `{ ok: true }` から `{ view }` に変更し、`SavedViewsList`（list-level `useOptimistic`）の reducer に `{type:"add"; view}` を追加して、複製ボタンの transition 内で戻り値の `view` を即時挿入する。確定は `routerInvalidate` round-trip。

- key 衝突: 楽観追加した `view.id` は server 採番の確定 id。loader 収束後の baseline にも同一 id で現れるが、`useOptimistic` は baseline 更新時に patch を破棄するため二重 key にならない。reducer に「baseline に同一 id があれば追加しない」防御を入れる。
- ちらつき: 末尾挿入の楽観行が invalidate 後に server ソート順の正位置へ移る可能性はあるが、patch 破棄で 1 回の再レンダで収束する。実害は小さい。

### Consequences
- 良い点: Issue が「高優先度」に挙げた複製の待ち感が解消する。契約変更は server fn 1 行のみで、usecase / domain は無変更。#414 ADR-002 の前提誤りを是正できる。
- トレードオフ: list-level reducer が add/remove の 2 action になり、複製の mutation 実行が行から親へ移る（削除と同じ構造）。並び順ジャンプの体感は testing で許容確認する。

---

## ADR-002: アップロードの楽観"追加"は見送る

### Status
Proposed

### Context
複製と異なり、アップロードは契約が揃っていない:
1. `uploadFileFn` は `{ jobId }` のみ返し、表示に必要な `IngestionJobWire`（originalFileName / mimeType / byteSize / status / preview）を返さない。job は server 側で `pending` で作られ非同期処理される。
2. job list を所有するのは `IngestionQueue`（`"use client"`）の `useState` + 4 秒ポーリング。`useOptimistic` は RSC baseline（props）への一時 patch を前提とするモデルで、ポーリングで `setJobs` する所有モデルとは噛み合わない。
3. 複数ファイル一括アップロード（`UploadForm` は multiple 対応）で途中失敗時の部分 rollback が複雑。

client で表示 wire を合成すると、ポーリング収束時にちらつく・status 表示が食い違う実害がある。

### Decision
アップロードの楽観追加は本 Issue では実施しない。現状の `isPending`（"アップロード中..."）表示を維持する。本格対応には ① `uploadFileFn` が wire を返す契約変更、② ポーリング所有（`IngestionQueue`）との楽観 patch 整合、の両方が必要で、複製のような「1 行で済む」対応ではないため、スコープ過大として別途扱う。

### Consequences
- 良い点: ポーリング所有モデルとの不整合・ちらつきという実害を回避。
- トレードオフ: アップロードだけは即時追加されない。ただし job はそもそも非同期処理（pending→processing→previewing）で、ポーリングが数秒で拾うため楽観追加の体感価値は複製より小さい。

---

## ADR-003: tag は full 楽観化、directory は rename のみ限定楽観化

### Status
Proposed

### Context
- **tag:** list（`<ul>`）と各 tag の表示名 `#{name}` は leaf route `/_app/tags` の RSC `TagManager` が所有。`TagActions`（client）は行操作のみ。delete は list membership、rename は親所有 name の変更で、どちらも row 単体（`TagActions`）の `useOptimistic` では変えられない（frontend doc「子は親所有データを変更できない」）。
- **directory:** tree は `_app` レイアウトの Sidebar（RSC, `staleTime: Infinity`）が所有する再帰 forest。複数 leaf（filter / select field）と共有。directory mutation は rule 2（sidebar tree 改変）で raw `router.invalidate()` を使う。move / delete は tree 構造（位置・存在）を変える操作。

### Decision
- **tag（full）:** `TagManager`（RSC）の list 描画を新規 client `TagList` へ引き上げ、`useOptimistic(tags, reducer)` を持つ。delete = `{type:"remove"}`、rename = `{type:"rename"}` の list-level 反映。#414 の `SavedViewsList`（delete）+ row-level（rename）を 1 つの list-level に統合した形で、SavedView と完全に同型。`routerInvalidate`（`_app` 除外）のまま（tag は 3 ルール非該当）。
- **directory（限定）:** rename のみ、`DirectoryTreeNodeView` に楽観名を持たせ「rename 確定〜invalidate 収束までの表示名つなぎ」として限定実装。move / delete（構造変更）は楽観化せず、現状の dialog + raw `router.invalidate()` + `isPending` フィードバックを維持。

### Consequences
- 良い点: tag は SavedView と同型で安全・確実。directory rename も最小リスクで待ち感を減らせる。
- トレードオフ: directory の move / delete は即時反映されない。これは `_app` 所有の再帰 forest を子から楽観的に書き換える高リスク（ちらつき・整合崩れ・複数参照箇所の不一致）を避ける意図的判断。frontend doc の親所有データ制約に忠実。

---

## ADR-004: 共通 hook / ヘルパーは抽出しない

### Status
Proposed

### Context
Issue パート3 は「3 例目（directory/tag）が出た段階で hook / ヘルパー抽出の是非を判断する」とする。本 Issue で出る具体例は: tag rename（list-level rename）/ tag delete（list-level remove）/ 複製（list-level add）。

### Decision
本 Issue では抽出しない。理由:
1. 出てくる 3 例目はいずれも #414 で確立済みの **2 パターン（row-level `useOptimistic(field,(_,n)=>n)` / list-level `useOptimistic(list, reducer)`）の反復**であって、それらに収まらない第三の形ではない。
2. 各 component で reducer の action 種別・transition 内の確定処理（`routerInvalidate` か raw invalidate か、navigate を挟むか）・エラー所有者（行 / 親）・early-return とのフック順序が個別に異なる。汎用ラッパーに押し込むと、これら差異を options で表現することになり現状の薄い反復より読みにくくなる。
3. CLAUDE.md / frontend doc「汎用ラッパーは第二の具体パターンが出るまで作らない」の精神は「真に新しい第三の抽象が必要になるまで待つ」であり、既存 2 パターンの反復が増えただけでは抽出の発火条件を満たさない。

### Consequences
- 良い点: 規約に忠実。各 component が自己完結で読め、#414 のテンプレをコピーして個別文脈に合わせるだけで済む。
- トレードオフ: `useOptimistic` + transition + `extractSerializedError` の定型コードが各所に重複する。将来「2 パターンに収まらない第三の形」が出たら、その時点で全用例を見渡して抽出する別 Issue を立てる。

---

## ADR-005: `CreateTagForm` も `TagList`（client）へ取り込む

### Status
Accepted（実装時判断）

### Context
ステップ4 / S-002 は「可変件数（`{N} 件のタグ`）を `TagList`（client）へ引き下げ、静的サブタイトル（`PAGE_TITLE`）は RSC 据え置き」とした。だが `TagManager`（RSC）の DOM 並びは `PAGE_TITLE` → 件数サブタイトル → `CreateTagForm` → list/empty の順で、件数サブタイトルと list の**間**に `CreateTagForm` が挟まる。

件数と list の両方を `TagList` へ引き下げると、`CreateTagForm` だけが RSC に取り残されて両者の間に置けなくなる（client フラグメントを 2 枚に割ると順序を維持するために RSC 側で件数・フォーム・list を再合成する必要があり、optimistic 件数を client に持たせる目的と噛み合わない）。

### Decision
`CreateTagForm`（既に `"use client"`）を `TagList` の描画内（件数サブタイトル直下・list の直前）へ取り込む。`TagManager`（RSC）は `PAGE_TITLE` と `TagList` だけを描画する。DOM 並び（タイトル → 件数 → 作成フォーム → list/empty）は完全に維持される。

`CreateTagForm` は元々 server fn と `useActionState` を自前で持つ独立 client component で、`TagList` の optimistic state には一切依存しない（タグ作成は `routerInvalidate` で baseline 収束する既存動線のまま）。取り込みは描画位置の移動のみで、作成フォームの責務・挙動は不変。

### Consequences
- 良い点: 件数・list・作成フォームが 1 つの client サブツリーにまとまり、DOM 順序が自然に保たれる。RSC（`TagManager`）は静的タイトル + 委譲だけの薄い殻になる。
- トレードオフ: `CreateTagForm` の描画位置の所有が RSC から `TagList` へ移る。作成フォーム自体は自己完結のため、`TagList` の optimistic ロジックとは疎結合のまま。
