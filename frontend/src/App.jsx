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

/* ─── Graph panel ─────────────────────────────────────────────────────────── */
function GraphPanel({ graphData, highlightId }) {
  const [hovered, setHovered] = useState(null);
  const [filter,  setFilter]  = useState("ALL");
  const [showFolders, setShowFolders] = useState(true);

  if (!graphData||graphData.nodes.length===0)
    return <Empty icon="⬡" title="No graph data" sub="Index some documents and the relationship graph will appear here"/>;

  const nodeMap={};
  graphData.nodes.forEach(n=>(nodeMap[n.id]=n));

  // Filter edges
  const FILE_EDGE_TYPES = ["VERSION_OF","CO_LOCATED","RELATED_TO"];
  const visibleEdges = graphData.edges.filter(e => {
    if (!showFolders && (e.type==="PARENT_FOLDER"||e.type==="CONTAINS_FOLDER")) return false;
    if (filter==="ALL") return true;
    return e.type===filter;
  });

  // Hide folder nodes when toggled off
  const visibleNodes = graphData.nodes.filter(n =>
    showFolders || n.nodeType !== "folder"
  );

  const filterButtons = ["ALL", ...FILE_EDGE_TYPES];

  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",padding:"14px 16px" }}>

      {/* Controls row */}
      <div style={{ display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",flexShrink:0,alignItems:"center" }}>
        {filterButtons.map(f=>{
          const active=filter===f; const c=EDGE_COLOR[f]||T.blue;
          return(
            <button key={f} onClick={()=>setFilter(f)}
              style={{ fontSize:10,fontWeight:600,letterSpacing:"0.05em",padding:"4px 12px",borderRadius:20,
                border:`1px solid ${active?c:T.border}`,background:active?`${c}18`:"transparent",
                color:active?c:T.muted,cursor:"pointer",fontFamily:"inherit",transition:"all .15s" }}>
              {f==="ALL"?"All edges":f.replace(/_/g," ")}
            </button>
          );
        })}

        {/* Folder toggle */}
        <button onClick={()=>setShowFolders(v=>!v)}
          style={{ marginLeft:"auto", fontSize:10, fontWeight:600, padding:"4px 12px", borderRadius:20,
            border:`1px solid ${showFolders?T.borderHi:T.border}`,
            background:showFolders?T.raised:"transparent",
            color:showFolders?T.text:T.muted, cursor:"pointer", fontFamily:"inherit",
            display:"flex", alignItems:"center", gap:5, transition:"all .15s" }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          {showFolders?"Hide folders":"Show folders"}
        </button>
      </div>

      {/* SVG canvas */}
      <div style={{ flex:1,borderRadius:12,overflow:"hidden",border:`1px solid ${T.border}`,
        background:`radial-gradient(ellipse at 40% 40%,${T.raised} 0%,${T.panel} 100%)` }}>
        <svg width="100%" height="100%" viewBox="0 0 560 420" style={{ display:"block" }}>
          <defs>
            <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          {/* Edges */}
          {visibleEdges.map((e,i)=>{
            const a=nodeMap[e.from],b=nodeMap[e.to];
            if(!a||!b||!a.x||!b.x) return null;
            const c=EDGE_COLOR[e.type]||T.muted;
            const hi=hovered===a.id||hovered===b.id||highlightId===a.id||highlightId===b.id;
            const isStructural=e.type==="PARENT_FOLDER"||e.type==="CONTAINS_FOLDER";
            return(
              <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={c}
                strokeWidth={isStructural?0.6:hi?e.weight*3.5:e.weight*1.4}
                strokeOpacity={isStructural?0.25:hi?.85:.25}
                strokeDasharray={e.type==="RELATED_TO"?"5 4":e.type==="CONTAINS_FOLDER"?"3 3":undefined}
                style={{ transition:"stroke-opacity .2s,stroke-width .2s" }}/>
            );
          })}

          {/* Nodes */}
          {visibleNodes.map(n=>{
            if(!n.x||!n.y) return null;
            const hi=hovered===n.id||highlightId===n.id;
            const isFolder=n.nodeType==="folder";
            const r=hi?(n.size||10)+4:(n.size||10);

            return(
              <g key={n.id}
                onMouseEnter={()=>setHovered(n.id)}
                onMouseLeave={()=>setHovered(null)}
                style={{ cursor:"pointer" }}>

                {/* Glow ring */}
                {hi&&!isFolder&&<circle cx={n.x} cy={n.y} r={r+8} fill={n.color} fillOpacity={0.10}/>}

                {/* Shape: square for folders, circle for files */}
                {isFolder
                  ? <rect x={n.x-r} y={n.y-r} width={r*2} height={r*2} rx={3}
                      fill={hi?`${T.violet}44`:`${T.violet}26`}
                      stroke={hi?T.violet:`${T.violet}b3`}
                      strokeWidth={hi?1.7:1.2}
                      style={{ transition:"all .18s" }}/>
                  : <circle cx={n.x} cy={n.y} r={r} fill={n.color} fillOpacity={hi?1:.7}
                      filter={hi?"url(#glow)":undefined}
                      style={{ transition:"all .18s" }}/>
                }

                {/* Tooltip */}
                {hi&&(
                  <g>
                    <rect x={n.x+r+8} y={n.y-11} rx={6}
                      width={Math.min((n.label||"").length*6+16,200)} height={21}
                      fill={T.surface} stroke={T.borderMd} strokeWidth={1}/>
                    <text x={n.x+r+16} y={n.y+3.5}
                      fill={isFolder?T.violet:T.text} fontSize={10}
                      fontFamily="'DM Sans',sans-serif" fontWeight="500">
                      {(n.label||"").length>27?(n.label||"").slice(0,25)+"…":(n.label||"")}
                      {isFolder?" 📁":""}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div style={{ display:"flex",gap:14,marginTop:11,flexWrap:"wrap",flexShrink:0,alignItems:"center" }}>
        {[
          ["VERSION_OF", T.blue,  false],
          ["CO_LOCATED", T.teal,  false],
          ["RELATED_TO", T.amber, true ],
          ["FOLDERS",    T.faint, false],
        ].map(([label,color,dashed])=>(
          <div key={label} style={{ display:"flex",alignItems:"center",gap:5 }}>
            <div style={{ width:16, height:2, borderRadius:1,
              background:dashed?"transparent":color,
              ...(dashed?{borderTop:`2px dashed ${color}`}:{}) }}/>
            <span style={{ fontSize:10,color:T.faint }}>{label.replace(/_/g," ")}</span>
          </div>
        ))}
        <div style={{ display:"flex",alignItems:"center",gap:5,marginLeft:4 }}>
          <div style={{ width:10,height:10,background:`${T.violet}33`,border:`1px solid ${T.violet}cc`,borderRadius:2 }}/>
          <span style={{ fontSize:10,color:T.faint }}>folder node</span>
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

  const highlightId = selected&&graphData
    ? graphData.nodes.find(n=>n.label.toLowerCase().includes(selected.file.split(".")[0].toLowerCase().slice(0,12)))?.id
    : null;
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
              <div style={{ fontSize:9,color:T.faint,letterSpacing:"0.05em" }}>LOCAL · PRIVATE</div>
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