import { UserRole } from '@prisma/client';

export type AuthenticatedUser = {
  sub: string;
  email: string;
  role: UserRole;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; displayName: string; role: string };
};
