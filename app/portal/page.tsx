'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PageTour } from '@/components/ui/page-tour';
import type { TourStep } from '@/components/onboarding/onboarding-tour';

const PORTAL_TOUR: TourStep[] = [
  { title: 'Welcome to your portal', body: "This is your home base. Here's a quick 15-second tour." },
  { target: 'portal-nav', title: 'Get around', body: 'Use these tabs to jump between your dashboard, roadmap, modules, SOPs, and call recordings.' },
  { target: 'portal-content', title: 'Your workspace', body: 'Whatever you pick shows up here — start with the Roadmap to see your next steps.' },
];
import { MeshBg } from '@/components/ui/mesh-bg';
import { ProfileButton } from '@/components/ui/profile-button';
import { ResourcesView } from '@/components/ui/resources-section';
import {
  LayoutDashboard,
  BookOpen,
  Library,
  CheckCircle2,
  Circle,
  ExternalLink,
  ArrowRight,
  Play,
  Search,
  X,
  ChevronRight,
  ChevronDown,
  Menu,
  CheckSquare,
  Square,
  TrendingUp,
  Award,
  FileText,
  ArrowLeft,
  Tag,
  Bell,
  Clock,
  Lock,
  Route,
  Home,
  LayoutGrid,
  Video,
  Upload,
} from 'lucide-react';
import transcriptSopsJson from '@/lib/transcript-sops.json';
import { useActionItems, dueState, type ClientActionItem } from '@/lib/use-action-items';
import { useRoadmap } from '@/lib/use-roadmap';
import { isPhaseUnlocked, isItemUnlocked, canToggleItem } from '@/lib/roadmap-data';
import { type Recording } from '@/lib/recordings';
import { RecordingsPlayer } from '@/components/ui/recording-item';
import { SectionGuide } from '@/components/ui/section-guide';
import { trackView } from '@/lib/track';
import { SkeletonList } from '@/components/ui/loaders';

// ─── Transcript SOP Types ────────────────────────────────────────────────────

interface TranscriptSop {
  id: string;
  title: string;
  category: string;
  source: string;
  body: string;
}

const TRANSCRIPT_SOPS = transcriptSopsJson as TranscriptSop[];
const TRANSCRIPT_BY_ID: Record<string, TranscriptSop> = Object.fromEntries(
  TRANSCRIPT_SOPS.map((s) => [s.id, s])
);

// ─── Data ────────────────────────────────────────────────────────────────────

const MODULES = [
  { id: 'm01', ph: 1, num: '01', title: 'Dream Followers vs Buyers', desc: 'Understand the critical difference between followers who consume and clients who convert. Learn why dream followers are necessary but dangerous.', tags: ['ICP', 'Audience', 'Conversion'], video: null },
  { id: 'm02', ph: 1, num: '02', title: 'What an ICP Actually Is', desc: 'Break the misconception that ICP is demographics. Your ideal client is defined by pain + urgency + ability to pay + behavior.', tags: ['ICP', 'Targeting', 'Strategy'], video: null },
  { id: 'm03', ph: 1, num: '03', title: 'ICP vs Non-ICP Filtering Framework', desc: 'Build a clear split between high-value buyers and time-wasters. Learn to identify this on calls and in DMs.', tags: ['ICP', 'Filtering', 'Sales'], video: null },
  { id: 'm04', ph: 2, num: '04', title: 'Surface-Level vs High-Value Pain Points', desc: "Diagnose real ICP pain vs surface symptoms. The difference between \"I need more followers\" and \"I can't scale.\"", tags: ['Messaging', 'Pain Points', 'ICP'], video: null },
  { id: 'm05', ph: 2, num: '05', title: 'How to Find ICP Pain Points', desc: 'Practical frameworks for extracting pain patterns from sales calls, DMs, past clients, and objection data.', tags: ['Research', 'Pain Points', 'Framework'], video: null },
  { id: 'm06', ph: 2, num: '06', title: 'Emotional vs Logical Buyers', desc: 'Logical buyers invest for ROI, think long-term, take action. Learn to attract operators not emotional decision-makers.', tags: ['Psychology', 'Sales', 'Buyers'], video: null },
  { id: 'm07', ph: 2, num: '07', title: 'Content That Attracts vs Filters', desc: 'Master the TOFU → MOFU → BOFU content funnel. Great content repels non-ICP while pulling the right people in.', tags: ['Content', 'Funnel', 'Strategy'], video: null },
  { id: 'm08', ph: 2, num: '08', title: 'Speaking to Higher-Level Clients', desc: 'Shift from "make money online" to "fix bottlenecks." Language sophistication bridges to premium clients.', tags: ['Messaging', 'Positioning', 'Premium'], video: null },
  { id: 'm09', ph: 2, num: '09', title: 'Building a Content Funnel', desc: 'Every piece of content has a job. Hook → attract. Depth → qualify. CTA → convert. Stop random posting.', tags: ['Content', 'System', 'Funnel'], video: null },
  { id: 'm10', ph: 3, num: '10', title: 'Why Price Filters Your ICP', desc: 'Low price attracts beginners. High price attracts operators. Reframe price as a positioning tool.', tags: ['Pricing', 'Positioning', 'ICP'], video: null },
  { id: 'm11', ph: 3, num: '11', title: 'Matching Offer to ICP Stage', desc: 'A beginner offer is not a scaling offer. Construct the right offer for the right stage.', tags: ['Offer', 'ICP', 'Stages'], video: null },
  { id: 'm12', ph: 3, num: '12', title: 'Outcome-Based Offers', desc: 'Stop selling deliverables. Start selling clear, specific outcomes. "Get to X result" beats "get coaching + calls."', tags: ['Offer', 'Outcomes', 'Sales'], video: null },
  { id: 'm13', ph: 3, num: '13', title: 'Why Free Calls Kill Your Business', desc: 'Free discovery calls drain time, attract low-intent leads, and eliminate leverage. Calls must be earned.', tags: ['Sales', 'Leverage', 'Qualification'], video: null },
  { id: 'm14', ph: 3, num: '14', title: 'Lead Qualification System', desc: 'Build data-driven lead tracking. Track % ICP, real close rates, and let data override feelings.', tags: ['Systems', 'Data', 'Leads'], video: null },
  { id: 'm15', ph: 3, num: '15', title: 'Using Calls as a Feedback Loop', desc: 'Every sales call is market research. Extract objections, language patterns, and pain points.', tags: ['Sales', 'Research', 'Optimization'], video: null },
  { id: 'm16', ph: 4, num: '16', title: 'Volume vs Leverage Business Models', desc: 'More calls vs better clients. More clients vs higher price. The model that creates real freedom.', tags: ['Scale', 'Leverage', 'Model'], video: null },
  { id: 'm17', ph: 4, num: '17', title: 'Why Your Business Feels Hard to Scale', desc: "Wrong ICP + weak offer + no filtering = a hamster wheel. Diagnose exactly what's holding you back.", tags: ['Scale', 'Diagnosis', 'Systems'], video: null },
  { id: 'm18', ph: 4, num: '18', title: 'From Operator to Authority', desc: 'Stop convincing. Start attracting. The identity shift that changes everything about how you show up.', tags: ['Mindset', 'Authority', 'Brand'], video: null },
];

const PHASE_NAMES: Record<number, string> = {
  1: 'ICP Fundamentals',
  2: 'Content Strategy',
  3: 'Offer & Sales',
  4: 'Scaling',
};

const PHASE_COLORS: Record<number, string> = {
  1: '#4ade80',
  2: '#60a5fa',
  3: '#f59e0b',
  4: '#e879f9',
};

