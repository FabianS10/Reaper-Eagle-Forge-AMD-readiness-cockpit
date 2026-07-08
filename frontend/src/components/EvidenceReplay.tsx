import { useEffect, useState } from 'react';
import { getEvidenceReplay } from '../api';
import type { EvidenceReplay as EvidenceReplayType } from '../types';
import { ForgeTopology } from './ForgeTopology';

const EVIDENCE_FILES = [
  ['benchmark', 'benchmark_results.json'],
  ['integrity', 'sha256_manifest.txt'],
  ['environment', 'pytorch_rocm_smoke_test.txt'],
  ['environment', 'rocminfo.txt'],
  ['environment', 'rocm_smi.txt'],
  ['profiler', 'rocprofv3_summary.txt'],
  ['profiler', 'torch_profiler_fallback.txt']
];

export function EvidenceReplay() {
  const [evidence, setEvidence] = useState<EvidenceReplayType | null>(null);
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [selectedFile, setSelectedFile] = useState<string>('benchmark/benchmark_results.json');

  useEffect(() => {
    getEvidenceReplay().then(async (data) => {
      setEvidence(data);
      const base = data.base_path?.startsWith('/api') ? data.base_path : '/forge_evidence';
      const entries = await Promise.all(EVIDENCE_FILES.map(async ([section, file]) => {
        const key = `${section}/${file}`;
        const url = `${base}/${section}/${file}`;
        try { return [key, await fetch(url).then((response) => response.text())] as const; }
        catch { return [key, 'Unavailable in this deployment.'] as const; }
      }));
      setRaw(Object.fromEntries(entries));
    }).catch(() => undefined);
  }, []);

  if (!evidence) {
    return <div className="workspace" style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}><div className="card" style={{width: '400px', textAlign: 'center'}}><div className="card-body">Loading evidence capsule...</div></div></div>;
  }

  const metadata = (evidence.metadata ?? {}) as any;
  const fileNames = Object.keys(raw);

  return (
    <div className="workspace ws-replay" style={{marginLeft: '-2px'}}>
      <div style={{minHeight: 0, display: 'flex'}}>
        <ForgeTopology graph={evidence.topology} variant="overview" />
      </div>
      
      <section className="card">
        <div className="card-header" style={{alignItems: 'stretch', flexWrap: 'wrap', marginRight: '22px', marginLeft: '0px', paddingLeft: '22px', paddingRight: '22px'}}>
          <div>
            <h3 className="card-title">Raw Evidence Files</h3>
            <p className="card-subtitle">MI300X capsule · Not live GPU telemetry</p>
          </div>
          <a className="btn sm" href="/forge_evidence/integrity/sha256_manifest.txt" download style={{marginTop: '7px'}}>Download Hashes</a>
        </div>
        <div className="card-body" style={{display: 'flex', flexDirection: 'row', height: '100%', alignItems: 'stretch', flexWrap: 'wrap', marginRight: '28px', paddingLeft: '11px', paddingTop: '12px', paddingBottom: '17px', justifyContent: 'flex-start'}}>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px', justifyContent: 'center', alignItems: 'center'}}>
            <div style={{background: 'var(--bg-elevated)', padding: '12px', borderRadius: '8px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center', marginLeft: '12px'}}>
              <span style={{display: 'block', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase'}}>GPU</span>
              <strong style={{display: 'block', fontSize: '12px', color: 'var(--gold)', marginTop: '4px'}}>{metadata.hardware?.gpu ?? 'AMD Instinct MI300X'}</strong>
            </div>
            <div style={{background: 'var(--bg-elevated)', padding: '12px', borderRadius: '8px', textAlign: 'center'}}>
              <span style={{display: 'block', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase'}}>Provider</span>
              <strong style={{display: 'block', fontSize: '12px', color: 'var(--gold)', marginTop: '4px'}}>{metadata.hardware?.provider ?? 'AMD Dev Cloud'}</strong>
            </div>
            <div style={{background: 'var(--bg-elevated)', padding: '12px', borderRadius: '8px', textAlign: 'center'}}>
              <span style={{display: 'block', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase'}}>Mode</span>
              <strong style={{display: 'block', fontSize: '12px', color: 'var(--gold)', marginTop: '4px'}}>Replay Only</strong>
            </div>
          </div>

          <div style={{display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px'}}>
            {fileNames.map((name) => (
              <button key={name} className={`btn sm ${selectedFile === name ? 'primary' : ''}`} onClick={() => setSelectedFile(name)} style={{marginBottom: '4px'}}>{name}</button>
            ))}
          </div>

          <pre className="mono" style={{background: '#000', border: '1px solid rgba(201,162,39,0.1)', padding: '16px', borderRadius: '8px', fontSize: '12px', flex: 1, overflowY: 'auto', color: '#a9a9a9', whiteSpace: 'pre-wrap', margin: 0, marginTop: '-2px', marginRight: '14px'}}>{raw[selectedFile] ?? 'Select evidence file.'}</pre>
        </div>
      </section>
    </div>
  );
}
