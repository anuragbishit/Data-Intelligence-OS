"""Executive PDF report.

Renders a completed run as a document a non-technical reader can act on. The
ordering is deliberate: verdict first, then what the model found, then how far
to trust it. A report that buries its caveats behind its numbers is worse than
no report, because it lends unearned confidence.

Charts use ReportLab's own primitives rather than matplotlib -- one fewer
heavy dependency, and no image round-trip.
"""
from __future__ import annotations

from datetime import UTC, datetime
from html import escape
from io import BytesIO
from typing import Any

from reportlab.graphics.charts.barcharts import HorizontalBarChart
from reportlab.graphics.shapes import Drawing, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# Same semantic palette as the interface: colour means something here.
INK = colors.HexColor("#14213A")
INK_SOFT = colors.HexColor("#4A5773")
INK_FAINT = colors.HexColor("#8390A8")
RULE = colors.HexColor("#DDE2EA")
VERIFIED = colors.HexColor("#0F766E")
WEAK = colors.HexColor("#A4600A")
FAILED = colors.HexColor("#A81C40")
PAPER = colors.HexColor("#F6F7F9")

VERDICT_COLOUR = {"strong": VERIFIED, "acceptable": VERIFIED, "weak": WEAK}
VERDICT_WORDS = {
    "strong": "This model is reliable enough to act on.",
    "acceptable": "This model is usable, with the caveats below.",
    "weak": "This model is not reliable enough for decisions.",
}


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "title", parent=base["Title"], fontName="Helvetica-Bold",
            fontSize=20, leading=24, textColor=INK, alignment=TA_LEFT, spaceAfter=2,
        ),
        "subtitle": ParagraphStyle(
            "subtitle", parent=base["Normal"], fontName="Helvetica",
            fontSize=9.5, textColor=INK_FAINT, spaceAfter=14,
        ),
        "heading": ParagraphStyle(
            "heading", parent=base["Heading2"], fontName="Helvetica-Bold",
            fontSize=8.5, leading=11, textColor=INK_FAINT, spaceBefore=16,
            spaceAfter=6, letterSpacing=1.1,
        ),
        "body": ParagraphStyle(
            "body", parent=base["Normal"], fontName="Helvetica",
            fontSize=10, leading=15, textColor=INK, spaceAfter=8,
        ),
        "soft": ParagraphStyle(
            "soft", parent=base["Normal"], fontName="Helvetica",
            fontSize=9, leading=13, textColor=INK_SOFT, spaceAfter=5,
        ),
        "note": ParagraphStyle(
            "note", parent=base["Normal"], fontName="Helvetica-Oblique",
            fontSize=8.5, leading=12, textColor=INK_FAINT,
        ),
    }


def _rule() -> HRFlowable:
    return HRFlowable(width="100%", thickness=0.6, color=RULE,
                      spaceBefore=4, spaceAfter=10)


# Long strings in a ReportLab table cell do NOT wrap -- they run past the
# column and are clipped at the page margin. Anything that might be long has
# to become a Paragraph, which does wrap.
_CELL = ParagraphStyle(
    "cell", fontName="Helvetica", fontSize=8.5, leading=11.5, textColor=INK,
)
_CELL_HEAD = ParagraphStyle(
    "cellhead", parent=_CELL, fontName="Helvetica-Bold", textColor=INK_FAINT,
)
WRAP_THRESHOLD = 28


def _cell(value: str, header: bool = False) -> Any:
    text = str(value)
    if len(text) <= WRAP_THRESHOLD and not header:
        return text
    return Paragraph(text, _CELL_HEAD if header else _CELL)


def _table(
    rows: list[list[str]],
    widths: list[float],
    align_right: list[int] | None = None,
) -> Table:
    wrapped = [[_cell(c, header=(i == 0)) for c in row] for i, row in enumerate(rows)]
    table = Table(wrapped, colWidths=widths, hAlign="LEFT")
    style = [
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("TEXTCOLOR", (0, 0), (-1, 0), INK_FAINT),
        ("TEXTCOLOR", (0, 1), (-1, -1), INK),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, RULE),
        ("LINEBELOW", (0, 1), (-1, -2), 0.4, RULE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]
    for col in align_right or []:
        style.append(("ALIGN", (col, 0), (col, -1), "RIGHT"))
    table.setStyle(TableStyle(style))
    return table


def _scenario_number(value: Any, digits: int = 3) -> str:
    if value is None:
        return "not available"
    try:
        return f"{float(value):,.{digits}f}"
    except (TypeError, ValueError):
        return escape(str(value))


