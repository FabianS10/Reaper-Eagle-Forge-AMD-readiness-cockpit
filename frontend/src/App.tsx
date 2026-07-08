import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { exportReportPdf, generateReport, getDemoTopology, runEnvironmentCheck, scanDemoRepo, scanRepo } from './api';
import { EvidenceReplay } from './components/EvidenceReplay';
import { FindingList } from './components/FindingList';
import { ForgeTopology } from './components/ForgeTopology';
import { ScoreGauge } from './components/ScoreGauge';
import type { ClaimLedger, Finding, ScanResponse, ScoreBreakdown, TopologyGraph } from './types';

// Design System & Global CSS
const GLOBAL_STYLES = `
  :root {
    --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 24px; --s-6: 32px;
    --r-sm: 8px; --r-md: 12px; --r-lg: 16px;
    --bg-base: #08090a; --bg-panel: #0f1112; --bg-elevated: #16191b;
    --border-subtle: 1px solid rgba(255,255,255,0.06); --border-glow: 1px solid rgba(201,162,39,0.2);
    --gold: #C9A227; --gold-light: #E0BC4A; --gold-glow: rgba(201,162,39,0.4);
    --text-main: #F5F1E8; --text-muted: #8a8478;
    --status-pass: #22C55E; --status-warn: #F97316; --status-fail: #EF4444;
  }
  * { box-sizing: border-box; }
  html, body, #root { margin: 0; height: 100vh; overflow: hidden; background: var(--bg-base); color: var(--text-main); font-family: 'Inter', system-ui, sans-serif; font-size: 14px; }
  .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 13px; }
  h1 { font-size: 24px; margin: 0; font-weight: 800; }
  h2 { font-size: 18px; margin: 0; font-weight: 700; }
  h3 { font-size: 15px; margin: 0; font-weight: 600; }
  
  /* Application Shell */
  .app-shell { display: grid; grid-template-rows: 56px 1fr 28px; height: 100vh; background: var(--bg-base); }
  .app-header { display: flex; align-items: center; justify-content: space-between; padding: 0 24px; border-bottom: var(--border-subtle); background: var(--bg-panel); z-index: 10; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand-mark { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--gold); color: var(--gold); border-radius: 8px; font-weight: bold; box-shadow: 0 0 12px var(--gold-glow); font-size: 12px; }
  .brand-title { font-weight: 700; font-size: 16px; }
  .brand-subtitle { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; }
  .status-cluster { display: flex; gap: 8px; }
  .status-pill { padding: 4px 10px; font-size: 10px; font-weight: 600; border-radius: 8px; border: 1px solid rgba(201,162,39,0.3); color: var(--gold-light); background: rgba(201,162,39,0.05); text-transform: uppercase; }
  
  .app-body { display: grid; grid-template-columns: 220px 1fr; overflow: hidden; }
  .app-sidebar { border-right: var(--border-subtle); background: var(--bg-panel); padding: 16px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
  .app-workspace { overflow: hidden; background: var(--bg-base); position: relative; }
  .app-statusbar { display: flex; align-items: center; justify-content: space-between; padding: 0 24px; border-top: var(--border-subtle); background: var(--bg-panel); color: var(--text-muted); font-size: 12px; }
  
  /* Navigation */
  .nav-item { display: flex; flex-direction: column; padding: 12px 16px; border-radius: 8px; cursor: pointer; color: var(--text-muted); transition: all 0.2s; border: 1px solid transparent; background: transparent; text-align: left; }
  .nav-item:hover { background: rgba(255,255,255,0.03); color: var(--text-main); }
  .nav-item.active { background: rgba(201,162,39,0.05); border-color: var(--border-glow); color: var(--gold); box-shadow: 0 0 12px rgba(201,162,39,0.05); }
  .nav-title { font-weight: 600; font-size: 14px; margin-bottom: 2px; }
  .nav-desc { font-size: 11px; opacity: 0.8; }
  
  /* Workspaces (Strict Grids) */
  .workspace { display: grid; height: 100%; gap: 16px; padding: 16px; overflow: hidden; min-height: 0; }
  .ws-audit { grid-template-rows: auto auto 1fr 300px; }
  .ws-audit-header { display: flex; justify-content: space-between; align-items: center; padding: 0 4px; }
  .ws-audit-main { display: grid; grid-template-columns: 1fr 400px; gap: 16px; min-height: 0; }
  
  .ws-live { grid-template-rows: auto 1fr; grid-template-columns: 1fr 400px; }
  .ws-live-header { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: center; padding: 0 4px; }
  
  .ws-replay { grid-template-columns: 1fr 400px; }
  .ws-report { grid-template-columns: 1fr 400px; }
  
  /* Card Component */
  .card { background: var(--bg-panel); border: var(--border-subtle); border-radius: 12px; display: flex; flex-direction: column; min-height: 0; overflow: hidden; transition: border-color 0.3s; }
  .card:hover { border-color: rgba(201,162,39,0.15); }
  .card-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: var(--border-subtle); flex-shrink: 0; background: rgba(255,255,255,0.02); }
  .card-title { margin: 0; font-size: 15px; font-weight: 600; color: var(--text-main); }
  .card-subtitle { margin: 4px 0 0 0; font-size: 12px; color: var(--text-muted); }
  .card-actions { display: flex; gap: 8px; align-items: center; }
  .card-body { padding: 16px; overflow-y: auto; flex: 1; min-height: 0; }
  .card-body.no-pad { padding: 0; overflow: hidden; }
  
  /* Buttons & Inputs */
  .btn { background: transparent; color: var(--gold); border: 1px solid var(--gold); padding: 8px 16px; border-radius: 8px; font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 600; cursor: pointer; text-transform: uppercase; transition: all 0.2s; display: inline-flex; align-items: center; gap: 8px; }
  .btn:hover { background: rgba(201,162,39,0.1); box-shadow: 0 0 10px rgba(201,162,39,0.2); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn.primary { background: var(--gold); color: #000; border-color: var(--gold); }
  .btn.primary:hover { background: var(--gold-light); box-shadow: 0 0 15px var(--gold-glow); }
  .btn.sm { padding: 4px 8px; font-size: 11px; }
  .input { background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); color: var(--text-main); padding: 8px 12px; border-radius: 8px; font-size: 13px; outline: none; transition: border 0.2s; min-width: 300px; }
  .input:focus { border-color: var(--gold); box-shadow: 0 0 8px rgba(201,162,39,0.1); }
  
  /* Metrics */
  .metric-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 19px; }
  .metric-card { background: var(--bg-panel); border: var(--border-subtle); border-radius: 12px; padding: 16px 0; text-align: center; transition: transform 0.2s; display: flex; flex-direction: column; align-items: stretch; overflow: auto; }
  .metric-card:hover { transform: translateY(-2px); border-color: var(--border-glow); }
  .metric-value { font-size: 32px; font-weight: 800; color: var(--gold); margin-bottom: 4px; }
  .metric-card[data-score="pass"] .metric-value { color: var(--status-pass); }
  .metric-card[data-score="warn"] .metric-value { color: var(--status-warn); }
  .metric-card[data-score="fail"] .metric-value { color: var(--status-fail); }
  .metric-title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--text-main); }
  .metric-card p { font-size: 10px; color: var(--text-muted); margin: 4px 0 0 0; margin-right: 0; padding: 0; width: 100%; max-width: 500px; }
  
  .mini-facts { display: flex; justify-content: space-around; margin-top: 16px; padding-top: 16px; border-top: var(--border-subtle); }
  .danger-text { color: var(--status-fail) !important; }
  
  /* Findings */
  .finding-row { background: var(--bg-elevated); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; padding: 16px; margin-bottom: 12px; border-left: 3px solid var(--gold); transition: all 0.2s; }
  .finding-row:hover { border-color: rgba(201,162,39,0.3); transform: translateY(-1px); }
  .finding-row.high { border-left-color: var(--status-fail); }
  .finding-row.medium { border-left-color: var(--status-warn); }
  .finding-row.low { border-left-color: var(--gold); }
  .finding-mainline { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .finding-code-block { display: flex; align-items: center; gap: 12px; }
  .finding-code { font-size: 15px; font-weight: 700; color: var(--gold-light); }
  .finding-category { font-size: 11px; color: var(--text-muted); text-transform: uppercase; background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 4px; }
  .badge { padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; font-family: 'JetBrains Mono', monospace; }
  .badge.high { background: rgba(239, 68, 68, 0.15); color: var(--status-fail); border: 1px solid var(--status-fail); }
  .badge.medium { background: rgba(249, 115, 22, 0.15); color: var(--status-warn); border: 1px solid var(--status-warn); }
  .badge.low { background: rgba(201, 162, 39, 0.15); color: var(--gold); border: 1px solid var(--gold); }
  .finding-message { margin: 0 0 12px 0; font-size: 14px; color: var(--text-main); line-height: 1.5; }
  .finding-meta { display: flex; gap: 16px; font-size: 12px; color: var(--text-muted); margin-bottom: 12px; }
  .finding-details summary { cursor: pointer; font-size: 12px; color: var(--gold); font-family: 'JetBrains Mono', monospace; font-weight: 600; }
  .snippet { background: #000; padding: 12px; border-radius: 6px; border: 1px solid rgba(201,162,39,0.1); font-size: 12px; overflow-x: auto; margin: 8px 0; }
  
  /* Ledger */
  .ledger-columns { display: flex; flex-wrap: wrap; gap: 16px; }
  .ledger-card { background: rgba(0,0,0,0.3); border: 1px solid rgba(201,162,39,0.1); border-radius: 8px; padding: 16px; }
  .ledger-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: var(--border-subtle); }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; }
  .status-dot.pass { background: var(--status-pass); box-shadow: 0 0 8px var(--status-pass); }
  .status-dot.warn { background: var(--status-warn); box-shadow: 0 0 8px var(--status-warn); }
  .status-dot.fail { background: var(--status-fail); box-shadow: 0 0 8px var(--status-fail); }
  .ledger-list { list-style: none; padding: 0; margin: 0; font-size: 13px; color: var(--text-muted); }
  .ledger-list li { padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.03); line-height: 1.4; }
  .ledger-list li:last-child { border-bottom: none; }
  
  /* Probe Summary */
  .probe-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .probe-card { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 16px; background: var(--bg-elevated); border-radius: 8px; }
  .probe-card span { font-size: 28px; font-weight: 800; color: var(--gold); }
  .probe-card.pass span { color: var(--status-pass); }
  .probe-card.fail span { color: var(--status-fail); }
  
  /* Report Workspace */
  .report-doc { background: #fff; color: #111; padding: 48px; border-radius: 8px; font-family: 'Inter', sans-serif; line-height: 1.6; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
  .report-doc h1 { font-size: 32px; color: #C9A227; border-bottom: 2px solid #C9A227; padding-bottom: 16px; margin-bottom: 32px; }
  .report-doc h2 { font-size: 24px; margin-top: 32px; margin-bottom: 16px; color: #333; }
  .report-doc h3 { font-size: 18px; margin-top: 24px; margin-bottom: 8px; color: #444; }
  .report-doc p { margin-bottom: 16px; font-size: 14px; color: #444; }
  .report-score-row { display: flex; align-items: center; gap: 24px; padding: 24px; background: #f9f9f9; border-radius: 8px; margin-bottom: 32px; border-left: 4px solid #C9A227; }
  .report-score-big { font-size: 48px; font-weight: 800; color: #C9A227; }
  .raw-markdown { background: #000; color: #0f0; padding: 24px; border-radius: 8px; font-family: 'JetBrains Mono', monospace; font-size: 13px; white-space: pre-wrap; height: 100%; overflow-y: auto; }
  
  /* Modal (Diagnostic JSON Pop-up) */
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 32px; animation: fadeIn 0.2s ease-out; }
  .modal-content { background: var(--bg-panel); border: 1px solid var(--gold); border-radius: 12px; width: 100%; max-width: 900px; height: 80vh; display: flex; flex-direction: column; box-shadow: 0 0 40px rgba(0,0,0,0.5); }
  
  .graph-skeleton { height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-family: monospace; }
  .empty-state { padding: 24px; text-align: center; color: var(--text-muted); }
  
  @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  .workspace > * { animation: fadeIn 0.3s ease-out; }
`;

