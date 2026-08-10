'use client';

// Renderers for the Creative Specialist weekly report. Everything is driven off
// the section definitions in lib/creative-weekly-report.ts, so the member form
// (/weekly-report) and the admin review (CSM view) render the exact same report —
// the admin side just passes `readOnly`.

import { useState } from 'react';
import { Plus, Trash2, Check, X, TrendingUp } from 'lucide-react';
import {
  rows as groupRows, missedReason, implementation, MISSED_REASONS_KEY, IMPLEMENTATIONS_KEY,
  type Derived, type ReportAnswers, type ReportField, type ReportGroup,
  type ReportRepeat, type ReportRow, type ReportSection, type WeekActionItem,
} from '@/lib/creative-weekly-report';

const G = '#c9a455';
const cream = '#f0e8d4';
const sub = '#a89e8a';
const faint = '#857a67';

export const BAND_COLOR: Record<string, string> = {
  green: '#4ade80',
  amber: '#f59e0b',
  red: '#ef4444',
  none: 'rgba(255,255,255,0.18)',
};

const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px',
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,164,85,0.18)',
  borderRadius: 9, color: cream, fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, outline: 'none',
};

export const cardStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(201,164,85,0.16)',
  borderRadius: 16, padding: '20px 22px',
};

/* ─── One field ───────────────────────────────────────────────────────────── */

function FieldInput({ field, value, onChange, readOnly }: {
  field: ReportField;
  value: unknown;
  onChange: (v: unknown) => void;
  readOnly?: boolean;
}) {
  const str = value === null || value === undefined ? '' : String(value);

  if (field.type === 'textarea') {
    return (
      <textarea
        value={str}
        readOnly={readOnly}
        rows={3}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...input, resize: 'vertical', minHeight: 74, lineHeight: 1.6 }}
      />
    );
  }

  const numeric = field.type === 'number' || field.type === 'money' || field.type === 'percent';
  return (
    <div style={{ position: 'relative' }}>
      {field.type === 'money' && (
        <span style={{ position: 'absolute', left: 12, top: 9, fontSize: 13.5, color: faint }}>$</span>
      )}
      <input
        type={numeric ? 'number' : 'text'}
        inputMode={numeric ? 'numeric' : undefined}
        value={str}
        readOnly={readOnly}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...input,
          ...(field.type === 'money' ? { paddingLeft: 24 } : {}),
          ...(field.type === 'percent' ? { paddingRight: 28 } : {}),
        }}
      />
      {field.type === 'percent' && (
        <span style={{ position: 'absolute', right: 12, top: 9, fontSize: 13.5, color: faint }}>%</span>
      )}
    </div>
  );
}

/* ─── A repeating row group ───────────────────────────────────────────────── */

