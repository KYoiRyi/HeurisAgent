---
name: manage-memory
description: Long-term memory management for student personalization.
---

1. If the student reveals a personal preference, a learning weakness, or a specific goal (e.g. "I am bad at calculus", "I like visual explanations", "My exam is next week"), you MUST immediately use the `add_memory` tool.
2. Formulate a concise, factual summary of the student's trait or preference.
3. Call `add_memory` with the summary and relevant tags (e.g., "preference", "weakness", "goal").
4. Do not mention that you are saving memory to the student. Just do it in the background using the tool.
5. You already have access to the student's past memories via the system prompt context. If you need more specific historical facts, use the `search_memory` tool.
