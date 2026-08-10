// Native onboarding forms (replace the Typeform links). Schemas are the single
// source of truth for both the form UI and the AI formatting. Field ids are
// stored as keys in onboarding_form_responses.answers, so they MUST stay stable.

export type FieldType = 'short' | 'long' | 'email' | 'number' | 'date' | 'select' | 'phone';

// Long-answer fields require a substantive response before the form continues.
export const MIN_LONG_CHARS = 125;

export interface FormField {
  id: string;
  label: string;
  help?: string;
  type: FieldType;
  options?: string[];        // for 'select'
  required?: boolean;
  placeholder?: string;
  noMin?: boolean;           // long field that skips the MIN_LONG_CHARS minimum (short answers allowed)
}

export type OnboardingFormId = 'primary' | 'secondary' | 'creative';

export interface OnboardingFormDef {
  id: OnboardingFormId;
  title: string;
  subtitle: string;
  groupSize: number;         // questions per card (kept in original sequence)
  fields: FormField[];
}

export const PRIMARY_FORM: OnboardingFormDef = {
  id: 'primary',
  title: 'Onboarding Form',
  subtitle: 'Tell us about you and your business so we can tailor everything to you.',
  groupSize: 4,
  fields: [
    { id: 'name', label: 'Name', type: 'short', required: true },
    { id: 'email', label: 'Email', type: 'email', required: true },
    { id: 'phone', label: 'Phone number', type: 'phone', placeholder: '+1 555 000 0000' },
    { id: 'dob', label: 'Date of Birth', type: 'date' },
    { id: 'handles', label: 'IG Handle and YouTube', type: 'short', placeholder: '@handle · youtube.com/...' },
    { id: 'business_name', label: 'Business Name', type: 'short' },
    { id: 'backstory', label: 'What is your backstory and how did you start your business?', type: 'long' },
    { id: 'found_me', label: 'Where did you first find me?', type: 'select', options: ['Facebook Ads', 'Instagram', 'YouTube', 'TikTok'] },
    { id: 'current_offer', label: 'What is your current offer?', help: 'Include the deliverables, price, promised results, etc.', type: 'long' },
    { id: 'current_team', label: 'What is your current team?', help: 'Do you have appointment setters, closers, or is it just you?', type: 'long', noMin: true },
    { id: 'discord', label: 'Do you have an existing Discord channel?', help: 'If yes, please make info@gohconsulting.com one of the admins.', type: 'short' },
    { id: 'competitors', label: 'Who are your top 3–5 competitors?', help: 'List their names and social media here.', type: 'long', noMin: true },
    { id: 'market_reasons', label: "What are 3–5 reasons your market hasn't been able to achieve their desired outcome?", type: 'long' },
    { id: 'market_desires', label: 'What are 3–5 desires from your market?', type: 'long' },
    { id: 'prioritize', label: 'What specific part of your business do you want us to prioritize?', type: 'long' },
    { id: 'ideal_client', label: 'Who is your ideal client and how do you help them?', type: 'long' },
    { id: 'avg_cash_rev', label: 'Average cash collected and revenue for the last 3 months', type: 'number' },
    { id: 'key_inputs', label: 'What were the key inputs you were working on in the last 3 months?', type: 'long' },
    { id: 'current_mrr', label: "What's your current monthly revenue?", type: 'number' },
    { id: 'target_mrr', label: "What's your target monthly revenue in the next 90 days?", type: 'number' },
    { id: 'bottleneck', label: 'What is the biggest bottleneck holding you back right now?', help: 'e.g. lack of booked calls, lack of content, lack of leads.', type: 'long', noMin: true },
    { id: 'would_pay', label: 'After seeing the initial offer and onboarding, how much would you have paid for this program?', type: 'long', noMin: true },
    { id: 'retargeting_ads', label: 'Were you shown re-targeting ads for post-booking after booking your call? Did you feel they helped you understand the program more and clear your questions?', type: 'long', noMin: true },
  ],
};

