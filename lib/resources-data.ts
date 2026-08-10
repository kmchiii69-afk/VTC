// Default Resources for the portal Resources tab. These replace the external
// Google Doc links that used to be embedded in onboarding/roadmap — the content
// now lives in-app. `lib/resources.ts` seeds these into the `resources` table on
// first access; admins can then edit/add/remove them.
//
// Types:
//  - 'native'   : `body` markdown is rendered in-app
//  - 'embed'    : read-only iframe of `embed_url` (use an embed-safe URL)
//  - 'template' : `body` instructions + "Make your copy" → `template_url`, then
//                 the client fills it out and uploads the result for approval

export type ResourceType = 'native' | 'embed' | 'template';

export interface ResourceDef {
  slug: string;
  title: string;
  description: string;
  category: string;
  type: ResourceType;
  body: string;
  embed_url?: string | null;
  template_url?: string | null;
  // Optional: route the template's "submit for approval" through the existing
  // onboarding upload pipeline (storage + Discord ping + CSM deliverables view).
  upload_step_id?: string | null;
  upload_slot?: string | null;
  sort_order: number;
}

const REFERRAL_BODY = `# Referral Program

Refer other coaches and consultants into the program and get paid when they enrol. Here's exactly how it works.

## What counts as a referral

1. They're an online coach, consultant, or service provider doing **$5k+/month**
2. You personally introduce them to us (DM, group chat, or they mention your name on the booking form)
3. They book a sales call and show up
4. They enrol and make their first payment

**You get paid when step 4 happens.**

## How to make a referral

**Option 1 — Warm DM intro (best).** DM us on Instagram or WhatsApp introducing the person. We take it from there.

> To us: "Hey [SooWei/George], I want to connect you with [Name]. They run a [niche] business doing around [revenue]. They're interested in learning more."
>
> To them: "Hey [Name], I'm connecting you with my guy SooWei. He's helped me [result]. He'll help you from here."

**Option 2 — Group chat.** Create a group chat with you, the referral, and our team. Quick intro, we handle the rest.

**Option 3 — Booking link.** Send them the booking link directly. They just need to mention your name on the form.

## Payout structure

Payouts stack within a 30-day window. The more referrals that close in 30 days, the more you earn per referral.

| Referrals (30-day window) | Standard rate | Standard total | First 30 days rate | First 30 days total |
| --- | --- | --- | --- | --- |
| 1 referral | $2,000 | $2,000 | $3,000 | $3,000 |
| 2 referrals | $3,000 each | $6,000 | $4,000 each | $8,000 |
| 3 referrals | $4,000 each | $12,000 | $5,000 each | $15,000 |
| 4 referrals | $5,000 each | $20,000 | $6,000 each | $24,000 |

**How the 30-day window works**

- The window starts when your first referral's payment clears
- Every referral that closes in that window stacks your rate upward
- After 30 days, the stacking resets — the next referral starts a fresh window

**First 30-day boost.** During your first 30 days as a client, every referral payout is boosted (the table above). It expires automatically after day 30 and reverts to standard rates.

## When you get paid

Your payout mirrors how the referred client pays:

| They pay... | You get paid... |
| --- | --- |
| In full | Full payout, one payment |
| 2-payment plan | Payout split across 2 payments |
| 3-payment plan | Payout split across 3 payments |

Payouts release when the corresponding client payment clears.

## Quick FAQ

**Do I need results before I can refer?** No. The first 30-day boost exists specifically so you can refer immediately.

**What if they don't close?** No payout owed. Your job is just the intro — we handle the rest.

**Can I refer after my program ends?** Yes. The always-on program never expires.

**Is there a limit?** No limit. The stacking model rewards volume — more referrals in a window = higher rate per person.

**How do I track my referrals?** We track everything internally. When your referral closes, we'll confirm the payout amount and timing. DM us anytime for an update.

---

Whoever is in mind right now, send us a DM with your referral's name. We'll handle the rest.`;

