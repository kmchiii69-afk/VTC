'use client';

import { useEffect, useRef } from 'react';

// Mounts a Vidalytics player for the given embed id. Same loader the /modules
// player uses; shared so the Brand Architect Beta lesson view renders identically.
export function VidalyticsEmbed({ embedId }: { embedId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // A Vidalytics id is a short alphanumeric token. Anything else (a full embed
  // snippet, a URL, stray quotes/parens) would be interpolated into the loader
  // <script> below and produce invalid JS — a SyntaxError that blanks the
  // player. Guard so only a clean id is ever injected.
  const valid = /^[A-Za-z0-9_-]+$/.test(embedId || '');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';
    if (!embedId || !valid) return;

    const div = document.createElement('div');
    div.id = `vidalytics_embed_${embedId}`;
    div.style.width = '100%';
    div.style.position = 'relative';
    div.style.paddingTop = '56.25%';
    container.appendChild(div);

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.innerHTML = `(function (v, i, d, a, l, y, t, c, s) {
      y='_'+d.toLowerCase();c=d+'L';if(!v[d]){v[d]={};}if(!v[c]){v[c]={};}if(!v[y]){v[y]={};}var vl='Loader',vli=v[y][vl],vsl=v[c][vl + 'Script'],vlf=v[c][vl + 'Loaded'],ve='Embed';
      if (!vsl){vsl=function(u,cb){
          if(t){cb();return;}s=i.createElement("script");s.type="text/javascript";s.async=1;s.src=u;
          if(s.readyState){s.onreadystatechange=function(){if(s.readyState==="loaded"||s.readyState=="complete"){s.onreadystatechange=null;vlf=1;cb();}};}else{s.onload=function(){vlf=1;cb();};}
          i.getElementsByTagName("head")[0].appendChild(s);
      };}
      vsl(l+'loader.min.js',function(){if(!vli){var vlc=v[c][vl];vli=new vlc();}vli.loadScript(l+'player.min.js',function(){var vec=v[d][ve];t=new vec();t.run(a);});});
    })(window, document, 'Vidalytics', 'vidalytics_embed_${embedId}', 'https://fast.vidalytics.com/embeds/Dyp2a1Oi/${embedId}/');`;
    container.appendChild(script);

    // Vidalytics injects a live player (and can relocate nodes) into this
    // container. Tear it down whenever the embed changes or the component
    // unmounts — otherwise switching to a lesson with no/other video leaves the
    // previous player mounted and overlapping the new content.
    return () => { container.innerHTML = ''; };
  }, [embedId, valid]);

  const bad = !!embedId && !valid;
  // The ref'd container is ALWAYS mounted (never conditionally returned) so its
  // identity is stable and the effect's cleanup can always reach it. The
  // placeholder is a separate sibling React fully owns — mixing React children
  // into the imperatively-managed container would fight the innerHTML writes.
  return (
    <>
      {(!embedId || !valid) && (
        <div style={{ width: '100%', paddingTop: '56.25%', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 20, color: bad ? 'rgba(239,68,68,0.8)' : 'rgba(240,232,212,0.4)', fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.5 }}>
            {bad
              ? "That doesn't look like a Vidalytics ID. To use a full embed snippet (iframe / <script>), paste the whole code — it renders automatically."
              : 'No video attached yet.'}
          </div>
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', display: embedId && valid ? 'block' : 'none' }} />
    </>
  );
}
