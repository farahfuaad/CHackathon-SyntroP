export type AppUserRole = 'PROCUREMENT_TEAM' | 'APPROVER';

export type AuthenticatedUser = {
  id: string;
  username: string;
  email: string;
  password: string;
  role: AppUserRole;
  createdAt: string;
};

type UserAccessRow = {
  user_id: number;
  username: string;
  user_email: string;
  password: string;
  role_id: number;
};

type AccessRoleRow = {
  role_id: number;
  role_name?: string | null;
};

const REST_BASE_CANDIDATES = [
  import.meta.env.VITE_REST_BASE_URL, // optional override
  '/rest',                            // Vite proxy (local)
  '/data-api/rest',                   // SWA path
].filter(Boolean) as string[];

const buildUrl = (base: string, path: string) => `${base.replace(/\/$/, '')}${path}`;
const esc = (v: string) => v.replace(/'/g, "''");

const mapRole = (roleId: number, roleName?: string | null): AppUserRole => {
  const name = (roleName || '').trim().toLowerCase();
  if (name.includes('procurement')) return 'PROCUREMENT_TEAM'; // role_id 1
  if (name.includes('approver')) return 'APPROVER';            // role_id 2
  if (roleId === 1) return 'PROCUREMENT_TEAM';
  return 'APPROVER';
};

async function getJson(url: string) {
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (res.status === 404) return { notFound: true as const, data: null };
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Request failed: ${res.status} [${url}] ${body}`);
  }

  const data = await res.json();
  return { notFound: false as const, data };
}

function asArray<T>(payload: any): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (Array.isArray(payload?.value)) return payload.value as T[];
  return [];
}

export async function authenticateUserByDb(
  email: string,
  plainPassword: string
): Promise<AuthenticatedUser | null> {
  let lastErr = '';

  for (const base of REST_BASE_CANDIDATES) {
    try {
      // 1) user lookup (NO expand)
      const uq = new URLSearchParams();
      uq.set('$filter', `user_email eq '${esc(email)}'`);
      uq.set('$first', '1');
      uq.set('$select', 'user_id,username,user_email,password,role_id');

      const userResp = await getJson(buildUrl(base, `/UserAccess?${uq.toString()}`));
      if (userResp.notFound) {
        lastErr = 'UserAccess endpoint not found';
        continue;
      }

      const users = asArray<UserAccessRow>(userResp.data);
      const row = users[0];
      if (!row) return null;
      if (String(row.password) !== String(plainPassword)) return null;

      // 2) role lookup from AccessRoles table
      const rq = new URLSearchParams();
      rq.set('$filter', `role_id eq ${row.role_id}`);
      rq.set('$first', '1');
      rq.set('$select', 'role_id,role_name');

      const roleResp = await getJson(buildUrl(base, `/AccessRoles?${rq.toString()}`));
      const roles = roleResp.notFound ? [] : asArray<AccessRoleRow>(roleResp.data);
      const roleName = roles[0]?.role_name ?? null;

      return {
        id: String(row.user_id),
        username: row.username,
        email: row.user_email,
        password: row.password,
        role: mapRole(row.role_id, roleName),
        createdAt: new Date().toISOString(),
      };
    } catch (e: any) {
      lastErr = e?.message || 'Unknown auth error';
    }
  }

  throw new Error(`UserAccess lookup failed. ${lastErr}`);
}