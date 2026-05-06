---
name: record-error
description: Instructions for proactively recording student errors into the database.
---

When you detect that the student has made a mistake (e.g., incorrect calculation, conceptual misunderstanding, or wrong approach):
1. First, gently correct them in your text response and explain the concept.
2. Second, you MUST proactively use the `save_error_question` tool to log this error into the database so the system can build a review plan for the student.

Make sure to provide a clear `error_analysis` and properly categorize the `error_type` (e.g., 'concept', 'calculation', 'careless', 'method').
