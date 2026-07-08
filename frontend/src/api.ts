import type { EvidenceReplay, ScanResponse, TopologyGraph } from './types';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, init);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

export async function scanDemoRepo(): Promise<ScanResponse> {
  return fetchJson<ScanResponse>('/api/repo/scan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ use_demo_repo: true })
  });
}

export async function scanRepo(repoUrl: string): Promise<ScanResponse> {
  return fetchJson<ScanResponse>('/api/repo/scan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo_url: repoUrl })
  });
}

export async function runEnvironmentCheck(checks: string[]) {
  return fetchJson('/api/environment/check', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checks })
  });
}

export async function generateReport(payload: unknown) {
  return fetchJson('/api/report/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
}

export async function exportReportPdf(payload: unknown) {
  const response = await fetch(`${API_BASE}/api/report/pdf`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'reaper-eagle-forge-decision-report.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function getEvidenceReplay(): Promise<EvidenceReplay> {
  try { return await fetchJson<EvidenceReplay>('/api/evidence/replay'); }
  catch {
    const [metadata, topology] = await Promise.all([
      fetch('/forge_evidence/run_metadata.json').then((r) => r.json()),
      fetch('/forge_evidence/topology/topology_graph.json').then((r) => r.json())
    ]);
    return { metadata, topology, base_path: '/forge_evidence' };
  }
}

export async function getDemoTopology(): Promise<TopologyGraph> {
  try { return await fetchJson<TopologyGraph>('/api/topology/demo'); }
  catch { return fetch('/forge_evidence/topology/topology_graph.json').then((r) => r.json()); }
}
