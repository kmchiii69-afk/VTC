'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check, ArrowLeft, ArrowRight, ExternalLink, ChevronRight, PartyPopper, Upload, FileText, X, Sparkles, Play,
} from 'lucide-react';
import { MeshBg } from '@/components/ui/mesh-bg';
import { CenterLoader } from '@/components/ui/loaders';
import { OnboardingForm } from '@/components/onboarding/onboarding-form';
import { OfferModulesEmbed } from '@/components/onboarding/offer-modules-embed';
import { loomEmbedUrl } from '@/lib/guides';
import { OnboardingAssistant } from '@/components/onboarding/onboarding-assistant';
import { OnboardingTour, type TourStep } from '@/components/onboarding/onboarding-tour';
import { ContractSigning } from '@/components/onboarding/contract-signing';
import { Markdown } from '@/components/ui/markdown';
import { DEFAULT_RESOURCES } from '@/lib/resources-data';
import { ONBOARDING_FORMS } from '@/lib/onboarding-forms';
import { isEmbeddable, toEmbedUrl } from '@/lib/doc-embed';

// Onboarding steps whose document opens as a native in-app page (not a Google
// Docs embed). Maps the step id → the matching Resources doc; template docs
// carry a "make your copy" link.
//
// Empty since the Aug 2026 BA Roadmap rebuild: the three steps that used this
// (market-research, offer-docs, referral-doc) were merged away or dropped, and
// the docs now hang off 'submit-docs' as ordinary links. The mechanism stays —
// add a step id here to give it a native doc page again.
const STEP_DOC_SLUGS: Record<string, string> = {};
function docForStep(stepId: string): { slug: string; title: string; body: string; templateUrl?: string } | null {
  const slug = STEP_DOC_SLUGS[stepId];
  if (!slug) return null;
  const r = DEFAULT_RESOURCES.find((x) => x.slug === slug);
  return r ? { slug, title: r.title, body: r.body, templateUrl: r.template_url ?? undefined } : null;
}
const COMPLETE_FORMS_STEP = 'complete-forms';

// Which native forms each onboarding's form step collects, in order. Creative
// Specialists have a single-step onboarding whose one step IS a form.
const VARIANT_FORMS: Record<OnboardingVariant, FormKey[]> = {
  default: ['primary', 'secondary'],
  creative: ['creative'],
};

// Step gating — which steps require an action before the Continue button appears.
//  - exempt : Continue always available (read/visit-only steps)
//  - video  : all videos in the step must be opened/played
//  - link   : the step's primary link/booking must be opened at least once
// Steps not listed here are gated by their own data (forms / contract / upload).
const GATE_EXEMPT = new Set(['join-discord']);
const GATE_VIDEO = new Set(['meet-team', 'offer-foundation']);
const GATE_LINK = new Set(['calendar-calls', 'onboarding-call']);

// Welcome screens shown before each onboarding form (skipped when re-editing a
// completed form). The second congratulates them on finishing the first.
const FORM_INTROS: Record<FormKey, { title: string; body: string }> = {
  primary: {
    title: 'First, tell us about you',
    body: 'This quick form captures who you are and what your business is about — it lets us tailor your whole program (strategy, content, and support) specifically to you.',
  },
  secondary: {
    title: 'Nice work — first form done!',
    body: 'One more: the Buyer Mirror Form. It maps out your ideal buyer — their goals, pains, and what makes them say yes — so your content and offer speak directly to the people you want to attract.',
  },
  creative: {
    title: 'One form and you’re in',
    body: 'This maps your setup, your content operation and the brand you build for — your team, your pre- and post-production workflow, and the numbers behind it. It is the only onboarding step you have, so take the time to be specific.',
  },
};
import {
  ONBOARDING_STEPS,
  ONBOARDING_WELCOME,
  ONBOARDING_CALL_STEP_ID,
  STEP_WHY,
  onboardingBoundary,
} from '@/lib/onboarding-data';
import {
  CREATIVE_ONBOARDING_FORM_STEP,
  CREATIVE_ONBOARDING_WELCOME,
  CREATIVE_STEP_WHY,
  stepsForVariant,
  type OnboardingVariant,
} from '@/lib/onboarding-variant';
import type { OnboardingFormId as FormKey } from '@/lib/onboarding-forms';

// Guided walkthrough shown on first visit (and re-launchable from Welcome).
const TOUR_STEPS: TourStep[] = [
  { title: 'Welcome to your onboarding', body: "Here's a 20-second tour of how this works — then you're off to the races." },
  { target: 'content', title: 'One step at a time', body: 'Each step appears here with exactly what to do and why it matters. Do it, then continue.' },
  { target: 'cta', title: 'Complete & continue', body: "Once you've done a step, tap here to check it off and unlock the next one." },
  { target: 'progress', title: 'Track your progress', body: 'This bar fills as you go — your finish line is the onboarding call with your Client Success Manager.' },
  { target: 'help', title: 'Stuck on anything?', body: 'Tap here anytime to ask the onboarding assistant. It knows every step inside out.' },
];

const G = '#c9a455';
const cream = '#f0e8d4';
const sub = '#a89e8a';
const faint = '#857a67';

interface UploadFile { id: string; url: string; name: string; }

