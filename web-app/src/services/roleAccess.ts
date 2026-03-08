import type { AppUserRole } from './userAccessService';

/** Tabs the app supports */
export type AppTab = 'dashboard' | 'planning' | 'container' | 'approvals' | 'spec' | 'data';

/** Tabs each role is allowed to access */
const ROLE_TABS: Record<AppUserRole, readonly AppTab[]> = {
  PROCUREMENT_TEAM: ['dashboard', 'planning', 'container', 'approvals', 'spec', 'data'],
  APPROVER: ['dashboard', 'approvals'],
};

/** Check whether a role may open a given tab */
export const canAccessTab = (role: AppUserRole, tab: AppTab): boolean =>
  ROLE_TABS[role]?.includes(tab) ?? false;

/** Get the ordered list of tabs a role should see in the sidebar */
export const getAllowedTabs = (role: AppUserRole): readonly AppTab[] =>
  ROLE_TABS[role] ?? ROLE_TABS.PROCUREMENT_TEAM;

/** Returns true when the given role can take approve/reject actions */
export const canApproveReject = (role: AppUserRole): boolean => role === 'APPROVER';
