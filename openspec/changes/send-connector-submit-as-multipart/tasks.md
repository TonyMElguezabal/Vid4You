## 0. Setup (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/viggle-video-connector`

## 1. Backend: tests first

- [x] 1.1 Failing tests: the Viggle fixture is accepted; the multipart submit's parts, image type and headers; the poll; the refused definitions
- [x] 1.2 Add the verified Viggle definition to `docs/video-connector-definitions.md`

## 2. Backend: implementation

- [x] 2.1 Send the submit step as a multipart form when `multipartField` is set
- [x] 2.2 Save-time checks

## 3. Review and update existing unit tests (MANDATORY)

- [x] 3.1 Check that existing connector tests still describe the behaviour; add Viggle to the adapter contract if it lists each example definition

## 4. Run unit tests and verify database state (MANDATORY)

- [x] 4.1 Record the application database before the tests, run targeted tests, the full suite, typecheck and lint, and compare afterwards
- [x] 4.2 Write `reports/YYYY-MM-DD-step-4-unit-test-and-db-verification.md`

## 5. Manual endpoint testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 5.1 On a backend with a throwaway data directory: save the Viggle profile through the admin API, save an invalid one, read the list; delete the directory
- [x] 5.2 Free live calls only: the credits check and a status read of an unknown id

## 6. End-to-end testing

- Not applicable: no frontend change.

## 7. Update technical documentation (MANDATORY)

- [x] 7.1 Docs page notes and the connector section of the backend standards if it describes the submit step; `graphify update .`
