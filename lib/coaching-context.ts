// Shared coaching context — the program's module list, roadmap, and SooWei's
// voice. Extracted so both the chat assistant (app/api/chat/route.ts) and the
// Fathom check-in analyzer (lib/checkin-ai.ts) draw from one source of truth.

export const MODULES_CONTEXT = `
SECTION: Welcome
01 - Appreciation For Joining C.M
02 - Onboarding Into Consulting Mastery
03 - C.M Team Overview

SECTION: Mindset Mastery
04 - Mindset
05 - Removing Limiting Beliefs To Make $151k/mo
06 - Break Your Old Identity
07 - Maximising Consulting Mastery
08 - Nero Mastermind Call

SECTION: Sharpening the Offer
09 - Sharpening Your Offer Overview
10 - Offer Pitch Deck
11 - Bonuses and Guarantees
12 - Pricing Your Offer (Group Call)
13 - Crafting an Irresistible Offer
14 - Product Market Fit
15 - Cash Injection Actionables Checklist

SECTION: Cash Injection
16 - Cash Injection
17 - Cash Injection Overview
18 - Cash Injection Marketing
19 - Revive Past Leads

SECTION: Content Accelerator
20 - Content Accelerator Overview
21 - Story Sequences
22 - $10k Story Strategy
23 - Mastering Middle Of Funnel
24 - Mastering Top Of Funnel Content
25 - Infinite Content Ideas
26 - Making A My Story Video
27 - Optimizing Your IG Profile
28 - Foundation of Content
29 - Setting the Expectations
30 - Content FAQ's
31 - Instagram Reels
32 - Consulting Mastery Group Call
33 - Steps To Become A 7 Figure Marketer
34 - YouTube Masterclass
35 - First Three YouTube Videos

SECTION: Converting Leads
36 - Buyer's Journey
37 - Converting Leads Overview
38 - Objection Handling Masterclass
39 - Reality Check
40 - B2B Closing Framework
41 - B2C Closing Framework
42 - Closer Mindset

SECTION: Outreach & Sales Assets
43 - Outreach Framework (B2C)
44 - Outreach Framework (B2B)
45 - Autopilot Inbound Framework (B2B)
46 - Appointment Setting (Inbound Leads)
47 - Sales Assets Overview
48 - Submit Your VSL
49 - Building a VSL
50 - VSL Formatting

SECTION: Systems & Team
51 - System Infrastructure To $100k/mo
52 - Training Protocol Overview
53 - Discord Channel + Automations
54 - Setting Goals
55 - Building Team Culture
56 - Live Group Call Example
57 - Training Protocol For Setters
58 - Hiring and Onboarding Setters
59 - Hosting Team Calls
60 - Sales Process and Identifying Bottlenecks
61 - GHL Overview
62 - GHL Automations
63 - GHL Forms
64 - Zapier Masterclass
65 - GHL Domains and Funnels
`.trim();

export const ROADMAP_CONTEXT = `
Phase 1 - Foundation of Content:
- Watch Foundation of Content Video Modules [Modules 28, 20]
- Optimize Your IG Profile [Module 27]
- Create Pinned Posts + Story Highlights
- Watch Content Backend & Expectations Modules [Modules 29, 30]
- Fill Out Brand Identity Documents
- Fill Out Market Research Documents

Phase 2 - Mastering Camera Presence:
- Watch Camera Presence + Reels Modules [Modules 26, 31]
- Do Communication Exercises 5-10 mins/day
- Implement Story Strategy [Modules 21, 22]

Phase 3 - Brand Positioning + Content Messaging:
- Watch Brand Positioning + Content Modules [Modules 33, 25]
- Brainstorm Formats That Show Your Strengths
- Run New Videos Through Content Checklist [Module 30]
- Post 1 Reel/day on IG + 1 Video/week on YT [Modules 34, 35]

Phase 4 - TOF Masterclass:
- Watch TOF Masterclass Video Module [Module 24]
- Find Specific TOF Videos You Can Implement [Module 25]
- Script Out Hooks and Get Them Reviewed [Module 24]

Phase 5 - MOF Masterclass:
- Watch MOF Masterclass Video Module [Module 23]
- List Down Objections Stopping Prospects From Buying [Module 38]
- Brainstorm How To Solve Them In Content [Module 23]
`.trim();

// Concise voice guide for client-facing copy (the rolling progress narrative).
// Mirrors the persona in app/api/chat/route.ts without the chat-specific rules.
export const SOOWEI_VOICE = `
Write in SooWei Goh's natural voice: warm, relaxed, encouraging, like a friend who's
figured it out and genuinely wants the client to win. Confident without preaching.
Conversational, never robotic or corporate. Never use bullet points, dashes, em dashes,
or markdown in the narrative prose. Never sound like a motivational poster. Speak about
the client in the second person ("you") as if talking to them directly.
`.trim();
