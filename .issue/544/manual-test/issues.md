# 起票した Issue — Issue #544 ブラウザ検証

| Issue | タイトル | 分類 | 由来 TC |
|---|---|---|---|
| [#560](https://github.com/tuanemuy/hollow/issues/560) | bug: 共有リンクのパスワード失敗カウンタが永続化されずロックアウトが発火しない | 実装バグ（バックエンド・既存） | TC-002 |

#560 は #544 のスコープ外（#544 はUIのみ変更）。`resolveShareLink.ts` が失敗カウンタ更新を
pending batch に積んだ直後に throw し、遅延バッチ UoW（`unitOfWork.ts:206`）が throw 時に flush を
スキップするため失敗カウンタが永続化されない既存バグ。
