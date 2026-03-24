from __future__ import annotations

import unittest

from pdf_translate_formula_guard import (
    build_formula_safe_retry_pdf_kwargs,
    analyze_text_lines,
    decide_formula_safe_retry,
    retry_profile_already_applied,
)


class PdfTranslateFormulaGuardTests(unittest.TestCase):
    def test_formula_dense_input_with_fragmented_output_triggers_retry(self) -> None:
        input_lines = [
            "where x_i in R^m, i = 1, ..., n - 1 are system states",
            "f_i(x_i) : R^m -> R^q and g_n(x) are known smooth nonlinear functions",
            "theta in R^{q x m} is an unknown parameter matrix",
            "system (1) can model many practical systems",
            "u in R^m is the control input",
            "x_n dot = theta^T f_n(x) + g_n(x)u",
            "y = x_1",
            "strict-feedback system:",
            "matrix g_n(x) is nonsingular",
            "Abel et al. (2024) and Krstic et al. (1995)",
        ]
        output_lines = [
            "其中 x_i ∈ R^m, i = 1, ..., n - 1 为系统状态",
            "x_i^T = [ x_1^T ... x_i^T ]",
            "¯x x , xi , x x , y 是系统输出",
            "f_i(.) , i = 1, ..., n 是已知的光滑非线性函数",
            "u ∈ R^m 是控制输入, θ ∈ R^{q×m}",
            "f_i(x_i) : R^{im} → R^q 和 g_n(x) 已知",
            "系统 (1) 是一类重要的非线性系统",
            "可以建模许多实际系统",
        ]

        decision = decide_formula_safe_retry(
            analyze_text_lines(input_lines),
            analyze_text_lines(output_lines),
        )

        self.assertTrue(decision.should_retry)
        self.assertIn("fragmented-inline-math", decision.reason)

    def test_stable_output_does_not_trigger_retry(self) -> None:
        input_lines = [
            "where x_i in R^m, i = 1, ..., n - 1 are system states",
            "f_i(x_i) : R^m -> R^q and g_n(x) are known smooth nonlinear functions",
            "theta in R^{q x m} is an unknown parameter matrix",
            "system (1) can model many practical systems",
            "u in R^m is the control input",
            "x_n dot = theta^T f_n(x) + g_n(x)u",
            "y = x_1",
            "strict-feedback system:",
        ]
        output_lines = [
            "其中 x_i ∈ R^m，i = 1, ..., n - 1 为系统状态。",
            "f_i(x_i): R^m → R^q，g_n(x) 为已知光滑非线性函数。",
            "θ ∈ R^{q×m} 为未知参数矩阵，u ∈ R^m 为控制输入。",
            "系统 (1) 属于重要的非线性系统。",
            "该模型可以描述许多实际系统。",
            "矩阵 g_n(x) 被假设为非奇异。",
            "Abel 等人（2024）和 Krstic 等人（1995）给出了相关讨论。",
            "这里 y = x_1 表示系统输出。",
        ]

        decision = decide_formula_safe_retry(
            analyze_text_lines(input_lines),
            analyze_text_lines(output_lines),
        )

        self.assertFalse(decision.should_retry)
        self.assertEqual(decision.reason, "output-looks-stable")

    def test_retry_profile_merges_without_overwriting_stronger_thresholds(self) -> None:
        merged = build_formula_safe_retry_pdf_kwargs({
            "split_short_lines": False,
            "disable_rich_text_translate": False,
            "no_remove_non_formula_lines": False,
            "skip_formula_offset_calculation": False,
            "non_formula_line_iou_threshold": 0.99,
            "figure_table_protection_threshold": 0.5,
        })

        self.assertTrue(merged["split_short_lines"])
        self.assertTrue(merged["disable_rich_text_translate"])
        self.assertTrue(merged["no_remove_non_formula_lines"])
        self.assertTrue(merged["skip_formula_offset_calculation"])
        self.assertEqual(merged["non_formula_line_iou_threshold"], 0.99)
        self.assertEqual(merged["figure_table_protection_threshold"], 0.97)
        self.assertTrue(retry_profile_already_applied(merged))


if __name__ == "__main__":
    unittest.main()
