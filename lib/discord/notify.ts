import type { IcpAnalysis } from '@/lib/ai/analyze';

// Pings a specific Discord channel when a member submits a form or uploads a
// deliverable. Each submission type routes to its own channel webhook (set in
// env). Best-effort: a missing webhook or a failed POST never breaks the flow.
export async function sendSubmissionNotice(opts: {
  webhookUrl: string | undefined;
  who: string;        // member name or email
  label: string;      // e.g. "Onboarding Form", "Offer Doc"
  link?: string;      // link to view the submission (form answers / the PDF)
  linkLabel?: string; // e.g. "View submission", "Open PDF"
}): Promise<void> {
  const url = opts.webhookUrl?.trim();
  if (!url) return;
  const link = opts.link?.trim();
  const linkLabel = opts.linkLabel || 'View submission';
  const content = `**${opts.who}** has submitted their **${opts.label}**${link ? `\n${linkLabel}: ${link}` : ''}`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: content.slice(0, 1900),
      allowed_mentions: { parse: [] },
      embeds: [{
        title: `${opts.label} submitted`,
        ...(link ? { url: link } : {}),  // makes the embed title clickable
        color: 0xc9a455,
        fields: [
          { name: 'Member', value: opts.who },
          ...(link ? [{ name: linkLabel, value: link }] : []),
        ],
        timestamp: new Date().toISOString(),
      }],
    }),
  }).catch(() => {});
}

// Notifies the team channel when a client finishes a roadmap phase. Uses a
// channel webhook (DISCORD_ROADMAP_WEBHOOK_URL, falling back to DISCORD_WEBHOOK_URL).
// Posts the message WITHOUT pinging/tagging anyone (no role/user mentions).
export async function sendRoadmapPhaseComplete(opts: {
  clientName: string;
  clientEmail: string;
  phaseLabel: string;
  phaseTitle: string;
}): Promise<void> {
  const webhookUrl = process.env.DISCORD_ROADMAP_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const who = opts.clientName || opts.clientEmail;
  const content = `**${who}** just completed **${opts.phaseLabel}: ${opts.phaseTitle}** of their roadmap!`;

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: content.slice(0, 1900),
      // Never ping anyone on a roadmap completion.
      allowed_mentions: { parse: [] },
      embeds: [{
        title: 'Roadmap stage completed',
        color: 0xc9a455,
        fields: [
          { name: 'Client', value: `${opts.clientName || '—'}\n${opts.clientEmail}`, inline: true },
          { name: 'Stage', value: `${opts.phaseLabel} — ${opts.phaseTitle}`, inline: true },
        ],
        timestamp: new Date().toISOString(),
      }],
    }),
  }).catch(() => {});
}

// Notifies the team when someone requests access via self-serve signup. The
// account is created 'pending' and can't sign in until an admin approves it in
// the admin panel — this is just the heads-up. Posts to DISCORD_SIGNUP_WEBHOOK_URL
// (falling back to DISCORD_WEBHOOK_URL). Best-effort: never breaks the signup.
export async function sendSignupApprovalRequest(opts: {
  name: string;
  email: string;
}): Promise<void> {
  const webhookUrl = process.env.DISCORD_SIGNUP_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  const adminLink = appUrl ? `${appUrl}/admin` : undefined;
  const who = opts.name || opts.email;
  const content = `**${who}** requested access — approve or reject them in the admin panel.`;

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: content.slice(0, 1900),
      allowed_mentions: { parse: [] },
      embeds: [{
        title: 'New signup — approval needed',
        ...(adminLink ? { url: adminLink } : {}),
        color: 0xc9a455,
        fields: [
          { name: 'Name', value: opts.name || '—', inline: true },
          { name: 'Email', value: opts.email, inline: true },
          ...(adminLink ? [{ name: 'Review', value: `[Open admin panel](${adminLink})` }] : []),
        ],
        timestamp: new Date().toISOString(),
      }],
    }),
  }).catch(() => {});
}

export async function sendCallReport(
  reportId: string,
  leadName: string,
  analysis: IcpAnalysis,
  appUrl: string
): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const color = analysis.icp_score >= 80 ? 0x00c851 : analysis.icp_score >= 60 ? 0xffbb33 : 0xff4444;
  const label = analysis.icp_score >= 80 ? 'Strong Fit' : analysis.icp_score >= 60 ? 'Moderate Fit' : 'Weak Fit';

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{
        title: `Call Analysis: ${leadName}`,
        color,
        url: `${appUrl}/reports/${reportId}`,
        fields: [
          { name: 'ICP Score', value: `**${analysis.icp_score}/100** — ${label}`, inline: false },
          { name: 'Call Summary', value: analysis.call_summary, inline: false },
          { name: 'Pain Points', value: analysis.pain_points.map((p) => `- ${p}`).join('\n') || 'None', inline: false },
          { name: 'Objections', value: analysis.objections.map((o) => `- ${o}`).join('\n') || 'None', inline: true },
          { name: 'Strengths', value: analysis.strengths.map((s) => `- ${s}`).join('\n') || 'None', inline: true },
          { name: 'BANT', value: `**Budget:** ${analysis.budget_signals}\n**Authority:** ${analysis.authority_signals}\n**Need:** ${analysis.need_signals}\n**Timeline:** ${analysis.timeline_signals}`, inline: false },
          { name: 'Next Step', value: `**${analysis.next_step}**`, inline: false },
        ],
        footer: { text: `Report ID: ${reportId} - Click to view & give feedback` },
        timestamp: new Date().toISOString(),
      }],
    }),
  });
}
