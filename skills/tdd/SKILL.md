---
name: tdd
description: Test-Driven Development discipline. Enforces RED-GREEN-REFACTOR cycle and guards against common testing anti-patterns. No production code without a preceding failing test.
---

# TDD — Test-Driven Development

## The Iron Law

**Never write production code without a preceding failing test.**

Every implementation follows the RED-GREEN-REFACTOR cycle:

1. **RED** — Write a test that describes the desired behavior. Run it. It MUST fail.
2. **GREEN** — Write the minimum production code to make the test pass. Nothing more.
3. **REFACTOR** — Clean up duplication, improve naming, extract helpers. Tests stay green.

If you find yourself writing production code first, STOP. Write the test first.

## Workflow

```
1. Read the task requirements / acceptance criteria
2. Identify the first testable behavior
3. Write ONE failing test (RED)
4. Run: npx vitest run <test-file> — confirm it fails for the RIGHT reason
5. Write minimum code to pass (GREEN)
6. Run: npx vitest run <test-file> — confirm it passes
7. Refactor if needed — run tests again to confirm still green
8. Repeat from step 2 for the next behavior
```

## Vitest Conventions

- Test files: `*.test.ts` or `*.spec.ts` colocated with source
- Run single file: `npx vitest run src/path/to/module.test.ts`
- Run all: `npx vitest run`
- Watch mode (interactive): `npx vitest src/path/to/module.test.ts`

## Test Structure

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('ModuleName', () => {
  describe('methodName', () => {
    it('should [expected behavior] when [condition]', () => {
      // Arrange
      const input = ...;
      // Act
      const result = methodName(input);
      // Assert
      expect(result).toBe(expected);
    });

    it('should throw when [error condition]', () => {
      expect(() => methodName(badInput)).toThrow(/expected message/);
    });
  });
});
```

## What to Test

For every unit of work, cover:

- **Happy path** — normal input produces expected output
- **Edge cases** — empty input, boundary values, null/undefined
- **Error paths** — invalid input, missing dependencies, network failures
- **Side effects** — verify calls to external services (use `vi.fn()` / `vi.spyOn()`)

Minimum: 1 positive + 1 negative test per function/endpoint.

## Testing Anti-Patterns — Do NOT

1. **Test implementation, not behavior** — Don't assert internal variable values or call order. Assert observable outputs and side effects only. If refactoring breaks tests but not behavior, the tests are wrong.

2. **Shared mutable state between tests** — Each test must be independent. Use `beforeEach` to reset state. Never rely on test execution order.

3. **Giant test functions** — One assertion focus per test. A test named "should handle everything" is a red flag. Split into specific behavior tests.

4. **Testing the framework** — Don't test that Express routes or Vitest matchers work. Test YOUR logic. Mock the framework boundary, test what's behind it.

5. **Ignoring failing tests** — Never use `.skip` or `.todo` on a test that was previously passing. A skipped test is invisible rot. Fix it or delete it.

## When Tests Fail

- Read the FULL error output before changing anything
- Identify whether the test or the code is wrong
- If the test expectations are correct, fix the production code
- If the test assumptions are outdated, update the test
- Never delete a failing test just to make the suite green
