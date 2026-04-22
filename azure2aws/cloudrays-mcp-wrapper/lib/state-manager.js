import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DEFAULT_WORK_DIR = process.env.CLOUDRAYS_WORK_DIR || path.join(os.tmpdir(), 'cloudrays');

export function getWorkDir() {
  return process.env.CLOUDRAYS_WORK_DIR || DEFAULT_WORK_DIR;
}

export function scanDir(scanId) {
  return path.join(getWorkDir(), scanId);
}

export function statePath(scanId) {
  return path.join(scanDir(scanId), 'state.json');
}

export async function ensureScanDir(scanId) {
  const dir = scanDir(scanId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function writeState(scanId, state) {
  await ensureScanDir(scanId);
  const p = statePath(scanId);
  const payload = {
    ...state,
    scan_id: scanId,
    updated_at: new Date().toISOString(),
  };
  await fs.writeFile(p, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

export async function readState(scanId) {
  const p = statePath(scanId);
  try {
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function updateState(scanId, patch) {
  const current = (await readState(scanId)) || {};
  const merged = { ...current, ...patch };
  return writeState(scanId, merged);
}

export async function listScans() {
  const root = getWorkDir();
  let entries = [];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const scans = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const state = await readState(entry.name);
    if (state && state.scan_id) scans.push(state);
  }
  scans.sort((a, b) => {
    const ta = Date.parse(a.started_at || a.updated_at || 0);
    const tb = Date.parse(b.started_at || b.updated_at || 0);
    return tb - ta;
  });
  return scans;
}
