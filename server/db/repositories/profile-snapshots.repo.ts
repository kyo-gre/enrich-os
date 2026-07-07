import { randomUUID } from "node:crypto";
import type { InArgs } from "@libsql/client";
import { libsqlClient } from "../libsql-client";

export interface ProfileSnapshotRow {
  id: string;
  creator_id: string;
  platform: string;
  fetched_via: "static" | "browser";
  raw_snapshot: string;
  fetched_at: number;
}

export async function saveProfileSnapshot(input: {
  creatorId: string;
  platform: string;
  fetchedVia: "static" | "browser";
  rawSnapshot: Record<string, unknown>;
}): Promise<ProfileSnapshotRow> {
  const row: ProfileSnapshotRow = {
    id: randomUUID(),
    creator_id: input.creatorId,
    platform: input.platform,
    fetched_via: input.fetchedVia,
    raw_snapshot: JSON.stringify(input.rawSnapshot),
    fetched_at: Date.now(),
  };
  await libsqlClient.execute({
    sql: `INSERT INTO profile_snapshots (id, creator_id, platform, fetched_via, raw_snapshot, fetched_at)
     VALUES (:id, :creator_id, :platform, :fetched_via, :raw_snapshot, :fetched_at)`,
    args: row as unknown as InArgs,
  });
  return row;
}

export async function listProfileSnapshotsForCreator(
  creatorId: string,
): Promise<ProfileSnapshotRow[]> {
  const result = await libsqlClient.execute({
    sql: "SELECT * FROM profile_snapshots WHERE creator_id = ? ORDER BY fetched_at ASC",
    args: [creatorId],
  });
  return result.rows as unknown as ProfileSnapshotRow[];
}
