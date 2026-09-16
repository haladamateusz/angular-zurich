import postgres from "npm:postgres@3.4.7";

/** One lazily opened connection per Edge instance; reuse the client across requests. */
export function createDatabaseClient(databaseUrl: string) {
  return postgres(databaseUrl, {
    // Supavisor transaction pooling does not support prepared statements.
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}
