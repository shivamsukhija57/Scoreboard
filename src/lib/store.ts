import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AuditEntry, CompetitionData } from "./domain";
import { createSeedData } from "./seed";
import { migrateLegacyResults } from "./match-scorecard";

const dataFile = path.resolve(process.cwd(), process.env.DATA_FILE ?? ".data/competition.json");
const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY?.trim();
const legacyServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabaseApiKey = supabaseSecretKey || legacyServiceRoleKey;
const hasPartialSupabaseConfig = Boolean(supabaseUrl) !== Boolean(supabaseApiKey);
let writeQueue = Promise.resolve();

interface StoredCompetition {
  state: CompetitionData;
  version: number;
}

function useSupabase(): boolean {
  if (hasPartialSupabaseConfig) {
    throw new Error("Set both SUPABASE_URL and SUPABASE_SECRET_KEY to enable Supabase storage.");
  }
  if (supabaseUrl && supabaseApiKey) return true;
  if (process.env.NODE_ENV === "production") {
    throw new Error("Supabase storage is required in production. Configure SUPABASE_URL and SUPABASE_SECRET_KEY.");
  }
  return false;
}

async function supabaseRequest<T>(resource: string, init: RequestInit = {}): Promise<T> {
  if (!supabaseUrl || !supabaseApiKey) throw new Error("Supabase server credentials are not configured.");
  const headers = new Headers(init.headers);
  headers.set("apikey", supabaseApiKey);
  if (supabaseSecretKey) headers.delete("Authorization");
  else if (legacyServiceRoleKey) headers.set("Authorization", `Bearer ${legacyServiceRoleKey}`);
  headers.set("Content-Type", "application/json");
  const response = await fetch(`${supabaseUrl}/rest/v1/${resource}`, {
    ...init,
    cache: "no-store",
    headers,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${detail.slice(0, 500)}`);
  }
  if (response.status === 204) return null as T;
  const body = await response.text();
  return body ? (JSON.parse(body) as T) : (null as T);
}

async function localInitialData(): Promise<CompetitionData> {
  try {
    return JSON.parse(await readFile(dataFile, "utf8")) as CompetitionData;
  } catch {
    return createSeedData();
  }
}

async function ensureSupabaseState(): Promise<void> {
  const initial = await localInitialData();
  await supabaseRequest("competition_state?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ id: "main", state: initial, version: 0 }),
  });
}

async function readSupabaseState(): Promise<StoredCompetition> {
  let rows = await supabaseRequest<StoredCompetition[]>("competition_state?id=eq.main&select=state,version");
  if (!rows.length) {
    await ensureSupabaseState();
    rows = await supabaseRequest<StoredCompetition[]>("competition_state?id=eq.main&select=state,version");
  }
  if (!rows[0]?.state) throw new Error("Supabase did not return the Division Wars state row.");
  return rows[0];
}

async function ensureLocalData(): Promise<void> {
  try {
    await readFile(dataFile, "utf8");
  } catch {
    await mkdir(path.dirname(dataFile), { recursive: true });
    await writeFile(dataFile, JSON.stringify(createSeedData(), null, 2), "utf8");
  }
}

export async function readCompetition(): Promise<CompetitionData> {
  if (useSupabase()) {
    const data = (await readSupabaseState()).state;
    migrateLegacyResults(data);
    return data;
  }
  await ensureLocalData();
  const data = JSON.parse(await readFile(dataFile, "utf8")) as CompetitionData;
  migrateLegacyResults(data);
  return data;
}

function isRejectedResult<T>(result: T): boolean {
  return Boolean(result && typeof result === "object" && ("error" in result || "conflict" in result));
}

async function updateSupabaseCompetition<T>(
  actor: string,
  action: string,
  detail: string | (() => string),
  entityId: string,
  update: (data: CompetitionData) => T | Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const snapshot = await readSupabaseState();
    migrateLegacyResults(snapshot.state);
    const result = await update(snapshot.state);
    if (isRejectedResult(result)) return result;

    const auditEntry: AuditEntry = {
      id: randomUUID(),
      at: new Date().toISOString(),
      actor,
      action,
      detail: typeof detail === "function" ? detail() : detail,
      entityId,
    };
    snapshot.state.audit.unshift(auditEntry);
    if (result && typeof result === "object") Object.assign(result, { auditEntry });
    const saved = await supabaseRequest<boolean>("rpc/save_competition_state", {
      method: "POST",
      body: JSON.stringify({ expected_version: snapshot.version, next_state: snapshot.state }),
    });
    if (saved) return result;
  }
  throw new Error("The competition changed repeatedly while saving. Please retry the update.");
}

export async function updateCompetition<T>(
  actor: string,
  action: string,
  detail: string | (() => string),
  entityId: string,
  update: (data: CompetitionData) => T | Promise<T>,
): Promise<T> {
  let result!: T;
  const write = async () => {
    if (useSupabase()) {
      result = await updateSupabaseCompetition(actor, action, detail, entityId, update);
      return;
    }

    await ensureLocalData();
    const data = JSON.parse(await readFile(dataFile, "utf8")) as CompetitionData;
    migrateLegacyResults(data);
    result = await update(data);
    if (isRejectedResult(result)) return;
    const auditEntry: AuditEntry = {
      id: randomUUID(),
      at: new Date().toISOString(),
      actor,
      action,
      detail: typeof detail === "function" ? detail() : detail,
      entityId,
    };
    data.audit.unshift(auditEntry);
    if (result && typeof result === "object") Object.assign(result, { auditEntry });
    await mkdir(path.dirname(dataFile), { recursive: true });
    const temporary = `${dataFile}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(data, null, 2), "utf8");
    await rename(temporary, dataFile);
  };
  const next = writeQueue.then(write, write);
  writeQueue = next.then(() => undefined, () => undefined);
  await next;
  return result;
}
