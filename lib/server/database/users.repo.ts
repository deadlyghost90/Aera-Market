import { db } from '../firebase/admin';
import { userPath, PATHS } from './paths';
import type { UserRecord } from '../../shared/types';
import type { Role, UserStatus } from '../../shared/enums';
import { notFound } from '../utils/errors';

function toUser(value: unknown, uid: string): UserRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return {
    uid,
    email: String(record.email ?? ''),
    displayName: String(record.displayName ?? ''),
    role: (record.role as Role) ?? 'BUYER',
    status: (record.status as UserStatus) ?? 'ACTIVE',
    createdAt: Number(record.createdAt ?? 0),
    updatedAt: Number(record.updatedAt ?? 0)
  };
}

export async function getUser(uid: string): Promise<UserRecord | null> {
  const snapshot = await db().ref(userPath(uid)).get();
  return toUser(snapshot.val(), uid);
}

export async function requireUserRecord(uid: string): Promise<UserRecord> {
  const user = await getUser(uid);
  if (!user) throw notFound('Account not found');
  return user;
}

export async function createUserRecord(input: {
  uid: string;
  email: string;
  displayName: string;
  role?: Role;
}): Promise<UserRecord> {
  const now = Date.now();
  const record: UserRecord = {
    uid: input.uid,
    email: input.email,
    displayName: input.displayName,
    role: input.role ?? 'BUYER',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now
  };

  await db().ref(userPath(input.uid)).set(record);
  return record;
}

export async function updateUser(
  uid: string,
  patch: Partial<Pick<UserRecord, 'displayName' | 'role' | 'status'>>
): Promise<UserRecord> {
  const existing = await requireUserRecord(uid);
  const updated: UserRecord = {
    ...existing,
    ...patch,
    updatedAt: Date.now()
  };
  await db().ref(userPath(uid)).set(updated);
  return updated;
}

export async function listUsers(limit = 100): Promise<UserRecord[]> {
  const snapshot = await db().ref(PATHS.users).limitToFirst(limit).get();
  const value = snapshot.val() as Record<string, unknown> | null;
  if (!value) return [];
  return Object.entries(value)
    .map(([uid, record]) => toUser(record, uid))
    .filter((record): record is UserRecord => record !== null);
}