type Tab = 'audit' | 'environment' | 'evidence' | 'report' | 'scope';
const GOLDEN_REPO = 'https://github.com/FabianS10/reaper-eagle-forge-golden-repo';
const DEFAULT_CHECKS = ['PYTHON_VERSION', 'ROCMINFO', 'ROCM_SMI_PRODUCT', 'HIPCC_VERSION', 'PYTORCH_SMOKE_TEST', 'PROFILER_AVAILABILITY'];
const DEFAULT_BREAKDOWN: ScoreBreakdown = { overall: 0, portability: 0, benchmark_integrity: 0, evidence_completeness: 0, claim_discipline: 0 };

export default function App() {
  const [tab, setTab] = useState<Tab>('audit');
  const [repoUrl, setRepoUrl] = useState(GOLDEN_REPO);
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [topology, setTopology] = useState<TopologyGraph | null>(null);
  const [envResult, setEnvResult] = useState<any | null>(null);
  const [report, setReport] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showJsonModal, setShowJsonModal] = useState(false);

  useEffect(() => {
    scanDemoRepo().then((data) => {
      setScan(data);
      setTopology(data.topology ?? null);
      if (!data.topology) return getDemoTopology().then(setTopology);
      return undefined;
    }).catch(() => undefined);
  }, []);

  const findings: Finding[] = useMemo(() => scan?.findings ?? [], [scan]);
  const breakdown = scan?.score_breakdown ?? DEFAULT_BREAKDOWN;
  const ledger = scan?.claim_ledger ?? null;
  const blockerCount = findings.filter((finding) => finding.severity === 'high').length;
  const reportPayload = useMemo(() => ({ findings, score: scan?.score ?? 0, label: scan?.label ?? 'not_checked', score_breakdown: scan?.score_breakdown, claim_ledger: scan?.claim_ledger, hardware_mode: envResult?.mode ?? 'static_scan_or_evidence_replay' }), [findings, scan, envResult]);

  async function handleScan(useDemo = false) {
    setBusy(true); setErrorMessage(null);
    try {
      const data = useDemo ? await scanDemoRepo() : await scanRepo(repoUrl || GOLDEN_REPO);
      setScan(data); setTopology(data.topology ?? null); setTab('audit');
    } catch (error) { setErrorMessage(`Scan failed: ${error instanceof Error ? error.message : String(error)}.`); } 
    finally { setBusy(false); }
  }

  async function handleEnvironment() {
    setBusy(true);
    try {
      const data: any = await runEnvironmentCheck(DEFAULT_CHECKS);
      setEnvResult(data); setTopology(data.topology ?? topology); setTab('environment');
    } catch (error) { setEnvResult({ mode: 'backend_unavailable', error: String(error) }); }
    finally { setBusy(false); }
  }

  async function handleReport() {
    setBusy(true);
    try { const data = await generateReport(reportPayload); setReport(data); setTab('report'); } 
    catch { setReport({ generation_mode: 'client_fallback', markdown: fallbackReport(scan), html: '' }); setTab('report'); } 
    finally { setBusy(false); }
  }

  async function handlePdfExport() {
    setBusy(true); setErrorMessage(null);
    try { await exportReportPdf(reportPayload); } 
    catch (error) { setErrorMessage(`PDF export failed: ${error instanceof Error ? error.message : String(error)}.`); } 
    finally { setBusy(false); }
  }

  return (
    <>
      <style>{GLOBAL_STYLES}</style>
      <div className="app-shell">
        <header className="app-header">
          <div className="brand">
            <div className="brand-mark mono">RF</div>
            <div>
              <div className="brand-title">Reaper Eagle Forge ML</div>
              <div className="brand-subtitle">AMD readiness · benchmark truth · evidence boundaries</div>
            </div>
          </div>
          <div className="status-cluster">
            <span className="status-pill mono">Static audit</span>
            <span className="status-pill mono">Fixed probes only</span>
            <span className="status-pill mono">Replay ≠ live</span>
          </div>
        </header>

        <div className="app-body">
          <aside className="app-sidebar" style={{flexGrow: 0, minHeight: '0px'}}>
            <nav className="nav-menu" style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
              <TabButton active={tab === 'audit'} onClick={() => setTab('audit')} title="Audit" desc="Repo readiness" />
              <TabButton active={tab === 'environment'} onClick={() => setTab('environment')} title="Live" desc="Fixed probes" />
              <TabButton active={tab === 'evidence'} onClick={() => setTab('evidence')} title="Replay" desc="MI300X capsule" />
              <TabButton active={tab === 'report'} onClick={() => setTab('report')} title="Report" desc="Decision package" />
              <TabButton active={tab === 'scope'} onClick={() => setTab('scope')} title="Scope" desc="Pitch boundary" />
            </nav>
            
            <div className="card" style={{flexShrink: 0, justifyContent: 'flex-start', alignItems: 'center'}}>
              <div className="card-header" style={{background: 'transparent', borderBottom: 'none', padding: '2px 16px', flexWrap: 'wrap', alignItems: 'stretch'}}>
                <h3 style={{textDecoration: 'underline', fontSize: '18px'}}>Forge Score</h3>
                <span className="mono" style={{fontSize: '10px', color: 'var(--text-muted)'}}>{scan?.label ?? 'N/A'}</span>
              </div>
              <div style={{paddingTop: '1px', paddingBottom: '7px', paddingLeft: '16px', paddingRight: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                <ScoreGauge score={scan?.score ?? 0} />
                <div className="mini-facts" style={{width: '100%', marginTop: '1px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)'}}>
                  <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                    <span className="mono" style={{fontSize: '20px', fontWeight: 800}}>{findings.length}</span>
                    <small style={{fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase'}}>findings</small>
                  </div>
                  <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                    <span className="mono danger-text" style={{fontSize: '20px', fontWeight: 800}}>{blockerCount}</span>
                    <small style={{fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase'}}>blockers</small>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          <main className="app-workspace">
            {tab === 'audit' && (
              <div className="workspace ws-audit" style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap', overflowY: 'auto', height: 'auto', flexGrow: 0 }}>
                <div className="ws-audit-header" style={{justifyContent: 'flex-end', alignItems: 'flex-start', marginLeft: '1px'}}>
                  <div>
                    <div className="mono" style={{fontSize: '10px', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px'}}>repo scan · readiness · claims</div>
                    <h1 style={{marginLeft: 'auto', marginRight: 'auto', textAlign: 'left', fontSize: '19px'}}>AMD-readiness cockpit</h1>
                  </div>
                  <div style={{display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end', marginLeft: '35px', marginRight: '35px'}}>
                    <input className="input mono" placeholder="https://github.com/owner/repo" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} style={{marginLeft: '300px', width: '470px'}} />
                    <button className="btn primary" onClick={() => handleScan(false)} disabled={busy} style={{ textAlign: 'left', width: '70px' }}>Scan</button>
                    <button className="btn" onClick={() => handleScan(true)} disabled={busy}>Demo</button>
                  </div>
                </div>
                
                <ScoreBreakdownCards breakdown={breakdown} score={scan?.score ?? 0} label={scan?.label ?? 'not checked'} />
                
                <div className="ws-audit-main">
                  <section className="card" style={{alignItems: 'stretch'}}>
                    <div className="card-header">
                      <h3 className="card-title">Findings</h3>
                      <div className="card-actions"><span className="status-pill mono">{findings.length} total</span></div>
                    </div>
                    <div className="card-body" style={{minHeight: '400px', height: 'auto', flexGrow: 0}}><FindingList findings={findings} /></div>
                  </section>

                  <section className="card">
                    <div className="card-header">
                      <h3 className="card-title">Claim Ledger</h3>
                      <span className="status-pill mono">strict</span>
                    </div>
                    <div className="card-body" style={{height: 'auto', flexGrow: 0, minHeight: '400px'}}><ClaimLedgerPanel ledger={ledger} /></div>
                  </section>
                </div>
                
                <div style={{ minHeight: 0, display: 'flex' }}>
                  <ForgeTopology graph={topology} variant="overview" />
                </div>
              </div>
            )}

            {tab === 'environment' && (
              <div className="workspace ws-live" style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap', justifyContent: 'center', flexDirection: 'row', overflow: 'auto' }}>
                <div className="ws-live-header">
                  <div>
                    <div className="mono" style={{fontSize: '10px', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px'}}>safe live path</div>
                    <h1>Live AMD Check</h1>
                  </div>
                  <button className="btn primary" onClick={handleEnvironment} disabled={busy} style={{marginLeft: '500px'}}>{busy ? 'Running probes…' : 'Run Fixed Probes'}</button>
                </div>
                
                {/* Left Column: Graph */}
                <div style={{ minHeight: 0, display: 'flex' }}>
                  <ForgeTopology graph={envResult?.topology ?? topology} variant="overview" />
                </div>

                {/* Right Column: Probes & Logs */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 0 }}>
                  <section className="card" style={{flexShrink: 0}}>
                    <div className="card-header" style={{ alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'flex-start', paddingLeft: '6px' }}><h3 className="card-title">Probe Summary</h3></div>
                    <div className="card-body" style={{ marginLeft: '190px', marginRight: '190px' }}>
                      <ProbeSummary result={envResult} />
                    </div>
                  </section>
                  
                  <section className="card" style={{flex: 1, minHeight: 0}}>
                    <div className="card-header" style={{ alignItems: 'stretch', flexWrap: 'wrap' }}>
                      <h3 className="card-title">System Logs</h3>
                      <button className="btn sm" onClick={() => setShowJsonModal(true)}>View Diagnostic JSON</button>
                    </div>
                    <div className="card-body">
                      <div className="empty-state" style={{padding: '0'}}>
                        <p>Diagnostic logs available in raw JSON format.</p>
                        <p style={{fontSize: '12px', marginTop: '16px'}}>Mode: <strong style={{color: 'var(--gold)'}}>{envResult?.mode ?? 'waiting'}</strong></p>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            )}

            {tab === 'evidence' && <EvidenceReplay />}

            {tab === 'report' && (
              <ReportWorkspace scan={scan} ledger={ledger} findings={findings} breakdown={breakdown} report={report} busy={busy} onReport={handleReport} onPdfExport={handlePdfExport} />
            )}

            {tab === 'scope' && (
              <div className="workspace" style={{gridTemplateColumns: '1fr', overflowY: 'auto'}}>
                <div className="card">
                  <div className="card-header"><h3 className="card-title">Pitch Boundary</h3></div>
                  <div className="card-body">
                    <h1 style={{marginBottom: '16px'}}>Forge is a product, not a benchmark contest.</h1>
                    <p style={{fontSize: '16px', lineHeight: '1.6', color: 'var(--text-muted)'}}>Benchmark evidence proves the product is real. The product is the trust layer around AMD migration and benchmark claims.</p>
                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '32px'}}>
                      <div style={{background: 'var(--bg-elevated)', padding: '24px', borderRadius: '12px'}}>
                        <h3 style={{color: 'var(--status-pass)', marginBottom: '16px'}}>Forge is</h3>
                        <ul className="ledger-list">
                          <li>An AMD-readiness auditor for ML repositories.</li>
                          <li>A benchmark-integrity checker for warm-up, sync, repeated trials, and provenance.</li>
                          <li>An evidence package generator with live/replay boundaries.</li>
                          <li>A decision-support tool for teams considering AMD migration.</li>
                        </ul>
                      </div>
                      <div style={{background: 'var(--bg-elevated)', padding: '24px', borderRadius: '12px'}}>
                        <h3 style={{color: 'var(--status-fail)', marginBottom: '16px'}}>Forge is not</h3>
                        <ul className="ledger-list">
                          <li>Not a raw speed leaderboard.</li>
                          <li>Not a generic CUDA-to-ROCm copilot clone.</li>
                          <li>Not a universal claim that AMD beats NVIDIA.</li>
                          <li>Not an arbitrary user-code execution service.</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>

        <footer className="app-statusbar">
          <span>Reaper Eagle Forge ML v1.0</span>
          <span>{busy ? 'Processing...' : ''}</span>
          <span className="mono">{errorMessage ? `Error: ${errorMessage}` : ''}</span>
        </footer>

        {/* Diagnostic JSON Modal */}
        {showJsonModal && (
          <div className="modal-overlay" onClick={() => setShowJsonModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="card-header" style={{padding: '16px 24px'}}>
                <h3 className="card-title">Diagnostic JSON</h3>
                <button className="btn sm" onClick={() => setShowJsonModal(false)}>Close</button>
              </div>
              <div className="card-body" style={{padding: '24px'}}>
                <pre className="mono" style={{background: '#000', padding: '20px', borderRadius: '8px', color: '#a9a9a9', whiteSpace: 'pre-wrap', height: '100%', overflowY: 'auto', margin: 0}}>
                  {envResult ? JSON.stringify(envResult, null, 2) : 'Run fixed probes to populate.'}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function TabButton({ active, onClick, title, desc }: { active: boolean; onClick: () => void; title: string; desc: string }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}><span className="nav-title">{title}</span><span className="nav-desc">{desc}</span></button>;
}

function ScoreBreakdownCards({ breakdown, score, label }: { breakdown: ScoreBreakdown; score: number; label: string }) {
  const items = [['Overall', score, label], ['Portability', breakdown.portability, 'CUDA/NVIDIA lock-in'], ['Benchmark', breakdown.benchmark_integrity, 'warm-up · sync · p95'], ['Evidence', breakdown.evidence_completeness, 'Docker · manifest · hashes'], ['Claims', breakdown.claim_discipline, 'allowed vs blocked']] as const;
  return <div className="metric-grid" style={{justifyContent: 'center', alignItems: 'flex-start', marginLeft: 29}}>{items.map(([title, value, desc]) => <div className="metric-card" key={title} data-score={scoreClass(value)}><div className="metric-value mono">{value}</div><div className="metric-title">{title}</div><p>{desc}</p></div>)}</div>;
}

function ClaimLedgerPanel({ ledger }: { ledger: ClaimLedger | null }) {
  if (!ledger) return <p className="empty-state">Run a scan to load allowed claims, blocked claims, verified facts, and required proof.</p>;
  return (
    <div className="ledger-columns" style={{justifyContent: 'flex-start', alignItems: 'stretch', marginTop: '0px', marginLeft: 'auto', marginRight: 'auto', minHeight: '200px'}}>
      <LedgerCard title="Allowed" items={ledger.allowed_claims} kind="pass" />
      <LedgerCard title="Blocked" items={ledger.blocked_claims.length ? ledger.blocked_claims : ['No blocked claim loaded yet.']} kind={ledger.blocked_claims.length ? 'fail' : 'pass'} />
      <LedgerCard title="Verified" items={ledger.verified_claims} kind="pass" />
      <LedgerCard title="Next Proof" items={ledger.required_next_evidence.length ? ledger.required_next_evidence : ['No additional evidence requirement detected.']} kind="warn" />
    </div>
  );
}

function LedgerCard({ title, items, kind }: { title: string; items: string[]; kind: 'pass' | 'warn' | 'fail' }) {
  const cardStyle: CSSProperties = title === 'Allowed'
    ? { marginBottom: '0px', marginTop: '0px', borderRadius: '9px', border: '2px solid rgba(34,197,94,0.3)', paddingTop: '10px', paddingBottom: '10px' }
    : title === 'Next Proof'
    ? { marginBottom: '-15px', marginTop: '-15px', borderRadius: '8px', display: 'flex', alignItems: 'stretch', flexWrap: 'wrap', paddingTop: '10px', paddingBottom: '10px', justifyContent: 'flex-start' }
    : title === 'Verified'
    ? { marginBottom: '3px', marginTop: '3px', borderRadius: '8px', display: 'flex', alignItems: 'stretch', flexWrap: 'wrap', paddingTop: '10px', paddingBottom: '10px', justifyContent: 'flex-start' }
    : title === 'Blocked'
    ? { marginBottom: '-17px', marginTop: '-17px', borderRadius: '8px', display: 'flex', alignItems: 'stretch', flexWrap: 'wrap', paddingTop: '10px', paddingBottom: '10px', justifyContent: 'flex-start' }
    : { marginBottom: '-30px', marginTop: '-30px', borderRadius: '8px', display: 'flex', alignItems: 'stretch', flexWrap: 'wrap', paddingTop: '10px', paddingBottom: '10px', justifyContent: 'flex-start' };
  return <div className={`ledger-card ${kind}`} style={cardStyle}><div className="ledger-card-head"><h3>{title}</h3><span className={`status-dot ${kind}`} /></div><ul className="ledger-list">{items.slice(0, 5).map((item) => <li key={item}>{item}</li>)}</ul>{items.length > 5 && <div className="mono" style={{fontSize: '10px', color: 'var(--gold)', marginTop: '8px', textAlign: 'right'}}>+{items.length - 5} more</div>}</div>;
}

function ProbeSummary({ result }: { result: any | null }) {
  const checks = result?.results ?? [];
  const passed = checks.filter((check: any) => check.status === 'passed').length;
  const failed = checks.filter((check: any) => check.status === 'failed' || check.status === 'not_available').length;
  return <div className="probe-grid"><div className="probe-card"><span className="mono">{checks.length || DEFAULT_CHECKS.length}</span><strong>Fixed checks</strong></div><div className="probe-card pass"><span className="mono">{passed}</span><strong>Passed</strong></div><div className="probe-card fail"><span className="mono">{failed}</span><strong>Failed</strong></div></div>;
}

function ReportWorkspace({ scan, ledger, findings, breakdown, report, busy, onReport, onPdfExport }: any) {
  const [viewRaw, setViewRaw] = useState(false);
  const blockers = findings.filter((f: Finding) => f.severity === 'high').slice(0, 4);

  return (
    <div className="workspace ws-report">
      <section className="card" style={{overflow: 'hidden'}}>
        <div className="card-header">
          <h3 className="card-title">Decision Package</h3>
          <div className="card-actions">
            <button className="btn sm" onClick={() => setViewRaw(!viewRaw)}>{viewRaw ? 'View Report' : 'View Raw Markdown'}</button>
            <button className="btn sm" onClick={onReport} disabled={busy}>Refresh</button>
            <button className="btn sm primary" onClick={onPdfExport} disabled={busy}>Export PDF</button>
          </div>
        </div>
        <div className="card-body no-pad" style={{padding: '24px', overflowY: 'auto'}}>
          {viewRaw ? (
            <pre className="raw-markdown">{report?.markdown || fallbackReport(scan)}</pre>
          ) : (
            <div className="report-doc">
              <h1>Engineering Readiness Report</h1>
              <div className="report-score-row">
                <div className="report-score-big">{scan?.score ?? 0}/100</div>
                <div>
                  <h2 style={{margin: '0 0 8px 0', color: '#111'}}>{scan?.label ?? 'Not checked'}</h2>
                  <p style={{margin: 0, fontSize: '14px', color: '#555'}}>Forge is not certifying benchmark superiority. It is certifying what is verified, risky, or blocked by the evidence.</p>
                </div>
              </div>
              
              <h2>Executive Summary</h2>
              <p>Forge turns CUDA-centered ML repositories and benchmark claims into AMD-readiness evidence packages. Repo Scan is static analysis only; Live Check uses fixed Forge diagnostics; Evidence Replay is never presented as live GPU execution.</p>
              
              <h2>Score Breakdown</h2>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '32px'}}>
                <div style={{background: '#f4f4f4', padding: '16px', borderRadius: '8px'}}><strong>Portability:</strong> {breakdown.portability}/100</div>
                <div style={{background: '#f4f4f4', padding: '16px', borderRadius: '8px'}}><strong>Benchmark Integrity:</strong> {breakdown.benchmark_integrity}/100</div>
                <div style={{background: '#f4f4f4', padding: '16px', borderRadius: '8px'}}><strong>Evidence Completeness:</strong> {breakdown.evidence_completeness}/100</div>
                <div style={{background: '#f4f4f4', padding: '16px', borderRadius: '8px'}}><strong>Claim Discipline:</strong> {breakdown.claim_discipline}/100</div>
              </div>

              <h2>Top Blockers</h2>
              <ul style={{marginBottom: '32px'}}>
                {blockers.length ? blockers.map((f: Finding) => <li key={f.code} style={{marginBottom: '8px'}}><strong>{f.code}</strong>: {f.message}</li>) : <li>No high-severity blockers loaded.</li>}
              </ul>

              <h2>Claim Ledger</h2>
              <p><strong>Allowed Claims:</strong> {ledger?.allowed_claims?.join(', ') || 'None'}</p>
              <p><strong>Blocked Claims:</strong> {ledger?.blocked_claims?.join(', ') || 'None'}</p>
              
              <div style={{marginTop: '48px', borderTop: '1px solid #eee', paddingTop: '16px', fontSize: '12px', color: '#888'}}>
                Generated by Reaper Eagle Forge ML. Repository code was not executed. Live diagnostics are fixed server-side probes only.
              </div>
            </div>
          )}
        </div>
      </section>
      
      <section className="card">
        <div className="card-header"><h3 className="card-title">Appendix: Claim Ledger</h3></div>
        <div className="card-body">
          <ClaimLedgerPanel ledger={ledger} />
        </div>
      </section>
    </div>
  );
}

function scoreClass(score: number) { if (score >= 75) return 'pass'; if (score >= 50) return 'warn'; return 'fail'; }
function fallbackReport(scan: ScanResponse | null) { return `# Reaper Eagle Forge ML Report\n\nOverall Forge Score: ${scan?.score ?? 0}/100\nStatus: ${scan?.label ?? 'not checked'}\n\nRepository code was not executed. Live diagnostics are fixed server-side probes only. Replayed evidence must not be presented as a live GPU claim.`; }