def _scenario_signed(value: Any, suffix: str, digits: int = 2) -> str:
    if value is None:
        return "not available"
    number = float(value)
    return f"{number:+,.{digits}f}{suffix}"


def _scenario_section(
    scenario: dict[str, Any] | None,
    training: dict[str, Any],
    quality: dict[str, Any],
    styles: dict[str, ParagraphStyle],
    content_width: float,
) -> list[Any]:
    """Render the latest persisted What-if calculation, never a new prediction."""
    story: list[Any] = [
        Paragraph("WHAT-IF SCENARIO ANALYSIS", styles["heading"]),
        _rule(),
    ]
    if not isinstance(scenario, dict) or not scenario:
        story.append(Paragraph(
            "No What-if scenario has been run for this analysis.", styles["soft"]
        ))
        return story

    feature_change = scenario.get("feature_change") or {}
    task_type = scenario.get("task_type")
    feature = escape(str(feature_change.get("feature") or "unknown feature"))
    operation = str(feature_change.get("operation") or "changed")
    value = escape(str(feature_change.get("requested_value", "not recorded")))
    operation_labels = {
        "increase_percent": "increased by",
        "decrease_percent": "decreased by",
        "add": "increased by",
        "subtract": "decreased by",
        "multiply": "multiplied by",
        "divide": "divided by",
        "set": "set to",
    }
    suffix = "%" if operation.endswith("percent") else ""
    story.append(Paragraph(
        f"<b>Scenario:</b> {feature} "
        f"{escape(operation_labels.get(operation, operation))} {value}{suffix}.",
        styles["body"],
    ))

    baseline = scenario.get("baseline_result") or {}
    changed = scenario.get("scenario_result") or {}
    impact = scenario.get("impact") or {}
    scope = scenario.get("data_scope") or {}

    if task_type == "classification":
        baseline_classes = baseline.get("predicted_class_distribution") or []
        scenario_classes = changed.get("predicted_class_distribution") or []
        class_changes = impact.get("class_distribution_changes") or []
        rows = [["Predicted class", "Baseline", "Scenario", "Rate change"]]
        for change in class_changes:
            label = change.get("class")
            before = next(
                (item for item in baseline_classes if item.get("class") == label), {}
            )
            after = next(
                (item for item in scenario_classes if item.get("class") == label), {}
            )
            rows.append([
                escape(str(label)),
                f"{int(before.get('count', 0)):,} ({_scenario_number(before.get('rate_percent'), 2)}%)",
                f"{int(after.get('count', 0)):,} ({_scenario_number(after.get('rate_percent'), 2)}%)",
                f"{_scenario_signed(change.get('absolute_change_percentage_points'), ' pp')}"
                + (
                    f"; {_scenario_signed(change.get('percentage_change'), '%')} relative"
                    if change.get("percentage_change") is not None else ""
                ),
            ])
        if len(rows) == 1:
            story.append(Paragraph(
                "Class-distribution values were not present in the saved scenario result.",
                styles["soft"],
            ))
        else:
            story.append(_table(
                rows,
                [31 * mm, 39 * mm, 39 * mm, content_width - 109 * mm],
            ))
        focus_class = impact.get("focus_class")
        if focus_class is not None:
            story.append(Spacer(1, 6))
            story.append(Paragraph(
                f"Predicted class {escape(str(focus_class))} changed from "
                f"{_scenario_number(impact.get('baseline_focus_class_rate_percent'), 2)}% "
                f"to {_scenario_number(impact.get('scenario_focus_class_rate_percent'), 2)}% "
                f"({_scenario_signed(impact.get('absolute_change_percentage_points'), ' percentage points')}; "
                f"{_scenario_signed(impact.get('percentage_change'), '%')} relative where defined).",
                styles["soft"],
            ))
        story.append(Paragraph(
            f"Changed predictions: {int(impact.get('changed_prediction_count', 0)):,} "
            f"of {int(scope.get('rows_evaluated', 0)):,} evaluated rows "
            f"({_scenario_number(impact.get('changed_prediction_rate_percent'), 2)}%).",
            styles["soft"],
        ))
    elif task_type == "regression":
        rows = [["Prediction", "Baseline", "Scenario"]]
        for label, key in (
            ("Mean", "mean_prediction"),
            ("Median", "median_prediction"),
            ("Minimum", "minimum_prediction"),
            ("Maximum", "maximum_prediction"),
        ):
            if key in baseline or key in changed:
                rows.append([
                    label,
                    _scenario_number(baseline.get(key), 6),
                    _scenario_number(changed.get(key), 6),
                ])
        story.append(_table(rows, [45 * mm, 55 * mm, content_width - 100 * mm]))
        story.append(Spacer(1, 5))
        story.append(Paragraph(
            f"Absolute change in mean prediction: "
            f"{_scenario_number(impact.get('absolute_change'), 6)}; "
            f"percentage change: "
            f"{_scenario_number(impact.get('percentage_change'), 3) + '%' if impact.get('percentage_change') is not None else 'not defined from a zero baseline'}.",
            styles["soft"],
        ))
        story.append(Paragraph(
            f"Changed predictions: {int(impact.get('changed_prediction_count', 0)):,} "
            f"of {int(scope.get('rows_evaluated', 0)):,} evaluated rows "
            f"({_scenario_number(impact.get('changed_prediction_rate_percent'), 2)}%).",
            styles["soft"],
        ))
    else:
        story.append(Paragraph(
            "The saved scenario task type is unavailable; detailed prediction values were omitted.",
            styles["soft"],
        ))

    feature_baseline = feature_change.get("baseline") or {}
    feature_scenario = feature_change.get("scenario") or {}
    story.append(Spacer(1, 5))
    evidence = (
        f"Supporting evidence: {int(feature_change.get('rows_changed', 0)):,} feature values changed "
        f"({_scenario_number(feature_change.get('changed_rate_percent'), 2)}%); "
        f"{int(scope.get('rows_evaluated', 0)):,} paired rows were evaluated."
    )
    if feature_baseline.get("kind") == "numeric":
        evidence += (
            f" {feature} mean changed from "
            f"{_scenario_number(feature_baseline.get('mean'))} to "
            f"{_scenario_number(feature_scenario.get('mean'))}."
        )
    if scope.get("sampled"):
        evidence += (
            f" Predictions were sampled from {int(scope.get('rows_scanned', 0)):,} scanned rows."
        )
    if scope.get("row_read_limit_reached"):
        evidence += (
            f" The {int(scope.get('row_read_limit', 0)):,}-row read limit was reached."
        )
    story.append(Paragraph(escape(evidence), styles["note"]))

    model_name = training.get("best_model") or "saved model"
    verdict = quality.get("verdict") or "not available"
    story.append(Paragraph(
        f"Model used: {escape(str(model_name))}; quality verdict: {escape(str(verdict))}.",
        styles["note"],
    ))
    recommendation = scenario.get("ai_recommendation")
    explanation = scenario.get("ai_explanation")
    story.append(Spacer(1, 6))
    story.append(Paragraph("AI INTERPRETATION (NOT A CALCULATED RESULT)", styles["soft"]))
    story.append(Paragraph(
        escape(str(recommendation or "No AI recommendation was returned for this scenario.")),
        styles["soft"],
    ))
    if explanation:
        story.append(Paragraph(escape(str(explanation)), styles["soft"]))
    return story


