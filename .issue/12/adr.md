# ADR — Issue #12: /exports/$jobId 詳細ルート + 一括エクスポート完了通知

## ADR-001: ジョブ進行通知は client-side polling を採用、push は不採用

### Status
Accepted

### Context
Issue は「必要ならジョブ進行通知（poll or push）」と弱い指定。選択肢:

1. **Polling**: 詳細ページが active 状態のあいだ、クライアントで一定間隔に `router.invalidate()` を呼び RSC ローダーを再走させる
2. **SSE (Server-Sent Events)**: サーバから状態更新を push
3. **WebSocket / Durable Object**: 双方向接続で push

### Decision
**Polling を採用**。

理由:
- Cloudflare Workers ランタイムで SSE / WebSocket / Durable Object の整備が現状ない（本リポジトリには既存利用例なし）。新規インフラ導入は Issue スコープを大幅に超える
- 既存の `getExportJob` usecase と `serverData + cache` ローダーをそのまま使えるため、追加 server fn ゼロで実現できる
- 詳細ページの寿命は短い（active なジョブを見届けたらタブを閉じる前提）。ターミナル状態 (`completed | failed | cancelled | expired`) で自動停止するため、無制限な API 呼出しにならない
- 1 ユーザ・1 タブの 3 秒 poll は `getExportJob` の単一 row 取得 + 所有者チェックという O(1) コストで、D1 / Workers の枠を圧迫しない

### Consequences
- 良い点: 追加インフラなし、既存パターンに完全準拠、テスト容易性が高い、新規 server fn 不要
- トレードオフ: リアルタイム性は最大 3 秒遅延。push が必要な要件が将来出てきたら別 Issue で SSE 等を検討

---

## ADR-002: Poll は `setTimeout` 自己呼出し再帰で実装する（`setInterval` ではない）

### Status
Accepted

### Context
ポーリングの実装方式として:

1. **`setInterval(() => router.invalidate(), 3000)`**: 単純だが、`router.invalidate()` が非同期で、前回の invalidate が完了する前に次が走ると state が一瞬古い → 新しい → 古い と振動する余地がある
2. **自己呼出しの `setTimeout`**: `await router.invalidate()` してから次の `setTimeout` を schedule。前回完了を待ってから次が走るため重複なし

### Decision
**`setTimeout` 自己呼出し再帰を採用**。

実装イメージ:
```tsx
useEffect(() => {
  if (!isActive) return;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const tick = async () => {
    if (cancelled) return;
    if (document.visibilityState !== "hidden") {
      await router.invalidate();
    }
    if (cancelled) return;
    timer = setTimeout(tick, 3000);
  };
  timer = setTimeout(tick, 3000);
  return () => {
    cancelled = true;
    if (timer !== null) clearTimeout(timer);
  };
}, [isActive, router]);
```

### Consequences
- 良い点: 前回の invalidate 完了を待つため重複なし、document hidden 時のスキップが自然に書ける、React Strict Mode の二重実行に対する cleanup が単純
- トレードオフ: わずかにコードが長くなる

---

## ADR-003: `expiresAt` のクライアント判定でダウンロードボタンを抑止する

### Status
Accepted

### Context
`downloadExportArtifact` usecase は `expiresAt <= now` の場合 `BusinessRuleError("export_expired")` を投げる。一覧の `ExportJobRow` は `canDownload = job.status === "completed"` のみで判定しているため、期限切れ後にもボタンが表示され、押すとエラーになる。

詳細ページではこの動線を改善するか、一覧と同じ挙動にしておくかの選択がある。

### Decision
**詳細ページのみ `canDownload = job.status === "completed" && (job.expiresAt === null || Date.parse(job.expiresAt) > Date.now())` で判定する。**

一覧側の判定は触らない（スコープ外）。期限切れ時はボタンを非表示にし、代わりに「有効期限切れのため再エクスポートが必要です」相当の文言を表示する。

### Consequences
- 良い点: ユーザが期限切れジョブで無駄なエラーに遭遇しない、文言で再エクスポートを促せる
- トレードオフ: クライアント時計に依存（時計ズレで境界付近の挙動が変わる可能性。ただし境界では結局 server 側 usecase が拒否するため、悪化はしない）。一覧側と判定ロジックが一時的に乖離する（将来の共通化は別 Issue）

