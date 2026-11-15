"""Server-side messages shown in the dashboard (progress and errors), in the
interface languages. Keys are stable; ``tr`` falls back to English."""

from __future__ import annotations

LANGUAGES = ("en", "zh")

MESSAGES: dict[str, dict[str, str]] = {
    "datasets": {"en": "Fetching LeetCode company-tag datasets from GitHub…", "zh": "正在从 GitHub 获取 LeetCode 公司题库…"},
    "web": {"en": "Searching the web for recent interview reports…", "zh": "正在搜索近期面经…"},
    "merge": {"en": "Merging the evidence into a prep profile…", "zh": "正在整理成备考档案…"},
    "campaign": {"en": "Planning every week until the interview…", "zh": "正在规划面试前的每一周…"},
    "plan": {"en": "Planning your best {minutes} minutes…", "zh": "正在安排你的 {minutes} 分钟…"},
    "recap": {"en": "Reading your recap and updating your history…", "zh": "正在读取练习总结并更新记录…"},
    "design_start": {"en": "The interviewer is reading the prompt…", "zh": "面试官正在准备题目…"},
    "design_turn": {"en": "The interviewer is thinking…", "zh": "面试官正在思考…"},
    "design_grade": {"en": "Grading your design against the rubric…", "zh": "正在按评分标准评估你的设计…"},
    "lc_read": {"en": "Reading LeetCode profile @{username}…", "zh": "正在读取 LeetCode 主页 @{username}…"},
    # errors
    "err_company": {"en": "Company is required.", "zh": "请填写公司。"},
    "err_date": {"en": "Interview date must look like 2026-12-25.", "zh": "面试日期格式应为 2026-12-25。"},
    "err_level": {"en": "Unknown level.", "zh": "未知的职级。"},
    "err_posting": {"en": "That job posting is very long — paste just the description.", "zh": "职位描述太长了，只粘贴描述部分即可。"},
    "err_minutes": {"en": "Minutes should be between 5 and 600.", "zh": "时长应在 5 到 600 分钟之间。"},
    "err_recap_empty": {"en": "Tell the coach how it went first.", "zh": "请先写下练习情况。"},
    "err_recap_long": {"en": "That recap is very long — trim it under 5,000 characters.", "zh": "总结太长了，请控制在 5000 字以内。"},
    "err_design_pick": {"en": "Pick a design problem.", "zh": "请选择一道系统设计题。"},
    "err_answer_empty": {"en": "Write your answer first.", "zh": "请先写下你的回答。"},
    "err_answer_long": {"en": "That answer is very long — split it into a few messages.", "zh": "回答太长了，请分成几条发送。"},
    "err_username": {"en": "That doesn't look like a LeetCode username (letters, digits, - and _).", "zh": "这不像是 LeetCode 用户名（字母、数字、- 和 _）。"},
    "err_language": {"en": "Unknown language.", "zh": "不支持的语言。"},
    "err_job": {"en": "Unknown job.", "zh": "找不到该任务。"},
}


def tr(lang: str | None, key: str, **kw: object) -> str:
    entry = MESSAGES[key]
    text = entry.get(lang or "en") or entry["en"]
    return text.format(**kw) if kw else text
