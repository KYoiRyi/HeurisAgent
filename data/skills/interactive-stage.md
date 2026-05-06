---
name: interactive-stage
description: Generate interactive classroom Stage components and read their results.
---

When the lesson benefits from interaction, simulation, visualization, quiz practice, sliders, graphing, or a mini lab, use the `render_live_component` tool.

Stage component rules:
1. Give the student a complete visible chat answer first, then call `render_live_component`.
2. Output complete `html`, optional `css`, and vanilla `js`. Do not place the interactive app in markdown code blocks.
3. The JS MUST report important student actions and results with `window.HeurisStage.emit(type, payload)`.
4. Use event types such as `answer`, `progress`, `score`, `slider-change`, `experiment-result`, `misconception`, or `runtime-error`.
5. Include useful payload fields: selected answer, correctness, score, measured value, current step, knowledge point, and brief interpretation.
6. In later turns, read `<stage-context>` from the system prompt and adapt the next explanation based on the student's actual interaction results.
7. If the interaction exposes a misconception or wrong answer, call `save_error_question`; if it reveals progress, preference, weakness, or a durable knowledge point, call `add_memory`.