---

## ADR-004: `errorComponent` で `BusinessRuleError(Unauthorized)` の生メッセージ露出を防ぐ

### Status
Accepted

### Context
`ExportJob.assertOwnedBy(found.entity, input.actorUserId)` は他人のジョブに対して `BusinessRuleError(ExportErrorCode.Unauthorized, "ExportJob {id} is not owned by {userId}")` を投げる（`app/core/domain/export/entity.ts`）。

これが `errorResponseMiddleware` 経由でクライアントに渡るとき、シリアライズされた `kind` は `"business"` になる。`errorDisplay.ts` の `sanitizeRouteError` / `renderErrorMessage` は `kind === "business"` をユーザに見せても安全な業務エラーとして扱い `error.message` をそのまま返すため、`<pre>{sanitizeRouteError(error)}</pre>` 経由で **jobId と被害者の userId が攻撃者の画面に出る情報リーク**になる。

これは `notes/$noteId/index.tsx` の既存パターンを素直にコピーしてしまうと再現する。`NoteDetail` 側は内部で別の表示処理を持っているため問題化していないが、`/exports/$jobId` では `errorComponent` で直接画面表示するため対策が必要。

### Decision
**`ExportJobDetailPage` (RSC) の中で `getExportJob` の呼び出しを `try/catch` でラップし、`isNotFoundError` / `isBusinessRuleError + ExportErrorCode.Unauthorized` のときは中立メッセージ JSX を直接返す。**

実機検証で判明した経路の制約:
- `renderServerComponent(<Page />)` は server fn handler から同期 return される。Page コンポーネントの async render 中に発生したエラーは、server fn の `.handler` の try/catch にも `errorResponseMiddleware` にも届かない（React Server Component のレンダリングは middleware の外側で行われる）
- そのため client 側 (route の `loader`/`errorComponent`) に届くエラーは `AppServerError` ラップも `serialized` プロパティも持たない素の `NotFoundError` / `BusinessRuleError` で、`extractSerializedError` も `instanceof`/`hasSerializedRemnant` の両判定で構造を識別できず `kind === "unknown"` に倒れる
- 結果として TanStack Router の標準的なエラー導線（`errorComponent` での `kind` 分岐、`notFound()` 経由の `notFoundComponent` 振り分け、いずれも）では中立メッセージを安定して出せない

最も確実な落とし所として、エラーが発生する位置（= server component の中、`instanceof` チェックが効く範囲）でハンドルする。

```tsx
export async function ExportJobDetailPage({ jobId }: { jobId: ExportJobId }) {
  const user = await requireCurrentUser();
  try {
    const { job } = await loadExportJob({ actorUserId: user.id, jobId });
    return (
      <main>
        <h1>エクスポートジョブ詳細</h1>
        <ExportJobDetailView job={job} />
      </main>
    );
  } catch (error) {
    if (
      isNotFoundError(error) ||
      (isBusinessRuleError(error) &&
        error.code === ExportErrorCode.Unauthorized)
    ) {
      return (
        <main>
          <div role="alert">
            <h1>ジョブが見つかりません</h1>
            <p>ジョブが見つからないか、アクセス権限がありません。</p>
          </div>
        </main>
      );
    }
    throw error;
  }
}
```

`/exports/$jobId.tsx` 側は `errorComponent` だけ持つシンプルな構成に戻し、route で kind 判別をしない。`notFound` / `unauthorized` を同一文言で返すことで、他人のジョブの存在有無を漏らさない。

### Consequences
- 良い点: jobId / userId の生メッセージが画面に出ない。NotFound vs Unauthorized の区別を画面で漏らさない（オラクル攻撃に強い）
- トレードオフ: ユーザ視点で「実は存在するが権限がない」と「そもそも存在しない」が見分けられない（=セキュリティ的には望ましい挙動）。`sanitizeRouteError` を完全に避けることで、想定外の `kind` が来たときの fallback が必要（上記コードでは `business` (Unauthorized 以外) / `system` / `unknown` 等は `sanitizeRouteError` 経由で残す）
