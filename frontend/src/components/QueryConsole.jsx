export default function QueryConsole({ query }) {
  return (
    <div className="query-console">
      <div className="query-console-label">
        <span className="dot" />
        LIVE QUERY
      </div>
      <pre className="query-console-sql">
        {query ? query.sql : 'SELECT * FROM tasks…'}
        <span className="cursor">▍</span>
      </pre>
      {query && (
        <div className="query-console-meta">
          {query.params.length > 0 && (
            <span>params: [{query.params.join(', ')}]</span>
          )}
          <span>{query.rows} row{query.rows === 1 ? '' : 's'}</span>
        </div>
      )}
    </div>
  );
}
