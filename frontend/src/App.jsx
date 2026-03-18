import { useState, useCallback, useEffect, useRef } from "react";

const API_BASE = "http://localhost:8000";

/* ─── Tokens ─────────────────────────────────────────────────────────────── */
const T = {
  bg:        "#07080c",
  surface:   "#0e1017",
  panel:     "#13161f",
  raised:    "#181c28",
  border:    "rgba(255,255,255,0.06)",
  borderMd:  "rgba(255,255,255,0.10)",
  borderHi:  "rgba(255,255,255,0.16)",
  text:      "#f0f2f8",
  muted:     "#7c849e",
  faint:     "#3a3f54",
  blue:      "#4f80ff",
  blueDim:   "rgba(79,128,255,0.12)",
  teal:      "#2ee8c8",
  tealDim:   "rgba(46,232,200,0.10)",
  amber:     "#ffb340",
  amberDim:  "rgba(255,179,64,0.10)",
  coral:     "#ff6b6b",
  coralDim:  "rgba(255,107,107,0.10)",
  green:     "#3ddc84",
  greenDim:  "rgba(61,220,132,0.10)",
  violet:    "#b57bff",
  violetDim: "rgba(181,123,255,0.10)",
};

const EDGE_COLOR = {
  VERSION_OF:      T.blue,
  CO_LOCATED:      T.teal,
  RELATED_TO:      T.amber,
  SHARES_ENTITY:   T.coral,
  SAME_TOPIC:      T.violet,
  FOLDER_SIMILAR:  T.green,
  PARENT_FOLDER:   T.faint,
  CONTAINS_FOLDER: T.faint,
};
const EXT_COLOR  = {
  pdf:  { fg: T.coral,  bg: T.coralDim  },
  md:   { fg: T.teal,   bg: T.tealDim   },
  docx: { fg: T.blue,   bg: T.blueDim   },
  py:   { fg: T.green,  bg: T.greenDim  },
  txt:  { fg: T.violet, bg: T.violetDim },
  json: { fg: T.amber,  bg: T.amberDim  },
};

