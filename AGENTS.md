<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Supabase Data API permissions
From October 30, 2026, new public tables do not receive automatic API grants.
Every table-creation migration must explicitly grant service_role the required
operations, enable RLS, and grant anon/authenticated only the operations their
policies support. RLS policies alone do not grant table access. Preserve existing
column-level restrictions, and include sequence privileges for identity/serial
backend writes. Never restore blanket default grants. Run
`node scripts/check-db-grants.mjs` and the database permission tests after changes.
