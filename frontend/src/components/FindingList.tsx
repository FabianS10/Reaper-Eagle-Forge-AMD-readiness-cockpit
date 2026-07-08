import { useMemo, useState } from 'react';
import type { Finding } from '../types';

type Filter = 'all' | 'high' | 'medium' | 'low';

const LABELS: Record<Filter, string> = {
  all: 'All',
  high: 'Blockers',
  medium: 'Warnings',
  low: 'Notes'
};

export function FindingList({ findings }: { findings: Finding[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const counts = useMemo(() => ({
    all: findings.length,
    high: findings.filter((finding) => finding.severity === 'high').length,
    medium: findings.filter((finding) => finding.severity === 'medium').length,
    low: findings.filter((finding) => finding.severity === 'low').length
  }), [findings]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return findings.filter((finding) => {
      if (filter !== 'all' && finding.severity !== filter) return false;
      if (!q) return true;
      return [finding.code, finding.category, finding.file_path, finding.message, finding.suggestion]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [findings, filter, query]);

  if (!findings.length) return <div className="empty-state">No findings loaded yet. Run a repo scan to populate the audit table.</div>;

  return (
    <div style={{display: 'flex', flexDirection: 'column', height: 'auto', flexGrow: 0}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '16px', flexShrink: 0, marginTop: '-3px'}}>
        <div style={{display: 'flex', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', overflow: 'auto', alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'flex-start', marginLeft: '0px', marginTop: '0px', marginRight: '100px'}}>
          {(Object.keys(LABELS) as Filter[]).map((key, idx) => {
            const marginStyles = {
              all: { marginRight: '33px' },
              high: { marginRight: '50px', marginLeft: '0px' },
              medium: { marginLeft: '0px', marginRight: '75px' },
              low: {}
            };
            return (
              <button key={key} className={`btn sm ${filter === key ? 'primary' : ''}`} onClick={() => setFilter(key)} style={{border: 'none', borderRadius: 0, borderBottom: filter === key ? '2px solid var(--gold)' : 'none', background: filter === key ? 'rgba(201,162,39,0.1)' : 'transparent', color: filter === key ? 'var(--gold)' : 'var(--text-muted)', ...marginStyles[key as Filter]}}>
                {LABELS[key]} ({counts[key]})
              </button>
            );
          })}
        </div>
        <input className="input mono" style={{minWidth: '200px', maxWidth: '300px'}} placeholder="Filter..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div style={{overflowY: 'auto', flex: 1, paddingRight: '8px'}}>
        {!visible.length && <div className="empty-state">No findings match this filter.</div>}
        {visible.map((finding, index) => (
          <article className={`finding-row ${finding.severity}`} key={`${finding.code}-${index}`}>
            <div className="finding-mainline">
              <div className="finding-code-block">
                <span className="mono finding-code">{finding.code}</span>
                <span className="mono finding-category">{finding.category.replace(/_/g, ' ')}</span>
              </div>
              <span className={`badge ${finding.severity}`}>{finding.severity}</span>
            </div>
            <p className="finding-message">{finding.message}</p>
            <div className="finding-meta mono">
              <span>{finding.file_path ? `${finding.file_path}:${finding.line_number ?? '?'}` : 'repo-level evidence'}</span>
            </div>
            <details className="finding-details">
              <summary>Snippet & suggested fix</summary>
              {finding.snippet && <pre className="snippet mono">{finding.snippet}</pre>}
              <p style={{fontSize: '14px', color: 'var(--text-main)'}}><strong>Suggested fix:</strong> {finding.suggestion}</p>
            </details>
          </article>
        ))}
      </div>
    </div>
  );
}
