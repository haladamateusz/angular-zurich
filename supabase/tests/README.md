# Database access regression checks

After applying migrations, run the SQL assertions as the database owner:

```sh
supabase db query --local --file supabase/tests/public_access.sql
```

For verification against the linked project, use `--linked` in place of `--local`.
This is a SQL assertion script, not a pgTAP suite. It creates temporary fixtures
inside a transaction and rolls them all back. A failed assertion raises an error
and aborts the transaction. It does not create Auth users or send messages.

The checks cover:

- Anonymous and authenticated denial of `People.email`, including filters and wildcard reads.
- Public profile columns, organizer views, and event/speaker joins.
- Public-event talks versus private-event and unassigned talks.
- Speaker assignments following the visibility of their talk.
- An authenticated outsider, including spoofed `user_metadata`, receiving no organizer access.
- An allowlisted organizer retaining draft/unassigned talk and submission contact access.
- Service-role contact access used by privileged workflows.
- Browser denial of rate-limit table privileges and service-role reads and updates.
- Restrictive rate-limit denial even with temporary grants and a permissive read policy.

The organizer identity and submission contact are synthetic and exist only in
the rolled-back transaction. Contact assertions check that specific submission,
so they work on empty databases and do not depend on production records. The
temporary grants and policy used to test rate-limit denial also roll back.
These checks exercise database authorization; they do not exercise
the OAuth login flow or hosted Auth hook configuration.

## Applied migration history

The September 15 access-hardening migrations are already applied to the linked
database. Preserve their versions and SQL rather than squashing or deleting them.

- `20260914233716` adds partial reviewer indexes; `20260914233918` replaces them
  with full indexes for advisor compatibility. This is historical migration
  churn, not a demonstrated query-speed improvement. Keep the final indexes
  unless query plans and workload measurements justify another change.
- `20260915000323` adds a restrictive rate-limit policy. Browser roles were
  already denied by grants and default-deny RLS. The policy additionally blocks
  future permissive policies; the regression script verifies that protection
  and service-role access explicitly.

## Homepage counts

Run `supabase db query --local --file supabase/tests/public_stats.sql` after applying
`20260916091328_add_public_stats.sql`. Use `--linked` to verify a deployed database.
The rollback-only suite checks identical anonymous, outsider, and organizer counts:
all public events (past, future, and without talks), only their talks, and distinct
speakers. Private events, their speakers, and unassigned talks are excluded.

Deploy this migration before deploying the frontend that calls `get_public_stats`.
The RPC retains row-level security and returns one aggregate row, so Data API row
limits no longer truncate the speaker input.