export const SECONDARY_FORM: OnboardingFormDef = {
  id: 'secondary',
  title: 'Buyer Mirror Form',
  subtitle: 'Help us mirror exactly why buyers like you decided to say yes.',
  groupSize: 4,
  fields: [
    { id: 'name', label: 'Name', type: 'short', required: true },
    { id: 'first_content', label: 'What was the first piece of content or moment that made you take me seriously?', help: 'A specific video, post, or thing I said that made you think "this person gets it".', type: 'long' },
    { id: 'last_content', label: 'What is the last piece of content you watched that pushed you to book a call?', help: 'Be as specific as possible — the title, topic, or what it was about.', type: 'long' },
    { id: 'follow_duration', label: 'How long did you follow me before booking a call?', type: 'long', noMin: true },
    { id: 'reach_out_reason', label: 'What was the main reason you decided to reach out when you did?', help: 'What changed, or what finally pushed you to book?', type: 'long' },
    { id: 'conviction', label: "Before our call, how convinced were you that you'd sign up?", help: '1 = not at all / 10 = 100% certain', type: 'number' },
    { id: 'hesitations', label: 'What were your biggest hesitations before joining?', help: 'Cost, trust, timing, results, something else?', type: 'long' },
    { id: 'why_me', label: 'There are other coaches who help with content and branding. Why me specifically?', help: 'What was different about working with me vs. the alternatives you considered?', type: 'long' },
    { id: 'right_person', label: 'What did I say or show in my content that made you think "he\'s the right person for this"?', help: 'A quote, a concept, a story — anything specific.', type: 'long' },
    { id: 'problem', label: 'What problem were you trying to solve when you found me?', help: 'In your own words — not the "official" version. What was actually frustrating you?', type: 'long' },
    { id: 'surprise', label: "What part of the program surprised you — something valuable you didn't realise was included?", type: 'long' },
    { id: 'invested', label: 'How much did you invest into the program?', help: 'Total amount you invested upfront.', type: 'number' },
    { id: 'would_pay_realistic', label: 'How much would you have realistically paid?', help: 'Would you have paid a higher price? If so, how much?', type: 'number' },
    { id: 'success_6mo', label: 'What does success look like for you 6 months from now?', type: 'long' },
    { id: 'weird_reason', label: 'Is there anything weird, random, or unexpected about why you chose to work with me?', type: 'long' },
  ],
};