def _importance_chart(features: list[dict[str, Any]], width: float) -> Drawing:
    """Horizontal bars, strongest at the top."""
    top = features[:8]
    values = [f["importance"] for f in top]
    labels = [f["feature"][:26] for f in top]
    height = 22 * len(top) + 26

    drawing = Drawing(width, height)
    chart = HorizontalBarChart()
    chart.x, chart.y = 118, 12
    chart.width, chart.height = width - 140, height - 24
    # Reversed: ReportLab draws the first series entry at the bottom.
    chart.data = [list(reversed(values))]
    chart.categoryAxis.categoryNames = list(reversed(labels))
    chart.categoryAxis.labels.fontName = "Helvetica"
    chart.categoryAxis.labels.fontSize = 8
    chart.categoryAxis.labels.fillColor = INK_SOFT
    chart.categoryAxis.labels.boxAnchor = "e"
    chart.categoryAxis.labels.dx = -4
    chart.categoryAxis.strokeColor = RULE
    chart.valueAxis.visible = False
    chart.valueAxis.valueMin = 0
    chart.valueAxis.valueMax = max(values) * 1.08 if values else 1
    chart.bars[0].fillColor = VERIFIED
    chart.bars[0].strokeColor = None
    chart.barSpacing = 3
    chart.groupSpacing = 6
    drawing.add(chart)

    # Print each value at the end of its bar: a reader should not have to
    # estimate a magnitude from bar length alone.
    span = chart.valueAxis.valueMax or 1
    for index, value in enumerate(reversed(values)):
        rows_count = len(values)
        slot = chart.height / rows_count
        y = chart.y + slot * index + slot / 2 - 3
        x = chart.x + (value / span) * chart.width + 4
        drawing.add(String(x, y, f"{value:.4f}", fontName="Helvetica",
                           fontSize=7, fillColor=INK_FAINT))
    return drawing


