import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique } } }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));

import { authenticateEmail } from '@/lib/study-auth';

describe('study authentication', () => {
  beforeEach(() => findUnique.mockReset());

  it('authenticates only an existing active user by exact email', async () => {
    findUnique.mockResolvedValue({ id: 'u1', email: 'person@example.com', isActive: true });
    await expect(authenticateEmail('person@example.com')).resolves.toMatchObject({ id: 'u1' });
    expect(findUnique).toHaveBeenCalledWith({ where: { email: 'person@example.com' } });
  });

  it('rejects missing, inactive, and non-string emails', async () => {
    await expect(authenticateEmail('')).resolves.toBeNull();
    await expect(authenticateEmail(null as never)).resolves.toBeNull();
    findUnique.mockResolvedValue({ id: 'u1', email: 'person@example.com', isActive: false });
    await expect(authenticateEmail('person@example.com')).resolves.toBeNull();
  });
});
