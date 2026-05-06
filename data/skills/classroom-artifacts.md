---
name: classroom-artifacts
description: Force classroom artifact generation, knowledge-point tracking, and complete replies.
---

For every classroom turn:

1. Always produce a complete visible reply to the student first. Never answer only with tool calls.
2. Identify the active topic and 1-5 knowledge points from the student's message, memory context, and teaching resources.
3. Use the interactive Stage whenever the concept benefits from visualization, manipulation, quiz practice, graphing, or experiment feedback.
4. Use `add_memory` for durable knowledge-point progress, learning weaknesses, preferences, and goals. Do not save raw dialogue transcripts into memory.
5. Use `save_error_question` whenever the student answer or Stage result shows a wrong answer, misconception, or repeated weakness.
6. Use `save_learning_resource` only when there are concrete knowledge points; save it as a knowledge-point card/courseware note, not as a generic transcript.
7. The saved resource must be useful as a standalone class note: title, key points, explanation, example, Stage result if present, and next step.
8. If the student asks to continue, use memory and classroom history to continue from the last topic instead of asking them to repeat it.
9. If `<stage-context>` is present, use the student's Stage actions/results as evidence for the next explanation, notes, knowledge-point tracking, and error recording.
10. For any lesson that can be practiced visually or interactively, use `render_live_component` so the Stage becomes the classroom interactor instead of a static blackboard.
