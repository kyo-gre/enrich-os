import { randomUUID } from "node:crypto";
import { db } from "../client";

export interface ProfileSnapshotRow {
  id: string;
  creator_id: string;
  platform: string;
  fetched_via: "static" | "browser";
  raw_snapshot: string;
  fetched_at: number;
}

export function saveProfileSnapshot(input: {
  creatorId: string;
  platform: string;
  fetchedVia: "static" | "browser";
  rawSnapshot: Record<string, unknown>;
}): ProfileSnapshotRow {
  const row: ProfileSnapshotRow = {
    id: randomUUID(),
    creator_id: input.creatorId,
    platform: input.platform,
    fetched_via: input.fetchedVia,
    raw_snapshot: JSON.stringify(input.rawSnapshot),
    fetched_at: Date.now(),
  };
  db.prepare(
    `INSERT INTO profile_snapshots (id, creator_id, platform, fetched_via, raw_snapshot, fetched_at)
     VALUES (@id, @creator_id, @platform, @fetched_via, @raw_snapshot, @fetched_at)`,
  ).run(row);
  return row;
}

export function listProfileSnapshotsForCreator(
  creatorId: string,
): ProfileSnapshotRow[] {
  return db
    .prepare<[string], ProfileSnapshotRow>(
      "SELECT * FROM profile_snapshots WHERE creator_id = ? ORDER BY fetched_at ASC",
    )
    .all(creatorId);
}
