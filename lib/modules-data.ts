// Shared module catalog types + the DEFAULT catalog.
//
// Modules are admin-managed in the DB (module_sections + module_items, see
// supabase-modules.sql). DEFAULT_SECTIONS below is BOTH the seed used to
// populate those tables on first load AND the read-only fallback the /modules
// page renders if the migration hasn't been run yet. Edit the DB via the admin
// UI; this constant is only the starting point.

export interface ModuleItem {
  id: string;
  title: string;
  embed_id: string;
  sort_order: number;
}

export interface ModuleSection {
  id: string;
  name: string;
  sort_order: number;
  items: ModuleItem[];
}

export interface ModulesTree {
  sections: ModuleSection[];
  persisted: boolean; // false when falling back to defaults (table not created)
}

export const DEFAULT_SECTIONS: { name: string; items: { title: string; embed_id: string }[] }[] = [
  {
    name: 'Welcome',
    items: [
      { title: 'Appreciation For Joining Goh', embed_id: '6Llqml3sawJeP184' },
      { title: 'Onboarding Into Goh Consulting', embed_id: 'b9fFL2MvvYbnqzKf' },
      { title: 'Goh Team Overview', embed_id: 'K4s5Rb9wg_QWPWzu' },
    ],
  },
  {
    name: 'Mindset Mastery',
    items: [
      { title: 'Mindset', embed_id: 'C2wEZO_Mgb7MLcW2' },
      { title: 'Removing Limiting Beliefs To Make $151k/mo', embed_id: 'EOQPKFSGQJkRf7ho' },
      { title: 'Break Your Old Identity', embed_id: '0cZl3DFQbx95_3cy' },
      { title: 'Maximising Goh Consulting', embed_id: 'jVqmwBo7_O479EkL' },
      { title: 'Nero Mastermind Call', embed_id: 'Khfph1B95I88VARC' },
    ],
  },
  {
    name: 'Sharpening the Offer',
    items: [
      { title: 'Sharpening Your Offer Overview', embed_id: '_SxBZHKqSVqjJpKH' },
      { title: 'Offer Pitch Deck', embed_id: 'QhKG1YOJpddMIVGP' },
      { title: 'Bonuses and Guarantees', embed_id: 'HUvweCrZa5KdsHOh' },
      { title: 'Pricing Your Offer (Group Call)', embed_id: '8DFMlngQnU1eFPRc' },
      { title: 'Crafting an Irresistible Offer', embed_id: 'JCahpOPa0Rbk6RnS' },
      { title: 'Product Market Fit', embed_id: 'Y_sNmv8moXU9NqkJ' },
      { title: 'Cash Injection Actionables Checklist', embed_id: '8HBCPSNcwo0dmimS' },
    ],
  },
  {
    name: 'Cash Injection',
    items: [
      { title: 'Cash Injection', embed_id: 'bF4WIOTztmCNU5gu' },
      { title: 'Cash Injection Overview', embed_id: 'V9ig5I4DaD4jr7CQ' },
      { title: 'Cash Injection Marketing', embed_id: '_nROAU5cDFhETEi2' },
      { title: 'Revive Past Leads', embed_id: 'ydLWALYgl5Y3kd6c' },
    ],
  },
  {
    name: 'Content Accelerator',
    items: [
      { title: 'Content Accelerator Overview', embed_id: 'm8Nww79Ifsl1udN8' },
      { title: 'Story Sequences', embed_id: '7bAhct4zF4omy5EB' },
      { title: '$10k Story Strategy', embed_id: '4F2sGKvSLcC60pzs' },
      { title: 'Mastering Middle Of Funnel', embed_id: 'UE_A98Ucgm53iqLI' },
      { title: 'Mastering Top Of Funnel Content', embed_id: 'kc6pnYV_vwEHizzo' },
      { title: 'Infinite Content Ideas', embed_id: 'n3Itw2RKtpZ69vNx' },
      { title: 'Making A My Story Video', embed_id: 'jITgmnHiSyxfI19C' },
      { title: 'Optimizing Your IG Profile', embed_id: '9tgRQZkeFq5ox02D' },
      { title: 'Foundation of Content', embed_id: 'ebUfc6MRXD3Mb5hb' },
      { title: 'Setting the Expectations', embed_id: 'J6qjlsI8Hgge1Rgx' },
      { title: "Content FAQ's", embed_id: 'cnLEUy3QSLtZO8DC' },
      { title: 'Instagram Reels', embed_id: 'xUIx1MwU6HzTirK1' },
      { title: 'Goh Consulting Group Call', embed_id: '6z2IOg8elUKWbNFR' },
      { title: 'Steps To Become A 7 Figure Marketer', embed_id: '_0UoBxN5aSARiLks' },
      { title: 'YouTube Masterclass', embed_id: 'LElTPZr54y_JeTCS' },
      { title: 'First Three YouTube Videos', embed_id: 'ef8FrunZGAfKNZ0a' },
    ],
  },
  {
    name: 'Converting Leads',
    items: [
      { title: "Buyer's Journey", embed_id: 'qylTSWlFGxdtkrkx' },
      { title: 'Converting Leads Overview', embed_id: 'PFZaaTJcp8oaI_W5' },
      { title: 'Objection Handling Masterclass', embed_id: 'iCSoRxmTI85A8s5h' },
      { title: 'Reality Check', embed_id: 'zzOqyTqyt9Etx4Ai' },
      { title: 'B2B Closing Framework', embed_id: 'D_6jUyYBnIM_ZeeG' },
      { title: 'B2C Closing Framework', embed_id: '33OuyPzd14EODKff' },
      { title: 'Closer Mindset', embed_id: 'yUieu291UqO1y_9m' },
    ],
  },
  {
    name: 'Outreach & Sales Assets',
    items: [
      { title: 'Outreach Framework (B2C)', embed_id: 'KK6op3rpeaRiwSC3' },
      { title: 'Outreach Framework (B2B)', embed_id: 'yyQsfg1pFoICuSX0' },
      { title: 'Autopilot Inbound Framework (B2B)', embed_id: 'FwtYaOUKIJYeZAFI' },
      { title: 'Appointment Setting (Inbound Leads)', embed_id: 'MdTc4QZozvjPmyef' },
      { title: 'Sales Assets Overview', embed_id: 'q12wtLSlUWBIBklM' },
      { title: 'Submit Your VSL', embed_id: 'EN9Pb8JY1O2B9qXS' },
      { title: 'Building a VSL', embed_id: 'y86TC7w6cMhYs6Sp' },
      { title: 'VSL Formatting', embed_id: 'rYtGdWEFjvbtnSEX' },
    ],
  },
  {
    name: 'Systems & Team',
    items: [
      { title: 'System Infrastructure To $100k/mo', embed_id: 'dF2xHTUUnDmMQvyz' },
      { title: 'Training Protocol Overview', embed_id: 'UfTTfXn3hoVrIHRE' },
      { title: 'Discord Channel + Automations', embed_id: 'Af346ByaRBA_f6U2' },
      { title: 'Setting Goals', embed_id: 'Zddq793zLI9YK8Ws' },
      { title: 'Building Team Culture', embed_id: 'a8ukB7H1ftmeeJqM' },
      { title: 'Live Group Call Example', embed_id: '_mnO5CTeH6eCpSK6' },
      { title: 'Training Protocol For Setters', embed_id: 'a7btWcdhq6l2l0Pl' },
      { title: 'Hiring and Onboarding Setters', embed_id: 'dvYLcOyvH78npCQA' },
      { title: 'Hosting Team Calls', embed_id: 'dLelUxKy49XoGuMr' },
      { title: 'Sales Process and Identifying Bottlenecks', embed_id: 'o3ezMoeWP1RU3LV0' },
      { title: 'GHL Overview', embed_id: '_28MdL274zDPoFao' },
      { title: 'GHL Automations', embed_id: 'rwGJjBaEV5Li4Jdp' },
      { title: 'GHL Forms', embed_id: 'b6P7NDgOOPOe64rf' },
      { title: 'Zapier Masterclass', embed_id: 'Sx01u4r3nY9bbsAb' },
      { title: 'GHL Domains and Funnels', embed_id: 'aMIAtEdpfT2p4K3W' },
    ],
  },
];

// Read-only fallback tree (stable synthetic ids) used before the migration runs.
export function defaultTree(): ModulesTree {
  return {
    persisted: false,
    sections: DEFAULT_SECTIONS.map((s, si) => ({
      id: `default-${si}`,
      name: s.name,
      sort_order: si,
      items: s.items.map((it, ii) => ({ id: it.embed_id, title: it.title, embed_id: it.embed_id, sort_order: ii })),
    })),
  };
}
