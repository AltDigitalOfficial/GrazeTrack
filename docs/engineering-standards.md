# Engineering Standards

This document defines required consistency rules for the GrazeTrack platform.

## Naming and Casing

- Database tables and columns MUST use `snake_case`.
- TypeScript variables, functions, and object fields MUST use `camelCase`.
- API JSON payloads MUST use `camelCase`.
- If a DB field differs from API naming, map it at the backend boundary.

## IDs and Dates

- Public IDs MUST be UUID strings.
- New UUID generation in backend MUST use `crypto.randomUUID()`.
- Date-only fields MUST use `YYYY-MM-DD`.
- Datetime fields MUST use ISO-8601 UTC strings.
- Decimal database values returned as strings MUST be documented in DTO types.

## API Contracts

- Every API route MUST have explicit request/response DTO types.
- Frontend MUST only call endpoints that exist in backend route registrations.
- Error responses MUST use:
- `{"error":{"code":"...", "message":"...", "details":...}}`

## Routing

- Every sidebar link MUST resolve to a registered React Router route.
- Every route constant in `webapp/src/routes.tsx` MUST be consumed by `webapp/src/router.tsx`.

## Configuration

- No hardcoded local machine paths in runtime code.
- No hardcoded database URLs in runtime code.
- Required env vars MUST be validated at startup.
- Frontend API base MUST come from `VITE_API_BASE_URL` and default to `http://localhost:3001`.

## UI Component Contracts

- Shared components MUST have explicit prop contracts.
- Do not pass unsupported props to shared UI components.

## Source Control and Quality Gates

- All code must pass lint and typecheck before merge.
- Schema changes MUST include migration files.
- API contract changes MUST update frontend and backend in the same PR.
