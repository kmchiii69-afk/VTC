export type SopGroup = 'content' | 'offer' | 'cash-injection' | 'fulfillment' | 'systems' | 'creative-specialist';

export interface SopEntry {
  badge: string;
  title: string;
  sub: string;
  group: SopGroup;
  div: string;
  /** Path to the SOP PDF under /public. Every SOP is a document now. */
  file: string;
  /* ── Legacy optional fields ──────────────────────────────────────────────
   * The older SOP library was text-based (rule/pts/steps/…); the AI agent + chat
   * routes still read these optionally when scoring/formatting SOPs. Kept
   * optional so those routes stay type-safe — PDF entries simply omit them. */
  rule?: string;
  pts?: string[];
  steps?: string[];
  prompts?: string[];
  script?: string;
  modules?: { num: number; title: string }[];
}

/* The SOP library is a set of PDF modules served from /public/sops. Grouped by
 * division so the /sops page can tab/filter them like before. */
export const SOPS: SopEntry[] = [

  // ─── CONTENT ────────────────────────────────────────────────────────────────
  // First in the group deliberately: it frames what the rest of the content SOPs
  // are for. Cards render in array order, so this is what a member sees first.
  {
    badge: '21', group: 'content', div: 'Foundations',
    title: 'Setting The Expectation',
    sub: 'Test formats until one amplifies your character, then reverse-engineer why clients buy.',
    file: '/sops/setting-the-expectation.pdf',
  },
  {
    badge: '01', group: 'content', div: 'Strategy',
    title: 'Clipping Viral Content',
    sub: 'Find, clip, and repurpose viral moments to ride attention that already exists.',
    file: '/sops/clipping-viral-content.pdf',
  },
  {
    badge: '02', group: 'content', div: 'Strategy',
    title: 'Reverse Engineering & Doubling Down On Outliers',
    sub: 'Analyze your top-performing posts and systematically scale what works.',
    file: '/sops/reverse-engineering-outliers.pdf',
  },
  {
    badge: '03', group: 'content', div: 'Production',
    title: 'Content Production Workflow',
    sub: 'The end-to-end system for producing high-quality content at volume.',
    file: '/sops/content-production-workflow.pdf',
  },
  {
    badge: '04', group: 'content', div: 'Production',
    title: 'Master B-Roll',
    sub: 'Build a reusable B-roll library so edits are faster and more dynamic.',
    file: '/sops/master-b-roll.pdf',
  },
  {
    badge: '05', group: 'content', div: 'Production',
    title: 'Short Form Editor Training SOP',
    sub: 'Train editors to cut high-retention short-form video to your standard.',
    file: '/sops/short-form-editor-training-sop.pdf',
  },
  {
    badge: '06', group: 'content', div: 'Funnel',
    title: 'Top of Funnel Content SOP',
    sub: 'Attention-first content that reaches and hooks cold audiences.',
    file: '/sops/tof-content-sop.pdf',
  },
  {
    badge: '07', group: 'content', div: 'Funnel',
    title: 'Middle of Funnel Content SOP',
    sub: 'Nurture warm viewers and move them toward booking a call.',
    file: '/sops/mof-content-sop.pdf',
  },
  {
    badge: '08', group: 'content', div: 'Story',
    title: 'Story Sequences',
    sub: 'Structure Instagram story sequences that build trust and convert.',
    file: '/sops/story-sequences.pdf',
  },
  {
    badge: '09', group: 'content', div: 'Long-Form',
    title: 'YouTube Video Launch Story Sequences',
    sub: 'Story sequences to launch and promote a new YouTube video.',
    file: '/sops/youtube-launch-story-sequences.pdf',
  },
  {
    badge: '10', group: 'content', div: 'Profile',
    title: 'Optimized IG Profile',
    sub: 'Turn your Instagram profile into a conversion asset.',
    file: '/sops/optimized-ig-profile.pdf',
  },
  {
    badge: '11', group: 'content', div: 'Brand',
    title: 'Visual Identity',
    sub: 'Define a consistent, recognizable visual brand across your content.',
    file: '/sops/visual-identity.pdf',
  },

  // ─── OFFER ──────────────────────────────────────────────────────────────────
  {
    badge: '12', group: 'offer', div: 'Positioning',
    title: 'Crafting An Irresistible Offer',
    sub: 'Build an offer prospects feel stupid saying no to.',
    file: '/sops/crafting-an-irresistible-offer.pdf',
  },
  {
    badge: '13', group: 'offer', div: 'Positioning',
    title: 'Product-Market Fit',
    sub: 'Validate that your offer matches real, paying market demand.',
    file: '/sops/product-market-fit.pdf',
  },
  {
    badge: '14', group: 'offer', div: 'Pricing',
    title: 'Pricing Your Offer',
    sub: 'Price for value and profit without scaring off buyers.',
    file: '/sops/pricing-your-offer.pdf',
  },
  {
    badge: '15', group: 'offer', div: 'Structure',
    title: 'Bonus & Guarantees',
    sub: 'Stack bonuses and guarantees that remove risk and close the sale.',
    file: '/sops/bonus-and-guarantees.pdf',
  },
  {
    badge: '16', group: 'offer', div: 'Sales',
    title: 'Offer Pitch Deck',
    sub: 'The deck for presenting your offer cleanly on a sales call.',
    file: '/sops/offer-pitch-deck.pdf',
  },

  // ─── CASH INJECTION ───────────────────────────────────────────────────────────
  {
    badge: '17', group: 'cash-injection', div: 'Campaigns',
    title: 'Cash Injection',
    sub: 'Run a short, focused campaign to generate fast revenue.',
    file: '/sops/cash-injection.pdf',
  },
  {
    badge: '20', group: 'cash-injection', div: 'Execution',
    title: 'Actionable Checklist',
    sub: 'The master checklist of actions to execute, step by step.',
    file: '/sops/actionable-checklist.pdf',
  },
  {
    badge: '18', group: 'cash-injection', div: 'Lead Nurturing',
    title: 'Revive Past Leads',
    sub: 'Re-engage old leads and turn them back into booked calls.',
    file: '/sops/revive-past-leads.pdf',
  },

  // ─── FULFILLMENT ──────────────────────────────────────────────────────────────
  {
    badge: '19', group: 'fulfillment', div: 'Client Success',
    title: 'Maximizing Goh Consulting',
    sub: 'How clients get the most out of the program.',
    file: '/sops/maximizing-goh-consulting.pdf',
  },
];

