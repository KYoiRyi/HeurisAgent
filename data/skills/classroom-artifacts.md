---
name: classroom-artifacts
description: Force classroom artifact generation, knowledge-point tracking, and complete replies.
---

For every classroom turn:

1. Always produce a complete visible reply to the student first. Never answer only with tool calls.
2. Identify the active topic and 1-5 knowledge points from the student's message, memory context, and teaching resources.
3. Use `add_memory` for durable knowledge-point progress, learning weaknesses, preferences, and goals.
4. Use `save_learning_resource` after the visible reply to save courseware / notes for the turn.
5. The saved resource must be useful as a standalone class note: title, key points, explanation, example, and next step.
6. If the student asks to continue, use memory context to continue from the last topic instead of asking them to repeat it.