function RepeatGroup({ repeat, value, onChange, readOnly }: {
  repeat: ReportRepeat;
  value: ReportRow[];
  onChange: (rows: ReportRow[]) => void;
  readOnly?: boolean;
}) {
  // Always render at least `rows` rows so the shape of the section is obvious
  // before anything is typed into it.
  const padded: ReportRow[] = [...value];
  while (padded.length < repeat.rows) padded.push({});

  const setCell = (i: number, col: string, v: unknown) => {
    onChange(padded.map((r, idx) => (idx === i ? { ...r, [col]: v } : { ...r })));
  };
  const removeRow = (i: number) => onChange(padded.filter((_, idx) => idx !== i));
  const addRow = () => onChange([...padded, {}]);

  const header = (
    <>
      <div style={{ fontSize: 12, fontWeight: 600, color: cream, marginBottom: repeat.help ? 3 : 9 }}>{repeat.label}</div>
      {repeat.help && <div style={{ fontSize: 11.5, color: faint, marginBottom: 9, lineHeight: 1.5 }}>{repeat.help}</div>}
    </>
  );

  // Numbered single-column list (the reel / video pipelines): the row index IS
  // the label, so the list numbers itself 1, 2, 3 … as they type.
  if (repeat.numbered) {
    const col = repeat.columns[0];
    return (
      <div style={{ marginBottom: 16 }}>
        {header}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {padded.map((row, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{
                flexShrink: 0, width: 22, textAlign: 'right',
                fontFamily: 'ui-monospace, monospace', fontSize: 12,
                color: String(row[col.id] ?? '').trim() ? G : faint,
              }}>{i + 1}.</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <FieldInput
                  field={{ ...col, placeholder: col.placeholder ?? `${col.label} ${i + 1}` }}
                  value={row[col.id]}
                  onChange={(v) => setCell(i, col.id, v)}
                  readOnly={readOnly}
                />
              </div>
              {!readOnly && padded.length > repeat.rows && (
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  aria-label={`Remove ${col.label} ${i + 1}`}
                  style={{
                    flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 28, height: 28, borderRadius: 8, cursor: 'pointer',
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: faint,
                  }}
                ><X size={13} /></button>
              )}
            </div>
          ))}
        </div>
        {!readOnly && padded.length < repeat.maxRows && (
          <button type="button" onClick={addRow} style={addBtn}><Plus size={13} /> {repeat.addLabel}</button>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {header}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {padded.map((row, i) => (
          <div key={i} style={{
            display: 'grid', gap: 10, alignItems: 'end',
            gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 165px), 1fr))`,
            padding: '10px 12px', borderRadius: 11,
            background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(201,164,85,0.1)',
          }}>
            {repeat.columns.map((c) => (
              <div key={c.id} style={{ minWidth: 0, gridColumn: c.type === 'textarea' ? '1 / -1' : undefined }}>
                <label style={{ display: 'block', fontSize: 10.5, color: faint, marginBottom: 4, letterSpacing: '0.03em' }}>
                  {c.label}
                </label>
                <FieldInput field={c} value={row[c.id]} onChange={(v) => setCell(i, c.id, v)} readOnly={readOnly} />
              </div>
            ))}
            {!readOnly && padded.length > repeat.rows && (
              <button
                type="button"
                onClick={() => removeRow(i)}
                style={{
                  justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'none', border: 'none', cursor: 'pointer', color: faint, padding: '6px 0', fontSize: 12,
                }}
              ><Trash2 size={13} /> Remove</button>
            )}
          </div>
        ))}
      </div>
      {!readOnly && padded.length < repeat.maxRows && (
        <button type="button" onClick={addRow} style={addBtn}><Plus size={13} /> {repeat.addLabel}</button>
      )}
    </div>
  );
}

const addBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 9,
  background: 'rgba(201,164,85,0.08)', border: '1px solid rgba(201,164,85,0.25)',
  borderRadius: 9, padding: '7px 13px', color: G, cursor: 'pointer',
  fontFamily: "'DM Sans', sans-serif", fontSize: 12,
};

/* ─── Auto-calculated read-outs ───────────────────────────────────────────── */

function AutoRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11.5, color: faint }}>{label}</span>
      <span style={{ fontSize: 13.5, color: cream, fontWeight: 600 }}>{value}</span>
      {hint && <span style={{ fontSize: 11.5, color: sub }}>{hint}</span>}
    </div>
  );
}

function AutoBlock({ items }: { items: React.ReactNode[] }) {
  if (!items.length) return null;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 7,
      padding: '11px 13px', marginBottom: 16, borderRadius: 11,
      background: 'rgba(201,164,85,0.05)', border: '1px solid rgba(201,164,85,0.14)',
    }}>
      <div style={{ fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.6)', fontWeight: 700 }}>
        Auto-calculated
      </div>
      {items}
    </div>
  );
}

const pctOrDash = (v: number | null) => (v === null ? '—' : `${v}%`);

function groupAuto(groupId: string, d: Derived): React.ReactNode[] {
  if (groupId === 'instagram') {
    return [
      <AutoRow
        key="vpd"
        label="Views / day"
        value={d.igViewsPerDay === null ? '—' : d.igViewsPerDay.toLocaleString()}
        hint="last 7 days ÷ 7"
      />,
      ...(d.reelsInPipeline ? [<AutoRow key="p" label="Reels queued" value={String(d.reelsInPipeline)} />] : []),
    ];
  }
  if (groupId === 'youtube') {
    return d.videosInPipeline ? [<AutoRow key="p" label="Videos queued" value={String(d.videosInPipeline)} />] : [];
  }
  return [];
}

/* ─── Wednesday: this week's to-dos, with an implementation each ──────────── */

// A to-do plus a text box, used by both to-do sections. Wednesday asks how it
// will get done; Friday asks why an unticked one slipped.
function TodoRow({ item, value, placeholder, onChange, readOnly, needed }: {
  item: WeekActionItem;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  needed?: boolean;   // outline it until answered
}) {
  const filled = value.trim() !== '';
  return (
    <div style={{
      display: 'grid', gap: 10, alignItems: 'center',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)',
      padding: '10px 12px', borderRadius: 11,
      background: 'rgba(255,255,255,0.015)',
      border: `1px solid ${filled || readOnly || !needed ? 'rgba(201,164,85,0.1)' : 'rgba(245,158,11,0.35)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, minWidth: 0 }}>
        {item.done ? (
          <span style={{
            flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 18, height: 18, borderRadius: 5, marginTop: 1,
            background: 'rgba(74,222,128,0.14)', border: '1px solid rgba(74,222,128,0.45)', color: '#4ade80',
          }}><Check size={11} /></span>
        ) : (
          <span style={{
            flexShrink: 0, width: 18, height: 18, borderRadius: 5, marginTop: 1,
            border: '1px solid rgba(255,255,255,0.16)',
          }} />
        )}
        <span style={{ fontSize: 13, color: '#d9cfba', lineHeight: 1.45 }}>{item.text}</span>
      </div>
      <input
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={input}
      />
    </div>
  );
}

function PlanSection({ answers, actionItems, onChange, readOnly }: {
  answers: ReportAnswers;
  actionItems: WeekActionItem[];
  onChange: (key: string, value: unknown) => void;
  readOnly?: boolean;
}) {
  const setImplementation = (todoId: string, text: string) => {
    const prev = (answers[IMPLEMENTATIONS_KEY] ?? {}) as Record<string, unknown>;
    onChange(IMPLEMENTATIONS_KEY, { ...prev, [todoId]: text });
  };

  if (actionItems.length === 0) {
    return (
      <div style={{ fontSize: 12.5, color: faint, lineHeight: 1.6 }}>
        No to-dos were assigned to you for this week yet. They appear here as soon as they&apos;re added to your list.
      </div>
    );
  }

  return (
    <>
      <div style={{ fontSize: 11.5, color: faint, marginBottom: 10, lineHeight: 1.5 }}>
        How are you going to get each one done?
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {actionItems.map((i) => (
          <TodoRow
            key={i.id}
            item={i}
            value={implementation(answers, i.id)}
            placeholder="How will you do it?"
            onChange={(v) => setImplementation(i.id, v)}
            readOnly={readOnly}
            needed
          />
        ))}
      </div>
    </>
  );
}

/* ─── Friday: Commitment, read off the to-do list ─────────────────────────── */

function CommitmentSection({ answers, actionItems, derived, onChange, readOnly }: {
  answers: ReportAnswers;
  actionItems: WeekActionItem[];
  derived: Derived;
  onChange: (key: string, value: unknown) => void;
  readOnly?: boolean;
}) {
  const c = derived.commitment;

  const setReason = (todoId: string, text: string) => {
    const prev = (answers[MISSED_REASONS_KEY] ?? {}) as Record<string, unknown>;
    onChange(MISSED_REASONS_KEY, { ...prev, [todoId]: text });
  };

  return (
    <>
      <AutoBlock items={[
        <AutoRow
          key="done"
          label="Action items completed"
          value={`${c.completed} of ${c.assigned}`}
          hint={c.assigned ? undefined : 'nothing was assigned this week'}
        />,
        <AutoRow key="rate" label="Completion rate" value={pctOrDash(c.completionRate)} />,
        ...(c.completionRate !== null && c.completionRate < 70 ? [
          <div key="warn" style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginTop: 2 }}>
            <TrendingUp size={13} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: 12, color: '#f0d9a8', lineHeight: 1.5 }}>
              Under 70% — two weeks of this is the point to intervene.
            </span>
          </div>,
        ] : []),
      ]} />

      {c.assigned === 0 ? (
        <div style={{ fontSize: 12.5, color: faint, lineHeight: 1.6 }}>
          No to-dos were assigned to you for this week, so there is nothing to report here.
          This fills itself in from your to-do list.
        </div>
      ) : (
        <>
          {/* Completed — nothing to explain, just the receipt. */}
          {c.completed > 0 && (
            <div style={{ marginBottom: c.missed.length ? 18 : 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: cream, marginBottom: 9 }}>
                Completed ({c.completed})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {actionItems.filter((i) => i.done).map((i) => (
                  <div key={i.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                    <span style={{
                      flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 18, height: 18, borderRadius: 5, marginTop: 1,
                      background: 'rgba(74,222,128,0.14)', border: '1px solid rgba(74,222,128,0.45)', color: '#4ade80',
                    }}><Check size={11} /></span>
                    <span style={{ fontSize: 13, color: '#d9cfba', lineHeight: 1.45 }}>{i.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Missed — each needs a reason before the report can be submitted. */}
          {c.missed.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: cream, marginBottom: 3 }}>
                Missed ({c.missed.length}) — and why?
              </div>
              <div style={{ fontSize: 11.5, color: faint, marginBottom: 10, lineHeight: 1.5 }}>
                A miss with no reason tells us nothing next week. One line each is plenty.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {c.missed.map((i) => (
                  <TodoRow
                    key={i.id}
                    item={i}
                    value={missedReason(answers, i.id)}
                    placeholder="Why was it missed?"
                    onChange={(v) => setReason(i.id, v)}
                    readOnly={readOnly}
                    needed
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ─── A sub-section (Content → Instagram / YouTube) ───────────────────────── */

function GroupBlock({ group, answers, derived, onChange, readOnly }: {
  group: ReportGroup;
  answers: ReportAnswers;
  derived: Derived;
  onChange: (key: string, value: unknown) => void;
  readOnly?: boolean;
}) {
  return (
    <div style={{
      marginBottom: 16, padding: '15px 16px', borderRadius: 13,
      background: 'rgba(255,255,255,0.014)', border: '1px solid rgba(201,164,85,0.12)',
    }}>
      <div style={{
        fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
        color: G, fontWeight: 700, marginBottom: 14,
      }}>{group.label}</div>

      <AutoBlock items={groupAuto(group.id, derived)} />

      {!!group.fields?.length && (
        <div style={{
          display: 'grid', gap: 14, marginBottom: group.repeats?.length ? 18 : 0,
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
        }}>
          {group.fields.map((f) => (
            <FieldBlock key={f.id} field={f} answers={answers} onChange={onChange} readOnly={readOnly} />
          ))}
        </div>
      )}

      {group.repeats?.map((r) => (
        <RepeatGroup
          key={r.id}
          repeat={r}
          value={groupRows(answers, r.id)}
          onChange={(next) => onChange(r.id, next)}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}

function FieldBlock({ field, answers, onChange, readOnly }: {
  field: ReportField;
  answers: ReportAnswers;
  onChange: (key: string, value: unknown) => void;
  readOnly?: boolean;
}) {
  return (
    <div style={{ minWidth: 0, gridColumn: field.type === 'textarea' ? '1 / -1' : undefined }}>
      {/* An unlabelled field sits directly under its own section heading. */}
      {field.label && (
        <label style={{ display: 'block', fontSize: 12.5, color: cream, fontWeight: 500, marginBottom: field.help ? 3 : 7 }}>
          {field.label}
          {field.optional && <span style={{ color: faint, fontWeight: 400, marginLeft: 5, fontSize: 11 }}>optional</span>}
        </label>
      )}
      {field.help && <div style={{ fontSize: 11.5, color: faint, marginBottom: 7, lineHeight: 1.5 }}>{field.help}</div>}
      <FieldInput field={field} value={answers[field.id]} onChange={(v) => onChange(field.id, v)} readOnly={readOnly} />
    </div>
  );
}

/* ─── A whole section ─────────────────────────────────────────────────────── */

export function ReportSectionCard({
  section, answers, actionItems, derived, onChange, readOnly, collapsible, defaultOpen = true,
}: {
  section: ReportSection;
  answers: ReportAnswers;
  actionItems: WeekActionItem[];
  derived: Derived;
  onChange: (key: string, value: unknown) => void;
  readOnly?: boolean;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section style={{ ...cardStyle, marginBottom: 16 }}>
      <button
        type="button"
        onClick={() => collapsible && setOpen((o) => !o)}
        style={{
          display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
          padding: 0, marginBottom: open ? 14 : 0, cursor: collapsible ? 'pointer' : 'default',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 21, height: 21, borderRadius: 6, flexShrink: 0,
            background: 'rgba(201,164,85,0.12)', border: '1px solid rgba(201,164,85,0.28)',
            color: G, fontSize: 10.5, fontWeight: 700,
          }}>{section.num}</span>
          <h3 style={{ margin: 0, fontSize: 15, color: cream, fontWeight: 600 }}>{section.title}</h3>
        </div>
      </button>

      {open && (
        <>
          {section.appData === 'plan' ? (
            <PlanSection
              answers={answers}
              actionItems={actionItems}
              onChange={onChange}
              readOnly={readOnly}
            />
          ) : section.appData === 'commitment' ? (
            <CommitmentSection
              answers={answers}
              actionItems={actionItems}
              derived={derived}
              onChange={onChange}
              readOnly={readOnly}
            />
          ) : (
            <>
              {!!section.fields?.length && (
                <div style={{
                  display: 'grid', gap: 14, marginBottom: (section.repeats?.length || section.groups?.length) ? 18 : 0,
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
                }}>
                  {section.fields.map((f) => (
                    <FieldBlock key={f.id} field={f} answers={answers} onChange={onChange} readOnly={readOnly} />
                  ))}
                </div>
              )}

              {section.repeats?.map((r) => (
                <RepeatGroup
                  key={r.id}
                  repeat={r}
                  value={groupRows(answers, r.id)}
                  onChange={(next) => onChange(r.id, next)}
                  readOnly={readOnly}
                />
              ))}

              {section.groups?.map((g) => (
                <GroupBlock
                  key={g.id}
                  group={g}
                  answers={answers}
                  derived={derived}
                  onChange={onChange}
                  readOnly={readOnly}
                />
              ))}
            </>
          )}
        </>
      )}
    </section>
  );
}

/* ─── Header strip: the numbers a founder scans for ───────────────────────── */

export function DerivedSummary({ derived }: { derived: Derived }) {
  const rate = derived.commitment.completionRate;
  const tint = BAND_COLOR[rate === null ? 'none' : rate >= 85 ? 'green' : rate >= 70 ? 'amber' : 'red'];
  const tiles: { label: string; value: string }[] = [
    { label: 'Closed', value: `${derived.closeRate === null ? '—' : `${derived.closeRate}%`}` },
    { label: 'Cash', value: `$${derived.totalCash.toLocaleString()}` },
    { label: 'IG views', value: derived.igViews7d.toLocaleString() },
    { label: 'YT views', value: derived.ytViews.toLocaleString() },
  ];

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{
        fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: tint, background: `${tint}1f`, border: `1px solid ${tint}55`,
        padding: '4px 11px', borderRadius: 20,
      }}>{rate === null ? 'No to-dos' : `${rate}% done`}</span>
      {tiles.map((t) => (
        <span key={t.label} style={{ fontSize: 12, color: sub }}>
          {t.label} <strong style={{ color: cream, fontWeight: 600 }}>{t.value}</strong>
        </span>
      ))}
    </div>
  );
}

/* ─── Escalation banner ───────────────────────────────────────────────────── */

export function EscalationBanner({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div style={{
      marginBottom: 16, padding: '13px 15px', borderRadius: 12,
      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.32)',
    }}>
      <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#f87171', fontWeight: 700, marginBottom: 7 }}>
        Escalation trigger
      </div>
      {items.map((t) => (
        <div key={t} style={{ fontSize: 12.5, color: '#fca5a5', lineHeight: 1.6 }}>{t}</div>
      ))}
    </div>
  );
}
