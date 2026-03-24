from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
import re
from typing import Iterable

import fitz


FORMULA_SAFE_RETRY_PROFILE: dict[str, bool | float] = {
    "split_short_lines": True,
    "disable_rich_text_translate": True,
    "no_remove_non_formula_lines": True,
    "skip_formula_offset_calculation": True,
    "non_formula_line_iou_threshold": 0.97,
    "figure_table_protection_threshold": 0.97,
}

MAX_ANALYSIS_PAGES = 6
SHORT_LINE_MAX_LENGTH = 36

CJK_RE = re.compile(r"[\u3400-\u9fff]")
ISOLATED_LATIN_TOKEN_RE = re.compile(r"\b[A-Za-z]\b")
MATH_SYMBOL_RE = re.compile(r"[=+\-*/^~≈≠≤≥<>∈∑∫√πθλμσΩωβγδτ→←]")
FORMULA_HINT_RE = re.compile(
    r"(\b[A-Za-z]\b\s*[=∈+\-]|\bR\^[A-Za-z0-9]+|[A-Za-z]\(|\)\s*[A-Za-z]|\[[A-Za-z0-9]+\])"
)
REPEATED_ISOLATED_TOKEN_RE = re.compile(r"(?:\b[A-Za-z]\b\W*){4,}")
BROKEN_TOKEN_CLUSTER_RE = re.compile(r"(?:\b[A-Za-z]\b\s*[,，]\s*){2,}")


@dataclass(frozen=True)
class PdfTextMetrics:
    line_count: int = 0
    cjk_line_count: int = 0
    short_line_ratio: float = 0.0
    formula_like_ratio: float = 0.0
    mixed_fragment_ratio: float = 0.0
    suspicious_fragment_count: int = 0
    isolated_latin_density: float = 0.0

    def to_log_dict(self) -> dict[str, int | float]:
        data = asdict(self)
        for key in (
            "short_line_ratio",
            "formula_like_ratio",
            "mixed_fragment_ratio",
            "isolated_latin_density",
        ):
            data[key] = round(float(data[key]), 4)
        return data


@dataclass(frozen=True)
class FormulaSafeRetryDecision:
    should_retry: bool
    reason: str
    input_metrics: PdfTextMetrics
    output_metrics: PdfTextMetrics

    def to_log_dict(self) -> dict[str, object]:
        return {
            "should_retry": self.should_retry,
            "reason": self.reason,
            "input_metrics": self.input_metrics.to_log_dict(),
            "output_metrics": self.output_metrics.to_log_dict(),
        }


def _normalize_line(line: str) -> str:
    return re.sub(r"\s+", " ", (line or "").strip())


def _clamp_zero_to_one(value: object) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(parsed, 1.0))


def _iter_page_numbers(
    page_spec: str | None,
    *,
    page_count: int,
    max_pages: int = MAX_ANALYSIS_PAGES,
) -> list[int]:
    if page_count <= 0:
        return []

    if not page_spec:
        return list(range(min(page_count, max_pages)))

    selected: list[int] = []
    seen: set[int] = set()
    for raw_chunk in str(page_spec).split(","):
        chunk = raw_chunk.strip()
        if not chunk:
            continue

        if "-" in chunk:
            start_raw, end_raw = chunk.split("-", 1)
            try:
                start = int(start_raw)
                end = int(end_raw)
            except ValueError:
                continue
            if start <= 0 or end <= 0:
                continue
            lower = min(start, end)
            upper = max(start, end)
            for page_index in range(lower - 1, upper):
                if 0 <= page_index < page_count and page_index not in seen:
                    selected.append(page_index)
                    seen.add(page_index)
                    if len(selected) >= max_pages:
                        return selected
            continue

        try:
            page_index = int(chunk) - 1
        except ValueError:
            continue
        if 0 <= page_index < page_count and page_index not in seen:
            selected.append(page_index)
            seen.add(page_index)
            if len(selected) >= max_pages:
                return selected

    return selected or list(range(min(page_count, max_pages)))


def extract_pdf_lines(
    pdf_path: str | Path,
    *,
    page_spec: str | None = None,
    max_pages: int = MAX_ANALYSIS_PAGES,
) -> list[str]:
    path = Path(pdf_path)
    if not path.exists():
        return []

    try:
        document = fitz.open(path)
    except Exception:
        return []

    try:
        page_numbers = _iter_page_numbers(page_spec, page_count=document.page_count, max_pages=max_pages)
        lines: list[str] = []
        for page_number in page_numbers:
            page = document.load_page(page_number)
            for raw_line in page.get_text("text", sort=True).splitlines():
                normalized = _normalize_line(raw_line)
                if normalized:
                    lines.append(normalized)
        return lines
    finally:
        document.close()


