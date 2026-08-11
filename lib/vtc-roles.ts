// VTC seats (team roles) + routing. Pure constants/helpers — safe to import on
// client or server. A team member's team_role maps 1:1 to the stage `owner` they
// handle (see lib/vtc-videos STAGES). Account manager = 'am'.

export const TEAM_ROLES = [
  'am',
  'strategist',
  'lead_strategist',
  'scriptwriter',
  'qa',
  'editor',
  'editor_lead',
  'ops',
  'thumbnail',
] as const;

export type TeamRole = (typeof TEAM_ROLES)[number];

export const TEAM_ROLE_LABELS: Record<string, string> = {
  am: 'Account Manager',
  strategist: 'Strategist',
  lead_strategist: 'Lead Strategist',
  scriptwriter: 'Scriptwriter',
  qa: 'Footage QA',
  editor: 'Editor',
  editor_lead: 'Editor Lead',
  ops: 'Ops / Coordinator',
  thumbnail: 'Thumbnail Designer',
};

export function isTeamRole(v: string | null | undefined): v is TeamRole {
  return !!v && (TEAM_ROLES as readonly string[]).includes(v);
}

export function teamRoleLabel(v: string | null | undefined): string {
  return (v && TEAM_ROLE_LABELS[v]) || 'Team';
}

// Board columns per seat — the slice of the pipeline that seat works, shown as
// kanban columns on /team. Videos whose current stage isn't in a seat's columns
// don't appear on their board (they're before/after that seat's remit).
export const BOARD_COLUMNS: Record<string, string[]> = {
  strategist: ['ideas', 'script_assigned', 'interview', 'scripting', 'record'],
  lead_strategist: ['ideas', 'script_assigned', 'interview', 'scripting', 'record'],
  scriptwriter: ['script_assigned', 'interview', 'scripting', 'record'],
  qa: ['record', 'footage_qa', 'editing'],
  ops: ['footage_qa', 'editing', 'packaging', 'published'],
  editor: ['editing', 'client_review', 'revisions', 'published'],
  editor_lead: ['editing', 'client_review', 'revisions', 'published'],
  thumbnail: ['editing', 'packaging', 'published'],
  am: ['record', 'footage_qa', 'editing', 'client_review', 'revisions', 'published'],
};

// Where a signed-in user lands. Admin → the board; account managers → their
// client-health pod; other team seats → their work board; clients → production.
export function homeRouteFor(role: string | null | undefined, teamRole: string | null | undefined): string {
  if (role === 'admin') return '/admin/production';
  if (teamRole === 'am') return '/admin/clients';
  if (isTeamRole(teamRole)) return '/team';
  return '/production';
}
