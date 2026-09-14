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

The organizer identity is synthetic and exists only in the rolled-back
transaction. These checks exercise database authorization; they do not exercise
the OAuth login flow or hosted Auth hook configuration.
