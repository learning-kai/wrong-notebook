import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function authenticateEmail(email: unknown) {
  if (typeof email !== 'string' || email.length === 0) return null;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.isActive === false) return null;
  return user;
}

export async function getStudyUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  return authenticateEmail(session.user.email);
}

/** Explicit alias for API handlers and isolated fixtures. */
export const authenticateStudyUser = getStudyUser;
export const authenticate = authenticateEmail;
