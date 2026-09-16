import { createDatabaseClient } from "../functions/_shared/database.ts";

const databaseUrl = Deno.env.get("TALK_SUBMISSIONS_DB_URL");

// Opt-in integration check: use a transaction-pooler URL and --allow-env --allow-net.
// Executes SELECTs only; it never changes application data or sends notifications.
Deno.test({
  name:
    "Edge database client queues concurrent queries and recovers after transaction rollback",
  ignore: !databaseUrl,
  async fn() {
    const sql = createDatabaseClient(databaseUrl!);
    try {
      const results = await Promise.all(
        Array.from(
          { length: 8 },
          (_, index) => sql`select ${index}::integer as value`,
        ),
      );
      if (results.some((rows, index) => rows[0].value !== index)) {
        throw new Error("Concurrent query results were mixed or missing");
      }

      const committed = await sql.begin(async (tx) => {
        const [row] = await tx`select 42::integer as value`;
        return row.value;
      });
      if (committed !== 42) throw new Error("Transaction result was lost");

      const rollback = new Error("Intentional test rollback");
      try {
        await sql.begin(async (tx) => {
          await tx`select 1`;
          throw rollback;
        });
        throw new Error("Expected transaction rollback");
      } catch (error) {
        if (error !== rollback) throw error;
      }

      const [row] = await sql`select 7::integer as value`;
      if (row.value !== 7) {
        throw new Error("Client did not recover after rollback");
      }
    } finally {
      await sql.end({ timeout: 5 });
    }
  },
});