export default function OnboardingPage() {
  const router = useRouter();
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [contractTier, setContractTier] = useState<string | null>(null);
  // Bumps whenever the client's tag set changes (admin applied/removed a tag
  // mid-onboarding). Threaded into the contract step so it re-fetches the tiers
  // the new tags unlock. Also drives the call-link refresh.
  const [tagsKey, setTagsKey] = useState('');
  const [uploads, setUploads] = useState<Record<string, UploadFile[]>>({});
  const [callLink, setCallLink] = useState<string | null>(null);
  const [formsDone, setFormsDone] = useState<Partial<Record<FormKey, boolean>>>({});
  const [activeForm, setActiveForm] = useState<FormKey | null>(null);
  // Which onboarding this member is on. 'creative' is the single-form Creative
  // Specialist wizard; everyone else gets the standard client sequence.
  const [variant, setVariant] = useState<OnboardingVariant>('default');
  const [acct, setAcct] = useState<{ name: string; email: string }>({ name: '', email: '' });
  // Previously-saved Onboarding Form answers — used to auto-populate both native
  // forms (shared fields like name/email/phone) and to prefill the onboarding-call
  // calendar at the final step.
  const [primaryAnswers, setPrimaryAnswers] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [meEmail, setMeEmail] = useState(''); // from the onboarding fetch — gates the per-member tour key
  // Step-gating signals (see GATE_* sets above).
  const [contractSigned, setContractSigned] = useState(false);
  const [videoWatched, setVideoWatched] = useState<Record<string, boolean>>({});
  const [linkClicked, setLinkClicked] = useState<Record<string, boolean>>({});
  const [idx, setIdx] = useState(0); // 0 = welcome, 1..N = ONBOARDING_STEPS[idx-1]
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  const [embed, setEmbed] = useState<{ url: string; title: string } | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [tourOn, setTourOn] = useState(false);
  const [outro, setOutro] = useState<'congrats' | 'prepare' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const formsAutoRef = useRef(false); // guards the one-time auto-open of the forms step
  const pendingSlotRef = useRef<string>(''); // which upload slot the file picker is for
  const saveChain = useRef<Promise<void>>(Promise.resolve()); // serializes optimistic step saves in order

  // The steps THIS member works through, resolved from their variant.
  const steps = useMemo(() => stepsForVariant(variant), [variant]);
  const totalSteps = steps.length;
  // The step whose completion is gated on submitting the native form(s).
  const formStepId = variant === 'creative' ? CREATIVE_ONBOARDING_FORM_STEP : COMPLETE_FORMS_STEP;
  const variantForms = VARIANT_FORMS[variant];

  // Pull the saved Onboarding Form answers so we can prefill the Buyer Mirror form
  // and the onboarding-call calendar. Re-run after the primary form is submitted.
  const loadPrimaryAnswers = () => {
    fetch('/api/me/forms/primary')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const saved = (d?.answers || {}) as Record<string, unknown>;
        const a: Record<string, string> = {};
        for (const [k, v] of Object.entries(saved)) a[k] = v == null ? '' : String(v);
        setPrimaryAnswers(a);
      })
      .catch(() => {});
  };

  // Defaults fed into both native forms: account name/email plus anything the
  // client already gave on the Onboarding Form (phone, handles, etc.). Each form
  // overrides these with its own saved answers, so shared fields carry across.
  const formDefaults = useMemo(() => ({
    ...primaryAnswers,
    name: acct.name || primaryAnswers.name || '',
    email: acct.email || primaryAnswers.email || '',
  }), [acct, primaryAnswers]);

  useEffect(() => {
    fetch('/api/me/onboarding', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { email?: string; completed: string[]; onboardedAt: number | null; contractTier: string | null; tags?: string[]; uploads: Record<string, UploadFile[]>; callLink: string; variant?: OnboardingVariant }) => {
        if (d.onboardedAt) { router.replace('/production'); return; }
        if (d.email) setMeEmail(d.email);
        const v: OnboardingVariant = d.variant === 'creative' ? 'creative' : 'default';
        setVariant(v);
        const set = new Set(d.completed || []);
        setCompleted(set);
        setContractTier(d.contractTier ?? null);
        setTagsKey((d.tags ?? []).join(','));
        setUploads(d.uploads || {});
        setCallLink(d.callLink ?? null);
        const ids = stepsForVariant(v).map((s) => s.id);
        const b = onboardingBoundary(set, ids);
        setIdx(set.size === 0 ? 0 : Math.min(b + 1, ids.length));
        setLoaded(true);
      })
      .catch((s) => { if (s === 401) router.replace('/'); else setLoaded(true); });

    // Which native forms are already submitted, + account defaults to prefill.
    fetch('/api/me/forms').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d) setFormsDone({ primary: !!d.primary, secondary: !!d.secondary, creative: !!d.creative });
    }).catch(() => {});
    fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)).then((u) => { if (u) setAcct({ name: u.name || '', email: u.email || '' }); }).catch(() => {});
    loadPrimaryAnswers();
    // Whether the contract is already signed (gates the contract step).
    fetch('/api/me/contract', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.signed) setContractSigned(true); }).catch(() => {});
  }, [router]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live tag sync — while the client sits in the wizard, an admin may apply tags
  // (ICP / Low ICP, 4 / 6 month contract, Existing / Recent client) that change what this
  // client is shown: which contract tier they sign, which onboarding-call link
  // they get, or whether they skip the wizard entirely. Poll so those change
  // "then and there" without a manual refresh. Re-syncs on tab focus too.
  useEffect(() => {
    if (!loaded) return;
    let alive = true;
    const sync = async () => {
      try {
        const d = await fetch('/api/me/onboarding', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null));
        if (!alive || !d) return;
        // A skip-onboarding tag auto-completes onboarding server-side → leave.
        if (d.onboardedAt) { router.replace('/production'); return; }
        setContractTier(d.contractTier ?? null);
        setCallLink(d.callLink ?? null);
        // An admin can apply the Creative Specialist tag mid-wizard, which swaps
        // the whole step list — pick that up on the same poll.
        setVariant(d.variant === 'creative' ? 'creative' : 'default');
        // Changing the key re-mounts/re-fetches the tag-driven contract step.
        setTagsKey((d.tags ?? []).join(','));
      } catch { /* keep last good state — try again next tick */ }
    };
    const iv = setInterval(sync, 12000);
    const onVis = () => { if (document.visibilityState === 'visible') sync(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, [loaded, router]);

  // Per-member key so the first-visit tour fires for EVERY new member — even on a
  // browser that's already seen it for another account (e.g. admin testing). Falls
  // back to the legacy browser-wide key only until the email loads.
  const tourKey = meEmail ? `ob_tour_${meEmail.toLowerCase().trim()}` : null;

  // First-visit guided tour — welcome screen only, shown once per member.
  useEffect(() => {
    if (!loaded || idx !== 0 || !tourKey) return;
    try { if (localStorage.getItem(tourKey)) return; } catch { return; }
    const t = setTimeout(() => setTourOn(true), 550);
    return () => clearTimeout(t);
  }, [loaded, idx, tourKey]);

  const dismissTour = () => { setTourOn(false); try { if (tourKey) localStorage.setItem(tourKey, '1'); } catch { /* ignore */ } };

  // Restore persisted gate progress (link clicks + the single-video steps) once
  // we know the member, so a refresh doesn't lose a step's unlock.
  const linkKey = meEmail ? `ob_links_${meEmail.toLowerCase().trim()}` : null;
  const vidKey = meEmail ? `ob_vids_${meEmail.toLowerCase().trim()}` : null;
  useEffect(() => {
    if (!linkKey || !vidKey) return;
    try {
      const l = localStorage.getItem(linkKey); if (l) setLinkClicked(JSON.parse(l));
      const v = localStorage.getItem(vidKey); if (v) setVideoWatched(JSON.parse(v));
    } catch { /* ignore */ }
  }, [linkKey, vidKey]);

  const markLink = (stepId: string) => {
    setLinkClicked((prev) => {
      if (prev[stepId]) return prev;
      const next = { ...prev, [stepId]: true };
      if (linkKey) { try { localStorage.setItem(linkKey, JSON.stringify(next)); } catch { /* ignore */ } }
      return next;
    });
  };
  const markVideo = (stepId: string) => {
    setVideoWatched((prev) => {
      if (prev[stepId]) return prev;
      const next = { ...prev, [stepId]: true };
      if (vidKey) { try { localStorage.setItem(vidKey, JSON.stringify(next)); } catch { /* ignore */ } }
      return next;
    });
  };

  const boundary = onboardingBoundary(completed, steps.map((s) => s.id));
  const stepIndex = idx - 1;
  const step = stepIndex >= 0 ? steps[stepIndex] : null;
  const isWelcome = idx === 0;
  const isStepDone = step ? completed.has(step.id) : false;
  const isFrontier = stepIndex === boundary;
  const isLastStep = stepIndex === totalSteps - 1;
  // Upload steps need at least one file. (Counts any file stored under the step's
  // key, incl. legacy per-slot keys like "submit-docs:pmf".)
  const needsUpload = !!step?.requiresUpload && !Object.entries(uploads).some(
    ([k, v]) => (k === step!.id || k.startsWith(`${step!.id}:`)) && (v?.length ?? 0) > 0
  );
  const allFormsIn = variantForms.every((f) => formsDone[f]);
  const needsForms = step?.id === formStepId && !allFormsIn;

  // Unified per-step gate: is the Continue button allowed to show yet?
  const gateMet: boolean = (() => {
    if (!step) return true;
    const id = step.id;
    if (GATE_EXEMPT.has(id)) return true;
    if (id === formStepId) return !needsForms;
    if (id === 'select-contract') return contractSigned;
    if (step.requiresUpload) return !needsUpload;
    if (GATE_VIDEO.has(id)) return !!videoWatched[id];
    if (GATE_LINK.has(id)) return !!linkClicked[id];
    return true;
  })();

  // What the client still needs to do (shown in place of the CTA until met).
  const gateHint: string = (() => {
    if (!step || gateMet || isStepDone) return '';
    const id = step.id;
    if (GATE_VIDEO.has(id)) return ''; // no hint text on video steps (just play to unlock)
    if (GATE_LINK.has(id)) return 'Open the link above to unlock Continue.';
    if (id === formStepId) return variantForms.length > 1 ? 'Submit both forms to continue.' : 'Submit the form to continue.';
    if (id === 'select-contract') return 'Sign your contract to continue.';
    if (step.requiresUpload) return 'Upload both documents to continue.';
    return '';
  })();

  // On the forms step, jump straight into whichever form is still incomplete
  // (once per visit) — the Onboarding Form first, then the Buyer Mirror Form.
  // The summary screen only appears once every form for this variant is in.
  useEffect(() => {
    if (step?.id !== formStepId) { formsAutoRef.current = false; return; }
    const nextUp = variantForms.find((f) => !formsDone[f]);
    if (nextUp && !activeForm && !formsAutoRef.current) {
      formsAutoRef.current = true;
      setActiveForm(nextUp);
    }
  }, [step, formStepId, variantForms, formsDone, activeForm]);

  const move = (target: number) => { setIdx(target); setUploadErr(''); };
  const advance = () => move(Math.min(idx + 1, totalSteps));
  const back = () => move(Math.max(idx - 1, 0));

  const completeAndContinue = async () => {
    if (!step) return;
    if (isStepDone) { advance(); return; }
    const sid = step.id;
    const stepIdxOf = steps.findIndex((s) => s.id === sid);

    // Non-final steps: advance INSTANTLY and persist in the background (serialized
    // so the server's one-step-at-a-time rule never sees them out of order). This
    // removes the save round-trip from the user's path between steps.
    if (!isLastStep) {
      setCompleted((prev) => new Set(prev).add(sid));
      setCelebrate(true);
      setTimeout(() => setCelebrate(false), 1150);
      advance();
      saveChain.current = saveChain.current.then(async () => {
        try {
          const res = await fetch('/api/me/onboarding', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stepId: sid, completed: true }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setCompleted((prev) => { const n = new Set(prev); n.delete(sid); return n; });
            setUploadErr(data.error || 'Could not save — please try again.');
            setIdx(stepIdxOf + 1); // bounce back to the unsaved step
          }
        } catch {
          setCompleted((prev) => { const n = new Set(prev); n.delete(sid); return n; });
          setUploadErr('Could not save — check your connection and try again.');
          setIdx(stepIdxOf + 1);
        }
      });
      return;
    }

    // Final step: wait for any pending saves, then finish (need onboardedAt → outro).
    setSaving(true);
    try {
      await saveChain.current;
      const res = await fetch('/api/me/onboarding', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepId: sid, completed: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCompleted(new Set(data.completed || [...completed, sid]));
        if (data.onboardedAt) { setOutro('congrats'); return; }
        advance();
      } else {
        setUploadErr(data.error || 'Could not finish — please try again.');
      }
    } finally { setSaving(false); }
  };

  // Prefill a Calendly booking URL with what we already know about the client
  // (from their account + Onboarding Form) so the call form arrives pre-filled.
  const withCalendlyPrefill = (url: string): string => {
    try {
      const u = new URL(url);
      const name = (primaryAnswers.name || acct.name || '').trim();
      const email = (acct.email || primaryAnswers.email || '').trim();
      const phone = (primaryAnswers.phone || '').trim();
      if (name) u.searchParams.set('name', name);
      if (email) u.searchParams.set('email', email);
      // Ignored by Calendly unless the event collects a phone number / SMS reminder.
      if (phone) u.searchParams.set('phone_number', phone);
      return u.toString();
    } catch { return url; }
  };

  // Calendly embeds cleanly in-app; calendar "add event", Discord, Fanbasis, etc.
  // block iframing or are inherently new-tab actions — open those in a new tab.
  // Google Docs, Calendly and Calendar links open in a popup over the wizard;
  // anything else (Discord, PandaDoc, Fanbasis…) still hands off to a new tab.
  const openEmbed = (url: string, title: string) => {
    if (!url || url === '#') return;
    if (!isEmbeddable(url)) { window.open(url, '_blank', 'noopener,noreferrer'); return; }
    setEmbed({ url: /calendly\.com/i.test(url) ? withCalendlyPrefill(url) : url, title });
  };

  const selectContract = async (tier: string, url: string, label: string) => {
    setContractTier(tier);
    try {
      await fetch('/api/me/onboarding/contract', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tier }),
      });
    } catch { /* best-effort */ }
    openEmbed(url, label);
  };

  const onUploadFiles = async (files: FileList) => {
    if (!step) return;
    const stepId = step.id;
    const slot = pendingSlotRef.current; pendingSlotRef.current = '';
    const storeKey = slot ? `${stepId}:${slot}` : stepId;
    setUploading(true); setUploadErr('');
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file); fd.append('stepId', stepId);
        if (slot) fd.append('slot', slot);
        const res = await fetch('/api/me/onboarding/upload', { method: 'POST', body: fd });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.file) {
          setUploads((u) => ({ ...u, [storeKey]: [...(u[storeKey] || []), data.file as UploadFile] }));
        } else {
          setUploadErr(data.error || 'Upload failed');
        }
      }
    } catch { setUploadErr('Upload failed — try again.'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const removeUpload = async (stepId: string, id: string) => {
    setUploads((u) => ({ ...u, [stepId]: (u[stepId] || []).filter((f) => f.id !== id) }));
    try {
      await fetch('/api/me/onboarding/upload', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      });
    } catch { /* best-effort; UI already updated */ }
  };

  if (!loaded) {
    return <Shell><CenterLoader label="Loading your onboarding…" minHeight="100vh" /></Shell>;
  }

  // Post-onboarding outro: congrats → how-to-prepare → roadmap. The
  // how-to-prepare screen is about the CSM onboarding call, which a Creative
  // Specialist doesn't have — they go from congrats straight to their roadmap.
  if (outro) {
    return (
      <Shell>
        <OutroScreen
          stage={outro}
          variant={variant}
          onNext={() => (variant === 'creative' ? router.replace('/production') : setOutro('prepare'))}
          onFinish={() => router.replace('/production')}
        />
      </Shell>
    );
  }

  const blockContinue = saving || (!isFrontier && !isStepDone) || (!isStepDone && !gateMet);

  return (
    <Shell>
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(14px, 3vw, 40px)' }}>
        <div className="ob-card" style={{
          position: 'relative', width: '100%', maxWidth: 660, height: 'min(88vh, 740px)',
          display: 'flex', flexDirection: 'column',
          background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(201,164,85,0.14)',
          borderRadius: 20, overflow: 'hidden',
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.45)', padding: 'clamp(22px, 3.2vw, 40px)',
        }}>
          {/* Top bar: back + step label + a single continuous progress bar.
              No full step list — one step shows at a time. */}
          <div data-tour="progress" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <button onClick={back} disabled={isWelcome} style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none',
                cursor: isWelcome ? 'default' : 'pointer', visibility: isWelcome ? 'hidden' : 'visible', padding: 0,
                color: sub, fontFamily: "'DM Sans', sans-serif", fontSize: 13,
              }}><ArrowLeft size={15} /> Back</button>
            </div>
            <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round((Math.min(completed.size, totalSteps) / totalSteps) * 100)}%`, background: `linear-gradient(90deg, ${G}, #4ade80)`, borderRadius: 3, transition: 'width 0.55s cubic-bezier(0.22,1,0.36,1)' }} />
            </div>
          </div>

            <div key={idx} className="ob-pop ob-scroll" data-tour="content" style={{ overflowY: 'auto', flex: 1, minHeight: 0, paddingRight: 4 }}>
              {isWelcome ? (
                <WelcomeContent variant={variant} onStartTour={() => setTourOn(true)} />
              ) : step ? (
                <>
                  <StepContent
                    step={step.id === ONBOARDING_CALL_STEP_ID && callLink ? { ...step, links: [{ label: 'Book your onboarding call', url: callLink }] } : step}
                    stepNumber={stepIndex + 1} isStepDone={isStepDone} why={STEP_WHY[step.id] ?? CREATIVE_STEP_WHY[step.id]}
                    contractTier={contractTier} uploads={uploads} uploading={uploading} uploadErr={uploadErr}
                    onOpenLink={(url, title) => { if (GATE_LINK.has(step.id)) markLink(step.id); openEmbed(url, title); }}
                    onSelectContract={selectContract}
                    onPickFile={(slot) => { pendingSlotRef.current = slot || ''; fileRef.current?.click(); }}
                    onRemoveUpload={(key, id) => removeUpload(key, id)}
                    onInternal={(href) => { if (GATE_LINK.has(step.id)) markLink(step.id); router.push(href); }}
                    onVideoPlay={() => markVideo(step.id)}
                    onContractSigned={() => setContractSigned(true)}
                    onDocViewed={() => { if (GATE_LINK.has(step.id)) markLink(step.id); }}
                    contractRefreshKey={tagsKey}
                  />
                  {step.id === 'offer-foundation' && <OfferModulesEmbed storageKey={vidKey ? `${vidKey}_offer` : undefined} onAllWatched={() => markVideo('offer-foundation')} />}
                  {step.id === formStepId && (
                    allFormsIn ? (
                      // Every form for this variant is in — thank-you screen with
                      // re-edit options. "Continue" is the main CTA below; these
                      // buttons re-open a form.
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ textAlign: 'center', marginBottom: 6 }}>
                          <div style={{ display: 'inline-flex', width: 52, height: 52, borderRadius: '50%', alignItems: 'center', justifyContent: 'center', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.4)', color: '#4ade80', marginBottom: 12 }}>
                            <PartyPopper size={24} />
                          </div>
                          <h2 className="font-serif" style={{ fontSize: '1.5rem', color: cream, fontWeight: 300, margin: '0 0 8px' }}>
                            {variantForms.length > 1 ? 'Thank you — both forms are in!' : 'Thank you — your form is in!'}
                          </h2>
                        </div>
                        {variantForms.map((fid, i) => (
                          <button key={fid} onClick={() => setActiveForm(fid)} style={{
                            ...linkRow, marginBottom: 0, background: 'rgba(74,222,128,0.08)', borderColor: 'rgba(74,222,128,0.4)',
                          }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 600 }}>
                              {variantForms.length > 1 && <span style={{ fontSize: 11, color: faint, fontWeight: 700 }}>{i + 1}.</span>}
                              {ONBOARDING_FORMS[fid].title}
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#4ade80' }}>
                              <Check size={15} /> Completed — edit
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      // Before they're done, keep them in the form — no locked-list screen.
                      (() => {
                        const nextUp = variantForms.find((f) => !formsDone[f]) ?? variantForms[0];
                        const isLastForm = variantForms.indexOf(nextUp) === variantForms.length - 1;
                        return (
                          <button onClick={() => setActiveForm(nextUp)} style={{ ...linkRow, marginBottom: 0 }}>
                            <span style={{ fontSize: 14, fontWeight: 600 }}>
                              {variantForms.length > 1 && isLastForm ? `Continue: ${ONBOARDING_FORMS[nextUp].title}` : `Open the ${ONBOARDING_FORMS[nextUp].title}`}
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: G }}>
                              {variantForms.length > 1 && isLastForm ? <>Last one <ChevronRight size={15} /></> : <>Start <ChevronRight size={15} /></>}
                            </span>
                          </button>
                        );
                      })()
                    )
                  )}
                </>
              ) : null}
            </div>

            {/* primary action + encouraging pacer */}
            <div data-tour="cta" style={{ paddingTop: 20 }}>
              <p style={{ fontSize: 12.5, color: sub, textAlign: 'center', margin: '0 0 12px', lineHeight: 1.5 }}>
                {pacer(isWelcome, step?.id ?? '', isLastStep, isStepDone, variant)}
              </p>
              {isWelcome ? (
                <button onClick={() => move(1)} style={ctaBtn}>Let&apos;s begin <ArrowRight size={17} /></button>
              ) : (gateMet || isStepDone) ? (
                <button onClick={completeAndContinue} disabled={blockContinue}
                  style={{ ...ctaBtn, opacity: blockContinue ? 0.5 : 1, cursor: blockContinue ? 'default' : 'pointer' }}>
                  {isStepDone
                    ? (isLastStep ? <>Finish <ArrowRight size={17} /></> : <>Continue <ArrowRight size={17} /></>)
                    : saving ? 'Saving…'
                      : (isLastStep ? <>Complete &amp; finish <ArrowRight size={17} /></> : <>Mark complete &amp; continue <ArrowRight size={17} /></>)}
                </button>
              ) : gateHint ? (
                // Gated: Continue is hidden until the step's requirement is met.
                <div style={{ textAlign: 'center', fontSize: 13, color: faint, padding: '13px 16px', borderRadius: 12, border: '1px dashed rgba(201,164,85,0.3)', background: 'rgba(201,164,85,0.04)' }}>
                  {gateHint}
                </div>
              ) : null}
            </div>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="application/pdf,.pdf" multiple onChange={(e) => { const fs = e.target.files; if (fs && fs.length) onUploadFiles(fs); }} style={{ display: 'none' }} />
      {embed && <EmbedModal url={embed.url} title={embed.title} onClose={() => setEmbed(null)} />}

      {activeForm && (
        <OnboardingForm
          key={activeForm}
          form={ONBOARDING_FORMS[activeForm]}
          defaults={formDefaults}
          intro={formsDone[activeForm] ? undefined : FORM_INTROS[activeForm]}
          onClose={() => setActiveForm(null)}
          onSubmitted={() => {
            const just = activeForm;
            setFormsDone((p) => ({ ...p, [just]: true }));
            // Refresh cached answers so the next form / the calendar prefill stay in sync.
            if (just === 'primary') loadPrimaryAnswers();
            // Chain straight into the next form this variant still needs (the
            // Buyer Mirror Form for standard clients; nothing for a Creative
            // Specialist, whose single form finishes the step).
            const nextUp = variantForms.find((f) => f !== just && !formsDone[f]);
            setActiveForm(nextUp ?? null);
          }}
        />
      )}

      {/* Celebratory burst on completing a step */}
      {celebrate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 320, pointerEvents: 'none' }}>
          <div className="ob-ring" style={{ position: 'absolute', top: '46%', left: '50%', width: 90, height: 90, marginLeft: -45, marginTop: -45, borderRadius: '50%', border: '2px solid rgba(201,164,85,0.6)' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
            <div className="ob-toast" style={{ marginTop: '11vh', display: 'inline-flex', alignItems: 'center', gap: 9, padding: '12px 20px', borderRadius: 999, background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.45)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', color: '#86efac', fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, boxShadow: '0 12px 40px rgba(74,222,128,0.22)' }}>
              <PartyPopper size={17} /> Nice — step complete!
            </div>
          </div>
        </div>
      )}

      <OnboardingAssistant hidden={!!activeForm || !!embed} />
      <OnboardingTour steps={TOUR_STEPS} open={tourOn} onClose={dismissTour} />

      <style>{`
        .ob-pop { animation: obPop 0.46s cubic-bezier(0.22, 1.4, 0.36, 1); }
        @keyframes obPop {
          0% { opacity: 0; transform: translateY(18px) scale(0.975); }
          55% { opacity: 1; transform: translateY(-3px) scale(1.006); }
          100% { opacity: 1; transform: none; }
        }
        .ob-glow { animation: obGlow 3s ease-in-out infinite; }
        @keyframes obGlow { 0%, 100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.14); } }
        .ob-ring { animation: obRing 0.8s ease-out forwards; }
        @keyframes obRing { 0% { opacity: 0.85; transform: scale(0.3); } 100% { opacity: 0; transform: scale(3.8); } }
        .ob-toast { animation: obToast 1.15s ease forwards; }
        @keyframes obToast { 0% { opacity: 0; transform: translateY(-14px) scale(0.96); } 15% { opacity: 1; transform: none; } 78% { opacity: 1; } 100% { opacity: 0; transform: translateY(-8px); } }
        .ob-scroll::-webkit-scrollbar { width: 5px; }
        .ob-scroll::-webkit-scrollbar-thumb { background: rgba(201,164,85,0.25); border-radius: 4px; }
        @media (max-width: 720px) { .ob-card { height: min(94vh, 760px) !important; } }
      `}</style>
    </Shell>
  );
}

