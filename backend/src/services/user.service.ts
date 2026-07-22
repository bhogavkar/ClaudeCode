import type { Prisma, SystemRole } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';

const publicSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  avatarUrl: true,
  isActive: true,
  provider: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export async function listUsers(params: { page?: number; pageSize?: number; search?: string }) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const where: Prisma.UserWhereInput = params.search
    ? {
        OR: [
          { name: { contains: params.search, mode: 'insensitive' } },
          { email: { contains: params.search, mode: 'insensitive' } },
        ],
      }
    : {};

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: publicSelect,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { total, page, pageSize, users };
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: publicSelect });
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

export function updateUserRole(id: string, role: SystemRole) {
  return prisma.user.update({ where: { id }, data: { role }, select: publicSelect });
}

export function setUserActive(id: string, isActive: boolean) {
  return prisma.user.update({ where: { id }, data: { isActive }, select: publicSelect });
}
