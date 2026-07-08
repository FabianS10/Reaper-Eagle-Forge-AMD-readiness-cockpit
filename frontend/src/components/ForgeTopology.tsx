import { useEffect, useMemo, useRef, useState } from 'react';
import type { TopologyGraph, TopologyLink, TopologyNode } from '../types';

const STATUS_LABELS: Record<string, string> = {
  pass: 'PASS', warn: 'WARN', fail: 'FAIL', not_checked: 'N/C', running: 'RUN', replay: 'REPLAY'
};

type GraphMode = 'overview' | 'blockers' | 'benchmark' | 'evidence' | 'all';
type ViewState = { yaw: number; pitch: number; zoom: number; panX: number; panY: number };

interface ForgeTopologyProps { graph?: TopologyGraph | null; variant?: 'overview' | 'workbench' }
interface SpatialNode extends TopologyNode { x3: number; y3: number; z3: number; radius: number }
interface SpatialLink { source: SpatialNode; target: SpatialNode; type: string }
interface ProjectedNode extends SpatialNode { sx: number; sy: number; scale: number; depth: number }

const MODES: Array<{ id: GraphMode; label: string; hint: string }> = [
  { id: 'overview', label: 'overview', hint: 'Clean judge-facing evidence path' },
  { id: 'blockers', label: 'blockers', hint: 'Only blockers and failed evidence' },
  { id: 'benchmark', label: 'benchmark', hint: 'Timing, sync, p50/p95, precision' },
  { id: 'evidence', label: 'evidence', hint: 'Manifest, replay, report chain' },
  { id: 'all', label: 'all', hint: 'Full topology density' }
];