/* ── content blocks ────────────────────────────────────────────────────────── */
function WelcomeContent({ variant, onStartTour }: { variant: OnboardingVariant; onStartTour: () => void }) {
  const [videoStarted, setVideoStarted] = useState(false);
  const creative = variant === 'creative';
  const copy = creative ? CREATIVE_ONBOARDING_WELCOME : ONBOARDING_WELCOME;
  // The walkthrough video and the master onboarding doc belong to the standard
  // client journey — a Creative Specialist has neither.
  const embedUrl = creative ? null : loomEmbedUrl(ONBOARDING_WELCOME.video);
  return (
    <div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.6)', fontWeight: 600, marginBottom: 12 }}>
        <PartyPopper size={14} /> Welcome aboard
      </div>
      <h1 className="font-serif" style={{ fontSize: 'clamp(1.9rem, 4vw, 2.6rem)', color: cream, fontWeight: 300, margin: '0 0 12px', lineHeight: 1.08 }}>{copy.title}</h1>
      <p style={{ fontSize: 15, color: sub, lineHeight: 1.65, margin: '0 0 22px' }}>{copy.body}</p>
      {embedUrl && (
        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, borderRadius: 14, overflow: 'hidden', background: '#000', border: '1px solid rgba(201,164,85,0.2)', marginBottom: 18 }}>
          {videoStarted ? (
            <iframe src={`${embedUrl}${embedUrl.includes('?') ? '&' : '?'}autoplay=1`} allowFullScreen allow="autoplay; fullscreen" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
          ) : (
            <button
              onClick={() => setVideoStarted(true)}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, cursor: 'pointer', background: 'radial-gradient(ellipse at center, rgba(201,164,85,0.12), rgba(0,0,0,0.85))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: '50%', background: 'rgba(201,164,85,0.18)', border: '1.5px solid rgba(201,164,85,0.6)' }}>
                <Play size={26} fill={G} strokeWidth={0} style={{ color: G, marginLeft: 3 }} />
              </span>
              <span style={{ color: cream, fontSize: 13.5, fontWeight: 600 }}>Watch the video</span>
            </button>
          )}
        </div>
      )}
      <button onClick={onStartTour} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', color: G, fontFamily: "'DM Sans', sans-serif", fontSize: 13, padding: 0 }}>
        <Sparkles size={14} /> Take a quick tour
      </button>
    </div>
  );
}

