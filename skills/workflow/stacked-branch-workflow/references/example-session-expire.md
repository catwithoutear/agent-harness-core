# Worked Example: Session Expiration Feature

User request:

> I need to add session expiration logic and modify login/query handlers.

Recommended answer:

```text
Assumptions:
- Existing session creation and query handlers already work.
- The goal is to add expiration behavior without rewriting auth flow.

Recommended stack:

main
 └── refactor/session-extract-expire-context
      └── feature/session-expire-reason-model
           └── feature/session-expire-policy
                └── feature/session-expire-handler-wiring
                     └── test/session-expire-integration

refactor/session-extract-expire-context
Purpose:
- Extract existing timeout/access-time fields into a clearer internal context.
- No behavior change.

Allowed changes:
- Function extraction.
- Naming cleanup.
- Internal helper class or struct.

Forbidden changes:
- New expiration behavior.
- New API response semantics.

Validation:
- Existing tests pass.
- Optional before/after behavior comparison.

Review focus:
- Confirm no behavior change.

feature/session-expire-reason-model
Purpose:
- Add explicit reason codes for expiration decisions.

Allowed changes:
- Enum/model additions.
- Serialization support if required.

Forbidden changes:
- Actual expiration enforcement.

Validation:
- Model/unit tests.

Review focus:
- Compatibility and naming.

feature/session-expire-policy
Purpose:
- Implement actual expiration policy.

Allowed changes:
- Timeout checks.
- Access-time refresh logic.
- Error handling.

Forbidden changes:
- Handler response formatting.

Validation:
- Unit tests for expired, active, boundary-time sessions.

Review focus:
- Correctness of business logic.

feature/session-expire-handler-wiring
Purpose:
- Wire the policy into login/query handlers.

Allowed changes:
- Handler calls to policy.
- Response mapping.
- Logging.

Forbidden changes:
- New policy logic.

Validation:
- Handler-level tests.

Review focus:
- Thin integration.

test/session-expire-integration
Purpose:
- Add end-to-end validation and docs.

Allowed changes:
- Integration tests.
- Migration notes.
- Compatibility docs.

Forbidden changes:
- New production behavior.

Validation:
- Full test suite.
```

## Anti-Pattern Version (What NOT to Do)

```text
# BAD — split by layer/directory, not by semantics:
A: models
B: managers
C: handlers

# BAD — mixed concerns:
refactor session manager, add expire reason, change cookie behavior, add tests
```
