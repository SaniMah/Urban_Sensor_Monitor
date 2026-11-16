"""Step 7 - generate the weekly sensor-health report.

Uses a local Ollama model if running, otherwise a deterministic template. Either
way the report uses only the computed numbers and is labelled a draft.

Run:
    python run_step7.py            # last 7 days
    python run_step7.py 14         # last 14 days
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from src.db import get_engine  # noqa: E402
from src.report import generate_report  # noqa: E402


def main(days: int = 7):
    engine = get_engine()
    report, source = generate_report(engine, days=days)

    out = Path(f"reports/weekly_report_{days}d.md")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(report, encoding="utf-8")

    print(f"Report source: {source}")
    if source == "template-fallback":
        print("(Ollama not running - used the built-in template. Install Ollama and "
              "`ollama pull llama3.2` for LLM-written prose.)")
    print(f"Saved -> {out}\n")
    print("-" * 70)
    print(report)


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 7)