export function ForgeTopology({ graph, variant = 'overview' }: ForgeTopologyProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number; moved: boolean } | null>(null);
  const [view, setView] = useState<ViewState>({ yaw: -0.32, pitch: 0.34, zoom: 1.0, panX: 0, panY: 0 });
  const [mode, setMode] = useState<GraphMode>('overview');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const model = useMemo(() => buildSpatialModel(graph), [graph]);
  const effectiveMode = expanded || variant === 'workbench' ? mode : 'overview';
  const visibleNodes = useMemo(() => filterNodes(model.nodes, model.links, effectiveMode, selectedId), [model.nodes, model.links, effectiveMode, selectedId]);
  const selected = model.nodes.find((node) => node.id === selectedId) ?? visibleNodes.find((node) => node.type === 'zone') ?? null;
  const hovered = model.nodes.find((node) => node.id === hoverId) ?? null;
  const health = useMemo(() => summarizeGraph(model.nodes), [model.nodes]);

  useEffect(() => {
    if (!stageRef.current) return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setDimensions({
        width: Math.max(320, Math.floor(entry.contentRect.width)),
        height: Math.max(240, Math.floor(entry.contentRect.height))
      });
    });
    observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, [expanded]);

  useEffect(() => {
    if (!autoRotate) return undefined;
    let frame = 0; let last = performance.now();
    const tick = (now: number) => {
      const delta = Math.min(34, now - last); last = now;
      setView((current) => ({ ...current, yaw: current.yaw + delta * 0.00036 }));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [autoRotate]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) { if (event.key === 'Escape') setExpanded(false); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const projected = useMemo(() => projectNodes(visibleNodes, view, dimensions), [visibleNodes, view, dimensions]);
  const projectedById = useMemo(() => new Map(projected.map((node) => [node.id, node])), [projected]);

  useEffect(() => {
    let frameId: number;
    const renderLoop = () => {
      drawGraph({ canvas: canvasRef.current, width: dimensions.width, height: dimensions.height, nodes: projected, links: model.links, selectedId, hoverId, mode: effectiveMode, time: performance.now() });
      frameId = requestAnimationFrame(renderLoop);
    };
    frameId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(frameId);
  }, [dimensions, projected, model.links, selectedId, hoverId, effectiveMode]);

  if (!graph || !model.nodes.length) {
    return (
      <section className="card" style={{height: '100%', width: '100%'}}>
        <div className="card-header"><h3 className="card-title">Interactive Evidence Graph</h3><span className="status-pill mono">empty</span></div>
        <div className="card-body no-pad"><div className="graph-skeleton" style={{height: '100%'}}>No topology loaded. Run a scan.</div></div>
      </section>
    );
  }

  function resetView() { setView({ yaw: -0.32, pitch: 0.34, zoom: 1.0, panX: 0, panY: 0 }); setSelectedId(null); }
  function selectNearest(clientX: number, clientY: number) {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const node = nearestProjectedNode(projected, clientX - rect.left, clientY - rect.top);
    setSelectedId(node?.id ?? null);
  }
  function updateHover(clientX: number, clientY: number) {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const node = nearestProjectedNode(projected, clientX - rect.left, clientY - rect.top);
    setHoverId(node?.id ?? null);
  }
  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    canvasRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, yaw: view.yaw, pitch: view.pitch, moved: false };
  }
  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) { updateHover(event.clientX, event.clientY); return; }
    const dx = event.clientX - drag.x; const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    setView((current) => ({ ...current, yaw: drag.yaw + dx * 0.006, pitch: clamp(drag.pitch + dy * 0.004, -0.95, 0.95) }));
  }
  function onPointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current; dragRef.current = null;
    if (!drag?.moved) selectNearest(event.clientX, event.clientY);
  }
  function onWheel(event: React.WheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    setView((current) => ({ ...current, zoom: clamp(current.zoom + direction * 0.08, 0.58, 2.45) }));
  }

  const isExpanded = expanded || variant === 'workbench';

  // Full-Screen Graph Explorer Mode
  if (isExpanded) {
    return (
      <div className="graph-fullscreen" style={{position: 'fixed', inset: 0, background: '#08090a', zIndex: 100, display: 'grid', gridTemplateColumns: '280px 1fr 360px'}}>
        <aside style={{borderRight: '1px solid rgba(255,255,255,0.06)', padding: '24px', background: '#0f1112', overflowY: 'auto'}}>
          <h2 style={{marginTop: 0, marginBottom: '24px'}}>Explorer Controls</h2>
          <div style={{display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '32px'}}>
            {MODES.map((item) => (
              <button key={item.id} className={`nav-item ${effectiveMode === item.id ? 'active' : ''}`} onClick={() => setMode(item.id)} title={item.hint}>
                <span className="nav-title">{item.label}</span>
                <span className="nav-desc">{item.hint}</span>
              </button>
            ))}
          </div>
          <button className={`nav-item ${autoRotate ? 'active' : ''}`} onClick={() => setAutoRotate((v) => !v)}><span className="nav-title">Orbit</span></button>
          <button className="nav-item" onClick={resetView}><span className="nav-title">Reset View</span></button>
        </aside>

        <div style={{display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
          <header style={{height: '56px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 24px', borderBottom: '1px solid rgba(255,255,255,0.06)'}}>
            <h2>Evidence Topology Explorer</h2>
            <button className="btn" onClick={() => setExpanded(false)}>Close Explorer</button>
          </header>
          <div className="graph-stage" ref={stageRef} style={{flex: 1, position: 'relative', background: '#000'}}>
            <canvas ref={canvasRef} style={{width: '100%', height: '100%', display: 'block', cursor: 'grab'}} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerLeave={() => setHoverId(null)} onPointerUp={onPointerUp} onWheel={onWheel} />
            <div style={{position: 'absolute', bottom: '16px', left: '16px', color: '#8a8478', fontSize: '12px', fontFamily: 'monospace'}}>
              {projected.length}/{model.nodes.length} nodes · {health.fail} fail · {health.warn} warn
            </div>
          </div>
        </div>

        <aside style={{borderLeft: '1px solid rgba(255,255,255,0.06)', padding: '24px', background: '#0f1112', overflowY: 'auto'}}>
          <h2 style={{marginTop: 0, marginBottom: '16px'}}>Node Inspector</h2>
          {selected ? <NodeDetail node={selected} /> : <p style={{color: '#8a8478', fontSize: '14px'}}>Click any node to inspect source, status, file, snippet, and next fix.</p>}
        </aside>
      </div>
    );
  }

  // Embedded Mode - card view for live/audit layouts
  return (
    <section className="card" style={{height: '100%', width: '100%', display: 'flex', flexDirection: 'column'}}>
      <div className="card-header" style={{flexShrink: 0}}>
        <h3 className="card-title">Interactive Evidence Graph</h3>
        <button className="btn sm" onClick={() => setExpanded(true)}>Expand Explorer</button>
      </div>
      <div className="card-body no-pad" style={{flex: 1, minHeight: 0, position: 'relative'}}>
        <div className="graph-stage" ref={stageRef} style={{width: '100%', height: '100%', position: 'relative', background: '#000'}}>
          <canvas ref={canvasRef} style={{width: '100%', height: '100%', display: 'block', cursor: 'grab'}} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerLeave={() => setHoverId(null)} onPointerUp={onPointerUp} onWheel={onWheel} />
          <div style={{position: 'absolute', bottom: '16px', left: '16px', color: '#8a8478', fontSize: '12px', fontFamily: 'monospace'}}>
            {projected.length}/{model.nodes.length} nodes · {health.fail} fail · {health.warn} warn
          </div>
        </div>
      </div>
    </section>
  );
}

// --- Math & Drawing Logic ---
function buildSpatialModel(graph?: TopologyGraph | null) {
  if (!graph) return { nodes: [] as SpatialNode[], links: [] as SpatialLink[] };
  const zoneCoords: Record<string, { x: number; y: number; z: number }> = {
    repository: { x: -320, y: 0, z: 28 }, host: { x: -160, y: -185, z: 92 }, amd_runtime: { x: 60, y: -200, z: 60 },
    ml_framework: { x: 12, y: -26, z: 136 }, benchmark: { x: -70, y: 176, z: 72 }, evidence: { x: 240, y: 22, z: 110 }, report: { x: 290, y: 190, z: 34 }
  };
  const zones = graph.nodes.filter((node) => node.type === 'zone');
  const zonePosition = new Map<string, { x: number; y: number; z: number }>();
  zones.forEach((zone, index) => {
    const fallback = zoneCoords[zone.id] ?? { x: Math.cos(index * 0.9) * 260, y: Math.sin(index * 0.9) * 190, z: 40 + (index % 3) * 34 };
    zonePosition.set(zone.id, { x: typeof zone.x === 'number' ? zone.x : fallback.x, y: typeof zone.y === 'number' ? zone.y : fallback.y, z: typeof zone.z === 'number' ? zone.z : typeof zone.fz === 'number' ? zone.fz : fallback.z });
  });
  const childrenByParent = new Map<string, TopologyNode[]>();
  graph.nodes.forEach((node) => {
    if (node.type === 'zone') return;
    const parent = node.parent || node.group || 'repository';
    childrenByParent.set(parent, [...(childrenByParent.get(parent) ?? []), node]);
  });
  const nodes: SpatialNode[] = graph.nodes.map((node) => {
    if (node.type === 'zone') {
      const p = zonePosition.get(node.id) ?? { x: 0, y: 0, z: 0 };
      return { ...node, x3: p.x, y3: p.y, z3: p.z, radius: 24 };
    }
    const parent = node.parent || node.group || 'repository';
    const anchor = zonePosition.get(parent) ?? zoneCoords[parent] ?? { x: 0, y: 0, z: 0 };
    const siblings = childrenByParent.get(parent) ?? [];
    const index = Math.max(0, siblings.findIndex((sibling) => sibling.id === node.id));
    const ring = 82 + Math.floor(index / 8) * 44;
    const angle = (index * 137.508 * Math.PI) / 180;
    const lift = node.status === 'fail' || node.severity === 'high' ? 90 : node.severity === 'medium' ? 52 : node.status === 'replay' ? 72 : 26;
    return { ...node, x3: anchor.x + Math.cos(angle) * ring, y3: anchor.y + Math.sin(angle) * ring * 0.72, z3: anchor.z + lift + (index % 4) * 12, radius: node.status === 'fail' ? 8 : 6 };
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parentLinks = nodes.flatMap((node) => { if (!node.parent) return []; const parent = byId.get(node.parent); return parent ? [{ source: parent, target: node, type: 'parent' }] : []; });
  const explicitLinks = graph.links.flatMap((link) => { const source = byId.get(sourceOf(link)); const target = byId.get(targetOf(link)); return source && target ? [{ source, target, type: link.type }] : []; });
  const dedup = new Map<string, SpatialLink>();
  [...explicitLinks, ...parentLinks].forEach((link) => dedup.set(`${link.source.id}->${link.target.id}`, link));
  return { nodes, links: [...dedup.values()] };
}

function filterNodes(nodes: SpatialNode[], links: SpatialLink[], mode: GraphMode, selectedId: string | null) {
  const zones = nodes.filter((node) => node.type === 'zone');
  const selected = selectedId ? nodes.find((node) => node.id === selectedId) : null;
  const neighborIds = new Set<string>();
  if (selected) links.forEach((link) => { if (link.source.id === selected.id) neighborIds.add(link.target.id); if (link.target.id === selected.id) neighborIds.add(link.source.id); });
  const priority = (node: SpatialNode) => (node.status === 'fail' ? 0 : node.severity === 'high' ? 1 : node.status === 'warn' ? 2 : 3);
  const candidates = nodes.filter((node) => {
    if (node.type === 'zone') return false;
    if (node.id === selectedId || neighborIds.has(node.id)) return true;
    if (mode === 'all') return true;
    if (mode === 'blockers') return node.status === 'fail' || node.severity === 'high';
    if (mode === 'benchmark') return node.group === 'benchmark' || node.parent === 'benchmark';
    if (mode === 'evidence') return ['evidence', 'report'].includes(node.group) || ['evidence', 'report'].includes(node.parent ?? '') || node.status === 'replay';
    return node.status === 'fail' || node.severity === 'high' || ['benchmark', 'evidence', 'report'].includes(node.group);
  }).sort((a, b) => priority(a) - priority(b));
  const limit = mode === 'all' ? 120 : mode === 'overview' ? 11 : 48;
  return [...zones, ...candidates.slice(0, limit)];
}

function projectNodes(nodes: SpatialNode[], view: ViewState, dimensions: { width: number; height: number }): ProjectedNode[] {
  const { width, height } = dimensions;
  const sinY = Math.sin(view.yaw); const cosY = Math.cos(view.yaw); const sinP = Math.sin(view.pitch); const cosP = Math.cos(view.pitch); const perspective = 820;
  const raw = nodes.map((node) => {
    const x1 = node.x3 * cosY - node.z3 * sinY;
    const z1 = node.x3 * sinY + node.z3 * cosY;
    const y1 = node.y3 * cosP - z1 * sinP;
    const z2 = node.y3 * sinP + z1 * cosP;
    const factor = perspective / (perspective + z2 + 240);
    return { node, x: x1 * factor, y: y1 * factor, factor, depth: z2 };
  });
  const minX = Math.min(...raw.map((p) => p.x)); const maxX = Math.max(...raw.map((p) => p.x));
  const minY = Math.min(...raw.map((p) => p.y)); const maxY = Math.max(...raw.map((p) => p.y));
  const modelW = Math.max(1, maxX - minX); const modelH = Math.max(1, maxY - minY);
  const fit = Math.min(width / (modelW + 180), height / (modelH + 140)) * view.zoom;
  const centerX = (minX + maxX) / 2; const centerY = (minY + maxY) / 2;
  return raw.map((p) => ({
    ...p.node,
    sx: width / 2 + (p.x - centerX) * fit + view.panX,
    sy: height / 2 + (p.y - centerY) * fit + view.panY,
    scale: clamp(p.factor * fit * 0.95, 0.42, 2.9),
    depth: p.depth
  })).sort((a, b) => a.depth - b.depth);
}

interface DrawArgs { canvas: HTMLCanvasElement | null; width: number; height: number; nodes: ProjectedNode[]; links: SpatialLink[]; selectedId: string | null; hoverId: string | null; mode: GraphMode; time: number }

function drawGraph(args: DrawArgs) {
  const { canvas, width, height, nodes, links, selectedId, hoverId, mode, time } = args;
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * dpr); canvas.height = Math.floor(height * dpr); canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
  drawBackground(ctx, width, height, mode === 'overview', time);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges = links.flatMap((link) => { const source = byId.get(link.source.id); const target = byId.get(link.target.id); return source && target ? [{ source, target, type: link.type }] : []; });
  edges.sort((a, b) => (a.source.depth + a.target.depth) - (b.source.depth + b.target.depth));
  edges.forEach((edge) => drawEdge(ctx, edge.source, edge.target, edge.type, time));
  nodes.forEach((node) => drawNode(ctx, node, node.id === selectedId, node.id === hoverId, mode === 'overview', time));
}

function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number, overview: boolean, time: number) {
  const pulse = Math.sin(time * 0.001) * 0.05 + 0.95;
  const gradient = ctx.createRadialGradient(width * 0.52, height * 0.44, 30, width * 0.52, height * 0.44, Math.max(width, height) * 0.68);
  gradient.addColorStop(0, `rgba(201, 162, 39, ${0.17 * pulse})`); gradient.addColorStop(0.42, 'rgba(9, 13, 16, 0.74)'); gradient.addColorStop(1, 'rgba(2, 2, 3, 1)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
  ctx.save(); ctx.translate(width / 2, height * 0.63); ctx.scale(1, 0.34); ctx.strokeStyle = 'rgba(201, 162, 39, 0.105)'; ctx.lineWidth = 1;
  const step = overview ? 42 : 34; const gridW = width * 1.4; const gridH = height * 1.05;
  const offset = (time * 0.02) % step;
  for (let x = -gridW - offset; x <= gridW; x += step) { ctx.beginPath(); ctx.moveTo(x, -gridH); ctx.lineTo(x, gridH); ctx.stroke(); }
  for (let y = -gridH - offset; y <= gridH; y += step) { ctx.beginPath(); ctx.moveTo(-gridW, y); ctx.lineTo(gridW, y); ctx.stroke(); }
  ctx.restore();
}

function drawEdge(ctx: CanvasRenderingContext2D, source: ProjectedNode, target: ProjectedNode, type: string, time: number) {
  const alpha = target.status === 'fail' || source.status === 'fail' ? 0.48 : target.status === 'warn' ? 0.32 : 0.22;
  ctx.save(); ctx.strokeStyle = edgeColor(target.status, alpha); ctx.lineWidth = Math.max(0.8, 1.6 * Math.min(source.scale, target.scale)); ctx.globalAlpha = 0.84;
  const midX = (source.sx + target.sx) / 2; const midY = (source.sy + target.sy) / 2 - 18 * Math.max(source.scale, target.scale);
  ctx.beginPath(); ctx.moveTo(source.sx, source.sy); ctx.quadraticCurveTo(midX, midY, target.sx, target.sy); ctx.stroke();
  if (type === 'supports' || type === 'depends_on') drawArrow(ctx, source, target);
  const speed = target.status === 'fail' ? 0.0015 : 0.0008;
  const t = (time * speed) % 1;
  const p1 = { x: source.sx, y: source.sy };
  const p2 = { x: midX, y: midY };
  const p3 = { x: target.sx, y: target.sy };
  const x = (1 - t) * (1 - t) * p1.x + 2 * (1 - t) * t * p2.x + t * t * p3.x;
  const y = (1 - t) * (1 - t) * p1.y + 2 * (1 - t) * t * p2.y + t * t * p3.y;
  ctx.beginPath(); ctx.arc(x, y, 2 * Math.min(source.scale, target.scale), 0, Math.PI * 2);
  ctx.fillStyle = edgeColor(target.status, 1.0); ctx.shadowColor = edgeColor(target.status, 1.0); ctx.shadowBlur = 8; ctx.fill();
  ctx.restore();
}

function drawArrow(ctx: CanvasRenderingContext2D, source: ProjectedNode, target: ProjectedNode) {
  const angle = Math.atan2(target.sy - source.sy, target.sx - source.sx); const size = 6;
  const x = target.sx - Math.cos(angle) * (target.radius * target.scale + 8); const y = target.sy - Math.sin(angle) * (target.radius * target.scale + 8);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(angle - 0.45) * size, y - Math.sin(angle - 0.45) * size); ctx.lineTo(x - Math.cos(angle + 0.45) * size, y - Math.sin(angle + 0.45) * size); ctx.closePath(); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
}

function drawNode(ctx: CanvasRenderingContext2D, node: ProjectedNode, selected: boolean, hovered: boolean, overview: boolean, time: number) {
  const zone = node.type === 'zone'; const base = zone ? 24 : node.radius; const radius = clamp(base * node.scale * (selected ? 1.18 : hovered ? 1.12 : 1), zone ? 18 : 4, zone ? 52 : 17); const color = nodeColor(node.status);
  const pulse = (node.status === 'fail' || node.status === 'warn') ? Math.sin(time * 0.005) * 0.2 + 0.8 : 1;
  
  ctx.save(); ctx.translate(node.sx, node.sy);
  const glow = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius * (zone ? 3.8 : 4.8)); glow.addColorStop(0, `${color}9C`); glow.addColorStop(0.38, `${color}30`); glow.addColorStop(1, `${color}00`);
  ctx.globalAlpha = pulse; ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, radius * (zone ? 3.5 : 4.3), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  
  if (zone) {
    roundRect(ctx, -radius * 2.35, -radius * 0.9, radius * 4.7, radius * 1.8, 14); ctx.fillStyle = 'rgba(13,12,10,0.90)'; ctx.fill(); ctx.lineWidth = selected || hovered ? 2.3 : 1.4; ctx.strokeStyle = selected || hovered ? '#E0BC4A' : color; ctx.stroke();
    ctx.fillStyle = '#F5F1E8'; ctx.font = `900 ${clamp(10.5 * node.scale, 10, 16)}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(compactLabel(node.label, overview ? 20 : 24), 0, -2);
    ctx.font = `700 ${clamp(7 * node.scale, 7, 10)}px ui-monospace, monospace`; ctx.fillStyle = '#B7AA91'; ctx.fillText(STATUS_LABELS[node.status] ?? node.status, 0, radius * 0.58);
  } else {
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fillStyle = 'rgba(9,8,7,0.88)'; ctx.fill(); ctx.lineWidth = selected || hovered ? 2.2 : 1.15; ctx.strokeStyle = selected || hovered ? '#E0BC4A' : color; ctx.stroke(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, Math.max(2.2, radius * 0.36), 0, Math.PI * 2); ctx.fill();
    const shouldLabel = selected || hovered || (!overview && (node.status === 'fail' || node.severity === 'high'));
    if (shouldLabel) drawLabel(ctx, node, radius, selected || hovered);
  }
  ctx.restore();
}

function drawLabel(ctx: CanvasRenderingContext2D, node: ProjectedNode, radius: number, expanded: boolean) {
  ctx.font = `800 ${expanded ? 11 : 9}px ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const label = compactLabel(node.label, expanded ? 30 : 18); const metrics = ctx.measureText(label); const boxW = Math.min(240, metrics.width + 14); const boxH = 22;
  roundRect(ctx, -boxW / 2, radius + 5, boxW, boxH, 8); ctx.fillStyle = 'rgba(7,7,6,0.84)'; ctx.fill(); ctx.strokeStyle = 'rgba(201,162,39,0.30)'; ctx.stroke(); ctx.fillStyle = '#F5F1E8'; ctx.fillText(label, 0, radius + 10);
}

function nearestProjectedNode(nodes: ProjectedNode[], x: number, y: number): ProjectedNode | null {
  let best: ProjectedNode | null = null; let bestDistance = Number.POSITIVE_INFINITY;
  [...nodes].reverse().forEach((node) => {
    const dx = node.sx - x; const dy = node.sy - y; const hitRadius = Math.max(20, node.radius * node.scale * (node.type === 'zone' ? 2.7 : 2.4)); const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance <= hitRadius && distance < bestDistance) { best = node; bestDistance = distance; }
  });
  return best;
}

