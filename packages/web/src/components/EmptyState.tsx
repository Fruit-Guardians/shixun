export function EmptyResults({ saved, onReset }: { saved: boolean; onReset: () => void }) {
  return (
    <div className="empty-state">
      <pre aria-hidden="true">{saved ? '[ ]  0 saved' : '> grep: 0 matches'}</pre>
      <h2>{saved ? '还没有保存的动态' : '没有找到匹配的内容'}</h2>
      <p>{saved ? '点击动态右上角的 save，留到以后再读。' : '试试其他关键词、领域或日报；空缺不会用生成内容补齐。'}</p>
      <button className="btn" onClick={onReset}>
        查看全部
      </button>
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="loading-state" role="status" aria-label="正在载入归档…">
      <p>
        <span className="prompt">$</span> shixun fetch --archive
      </p>
      <p className="dim">
        loading reports<span className="cursor" aria-hidden="true" />
      </p>
    </div>
  );
}
