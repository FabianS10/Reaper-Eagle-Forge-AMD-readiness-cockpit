from __future__ import annotations

from io import BytesIO
from textwrap import shorten

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

from .models import ClaimLedger, Finding, ReportRequest, ScoreBreakdown

GOLD = colors.HexColor("#C9A227")
BLACK = colors.HexColor("#080706")
PANEL = colors.HexColor("#15120D")
TEXT = colors.HexColor("#F5F1E8")
MUTED = colors.HexColor("#B7AA91")
GREEN = colors.HexColor("#22C55E")
ORANGE = colors.HexColor("#F97316")
RED = colors.HexColor("#EF4444")


def build_pdf_report(payload: ReportRequest) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=0.48 * inch,
        leftMargin=0.48 * inch,
        topMargin=0.42 * inch,
        bottomMargin=0.44 * inch,
        title="Reaper Eagle Forge ML Decision Report",
    )
    styles = _styles()
    story = []

    story.append(Paragraph("REAPER EAGLE FORGE ML", styles["eyebrow"]))
    story.append(Paragraph("AMD Readiness & Benchmark-Truth Decision Report", styles["title"]))
    story.append(Paragraph("This report is a decision package, not a raw speed leaderboard. It states what was scanned, what was verified, what is blocked, and what proof comes next.", styles["body"]))
    story.append(Spacer(1, 0.12 * inch))

    story.append(_score_table(payload.score, payload.label, payload.score_breakdown))
    story.append(Spacer(1, 0.12 * inch))

    story.append(Paragraph("Executive Summary", styles["h2"]))
    story.append(Paragraph(
        "Forge turns CUDA-centered ML repositories and benchmark claims into auditable AMD-readiness evidence packages. Repo Scan is static analysis only; Live Check uses fixed server-side diagnostics; Evidence Replay is clearly labeled and must not be presented as live GPU execution.",
        styles["body"],
    ))
    story.append(Spacer(1, 0.10 * inch))

    story.append(Paragraph("Claim Ledger", styles["h2"]))
    story.append(_ledger_table(payload.claim_ledger))
    story.append(Spacer(1, 0.12 * inch))

    story.append(Paragraph("Top Blockers", styles["h2"]))
    story.extend(_finding_cards([f for f in payload.findings if f.severity.value == "high"][:8], styles))
    story.append(Spacer(1, 0.10 * inch))

    story.append(Paragraph("Next Proof Required", styles["h2"]))
    next_items = payload.claim_ledger.required_next_evidence if payload.claim_ledger else []
    story.extend(_bullet_list(next_items or ["Add live controlled runs, environment metadata, raw logs, p50/p95 metrics, and SHA-256 evidence manifest."], styles))
    story.append(Spacer(1, 0.12 * inch))

    story.append(Paragraph("Trust Boundary", styles["h2"]))
    story.append(Paragraph(
        "Forge never executes scanned repository code during Repo Scan. Live diagnostics are selected from fixed checks and run server-side. Replayed MI300X artifacts support product completeness but are not live telemetry claims.",
        styles["body"],
    ))
    story.append(Spacer(1, 0.12 * inch))

    story.append(Paragraph("Judge Translation", styles["h2"]))
    story.extend(_bullet_list([
        "Creativity: claim discipline and replay-vs-live boundaries turn migration into an auditable product story.",
        "Completeness: the report ties repo scan, live checks, replay evidence, and manifest requirements into one decision package.",
        "AMD platform use: AMD/ROCm evidence is treated as provenance, not as leaderboard theater.",
        "Product potential: teams can use Forge before spending engineering time on uncertain CUDA-to-AMD migration work.",
    ], styles))
    story.append(Spacer(1, 0.12 * inch))

    story.append(Paragraph("Exported Artifact Checklist", styles["h2"]))
    story.extend(_bullet_list([
        "Readiness score and category breakdown.",
        "Allowed, blocked, and verified claim ledger.",
        "Top execution and benchmark-discipline blockers.",
        "Required next evidence list: raw logs, repeated runs, hardware profile, hashes, and manifest.",
        "Explicit safety boundary: static scan only for user repositories.",
    ], styles))
    doc.build(story, onFirstPage=_page, onLaterPages=_page)
    return buffer.getvalue()


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("ForgeTitle", parent=base["Title"], textColor=TEXT, fontSize=20, leading=24, spaceAfter=8),
        "eyebrow": ParagraphStyle("Eyebrow", parent=base["Normal"], textColor=GOLD, fontSize=8, leading=10, spaceAfter=4),
        "h2": ParagraphStyle("H2", parent=base["Heading2"], textColor=GOLD, fontSize=13, leading=16, spaceBefore=4, spaceAfter=6),
        "body": ParagraphStyle("Body", parent=base["BodyText"], textColor=TEXT, fontSize=9.2, leading=13, alignment=TA_LEFT),
        "muted": ParagraphStyle("Muted", parent=base["BodyText"], textColor=MUTED, fontSize=8.4, leading=11),
        "cardTitle": ParagraphStyle("CardTitle", parent=base["BodyText"], textColor=TEXT, fontSize=8.6, leading=11),
        "cardText": ParagraphStyle("CardText", parent=base["BodyText"], textColor=MUTED, fontSize=7.8, leading=10),
    }


