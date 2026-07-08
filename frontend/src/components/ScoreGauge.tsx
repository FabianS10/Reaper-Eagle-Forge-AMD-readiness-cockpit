interface ScoreGaugeProps {
  score: number;
}

function statusColor(score: number): string {
  if (score >= 70) return 'var(--status-pass)';
  if (score >= 50) return 'var(--status-warn)';
  return 'var(--status-fail)';
}

export function ScoreGauge({ score }: ScoreGaugeProps) {
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, score)) / 100) * circumference;
  
  return (
    <div className="score-wrap" style={{position: 'relative', width: '160px', height: '160px'}}>
      <svg className="score-svg" viewBox="0 0 160 160" style={{transform: 'rotate(-90deg)'}}>
        <defs>
          <linearGradient id="gradScore" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#C9A227" />
            <stop offset="100%" stopColor="#E0BC4A" />
          </linearGradient>
          <filter id="glowScore" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx="80" cy="80" r={radius} fill="none" stroke="#2E2A20" strokeWidth="10" />
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke="url(#gradScore)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          filter="url(#glowScore)"
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column'}}>
        <span className="mono" style={{fontSize: '32px', fontWeight: 800, color: statusColor(score), textShadow: '0 0 15px rgba(201, 162, 39, 0.5)'}}>{score}</span>
      </div>
    </div>
  );
}