// The Creative Specialist onboarding form — the ONLY onboarding step members
// tagged `creative_specialist` complete (see lib/onboarding-variant.ts). Sourced
// from the "CD Onboarding Questions" doc: their setup, their content operation,
// and the numbers behind the brand they work on.
//
// Field ids are deliberately shared with PRIMARY_FORM where the question is the
// same (name, email, phone, handles, current_offer, ideal_client, current_mrr,
// avg_cash_rev, key_inputs, target_mrr, bottleneck) so account prefill and the AI
// context read the same keys across both forms.
export const CREATIVE_FORM: OnboardingFormDef = {
  id: 'creative',
  title: 'Creative Specialist Onboarding Form',
  subtitle: 'Your setup, your content operation, and the brand you build for — everything we need to plug into your workflow.',
  groupSize: 4,
  fields: [
    { id: 'name', label: 'Name', type: 'short', required: true },
    { id: 'email', label: 'Email', type: 'email', required: true },
    { id: 'phone', label: 'Phone', type: 'phone', placeholder: '+1 555 000 0000' },
    { id: 'location', label: 'Location / time zone', type: 'short', placeholder: 'Sydney, AEST' },

    { id: 'founder_brand', label: 'Which founder / brand do you work on?', type: 'short' },
    { id: 'work_mode', label: 'Do you work with the founder in person or online?', type: 'select', options: ['In person', 'Online', 'Both'] },
    { id: 'employment', label: 'What is your employment arrangement?', type: 'select', options: ['Full time', 'Part time', 'Contractor', 'Agency'] },
    { id: 'handles', label: 'Your IG and YouTube handles', type: 'short', placeholder: '@handle · youtube.com/...' },

    { id: 'content_team', label: 'What is your current content team?', help: 'Editors, clippers, designers, social media managers — list who is on the team and what they do.', type: 'long', noMin: true },
    { id: 'reporting_line', label: 'Who do you report to, and who reports to you?', type: 'long', noMin: true },
    { id: 'posting_cadence', label: 'How often are you posting right now?', help: 'For both Instagram and YouTube.', type: 'long', noMin: true },
    { id: 'pre_production', label: 'Run me through your current pre-production workflow', help: 'How you research, ideate, script and prepare to film.', type: 'long' },

    { id: 'post_production', label: 'Run me through your current post-production workflow', help: 'Once the content is filmed — how does it get uploaded, edited and posted?', type: 'long' },
    { id: 'filming_frequency', label: 'How often do you film with the founder?', help: 'Do you have a filming schedule you follow?', type: 'long', noMin: true },
    { id: 'founder_hours', label: 'How many hours per week does the founder currently spend on content?', help: 'Ideating, scripting, filming, reviewing and approving.', type: 'number' },
    { id: 'revision_rounds', label: 'How many revision rounds do you go through before publishing?', type: 'number' },

    { id: 'editor_placement', label: 'Do you require editor placement?', type: 'select', options: ['Yes', 'No', 'Not sure yet'] },
    { id: 'sop_coverage', label: 'How much of your content workflow is documented into SOPs for the team or new hires?', type: 'long', noMin: true },
    { id: 'proud_content', label: "Link 3 pieces of content you directed or edited that you're proudest of", help: 'One line on why, for each.', type: 'long' },
    { id: 'weak_content', label: "Link one piece you know isn't good enough", help: "And say exactly what's wrong with it.", type: 'long', noMin: true },

    { id: 'clipping', label: 'Do you clip your long form into short form?', help: 'How much of your short form comes from clipping?', type: 'long', noMin: true },
    { id: 'content_storage', label: 'Where is all your content stored?', help: 'Frame.io, Google Drive, Dropbox…', type: 'short' },
    { id: 'workflow_storage', label: 'Where do you store your content workflows and SOPs?', help: 'Research, ideas, scripts.', type: 'short' },
    { id: 'camera_gear', label: 'What camera gear do you have access to?', help: 'If you help with filming.', type: 'long', noMin: true },

    { id: 'current_offer', label: 'What is the current offer?', help: 'Include the deliverables, price, promised results.', type: 'long' },
    { id: 'ideal_client', label: 'Who is your ideal client and what do you do for them?', help: 'The brand’s ICP.', type: 'long' },
    { id: 'unique_mechanism', label: 'What is the main advantage or unique mechanism this brand has?', type: 'long' },
    { id: 'working_flopping', label: 'What content is working really well right now, and what is flopping?', type: 'long' },

    { id: 'content_bottleneck', label: 'What is the biggest bottleneck in your content operation right now?', type: 'long', noMin: true },
    { id: 'hardest_part', label: 'What part of this role do you find hardest?', type: 'long', noMin: true },
    { id: 'current_mrr', label: "What is the business's current monthly revenue?", type: 'number' },
    { id: 'avg_cash_rev', label: 'Average cash collected and revenue for the last 3 months', type: 'number' },

    { id: 'key_inputs', label: 'What were the key inputs you were working on over those 3 months?', type: 'long', noMin: true },
    { id: 'target_mrr', label: 'What is the target monthly revenue in the next 90 days?', type: 'number' },
    { id: 'bottleneck', label: 'What is the biggest bottleneck holding you back right now?', help: 'e.g. lack of booked calls, lack of content, lack of leads.', type: 'long', noMin: true },
    { id: 'success_definition', label: 'What is your definition of success from this partnership?', type: 'long' },
  ],
};

export const ONBOARDING_FORMS: Record<OnboardingFormId, OnboardingFormDef> = {
  primary: PRIMARY_FORM,
  secondary: SECONDARY_FORM,
  creative: CREATIVE_FORM,
};

export function getForm(id: string): OnboardingFormDef | null {
  return id in ONBOARDING_FORMS ? ONBOARDING_FORMS[id as OnboardingFormId] : null;
}

// Chunk a form's fields into ordered groups of `groupSize` (1–4, 5–8, …).
export function formGroups(form: OnboardingFormDef): FormField[][] {
  const groups: FormField[][] = [];
  for (let i = 0; i < form.fields.length; i += form.groupSize) {
    groups.push(form.fields.slice(i, i + form.groupSize));
  }
  return groups;
}

// Render a saved response as readable text for the AI (label: answer).
export function formatFormForAI(form: OnboardingFormDef, answers: Record<string, unknown>): string {
  const lines = form.fields
    .map((f) => {
      const v = answers[f.id];
      if (v === undefined || v === null || v === '') return null;
      return `${f.label} ${v}`;
    })
    .filter(Boolean);
  return lines.length ? `${form.title}:\n${lines.join('\n')}` : '';
}
