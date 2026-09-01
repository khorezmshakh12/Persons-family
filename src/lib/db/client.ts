import "server-only";
import postgres from "postgres";

declare global {
  var __dbClient: ReturnType<typeof postgres> | undefined;
}

function createClient() {
  const poolOptions = {
    max: Number(process.env.DB_POOL_MAX ?? 5),
    idle_timeout: Number(process.env.DB_IDLE_TIMEOUT ?? 20),
    // postgres-js parses date/timestamp/timestamptz columns into native JS
    // Date objects by default — but every query result type across this
    // codebase declares those fields as `string` (matching Supabase's old
    // client, which always returned ISO strings). Left alone, a Date
    // object silently satisfies TypeScript's `string` type at compile time
    // (postgres-js's own types don't narrow per-column) while behaving
    // completely differently at runtime — string methods coerce it via
    // Date.prototype.toString() (a non-ISO, human-readable format, NOT
    // what `new Date(x)` or string concatenation expects), which is what
    // produced a real "Invalid time value" bug (self_development.month
    // template-literal'd into `${row.month}T00:00:00Z`). Overriding the
    // parser to be an identity function makes postgres-js return the raw
    // wire string instead, matching what every type declaration already
    // assumes.
    types: {
      date: {
        to: 1082,
        from: [1082, 1114, 1184], // date, timestamp, timestamptz
        serialize: (x: string) => x,
        parse: (x: string) => x,
      },
    },
  };

  const instanceConnectionName = process.env.INSTANCE_CONNECTION_NAME;
  if (process.env.K_SERVICE && instanceConnectionName) {
    return postgres({
      host: `/cloudsql/${instanceConnectionName}`,
      username: process.env.DB_USER ?? "postgres",
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME ?? "app",
      ...poolOptions,
    });
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  const isLocal = connectionString.includes("127.0.0.1") || connectionString.includes("localhost");
  return postgres(connectionString, { ssl: isLocal ? false : "require", ...poolOptions });
}

export const sql = globalThis.__dbClient ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__dbClient = sql;
}

// postgres-js's sql.json() expects its structural JSONValue type, which
// named interfaces/typed arrays don't satisfy even when they're plain
// serializable data — a type-level-only escape hatch, not a runtime one.
export function toJson<T>(value: T): postgres.JSONValue {
  return value as unknown as postgres.JSONValue;
}