const SOP_CATEGORIES = [
  {
    id: 'setting',
    name: 'Setting & DMs',
    icon: '💬',
    count: 31,
    color: '#60a5fa',
    sops: [
      { title: 'IG Setting SOP', url: 'https://docs.google.com/document/d/1aKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'DM Opener Strategy', url: 'https://docs.google.com/document/d/1bKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Objection Handling in DMs', url: 'https://docs.google.com/document/d/1cKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Follow-Up Sequence (3-Day)', url: 'https://docs.google.com/document/d/1dKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Warm Lead Re-Engagement', url: 'https://docs.google.com/document/d/1eKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Cold DM Outreach Template', url: 'https://docs.google.com/document/d/1fKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Story Reply Handling', url: 'https://docs.google.com/document/d/1gKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Qualifying Questions Script', url: 'https://docs.google.com/document/d/1hKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Price Reveal in DMs', url: 'https://docs.google.com/document/d/1iKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Booking Call from DMs', url: 'https://docs.google.com/document/d/1jKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Non-ICP Redirect Script', url: 'https://docs.google.com/document/d/1kKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Testimonial Request DM', url: 'https://docs.google.com/document/d/1lKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Referral Ask DM', url: 'https://docs.google.com/document/d/1mKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Ghosted Lead Revival', url: 'https://docs.google.com/document/d/1nKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Upsell DM Framework', url: 'https://docs.google.com/document/d/1oKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Community Engagement DM', url: 'https://docs.google.com/document/d/1pKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Comment-to-DM Funnel', url: 'https://docs.google.com/document/d/1qKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'ManyChat Automation Setup', url: 'https://docs.google.com/document/d/1rKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Reel Viral → DM Handling', url: 'https://docs.google.com/document/d/1sKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Application Form DM Bridge', url: 'https://docs.google.com/document/d/1tKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'High-Ticket Convo Framework', url: 'https://docs.google.com/document/d/1uKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Setting Daily Routine SOP', url: 'https://docs.google.com/document/d/1vKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Lead Tracker Setup', url: 'https://docs.google.com/document/d/1wKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Pipeline Stage Definitions', url: 'https://docs.google.com/document/d/1xKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'DM Tone & Voice Guide', url: 'https://docs.google.com/document/d/1yKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Pre-Call DM Confirmation', url: 'https://docs.google.com/document/d/1zKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'No-Show Recovery Script', url: 'https://docs.google.com/document/d/2aKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'DM Volume Target SOP', url: 'https://docs.google.com/document/d/2bKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Post-Purchase Welcome DM', url: 'https://docs.google.com/document/d/2cKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Waitlist DM Script', url: 'https://docs.google.com/document/d/2dKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Launch Announcement DMs', url: 'https://docs.google.com/document/d/2eKjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
    ],
  },
  {
    id: 'closing',
    name: 'Closing & Sales Calls',
    icon: '📞',
    count: 9,
    color: '#f59e0b',
    sops: [
      { title: 'Sales Call Framework (Full)', url: 'https://docs.google.com/document/d/1aLjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Discovery Call Script', url: 'https://docs.google.com/document/d/1bLjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Objection Playbook (Calls)', url: 'https://docs.google.com/document/d/1cLjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: '"I need to think" Handler', url: 'https://docs.google.com/document/d/1dLjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Price Anchoring Script', url: 'https://docs.google.com/document/d/1eLjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Post-Call Follow-Up Email', url: 'https://docs.google.com/document/d/1fLjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Closing Sequence (3-Step)', url: 'https://docs.google.com/document/d/1gLjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Tonality & Pacing Guide', url: 'https://docs.google.com/document/d/1hLjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Call Recording Review Checklist', url: 'https://docs.google.com/document/d/1iLjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
    ],
  },
  {
    id: 'content',
    name: 'Content & Marketing',
    icon: '🎬',
    count: 14,
    color: '#e879f9',
    sops: [
      { title: 'IG Profile Optimization Guide', url: 'https://docs.google.com/document/d/1VGrJil0dBdiGDKg8wAJYB8wX75Pzl-u-F19RD-QhImM/edit' },
      { title: 'Story + Highlights SOP', url: 'https://docs.google.com/document/d/1Z16sF6qYDkqhAg3YUGIpGTVJJALK6MgvexF6cmfMGOI/edit' },
      { title: 'Reel Hook Formula', url: 'https://docs.google.com/document/d/1aMjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Caption Writing Framework', url: 'https://docs.google.com/document/d/1bMjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Content Pillar Framework', url: 'https://docs.google.com/document/d/1cMjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Weekly Content Calendar', url: 'https://docs.google.com/document/d/1dMjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'YouTube Video Strategy', url: 'https://docs.google.com/document/d/1eMjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Posting Time Optimization', url: 'https://docs.google.com/document/d/1fMjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Authority Positioning Content', url: 'https://docs.google.com/document/d/1gMjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Miro TOF Board', url: 'https://miro.com/app/board/uXjVJgAqugc=/?share_link_id=734863742841' },
      { title: 'Miro MOF Board', url: 'https://miro.com/app/board/uXjVJmzJMQU=/?share_link_id=553083592865' },
      { title: 'Brand Identity Document', url: 'https://docs.google.com/document/d/1VGrJil0dBdiGDKg8wAJYB8wX75Pzl-u-F19RD-QhImM/edit' },
      { title: 'Market Research Document', url: 'https://docs.google.com/document/d/1W7FslVGOtCQYn7q7-PhfWEkP5rQPkOSupi5ACGdc4oI/edit' },
      { title: '5-Step Content Checklist', url: 'https://docs.google.com/document/d/1hMjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
    ],
  },
  {
    id: 'kpis',
    name: 'KPIs & Reporting',
    icon: '📊',
    count: 6,
    color: '#4ade80',
    sops: [
      { title: 'Weekly KPI Dashboard', url: 'https://docs.google.com/document/d/1aNjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Monthly Review Template', url: 'https://docs.google.com/document/d/1bNjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Revenue Tracking Sheet', url: 'https://docs.google.com/document/d/1cNjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Content Metrics Tracker', url: 'https://docs.google.com/document/d/1dNjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Lead Conversion Report', url: 'https://docs.google.com/document/d/1eNjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Quarterly Goal Setting Doc', url: 'https://docs.google.com/document/d/1fNjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
    ],
  },
  {
    id: 'fulfillment',
    name: 'Fulfillment & Delivery',
    icon: '📦',
    count: 1,
    color: '#fb923c',
    sops: [
      { title: 'Client Onboarding Delivery SOP', url: 'https://www.loom.com/share/0ec1551635a34c0bb2f00ccef4de8465' },
    ],
  },
  {
    id: 'team',
    name: 'Team Management',
    icon: '👥',
    count: 9,
    color: '#f472b6',
    sops: [
      { title: 'Hiring & Onboarding Process', url: 'https://docs.google.com/document/d/1aOjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Team Meeting Agenda Template', url: 'https://docs.google.com/document/d/1bOjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Performance Review Framework', url: 'https://docs.google.com/document/d/1cOjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Role & Responsibility Map', url: 'https://docs.google.com/document/d/1dOjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Culture & Values Document', url: 'https://docs.google.com/document/d/1eOjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Incentive & Commission Structure', url: 'https://docs.google.com/document/d/1fOjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Closer Training Checklist', url: 'https://docs.google.com/document/d/1gOjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Setter Training Checklist', url: 'https://docs.google.com/document/d/1hOjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Offboarding & Exit Checklist', url: 'https://docs.google.com/document/d/1iOjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
    ],
  },
  {
    id: 'ops',
    name: 'Operations & Systems',
    icon: '⚙️',
    count: 5,
    color: '#a78bfa',
    sops: [
      { title: 'Tech Stack Overview', url: 'https://docs.google.com/document/d/1aPjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'CRM Setup & Workflow', url: 'https://docs.google.com/document/d/1bPjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Standard Operating Procedures Index', url: 'https://docs.google.com/document/d/1cPjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Automation Workflows', url: 'https://docs.google.com/document/d/1dPjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Business Scaling Roadmap', url: 'https://docs.google.com/document/d/1ePjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
    ],
  },
  {
    id: 'va',
    name: 'VA SOPs',
    icon: '🤝',
    count: 6,
    color: '#34d399',
    sops: [
      { title: 'VA Daily Task Checklist', url: 'https://docs.google.com/document/d/1aQjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Content Scheduling SOP', url: 'https://docs.google.com/document/d/1bQjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'DM Management SOP (VA)', url: 'https://docs.google.com/document/d/1cQjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Lead Tracking Input Guide', url: 'https://docs.google.com/document/d/1dQjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Caption Editing Guidelines', url: 'https://docs.google.com/document/d/1eQjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Weekly Reporting to Founder', url: 'https://docs.google.com/document/d/1fQjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
    ],
  },
  {
    id: 'offer',
    name: 'Offer Building',
    icon: '💎',
    count: 6,
    color: '#c9a455',
    sops: [
      { title: 'Offer Architecture Framework', url: 'https://docs.google.com/document/d/1aRjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Pricing Strategy Guide', url: 'https://docs.google.com/document/d/1bRjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Outcome Statement Builder', url: 'https://docs.google.com/document/d/1cRjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Guarantee Construction', url: 'https://docs.google.com/document/d/1dRjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Offer Validation Checklist', url: 'https://docs.google.com/document/d/1eRjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Productized Service Design', url: 'https://docs.google.com/document/d/1fRjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
    ],
  },
  {
    id: 'client-success',
    name: 'Client Success',
    icon: '⭐',
    count: 4,
    color: '#fbbf24',
    sops: [
      { title: 'Client Onboarding SOP', url: 'https://www.loom.com/share/0ec1551635a34c0bb2f00ccef4de8465' },
      { title: 'Weekly Check-In Template', url: 'https://docs.google.com/document/d/1bSjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Testimonial Collection Process', url: 'https://docs.google.com/document/d/1cSjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
      { title: 'Offboarding & Case Study', url: 'https://docs.google.com/document/d/1dSjl4uqfbPW2s6ZFmNY-HVVHQkKFG5OgLi6WBXlZ3c4/edit' },
    ],
  },
  {
    id: 'from-calls',
    name: 'From the Calls',
    icon: '🎙️',
    count: TRANSCRIPT_SOPS.length,
    color: '#c9a455',
    sops: TRANSCRIPT_SOPS.map((s) => ({ title: s.title, url: '', inline: true as const, id: s.id })),
  },
];

const TOTAL_MODULES = MODULES.length;
const TOTAL_SOPS = SOP_CATEGORIES.reduce((acc, cat) => acc + cat.count, 0);

// ─── Main Portal Component ───────────────────────────────────────────────────

export default function PortalPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#050403' }} />}>
      <PortalInner />
    </Suspense>
  );
}

function PortalInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authed, setAuthed] = useState(false);
  // Deep-link to a specific resource (e.g. from the SOP-finder bot):
  // /portal?resource=<slug> opens the Resources tab with that doc already open.
  const initialResourceSlug = searchParams.get('resource');
  const initialView = (() => {
    const v = searchParams.get('view');
    if (v === 'modules' || v === 'sops' || v === 'dashboard' || v === 'roadmap' || v === 'recordings' || v === 'resources') return v;
    if (initialResourceSlug) return 'resources';
    return 'dashboard';
  })();
  const [view, setView] = useState<'dashboard' | 'modules' | 'sops' | 'roadmap' | 'recordings' | 'resources'>(initialView);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Inline styles override Tailwind's `max-md:` classes (inline always wins), so
  // mobile layout is driven by this flag instead of CSS breakpoint classes.
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  // Per-client feature gating: null = still loading; otherwise the allowlist of
  // nav ids this client may see. Admins/ungated clients are resolved server-side.
  const [features, setFeatures] = useState<string[] | null>(null);
  // Admins don't get a Roadmap section in the portal (it's a client tool).
  const [isAdmin, setIsAdmin] = useState(false);

  // Module state
  const [completedMods, setCompletedMods] = useState<Set<string>>(new Set());
  const [modulePhaseFilter, setModulePhaseFilter] = useState<number | null>(null);
  const [moduleSearch, setModuleSearch] = useState('');

  // Roadmap progress drives the sidebar footer bar (kept in sync with /roadmap).
  // `roadmapTotal` follows whichever roadmap this member is on — Creative
  // Specialists get their own, with a different step count.
  const { completed: roadmapCompleted, total: roadmapTotal } = useRoadmap();

  // SOP state
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sopSearch, setSopSearch] = useState('');
  const [inlineSop, setInlineSop] = useState<TranscriptSop | null>(null);

  // Highlight a module (from roadmap click)
  const [highlightedMod, setHighlightedMod] = useState<string | null>(null);

  // Track viewport so layout (sidebar, content margin, grids) reacts on mobile.
  // Initial value comes from the lazy useState above; here we only keep it in
  // sync on resize (setState runs in the event callback, not synchronously).
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    setAuthed(true);

    // New clients must finish onboarding before they can use the portal.
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        setIsAdmin(u?.role === 'admin');
        if (u && u.role !== 'admin') {
          fetch('/api/me/onboarding', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((ob) => { if (ob && !ob.onboardedAt) router.replace('/onboarding'); })
            .catch(() => {});
        }
      })
      .catch(() => {});

    // Load the client's allowed portal features (recordings-only by default).
    fetch('/api/me/features', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { features: ['recordings'] }))
      .then((d) => setFeatures(Array.isArray(d?.features) ? d.features : ['recordings']))
      .catch(() => setFeatures(['recordings']));

    // Load per-client module completion from the server (was localStorage).
    fetch('/api/me/modules')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d?.completed)) setCompletedMods(new Set(d.completed)); })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A view is reachable if the client has that feature AND it isn't an
  // admin-hidden section (admins don't get the Roadmap tab in the portal).
  // The "Low-Ticket Archive" (modules) is admin-only — hidden from all members.
  const canSeeView = (id: string) =>
    id === 'modules'
      ? isAdmin
      : !!features?.includes(id) && !(isAdmin && id === 'roadmap');

  // Once features (and admin status) load, snap the active view to one the
  // caller is allowed to see if the current/initial view is gated off.
  useEffect(() => {
    if (!features) return;
    if (!canSeeView(view)) {
      const fallback = (['dashboard', 'roadmap', 'modules', 'sops', 'recordings', 'resources'] as const)
        .find((id) => canSeeView(id));
      if (fallback) setView(fallback);
    }
  }, [features, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-pull feature access when the tab regains focus, so an admin's toggle
  // unlocks tabs for the client without a full page reload.
  useEffect(() => {
    const refetch = () => {
      fetch('/api/me/features', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (Array.isArray(d?.features)) setFeatures(d.features); })
        .catch(() => {});
    };
    window.addEventListener('focus', refetch);
    document.addEventListener('visibilitychange', refetch);
    return () => { window.removeEventListener('focus', refetch); document.removeEventListener('visibilitychange', refetch); };
  }, []);

  const toggleMod = (id: string) => {
    let nowCompleted = false;
    setCompletedMods((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else { next.add(id); nowCompleted = true; }
      return next;
    });
    // Persist per-client (optimistic — UI already updated).
    fetch('/api/me/modules', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleId: id, completed: nowCompleted }),
    }).catch(() => {});
  };

  const handleModLink = (modId: string) => {
    setView('modules');
    setHighlightedMod(modId);
    setSidebarOpen(false);
    setTimeout(() => setHighlightedMod(null), 2000);
  };

  if (!authed || features === null) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#050403',
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            border: '2px solid rgba(201,164,85,0.2)',
            borderTop: '2px solid #c9a455',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const modsDone = completedMods.size;
  const roadmapDone = roadmapCompleted.size;
  const roadmapPct = roadmapTotal > 0 ? Math.round((roadmapDone / roadmapTotal) * 100) : 0;

  const navItems = ([
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, badge: null },
    { id: 'roadmap', label: 'Roadmap', icon: Route, badge: null },
    { id: 'modules', label: 'Low-Ticket Archive', icon: BookOpen, badge: null },
    { id: 'sops', label: 'SOP Library', icon: Library, badge: String(TOTAL_SOPS) },
    { id: 'recordings', label: 'Recordings', icon: Video, badge: null },
    { id: 'resources', label: 'Resources', icon: FileText, badge: null },
  ] as const).filter((item) => canSeeView(item.id));

  // The view actually rendered — always one the caller may see, so a gated view
  // (e.g. the default 'dashboard' for a recordings-only client, or 'roadmap' for
  // an admin) never flashes before the correction effect snaps `view`.
  const activeView = canSeeView(view) ? view : (navItems[0]?.id ?? 'recordings');

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#050403' }}>
      <MeshBg speed={0.2} />
      {/* Dark veil: keeps the gold mesh strictly behind content so text stays legible */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: 'rgba(5,4,3,0.62)' }} />
      <ProfileButton offsetTop={10} />
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 40,
          }}
        />
      )}

      {/* Sidebar */}
      <aside
        style={{
          width: 264,
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          background: 'rgba(5,4,3,0.72)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRight: '1px solid rgba(201,164,85,0.12)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 50,
          transform: (isMobile && !sidebarOpen) ? 'translateX(-264px)' : 'translateX(0)',
          transition: 'transform 0.3s ease',
        }}
      >
        {/* Nav */}
        <nav data-tour="portal-nav" style={{ padding: '24px 12px 12px', flex: 1, overflow: 'auto' }}>
          {navItems.map((item) => {
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setView(item.id);
                  setSidebarOpen(false);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: 'none',
                  background: active ? 'rgba(201,164,85,0.1)' : 'transparent',
                  color: active ? '#c9a455' : '#a89e8a',
                  cursor: 'pointer',
                  marginBottom: 2,
                  transition: 'all 0.15s ease',
                  textAlign: 'left',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '14px',
                  fontWeight: active ? 500 : 400,
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,164,85,0.05)';
                    (e.currentTarget as HTMLButtonElement).style.color = '#f0e8d4';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                    (e.currentTarget as HTMLButtonElement).style.color = '#a89e8a';
                  }
                }}
              >
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge && (
                  <span
                    style={{
                      fontSize: '10px',
                      background: active ? 'rgba(201,164,85,0.2)' : 'rgba(255,255,255,0.06)',
                      color: active ? '#c9a455' : '#857a67',
                      padding: '2px 7px',
                      borderRadius: 20,
                      fontWeight: 500,
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          {/* Cross-app links (leave the portal) — always accessible */}
          <div style={{ height: 1, background: 'rgba(201,164,85,0.08)', margin: '8px 6px' }} />
          {[{ label: 'Hub', icon: Home, href: '/hub', id: 'hub' }, { label: 'Select', icon: LayoutGrid, href: '/select', id: 'select' }]
            .map((link) => (
            <button
              key={link.href}
              onClick={() => { router.push(link.href); setSidebarOpen(false); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 10, border: 'none',
                background: 'transparent', color: '#a89e8a', cursor: 'pointer',
                marginBottom: 2, transition: 'all 0.15s ease', textAlign: 'left',
                fontFamily: "'DM Sans', sans-serif", fontSize: '14px', fontWeight: 400,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,164,85,0.05)';
                (e.currentTarget as HTMLButtonElement).style.color = '#f0e8d4';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = '#a89e8a';
              }}
            >
              <span style={{ flex: 1 }}>{link.label}</span>
              <span style={{ fontSize: 12, color: '#6f6657' }}>↗</span>
            </button>
          ))}
        </nav>

        {/* Sidebar footer */}
        <div
          style={{
            padding: '18px 20px',
            borderTop: '1px solid rgba(201,164,85,0.08)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6f6657', fontWeight: 600 }}>
              Roadmap
            </div>
            <div style={{ fontSize: '11px' }}>
              <span style={{ color: '#c9a455', fontWeight: 600 }}>{roadmapDone}</span>
              <span style={{ color: '#6f6657' }}>&nbsp;/&nbsp;{roadmapTotal}</span>
            </div>
          </div>
          {/* Progress bar — tracks roadmap progression */}
          <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
            <div style={{
              height: '100%',
              width: `${roadmapPct}%`,
              background: 'linear-gradient(90deg, #c9a455 0%, #e8b44d 100%)',
              borderRadius: 2,
              transition: 'width 0.6s ease',
              minWidth: roadmapDone > 0 ? 4 : 0,
            }} />
          </div>
          <div style={{ fontSize: '11px', color: '#6f6657', marginTop: 6 }}>
            {roadmapPct}% complete
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div style={{ marginLeft: isMobile ? 0 : 264, flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Floating top controls — no black bar, no title text. Just the mobile
            menu, per-view search, and a prominent action-items bell that floats
            over the content on every view (including Recordings). */}
        <header
          style={{
            position: 'sticky',
            top: 0,
            minHeight: 64,
            display: 'flex',
            alignItems: 'center',
            // Right padding clears the fixed ProfileButton (right:28, 44px wide)
            // so the bell sits to its left with a comfortable gap.
            padding: '0 84px 0 24px',
            gap: 16,
            background: 'transparent',
            zIndex: 30,
            pointerEvents: 'none', // empty area is click-through; controls re-enable below
          }}
        >
          {/* Mobile menu button */}
          <button
            onClick={() => setSidebarOpen(true)}
            style={{
              display: isMobile ? 'flex' : 'none',
              background: 'none',
              border: 'none',
              color: '#a89e8a',
              cursor: 'pointer',
              padding: 4,
              pointerEvents: 'auto',
            }}
          >
            <Menu size={20} />
          </button>

          <div style={{ flex: 1 }} />

          {/* Search for modules view */}
          {activeView === 'modules' && (
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                pointerEvents: 'auto',
                flex: '0 1 200px',
                minWidth: 0,
                maxWidth: 200,
              }}
            >
              <Search
                size={14}
                style={{ position: 'absolute', left: 10, color: '#857a67', pointerEvents: 'none' }}
              />
              <input
                type="text"
                placeholder="Search modules..."
                value={moduleSearch}
                onChange={(e) => setModuleSearch(e.target.value)}
                style={{
                  background: 'rgba(12,10,7,0.85)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid rgba(201,164,85,0.2)',
                  borderRadius: 8,
                  padding: '8px 12px 8px 30px',
                  color: '#f0e8d4',
                  fontSize: '13px',
                  outline: 'none',
                  width: '100%', maxWidth: 200, minWidth: 0,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              />
              {moduleSearch && (
                <button
                  onClick={() => setModuleSearch('')}
                  style={{
                    position: 'absolute',
                    right: 8,
                    background: 'none',
                    border: 'none',
                    color: '#857a67',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}

          {activeView === 'sops' && (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', pointerEvents: 'auto', flex: '0 1 200px', minWidth: 0, maxWidth: 200 }}>
              <Search
                size={14}
                style={{ position: 'absolute', left: 10, color: '#857a67', pointerEvents: 'none' }}
              />
              <input
                type="text"
                placeholder="Search SOPs..."
                value={sopSearch}
                onChange={(e) => setSopSearch(e.target.value)}
                style={{
                  background: 'rgba(12,10,7,0.85)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid rgba(201,164,85,0.2)',
                  borderRadius: 8,
                  padding: '8px 12px 8px 30px',
                  color: '#f0e8d4',
                  fontSize: '13px',
                  outline: 'none',
                  width: '100%', maxWidth: 200, minWidth: 0,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              />
              {sopSearch && (
                <button
                  onClick={() => setSopSearch('')}
                  style={{
                    position: 'absolute',
                    right: 8,
                    background: 'none',
                    border: 'none',
                    color: '#857a67',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}

          {/* Action items notification — prominent, floats on every view */}
          <ActionItemsBell />
        </header>

        {/* View content */}
        <main data-tour="portal-content" style={{ flex: 1, padding: 'clamp(14px, 4vw, 24px)', overflow: 'auto', position: 'relative', zIndex: 1 }}>
          {/* Per-section Loom walkthrough (admin-managed) */}
          <SectionGuide section={activeView} />
          {activeView === 'dashboard' && (
            <DashboardView
              modsDone={modsDone}
              onModLink={handleModLink}
              isMobile={isMobile}
              isAdmin={isAdmin}
            />
          )}
          {activeView === 'roadmap' && <RoadmapView />}
          {activeView === 'resources' && <ResourcesView isAdmin={isAdmin} initialSlug={initialResourceSlug} />}
          {activeView === 'recordings' && <RecordingsView onBack={() => setView('dashboard')} />}
          {activeView === 'modules' && (
            <ModulesView
              completedMods={completedMods}
              toggleMod={toggleMod}
              phaseFilter={modulePhaseFilter}
              setPhaseFilter={setModulePhaseFilter}
              search={moduleSearch}
              highlightedMod={highlightedMod}
            />
          )}
          {activeView === 'sops' && (
            <SopsView
              selectedCategory={selectedCategory}
              setSelectedCategory={setSelectedCategory}
              search={sopSearch}
              setInlineSop={setInlineSop}
            />
          )}
        </main>
      </div>

      {/* Inline SOP modal */}
      {inlineSop && (
        <InlineSopModal sop={inlineSop} onClose={() => setInlineSop(null)} />
      )}

      <PageTour id="portal" steps={PORTAL_TOUR} />
    </div>
  );
}

// ─── My Progress (client-facing — no sensitive admin data) ─────────────────────

interface MeCheckIn {
  id: string;
  title: string | null;
  coach_name: string | null;
  call_date: string | null;
  recording_url: string | null;
  summary_bullets: string[];
  action_steps: string[];
  queries_answered: string[];
  wins: string[];
}
interface MeProgress {
  counts: { total: number; byCoach: { coach_name: string | null; coach_email: string | null; count: number }[] };
  progress: { narrative: string; open_action_items: string[]; wins: string[]; momentum: string | null } | null;
  checkins: MeCheckIn[];
}

function fmtIso(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Action Items (assigned tasks + completion) ───────────────────────────────

function ActionItemRow({ item, onToggle }: {
  item: ClientActionItem;
  onToggle: (id: string, status: 'open' | 'completed') => void;
}) {
  const done = item.status === 'completed';
  const ds = done ? null : dueState(item.due_date);
  const dueColor = ds === 'overdue' ? '#ef4444' : ds === 'soon' ? '#f59e0b' : '#857a67';
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 2px' }}>
      <button
        onClick={() => onToggle(item.id, done ? 'open' : 'completed')}
        title={done ? 'Mark as not done' : 'Mark complete'}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 1, color: done ? '#4ade80' : '#c9a455', flexShrink: 0, display: 'flex' }}
      >
        {done ? <CheckSquare size={16} /> : <Square size={16} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: done ? '#857a67' : '#bcae97', textDecoration: done ? 'line-through' : 'none' }}>
          {item.text}
        </div>
        {item.due_date && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: 10.5, color: dueColor }}>
            <Clock size={10} /> {ds === 'overdue' ? 'Overdue · ' : 'Due '}{fmtIso(item.due_date)}
          </span>
        )}
      </div>
      {item.source === 'ai' && (
        <span style={{ fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(96,165,250,0.7)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: 4, padding: '1px 5px', flexShrink: 0, marginTop: 2 }}>
          From call
        </span>
      )}
    </div>
  );
}

function CompletedToggle({ completed, onToggle }: { completed: ClientActionItem[]; onToggle: (id: string, status: 'open' | 'completed') => void }) {
  const [show, setShow] = useState(false);
  if (!completed.length) return null;
  return (
    <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8 }}>
      <button onClick={() => setShow((s) => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#857a67', fontSize: 11, padding: 0 }}>
        {show ? 'Hide' : 'Show'} completed ({completed.length})
      </button>
      {show && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
          {completed.map((it) => <ActionItemRow key={it.id} item={it} onToggle={onToggle} />)}
        </div>
      )}
    </div>
  );
}

function ActionItemsBell() {
  const { openItems, openCount, items, toggle } = useActionItems();
  const [open, setOpen] = useState(false);
  const overdue = openItems.some((i) => dueState(i.due_date) === 'overdue');
  const completed = items.filter((i) => i.status === 'completed');

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', pointerEvents: 'auto' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Action items"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: 'rgba(12,10,7,0.9)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          border: `1.5px solid ${openCount ? 'rgba(201,164,85,0.65)' : 'rgba(201,164,85,0.35)'}`,
          boxShadow: openCount
            ? '0 6px 22px rgba(201,164,85,0.3), inset 0 0 0 1px rgba(201,164,85,0.12)'
            : '0 6px 18px rgba(0,0,0,0.5)',
          color: openCount ? '#e8c668' : '#c9a455',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        <Bell size={19} />
        {openCount > 0 && (
          <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: overdue ? '#ef4444' : '#c9a455', color: '#0a0806', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, border: '2px solid rgba(12,10,7,0.95)', boxShadow: overdue ? '0 0 10px rgba(239,68,68,0.6)' : '0 0 10px rgba(201,164,85,0.5)' }}>
            {openCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
          <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 12px)', width: 340, maxHeight: '70vh', overflowY: 'auto', zIndex: 61, background: 'rgba(12,10,7,0.98)', border: '1px solid rgba(201,164,85,0.18)', borderRadius: 14, padding: '16px 18px', boxShadow: '0 24px 60px rgba(0,0,0,0.55)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <span className="font-serif" style={{ fontSize: '1.05rem', color: '#f0e8d4' }}>Action Items</span>
              <span style={{ fontSize: 11, color: overdue ? '#ef4444' : '#857a67' }}>{openCount} to complete</span>
            </div>
            {openItems.length === 0 ? (
              <div style={{ fontSize: 12.5, color: '#857a67', padding: '12px 0' }}>You&apos;re all caught up.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {openItems.map((it) => <ActionItemRow key={it.id} item={it} onToggle={toggle} />)}
              </div>
            )}
            <CompletedToggle completed={completed} onToggle={toggle} />
          </div>
        </>
      )}
    </div>
  );
}

function ActionItemsCard() {
  const { openItems, items, toggle, openCount } = useActionItems();
  const completed = items.filter((i) => i.status === 'completed');
  const overdueCount = openItems.filter((i) => dueState(i.due_date) === 'overdue').length;

  // Nothing assigned yet → don't show the card at all.
  if (items.length === 0) return null;

  return (
    <div style={{ background: 'linear-gradient(135deg, rgba(201,164,85,0.06) 0%, rgba(6,5,4,0) 60%)', border: '1px solid rgba(201,164,85,0.14)', borderRadius: 20, padding: '24px 28px', marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
        <h2 className="font-serif" style={{ fontSize: '1.5rem', fontWeight: 300, color: '#f0e8d4', margin: 0 }}>Action Items</h2>
        <span style={{ fontSize: 13, color: overdueCount ? '#ef4444' : '#857a67' }}>
          {openCount === 0 ? 'All complete' : `${openCount} to complete${overdueCount ? ` · ${overdueCount} overdue` : ''}`}
        </span>
      </div>
      {openItems.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {openItems.map((it) => <ActionItemRow key={it.id} item={it} onToggle={toggle} />)}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: '#857a67' }}>Nothing outstanding — nice work.</div>
      )}
      <CompletedToggle completed={completed} onToggle={toggle} />
    </div>
  );
}

function MyProgressPanel() {
  const [data, setData] = useState<MeProgress | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/me/progress')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Hide entirely until there's something to show.
  if (!loaded || !data || (data.counts.total === 0 && !data.progress)) return null;

  const gold = '#c9a455';
  const cream = '#f0e8d4';
  const faint = '#857a67';

  const ProgList = ({ label, items, color }: { label: string; items: string[]; color: string }) => {
    if (!items?.length) return null;
    return (
      <div>
        <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color, marginBottom: 6, fontWeight: 600 }}>{label}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {items.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#a89e8a', lineHeight: 1.5 }}>
              <span style={{ color: gold, flexShrink: 0 }}>•</span><span>{t}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(201,164,85,0.06) 0%, rgba(6,5,4,0) 60%)',
      border: '1px solid rgba(201,164,85,0.14)', borderRadius: 20, padding: '28px 32px', marginBottom: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <h2 className="font-serif" style={{ fontSize: '1.5rem', fontWeight: 300, color: cream, margin: 0 }}>
          Your Progress
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: faint }}>
            <span style={{ color: gold, fontWeight: 600, fontSize: 18 }}>{data.counts.total}</span>&nbsp;check-ins
          </span>
          {data.counts.byCoach.map((c, i) => (
            <span key={i} style={{
              fontSize: 11, color: gold, padding: '3px 10px', borderRadius: 20,
              border: '1px solid rgba(201,164,85,0.25)', background: 'rgba(201,164,85,0.06)',
            }}>{(c.coach_name || 'Coach')} · {c.count}</span>
          ))}
        </div>
      </div>

      {data.progress && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: data.checkins.length ? 22 : 0 }}>
          {data.progress.narrative && (
            <p style={{ fontSize: 14, color: '#bcae97', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>
              {data.progress.narrative}
            </p>
          )}
          {/* Action steps now live in the interactive Action Items card above. */}
          <ProgList label="Wins" items={data.progress.wins} color="rgba(74,222,128,0.55)" />
        </div>
      )}

      {!!data.checkins.length && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: faint, fontWeight: 600, marginBottom: 2 }}>
            Check-in History
          </div>
          {data.checkins.map((ci) => {
            const open = openId === ci.id;
            return (
              <div key={ci.id} style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(201,164,85,0.08)', borderRadius: 12, overflow: 'hidden' }}>
                <button onClick={() => setOpenId(open ? null : ci.id)} style={{
                  width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                  padding: '11px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  color: cream, fontFamily: "'DM Sans', sans-serif",
                }}>
                  <span style={{ fontSize: 13 }}>
                    {ci.title || 'Check-in'}
                    <span style={{ color: faint, marginLeft: 8, fontSize: 11.5 }}>
                      {fmtIso(ci.call_date)}{ci.coach_name ? ` · ${ci.coach_name}` : ''}
                    </span>
                  </span>
                  <span style={{ color: faint }}>{open ? '−' : '+'}</span>
                </button>
                {open && (
                  <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <ProgList label="Summary" items={ci.summary_bullets} color="rgba(201,164,85,0.5)" />
                    <ProgList label="Action Steps" items={ci.action_steps} color="rgba(201,164,85,0.5)" />
                    <ProgList label="Questions Answered" items={ci.queries_answered} color="rgba(201,164,85,0.5)" />
                    <ProgList label="Wins" items={ci.wins} color="rgba(74,222,128,0.55)" />
                    {ci.recording_url && (
                      <a href={ci.recording_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: gold, textDecoration: 'none' }}>
                        Rewatch recording ↗
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Dashboard View ───────────────────────────────────────────────────────────

// ─── Roadmap (shared phase cards + dedicated view) ────────────────────────────

function RoadmapPhases() {
  const { completed, toggle, open, phases } = useRoadmap();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: 14, alignItems: 'start' }}>
      {phases.map((phase) => {
        const phaseLocked = !open && !isPhaseUnlocked(phase.id, completed, phases);
        const phaseDone = phase.items.filter((i) => completed.has(i.id)).length;
        const isCollapsed = !!collapsed[phase.id];
        return (
          <div key={phase.id} style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(201,164,85,0.1)',
            borderRadius: 16, overflow: 'hidden',
            opacity: phaseLocked ? 0.55 : 1,
          }}>
            {/* Phase header — click to collapse/expand */}
            <div
              onClick={() => setCollapsed((c) => ({ ...c, [phase.id]: !c[phase.id] }))}
              role="button"
              title={isCollapsed ? 'Expand' : 'Collapse'}
              style={{
                padding: '14px 18px',
                background: `linear-gradient(90deg, ${phase.color}14 0%, transparent 100%)`,
                borderBottom: isCollapsed ? 'none' : `1px solid ${phase.color}18`,
                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
              }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                background: `${phase.color}18`, border: `1px solid ${phase.color}35`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {phaseLocked
                  ? <Lock size={12} style={{ color: phase.color }} />
                  : <div style={{ width: 8, height: 8, borderRadius: '50%', background: phase.color }} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: phase.color, lineHeight: 1 }}>{phase.label}</div>
                <div className="font-serif" style={{ fontSize: '0.95rem', fontWeight: 400, color: '#f0e8d4', marginTop: 3, lineHeight: 1.2 }}>{phase.title}</div>
              </div>
              <span style={{ fontSize: 10, color: '#a89e8a', flexShrink: 0 }}>{phaseDone}/{phase.items.length}</span>
              <ChevronDown size={15} style={{ color: phase.color, opacity: 0.65, flexShrink: 0, transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.2s ease' }} />
            </div>

            {/* Phase items */}
            {!isCollapsed && (
            <div style={{ padding: '6px 0' }}>
              {phase.items.map((item, idx) => {
                const itemCompleted = completed.has(item.id);
                const itemLocked = !open && !isItemUnlocked(item.id, completed, phases);
                const toggleable = open || canToggleItem(item.id, completed, phases);
                return (
                  <div key={item.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 18px',
                    borderBottom: idx < phase.items.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                    opacity: itemLocked ? 0.5 : 1,
                  }}>
                    {itemLocked ? (
                      <Lock size={13} style={{ color: '#7d7363', flexShrink: 0 }} />
                    ) : (
                      <button
                        onClick={() => { if (toggleable) toggle(item.id); }}
                        disabled={!toggleable}
                        title={!toggleable ? 'Complete steps in order' : itemCompleted ? 'Mark incomplete' : 'Mark complete'}
                        style={{
                          background: 'none', border: 'none', padding: 0, flexShrink: 0, display: 'flex',
                          cursor: toggleable ? 'pointer' : 'default',
                          color: itemCompleted ? '#4ade80' : '#c9a455',
                          opacity: toggleable ? 1 : 0.55,
                        }}
                      >
                        {itemCompleted ? <CheckSquare size={15} /> : <Square size={15} />}
                      </button>
                    )}
                    <span style={{
                      flex: 1, fontSize: '12.5px', lineHeight: 1.45,
                      color: itemCompleted ? '#a89e8a' : '#c5b9a3',
                      textDecoration: itemCompleted ? 'line-through' : 'none',
                    }}>
                      {item.text}
                    </span>
                    {item.href && !itemLocked && (
                      <Link href={item.href} title="Open in the app" style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                        background: 'rgba(201,164,85,0.09)', color: '#c9a455', textDecoration: 'none',
                      }}>
                        <ArrowRight size={11} />
                      </Link>
                    )}
                    {item.sop && !itemLocked && (
                      <a href={item.sop} target="_blank" rel="noopener noreferrer" title="Open SOP" style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                        background: 'rgba(201,164,85,0.09)', color: '#c9a455', textDecoration: 'none',
                      }}>
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RoadmapView() {
  const { completed, total } = useRoadmap();
  const done = completed.size;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="view-in">
      <div style={{
        background: 'linear-gradient(135deg, rgba(201,164,85,0.06) 0%, rgba(6,5,4,0) 60%)',
        border: '1px solid rgba(201,164,85,0.14)', borderRadius: 20, padding: '24px 28px', marginBottom: 22,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <h2 className="font-serif" style={{ fontSize: '1.5rem', fontWeight: 300, color: '#f0e8d4', margin: 0 }}>Your Roadmap</h2>
          <span style={{ fontSize: 12, color: '#a89e8a' }}>Complete each step in order to unlock the next</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, height: 4, background: 'rgba(201,164,85,0.12)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#4ade80' : 'linear-gradient(90deg, #c9a455, #e8b44d)', borderRadius: 2, transition: 'width 0.5s ease' }} />
          </div>
          <span style={{ fontSize: 12, color: '#c9a455', fontWeight: 600, flexShrink: 0 }}>{done}/{total}</span>
        </div>
      </div>
      <RoadmapPhases />
    </div>
  );
}

// ─── Call Recordings ──────────────────────────────────────────────────────────
// Categories + Recording type are shared with /hub via lib/recordings so both
// surfaces always show the same uploaded recordings.

function RecordingsView({ onBack }: { onBack?: () => void }) {
  const [items, setItems] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/recordings').then((r) => (r.ok ? r.json() : [])).then((d) => setItems(d || [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)).then((u) => setIsAdmin(u?.role === 'admin')).catch(() => {});
  }, []);

  const del = async (id: string) => { await fetch(`/api/recordings/${id}`, { method: 'DELETE' }).catch(() => {}); load(); };

  if (loading) return <div className="view-in"><SkeletonList rows={4} /></div>;

  // Full-page player (admin add/edit/delete live inside the player sidebar).
  return (
    <RecordingsPlayer
      recordings={items}
      isAdmin={isAdmin}
      onDelete={del}
      onChanged={load}
      title="Call Recordings"
      blurb="Every coaching call in one place — Content Mastermind, VTC, and Scripting Mastermind. Pick a session from the list to watch, revisit a breakthrough, or catch up on one you missed."
      onBack={onBack}
      backLabel="Dashboard"
    />
  );
}

function DashboardView({
  modsDone,
  onModLink,
  isMobile,
  isAdmin,
}: {
  modsDone: number;
  onModLink: (id: string) => void;
  isMobile: boolean;
  isAdmin: boolean;
}) {
  const { completed: roadmapCompleted, total: roadmapTotal, phases } = useRoadmap();
  const roadmapDone = roadmapCompleted.size;
  // Admins don't get the roadmap on their portal dashboard (client tool).
  const stats = [
    { label: 'Modules Done',   value: String(modsDone),   sub: `of ${TOTAL_MODULES} total`, color: '#60a5fa' },
    { label: 'SOPs Available', value: String(TOTAL_SOPS), sub: 'procedures',                color: '#4ade80' },
    { label: 'Phases',         value: String(phases.length), sub: 'in sequence',            color: '#f59e0b' },
    ...(isAdmin ? [] : [{ label: 'Roadmap Steps', value: String(roadmapDone), sub: `of ${roadmapTotal} done`, color: '#e879f9' }]),
  ];
  return (
    <div className="view-in">

      {/* ── Hero Banner ─────────────────────────────────────────────── */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, rgba(201,164,85,0.08) 0%, rgba(6,5,4,0) 60%)',
          border: '1px solid rgba(201,164,85,0.14)',
          borderRadius: 20,
          padding: 'clamp(22px, 5vw, 36px) clamp(18px, 5vw, 40px) clamp(20px, 5vw, 32px)',
          marginBottom: 24,
        }}
      >
        {/* Decorative glow */}
        <div style={{
          position: 'absolute', top: -60, right: -60,
          width: 280, height: 280,
          background: 'radial-gradient(circle, rgba(201,164,85,0.07) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        {/* Watermark */}
        <div className="font-serif" style={{
          position: 'absolute', right: 32, bottom: -16,
          fontSize: '7rem', fontWeight: 300,
          color: 'rgba(201,164,85,0.04)',
          lineHeight: 1, userSelect: 'none', pointerEvents: 'none',
        }}>
          BA
        </div>

        <div style={{ position: 'relative' }}>
          <div style={{
            fontSize: '10px', letterSpacing: '0.25em', textTransform: 'uppercase',
            color: '#c9a455', marginBottom: 12, fontWeight: 700,
          }}>
            VTC · Member Portal
          </div>
          <h1 className="font-serif" style={{
            fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)',
            fontWeight: 300, color: '#f0e8d4',
            margin: '0 0 10px', lineHeight: 1.15,
          }}>
            Your Command Center
          </h1>
          <p style={{
            fontSize: '14px', color: '#857a67',
            margin: 0, maxWidth: 520, lineHeight: 1.7,
          }}>
            Follow the roadmap in sequence. Every phase compounds on the last.
            Speed of implementation is your biggest competitive edge.
          </p>
        </div>
      </div>

      {/* ── Action Items (assigned + from check-ins) ────────────────── */}
      <ActionItemsCard />

      {/* ── My Progress (Fathom check-ins) ──────────────────────────── */}
      <MyProgressPanel />

      {/* ── Stats Row ───────────────────────────────────────────────── */}
      <div
        style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : `repeat(${stats.length}, 1fr)`, gap: 12, marginBottom: 32 }}
      >
        {stats.map((s) => (
          <div key={s.label} style={{
            background: 'rgba(255,255,255,0.015)',
            border: '1px solid rgba(201,164,85,0.07)',
            borderRadius: 14, padding: '18px 18px 16px',
          }}>
            <div style={{
              fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase',
              color: '#6f6657', marginBottom: 8, fontWeight: 600,
            }}>{s.label}</div>
            <div className="font-serif" style={{
              fontSize: '2rem', fontWeight: 300, color: s.color, lineHeight: 1,
            }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: '#6f6657', marginTop: 5 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Roadmap (clients only — admins don't use it) ─────────────── */}
      {!isAdmin && (
        <>
          <div style={{ marginBottom: 18, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <h2 className="font-serif" style={{ fontSize: '1.5rem', fontWeight: 300, color: '#f0e8d4', margin: 0 }}>
              Your Roadmap
            </h2>
            <span style={{ fontSize: '11px', color: '#a89e8a', letterSpacing: '0.04em' }}>
              {roadmapDone}/{roadmapTotal} complete · finish each step to unlock the next
            </span>
          </div>
          <RoadmapPhases />
        </>
      )}
    </div>
  );
}


// ─── Modules View ─────────────────────────────────────────────────────────────

function ModulesView({
  completedMods,
  toggleMod,
  phaseFilter,
  setPhaseFilter,
  search,
  highlightedMod,
}: {
  completedMods: Set<string>;
  toggleMod: (id: string) => void;
  phaseFilter: number | null;
  setPhaseFilter: (p: number | null) => void;
  search: string;
  highlightedMod: string | null;
}) {
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlightedMod && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedMod]);

  const phases = [1, 2, 3, 4];

  const filtered = MODULES.filter((m) => {
    if (phaseFilter !== null && m.ph !== phaseFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        m.title.toLowerCase().includes(q) ||
        m.desc.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="view-in">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 22 }}>
        <h2 className="font-serif" style={{ fontSize: '1.5rem', fontWeight: 300, color: '#f0e8d4', margin: '0 0 4px' }}>
          Low-Ticket Archive
        </h2>
        <p style={{ fontSize: '13px', color: '#857a67', margin: 0 }}>
          {TOTAL_MODULES} archived low-ticket modules — admin reference only
        </p>
      </div>

      {/* ── Phase Filter Tabs ────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <button
          onClick={() => setPhaseFilter(null)}
          style={{
            padding: '8px 16px', borderRadius: 8,
            border: `1px solid ${phaseFilter === null ? 'rgba(201,164,85,0.4)' : 'rgba(255,255,255,0.07)'}`,
            background: phaseFilter === null ? 'rgba(201,164,85,0.1)' : 'rgba(255,255,255,0.02)',
            color: phaseFilter === null ? '#c9a455' : '#857a67',
            fontSize: '12px', fontWeight: 600, letterSpacing: '0.05em',
            cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s ease',
          }}
        >
          All
        </button>
        {phases.map((ph) => (
          <button
            key={ph}
            onClick={() => setPhaseFilter(ph === phaseFilter ? null : ph)}
            style={{
              padding: '8px 16px', borderRadius: 8,
              border: `1px solid ${phaseFilter === ph ? `${PHASE_COLORS[ph]}55` : 'rgba(255,255,255,0.07)'}`,
              background: phaseFilter === ph ? `${PHASE_COLORS[ph]}14` : 'rgba(255,255,255,0.02)',
              color: phaseFilter === ph ? PHASE_COLORS[ph] : '#857a67',
              fontSize: '12px', fontWeight: 600, letterSpacing: '0.05em',
              cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s ease',
            }}
          >
            {PHASE_NAMES[ph]}
          </button>
        ))}
      </div>

      {/* ── Module Grid ──────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#857a67', fontSize: '14px' }}>
          No modules found matching your search.
        </div>
      ) : (
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', gap: 14 }}
        >
          {filtered.map((mod) => {
            const done = completedMods.has(mod.id);
            const isHighlighted = highlightedMod === mod.id;
            const phColor = PHASE_COLORS[mod.ph];

            return (
              <div
                key={mod.id}
                ref={isHighlighted ? highlightRef : null}
                style={{
                  position: 'relative',
                  background: done ? 'rgba(74,222,128,0.025)' : 'rgba(255,255,255,0.018)',
                  border: `1px solid ${isHighlighted ? 'rgba(201,164,85,0.55)' : done ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.06)'}`,
                  borderLeft: `3px solid ${phColor}`,
                  borderRadius: 14,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'all 0.25s ease',
                  boxShadow: isHighlighted ? `0 0 28px rgba(201,164,85,0.14)` : 'none',
                }}
              >
                {/* Large decorative module number */}
                <div className="font-serif" style={{
                  position: 'absolute',
                  top: -8,
                  right: 12,
                  fontSize: '5.5rem',
                  fontWeight: 300,
                  color: `${phColor}10`,
                  lineHeight: 1,
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}>
                  {mod.num}
                </div>

                {/* Card content */}
                <div style={{ padding: '20px 20px 18px', flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>

                  {/* Top meta row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{
                      fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                      color: phColor, background: `${phColor}14`, padding: '3px 9px', borderRadius: 6,
                    }}>
                      {PHASE_NAMES[mod.ph]}
                    </span>
                    <span style={{
                      fontSize: '9px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
                      color: 'rgba(201,164,85,0.35)', background: 'rgba(201,164,85,0.07)',
                      padding: '3px 8px', borderRadius: 6,
                    }}>
                      Coming Soon
                    </span>
                  </div>

                  {/* Module label */}
                  <div style={{ fontSize: '10px', letterSpacing: '0.1em', color: '#6f6657', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase' }}>
                    Module {mod.num}
                  </div>

                  {/* Title */}
                  <h3 style={{
                    fontSize: '15px', fontWeight: 600, color: '#f0e8d4',
                    margin: '0 0 9px', lineHeight: 1.35,
                  }}>
                    {mod.title}
                  </h3>

                  {/* Description */}
                  <p style={{
                    fontSize: '12.5px', color: '#857a67',
                    margin: '0 0 14px', lineHeight: 1.65, flex: 1,
                  }}>
                    {mod.desc}
                  </p>

                  {/* Tags */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 16 }}>
                    {mod.tags.map((tag) => (
                      <span key={tag} style={{
                        fontSize: '10px', color: '#4a4540',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        padding: '2px 8px', borderRadius: 5,
                      }}>
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Mark complete button */}
                  <button
                    onClick={() => { if (!done) trackView('module_view', mod.id, mod.title); toggleMod(mod.id); }}
                    style={{
                      width: '100%', padding: '10px 0',
                      borderRadius: 8,
                      border: `1px solid ${done ? 'rgba(74,222,128,0.35)' : 'rgba(201,164,85,0.18)'}`,
                      background: done ? 'rgba(74,222,128,0.08)' : 'rgba(201,164,85,0.04)',
                      color: done ? '#4ade80' : '#6a6058',
                      fontSize: '12px', fontWeight: 600, letterSpacing: '0.04em',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                      fontFamily: "'DM Sans', sans-serif",
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!done) {
                        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,164,85,0.1)';
                        (e.currentTarget as HTMLButtonElement).style.color = '#c9a455';
                        (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,164,85,0.35)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!done) {
                        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,164,85,0.04)';
                        (e.currentTarget as HTMLButtonElement).style.color = '#6a6058';
                        (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,164,85,0.18)';
                      }
                    }}
                  >
                    {done ? (<><CheckCircle2 size={14} /> Completed</>) : (<><Circle size={14} /> Mark Complete</>)}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── SOP Category Descriptions ────────────────────────────────────────────────

const CAT_DESCRIPTIONS: Record<string, string> = {
  setting: 'Scripts, follow-up sequences, and frameworks for converting conversations into booked calls',
  closing: 'Full call structure, objection playbooks, and post-call sequences that close high-ticket',
  content: 'Profile optimization, content strategy, hooks, captions, and platform SOPs',
  kpis: 'Track revenue, leads, close rates, and content metrics that actually drive decisions',
  fulfillment: 'Deliver a world-class client experience from day one through case study',
  team: 'Build, train, and manage closers and setters without babysitting',
  ops: 'CRM setup, tech stack, automations, and systems that scale without you',
  va: 'Standard procedures for virtual assistants to execute daily without oversight',
  offer: 'Price, position, and productize your offer to attract premium clients consistently',
  'client-success': 'Onboarding, check-ins, testimonial collection, and case study production',
  'from-calls': '27 SOPs extracted directly from live coaching calls with real clients',
};

// ─── SOP Library View ─────────────────────────────────────────────────────────

function SopsView({
  selectedCategory,
  setSelectedCategory,
  search,
  setInlineSop,
}: {
  selectedCategory: string | null;
  setSelectedCategory: (id: string | null) => void;
  search: string;
  setInlineSop: (sop: TranscriptSop | null) => void;
}) {
  const selectedCat = SOP_CATEGORIES.find((c) => c.id === selectedCategory);

  const filteredCategories = search
    ? SOP_CATEGORIES.filter(
        (cat) =>
          cat.name.toLowerCase().includes(search.toLowerCase()) ||
          cat.sops.some((s) => s.title.toLowerCase().includes(search.toLowerCase()))
      )
    : SOP_CATEGORIES;

  const filteredSops = selectedCat
    ? search
      ? selectedCat.sops.filter((s) => s.title.toLowerCase().includes(search.toLowerCase()))
      : selectedCat.sops
    : [];

  return (
    <div className="view-in">
      {selectedCategory && selectedCat ? (

        // ── SOP Detail Panel ────────────────────────────────────────
        <div>
          <button
            onClick={() => setSelectedCategory(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', color: '#6a6058',
              cursor: 'pointer', fontSize: '13px', padding: '0 0 22px',
              fontFamily: "'DM Sans', sans-serif', transition: 'color 0.15s",
            }}
            onMouseEnter={(e) => { (e.currentTarget).style.color = '#c9a455'; }}
            onMouseLeave={(e) => { (e.currentTarget).style.color = '#6a6058'; }}
          >
            <ArrowLeft size={14} />
            Back to categories
          </button>

          {/* Category header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28,
            padding: '20px 24px',
            background: `linear-gradient(135deg, ${selectedCat.color}0c 0%, transparent 100%)`,
            border: `1px solid ${selectedCat.color}20`,
            borderRadius: 14,
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: `${selectedCat.color}14`,
              border: `1px solid ${selectedCat.color}28`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.5rem', flexShrink: 0,
            }}>
              {selectedCat.icon}
            </div>
            <div>
              <h2 className="font-serif" style={{ fontSize: '1.4rem', fontWeight: 400, color: '#f0e8d4', margin: '0 0 4px' }}>
                {selectedCat.name}
              </h2>
              <div style={{ fontSize: '12px', color: '#857a67' }}>
                {CAT_DESCRIPTIONS[selectedCat.id] ?? `${selectedCat.count} standard operating procedures`}
              </div>
            </div>
            <div style={{
              marginLeft: 'auto', fontSize: '11px', fontWeight: 700,
              color: selectedCat.color, background: `${selectedCat.color}14`,
              padding: '5px 12px', borderRadius: 8, flexShrink: 0,
            }}>
              {selectedCat.count} SOPs
            </div>
          </div>

          {filteredSops.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#857a67', fontSize: '14px' }}>
              No SOPs match your search.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {filteredSops.map((sop, idx) => {
                const isInline = (sop as { inline?: boolean }).inline === true;
                const sopId = (sop as { id?: string }).id;
                const sopUrl = (sop as { url?: string }).url;

                const iconBox = (
                  <div style={{
                    width: 34, height: 34, borderRadius: 9,
                    background: `${selectedCat.color}0e`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <FileText size={14} style={{ color: selectedCat.color }} />
                  </div>
                );

                const rowBase = {
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '13px 16px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.018)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  transition: 'all 0.15s ease',
                } as const;

                const hoverIn = (el: HTMLElement) => {
                  el.style.background = `${selectedCat.color}08`;
                  el.style.borderColor = `${selectedCat.color}25`;
                };
                const hoverOut = (el: HTMLElement) => {
                  el.style.background = 'rgba(255,255,255,0.018)';
                  el.style.borderColor = 'rgba(255,255,255,0.05)';
                };

                if (isInline) {
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        const ts = sopId ? TRANSCRIPT_BY_ID[sopId] : undefined;
                        if (ts) { trackView('sop_view', sopId!, sop.title); setInlineSop(ts); }
                      }}
                      style={{ ...rowBase, width: '100%', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", textAlign: 'left', color: 'inherit' }}
                      onMouseEnter={(e) => hoverIn(e.currentTarget)}
                      onMouseLeave={(e) => hoverOut(e.currentTarget)}
                    >
                      {iconBox}
                      <span style={{ flex: 1, fontSize: '13px', color: '#a89e8a', fontWeight: 400 }}>{sop.title}</span>
                      <ChevronRight size={13} style={{ color: selectedCat.color, flexShrink: 0 }} />
                    </button>
                  );
                }

                return (
                  <a
                    key={idx}
                    href={sopUrl ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackView('sop_view', sopId || sopUrl || sop.title, sop.title)}
                    style={{ ...rowBase, textDecoration: 'none', color: 'inherit' }}
                    onMouseEnter={(e) => hoverIn(e.currentTarget)}
                    onMouseLeave={(e) => hoverOut(e.currentTarget)}
                  >
                    {iconBox}
                    <span style={{ flex: 1, fontSize: '13px', color: '#a89e8a', fontWeight: 400 }}>{sop.title}</span>
                    <ExternalLink size={12} style={{ color: '#4a4540', flexShrink: 0 }} />
                  </a>
                );
              })}
            </div>
          )}
        </div>

      ) : (

        // ── Category Grid ───────────────────────────────────────────
        <div>
          {/* Hero banner */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(74,222,128,0.05) 0%, transparent 60%)',
            border: '1px solid rgba(201,164,85,0.1)',
            borderRadius: 18,
            padding: '28px 32px',
            marginBottom: 24,
          }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.22em', textTransform: 'uppercase', color: '#4ade80', marginBottom: 8, fontWeight: 700 }}>
              Reference Library
            </div>
            <h2 className="font-serif" style={{ fontSize: '1.8rem', fontWeight: 300, color: '#f0e8d4', margin: '0 0 6px' }}>
              SOP Library
            </h2>
            <p style={{ fontSize: '13px', color: '#857a67', margin: 0 }}>
              {TOTAL_SOPS} standard operating procedures across {SOP_CATEGORIES.length} categories — click any to expand
            </p>
          </div>

          {filteredCategories.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#857a67', fontSize: '14px' }}>
              No categories match your search.
            </div>
          ) : (
            <div
              style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', gap: 14 }}
            >
              {filteredCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  style={{
                    display: 'flex', flexDirection: 'column',
                    padding: 0,
                    background: 'rgba(255,255,255,0.015)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 14, cursor: 'pointer',
                    textAlign: 'left', transition: 'all 0.2s ease',
                    fontFamily: "'DM Sans', sans-serif",
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.background = `${cat.color}06`;
                    el.style.borderColor = `${cat.color}30`;
                    el.style.transform = 'translateY(-3px)';
                    el.style.boxShadow = `0 12px 32px rgba(0,0,0,0.35)`;
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.background = 'rgba(255,255,255,0.015)';
                    el.style.borderColor = 'rgba(255,255,255,0.06)';
                    el.style.transform = 'translateY(0)';
                    el.style.boxShadow = 'none';
                  }}
                >
                  {/* Color top bar */}
                  <div style={{ height: 3, background: `linear-gradient(90deg, ${cat.color} 0%, ${cat.color}50 100%)` }} />

                  <div style={{ padding: '18px 20px 16px' }}>
                    {/* Icon + count row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 12,
                        background: `${cat.color}12`,
                        border: `1px solid ${cat.color}20`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.3rem',
                      }}>
                        {cat.icon}
                      </div>
                      <div style={{
                        fontSize: '11px', fontWeight: 700,
                        color: cat.color, background: `${cat.color}14`,
                        padding: '4px 10px', borderRadius: 7,
                        letterSpacing: '0.04em',
                      }}>
                        {cat.count}
                      </div>
                    </div>

                    {/* Name */}
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#f0e8d4', marginBottom: 6, lineHeight: 1.25 }}>
                      {cat.name}
                    </div>

                    {/* Description */}
                    <div style={{ fontSize: '12px', color: '#4a4540', lineHeight: 1.6, marginBottom: 14 }}>
                      {CAT_DESCRIPTIONS[cat.id] ?? `${cat.count} standard operating procedures`}
                    </div>

                    {/* Footer */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '11px', color: '#6f6657' }}>{cat.count} SOPs</span>
                      <ChevronRight size={14} style={{ color: cat.color }} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Inline SOP Modal ─────────────────────────────────────────────────────────

function formatSopBody(body: string): string {
  // Insert paragraph breaks before step markers and major section starters
  return body.replace(
    /\. (Step \d|Stage \d|Phase \d|Format \d|Section \d|Category \d|Column \d|Reason \d|Objection \d|KPI \d|App \d|How to |Why this|The practical|The three|The five|The weekly|The monthly|The financial|The identity|The compound|The system|The call|The questions|The types|The prac|Setup:|Critical)/g,
    '.\n\n$1'
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  content: 'Content & Marketing',
  closing: 'Closing & Sales',
  offer: 'Offer Building',
  ops: 'Operations',
  kpi: 'KPIs',
  team: 'Team Management',
  client: 'Client Success',
  mindset: 'Mindset',
  setting: 'Setting & DMs',
  fulfillment: 'Fulfillment',
};

function InlineSopModal({ sop, onClose }: { sop: TranscriptSop; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const bodyText = formatSopBody(sop.body);
  const paragraphs = bodyText.split('\n\n').filter(Boolean);

  return (
    <>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(60px); opacity: 0; }
          to   { transform: translateX(0);   opacity: 1; }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 200,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'flex-end',
        }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div
          style={{
            width: 'min(680px, 96vw)',
            height: '100vh',
            background: 'rgba(10,8,5,0.88)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderLeft: '1px solid rgba(201,164,85,0.15)',
            display: 'flex',
            flexDirection: 'column',
            animation: 'slideInRight 0.22s ease',
            overflowY: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '22px 24px 20px',
              borderBottom: '1px solid rgba(201,164,85,0.08)',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span
                    style={{
                      fontSize: '10px',
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: '#c9a455',
                      background: 'rgba(201,164,85,0.1)',
                      padding: '3px 9px',
                      borderRadius: 20,
                      fontWeight: 600,
                    }}
                  >
                    {CATEGORY_LABELS[sop.category] ?? sop.category}
                  </span>
                  <span style={{ fontSize: '11px', color: '#857a67' }}>
                    {sop.source}
                  </span>
                </div>
                <h2
                  className="font-serif"
                  style={{
                    fontSize: 'clamp(1rem, 2.5vw, 1.25rem)',
                    fontWeight: 400,
                    color: '#f0e8d4',
                    margin: 0,
                    lineHeight: 1.35,
                  }}
                >
                  {sop.title}
                </h2>
              </div>
              <button
                onClick={onClose}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  borderRadius: 8,
                  width: 34,
                  height: 34,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                  color: '#a89e8a',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget).style.background = 'rgba(255,255,255,0.1)';
                  (e.currentTarget).style.borderColor = 'rgba(255,255,255,0.18)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget).style.background = 'rgba(255,255,255,0.05)';
                  (e.currentTarget).style.borderColor = 'rgba(255,255,255,0.09)';
                }}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '24px',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(201,164,85,0.2) transparent',
            }}
          >
            {paragraphs.map((para, i) => (
              <p
                key={i}
                style={{
                  margin: '0 0 1.1em',
                  fontSize: '14px',
                  lineHeight: 1.85,
                  color: '#a89e8a',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {para.trim()}
              </p>
            ))}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid rgba(201,164,85,0.08)',
              flexShrink: 0,
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: '1px solid rgba(201,164,85,0.2)',
                borderRadius: 8,
                padding: '8px 20px',
                color: '#c9a455',
                fontSize: '12px',
                letterSpacing: '0.08em',
                cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif",
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget).style.background = 'rgba(201,164,85,0.07)';
                (e.currentTarget).style.borderColor = 'rgba(201,164,85,0.4)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget).style.background = 'none';
                (e.currentTarget).style.borderColor = 'rgba(201,164,85,0.2)';
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
