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

// Where a signed-in user lands. Admin → the board; any team seat → their queue;
// everyone else (clients) → their production roadmap.
export function homeRouteFor(role: string | null | undefined, teamRole: string | null | undefined): string {
  if (role === 'admin') return '/admin/production';
  if (isTeamRole(teamRole)) return '/team';
  return '/production';
}
