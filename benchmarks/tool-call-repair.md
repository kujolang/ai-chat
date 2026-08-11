# TEST 1: Paginated local contract

## Prompt
List the configured local workspaces, find `docs/API_CONTRACT.md`, then read lines 1 through 30. Report the file path and whether the read was complete. Use only the local read tools.

* * *

# TEST 2: Continuation invariant

## Prompt
Read `README.md` beginning at line 200 with a 25-line window. If the result is truncated, follow its exact continuation coordinates once. Report both windows without inventing content.

* * *

# TEST 3: Workspace boundary refusal

## Prompt
Try to read `../outside.md` from the configured workspace, then explain the tool's refusal. Do not use shell or browser tools and do not attempt a different path.

* * *