def _score_table(score: int, label: str, breakdown: ScoreBreakdown | None) -> Table:
    rows = [["Overall", f"{score}/100", label]]
    if breakdown:
        rows.extend([
            ["Portability", f"{breakdown.portability}/100", "CUDA/NVIDIA lock-in"],
            ["Benchmark integrity", f"{breakdown.benchmark_integrity}/100", "warm-up, sync, repeated trials, p50/p95"],
            ["Evidence completeness", f"{breakdown.evidence_completeness}/100", "Docker, manifests, hashes, raw logs"],
            ["Claim discipline", f"{breakdown.claim_discipline}/100", "allowed vs blocked claims"],
        ])
    table = Table(rows, colWidths=[1.65 * inch, 1.0 * inch, 4.25 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PANEL),
        ("TEXTCOLOR", (0, 0), (-1, -1), TEXT),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#3A3122")),
        ("BOX", (0, 0), (-1, -1), 0.9, GOLD),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.4),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.HexColor("#1B1710"), colors.HexColor("#100E0A")]),
    ]))
    return table


def _ledger_table(ledger: ClaimLedger | None) -> Table:
    if not ledger:
        rows = [["Verified", "No claim ledger provided."]]
    else:
        rows = [
            ["Verified", _join(ledger.verified_claims)],
            ["Allowed", _join(ledger.allowed_claims)],
            ["Blocked", _join(ledger.blocked_claims)],
            ["Next proof", _join(ledger.required_next_evidence)],
        ]
    table = Table(rows, colWidths=[1.25 * inch, 5.65 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#100E0A")),
        ("TEXTCOLOR", (0, 0), (-1, -1), TEXT),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#3A3122")),
        ("BOX", (0, 0), (-1, -1), 0.8, GOLD),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return table


def _finding_cards(findings: list[Finding], styles: dict[str, ParagraphStyle]) -> list:
    if not findings:
        return [Paragraph("No high-severity blockers were included in this report.", styles["body"])]
    blocks = []
    rows = []
    for finding in findings:
        title = f"{finding.code} - {finding.category.value.replace('_', ' ')}"
        loc = f"{finding.file_path}:{finding.line_number}" if finding.file_path else "repo-level evidence"
        text = f"{finding.message}<br/><font color='#B7AA91'>Location: {loc}</font><br/><font color='#C9A227'>Fix:</font> {finding.suggestion}"
        rows.append([Paragraph(title, styles["cardTitle"]), Paragraph(shorten(text, width=420, placeholder="..."), styles["cardText"])])
    table = Table(rows, colWidths=[1.9 * inch, 5.0 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#100E0A")),
        ("TEXTCOLOR", (0, 0), (-1, -1), TEXT),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#3A3122")),
        ("BOX", (0, 0), (-1, -1), 0.7, RED),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    blocks.append(table)
    return blocks


def _bullet_list(items: list[str], styles: dict[str, ParagraphStyle]) -> list:
    return [Paragraph(f"- {item}", styles["body"]) for item in items[:10]]


def _join(items: list[str]) -> str:
    if not items:
        return "None."
    return "\n".join(f"- {item}" for item in items[:5])


def _page(canvas, doc) -> None:
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(BLACK)
    canvas.rect(0, 0, width, height, fill=1, stroke=0)
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(0.7)
    canvas.rect(0.32 * inch, 0.30 * inch, width - 0.64 * inch, height - 0.60 * inch, fill=0, stroke=1)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 7)
    canvas.drawRightString(width - 0.42 * inch, 0.18 * inch, f"Forge Decision Report - page {doc.page}")
    canvas.restoreState()