def _kv_row(label: str, value: str, styles) -> Table:
    return _table([[label, value]], [70 * mm, 90 * mm])


def build_report(
    project_name: str,
    run: dict[str, Any],
    experiments: list[dict[str, Any]],
    generated_at: datetime | None = None,
) -> bytes:
    """Render a run to PDF bytes. Blocking -- run in a thread."""
    styles = _styles()
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=18 * mm, bottomMargin=18 * mm,
        title=f"{project_name} — analysis report",
        author="Autonomous Data Analyst",
    )
    content_width = doc.width
    story: list[Any] = []

    quality = run.get("quality") or {}
    training = run.get("training") or {}
    explanation = run.get("explanation") or {}
    cleaning = run.get("cleaning") or {}
    attempts = run.get("attempts") or []
    reflection = run.get("reflection") or {}
    stamp = (generated_at or datetime.now(UTC)).strftime("%d %B %Y, %H:%M UTC")

    # ---- header -----------------------------------------------------------
    story.append(Paragraph(project_name, styles["title"]))
    story.append(Paragraph(
        f"Predicting <b>{training.get('target_column', 'unknown')}</b> · "
        f"{training.get('task_type', '')} · generated {stamp}",
        styles["subtitle"],
    ))

    # ---- verdict, stated before any number --------------------------------
    verdict = quality.get("verdict", "weak")
    colour = VERDICT_COLOUR.get(verdict, WEAK)
    banner = Table(
        [[Paragraph(
            f'<font color="{colour.hexval()}" size="11"><b>{verdict.upper()}</b></font>'
            f'<br/><font color="{INK.hexval()}" size="9.5">{VERDICT_WORDS.get(verdict, "")}</font>',
            styles["body"],
        )]],
        colWidths=[content_width],
    )
    banner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PAPER),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LINEBEFORE", (0, 0), (0, -1), 2.5, colour),
    ]))
    story.append(banner)
    story.append(Spacer(1, 14))

    # ---- summary ----------------------------------------------------------
    if run.get("summary"):
        story.append(Paragraph("SUMMARY", styles["heading"]))
        story.append(_rule())
        story.append(Paragraph(run["summary"], styles["body"]))

    # ---- leakage, if any: this outranks everything else --------------------
    leaked = training.get("leaked_features") or []
    if leaked:
        story.append(Paragraph("COLUMNS REMOVED BEFORE MODELLING", styles["heading"]))
        story.append(_rule())
        story.append(Paragraph(
            "These columns restated the answer. Left in, they would have produced "
            "a perfect score and taught the model nothing. Every figure in this "
            "report comes from a model trained without them.",
            styles["soft"],
        ))
        story.append(_table(
            [["Column", "Why"]] + [[f["column"], f["reason"]] for f in leaked],
            [40 * mm, content_width - 40 * mm],
        ))

    derived = training.get("additive_leakage")
    if derived:
        story.append(Paragraph("THE TARGET IS DERIVED FROM ITS OWN COLUMNS", styles["heading"]))
        story.append(_rule())
        story.append(Paragraph(derived["reason"], styles["body"]))
        story.append(_table(
            [["Column", "Coefficient"]]
            + [[c["column"], f"{c['coefficient']:.4f}"] for c in derived["contributors"]],
            [50 * mm, 30 * mm], align_right=[1],
        ))
        story.append(Spacer(1, 4))
        story.append(Paragraph(
            "Coefficients close to 1.0 indicate the target is a sum. Remove the "
            "component columns, or predict something that is not derived from them.",
            styles["note"],
        ))

    # ---- what drove predictions -------------------------------------------
    features = explanation.get("features") or []
    if features:
        block = [
            Paragraph("WHAT DROVE THE PREDICTIONS", styles["heading"]),
            _rule(),
            _importance_chart(features, content_width),
            Spacer(1, 4),
            Paragraph(
                explanation.get("note")
                or f"Measured with {explanation.get('method')}.",
                styles["note"],
            ),
        ]
        story.append(KeepTogether(block))

    # ---- how far to trust it ----------------------------------------------
    story.append(Paragraph("HOW FAR TO TRUST THIS", styles["heading"]))
    story.append(_rule())
    checks = quality.get("checks") or []
    if checks:
        story.append(_table(
            [["Check", "Result", "Detail"]]
            # A non-gating check that did not pass found something and it was
            # handled -- reporting that as "fail" makes a good outcome read as
            # a bad one.
            + [[c["name"].replace("_", " "),
                "pass" if c["passed"]
                else ("fail" if c.get("gating", True) else "found"),
                c["detail"]] for c in checks],
            [30 * mm, 16 * mm, content_width - 46 * mm],
        ))
    if quality.get("dead_features"):
        story.append(Spacer(1, 6))
        story.append(Paragraph(
            "Contributed almost nothing: "
            + ", ".join(quality["dead_features"]),
            styles["soft"],
        ))

    story.append(PageBreak())

    # ---- method -----------------------------------------------------------
    story.append(Paragraph("HOW THIS WAS PRODUCED", styles["heading"]))
    story.append(_rule())

    if cleaning.get("changed"):
        story.append(Paragraph("Cleaning applied first:", styles["soft"]))
        story.append(_table(
            [["Action", "Rows", "Columns"]]
            + [[a["action"].replace("_", " "),
                str(a["rows_affected"] or "—"),
                ", ".join(a["columns"]) or "—"] for a in cleaning["actions"]],
            [45 * mm, 20 * mm, content_width - 65 * mm], align_right=[1],
        ))
        story.append(Spacer(1, 10))

    story.append(_table(
        [["", ""],
         ["Rows used",
          f"{training.get('n_train', 0):,} train / "
          f"{training.get('n_test', 0):,} test"],
         ["Features", str(len(training.get("features_used") or []))],
         ["Columns excluded", str(len(training.get("features_dropped") or []))],
         ["Best model", str(training.get("best_model") or "—")]],
        [45 * mm, content_width - 45 * mm],
    ))

    if experiments:
        story.append(Spacer(1, 12))
        story.append(Paragraph("Models compared:", styles["soft"]))
        story.append(_table(
            [["Model", "Score", "Seconds", ""]]
            + [[e["model_name"],
                f"{e.get('primary_metric','')} {e.get('primary_metric_value', 0):.4f}",
                f"{e.get('train_seconds') or 0:.2f}",
                "chosen" if e.get("is_selected") else ""]
               for e in experiments],
            [45 * mm, 35 * mm, 22 * mm, content_width - 102 * mm], align_right=[2],
        ))

    if len(attempts) > 1:
        story.append(Spacer(1, 12))
        story.append(Paragraph(
            "The system judged its first result and tried again:", styles["soft"]))
        story.append(_table(
            [["Round", "Excluded", "Decided on"]]
            + [[str(a["round"]),
                ", ".join(a["excluded_features"]) or "—",
                f"{a.get('gate_metric', '')} "
                f"{a.get('gate_value', a['primary_metric_value']):.4f}"]
               for a in attempts],
            [18 * mm, content_width - 60 * mm, 42 * mm],
        ))

    if reflection.get("reasoning"):
        story.append(Spacer(1, 12))
        story.append(Paragraph("Why it stopped:", styles["soft"]))
        story.append(Paragraph(reflection["reasoning"], styles["body"]))

    story.extend(_scenario_section(
        run.get("latest_scenario"), training, quality, styles, content_width
    ))

    # ---- limits, stated plainly -------------------------------------------
    story.append(Paragraph("LIMITS OF THIS ANALYSIS", styles["heading"]))
    story.append(_rule())
    limits = [
        "Feature importance shows association, not cause. A column that predicts "
        "an outcome does not necessarily influence it.",
        "Scores are measured on data held back from training, but they describe "
        "this dataset. Performance on new data may differ.",
    ]
    if training.get("sampled_from"):
        limits.insert(0, (
            f"{training['sampled_from']:,} rows were sampled down to "
            f"{training.get('n_train', 0) + training.get('n_test', 0):,} to keep "
            "the analysis interactive."
        ))
    if verdict == "weak":
        limits.insert(0, "The quality checks below did not pass. Do not base "
                         "decisions on this model without addressing them.")
    for limit in limits:
        story.append(Paragraph(f"— {limit}", styles["soft"]))

    doc.build(story)
    return buffer.getvalue()
