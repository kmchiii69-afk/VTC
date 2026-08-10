// Native, in-app versions of the roadmap PDF guides (converted from the client's
// "Consulting Mastery" PDFs, rebranded to Goh Consulting). Linked from roadmap
// steps via `/guides/<slug>` and rendered with the Markdown component. Images
// extracted from the PDFs live in /public/roadmap-guides/<slug>/.

export interface RoadmapGuide {
  slug: string;
  title: string;
  blurb: string; // one-line eyebrow shown under the title
  body: string;  // markdown
}

const GUIDES: RoadmapGuide[] = [
  {
    slug: 'visual-identity',
    title: 'Visual Identity Optimisation',
    blurb: 'Make every piece of content look like it belongs to a brand your ICP already trusts.',
    body: `## Why your visual identity matters

Your visual identity is the first impression your content makes — and it decides whether someone stops scrolling and sticks around long enough to actually hear your message.

You can have the sharpest insight, the strongest offer and the clearest messaging, but if your content looks low-effort, your audience will assume the same about your expertise.

A strong visual identity does the opposite: it signals authority instantly and earns you the right to be heard.

**Goal:** make every piece of content look like it belongs to a brand your ICP already trusts.

## The 5 pillars of visual identity

1. **Environment & location** — the space behind you. It should be clean, intentional, and reflect the world your ICP wants to be part of.
2. **Lighting** — the single biggest upgrade you can make. Good lighting makes cheap gear look expensive; bad lighting makes expensive gear look cheap.
3. **Camera quality** — sharp, stable, well-framed footage. Your phone is more than enough when it's used properly.
4. **Audio** — the most overlooked pillar, and often the most important. People forgive average video; they don't forgive bad audio.
5. **How you dress** — your wardrobe is part of your brand. Dress like the person your ICP aspires to become.

## Pillar optimisation

### Environment & location
- Film in a clean, uncluttered space that reflects your brand and niche.
- Strip anything distracting out of the background.
- Lock in 2–3 go-to locations so you can film consistently without overthinking your setup.

### Lighting
- Use natural light where you can: face a window, never sit with it behind you.
- Filming indoors or at night? A simple key light keeps your face evenly lit.
- The rule: your face should be the brightest, clearest thing in the frame.

### Camera quality
- Film in 4K wherever possible — your phone shoots 4K and is completely fine.
- Frame yourself using the rule of thirds and keep the camera at eye level.
- Keep the shot stable with a tripod or a steady surface.

### Audio
- Get a dedicated mic: a clip-on mic (such as a DJI Mic) instantly lifts your audio quality.
- Film somewhere with minimal echo and background noise.
- Clean it up in post: tools like Adobe Podcast sharpen your audio in seconds.

### How you dress
- Build a rotation of 5–10 on-brand outfits so you always look consistent.
- Stick to a colour palette that matches your brand.
- Exaggerate your image: a slightly sharper, more intentional version of how you already show up.

## 1st impression checklist

Before you hit record, run through this:
- Is my background clean, intentional and on-brand?
- Is my face the brightest, clearest thing in the frame?
- Is my footage sharp, stable and framed at eye level?
- Is my audio clean, clear and free of echo?
- Does my outfit match my brand and my ICP's aspirations?
- Does this look like it belongs to a brand my ICP already trusts?`,
  },
  {
    slug: 'ig-profile',
    title: 'Optimised IG Profile',
    blurb: 'Your Instagram is your funnel — be intentional about every part of it.',
    body: `## Why your profile matters

**Goal:** stand out from your market, create a first impression that sparks curiosity, and get people to want your help.

Your Instagram is your funnel. You have to be extremely intentional about every aspect — your profile picture, bio, pinned posts, everything. This could be the determining factor on whether someone chooses to work with you.

## Fundamentals

### Profile picture
A very clean profile picture, ideally of you smiling — something memorable that your audience will like.

![Profile picture examples](/roadmap-guides/ig-profile/pfp-1.png)

![Profile picture examples](/roadmap-guides/ig-profile/pfp-2.png)

### Instagram bio
- State what you do
- Why you're good at what you do
- A URL Genius link straight to YouTube

![Bio example](/roadmap-guides/ig-profile/bio.png)

### Story highlights
Use highlights to carry your story, your client results, and the life your ICP aspires to.

![Story highlights example](/roadmap-guides/ig-profile/highlights.png)

## Required pinned posts

### 1. My story video
An in-depth video breaking down your story.

### 2. "I made it" moment
A moment where you achieve a goal that your audience aspires to achieve — for example:
- Telling your mom how much you made in a month
- Buying a car for yourself
- Buying a big gift for a loved one

![I made it moment example](/roadmap-guides/ig-profile/pinned.png)

**Why it works**
- It's a desired outcome that everyone wants — not just your ICP, but your dream follower.
- It peaks huge curiosity ("how did this person make that?").
- It positions you as an authority — proof you've achieved something your ICP wants.

**How to do it**
1. Find out what outcome your audience truly wants.
2. Capture that moment in an authentic, natural way.
3. Edit and be intentional with the visual hook.
4. Post it.

### 3. Client testimonials
A compilation of clients talking about you and the transformations you helped them with.

**Why it works**
- Proof is the one piece of marketing that triumphs everything — show, don't tell.
- In a time where claims are made everywhere by everyone, you stand out by showing what you've done for clients.

**How to do it**
1. Gather all your client interviews (if you have none, schedule 5 right now).
2. Get your editor to clip the best parts of the interviews — the single best moments where clients express the most emotion about how you changed their lives. This isn't a regular reel; you'll pin it and it'll be the first thing many people see.
3. Post it and build an immense amount of trust.

### 4. Carousel: unique mechanism + case studies + CTA
Explain your unique mechanism, show client case studies, and CTA to a freebie.

**Why it works**
- It explains exactly why your unique mechanism is different from anything they've tried.
- It shows your best case studies as proof it works.
- It sparks curiosity and creates the first touch point by sending them a freebie — then you continue the conversation and book them in.

**How to do it**
1. **Visual hook** — a desired outcome you have + a common obstacle your audience faces.
2. **Showcase the benefit** of the desired outcome (lifestyle, work, relationships, the things you and your audience care about).
3. **Break down the process** that leads to the desired outcome (step 1, 2, 3).
4. **Name the workflow** and spark curiosity (e.g. "I created an X system that got me A+ clients").
5. **Back it up with testimonials** (X did it and achieved this, Y did the same…).
6. **CTA** — "If you want to learn exactly how I did this, comment 'KEYWORD' and I'll send it to you."

![Profile note example](/roadmap-guides/ig-profile/note.png)`,
  },
  {
    slug: 'messaging-pillars',
    title: 'Content Messaging Pillars',
    blurb: 'The handful of core themes you consistently create content around.',
    body: `## What are content messaging pillars?

Your content messaging pillars are the handful of core themes you consistently create content around. They're the topics, angles and ideas that build a complete picture of who you are and why someone should trust you.

## Why one-dimensional brands stay invisible

1. **Most creators only ever post one type of content: value.** Tips, how-tos and frameworks are useful — but they're forgettable and easy to copy. People don't buy from the most useful account; they buy from the one they feel they know.
2. **A strong brand is multi-dimensional.** It gives your audience reasons to admire you, relate to you, believe you, and ultimately trust you. Your messaging pillars are how you cover all of those dimensions on purpose instead of by accident.

## Your pillar dimensions

Build your pillars so that, across a month of content, you're hitting each of these:

- **Expertise** — the value, insights and frameworks that prove you know your craft.
- **Transformation** — the results and journeys (yours and your clients') that show what's possible.
- **Story & journey** — where you came from, what you've been through, the path that got you here.
- **Values & beliefs** — your contrarian takes and the standards you hold. This is what makes people pick a side.
- **Lifestyle & personality** — the human behind the brand. What people like about you in real life that they've never seen on camera.

## How to define your pillars

1. **Revisit your Dream Follower & ICP work** — your pillars exist to move them from their current situation to their desired outcome.
2. **List the 3–5 themes** you could talk about endlessly that directly relate to the transformation you sell.
3. **Pressure-test each one** against the dimensions above — if every pillar is "expertise", you're one-dimensional.
4. **Find your unique mechanisms** — the reasons people should admire and believe you that no competitor can copy. Bake these into your pillars.
5. **Write them down** — every future piece of content should map to one of your pillars.`,
  },
  {
    slug: 'tof-content',
    title: 'Top of Funnel Content',
    blurb: 'Attract new people who don’t know you yet — and turn viewers into followers.',
    body: `## What is TOF content?

TOF content is the content you use to attract new people who don't know you, your brand, or your offer yet. It's designed to:
- Create awareness
- Spark interest
- Build trust
- Reach cold or warm audiences

The result: converting viewers into followers.

## Understand your audience

Before creating TOF content, make sure you understand your audience. With TOF we're mainly targeting our **Dream Follower** — they have the largest total addressable market.

Identify your Dream Follower by asking:
1. Who are they, what's their story, what do they look like?
2. What are they passionate about?
3. What are their goals, dreams and desires?
4. What are their deepest fears?
5. What are their struggles?

Add to this by asking existing or new clients (via an onboarding form):
1. What about the content pushed you into buying?
2. What — other than the value I provide — made you want to work with me?
3. Why do you enjoy working with me?
4. What parts of my brand do you resonate with the most?
5. Was there a specific video that stood out to you?

Once you've collected this, you'll understand WHAT content to create and WHY you're creating it.

## Examples of TOF content

The goal is to get attention — but the magic happens when you peak their interest. Get them to ask "how?" and "what is he doing that's different?". Give them a reason to listen: show them you're living their desired reality (transformation, collecting cash, moving into your dream apartment, buying the dream watch).

Some TOF formats you can test:
- **Behind the scenes** — [example reel](https://www.instagram.com/reel/DSgB8cdDJLF/)
- **Day in the life** — [example reel](https://www.instagram.com/reel/DSYRmWiDLco/)
- **Reaction videos** — [example reel](https://www.instagram.com/reel/DSp3vSDjIB7/)
- **Raw talk (iPhone)** — [example reel](https://www.instagram.com/reel/DRx03lbjHjF/)

## Anatomy of TOF content

1. **A broad hook** — your opening should be answerable or relatable to almost anyone, while still pulling in your Dream Follower. Start broad, then narrow toward your niche.
2. **An open loop** — introduce curiosity, delay the answer, then resolve it. The gap between question and answer is what keeps people watching.
3. **One clear emotion** — every piece of content that travels makes the viewer feel something specific.

## Action items

- Write 5 TOF hooks broad enough that almost anyone could answer them, while still attracting your Dream Follower.
- Film one TOF piece this week and score it on the Emotion Test before posting.
- Take your best performer, ask "why" three times to find the core emotion, and spin out 10 new angles.`,
  },
  {
    slug: 'posting-cadence',
    title: 'Posting Cadence',
    blurb: 'Consistency beats intensity — build the system and consistency takes care of itself.',
    body: `## Why cadence matters

Consistency beats intensity. The creators who win aren't the ones with the best single video — they're the ones who show up predictably, week after week, while everyone else burns out.

## How to hit it

Cadence is a systems problem, not a willpower problem. Build the system and the consistency takes care of itself.

- **Batch your filming** — record multiple pieces in one session so you're never scrambling for "today's post".
- **Work from a backlog** — keep a running bank of scored, ready-to-film ideas so you always know what's next.
- **Run every piece through your 5-Step Content Checklist.**
- **Schedule a fixed weekly content block** — filming and posting never get bumped by client work.

## Target cadence

Focus on quality over quantity:
- **1 reel per day on Instagram** — volume at the TOF to maximise reach and reps.
- **1 video per week on YouTube** — longer-form depth that builds trust and ranks over time.`,
  },
  {
    slug: 'buyers-journey',
    title: "Buyer's Journey",
    blurb: 'Map your ICP from stranger to buyer — and make content for every stage.',
    body: `## What is the buyer's journey?

Nobody goes from a stranger to a buyer in one video. Your ICP moves through stages, and at each stage they have different questions, doubts and needs. If your content only speaks to one stage, you lose everyone at the others.

## The 5 stages

- **Unaware** — they have the problem but haven't named it. Content here calls out the problem.
- **Problem-aware** — they know the problem but not the solution. Content here frames the real cause.
- **Solution-aware** — they're weighing options. Content here positions your approach as the best path.
- **Product-aware** — they're considering you specifically. Content here builds trust and handles doubts.
- **Ready to buy** — they need a reason to act now. Content here shows proof and removes the final friction.

## Create content for each stage

- Write out your ICP's journey from Point A to Point B in their own words.
- For each stage, list the questions and doubts in their head at that moment.
- Create at least one piece of content that answers each stage directly.
- Audit your existing content — you'll usually find you're over-serving one stage and ignoring the rest. Fill the gaps.

You can understand your ICP by building out your offer and completing the Product Market Fit, Offer Positioning & The Product sheets.

We leverage MOF content to position you as an authority and nurture your ICP so they view you as the solution to take them from Point A (current situation) to Point B (desired outcome).`,
  },
  {
    slug: 'objections-into-content',
    title: 'Converting Objections into Content',
    blurb: 'Every reason your ICP has not to buy is a piece of content waiting to be made.',
    body: `## Why use objections in content

Every reason your ICP has not to buy is a piece of content waiting to be made. The objections you hear on sales calls and the limiting beliefs you read in your DMs are the exact things standing between a prospect and a buyer.

Handle them in your content, and you do your selling before the sales call ever happens.

## Where to find objections

Your market research is already done for you. Pull from:
- **Sales calls** — the reasons prospects hesitate or say no.
- **DMs** — the limiting beliefs and doubts people voice before booking.
- **Your own buying process** — reverse-engineer why you hesitated before investing in something, and why you eventually said yes.

## From objection to video

1. List the 5 most common objections stopping your ICP from buying.
2. For each one, write the underlying belief driving it (the objection is the symptom; the belief is the cause).
3. Plan a piece of content that shifts that belief — through a story or a new perspective.
4. Make it specific and step-by-step. Show, don't just make a claim.

## Examples of objection-handling content

- "I don't have enough time or space to record content…" — [example reel](https://www.instagram.com/reel/DXfN-hqET-o/)
- "I've tried every format but nothing seems to work…" — [example reel](https://www.instagram.com/reel/DV__E4fE4m9/)
- "I don't know if it will work in my niche…" — [example reel](https://www.instagram.com/reel/DUBxSt1jCVf/)

## Note

If an objection comes up more than once on sales calls, it needs to become a piece of content. If it comes up every week, it needs to be one of your core content pillars.`,
  },
  {
    slug: 'mof-content',
    title: 'Middle of Funnel Content',
    blurb: 'Nurture attention — turn followers into prospects who see you as the solution.',
    body: `## What is MOF content?

MOF content is the content you use to nurture attention. It's what you use after someone already knows you, but before they're ready to buy. It's designed to:
- Build trust
- Give clarity
- Position you as an authority
- Nurture your audience

The result: converting followers into prospects.

## Understand your audience

Before creating MOF content, make sure you understand your ICP. Your ICP:
- Have a clear problem your offer solves
- Trust your expertise and process
- Are ready to invest financially

You can understand your ICP by building out your offer and completing the Product Market Fit, Offer Positioning & The Product sheets.

We leverage MOF content to position you as an authority and nurture your ICP so they view you as the solution to take them from Point A (current situation) to Point B (desired outcome).

## The buyer's journey

Every piece of MOF content is designed to move your ICP along the buying journey:

**Viewer → Prospect → Buyer**

MOF speaks directly to your ICP: a narrower, higher-intent group who have a clear problem you solve, trust your process, and are ready to invest financially.

![Mapping content to the funnel](/roadmap-guides/mof-content/funnel.png)

## Examples of MOF content

Your ICP has a narrower TAM, so we create intentional content to nurture them from viewer → prospect → buyer.

The easiest way to generate MOF ideas is by solving your ICP's problems. Make a list of what they need help with, for example:
- Not knowing how to create content that converts
- No predictable system to scale past $30k+ months
- Trading time for money and doing everything themselves
- Imposter syndrome despite getting results for clients
- No systems or SOPs

Your marketing and sales teams should work together to generate winning MOF ideas. Objections you hear on sales calls and limiting beliefs you hear in the DMs are gold mines for content. The key with MOF content is making sure it's step-by-step and actionable.

Some MOF formats you can test:
- **Talking heads** — [example reel](https://www.instagram.com/reel/DSvaphnDDUo/)
- **Miro boards** — [example reel](https://www.instagram.com/reel/DORVlUSjOzX/)
- **Presentation** — [example reel](https://www.instagram.com/reel/DO4CEK7kRUc/)

## Action items

- Watch the MOF Masterclass module.
- Map your prospect's buying journey from A to Z and build content for each stage.
- List the objections stopping prospects from buying and convert them into videos.`,
  },
  {
    slug: 'onboarding-form',
    title: 'Reverse Engineering Your Onboarding Form',
    blurb: 'Your clients will tell you exactly why they bought — if you ask.',
    body: `## Overview

When a client joins you, they'll tell you exactly why — if you ask. Your onboarding form captures the real reasons people choose you, in their own words.

That's the most valuable market research you'll ever get, because it comes from people who actually paid.

## Key questions

Build these into your onboarding form, and ask new and existing clients directly:
- What about the content pushed you into buying?
- What made you want to work with me?
- Why do you enjoy working with me?
- What parts of my brand do you resonate with the most?
- Was there a specific video that stood out to you?

## What to do with the answers

Once you've collected this, you'll understand both WHAT content to create and WHY it works. Cross-reference the responses against your content:
- Which specific pieces are clients naming as the reason they bought?
- What themes, stories or moments keep coming up?
- What do people say made them trust you, beyond the value?

## Convert into content

The pieces and themes clients credit for their decision are your highest-converting assets. Make more of them. If 3 clients mention the same video, that video is a format, not a one-off.

**Rule 1: sell people on YOU before the product.** Your onboarding answers will show you that people buy the person first.`,
  },
];

export const ROADMAP_GUIDES: Record<string, RoadmapGuide> = Object.fromEntries(
  GUIDES.map((g) => [g.slug, g]),
);

export const ROADMAP_GUIDE_SLUGS = GUIDES.map((g) => g.slug);

export function getRoadmapGuide(slug: string): RoadmapGuide | null {
  return ROADMAP_GUIDES[slug] ?? null;
}