/* ─── Global CSS ─────────────────────────────────────────────────────────── */
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600&family=DM+Mono:wght@400;500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; width: 100%; overflow: hidden; background: ${T.bg};
    font-family: 'DM Sans', system-ui, sans-serif; color: ${T.text}; font-size: 14px;
    -webkit-font-smoothing: antialiased; }
  ::-webkit-scrollbar { width: 3px; height: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${T.faint}; border-radius: 2px; }
  input, button, kbd, textarea { font-family: inherit; }

  @keyframes fadeUp    { from{opacity:0;transform:translateY(8px)}  to{opacity:1;transform:translateY(0)} }
  @keyframes popUp     { from{opacity:0;transform:translateY(20px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes popDown   { from{opacity:1;transform:translateY(0) scale(1)} to{opacity:0;transform:translateY(20px) scale(.97)} }
  @keyframes btnPulse  { 0%,100%{box-shadow:0 0 0 0 rgba(79,128,255,.5)} 50%{box-shadow:0 0 0 8px rgba(79,128,255,0)} }
  @keyframes pulse     { 0%,100%{opacity:1} 50%{opacity:.35} }
  @keyframes spin      { to{transform:rotate(360deg)} }
  @keyframes shimmer   { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
  @keyframes blink     { 0%,100%{opacity:1} 50%{opacity:0} }
  @keyframes msgIn     { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes typingDot { 0%,80%,100%{transform:scale(0);opacity:.4} 40%{transform:scale(1);opacity:1} }

  .fu  { animation: fadeUp .28s ease both; }
  .fu1 { animation: fadeUp .28s .05s ease both; }
  .fu2 { animation: fadeUp .28s .10s ease both; }
  .fu3 { animation: fadeUp .28s .15s ease both; }
  .fu4 { animation: fadeUp .28s .20s ease both; }
  .sk  { background: linear-gradient(90deg,${T.panel} 25%,${T.raised} 50%,${T.panel} 75%);
         background-size: 400px 100%; animation: shimmer 1.4s infinite; border-radius: 6px; }
  .cursor { display:inline-block; width:2px; height:12px; background:${T.blue};
            vertical-align:middle; margin-left:2px; animation:blink 1s step-end infinite; }
  .msg-in { animation: msgIn .22s ease both; }

  /* Chat popup */
  .chat-popup {
    position: fixed;
    bottom: 88px;
    right: 24px;
    width: 400px;
    height: 580px;
    z-index: 1000;
    border-radius: 20px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: ${T.surface};
    border: 1px solid ${T.borderMd};
    box-shadow: 0 24px 80px rgba(0,0,0,.7), 0 0 0 1px rgba(79,128,255,.08);
    animation: popUp .28s cubic-bezier(.34,1.4,.64,1) both;
  }
  .chat-popup.closing {
    animation: popDown .2s ease both;
  }
  .chat-fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    z-index: 1001;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform .2s, box-shadow .2s;
  }
  .chat-fab:hover { transform: scale(1.08); }
  .chat-fab.has-file { animation: btnPulse 2.5s ease infinite; }
  .typing-dot {
    width: 6px; height: 6px; border-radius: 50%; background: ${T.muted};
    display: inline-block; margin: 0 2px;
  }
  .typing-dot:nth-child(1) { animation: typingDot 1.2s .0s ease-in-out infinite; }
  .typing-dot:nth-child(2) { animation: typingDot 1.2s .2s ease-in-out infinite; }
  .typing-dot:nth-child(3) { animation: typingDot 1.2s .4s ease-in-out infinite; }
`;

/* ─── Primitives ─────────────────────────────────────────────────────────── */
const Pill = ({ label, fg, bg, size=10 }) => (
  <span style={{ display:"inline-flex", alignItems:"center", fontSize:size, fontWeight:600,
    letterSpacing:"0.06em", padding:"2px 8px", borderRadius:20, background:bg, color:fg,
    whiteSpace:"nowrap", fontFamily:"'DM Mono',monospace" }}>{label}</span>
);
const Dot = ({ color, size=7, pulse=false }) => (
  <span style={{ display:"inline-block", width:size, height:size, borderRadius:"50%",
    background:color, flexShrink:0, animation:pulse?"pulse 2s ease infinite":"none" }} />
);
const Sep = () => <div style={{ height:1, background:T.border, margin:"0 16px" }} />;
const Bar = ({ label, value, color, delay=0 }) => (
  <div style={{ marginBottom:10 }}>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:5 }}>
      <span style={{ fontSize:11, color:T.muted }}>{label}</span>
      <span style={{ fontSize:13, fontWeight:600, color, fontFamily:"'DM Mono',monospace" }}>{Math.round(value*100)}</span>
    </div>
    <div style={{ height:4, borderRadius:4, background:T.raised, overflow:"hidden" }}>
      <div style={{ height:"100%", width:`${Math.round(value*100)}%`, borderRadius:4,
        background:`linear-gradient(90deg,${color}88,${color})`,
        transition:`width .7s ${delay}s cubic-bezier(.4,0,.2,1)`,
        boxShadow:`0 0 8px ${color}55` }} />
    </div>
  </div>
);

/* ─── SearchBar ──────────────────────────────────────────────────────────── */
function SearchBar({ value, onChange, onSearch, loading }) {
  const [focused, setFocused] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const h = e => { if ((e.metaKey||e.ctrlKey) && e.key==="k") { e.preventDefault(); ref.current?.focus(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12, height:48, padding:"0 16px",
      background:focused?T.raised:T.panel, border:`1.5px solid ${focused?T.blue:T.borderMd}`,
      borderRadius:14, transition:"all .2s",
      boxShadow:focused?`0 0 0 3px ${T.blueDim},0 4px 20px rgba(0,0,0,.3)`:"0 2px 8px rgba(0,0,0,.2)" }}
      onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}>
      {loading
        ? <div style={{ width:17,height:17,border:`2px solid ${T.faint}`,borderTopColor:T.blue,borderRadius:"50%",animation:"spin .7s linear infinite",flexShrink:0 }}/>
        : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={focused?T.blue:T.muted}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0,transition:"stroke .2s" }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>}
      <input ref={ref} value={value} onChange={e=>onChange(e.target.value)}
        onKeyDown={e=>e.key==="Enter"&&onSearch()}
        placeholder='Search your knowledge base… try "latest resume"'
        style={{ flex:1,background:"transparent",border:"none",outline:"none",color:T.text,fontSize:14,caretColor:T.blue }} />
      <div style={{ display:"flex",alignItems:"center",gap:8 }}>
        <kbd style={{ fontSize:10,color:T.faint,background:T.raised,border:`1px solid ${T.border}`,
          borderRadius:5,padding:"2px 6px",fontFamily:"'DM Mono',monospace",flexShrink:0 }}>⌘K</kbd>
        <button onClick={onSearch}
          style={{ background:loading?T.faint:T.blue,border:"none",borderRadius:9,padding:"7px 18px",
            color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",transition:"all .15s",whiteSpace:"nowrap",
            boxShadow:loading?"none":`0 2px 12px ${T.blueDim}` }}
          onMouseEnter={e=>{if(!loading)e.currentTarget.style.transform="translateY(-1px)";}}
          onMouseLeave={e=>{e.currentTarget.style.transform="";}}>
          Search
        </button>
      </div>
    </div>
  );
}

/* ─── ResultCard ─────────────────────────────────────────────────────────── */
function ResultCard({ result, selected, onClick, onAsk, index }) {
  const ec = EXT_COLOR[result.ext]||EXT_COLOR.txt;
  const pct = Math.round(result.final*100);
  const rankColor = pct>=80?T.green:pct>=60?T.amber:T.muted;
  return (
    <div className={`fu${Math.min(index+1,4)}`} onClick={onClick}
      style={{ position:"relative",background:selected?T.raised:"transparent",
        border:`1px solid ${selected?T.borderHi:"transparent"}`,
        borderRadius:12,padding:"13px 15px",cursor:"pointer",transition:"all .18s",marginBottom:3,overflow:"hidden" }}
      onMouseEnter={e=>{if(!selected){e.currentTarget.style.background=T.panel;e.currentTarget.style.borderColor=T.border;}}}
      onMouseLeave={e=>{if(!selected){e.currentTarget.style.background="transparent";e.currentTarget.style.borderColor="transparent";}}}>
      {selected&&<div style={{ position:"absolute",left:0,top:"18%",bottom:"18%",width:3,background:T.blue,borderRadius:"0 3px 3px 0" }}/>}
      <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:7 }}>
        <Pill label={result.ext.toUpperCase()} fg={ec.fg} bg={ec.bg}/>
        <span style={{ flex:1,fontSize:13,fontWeight:500,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{result.file}</span>
        <span style={{ fontSize:17,fontWeight:700,color:rankColor,fontFamily:"'DM Mono',monospace",lineHeight:1,flexShrink:0 }}>{pct}</span>
      </div>
      <div style={{ fontSize:11,color:T.faint,marginBottom:7,display:"flex",gap:5,alignItems:"center" }}>
        <span style={{ overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1 }}>{result.path}</span>
        <span style={{ flexShrink:0 }}>{result.chunk}</span>
        <span style={{ color:T.border }}>·</span>
        <span style={{ flexShrink:0 }}>{result.date}</span>
      </div>
      <p style={{ fontSize:12,color:T.muted,lineHeight:1.65,margin:0,
        display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden" }}>
        {result.snippet}
      </p>
      {result.tags.length>0&&(
        <div style={{ display:"flex",gap:5,marginTop:9,flexWrap:"wrap" }}>
          {result.tags.map(t=><Pill key={t} label={t.replace(/_/g," ")} fg={EDGE_COLOR[t]||T.muted} bg={`${(EDGE_COLOR[t]||T.muted)}18`}/>)}
        </div>
      )}
      {selected&&(
        <button onClick={e=>{e.stopPropagation();onAsk(result);}}
          style={{ marginTop:10,width:"100%",padding:"7px 12px",background:T.blueDim,
            border:`1px solid ${T.blue}44`,borderRadius:8,color:T.blue,fontSize:11,fontWeight:600,
            cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"all .15s",fontFamily:"inherit" }}
          onMouseEnter={e=>{e.currentTarget.style.background=`${T.blue}22`;}}
          onMouseLeave={e=>{e.currentTarget.style.background=T.blueDim;}}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          Ask about this file
        </button>
      )}
    </div>
  );
}

/* ─── Skeleton + Empty ───────────────────────────────────────────────────── */
const SkeletonCard = ({ delay }) => (
  <div style={{ padding:"14px 15px",marginBottom:3,animation:`fadeUp .28s ${delay}s ease both` }}>
    <div style={{ display:"flex",gap:8,marginBottom:9 }}><div className="sk" style={{ width:38,height:20 }}/><div className="sk" style={{ flex:1,height:20 }}/><div className="sk" style={{ width:26,height:20 }}/></div>
    <div className="sk" style={{ width:"55%",height:11,marginBottom:7 }}/>
    <div className="sk" style={{ width:"100%",height:11,marginBottom:5 }}/>
    <div className="sk" style={{ width:"70%",height:11 }}/>
  </div>
);
const Empty = ({ icon, title, sub }) => (
  <div style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",padding:32,textAlign:"center",gap:10 }}>
    <div style={{ fontSize:32,opacity:0.12 }}>{icon}</div>
    <div style={{ fontSize:13,fontWeight:500,color:T.muted }}>{title}</div>
    {sub&&<div style={{ fontSize:11,color:T.faint,lineHeight:1.65,maxWidth:220 }}>{sub}</div>}
  </div>
);

/* ─── Detail panel ───────────────────────────────────────────────────────── */
function DetailPanel({ result }) {
  if (!result) return <Empty icon="◎" title="Nothing selected" sub="Pick a result to see its score breakdown and document relationships"/>;
  const ec = EXT_COLOR[result.ext]||EXT_COLOR.txt;
  const pct = Math.round(result.final*100);
  const rc  = pct>=80?T.green:pct>=60?T.amber:T.coral;
  const circ = 2*Math.PI*24;
  return (
    <div className="fu" style={{ padding:"18px 16px",display:"flex",flexDirection:"column",gap:16 }}>
      <div style={{ display:"flex",gap:12,alignItems:"flex-start" }}>
        <div style={{ width:42,height:42,borderRadius:10,background:ec.bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
          <span style={{ fontSize:11,fontWeight:700,color:ec.fg,fontFamily:"'DM Mono'" }}>{result.ext.toUpperCase()}</span>
        </div>
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ fontSize:13,fontWeight:600,color:T.text,wordBreak:"break-all",lineHeight:1.4 }}>{result.file}</div>
          <div style={{ fontSize:11,color:T.faint,marginTop:3 }}>{result.path}</div>
          <div style={{ fontSize:11,color:T.faint }}>{result.chunk} · {result.date}</div>
        </div>
      </div>
      <div style={{ background:T.raised,borderRadius:12,padding:14,border:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:14 }}>
        <svg width="58" height="58" viewBox="0 0 58 58" style={{ flexShrink:0 }}>
          <circle cx="29" cy="29" r="24" fill="none" stroke={T.panel} strokeWidth="5.5"/>
          <circle cx="29" cy="29" r="24" fill="none" stroke={rc} strokeWidth="5.5"
            strokeDasharray={`${pct/100*circ} ${circ}`} strokeLinecap="round" strokeDashoffset={circ*0.25}
            style={{ transition:"stroke-dasharray .8s cubic-bezier(.4,0,.2,1)",filter:`drop-shadow(0 0 5px ${rc}66)` }}/>
          <text x="29" y="34" textAnchor="middle" fill={rc} fontSize="14" fontWeight="700" fontFamily="'DM Mono',monospace">{pct}</text>
        </svg>
        <div>
          <div style={{ fontSize:10,color:T.faint,letterSpacing:"0.07em",marginBottom:3 }}>RELEVANCE SCORE</div>
          <div style={{ fontSize:13,fontWeight:500,color:T.text }}>{pct>=80?"Strong match":pct>=60?"Good match":"Partial match"}</div>
          <div style={{ fontSize:11,color:T.faint,marginTop:2 }}>Hybrid BM25 + semantic + graph</div>
        </div>
      </div>
      <div style={{ background:T.raised,borderRadius:12,padding:"14px 14px",border:`1px solid ${T.border}` }}>
        <div style={{ fontSize:10,color:T.faint,letterSpacing:"0.08em",marginBottom:13 }}>RETRIEVAL BREAKDOWN</div>
        <Bar label="Semantic similarity" value={result.scores.semantic} color={T.blue}   delay={0.0}/>
        <Bar label="BM25 lexical"        value={result.scores.bm25}     color={T.teal}   delay={0.1}/>
        <Bar label="Graph centrality"    value={result.scores.graph}    color={T.violet} delay={0.2}/>
      </div>
      {result.tags.length>0&&(
        <div style={{ background:T.raised,borderRadius:12,padding:"14px 14px",border:`1px solid ${T.border}` }}>
          <div style={{ fontSize:10,color:T.faint,letterSpacing:"0.08em",marginBottom:11 }}>RELATIONSHIPS</div>
          <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
            {result.tags.map(t=>{const c=EDGE_COLOR[t]||T.muted;return(
              <div key={t} style={{ display:"flex",alignItems:"center",gap:10,padding:"9px 12px",background:`${c}0d`,borderRadius:8,border:`1px solid ${c}28` }}>
                <Dot color={c} size={7}/><span style={{ fontSize:12,color:T.text,fontWeight:500 }}>{t.replace(/_/g," ")}</span>
              </div>);})}
          </div>
        </div>
      )}
      <div style={{ background:T.raised,borderRadius:12,padding:"14px 14px",border:`1px solid ${T.border}` }}>
        <div style={{ fontSize:10,color:T.faint,letterSpacing:"0.08em",marginBottom:10 }}>CONTENT PREVIEW</div>
        <p style={{ fontSize:11,color:T.muted,lineHeight:1.8,margin:0,fontFamily:"'DM Mono',monospace" }}>{result.snippet||"No preview available."}</p>
      </div>
    </div>
  );
}

/* ─── Force-directed graph simulation ───────────────────────────────────── */
function useForceGraph(graphData, filter, showFolders, W, H) {
  const [positions, setPositions] = useState({});
  const simRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!graphData || !graphData.nodes.length) return;

    // Build working node set — seed positions spread across the full canvas
    const nodes = graphData.nodes
      .filter(n => showFolders || n.nodeType !== "folder")
      .map((n, i, arr) => {
        // Golden-angle spiral seeding — distributes nodes evenly, avoids
        // the random clumping that forces them to fight their way apart
        const existing = positions[n.id];
        if (existing) return { ...n, ...existing, vx: 0, vy: 0 };
        const angle = i * 2.399963; // golden angle in radians
        const radius = 60 + (i / arr.length) * Math.min(W, H) * 0.38;
        return {
          ...n,
          x: W / 2 + radius * Math.cos(angle),
          y: H / 2 + radius * Math.sin(angle),
          vx: 0, vy: 0,
        };
      });

    const nodeMap = {};
    nodes.forEach(n => (nodeMap[n.id] = n));

    const edges = graphData.edges.filter(e => {
      if (!showFolders && (e.type === "PARENT_FOLDER" || e.type === "CONTAINS_FOLDER")) return false;
      if (filter === "ALL") return true;
      return e.type === filter;
    }).filter(e => nodeMap[e.from] && nodeMap[e.to]);

    // Force simulation — runs in a ref, writes positions via setState each frame
    let tick = 0;
    const ALPHA_DECAY = 0.012;   // slower decay → more time to spread out
    let alpha = 1.0;

    // Ideal spring distances — generous so connected nodes stay comfortably apart
    const IDEAL = {
      VERSION_OF:      160,  // was 90
      CO_LOCATED:      200,  // was 110
      RELATED_TO:      280,  // was 160
      PARENT_FOLDER:   130,  // was 70
      CONTAINS_FOLDER: 150,  // was 80
    };
    // Spring strengths — weaker so repulsion wins the spread battle
    const STRENGTH = {
      VERSION_OF:      0.08,  // was 0.18
      CO_LOCATED:      0.06,  // was 0.12
      RELATED_TO:      0.03,  // was 0.06
      PARENT_FOLDER:   0.10,  // was 0.22
      CONTAINS_FOLDER: 0.09,  // was 0.20
    };

    function step() {
      if (alpha < 0.01) return;
      alpha *= (1 - ALPHA_DECAY);
      tick++;

      // Repulsion between all node pairs — long-range, strong enough to win
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          // Larger repulsion radius and stronger force — was repR*{55,80}, force*300
          const repR  = (a.nodeType === "folder" || b.nodeType === "folder") ? 200 : 160;
          if (dist < repR * 4) {
            const force = (alpha * 900) / (dist * dist);
            const fx = dx / dist * force, fy = dy / dist * force;
            a.vx -= fx; a.vy -= fy;
            b.vx += fx; b.vy += fy;
          }
        }
      }

      // Spring forces along edges
      for (const e of edges) {
        const a = nodeMap[e.from], b = nodeMap[e.to];
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const ideal = IDEAL[e.type] || 130;
        const str   = STRENGTH[e.type] || 0.1;
        const delta = (dist - ideal) * str * alpha;
        const fx = dx / dist * delta, fy = dy / dist * delta;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }

      // Centre gravity — very gentle, just enough to keep orphan nodes on screen
      const grav = 0.004 * alpha;  // was 0.015 — too strong, fights spread
      for (const n of nodes) {
        n.vx += (W / 2 - n.x) * grav;
        n.vy += (H / 2 - n.y) * grav;
      }

      // Integrate + damping + bounds
      const DAMP = 0.82;  // was 0.72 — less damping lets nodes travel further
      for (const n of nodes) {
        n.vx *= DAMP; n.vy *= DAMP;
        n.x = Math.max(24, Math.min(W - 24, n.x + n.vx));
        n.y = Math.max(24, Math.min(H - 24, n.y + n.vy));
      }

      // Snapshot to state every 2 ticks for smooth rendering
      if (tick % 2 === 0) {
        const snap = {};
        nodes.forEach(n => { snap[n.id] = { x: n.x, y: n.y }; });
        setPositions(snap);
      }

      rafRef.current = requestAnimationFrame(step);
    }

    rafRef.current = requestAnimationFrame(step);
    simRef.current = { nodes, nodeMap };

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [graphData, filter, showFolders, W, H]);

  return { positions, simNodes: simRef.current?.nodes || [] };
}

/* ─── Graph panel ─────────────────────────────────────────────────────────── */
function GraphPanel({ graphData, highlightId, onNodeSelect }) {
  const containerRef  = useRef(null);
  const [dims, setDims]           = useState({ w: 700, h: 480 });
  const [filter, setFilter]       = useState("ALL");
  const [showFolders, setShowFolders] = useState(true);
  const [hovered, setHovered]     = useState(null);
  const [selected, setSelected]   = useState(null);
  const [pan, setPan]             = useState({ x: 0, y: 0 });
  const [zoom, setZoom]           = useState(1);
  const [isDragging, setIsDragging]   = useState(false);
  const [dragNode, setDragNode]   = useState(null);
  const [pinnedPositions, setPinnedPositions] = useState({});
  const panStart = useRef(null);
  const dragStart = useRef(null);

  // Measure container
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => {
      setDims({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const { positions } = useForceGraph(graphData, filter, showFolders, dims.w, dims.h);

  if (!graphData || !graphData.nodes.length)
    return <Empty icon="⬡" title="No graph data" sub="Index some documents first — the knowledge graph will appear here" />;

  // Merge simulated positions with user-pinned positions
  const merged = {};
  graphData.nodes.forEach(n => {
    const p = pinnedPositions[n.id] || positions[n.id];
    if (p) merged[n.id] = p;
  });

  const nodeMap = {};
  graphData.nodes.forEach(n => { if (merged[n.id]) nodeMap[n.id] = { ...n, ...merged[n.id] }; });

  const visibleNodes = graphData.nodes.filter(n =>
    (showFolders || n.nodeType !== "folder") && merged[n.id]
  );
  const visibleEdges = graphData.edges.filter(e => {
    if (!showFolders && (e.type === "PARENT_FOLDER" || e.type === "CONTAINS_FOLDER")) return false;
    if (filter !== "ALL" && e.type !== filter) return false;
    return nodeMap[e.from] && nodeMap[e.to];
  });

  // Selected node neighbours
  const neighbourIds = new Set();
  if (selected) {
    graphData.edges.forEach(e => {
      if (e.from === selected) neighbourIds.add(e.to);
      if (e.to   === selected) neighbourIds.add(e.from);
    });
  }

  // Selected node details
  const selectedNode = selected ? nodeMap[selected] : null;
  const selectedEdges = selected
    ? graphData.edges.filter(e => e.from === selected || e.to === selected)
    : [];

  // ── Interaction handlers ──────────────────────────────────────────────
  const toSVG = (clientX, clientY) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top  - pan.y) / zoom,
    };
  };

  const handleCanvasMouseDown = (e) => {
    if (dragNode) return;
    panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
    setIsDragging(false);
  };

  const handleCanvasMouseMove = (e) => {
    if (dragNode) {
      const sv = toSVG(e.clientX, e.clientY);
      setPinnedPositions(p => ({ ...p, [dragNode]: { x: sv.x, y: sv.y } }));
      return;
    }
    if (!panStart.current) return;
    const dx = e.clientX - panStart.current.mx;
    const dy = e.clientY - panStart.current.my;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) setIsDragging(true);
    setPan({ x: panStart.current.px + dx, y: panStart.current.py + dy });
  };

  const handleCanvasMouseUp = () => {
    panStart.current = null;
    setDragNode(null);
    setIsDragging(false);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    setZoom(z => Math.max(0.3, Math.min(3, z * factor)));
  };

  const handleNodeMouseDown = (e, nodeId) => {
    e.stopPropagation();
    dragStart.current = { id: nodeId, moved: false };
    setDragNode(nodeId);
  };

  const handleNodeClick = (e, nodeId) => {
    e.stopPropagation();
    if (isDragging) return;
    setSelected(s => s === nodeId ? null : nodeId);
    if (onNodeSelect) onNodeSelect(nodeMap[nodeId]);
  };

  const handleZoomBtn = (dir) => setZoom(z => Math.max(0.3, Math.min(3, z * (dir > 0 ? 1.25 : 0.8))));
  const handleReset   = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // Edge path — curved for semantic, straight for structural
  const edgePath = (ax, ay, bx, by, type) => {
    if (type === "PARENT_FOLDER" || type === "CONTAINS_FOLDER") {
      return `M${ax},${ay}L${bx},${by}`;
    }
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const dx = bx - ax, dy = by - ay;
    const perp = 0.18;
    const cx = mx - dy * perp, cy = my + dx * perp;
    return `M${ax},${ay}Q${cx},${cy} ${bx},${by}`;
  };

  const EDGE_META = {
    VERSION_OF:      { color: T.blue,   width: 2.5, dash: null,    label: "Version of"      },
    CO_LOCATED:      { color: T.teal,   width: 1.8, dash: null,    label: "Co-located"      },
    RELATED_TO:      { color: T.amber,  width: 1.5, dash: "6 3",   label: "Related to"      },
    SHARES_ENTITY:   { color: T.coral,  width: 2.2, dash: null,    label: "Shares entity"   },
    SAME_TOPIC:      { color: T.violet, width: 1.8, dash: "4 2",   label: "Same topic"      },
    FOLDER_SIMILAR:  { color: T.green,  width: 1.2, dash: "8 4",   label: "Folder similar"  },
    PARENT_FOLDER:   { color: T.faint,  width: 0.8, dash: null,    label: "In folder"       },
    CONTAINS_FOLDER: { color: T.faint,  width: 0.6, dash: "3 3",   label: "Contains"        },
  };

  const FILE_ICON_PATH = "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6";
  const FOLDER_ICON_PATH = "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px",
        borderBottom: `1px solid ${T.border}`, flexShrink: 0, flexWrap: "wrap" }}>

        {/* Edge filters */}
        {["ALL", "VERSION_OF", "CO_LOCATED", "RELATED_TO", "SHARES_ENTITY", "SAME_TOPIC"].map(f => {
          const active = filter === f;
          const c = EDGE_COLOR[f] || T.blue;
          return (
            <button key={f} onClick={() => setFilter(f)}
              style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", padding: "4px 11px",
                borderRadius: 20, border: `1px solid ${active ? c : T.border}`,
                background: active ? `${c}1a` : "transparent",
                color: active ? c : T.muted, cursor: "pointer", fontFamily: "inherit",
                transition: "all .15s" }}>
              {f === "ALL" ? "All" : f.replace(/_/g, " ")}
            </button>
          );
        })}

        {/* Folder toggle */}
        <button onClick={() => setShowFolders(v => !v)}
          style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 600,
            padding: "4px 11px", borderRadius: 20, cursor: "pointer", fontFamily: "inherit",
            border: `1px solid ${showFolders ? T.borderHi : T.border}`,
            background: showFolders ? T.raised : "transparent",
            color: showFolders ? T.text : T.muted, transition: "all .15s" }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d={FOLDER_ICON_PATH} />
          </svg>
          Folders
        </button>

        <div style={{ flex: 1 }} />

        {/* Node count badge */}
        <span style={{ fontSize: 10, color: T.faint, fontFamily: "'DM Mono',monospace" }}>
          {visibleNodes.length} nodes · {visibleEdges.length} edges
        </span>

        {/* Zoom controls */}
        {[["−", -1], ["+", 1]].map(([label, dir]) => (
          <button key={label} onClick={() => handleZoomBtn(dir)}
            style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${T.border}`,
              background: T.raised, color: T.muted, fontSize: 14, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "inherit", transition: "all .15s" }}
            onMouseEnter={e => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.borderMd; }}
            onMouseLeave={e => { e.currentTarget.style.color = T.muted; e.currentTarget.style.borderColor = T.border; }}>
            {label}
          </button>
        ))}
        <button onClick={handleReset}
          style={{ fontSize: 10, fontWeight: 600, padding: "4px 10px", borderRadius: 7,
            border: `1px solid ${T.border}`, background: T.raised, color: T.muted,
            cursor: "pointer", fontFamily: "inherit", transition: "all .15s" }}
          onMouseEnter={e => { e.currentTarget.style.color = T.text; }}
          onMouseLeave={e => { e.currentTarget.style.color = T.muted; }}>
          Reset
        </button>
      </div>

      {/* ── Canvas + inspector ── */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>

        {/* SVG canvas */}
        <div ref={containerRef} style={{ flex: 1, position: "relative", overflow: "hidden",
          background: `radial-gradient(ellipse at 35% 40%, ${T.raised} 0%, ${T.bg} 65%)`,
          cursor: isDragging ? "grabbing" : dragNode ? "grabbing" : "grab" }}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          onWheel={handleWheel}>

          <svg width={dims.w} height={dims.h} style={{ display: "block", userSelect: "none" }}>
            <defs>
              <filter id="glow-blue"  x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="glow-teal"  x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="glow-amber" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              {/* Arrowhead markers */}
              {Object.entries(EDGE_META).map(([type, meta]) => (
                <marker key={type} id={`arrow-${type}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill={meta.color} fillOpacity={0.7} />
                </marker>
              ))}
            </defs>

            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

              {/* ── Edges ── */}
              {visibleEdges.map((e, i) => {
                const a = nodeMap[e.from], b = nodeMap[e.to];
                if (!a || !b) return null;
                const meta = EDGE_META[e.type] || EDGE_META.RELATED_TO;
                const isStructural = e.type === "PARENT_FOLDER" || e.type === "CONTAINS_FOLDER";
                const isActive = selected
                  ? (e.from === selected || e.to === selected)
                  : (hovered === e.from || hovered === e.to);
                const opacity = selected
                  ? (isActive ? 0.9 : 0.08)
                  : isStructural ? 0.18 : isActive ? 0.85 : 0.22;
                const strokeW = isStructural ? meta.width
                  : isActive ? meta.width * 1.8 : meta.width;

                return (
                  <path key={i}
                    d={edgePath(a.x, a.y, b.x, b.y, e.type)}
                    fill="none"
                    stroke={meta.color}
                    strokeWidth={strokeW}
                    strokeOpacity={opacity}
                    strokeDasharray={meta.dash || undefined}
                    markerEnd={!isStructural ? `url(#arrow-${e.type})` : undefined}
                    style={{ transition: "stroke-opacity .25s, stroke-width .25s" }}
                  />
                );
              })}

              {/* ── Nodes ── */}
              {visibleNodes.map(n => {
                const pos = merged[n.id];
                if (!pos) return null;
                const { x, y } = pos;
                const isFolder  = n.nodeType === "folder";
                const isSel     = selected === n.id;
                const isHov     = hovered  === n.id;
                const isNeighbour = neighbourIds.has(n.id);
                const isHighlight = highlightId === n.id;
                const dimmed    = selected && !isSel && !isNeighbour && !isFolder;
                const r         = isFolder ? 9 : (n.size || 10);
                const ec        = EXT_COLOR[n.ext] || { fg: n.color || T.blue, bg: T.blueDim };

                return (
                  <g key={n.id}
                    onMouseEnter={() => setHovered(n.id)}
                    onMouseLeave={() => setHovered(null)}
                    onMouseDown={e => handleNodeMouseDown(e, n.id)}
                    onClick={e => handleNodeClick(e, n.id)}
                    style={{ cursor: "pointer" }}>

                    {/* Selection / highlight ring */}
                    {(isSel || isHighlight) && (
                      <circle cx={x} cy={y} r={r + 9}
                        fill="none" stroke={isSel ? n.color : T.teal}
                        strokeWidth={1.5} strokeOpacity={0.5}
                        strokeDasharray={isSel ? undefined : "4 3"} />
                    )}

                    {/* Outer glow for selected */}
                    {isSel && (
                      <circle cx={x} cy={y} r={r + 14}
                        fill={n.color} fillOpacity={0.08} />
                    )}

                    {/* Body */}
                    {isFolder ? (
                      <rect x={x - r} y={y - r} width={r * 2} height={r * 2} rx={4}
                        fill={isSel || isHov ? T.borderHi : T.faint}
                        fillOpacity={dimmed ? 0.2 : isSel ? 0.9 : isHov ? 0.7 : 0.45}
                        stroke={isSel ? T.borderHi : T.border} strokeWidth={0.75}
                        style={{ transition: "all .2s" }} />
                    ) : (
                      <circle cx={x} cy={y} r={r}
                        fill={n.color}
                        fillOpacity={dimmed ? 0.15 : isSel ? 1 : isHov ? 0.92 : 0.72}
                        filter={isSel ? "url(#glow-blue)" : undefined}
                        style={{ transition: "all .2s" }} />
                    )}

                    {/* Folder icon */}
                    {isFolder && (
                      <svg x={x - 6} y={y - 6} width={12} height={12} viewBox="0 0 24 24"
                        fill="none" stroke={T.muted} strokeWidth="2" strokeLinecap="round">
                        <path d={FOLDER_ICON_PATH} />
                      </svg>
                    )}

                    {/* File extension badge on larger nodes */}
                    {!isFolder && r >= 12 && (
                      <text x={x} y={y + 4} textAnchor="middle"
                        fill="#fff" fontSize={r > 13 ? 8 : 7} fontWeight="700"
                        fontFamily="'DM Mono',monospace" fillOpacity={0.9}>
                        {(n.ext || "").toUpperCase().slice(0, 4)}
                      </text>
                    )}

                    {/* Label — always shown for selected/hovered, shown when not dimmed for others */}
                    {(isSel || isHov || (!dimmed && !isFolder)) && (
                      <text x={x} y={y + r + 13} textAnchor="middle"
                        fill={dimmed ? T.faint : isFolder ? T.muted : T.text}
                        fontSize={isFolder ? 9 : 10}
                        fontFamily="'DM Sans',sans-serif" fontWeight={isSel ? "600" : "400"}
                        fillOpacity={dimmed ? 0.3 : 1}
                        style={{ pointerEvents: "none", transition: "fill-opacity .2s" }}>
                        {(n.label || "").length > 18 ? (n.label || "").slice(0, 16) + "…" : n.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Zoom hint */}
          <div style={{ position: "absolute", bottom: 10, left: 12, fontSize: 10,
            color: T.faint, fontFamily: "'DM Mono',monospace", pointerEvents: "none" }}>
            Scroll to zoom · Drag to pan · Click node to inspect
          </div>

          {/* Zoom level indicator */}
          <div style={{ position: "absolute", bottom: 10, right: 12, fontSize: 10,
            color: T.faint, fontFamily: "'DM Mono',monospace", pointerEvents: "none" }}>
            {Math.round(zoom * 100)}%
          </div>
        </div>

        {/* ── Node inspector panel ── */}
        {selectedNode && (
          <div className="fu" style={{ width: 210, flexShrink: 0, borderLeft: `1px solid ${T.border}`,
            background: T.surface, overflowY: "auto", padding: "14px 14px" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 10, color: T.faint, letterSpacing: "0.08em", fontWeight: 600 }}>NODE INSPECTOR</span>
              <button onClick={() => setSelected(null)}
                style={{ background: "transparent", border: "none", cursor: "pointer",
                  color: T.faint, padding: 2, display: "flex" }}
                onMouseEnter={e => e.currentTarget.style.color = T.text}
                onMouseLeave={e => e.currentTarget.style.color = T.faint}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Node identity */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
              {selectedNode.nodeType === "folder" ? (
                <div style={{ width: 36, height: 36, borderRadius: 8, background: T.raised,
                  border: `1px solid ${T.borderMd}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="1.8" strokeLinecap="round">
                    <path d={FOLDER_ICON_PATH} />
                  </svg>
                </div>
              ) : (
                <div style={{ width: 36, height: 36, borderRadius: 8,
                  background: (EXT_COLOR[selectedNode.ext] || { bg: T.blueDim }).bg,
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: (EXT_COLOR[selectedNode.ext] || { fg: T.blue }).fg,
                    fontFamily: "'DM Mono',monospace" }}>
                    {(selectedNode.ext || "?").toUpperCase()}
                  </span>
                </div>
              )}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text, wordBreak: "break-all", lineHeight: 1.4 }}>
                  {selectedNode.label}
                </div>
                <div style={{ fontSize: 10, color: T.faint, marginTop: 3, fontFamily: "'DM Mono',monospace" }}>
                  {selectedNode.nodeType === "folder" ? "📁 folder" : selectedNode.docType || "file"}
                </div>
                {selectedNode.relPath && (
                  <div style={{ fontSize: 9, color: T.faint, marginTop: 2, fontFamily: "'DM Mono',monospace",
                    wordBreak: "break-all", lineHeight: 1.5 }}>
                    {selectedNode.relPath}
                  </div>
                )}
              </div>
            </div>

            {/* Connections */}
            {selectedEdges.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: T.faint, letterSpacing: "0.07em", marginBottom: 8 }}>
                  CONNECTIONS ({selectedEdges.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {selectedEdges.slice(0, 12).map((e, i) => {
                    const otherId = e.from === selected ? e.to : e.from;
                    const other   = nodeMap[otherId];
                    const meta    = EDGE_META[e.type] || EDGE_META.RELATED_TO;
                    const isOut   = e.from === selected;
                    if (!other) return null;
                    return (
                      <div key={i}
                        onClick={() => setSelected(otherId)}
                        style={{ display: "flex", flexDirection: "column", gap: 3, padding: "7px 8px",
                          background: T.raised, borderRadius: 8, border: `1px solid ${T.border}`,
                          cursor: "pointer", transition: "border-color .15s" }}
                        onMouseEnter={ev => ev.currentTarget.style.borderColor = T.borderMd}
                        onMouseLeave={ev => ev.currentTarget.style.borderColor = T.border}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <div style={{ width: 7, height: 7, borderRadius: "50%", background: meta.color, flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 10, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {other.label}
                            </div>
                            <div style={{ fontSize: 9, color: meta.color, fontFamily: "'DM Mono',monospace" }}>
                              {isOut ? "→ " : "← "}{e.type.replace(/_/g, " ").toLowerCase()}
                            </div>
                          </div>
                        </div>
                        {/* Show shared entities inline for SHARES_ENTITY edges */}
                        {e.type === "SHARES_ENTITY" && e.shared && e.shared.length > 0 && (
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", paddingLeft: 14 }}>
                            {e.shared.slice(0, 3).map((s, si) => (
                              <span key={si} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 8,
                                background: `${T.coral}18`, color: T.coral,
                                fontFamily: "'DM Mono',monospace", maxWidth: 80,
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                        {/* Show cluster for SAME_TOPIC edges */}
                        {e.type === "SAME_TOPIC" && e.cluster != null && (
                          <div style={{ paddingLeft: 14 }}>
                            <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 8,
                              background: `${T.violet}18`, color: T.violet,
                              fontFamily: "'DM Mono',monospace" }}>
                              cluster {e.cluster}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {selectedEdges.length > 12 && (
                    <div style={{ fontSize: 10, color: T.faint, textAlign: "center", padding: "4px 0" }}>
                      +{selectedEdges.length - 12} more
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Entity & cluster summary for file nodes */}
            {selectedNode && selectedNode.nodeType === "file" && (
              <>
                {selectedNode.keywords && selectedNode.keywords.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 10, color: T.faint, letterSpacing: "0.07em", marginBottom: 7 }}>
                      TOP KEYWORDS
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {selectedNode.keywords.map((kw, i) => (
                        <span key={i} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 8,
                          background: T.raised, color: T.muted, border: `1px solid ${T.border}`,
                          fontFamily: "'DM Mono',monospace" }}>
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {selectedNode.topNames && selectedNode.topNames.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 10, color: T.faint, letterSpacing: "0.07em", marginBottom: 7 }}>
                      NAMED ENTITIES
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {selectedNode.topNames.map((nm, i) => (
                        <span key={i} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 8,
                          background: `${T.coral}12`, color: T.coral,
                          border: `1px solid ${T.coral}28`,
                          fontFamily: "'DM Mono',monospace" }}>
                          {nm}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {selectedNode.cluster != null && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 10, color: T.faint, letterSpacing: "0.07em", marginBottom: 6 }}>
                      TOPIC CLUSTER
                    </div>
                    <span style={{ fontSize: 10, padding: "3px 9px", borderRadius: 10,
                      background: `${T.violet}18`, color: T.violet,
                      border: `1px solid ${T.violet}30`,
                      fontFamily: "'DM Mono',monospace" }}>
                      cluster {selectedNode.cluster}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Legend ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 14px",
        borderTop: `1px solid ${T.border}`, flexShrink: 0, flexWrap: "wrap" }}>
        {[
          ["Version of",     T.blue,   false],
          ["Co-located",     T.teal,   false],
          ["Related to",     T.amber,  true ],
          ["Shares entity",  T.coral,  false],
          ["Same topic",     T.violet, true ],
          ["Folder similar", T.green,  true ],
        ].map(([label, color, dashed]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 16, height: 2, borderRadius: 1,
              background: dashed ? "transparent" : color,
              ...(dashed ? { borderTop: `2px dashed ${color}` } : {}) }} />
            <span style={{ fontSize: 10, color: T.faint }}>{label}</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 10, height: 10, background: T.faint, opacity: 0.45, borderRadius: 2 }} />
          <span style={{ fontSize: 10, color: T.faint }}>folder node</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Ingest panel ────────────────────────────────────────────────────────── */
function IngestPanel({ onIngestComplete, stats }) {
  const [dragging,setDragging]=useState(false);
  const [files,setFiles]=useState([]);
  const ss={indexed:{color:T.green,label:"Indexed"},indexing:{color:T.amber,label:"Indexing…"},error:{color:T.coral,label:"Failed"}};
  const upload=async fl=>{
    const arr=Array.from(fl);if(!arr.length)return;
    const pend=arr.map(f=>({name:f.name,size:`${Math.max(1,Math.round(f.size/1024))} KB`,status:"indexing",ext:f.name.split(".").pop().toLowerCase()}));
    setFiles(p=>[...pend,...p]);
    const form=new FormData();arr.forEach(f=>form.append("files",f));
    try{const res=await fetch(`${API_BASE}/ingest`,{method:"POST",body:form});const d=await res.json();
      const sv=new Set((d.saved||[]).map(s=>s.file));const sk=new Set((d.skipped||[]).map(s=>s.file));
      setFiles(p=>p.map(f=>sv.has(f.name)?{...f,status:"indexed"}:sk.has(f.name)?{...f,status:"error"}:f));
      if(onIngestComplete)onIngestComplete();
    }catch{setFiles(p=>p.map(f=>pend.find(x=>x.name===f.name)?{...f,status:"error"}:f));}
  };
  const handleDrop=useCallback(async e=>{e.preventDefault();setDragging(false);await upload(e.dataTransfer.files);},[]);
  return(
    <div style={{ padding:"16px",display:"flex",flexDirection:"column",gap:14,height:"100%",overflowY:"auto" }}>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8 }}>
        {[{label:"Documents",value:stats?.total_documents??"—",color:T.blue},{label:"Chunks",value:stats?.total_chunks??"—",color:T.teal},{label:"Graph edges",value:stats?.graph_edges??"—",color:T.amber}]
          .map(s=>(
          <div key={s.label} style={{ background:T.raised,borderRadius:10,padding:"14px 12px",border:`1px solid ${T.border}` }}>
            <div style={{ fontSize:22,fontWeight:700,color:s.color,fontFamily:"'DM Mono',monospace",lineHeight:1 }}>{s.value}</div>
            <div style={{ fontSize:10,color:T.faint,marginTop:4,letterSpacing:"0.04em" }}>{s.label}</div>
          </div>
        ))}
      </div>
      <label htmlFor="file-upload" style={{ cursor:"pointer",display:"block" }}>
        <div onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={handleDrop}
          style={{ border:`2px dashed ${dragging?T.blue:T.border}`,borderRadius:14,padding:"26px 20px",
            textAlign:"center",background:dragging?T.blueDim:T.panel,transition:"all .2s",boxShadow:dragging?`0 0 0 3px ${T.blueDim}`:"none" }}>
          <div style={{ width:40,height:40,borderRadius:10,background:dragging?T.blueDim:T.raised,border:`1px solid ${dragging?T.blue:T.border}`,
            display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px",transition:"all .2s" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={dragging?T.blue:T.muted} strokeWidth="2" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <div style={{ fontSize:13,fontWeight:500,color:dragging?T.blue:T.text,marginBottom:4 }}>{dragging?"Release to upload":"Drop files here or click to browse"}</div>
          <div style={{ fontSize:11,color:T.faint }}>.txt · .md · .pdf · .docx · .py · .json</div>
        </div>
      </label>
      <input id="file-upload" type="file" multiple accept=".txt,.md,.pdf,.docx,.py,.json"
        onChange={e=>{upload(e.target.files);e.target.value="";}} style={{ display:"none" }}/>
      {files.length>0&&(<div>
        <div style={{ fontSize:10,color:T.faint,letterSpacing:"0.08em",marginBottom:8 }}>RECENT UPLOADS</div>
        <div style={{ display:"flex",flexDirection:"column",gap:5 }}>
          {files.slice(0,10).map((f,i)=>{const ec=EXT_COLOR[f.ext]||EXT_COLOR.txt;const sc=ss[f.status]||ss.indexing;return(
            <div key={i} className="fu" style={{ display:"flex",alignItems:"center",gap:8,padding:"9px 12px",background:T.raised,borderRadius:9,border:`1px solid ${T.border}` }}>
              <Pill label={f.ext.toUpperCase()} fg={ec.fg} bg={ec.bg}/>
              <span style={{ flex:1,fontSize:12,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{f.name}</span>
              <span style={{ fontSize:10,color:T.faint,flexShrink:0 }}>{f.size}</span>
              <div style={{ display:"flex",alignItems:"center",gap:5,flexShrink:0 }}>
                <Dot color={sc.color} size={6} pulse={f.status==="indexing"}/><span style={{ fontSize:10,fontWeight:600,color:sc.color }}>{sc.label}</span>
              </div>
            </div>);})}
        </div>
      </div>)}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHAT POPUP
   ═══════════════════════════════════════════════════════════════════════════ */

function TypingIndicator() {
  return (
    <div className="msg-in" style={{ display:"flex", alignItems:"flex-end", gap:8, marginBottom:16 }}>
      {/* Avatar */}
      <div style={{ width:28, height:28, borderRadius:"50%", background:`linear-gradient(135deg,${T.blueDim},${T.tealDim})`,
        border:`1px solid ${T.borderMd}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="3" fill={T.blue}/>
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke={T.teal} strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
      <div style={{ padding:"12px 16px", borderRadius:"18px 18px 18px 4px",
        background:T.raised, border:`1px solid ${T.border}`,
        display:"flex", alignItems:"center", gap:2 }}>
        <span className="typing-dot"/>
        <span className="typing-dot"/>
        <span className="typing-dot"/>
      </div>
    </div>
  );
}

function ChatMessage({ msg }) {
  const isUser = msg.role === "user";
  const ext = msg.sources?.[0]?.file ? (EXT_COLOR[msg.sources[0].file.split(".").pop()?.toLowerCase()] || EXT_COLOR.txt) : null;

  return (
    <div className="msg-in" style={{ display:"flex", alignItems:"flex-end", gap:8, marginBottom:16,
      flexDirection:isUser?"row-reverse":"row" }}>

      {/* Avatar */}
      <div style={{ width:28, height:28, borderRadius:"50%", flexShrink:0,
        background:isUser?T.blue:`linear-gradient(135deg,${T.blueDim},${T.tealDim})`,
        border:`1px solid ${isUser?T.blue:T.borderMd}`,
        display:"flex", alignItems:"center", justifyContent:"center" }}>
        {isUser
          ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          : <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="3" fill={T.blue}/>
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke={T.teal} strokeWidth="2" strokeLinecap="round"/>
            </svg>
        }
      </div>

      {/* Bubble + meta */}
      <div style={{ maxWidth:"76%", display:"flex", flexDirection:"column",
        alignItems:isUser?"flex-end":"flex-start", gap:5 }}>

        <div style={{ padding:"11px 15px",
          borderRadius:isUser?"18px 18px 4px 18px":"18px 18px 18px 4px",
          background:isUser?T.blue:T.raised,
          border:isUser?"none":`1px solid ${T.border}`,
          color:isUser?"#fff":T.text, fontSize:13, lineHeight:1.7,
          boxShadow:isUser?`0 2px 12px ${T.blueDim}`:"none" }}>
          {msg.streaming
            ? <span>{msg.content}<span className="cursor"/></span>
            : msg.content || <span style={{ color:T.faint,fontStyle:"italic" }}>…</span>
          }
        </div>

        {/* Source chips */}
        {!isUser && !msg.streaming && msg.sources && msg.sources.length>0 && (
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>

            {/* Fallback notice — only shown when answer spilled into version siblings */}
            {msg.usedFallback && (
              <div style={{ display:"flex", alignItems:"center", gap:5, padding:"4px 9px",
                background:T.amberDim, borderRadius:8, border:`1px solid ${T.amber}30` }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                  stroke={T.amber} strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                </svg>
                <span style={{ fontSize:10, color:T.amber, fontFamily:"'DM Mono',monospace" }}>
                  Partial answer — extended to related version
                </span>
              </div>
            )}

            <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
              {msg.sources.map((s,i)=>{
                const ec = EXT_COLOR[s.file?.split(".").pop()?.toLowerCase()]||EXT_COLOR.txt;
                const isPrimary = s.is_primary !== false; // default true for "all" scope
                return(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:4,
                    padding:"3px 8px", borderRadius:10,
                    background: isPrimary ? T.panel : T.amberDim,
                    border:`1px solid ${isPrimary ? T.border : T.amber+"33"}` }}>
                    <Dot color={isPrimary ? ec.fg : T.amber} size={5}/>
                    <span style={{ fontSize:10, fontFamily:"'DM Mono',monospace",
                      maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                      color: isPrimary ? T.muted : T.amber }}>
                      {s.file}
                    </span>
                    {!isPrimary && (
                      <span style={{ fontSize:9, color:T.amber, opacity:.7, whiteSpace:"nowrap" }}>
                        (version)
                      </span>
                    )}
                  </div>
                );
              })}
              {msg.confidence!=null&&(
                <div style={{ display:"flex",alignItems:"center",gap:4,padding:"3px 8px",
                  background:T.panel,borderRadius:10,border:`1px solid ${T.border}` }}>
                  <Dot color={msg.confidence>=0.75?T.green:msg.confidence>=0.5?T.amber:T.coral} size={5}/>
                  <span style={{ fontSize:10,color:T.muted,fontFamily:"'DM Mono',monospace" }}>
                    {Math.round(msg.confidence*100)}% confidence
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatPopup({ targetFile, onClose, onClearTarget }) {
  const [messages,  setMessages]  = useState([]);
  const [input,     setInput]     = useState("");
  const [asking,    setAsking]    = useState(false);
  const [scope,     setScope]     = useState("file");
  const [closing,   setClosing]   = useState(false);
  const scrollRef  = useRef();
  const inputRef   = useRef();
  const textareaRef = useRef();

  // Greeting
  useEffect(() => {
    setMessages([{
      role:"assistant",
      content: targetFile
        ? `Hi! I'm ready to answer questions about **${targetFile.file}**.\n\nI'll also check any related or version-linked files automatically. What would you like to know?`
        : `Hi! Ask me anything across your entire knowledge base.\n\nI'll find the most relevant documents and synthesise a precise answer for you.`,
      sources:[], confidence:null, streaming:false,
    }]);
    setTimeout(()=>inputRef.current?.focus(), 100);
  }, [targetFile?.id]);

  useEffect(()=>{
    if(scrollRef.current) scrollRef.current.scrollTop=scrollRef.current.scrollHeight;
  },[messages]);

  const handleClose = () => {
    setClosing(true);
    setTimeout(()=>{ onClose(); setClosing(false); }, 180);
  };

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  };

  const send = async () => {
    const q = input.trim();
    if (!q || asking) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setAsking(true);

    setMessages(prev=>[...prev,
      { role:"user",   content:q,  streaming:false },
      { role:"assistant", content:"", sources:[], confidence:null, streaming:true },
    ]);

    try {
      const body = { question:q, scope,
        ...(targetFile&&scope==="file"?{file_id:targetFile.id,filename:targetFile.file}:{}) };
      const res  = await fetch(`${API_BASE}/qa`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const data = await res.json();
      const full        = data.answer||"Not found in provided files.";
      const sources     = data.sources||[];
      const confidence  = data.confidence??null;
      const usedFallback = !!data.used_fallback;

      // Simulated token stream
      let revealed="";
      for(let i=0;i<full.length;i+=5){
        revealed+=full.slice(i,i+5);
        const snap=revealed;
        setMessages(prev=>prev.map((m,idx)=>idx===prev.length-1?{...m,content:snap}:m));
        await new Promise(r=>setTimeout(r,14));
      }
      setMessages(prev=>prev.map((m,idx)=>idx===prev.length-1?{...m,content:full,sources,confidence,usedFallback,streaming:false}:m));
    } catch {
      setMessages(prev=>prev.map((m,idx)=>idx===prev.length-1?{...m,content:"Couldn't reach the backend. Make sure the API is running on port 8000.",streaming:false}:m));
    }
    setAsking(false);
    inputRef.current?.focus();
  };

  const hasUserMsg = messages.some(m=>m.role==="user");

  const suggestions = targetFile ? [
    "What is this document about?",
    "Summarise the key points",
    "What dates or deadlines are mentioned?",
  ] : [
    "What are my most recent invoices?",
    "Summarise my project specs",
    "What changed between file versions?",
  ];

  return (
    <div className={`chat-popup${closing?" closing":""}`}>

      {/* ── Header ── */}
      <div style={{ background:T.surface, borderBottom:`1px solid ${T.border}`,
        padding:"14px 16px", flexShrink:0 }}>

        {/* Top row: avatar + title + close */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom: targetFile ? 10 : 0 }}>
          <div style={{ width:36, height:36, borderRadius:"50%",
            background:`linear-gradient(135deg,${T.blue},${T.teal})`,
            display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="3" fill="#fff"/>
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="rgba(255,255,255,.7)" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:700, color:T.text, letterSpacing:"-0.01em" }}>MemoryGraph AI</div>
            <div style={{ display:"flex", alignItems:"center", gap:5, marginTop:1 }}>
              <Dot color={T.green} size={5} pulse/>
              <span style={{ fontSize:11, color:T.muted }}>
                {asking ? "Thinking…" : "Online · phi3:mini"}
              </span>
            </div>
          </div>
          <button onClick={handleClose}
            style={{ background:"transparent", border:"none", cursor:"pointer",
              width:28, height:28, borderRadius:8, display:"flex", alignItems:"center",
              justifyContent:"center", color:T.muted, transition:"all .15s",
              flexShrink:0 }}
            onMouseEnter={e=>{e.currentTarget.style.background=T.raised;e.currentTarget.style.color=T.text;}}
            onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.muted;}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Context chip + scope toggle (when file-scoped) */}
        {targetFile && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
            {/* File chip */}
            <div style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px",
              background:T.raised, borderRadius:10, border:`1px solid ${T.borderMd}`,
              minWidth:0, flex:1 }}>
              {(() => { const ec=EXT_COLOR[targetFile.ext]||EXT_COLOR.txt; return <Dot color={ec.fg} size={6}/>; })()}
              <span style={{ fontSize:11, color:T.text, fontWeight:500, overflow:"hidden",
                textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>
                {targetFile.file}
              </span>
              <button onClick={onClearTarget}
                style={{ background:"transparent",border:"none",cursor:"pointer",color:T.faint,
                  display:"flex",alignItems:"center",padding:2,borderRadius:4,flexShrink:0,transition:"color .15s" }}
                onMouseEnter={e=>e.currentTarget.style.color=T.muted}
                onMouseLeave={e=>e.currentTarget.style.color=T.faint}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Scope pill toggle */}
            <div style={{ display:"flex", gap:2, background:T.panel, borderRadius:8,
              border:`1px solid ${T.border}`, padding:3, flexShrink:0 }}>
              {[["file","This file"],["all","All files"]].map(([v,l])=>(
                <button key={v} onClick={()=>setScope(v)}
                  style={{ fontSize:10, fontWeight:600, padding:"3px 8px", borderRadius:5,
                    border:"none", cursor:"pointer", fontFamily:"inherit", transition:"all .15s",
                    background:scope===v?T.blue:"transparent",
                    color:scope===v?"#fff":T.muted }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Messages ── */}
      <div ref={scrollRef} style={{ flex:1, overflowY:"auto", padding:"16px 14px",
        display:"flex", flexDirection:"column" }}>

        {messages.map((m,i)=><ChatMessage key={i} msg={m}/>)}
        {asking && !messages[messages.length-1]?.streaming && <TypingIndicator/>}

        {/* Suggestions — only before first user message */}
        {!hasUserMsg && (
          <div className="fu1" style={{ marginTop:4 }}>
            <div style={{ fontSize:10, color:T.faint, letterSpacing:"0.07em", marginBottom:8, textAlign:"center" }}>
              TRY ASKING
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {suggestions.map((s,i)=>(
                <button key={i}
                  onClick={()=>{ setInput(s); textareaRef.current?.focus(); }}
                  style={{ textAlign:"left", padding:"10px 13px", background:T.panel,
                    border:`1px solid ${T.border}`, borderRadius:12, color:T.muted,
                    fontSize:12, cursor:"pointer", fontFamily:"inherit", transition:"all .15s",
                    display:"flex", alignItems:"center", gap:8 }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderMd;e.currentTarget.style.color=T.text;e.currentTarget.style.background=T.raised;}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.muted;e.currentTarget.style.background=T.panel;}}>
                  <span style={{ color:T.faint, fontSize:14 }}>↗</span>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Input ── */}
      <div style={{ padding:"10px 12px 12px", borderTop:`1px solid ${T.border}`,
        background:T.surface, flexShrink:0 }}>
        <div style={{ display:"flex", gap:8, alignItems:"flex-end",
          background:T.raised, borderRadius:14, padding:"8px 8px 8px 14px",
          border:`1px solid ${T.borderMd}`,
          transition:"border-color .2s" }}
          onFocusCapture={e=>e.currentTarget.style.borderColor=T.blue}
          onBlurCapture={e=>e.currentTarget.style.borderColor=T.borderMd}>
          <textarea
            ref={el=>{textareaRef.current=el;inputRef.current=el;}}
            value={input}
            onChange={e=>{setInput(e.target.value);autoResize();}}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
            placeholder="Message MemoryGraph…"
            rows={1}
            style={{ flex:1,background:"transparent",border:"none",outline:"none",
              color:T.text,fontSize:13,resize:"none",lineHeight:1.6,
              caretColor:T.blue,maxHeight:112,overflowY:"auto",
              padding:0,paddingTop:2 }}
          />
          <button onClick={send} disabled={!input.trim()||asking}
            style={{ width:34,height:34,borderRadius:10,border:"none",flexShrink:0,
              background:input.trim()&&!asking?T.blue:T.faint,
              color:"#fff",cursor:input.trim()&&!asking?"pointer":"default",
              display:"flex",alignItems:"center",justifyContent:"center",
              transition:"all .15s",
              boxShadow:input.trim()&&!asking?`0 2px 10px ${T.blueDim}`:"none" }}
            onMouseEnter={e=>{if(input.trim()&&!asking)e.currentTarget.style.transform="scale(1.08)";}}
            onMouseLeave={e=>{e.currentTarget.style.transform="";}}>
            {asking
              ? <div style={{ width:14,height:14,border:"2px solid rgba(255,255,255,.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin .7s linear infinite" }}/>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="m22 2-11 20-4-9-9-4 24-7z"/><path d="m22 2-11 11"/>
                </svg>}
          </button>
        </div>
        <div style={{ fontSize:10,color:T.faint,marginTop:6,textAlign:"center" }}>
          Answers sourced locally via phi3:mini · never sent to the cloud
        </div>
      </div>
    </div>
  );
}

/* ─── FAB ─────────────────────────────────────────────────────────────────── */
function ChatFAB({ open, hasTarget, onClick }) {
  return (
    <button className={`chat-fab${hasTarget&&!open?" has-file":""}`} onClick={onClick}
      style={{ background:open?T.raised:`linear-gradient(135deg,${T.blue},#6b8fff)`,
        boxShadow:open?`0 2px 16px rgba(0,0,0,.4)`:`0 4px 20px ${T.blue}66` }}>
      {open
        ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
      }
      {/* Unread dot when a file is targeted but chat is closed */}
      {hasTarget && !open && (
        <div style={{ position:"absolute",top:2,right:2,width:10,height:10,borderRadius:"50%",
          background:T.green,border:`2px solid ${T.bg}` }}/>
      )}
    </button>
  );
}

/* ─── App ─────────────────────────────────────────────────────────────────── */
export default function App() {
  const [query,     setQuery]     = useState("");
  const [results,   setResults]   = useState([]);
  const [selected,  setSelected]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [searched,  setSearched]  = useState(false);
  const [tab,       setTab]       = useState("graph");
  const [graphData, setGraphData] = useState(null);
  const [stats,     setStats]     = useState(null);
  const [conn,      setConn]      = useState("connecting");

  // Chat state
  const [chatOpen,   setChatOpen]   = useState(false);
  const [chatTarget, setChatTarget] = useState(null); // null = global

  const fetchGraph = useCallback(async()=>{ try{const r=await fetch(`${API_BASE}/graph`);setGraphData(await r.json());}catch{} },[]);
  const fetchStats = useCallback(async()=>{ try{const r=await fetch(`${API_BASE}/status`);setStats(await r.json());setConn("ok");}catch{setConn("error");} },[]);
  useEffect(()=>{ fetchGraph(); fetchStats(); },[]);

  const handleSearch = async()=>{
    if(!query.trim())return;
    setLoading(true);setSearched(false);setSelected(null);setResults([]);
    try{const r=await fetch(`${API_BASE}/search?q=${encodeURIComponent(query.trim())}`);
      const d=await r.json();setResults(d.results||[]);setSelected(d.results?.[0]??null);setSearched(true);
    }catch{setSearched(true);}finally{setLoading(false);}
  };

  // "Ask about this file" from a result card → open chat scoped to that file
  const handleAsk = result => { setChatTarget(result); setChatOpen(true); };
  // FAB toggle
  const toggleChat = () => setChatOpen(o=>!o);

  const highlightId = selected?.id || null;
  const connColor={connecting:T.amber,ok:T.green,error:T.coral}[conn];
  const connLabel={connecting:"Connecting…",ok:stats?.model??"Connected",error:"Backend offline"}[conn];

  const tabs=[
    {id:"graph",  label:"Knowledge Graph",  icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><path d="M12 8v3M5 16l7-3M19 16l-7-3"/></svg>},
    {id:"ingest", label:"File Ingestion",   icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>},
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />
      <div style={{ display:"flex",flexDirection:"column",height:"100vh",width:"100vw",overflow:"hidden" }}>

        {/* ── Topbar ── */}
        <header style={{ display:"flex",alignItems:"center",gap:16,padding:"10px 20px",
          background:T.surface,borderBottom:`1px solid ${T.border}`,flexShrink:0,zIndex:10 }}>
          <div style={{ display:"flex",alignItems:"center",gap:10,flexShrink:0 }}>
            <div style={{ width:34,height:34,borderRadius:10,background:`linear-gradient(135deg,${T.blueDim},${T.tealDim})`,
              border:`1px solid ${T.borderMd}`,display:"flex",alignItems:"center",justifyContent:"center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="3" fill={T.blue}/>
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"
                  stroke={T.teal} strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize:14,fontWeight:700,letterSpacing:"-0.02em",lineHeight:1.1 }}>MemoryGraph</div>
            </div>
          </div>
          <div style={{ flex:1,maxWidth:780 }}>
            <SearchBar value={query} onChange={setQuery} onSearch={handleSearch} loading={loading}/>
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:8,flexShrink:0,
            padding:"7px 13px",background:T.panel,borderRadius:10,border:`1px solid ${T.border}` }}>
            <Dot color={connColor} size={7} pulse={conn==="connecting"}/>
            <span style={{ fontSize:11,color:T.muted,fontFamily:"'DM Mono',monospace" }}>{connLabel}</span>
          </div>
        </header>

        {/* ── 3-column body (unchanged) ── */}
        <div style={{ flex:1,display:"grid",gridTemplateColumns:"310px 1fr 268px",minHeight:0,overflow:"hidden" }}>

          {/* Col 1 — Results */}
          <aside style={{ borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",overflow:"hidden",background:T.surface }}>
            <div style={{ padding:"13px 15px 9px",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between" }}>
              <span style={{ fontSize:10,color:T.faint,letterSpacing:"0.08em",fontWeight:600 }}>RESULTS</span>
              {searched&&<span className="fu" style={{ fontSize:11,color:T.teal,background:T.tealDim,padding:"2px 8px",borderRadius:10,fontFamily:"'DM Mono',monospace" }}>{results.length} found</span>}
            </div>
            <Sep/>

            {/* ── Ask AI about these results — appears after any successful search ── */}
            {searched && results.length > 0 && (
              <div className="fu" style={{ margin:"8px 10px 2px",flexShrink:0 }}>
                <button
                  onClick={()=>{ setChatTarget(null); setChatOpen(true); }}
                  style={{
                    width:"100%", display:"flex", alignItems:"center", gap:9,
                    padding:"9px 13px", borderRadius:10, cursor:"pointer", fontFamily:"inherit",
                    background:chatOpen&&!chatTarget ? T.blue : `linear-gradient(135deg,${T.blueDim},${T.tealDim})`,
                    border:`1px solid ${chatOpen&&!chatTarget ? T.blue : `${T.blue}38`}`,
                    color:chatOpen&&!chatTarget ? "#fff" : T.blue,
                    transition:"all .18s",
                  }}
                  onMouseEnter={e=>{ if(!(chatOpen&&!chatTarget)){ e.currentTarget.style.background=`linear-gradient(135deg,${T.blue}28,${T.teal}18)`; e.currentTarget.style.borderColor=`${T.blue}66`; } }}
                  onMouseLeave={e=>{ if(!(chatOpen&&!chatTarget)){ e.currentTarget.style.background=`linear-gradient(135deg,${T.blueDim},${T.tealDim})`; e.currentTarget.style.borderColor=`${T.blue}38`; } }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink:0 }}>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  <div style={{ flex:1, textAlign:"left" }}>
                    <div style={{ fontSize:12, fontWeight:600, lineHeight:1.2 }}>Ask AI about these results</div>
                    <div style={{ fontSize:10, opacity:.7, marginTop:1, fontFamily:"'DM Mono',monospace" }}>
                      {results.length} file{results.length!==1?"s":""} · "{query.length>28?query.slice(0,26)+"…":query}"
                    </div>
                  </div>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink:0, opacity:.6 }}>
                    <path d="m9 18 6-6-6-6"/>
                  </svg>
                </button>
              </div>
            )}

            <div style={{ flex:1,overflowY:"auto",padding:"8px 8px" }}>
              {loading&&[0,1,2,3].map(i=><SkeletonCard key={i} delay={i*0.07}/>)}
              {!loading&&!searched&&<Empty icon="⌕" title="Search your documents" sub='Try "latest resume" or "invoices from cloudflare"'/>}
              {!loading&&searched&&results.length===0&&<Empty icon="∅" title="No results found" sub="Try different keywords or check that your documents are indexed"/>}
              {!loading&&searched&&results.map((r,i)=>(
                <ResultCard key={r.id} result={r} index={i}
                  selected={selected?.id===r.id}
                  onClick={()=>{ setSelected(r); setChatTarget(r); setChatOpen(true); }}
                  onAsk={handleAsk}/>
              ))}
            </div>
          </aside>

          {/* Col 2 — Graph / Ingest */}
          <main style={{ display:"flex",flexDirection:"column",overflow:"hidden",background:T.bg }}>
            <div style={{ display:"flex",gap:2,padding:"10px 16px 0",borderBottom:`1px solid ${T.border}`,flexShrink:0,background:T.surface }}>
              {tabs.map(t=>(
                <button key={t.id} onClick={()=>setTab(t.id)}
                  style={{ display:"flex",alignItems:"center",gap:6,background:"transparent",border:"none",
                    borderBottom:`2px solid ${tab===t.id?T.blue:"transparent"}`,padding:"8px 12px",marginBottom:-1,
                    color:tab===t.id?T.text:T.muted,fontSize:12,fontWeight:tab===t.id?600:400,
                    cursor:"pointer",fontFamily:"inherit",transition:"all .15s" }}>
                  {t.icon}{t.label}
                </button>
              ))}
            </div>
            <div style={{ flex:1,overflow:"hidden" }}>
              {tab==="graph"
                ?<GraphPanel graphData={graphData} highlightId={highlightId}/>
                :<IngestPanel onIngestComplete={()=>{fetchGraph();fetchStats();}} stats={stats}/>}
            </div>
          </main>

          {/* Col 3 — Detail */}
          <aside style={{ borderLeft:`1px solid ${T.border}`,display:"flex",flexDirection:"column",overflow:"hidden",background:T.surface }}>
            <div style={{ padding:"13px 17px 9px",flexShrink:0 }}>
              <span style={{ fontSize:10,color:T.faint,letterSpacing:"0.08em",fontWeight:600 }}>SCORE BREAKDOWN</span>
            </div>
            <Sep/>
            <div style={{ flex:1,overflowY:"auto" }}><DetailPanel result={selected}/></div>
          </aside>
        </div>

        {/* ── Status bar ── */}
        <footer style={{ display:"flex",alignItems:"center",gap:18,padding:"4px 20px",
          background:T.surface,borderTop:`1px solid ${T.border}`,
          fontSize:10,color:T.faint,fontFamily:"'DM Mono',monospace",flexShrink:0 }}>
          <span>{stats?.model??"—"}</span>
          <span style={{ color:T.border }}>│</span>
          <span>BM25 0.55 · Semantic 0.30 · Graph 0.10</span>
          <span style={{ color:T.border }}>│</span>
          <span>Reranking {stats?.reranking_enabled?"on":"off"}</span>
          <span style={{ color:T.border }}>│</span>
          <span>{stats?.total_documents??"—"} docs · {stats?.total_chunks??"—"} chunks</span>
          <div style={{ flex:1 }}/>
          <span>100% local · no cloud APIs</span>
        </footer>
      </div>

      {/* ── Floating Chat Popup (rendered outside the grid, fixed position) ── */}
      {chatOpen && (
        <ChatPopup
          targetFile={chatTarget}
          onClose={()=>setChatOpen(false)}
          onClearTarget={()=>setChatTarget(null)}
        />
      )}

      {/* ── FAB ── */}
      <ChatFAB open={chatOpen} hasTarget={!!chatTarget} onClick={toggleChat}/>
    </>
  );
}