// In-app document viewer — renders markdown content in a dashboard-style modal
// (used for the onboarding doc + offer/PMF/referral docs so clients never leave
// the app for Google Docs). For fillable templates, pass `templateUrl` to add a
// "Make your copy to fill out" action.
function DocModal({ title, body, templateUrl, onClose }: { title: string; body: string; templateUrl?: string; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 420, background: 'rgba(6,5,4,0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(12px, 3vw, 40px)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 760, height: 'min(86vh, 760px)', display: 'flex', flexDirection: 'column', background: 'rgba(20,16,9,0.97)', border: '1px solid rgba(201,164,85,0.18)', borderRadius: 18, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '0 30px 80px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid rgba(201,164,85,0.14)', flexShrink: 0 }}>
          <button onClick={onClose} aria-label="Back" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: sub, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: 13, padding: 0, flexShrink: 0 }}>
            <ArrowLeft size={16} /> Back
          </button>
          <span className="font-serif" style={{ color: cream, fontSize: '1.1rem', flex: 1, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
          <button onClick={onClose} aria-label="Close" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 9, background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.25)', color: G, cursor: 'pointer', flexShrink: 0 }}><X size={17} /></button>
        </div>
        <div className="ob-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 28px' }}>
          <Markdown content={body} />
        </div>
        {templateUrl && (
          <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(201,164,85,0.14)', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
            <a href={templateUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.45)', color: G, fontWeight: 600, fontSize: 13.5, padding: '11px 18px', borderRadius: 10, textDecoration: 'none' }}>
              <ExternalLink size={15} /> Make your copy to fill out
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// Encouraging line above the CTA — always framed toward the CSM onboarding call.
// No step counts: just motivation that warms up as they get closer to the finish.
// A distinct encouraging line per step, so the bottom of the wizard feels
// dynamic rather than repeating the same copy across steps.
const STEP_PACER: Record<string, string> = {
  'select-contract': 'Locking in your package so we kick off the right work, right away.',
  'meet-team': "First things first — meet the team that's in your corner.",
  'join-discord': "The Discord is where it all happens — get plugged in and say hello.",
  'calendar-calls': "Get the calls on your calendar — they're where momentum is built.",
  'complete-forms': 'These answers let us tailor the whole program to you.',
  'offer-foundation': 'Sharpen the offer now and everything downstream gets easier.',
  'submit-docs': "Get these reviewed and you're building on solid ground.",
  [CREATIVE_ONBOARDING_FORM_STEP]: 'One form — it maps your workflow so nothing we give you is generic.',
};

// The standard journey's pacer is framed toward the CSM onboarding call. A
// Creative Specialist has no such call — their finish line is the form itself.
function pacer(isWelcome: boolean, stepId: string, isLastStep: boolean, isStepDone: boolean, variant: OnboardingVariant): string {
  if (variant === 'creative') {
    if (isWelcome) return 'One form and you’re done — then straight into your Creative Specialist roadmap.';
    if (isStepDone) return 'All done — finish to open your roadmap.';
    return STEP_PACER[stepId] ?? 'One form — it maps your workflow so nothing we give you is generic.';
  }
  if (isWelcome) return 'A few quick steps to get you fully set up — your CSM onboarding call is the finish line.';
  if (isLastStep) return isStepDone ? 'All done — finish to jump into your portal.' : "Final step — book your CSM onboarding call and you're officially in!";
  if (isStepDone) return 'Nice work — continue when you’re ready.';
  return STEP_PACER[stepId] ?? "You're on your way — every step brings your CSM onboarding call closer.";
}

// Glowing VTC logo on the Join-Discord step. Transparent PNG, so it
// drops straight onto the card; the radial glow + drop-shadow give it the lit look.
function GlowLogo() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0 4px', marginTop: -6 }}>
      <div style={{ position: 'relative', width: 150, height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="ob-glow" style={{ position: 'absolute', inset: '4%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(201,164,85,0.16) 0%, transparent 62%)' }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/onboarding/goh-logo.png"
          alt="VTC"
          style={{ position: 'relative', width: 142, height: 142, objectFit: 'contain', filter: 'drop-shadow(0 0 9px rgba(201,164,85,0.18))' }}
        />
      </div>
    </div>
  );
}

// Shown after the final step (booking the onboarding call): a congrats beat,
// then a "how to prepare" checklist, then on to the roadmap.
const PREP_ITEMS = [
  { heading: 'Complete all steps', body: "Make sure you've completed every step prior — submitted all forms, plus both your Offer Sheet and Product Market Fit." },
  { heading: 'Be in a quiet place', body: 'Take this call somewhere you can turn your camera on and have a proper conversation.' },
  { heading: 'Dedicate one hour of your day solely for this call', body: 'This is where you lay the foundation for progressing into the program — give it your full focus.' },
];

function OutroScreen({ stage, variant, onNext, onFinish }: {
  stage: 'congrats' | 'prepare'; variant: OnboardingVariant; onNext: () => void; onFinish: () => void;
}) {
  const creative = variant === 'creative';
  const card: React.CSSProperties = {
    position: 'relative', width: '100%', maxWidth: 640,
    background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(201,164,85,0.14)', borderRadius: 20,
    backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
    padding: 'clamp(26px, 4vw, 44px)',
  };
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(14px, 3vw, 40px)' }}>
      <div key={stage} className="ob-pop" style={card}>
        {stage === 'congrats' ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', width: 64, height: 64, borderRadius: '50%', alignItems: 'center', justifyContent: 'center', background: 'rgba(201,164,85,0.12)', border: '1px solid rgba(201,164,85,0.4)', color: G, marginBottom: 20, boxShadow: '0 0 34px rgba(201,164,85,0.3)' }}>
              <PartyPopper size={28} />
            </div>
            <h1 className="font-serif" style={{ fontSize: 'clamp(2rem, 5vw, 2.8rem)', color: cream, fontWeight: 300, margin: '0 0 12px', lineHeight: 1.08 }}>Congratulations!</h1>
            <p style={{ fontSize: 15, color: sub, lineHeight: 1.65, margin: '0 auto 28px', maxWidth: 440 }}>
              {creative
                ? "Your onboarding form is in. That's your onboarding done — your Creative Specialist roadmap is open and waiting."
                : "You've completed your onboarding and booked your call with your Client Success Manager. You're officially set up — here's how to make the most of it."}
            </p>
            <button onClick={onNext} style={{ ...ctaBtn, width: 'auto', margin: '0 auto', padding: '15px 28px' }}>
              {creative ? <>Go to my roadmap <ArrowRight size={17} /></> : <>How to prepare <ArrowRight size={17} /></>}
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.6)', fontWeight: 600, marginBottom: 12 }}>
              <Sparkles size={14} /> Before your call
            </div>
            <h1 className="font-serif" style={{ fontSize: 'clamp(1.6rem, 3.4vw, 2.2rem)', color: cream, fontWeight: 300, margin: '0 0 22px', lineHeight: 1.12 }}>How To Prepare For Your Onboarding Call</h1>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
              {PREP_ITEMS.map((p) => (
                <div key={p.heading} style={{ display: 'flex', gap: 13, alignItems: 'flex-start', padding: '15px 16px', borderRadius: 14, background: 'rgba(201,164,85,0.06)', border: '1px solid rgba(201,164,85,0.16)' }}>
                  <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(201,164,85,0.14)', border: '1px solid rgba(201,164,85,0.35)', color: G, marginTop: 1 }}>
                    <Check size={14} />
                  </span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: cream, marginBottom: 4, lineHeight: 1.3 }}>{p.heading}</div>
                    <div style={{ fontSize: 13.5, color: sub, lineHeight: 1.6 }}>{p.body}</div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={onFinish} style={ctaBtn}>Go to my roadmap <ArrowRight size={17} /></button>
          </div>
        )}
      </div>
    </div>
  );
}

function StepContent({
  step, stepNumber, isStepDone, why, contractTier, uploads, uploading, uploadErr,
  onOpenLink, onSelectContract, onPickFile, onRemoveUpload, onInternal, onVideoPlay, onContractSigned, onDocViewed, contractRefreshKey,
}: {
  step: typeof ONBOARDING_STEPS[number]; stepNumber: number; isStepDone: boolean; why?: string;
  contractTier: string | null; uploads: Record<string, UploadFile[]>; uploading: boolean; uploadErr: string;
  onOpenLink: (url: string, title: string) => void;
  onSelectContract: (tier: string, url: string, label: string) => void;
  onPickFile: (slot?: string) => void; onRemoveUpload: (key: string, id: string) => void; onInternal: (href: string) => void;
  onVideoPlay?: () => void; onContractSigned?: () => void; onDocViewed?: () => void; contractRefreshKey?: string;
}) {
  // Click-to-play so we can record that the intro video was opened (gate signal).
  const [videoStarted, setVideoStarted] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const [zoomImg, setZoomImg] = useState<string | null>(null); // click-to-zoom lightbox
  const staticDoc = docForStep(step.id); // static fallback (slug + default content)
  // Pull the LIVE resource from the DB so this matches the /modules page and the
  // /select AI bot exactly (all three read the same admin-editable resource).
  // Falls back to the static default while loading / if the fetch fails.
  const [liveDoc, setLiveDoc] = useState<{ title: string; body: string; templateUrl?: string } | null>(null);
  useEffect(() => {
    const slug = staticDoc?.slug;
    if (!slug) { setLiveDoc(null); return; }
    let alive = true;
    fetch(`/api/resources/${slug}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.resource) setLiveDoc({ title: d.resource.title, body: d.resource.body, templateUrl: d.resource.template_url ?? undefined }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [staticDoc?.slug]);
  const stepDoc = staticDoc ? { ...staticDoc, ...(liveDoc ?? {}) } : null;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.55)', fontWeight: 600 }}>Step {stepNumber}</span>
        {isStepDone && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#4ade80' }}><Check size={13} /> Completed</span>}
      </div>
      <h1 className="font-serif" style={{ fontSize: 'clamp(1.6rem, 3.4vw, 2.3rem)', color: cream, fontWeight: 300, margin: '0 0 14px', lineHeight: 1.1 }}>{step.title}</h1>
      {why && !step.requiresUpload && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '0 0 18px', padding: '11px 14px', borderRadius: 12, background: 'rgba(201,164,85,0.07)', border: '1px solid rgba(201,164,85,0.2)' }}>
          <Sparkles size={15} style={{ color: G, flexShrink: 0, marginTop: 2 }} />
          <span style={{ fontSize: 13, color: '#d9cfba', lineHeight: 1.55 }}>
            <span style={{ color: G, fontWeight: 600 }}>Why this matters: </span>{why}
          </span>
        </div>
      )}
      {step.images?.map((src) => (
        <button
          key={src}
          onClick={() => setZoomImg(src)}
          title="Click to enlarge"
          style={{ display: 'block', width: '100%', marginBottom: 8, padding: 0, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(201,164,85,0.22)', background: 'rgba(0,0,0,0.25)', cursor: 'zoom-in' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Example" style={{ display: 'block', width: '100%', height: 'auto' }} />
        </button>
      ))}
      {step.images && step.images.length > 0 && (
        <div style={{ fontSize: 11.5, color: faint, marginBottom: 20, textAlign: 'center' }}>Click the image to enlarge</div>
      )}
      {zoomImg && (
        <div onClick={() => setZoomImg(null)} style={{ position: 'fixed', inset: 0, zIndex: 460, background: 'rgba(5,4,3,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(12px, 3vw, 48px)', cursor: 'zoom-out' }}>
          <button onClick={() => setZoomImg(null)} aria-label="Close" style={{ position: 'absolute', top: 18, right: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 10, background: 'rgba(201,164,85,0.12)', border: '1px solid rgba(201,164,85,0.3)', color: G, cursor: 'pointer' }}><X size={20} /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoomImg} alt="Example enlarged" style={{ maxWidth: '95vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: 10, boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }} />
        </div>
      )}

      {step.video && (
        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, borderRadius: 14, overflow: 'hidden', background: '#000', border: '1px solid rgba(201,164,85,0.2)', marginBottom: 18 }}>
          {videoStarted ? (
            <iframe src={`${loomEmbedUrl(step.video) ?? ''}${(loomEmbedUrl(step.video) ?? '').includes('?') ? '&' : '?'}autoplay=1`} allowFullScreen allow="autoplay; fullscreen" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
          ) : (
            <button
              onClick={() => { setVideoStarted(true); onVideoPlay?.(); }}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, cursor: 'pointer', background: 'radial-gradient(ellipse at center, rgba(201,164,85,0.12), rgba(0,0,0,0.85))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: '50%', background: 'rgba(201,164,85,0.18)', border: '1.5px solid rgba(201,164,85,0.6)' }}>
                <Play size={26} fill={G} strokeWidth={0} style={{ color: G, marginLeft: 3 }} />
              </span>
              <span style={{ color: cream, fontSize: 13.5, fontWeight: 600 }}>Watch the video</span>
            </button>
          )}
        </div>
      )}

      {step.id === 'join-discord' && <GlowLogo />}

      {/* Offer / PMF / Referral docs open as native in-app pages (not Google embeds). */}
      {stepDoc && (
        <button onClick={() => { setDocOpen(true); onDocViewed?.(); }} style={linkRow}>
          <span style={{ fontSize: 14 }}>{stepDoc.templateUrl ? 'Open the document' : 'Read the document'}</span>
          <ChevronRight size={16} style={{ color: G, flexShrink: 0 }} />
        </button>
      )}
      {docOpen && stepDoc && <DocModal title={stepDoc.title} body={stepDoc.body} templateUrl={stepDoc.templateUrl} onClose={() => setDocOpen(false)} />}

      {!stepDoc && step.links?.map((l) => {
        const disabled = !l.url || l.url === '#';
        const isDiscord = step.id === 'join-discord';
        return (
          <button key={l.label} onClick={() => onOpenLink(l.url, l.label)} disabled={disabled} style={{
            ...linkRow,
            ...(isDiscord ? { background: 'transparent', border: '1px solid rgba(201,164,85,0.45)', padding: '13px 40px', justifyContent: 'center', width: 'fit-content', margin: '0 auto 10px' } : {}),
            opacity: disabled ? 0.55 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
          }}>
            <span style={{ fontSize: 14 }}>{disabled ? `${l.label} (link coming soon)` : l.label}</span>
            {!isDiscord && <ChevronRight size={16} style={{ color: G, flexShrink: 0 }} />}
          </button>
        );
      })}

      {step.contracts && <ContractSigning onSigned={onContractSigned} refreshKey={contractRefreshKey} />}

      {step.internalHref && (
        <button onClick={() => onInternal(step.internalHref!)} style={linkRow}>
          <span style={{ fontSize: 14 }}>{step.note || 'Open in your dashboard'}</span><ChevronRight size={16} style={{ color: G, flexShrink: 0 }} />
        </button>
      )}

      {step.requiresUpload && (() => {
        // Single upload area — list every file stored under this step (incl. any
        // legacy per-slot keys) and one button to add more.
        const files = Object.entries(uploads)
          .filter(([k]) => k === step.id || k.startsWith(`${step.id}:`))
          .flatMap(([k, list]) => (list || []).map((f) => ({ key: k, file: f })));
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginTop: 22 }}>
            {files.length > 0 && (
              <div style={{ width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {files.map(({ key, file: f }) => (
                  <div key={f.id || f.url} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.35)' }}>
                    <FileText size={15} style={{ color: '#4ade80', flexShrink: 0 }} />
                    <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, minWidth: 0, color: cream, fontSize: 13.5, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</a>
                    <button onClick={() => onRemoveUpload(key, f.id)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: faint, flexShrink: 0, display: 'flex' }}><X size={16} /></button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => onPickFile()}
              disabled={uploading}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                padding: '8px 18px', background: 'transparent',
                border: '1px dashed rgba(201,164,85,0.45)', borderRadius: 10,
                color: G, fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, fontWeight: 600,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                cursor: uploading ? 'default' : 'pointer', transition: 'all 0.18s ease',
              }}
              onMouseEnter={(e) => { if (!uploading) { e.currentTarget.style.background = 'rgba(201,164,85,0.06)'; e.currentTarget.style.borderColor = 'rgba(201,164,85,0.7)'; } }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(201,164,85,0.45)'; }}
            >
              <Upload size={13} /> {uploading ? 'Uploading…' : 'Upload'}
            </button>
            {uploadErr && <p style={{ fontSize: 12.5, color: '#ef4444', margin: 0, textAlign: 'center' }}>{uploadErr}</p>}
          </div>
        );
      })()}

      {step.note && !step.internalHref && <p style={{ fontSize: 12.5, color: faint, marginTop: 16 }}>{step.note}</p>}
    </div>
  );
}

function EmbedModal({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(12px, 3vw, 32px)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 1000, height: '88vh', display: 'flex', flexDirection: 'column', background: '#0a0806', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(201,164,85,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderBottom: '1px solid rgba(201,164,85,0.14)' }}>
          <span className="font-serif" style={{ color: cream, fontSize: '1.05rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
            <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: G, textDecoration: 'none' }}>Open in new tab <ExternalLink size={13} /></a>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: sub }}><X size={20} /></button>
          </div>
        </div>
        <iframe src={toEmbedUrl(url)} allow="fullscreen; payment; clipboard-write" style={{ flex: 1, width: '100%', border: 0, background: '#fff' }} />
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#050403', color: cream, fontFamily: "'DM Sans', sans-serif", position: 'relative' }}>
      <MeshBg speed={0.16} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none', background: 'radial-gradient(ellipse 75% 75% at 50% 40%, rgba(5,4,3,0.5) 0%, rgba(5,4,3,0.88) 100%)' }} />
      <div style={{ position: 'relative', zIndex: 2 }}>{children}</div>
    </div>
  );
}

// Consistent pill button used across onboarding link/action rows — matches the
// module-item style in the rest of the UI (label left, icon right, gold border).
const linkRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  width: '100%', maxWidth: '100%', margin: '0 0 10px',
  padding: '13px 16px', borderRadius: 12, textAlign: 'left',
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,164,85,0.25)', color: cream,
  cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600,
};
// Primary CTA — matches the gold-bordered pill used across the app (image ref).
const ctaBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%',
  padding: '15px 22px', background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.45)', borderRadius: 12,
  color: G, fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, letterSpacing: '0.02em', cursor: 'pointer',
};
