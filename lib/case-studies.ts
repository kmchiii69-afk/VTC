/**
 * Client testimonial videos, shared by the funnel case-study section and the
 * /funnel/not-ready page. One list so a new case study appears in both.
 *
 *   pre/hi — headline split, `hi` is the gold-highlighted result
 *   id     — YouTube video id
 *   t      — start offset in seconds (0 = from the top)
 *   list   — optional playlist id
 */
export interface CaseStudy {
  pre: string;
  hi: string;
  id: string;
  t: number;
  list?: string;
}

export const CASE_STUDIES: CaseStudy[] = [
  { pre: 'Maya & Joey Scaled From ', hi: '$20k To $224k/Mo',           id: 'ZX3lzkRsAsI', t: 0   },
  { pre: 'Hans Scaled From ',        hi: '$70k To $165k/Mo',            id: 'qPl01-EUDdg', t: 236 },
  { pre: 'Alessio & Bryan Scaled From ', hi: '$40k To $154k/Mo',       id: 'sm-3eXqZwW4', t: 0   },
  { pre: 'Dario Scaled From ',       hi: '$45k To $109k/Mo In 30 Days', id: 'LfjdBDlr8Ik', t: 0   },
  { pre: 'Andres Scaled From ',      hi: '$30k To $102k',               id: '95LFQWGhOGE', t: 0   },
  { pre: 'Josh Scaled His Business From ', hi: '$500 To $102k/Mo',     id: 'wiRrc92alaA', t: 0   },
  { pre: 'Hoku Scaled His Business From ', hi: '$20k To $85k/Mo',      id: 'b1OP4mJUGLc', t: 99  },
  { pre: 'Andrew Scaled To ',        hi: '$151k/Mo',                    id: 'xodGOrFW-kI', t: 0, list: 'PLLp77Kdh49IGcL0DFPv1qxacP1TTEyYOs' },
];

/** YouTube embed URL for a case study, matching the funnel's player settings. */
export function caseStudyEmbedUrl(cs: CaseStudy): string {
  return `https://www.youtube-nocookie.com/embed/${cs.id}${cs.t ? `?start=${cs.t}&` : '?'}${cs.list ? `list=${cs.list}&` : ''}rel=0&modestbranding=1&playsinline=1`;
}