function NodeDetail({ node }: { node: TopologyNode }) {
  return <div style={{fontSize: '14px', color: '#ccc', lineHeight: '1.6'}}>
    <div style={{marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center'}}>
      <h3 style={{margin: 0, fontSize: '18px', color: '#F5F1E8'}}>{node.label}</h3>
      <span className={`badge ${node.severity ?? node.status}`} style={{padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', fontFamily: 'monospace', border: `1px solid ${nodeColor(node.status)}`, color: nodeColor(node.status)}}>{STATUS_LABELS[node.status] ?? node.status}</span>
    </div>
    <div style={{display: 'grid', gridTemplateColumns: '80px 1fr', gap: '12px', fontFamily: 'monospace', fontSize: '12px', marginBottom: '16px', color: '#8a8478'}}>
      <span>Type</span><span style={{color: '#F5F1E8'}}>{node.type}</span>
      <span>Source</span><span style={{color: '#F5F1E8'}}>{node.source ?? 'unknown'}</span>
      {node.group && <><span>Group</span><span style={{color: '#F5F1E8'}}>{node.group}</span></>}
      {node.file_path && <><span>File</span><span style={{color: '#F5F1E8'}}>{node.file_path}:{node.line_number ?? '?'}</span></>}
    </div>
    {node.message && <p style={{margin: '0 0 16px 0'}}>{node.message}</p>}
    {node.snippet && <pre style={{background: '#000', padding: '12px', borderRadius: '6px', fontSize: '12px', overflowX: 'auto', margin: '0 0 16px 0', color: '#a9a9a9'}}>{node.snippet}</pre>}
    {node.suggestion && <p style={{margin: 0}}><strong style={{color: '#C9A227'}}>Fix:</strong> {node.suggestion}</p>}
  </div>;
}

function summarizeGraph(nodes: SpatialNode[]) { return nodes.reduce((acc, node) => { if (node.status === 'fail') acc.fail += 1; if (node.status === 'warn') acc.warn += 1; if (node.status === 'pass') acc.pass += 1; return acc; }, { fail: 0, warn: 0, pass: 0 }); }
function sourceOf(link: TopologyLink) { return typeof link.source === 'string' ? link.source : link.source.id; }
function targetOf(link: TopologyLink) { return typeof link.target === 'string' ? link.target : link.target.id; }
function nodeColor(status: string) { if (status === 'pass') return '#22C55E'; if (status === 'warn') return '#F97316'; if (status === 'fail') return '#EF4444'; if (status === 'replay') return '#8B5CF6'; if (status === 'running') return '#38BDF8'; return '#C9A227'; }
function edgeColor(status: string, alpha: number) { const color = nodeColor(status); const hex = Math.round(clamp(alpha, 0, 1) * 255).toString(16).padStart(2, '0'); return `${color}${hex}`; }
function compactLabel(label: string, max: number) { const cleaned = label.replace(/^finding_\d+_/i, '').replace(/_/g, ' '); return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned; }
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) { const r = Math.min(radius, width / 2, height / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + width, y, x + width, y + height, r); ctx.arcTo(x + width, y + height, x, y + height, r); ctx.arcTo(x, y + height, x, y, r); ctx.arcTo(x, y, x + width, y, r); ctx.closePath(); }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