def analyze_text_lines(lines: Iterable[str]) -> PdfTextMetrics:
    normalized_lines = [_normalize_line(line) for line in lines]
    normalized_lines = [line for line in normalized_lines if line]
    if not normalized_lines:
        return PdfTextMetrics()

    short_line_count = 0
    formula_like_count = 0
    cjk_line_count = 0
    suspicious_fragment_count = 0
    isolated_latin_total = 0

    for line in normalized_lines:
        isolated_latin_count = len(ISOLATED_LATIN_TOKEN_RE.findall(line))
        math_symbol_count = len(MATH_SYMBOL_RE.findall(line))
        has_cjk = bool(CJK_RE.search(line))
        is_short_line = 0 < len(line) <= SHORT_LINE_MAX_LENGTH
        looks_formula_like = math_symbol_count >= 1 and (
            isolated_latin_count >= 2 or is_short_line or bool(FORMULA_HINT_RE.search(line))
        )
        looks_suspicious_fragment = has_cjk and isolated_latin_count >= 4 and (
            is_short_line
            or math_symbol_count >= 2
            or bool(REPEATED_ISOLATED_TOKEN_RE.search(line))
            or bool(BROKEN_TOKEN_CLUSTER_RE.search(line))
        )

        if is_short_line:
            short_line_count += 1
        if looks_formula_like:
            formula_like_count += 1
        if has_cjk:
            cjk_line_count += 1
        if looks_suspicious_fragment:
            suspicious_fragment_count += 1
        isolated_latin_total += isolated_latin_count

    line_count = len(normalized_lines)
    mixed_fragment_denominator = cjk_line_count or line_count

    return PdfTextMetrics(
        line_count=line_count,
        cjk_line_count=cjk_line_count,
        short_line_ratio=short_line_count / line_count,
        formula_like_ratio=formula_like_count / line_count,
        mixed_fragment_ratio=suspicious_fragment_count / mixed_fragment_denominator,
        suspicious_fragment_count=suspicious_fragment_count,
        isolated_latin_density=isolated_latin_total / line_count,
    )


def analyze_pdf_text_metrics(
    pdf_path: str | Path,
    *,
    page_spec: str | None = None,
    max_pages: int = MAX_ANALYSIS_PAGES,
) -> PdfTextMetrics:
    return analyze_text_lines(extract_pdf_lines(pdf_path, page_spec=page_spec, max_pages=max_pages))


def is_formula_dense_input(metrics: PdfTextMetrics) -> bool:
    if metrics.line_count < 8:
        return False

    return (
        metrics.formula_like_ratio >= 0.1 and metrics.isolated_latin_density >= 0.6
    ) or (
        metrics.formula_like_ratio >= 0.07
        and metrics.short_line_ratio >= 0.2
        and metrics.isolated_latin_density >= 0.85
    )


def decide_formula_safe_retry(
    input_metrics: PdfTextMetrics,
    output_metrics: PdfTextMetrics,
) -> FormulaSafeRetryDecision:
    if not is_formula_dense_input(input_metrics):
        return FormulaSafeRetryDecision(
            should_retry=False,
            reason="input-not-formula-dense",
            input_metrics=input_metrics,
            output_metrics=output_metrics,
        )

    short_line_delta = output_metrics.short_line_ratio - input_metrics.short_line_ratio
    isolated_density_delta = output_metrics.isolated_latin_density - input_metrics.isolated_latin_density
    suspicious_output = output_metrics.cjk_line_count > 0 and (
        (
            output_metrics.suspicious_fragment_count >= 3
            and output_metrics.mixed_fragment_ratio >= 0.12
            and isolated_density_delta >= 0.2
        )
        or (
            output_metrics.suspicious_fragment_count >= 2
            and short_line_delta >= 0.08
            and isolated_density_delta >= 0.45
        )
        or (
            output_metrics.mixed_fragment_ratio >= 0.18
            and isolated_density_delta >= 0.6
        )
    )

    if not suspicious_output:
        return FormulaSafeRetryDecision(
            should_retry=False,
            reason="output-looks-stable",
            input_metrics=input_metrics,
            output_metrics=output_metrics,
        )

    reasons: list[str] = []
    if output_metrics.suspicious_fragment_count >= 3:
        reasons.append("fragmented-inline-math")
    if short_line_delta >= 0.08:
        reasons.append("short-lines-increased")
    if isolated_density_delta >= 0.45:
        reasons.append("isolated-latin-density-increased")

    return FormulaSafeRetryDecision(
        should_retry=True,
        reason=",".join(reasons) or "formula-dense-layout-degraded",
        input_metrics=input_metrics,
        output_metrics=output_metrics,
    )


def retry_profile_already_applied(pdf_kwargs: dict[str, object] | None) -> bool:
    current = dict(pdf_kwargs or {})

    for key in (
        "split_short_lines",
        "disable_rich_text_translate",
        "no_remove_non_formula_lines",
        "skip_formula_offset_calculation",
    ):
        if current.get(key) is not True:
            return False

    if _clamp_zero_to_one(current.get("non_formula_line_iou_threshold")) < float(
        FORMULA_SAFE_RETRY_PROFILE["non_formula_line_iou_threshold"]
    ):
        return False
    if _clamp_zero_to_one(current.get("figure_table_protection_threshold")) < float(
        FORMULA_SAFE_RETRY_PROFILE["figure_table_protection_threshold"]
    ):
        return False

    return True


def build_formula_safe_retry_pdf_kwargs(
    pdf_kwargs: dict[str, object] | None,
) -> dict[str, object]:
    merged = dict(pdf_kwargs or {})

    for key, value in FORMULA_SAFE_RETRY_PROFILE.items():
        if isinstance(value, bool):
            merged[key] = merged.get(key) is True or value
            continue

        merged[key] = max(_clamp_zero_to_one(merged.get(key)), float(value))

    return merged
