import type { Role } from '../shared/api';

export interface AccountRow {
  id: string;
  role: Role;
  email: string | null;
  username: string | null;
  display_name: string;
  clerk_user_id: string | null;
  active: number;
  created_at: string;
}

export type Bindings = Env & { CLERK_SECRET_KEY: string };

export type AppEnv = {
  Bindings: Bindings;
  Variables: { account: AccountRow };
};
