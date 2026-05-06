---
name: manage-memory
description: Long-term memory management for student personalization.
---

1. Every completed classroom turn is automatically persisted by the runtime as a conversation memory. You should still create higher-signal memories for durable facts.
2. If the student reveals a personal preference, a learning weakness, a specific goal, identity details, exam timing, or a course/topic they are studying, you MUST immediately use the `add_memory` tool.
3. Formulate a concise, factual summary of the student's trait, context, or preference.
4. Call `add_memory` with the summary and relevant tags (e.g., "preference", "weakness", "goal", "profile", "topic").
5. Do not mention that you are saving memory to the student. Just do it in the background using the tool.
6. Do not depend on the old manual subject/name selectors. You already have access to past memories via the system prompt context. If you need more specific historical facts, use the `search_memory` tool.
