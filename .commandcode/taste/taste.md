# Taste

## Workflow
- Prefers finished work landed on a fresh feature branch pushed to `origin` rather than committed onto the current working branch (asked to "create a new branch, commit this and push to it"), and expects the agent to run the whole git flow end-to-end — branch, stage, commit, push, verify tracking/remote — then report the branch name, commit hash and PR link. Confidence: 0.6

## Communication
- Communicates in Vietnamese and expects replies in Vietnamese (the assistant's summaries and clarifying questions were delivered in Vietnamese). Confidence: 0.65
- Refers to UI elements to change by pasting their rendered HTML/DOM markup (plus the page path) instead of naming components, and expects the assistant to locate and edit the matching code. Confidence: 0.5
- Gives short, direct imperative requests (e.g. "remove this button") and expects the change applied immediately along with cleanup of now-unused imports/variables and a typecheck/lint verification. Confidence: 0.5