/**
 * What each SOP is called in the Google Drive folder the SOP-finder Discord bot
 * indexes, keyed by badge.
 *
 * The bot extracts PDF text from Drive — that text is the only strong matching
 * signal a document has — but members should be sent to the portal, not to Drive.
 * `/api/bot/catalog` ships these names so the bot can recognise a Drive file as a
 * SOP we already serve, and merge the two into one entry: Drive's text for
 * matching, our `/sops?sop=<badge>` link for the reply.
 *
 * Most of these already normalise to the SOP title, so they'd match without being
 * listed. They're listed anyway so the intended pairing is written down somewhere
 * auditable — if a Drive file is renamed, the bot falls back to matching on title,
 * and only reverts to a Drive link if that fails too.
 *
 * Every file in the Drive folder is now paired with an in-app SOP, so the finder
 * has no reason left to hand out a Drive link. Anything added to Drive without
 * being added here still falls back to one.
 */
export const SOP_DRIVE_NAMES: Record<string, string[]> = {
  '21': ['Setting The Expectation.pdf'],
  '01': ['CLIPPING VIRAL CONTENT.pdf'],
  '02': ['Reverse Engineering & Doubling Down On Outliers.pdf'],
  '03': ['Content Production Workflow.pdf'],
  '04': ['Master B-Roll.pdf'],
  '05': ['Short Form Editor Training SOP.pdf'],
  // Drive uses the TOF/MOF abbreviations; the library spells them out, so these
  // two would NOT match on title alone.
  '06': ['TOF-Content-SOP.pdf'],
  '07': ['MOF-Content-SOP.pdf'],
  '08': ['Story Sequences.pdf'],
  '09': ['YouTube Video Launch Story Sequences.pdf'],
  '10': ['Optimized IG Profile.pdf'],
  '11': ['Visual-Identity.pdf'],
  '12': ['Crafting An Irresistible Offer.pdf'],
  '13': ['Product-Market-Fit.pdf'],
  '14': ['Pricing Your Offer.pdf'],
  '15': ['Bonus & Guarantees.pdf'],
  '16': ['Offer Pitch Deck .pdf'],           // the trailing space is really in Drive
  '17': ['Cash Injection.docx.pdf'],         // converted from .docx, so a double extension
  '18': ['Revive Past Leads.pdf'],
  '19': ['Maximizing Goh Consulting.pdf'],
  '20': ['Actionable Checklist.pdf'],
};

export const GROUP_LABELS: Record<SopGroup, string> = {
  content: 'Content',
  offer: 'Offer',
  'cash-injection': 'Cash Injection',
  fulfillment: 'Fulfillment',
  systems: 'Systems',
  'creative-specialist': 'Creative Specialist',
};
