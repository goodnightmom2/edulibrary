import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';

export type SafeUser = {
  id: number;
  uid: string;
  fullName: string;
  email: string;
  avatar: string | null;
  role: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toSafeUser(row: typeof users.$inferSelect): SafeUser {
  return {
    id: row.id,
    uid: row.uid,
    fullName: row.fullName,
    email: row.email,
    avatar: row.avatar,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function upsertGoogleUser(params: {
  uid: string;
  email: string;
  fullName: string;
  avatar: string | null;
}): Promise<SafeUser> {
  try {
    // Check if an account with this email already exists (e.g., pre-seeded admin)
    const existingByEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, params.email))
      .limit(1);

    if (existingByEmail.length > 0) {
      const existing = existingByEmail[0];
      const [updated] = await db
        .update(users)
        .set({
          fullName: params.fullName || existing.fullName,
          avatar: params.avatar ?? existing.avatar,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id))
        .returning();
      return toSafeUser(updated);
    }

    const result = await db
      .insert(users)
      .values({
        uid: params.uid,
        email: params.email,
        fullName: params.fullName || params.email.split('@')[0],
        avatar: params.avatar,
        role: 'USER',
        status: 'ACTIVE',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: params.email,
          fullName: params.fullName || params.email.split('@')[0],
          avatar: params.avatar,
          updatedAt: new Date(),
        },
      })
      .returning();

    return toSafeUser(result[0]);
  } catch (error) {
    console.error('Database query failed in upsertGoogleUser:', error);
    throw new Error('Không thể đồng bộ thông tin tài khoản.', { cause: error });
  }
}

export async function findUserById(id: number): Promise<typeof users.$inferSelect | null> {
  try {
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error('Database query failed in findUserById:', error);
    throw new Error('Không thể truy vấn người dùng.', { cause: error });
  }
}

export async function findUserByEmail(email: string): Promise<typeof users.$inferSelect | null> {
  try {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, email.trim().toLowerCase()))
      .limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error('Database query failed in findUserByEmail:', error);
    throw new Error('Không thể truy vấn người dùng.', { cause: error });
  }
}
