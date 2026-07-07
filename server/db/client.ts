/**
 * Compatibility re-export. `./libsql-client.ts` is the actual connection
 * module every repository imports (and where migrations are triggered) —
 * this file exists so existing "import client.ts to guarantee the schema
 * exists" call sites keep working under the same name/path as the
 * pre-migration better-sqlite3 module.
 */
export { libsqlClient as db } from "./libsql-client";
