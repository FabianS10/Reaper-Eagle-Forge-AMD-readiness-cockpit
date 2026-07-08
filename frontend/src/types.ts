export type Severity = 'low' | 'medium' | 'high';
export type FindingCategory = 'execution_blocker' | 'portability_gap' | 'benchmark_discipline' | 'evidence_gap' | 'claim_discipline' | 'environment';
export type Status = 'pass' | 'warn' | 'fail' | 'not_checked' | 'running' | 'replay';

export interface Finding {
  code: string;
  category: FindingCategory;
  severity: Severity;
  status: Status;
  file_path?: string | null;
  line_number?: number | null;
  snippet?: string | null;
  message: string;
  suggestion: string;
  evidence?: Record<string, unknown>;
}

export interface ScoreBreakdown {
  overall: number;
  portability: number;
  benchmark_integrity: number;
  evidence_completeness: number;
  claim_discipline: number;
}

export interface ClaimLedger {
  verified_claims: string[];
  allowed_claims: string[];
  blocked_claims: string[];
  required_next_evidence: string[];
}

export interface ScanResponse {
  project_id: string;
  repo_name: string;
  scan_mode: string;
  repo_code_executed: boolean;
  findings: Finding[];
  score: number;
  label: string;
  score_breakdown: ScoreBreakdown;
  claim_ledger: ClaimLedger;
  topology?: TopologyGraph | null;
}

export interface TopologyNode {
  id: string;
  label: string;
  type: 'zone' | 'finding' | 'diagnostic';
  status: Status;
  severity?: Severity | null;
  group: string;
  parent?: string;
  fx?: number;
  fy?: number;
  fz?: number;
  x?: number;
  y?: number;
  z?: number;
  file_path?: string | null;
  line_number?: number | null;
  snippet?: string | null;
  message?: string;
  suggestion?: string;
  raw_output?: string;
  stderr?: string;
  duration_ms?: number;
  evidence_count?: number;
  source?: string;
}

export interface TopologyLink {
  source: string | TopologyNode;
  target: string | TopologyNode;
  type: string;
}

export interface TopologyGraph {
  source_mode: string;
  nodes: TopologyNode[];
  links: TopologyLink[];
}

export interface EvidenceReplay {
  metadata: Record<string, unknown>;
  topology: TopologyGraph;
  base_path?: string;
}