const ONBOARDING_BODY = `# Onboarding Overview

**Purpose:** to ensure you are fully onboarded and understand your next steps leading into the program with no difficulty.

## Step 1 — Onboarding email

After your payment goes through, you'll instantly receive an onboarding email at the address you paid with, containing the steps below:

- **Onboarding form** — fill out the details about your business.
- **Join the Goh Consulting Discord** — you'll get a 1-on-1 support channel plus access to the community. As soon as you join your 1-1 channel you'll see extra onboarding steps (booking your 1-1 warmup call, adding the group calls to your calendar) and a welcome message guiding your next steps.
- **Sign your contract.**
- **Access the video modules** — claim the modules, then log in to the client portal with the email you used to claim your course.

## Step 2 — Access your systems

You'll be given access to your roadmap and systems. Go through your roadmap thoroughly so you understand the program before your call.

## Step 3 — Book the onboarding call

Once you're in the Discord, book your onboarding call with your Client Success Manager from your roadmap. Only book after you've completed the previous steps — so you don't waste time on the call.`;

const MARKET_RESEARCH_BODY = `# Market Research & Product Market Fit

**Goal:** understand exactly what product your ideal clients are looking for.

If you haven't sold yet, you NEED to do this part to perfection. Even if you already have a product, market research gives you a full understanding of your product–market fit.

**What is product–market fit?** Creating a product that a market absolutely wants and desires.

## Why this matters

Some offers make thousands of dollars the moment they launch. Others fail no matter how good the content, marketing, and personal brand are. The difference is almost always market research.

## Step-by-step process

**1. Book a free 20-minute call with your ideal client** and offer something free (free access, a story shoutout, a freebie, etc.). Use a note-taker (Fathom, Fireflies, read.ai) and ask:

- What do they struggle with right now, and where do they want to be?
- A short story about themselves — what led them to where they are now? What major events created their interest in your topic?
- What's preventing them from accomplishing their goals on their own?
- "We're thinking about creating an exclusive community for people like you with [pain point] to get [desired result]. What would you like about that?"
- What could we add to that community to make it extremely valuable?
- How much would you pay for a program like this?
- What would someone pay more for? What would make *you* want to pay more?

**2. Fill out your Product Market Fit doc** once you have enough data — this puts everything in one place so you can leverage AI to build your ideal avatar.

**3. Fill out your Offer Positioning** next — find your unique selling point and understand how to market to your followers by leveraging their pain points.

---

Duplicate the doc below, fill it out, then upload your completed version for the team to review.`;

const OFFER_BODY = `# Offer Doc

Define and package your offer. Duplicate the template below and fill in each section:

- **Offer name** — the name of your complete program.
- **Outcome** — the core transformation/result the client gets.
- **Deliverables** — everything included.
- **Coaching structure** — how the coaching/support is delivered.
- **Bonuses** — what's added on top.
- **Guarantees** — any risk-reversal you offer.

A sharp, well-packaged offer is what makes your content and sales actually convert.

---

Duplicate the doc below, fill it out, then upload your completed version for the team to review.`;

export const DEFAULT_RESOURCES: ResourceDef[] = [
  {
    slug: 'onboarding-overview',
    title: 'Onboarding Overview',
    description: 'Your steps and what to expect as you start the program.',
    category: 'Getting Started',
    type: 'native',
    body: ONBOARDING_BODY,
    sort_order: 0,
  },
  {
    slug: 'market-research',
    title: 'Market Research & Product Market Fit',
    description: 'Understand exactly what your ideal clients want — then fill out your PMF doc.',
    category: 'Your Offer',
    type: 'template',
    body: MARKET_RESEARCH_BODY,
    template_url: 'https://docs.google.com/document/d/1Pfxe7y68StDnM3ggkDYh3id5Yi_xJI7nZarNHMt7Kt4/edit?usp=sharing',
    upload_step_id: 'submit-docs',
    upload_slot: 'pmf',
    sort_order: 1,
  },
  {
    slug: 'offer-doc',
    title: 'Offer Doc',
    description: 'Define and package your offer with the template.',
    category: 'Your Offer',
    type: 'template',
    body: OFFER_BODY,
    template_url: 'https://docs.google.com/document/d/181wHjQQ7QmktXgQzvZ4zD5jmLD7-PxQt0YGsmbfts8M/edit?usp=sharing',
    upload_step_id: 'submit-docs',
    upload_slot: 'offer',
    sort_order: 2,
  },
  {
    slug: 'referral-program',
    title: 'Referral Program',
    description: 'How referrals and commissions work — and how to earn while you grow.',
    category: 'Program',
    type: 'native',
    body: REFERRAL_BODY,
    sort_order: 3,
  },
];
