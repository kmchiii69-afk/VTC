// The Creative Specialist roadmap — shown INSTEAD of the standard client
// roadmap (lib/roadmap-data.ts) to members carrying the `creative_specialist`
// feature/tag. Resolved per-member in lib/roadmap-variant.ts.
//
// Same shape and same `roadmap_progress` table as the standard roadmap, so item
// ids MUST stay stable AND must never collide with the standard roadmap's ids
// (r1xx / onboarding step ids) — hence the `cs1xx` range.
//
// There used to be an "Our Tech Stack" reference strip under the phases; it was
// removed on request, so the roadmap is phases only.

import type { RoadmapPhase } from '@/lib/roadmap-data';

export const CREATIVE_PHASES: RoadmapPhase[] = [
  {
    id: 'cs-strategy', num: '01', label: 'Phase 1', color: '#4ade80',
    title: 'Strategy & Foundations',
    sub: 'Set the visual identity, the intent behind the work, and the formats you build in.',
    items: [
      { id: 'cs101', text: 'Visual Identity', sop: null, mods: [], links: [
        { label: 'Visual Identity (Doc)', url: 'https://docs.google.com/document/d/1ks25-O0sEdNUVoJlN8mu_beqlsxUiJhfHq69JzMf-nU/edit?usp=sharing' },
      ] },
      { id: 'cs102', text: 'Executing with Intention', sop: null, mods: [], links: [
        { label: 'Executing with Intention (Canva)', url: 'https://www.canva.com/design/DAHHXGQQhdQ/hj43Xzua8RLKx2cESJEPvA/edit' },
      ] },
      { id: 'cs103', text: 'Content Formats', sop: null, mods: [], links: [
        { label: 'Content Formats (Miro)', url: 'https://miro.com/app/board/uXjVGl7CQ34=/' },
      ] },
      { id: 'cs104', text: 'Frame Structure', sop: null, mods: [], links: [
        { label: 'Frame Structure (Miro)', url: 'https://miro.com/app/board/uXjVGmL95PQ=/' },
      ] },
    ],
  },
  {
    id: 'cs-system', num: '02', label: 'Phase 2', color: '#60a5fa',
    title: 'The System',
    sub: 'The production workflow, dashboard and weekly rhythm the whole operation runs on.',
    items: [
      { id: 'cs105', text: 'Content Workflow', sop: null, mods: [], desc: 'The Content Production Workflow — how a piece moves from idea to published.', links: [
        { label: 'Content Production Workflow (Doc)', url: 'https://docs.google.com/document/d/1tShfCCKQIrfVNaBMbRCfa9WDYM65aj3e9PVssHd4zHE/edit?usp=sharing' },
      ] },
      { id: 'cs106', text: 'Content Dashboard', sop: null, mods: [], links: [
        { label: 'Client Portal Template (Notion)', url: 'https://nickel-binder-b69.notion.site/Client-Portal-Template-37dd2a33e6338095a8acc6bfdb6856ae?source=copy_link' },
      ] },
      { id: 'cs107', text: 'Weekly Structure', sop: null, mods: [], links: [
        { label: 'Weekly Structure (Canva)', url: 'https://www.canva.com/design/DAHKBGyhP1c/MZ2otW2ciJomthhWyaXPlg/edit' },
      ] },
      { id: 'cs108', text: 'Team Calls', sop: null, mods: [] },
    ],
  },
  {
    id: 'cs-pre-production', num: '03', label: 'Phase 3', color: '#f59e0b',
    title: 'Pre Production',
    sub: 'Everything that happens before the camera rolls — research, scripts, shot lists and gear.',
    items: [
      { id: 'cs109', text: 'Research, Ideation & Planning', sop: null, mods: [] },
      { id: 'cs110', text: 'Scripting', sop: null, mods: [] },
      { id: 'cs111', text: 'Creating a Shot List', sop: null, mods: [] },
      { id: 'cs112', text: 'Preparing for a Shoot', sop: null, mods: [] },
      { id: 'cs113', text: 'Camera Gear', sop: null, mods: [] },
    ],
  },
  {
    id: 'cs-filming', num: '04', label: 'Phase 4', color: '#e879f9',
    title: 'Filming',
    sub: 'Run the session, operate the gear, and capture footage that fits the format.',
    items: [
      { id: 'cs114', text: 'How We Structure Filming Sessions', sop: null, mods: [] },
      { id: 'cs115', text: 'Operating Camera Gear', sop: null, mods: [] },
      { id: 'cs116', text: 'Setting Up the Production', sop: null, mods: [] },
      { id: 'cs117', text: 'Filming with the Founder', sop: null, mods: [], links: [
        { label: 'Filming with the Founder (Doc)', url: 'https://docs.google.com/document/d/1fexnoMRjyPeKn4KdaU-3Em9Wzb0OG3k-HRYA-bD4kMg/edit?tab=t.0' },
      ] },
      { id: 'cs118', text: 'B-Roll Masterclass', sop: null, mods: [], links: [
        { label: 'B-Roll Masterclass (Doc)', url: 'https://docs.google.com/document/d/1GGlUBLaP3Y4k3uoWwZewbsYWzCe4A_0X3WkyQzebo00/edit?tab=t.0' },
      ] },
      { id: 'cs119', text: 'Cinematic Foundations', sop: null, mods: [], links: [
        { label: 'Cinematic Foundations (Canva)', url: 'https://www.canva.com/design/DAHJXSlDRqc/XPP7CAXKe77ZhKKDbhkjDg/edit' },
      ] },
      { id: 'cs120', text: 'Capturing for the Format', sop: null, mods: [], links: [
        { label: 'Capturing for the Format (Canva)', url: 'https://www.canva.com/design/DAHLVNaUOvQ/OPiwfY07N4ywfLa94oJ9_w/edit' },
      ] },
    ],
  },
  {
    id: 'cs-post-production', num: '05', label: 'Phase 5', color: '#fb923c',
    title: 'Post Production',
    sub: 'Edit, score and sharpen the cut — pattern interrupts, animations and clipping.',
    items: [
      { id: 'cs121', text: 'Editing Workflow', sop: null, mods: [], links: [
        { label: 'Editing Workflow (Doc)', url: 'https://docs.google.com/document/d/1xELqLr5nm0QhQI1UctIRjGiZn41jetXOgy2LlJn2jnY/edit?tab=t.0' },
      ] },
      { id: 'cs122', text: 'Music Selection', sop: null, mods: [] },
      { id: 'cs123', text: 'Claude Animations', sop: null, mods: [], links: [
        { label: 'Claude Animations (Doc)', url: 'https://docs.google.com/document/d/1xELqLr5nm0QhQI1UctIRjGiZn41jetXOgy2LlJn2jnY/edit?tab=t.0' },
      ] },
      { id: 'cs124', text: 'Creating Pattern Interrupts', sop: null, mods: [] },
      { id: 'cs125', text: 'Viral Clipping', sop: null, mods: [] },
    ],
  },
  {
    id: 'cs-leadership', num: '06', label: 'Phase 6', color: '#a78bfa',
    title: 'Leadership',
    sub: 'Hold the quality bar, manage editors, hire talent, and work with the founder.',
    items: [
      { id: 'cs126', text: 'Quality Control', sop: null, mods: [] },
      { id: 'cs127', text: 'Editor Management', sop: null, mods: [], links: [
        { label: 'Editor Management (Canva)', url: 'https://www.canva.com/design/DAHItWuZc-M/84vIzb5eiOkx4eNW-qjzKw/edit' },
      ] },
      { id: 'cs128', text: 'Hiring', sop: null, mods: [], links: [
        { label: 'Talent Database (Sheet)', url: 'https://docs.google.com/spreadsheets/d/1H59-R6-NNXF0z9PMzJFsvhPLgnM4J4O2OYxeFy-Ox6w/edit?gid=1156411377#gid=1156411377' },
      ] },
      { id: 'cs129', text: 'Working with the Founder', sop: null, mods: [] },
    ],
  },
  {
    id: 'cs-feedback-scaling', num: '07', label: 'Phase 7', color: '#22d3ee',
    title: 'Feedback Loop & Scaling',
    sub: 'Read the numbers, learn from them, and scale what the data says is working.',
    items: [
      { id: 'cs130', text: 'Reading Performance / Analytics', sop: null, mods: [] },
      { id: 'cs131', text: 'AI Dashboard Analysis', sop: null, mods: [] },
    ],
  },
];
