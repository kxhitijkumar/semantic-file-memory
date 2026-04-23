import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { forceSimulation, forceManyBody, forceCollide, forceLink, forceCenter, forceX, forceY } from "d3-force";

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

const FILE_GLYPH = {
  pdf: "◈",
  md: "✎",
  docx: "▤",
  py: "λ",
  txt: "≡",
  json: "{}",
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
    width: min(420px, calc(100vw - 32px));
    height: min(640px, calc(100vh - 120px));
    z-index: 1000;
    border-radius: 22px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: linear-gradient(180deg, ${T.surface} 0%, ${T.bg} 100%);
    border: 1px solid ${T.borderMd};
    box-shadow: 0 24px 80px rgba(0,0,0,.7), 0 0 0 1px rgba(79,128,255,.08), inset 0 1px 0 rgba(255,255,255,.04);
    animation: popUp .28s cubic-bezier(.34,1.4,.64,1) both;
  }
  .chat-popup::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(500px 160px at 100% 0%, rgba(46,232,200,.12), transparent 70%),
      radial-gradient(420px 180px at 0% 100%, rgba(79,128,255,.12), transparent 70%);
    opacity: .85;
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
  @media (max-width: 720px) {
    .chat-popup {
      right: 8px;
      left: 8px;
      bottom: 78px;
      width: auto;
      height: min(700px, calc(100vh - 92px));
      border-radius: 18px;
    }
    .chat-fab {
      right: 12px;
      bottom: 12px;
    }
  }
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
function ResultCard({ result, selected, onClick, onAsk, onView, index }) {
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
        <div style={{ marginTop:10,display:"flex",gap:8 }}>
          <button onClick={e=>{e.stopPropagation();onView(result);}}
            style={{ flex:1,padding:"7px 12px",background:T.tealDim,
              border:`1px solid ${T.teal}44`,borderRadius:8,color:T.teal,fontSize:11,fontWeight:600,
              cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"all .15s",fontFamily:"inherit" }}
            onMouseEnter={e=>{e.currentTarget.style.background=`${T.teal}22`;}}
            onMouseLeave={e=>{e.currentTarget.style.background=T.tealDim;}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            View File
          </button>
          <button onClick={e=>{e.stopPropagation();onAsk(result);}}
            style={{ flex:1,padding:"7px 12px",background:T.blueDim,
              border:`1px solid ${T.blue}44`,borderRadius:8,color:T.blue,fontSize:11,fontWeight:600,
              cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"all .15s",fontFamily:"inherit" }}
            onMouseEnter={e=>{e.currentTarget.style.background=`${T.blue}22`;}}
            onMouseLeave={e=>{e.currentTarget.style.background=T.blueDim;}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Ask about this file
          </button>
        </div>
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

/* ─── File Viewer Modal ──────────────────────────────────────────────────── */
function FileViewer({ open, file, content, loading, onClose }) {
  if (!open) return null;
  
  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:999,backdropFilter:"blur(2px)",
        animation:"fadeUp .2s ease",pointerEvents:open?"auto":"none"
      }}/>
      
      {/* Modal */}
      <div style={{
        position:"fixed",inset:"5%",zIndex:1000,borderRadius:18,overflow:"hidden",
        display:"flex",flexDirection:"column",background:T.surface,border:`1px solid ${T.borderMd}`,
        boxShadow:`0 24px 80px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.04)`,
        animation:"popUp .28s cubic-bezier(.34,1.4,.64,1) both"
      }}>
        {/* Header */}
        <div style={{
          display:"flex",alignItems:"center",justifyContent:"space-between",
          padding:"16px 24px",borderBottom:`1px solid ${T.border}`,background:T.raised,flexShrink:0
        }}>
          <div style={{ display:"flex",alignItems:"center",gap:12,minWidth:0 }}>
            {file&&<div style={{
              width:32,height:32,borderRadius:8,background:EXT_COLOR[file.ext]?.bg,
              display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0
            }}>
              <span style={{ fontSize:9,fontWeight:700,color:EXT_COLOR[file.ext]?.fg,fontFamily:"'DM Mono'" }}>
                {file.ext.toUpperCase()}
              </span>
            </div>}
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:13,fontWeight:600,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                {file?.file}
              </div>
              <div style={{ fontSize:11,color:T.faint,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                {file?.path}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background:"transparent",border:"none",cursor:"pointer",padding:8,display:"flex",
            alignItems:"center",justifyContent:"center",color:T.muted,flexShrink:0,
            transition:"color .15s",fontSize:18
          }} onMouseEnter={e=>e.currentTarget.style.color=T.text}
          onMouseLeave={e=>e.currentTarget.style.color=T.muted}>
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex:1,overflowY:"auto",padding:"20px 24px",fontFamily:"'DM Mono',monospace",
          fontSize:12,lineHeight:1.6,color:T.text
        }}>
          {loading ? (
            <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:T.muted }}>
              <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                <div style={{
                  width:14,height:14,border:`2px solid ${T.faint}`,borderTopColor:T.teal,
                  borderRadius:"50%",animation:"spin .7s linear infinite"
                }}/>
                Loading file...
              </div>
            </div>
          ) : (
            <pre style={{ margin:0,whiteSpace:"pre-wrap",wordWrap:"break-word",color:T.text }}>
              {content}
            </pre>
          )}
        </div>
      </div>
    </>
  );
}

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
  const positionsRef = useRef({});

  useEffect(() => {
    if (!graphData || !graphData.nodes.length) return;

    const rootSize = Math.max(320, Math.min(W, H));

    const clusterKeyFor = (node) => {
      if (node.nodeType === "folder") {
        return `folder:${(node.relPath || node.label || "root").split("/")[0] || "root"}`;
      }
      const parent = (node.folder || node.path || "").replace(/\\/g, "/");
      const parts = parent.split("/").filter(Boolean);
      return `file:${parts.slice(0, 2).join("/") || node.ext || "files"}`;
    };

    const clusterKeys = [];
    const clusterIndex = new Map();

    // Build working node set — seed positions near cluster anchors first.
    const nodes = graphData.nodes
      .filter(n => showFolders || n.nodeType !== "folder")
      .map((n, i, arr) => {
        const existing = positionsRef.current[n.id];
        const clusterKey = clusterKeyFor(n);
        if (!clusterIndex.has(clusterKey)) {
          clusterIndex.set(clusterKey, clusterKeys.length);
          clusterKeys.push(clusterKey);
        }
        const clusterId = clusterIndex.get(clusterKey);
        const ring = Math.floor(clusterId / Math.max(1, Math.floor((2 * Math.PI * rootSize) / 220)));
        const ringCapacity = Math.max(6, Math.floor((2 * Math.PI * (rootSize * 0.24 + ring * 92)) / 220));
        const slot = clusterId % ringCapacity;
        const angle = (slot / ringCapacity) * Math.PI * 2 - Math.PI / 2 + ring * 0.28;
        const radius = rootSize * 0.22 + ring * 94;
        const anchorX = W / 2 + Math.cos(angle) * radius;
        const anchorY = H / 2 + Math.sin(angle) * radius;
        const jitter = 14 + (i % 7) * 3;
        return {
          ...n,
          x: existing?.x ?? anchorX + Math.cos(i * 1.618) * jitter,
          y: existing?.y ?? anchorY + Math.sin(i * 1.618) * jitter,
          vx: 0,
          vy: 0,
          clusterKey,
          clusterId,
          anchorX,
          anchorY,
        };
      });

    const nodeMap = {};
    nodes.forEach(n => (nodeMap[n.id] = n));

    const edges = graphData.edges.filter(e => {
      if (!showFolders && (e.type === "PARENT_FOLDER" || e.type === "CONTAINS_FOLDER")) return false;
      if (filter === "ALL") return true;
      return e.type === filter;
    }).filter(e => nodeMap[e.from] && nodeMap[e.to]);

    // d3-force link expects source/target keys, while backend edges use from/to.
    const simLinks = edges.map(e => ({ ...e, source: e.from, target: e.to }));

    const clusterAnchors = new Map();
    clusterKeys.forEach((key, index) => {
      const ring = Math.floor(index / Math.max(1, Math.floor((2 * Math.PI * rootSize) / 240)));
      const ringCapacity = Math.max(6, Math.floor((2 * Math.PI * (rootSize * 0.24 + ring * 92)) / 240));
      const slot = index % ringCapacity;
      const phase = ring * 0.28;
      const radius = rootSize * 0.24 + ring * 92;
      const angle = (slot / ringCapacity) * Math.PI * 2 - Math.PI / 2 + phase;
      clusterAnchors.set(key, {
        x: W / 2 + Math.cos(angle) * radius,
        y: H / 2 + Math.sin(angle) * radius,
      });
    });

    const linkDistance = (link) => {
      if (link.type === "VERSION_OF") return 120;
      if (link.type === "CO_LOCATED") return 140;
      if (link.type === "RELATED_TO") return 180;
      if (link.type === "SHARES_ENTITY") return 150;
      if (link.type === "SAME_TOPIC") return 165;
      if (link.type === "PARENT_FOLDER") return 95;
      if (link.type === "CONTAINS_FOLDER") return 105;
      return 130;
    };

    const linkStrength = (link) => {
      if (link.type === "VERSION_OF") return 0.38;
      if (link.type === "CO_LOCATED") return 0.26;
      if (link.type === "RELATED_TO") return 0.12;
      if (link.type === "SHARES_ENTITY") return 0.20;
      if (link.type === "SAME_TOPIC") return 0.14;
      if (link.type === "PARENT_FOLDER") return 0.42;
      if (link.type === "CONTAINS_FOLDER") return 0.30;
      return 0.18;
    };

    const simulation = forceSimulation(nodes)
      .force("center", forceCenter(W / 2, H / 2))
      .force("charge", forceManyBody()
        .strength(d => (d.nodeType === "folder" ? -260 : -160))
        .distanceMax(Math.max(W, H) * 1.1))
      .force("collide", forceCollide().radius(d => (d.nodeType === "folder" ? 18 : (d.size || 10) + 5)).iterations(2))
      .force("x", forceX(d => clusterAnchors.get(d.clusterKey)?.x ?? W / 2).strength(0.08))
      .force("y", forceY(d => clusterAnchors.get(d.clusterKey)?.y ?? H / 2).strength(0.08))
      .force("link", forceLink(simLinks)
        .id(d => d.id)
        .distance(linkDistance)
        .strength(linkStrength))
      .alphaMin(0.015)
      .alphaDecay(nodes.length > 250 ? 0.03 : 0.02)
      .velocityDecay(0.34);

    const tickStride = nodes.length > 450 ? 8 : nodes.length > 250 ? 6 : nodes.length > 150 ? 4 : 2;
    const maxTicks = nodes.length > 450 ? 420 : nodes.length > 250 ? 520 : 700;
    let tick = 0;
    let lastCommitAt = 0;
    simulation.on("tick", () => {
      tick += 1;
      if (tick % tickStride !== 0) return;
      const now = performance.now();
      if (now - lastCommitAt < 28) return;
      const snap = {};
      for (const n of nodes) {
        snap[n.id] = { x: n.x, y: n.y };
      }
      positionsRef.current = snap;
      setPositions(snap);
      lastCommitAt = now;

      // End simulation earlier on large graphs to avoid long main-thread pressure.
      if (tick >= maxTicks || simulation.alpha() < 0.028) {
        simulation.stop();
      }
    });

    simRef.current = simulation;
    return () => simulation.stop();
  }, [graphData, filter, showFolders, W, H]);

  return positions;
}

/* ─── Graph panel ─────────────────────────────────────────────────────────── */
function GraphPanel({
  graphData,
  highlightId,
  onNodeSelect,
}) {
  const INITIAL_ZOOM = 1.1;
  const containerRef  = useRef(null);
  const [dims, setDims]           = useState({ w: 700, h: 480 });
  const [filter, setFilter]       = useState("ALL");
  const [showFolders, setShowFolders] = useState(true);
  const [hovered, setHovered]     = useState(null);
  const [selected, setSelected]   = useState(null);
  const [pan, setPan]             = useState({ x: 0, y: 0 });
  const [zoom, setZoom]           = useState(INITIAL_ZOOM);
  const [isDragging, setIsDragging]   = useState(false);
  const panStart = useRef(null);

  // Measure container
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => {
      setDims({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const positions = useForceGraph(graphData, filter, showFolders, dims.w, dims.h);
  const inspectorOverlay = dims.w < 980;
  const inspectorWidth = inspectorOverlay
    ? Math.max(240, Math.min(320, Math.round(dims.w * 0.42)))
    : 280;

  if (!graphData || !graphData.nodes.length)
    return <Empty icon="⬡" title="No graph data" sub="Index some documents first — the knowledge graph will appear here" />;

  const graphNodeTotal = graphData.nodes.length;
  const graphEdgeTotal = graphData.edges.length;
  const denseGraph = graphNodeTotal > 180 || graphEdgeTotal > 700;

  const merged = {};
  graphData.nodes.forEach(n => {
    const p = positions[n.id];
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

  const MAX_RENDER_NODES = denseGraph ? 420 : 900;
  const MAX_RENDER_EDGES = denseGraph ? 1200 : 2800;

  let renderNodes = visibleNodes;
  if (visibleNodes.length > MAX_RENDER_NODES) {
    const degree = {};
    visibleEdges.forEach(e => {
      degree[e.from] = (degree[e.from] || 0) + 1;
      degree[e.to] = (degree[e.to] || 0) + 1;
    });

    const prioritized = [...visibleNodes].sort((a, b) => {
      const aPinned = (a.id === selected || a.id === hovered || a.id === highlightId) ? 1 : 0;
      const bPinned = (b.id === selected || b.id === hovered || b.id === highlightId) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;

      const aScore = (degree[a.id] || 0) * 3 + (a.size || 0) + (a.nodeType === "folder" ? 0 : 5);
      const bScore = (degree[b.id] || 0) * 3 + (b.size || 0) + (b.nodeType === "folder" ? 0 : 5);
      return bScore - aScore;
    });
    renderNodes = prioritized.slice(0, MAX_RENDER_NODES);
  }

  const renderNodeIds = new Set(renderNodes.map(n => n.id));
  const renderEdges = visibleEdges
    .filter(e => renderNodeIds.has(e.from) && renderNodeIds.has(e.to))
    .slice(0, MAX_RENDER_EDGES);

  const fileCount = visibleNodes.filter(n => n.nodeType !== "folder").length;
  const folderCount = visibleNodes.filter(n => n.nodeType === "folder").length;

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

  const showAllLabels = (!denseGraph && renderNodes.length < 360) || (zoom > 1.45 && renderNodes.length < 520);

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
    panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
    setIsDragging(false);
  };

  const handleCanvasMouseMove = (e) => {
    if (!panStart.current) return;
    const dx = e.clientX - panStart.current.mx;
    const dy = e.clientY - panStart.current.my;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) setIsDragging(true);
    setPan({ x: panStart.current.px + dx, y: panStart.current.py + dy });
  };

  const handleCanvasMouseUp = () => {
    panStart.current = null;
    setIsDragging(false);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    setZoom(z => Math.max(0.3, Math.min(3, z * factor)));
  };

  const handleNodeClick = (e, nodeId) => {
    e.stopPropagation();
    if (isDragging) return;
    setSelected(s => s === nodeId ? null : nodeId);
    if (onNodeSelect) onNodeSelect(nodeMap[nodeId]);
  };

  const handleZoomBtn = (dir) => setZoom(z => Math.max(0.3, Math.min(3, z * (dir > 0 ? 1.25 : 0.8))));
  const handleReset   = () => { setZoom(INITIAL_ZOOM); setPan({ x: 0, y: 0 }); };

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
  const activeEdgeLabel = filter === "ALL" ? "All relationships" : (EDGE_META[filter]?.label || filter.replace(/_/g, " "));

  const FILE_ICON_PATH = "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6";
  const FOLDER_ICON_PATH = "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z";

  // Icon components
  const ZoomInIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg>;
  const ZoomOutIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M8 11h6"/></svg>;
  const ResetIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>;
  const FilterIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>;
  const NetworkIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="3" r="1"/><circle cx="5" cy="3" r="1"/><circle cx="21" cy="14" r="1"/><circle cx="3" cy="21" r="1"/><path d="M12 13v8M12 13L6.5 7.5M12 13l5.5-5.5M20 4l1 8M6 4l-1 8M3.5 20.5l7.5-7.5M20 13v8"/></svg>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px",
        borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        background: `linear-gradient(180deg, ${T.panel} 0%, ${T.surface} 100%)` }}>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 10px",
            borderRadius: 10, background: T.raised, border: `1px solid ${T.borderMd}` }}>
            <NetworkIcon />
            <span style={{ fontSize: 10, color: T.faint, letterSpacing: "0.08em", fontWeight: 700, textTransform: "uppercase" }}>Graph View</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 10,
            background: T.raised, border: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 10, color: T.faint }}>Nodes</span>
            <span style={{ fontSize: 11, color: T.text, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{visibleNodes.length}</span>
            <span style={{ fontSize: 10, color: T.border }}>·</span>
            <span style={{ fontSize: 10, color: T.faint }}>Files {fileCount}</span>
            <span style={{ fontSize: 10, color: T.faint }}>Folders {folderCount}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 10,
            background: T.raised, border: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 10, color: T.faint }}>Edges</span>
            <span style={{ fontSize: 11, color: T.text, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{renderEdges.length}</span>
            <span style={{ fontSize: 10, color: T.faint }}>{activeEdgeLabel}</span>
          </div>

          <div style={{ flex: 1 }} />

          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: 3,
            borderRadius: 10, border: `1px solid ${T.border}`, background: T.raised }}>
            <button onClick={() => handleZoomBtn(-1)}
              style={{ width: 28, height: 28, borderRadius: 7, border: "none",
                background: "transparent", color: T.muted, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "inherit", transition: "all .15s" }}
              onMouseEnter={e => { e.currentTarget.style.color = T.text; e.currentTarget.style.background = T.panel; }}
              onMouseLeave={e => { e.currentTarget.style.color = T.muted; e.currentTarget.style.background = "transparent" }}
              title="Zoom out">
              <ZoomOutIcon />
            </button>
            <button onClick={() => handleZoomBtn(1)}
              style={{ width: 28, height: 28, borderRadius: 7, border: "none",
                background: "transparent", color: T.muted, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "inherit", transition: "all .15s" }}
              onMouseEnter={e => { e.currentTarget.style.color = T.text; e.currentTarget.style.background = T.panel; }}
              onMouseLeave={e => { e.currentTarget.style.color = T.muted; e.currentTarget.style.background = "transparent" }}
              title="Zoom in">
              <ZoomInIcon />
            </button>
            <button onClick={handleReset}
              style={{ fontSize: 10, fontWeight: 600, padding: "6px 10px", borderRadius: 7,
                border: "none", background: T.panel, color: T.muted,
                cursor: "pointer", fontFamily: "inherit", transition: "all .15s", display: "flex", alignItems: "center", gap: 5 }}
              onMouseEnter={e => { e.currentTarget.style.color = T.text; }}
              onMouseLeave={e => { e.currentTarget.style.color = T.muted; }}
              title="Reset zoom and pan">
              <ResetIcon />
              Reset
            </button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 2 }}>
            <FilterIcon />
            <span style={{ fontSize: 9, color: T.faint, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Edges</span>
          </div>

          {["ALL", "VERSION_OF", "CO_LOCATED", "RELATED_TO", "SHARES_ENTITY", "SAME_TOPIC"].map(f => {
            const active = filter === f;
            const c = EDGE_COLOR[f] || T.blue;
            return (
              <button key={f} onClick={() => setFilter(f)}
                style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", padding: "5px 12px",
                  borderRadius: 16, border: `1.2px solid ${active ? c : T.border}`,
                  background: active ? `${c}18` : T.panel,
                  color: active ? c : T.muted, cursor: "pointer", fontFamily: "inherit",
                  transition: "all .18s", boxShadow: active ? `0 0 0 2px ${c}11` : "none" }}
                title={f === "ALL" ? "Show all relationships" : `Filter by ${f.replace(/_/g, " ").toLowerCase()}`}>
                {f === "ALL" ? "All" : f.replace(/_/g, " ")}
              </button>
            );
          })}

          <button onClick={() => setShowFolders(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 600,
              padding: "5px 12px", borderRadius: 16, cursor: "pointer", fontFamily: "inherit",
              border: `1.2px solid ${showFolders ? T.teal : T.border}`,
              background: showFolders ? `${T.teal}15` : T.panel,
              color: showFolders ? T.teal : T.muted, transition: "all .18s",
              boxShadow: showFolders ? `0 0 0 2px ${T.teal}12` : "none" }}
            title="Toggle folder nodes">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d={FOLDER_ICON_PATH} />
            </svg>
            Folders
          </button>
        </div>
      </div>

      {/* ── Canvas + inspector ── */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden", position: "relative" }}>

        {/* SVG canvas */}
        <div ref={containerRef} style={{ flex: 1, position: "relative", overflow: "hidden",
          background: `radial-gradient(ellipse at 15% 20%, ${T.panel} 0%, ${T.bg} 55%), radial-gradient(ellipse at 85% 85%, ${T.raised} 0%, transparent 60%)`,
          cursor: isDragging ? "grabbing" : "grab" }}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          onWheel={handleWheel}>

          <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage: `linear-gradient(${T.border}20 1px, transparent 1px), linear-gradient(90deg, ${T.border}20 1px, transparent 1px)`,
            backgroundSize: "36px 36px", opacity: 0.35 }} />

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

              {/* Focus rings */}
              <circle cx={dims.w / 2} cy={dims.h / 2} r={Math.max(64, Math.min(130, Math.max(320, Math.min(dims.w, dims.h)) * 0.18))}
                fill="none" stroke={T.border} strokeWidth="1" strokeDasharray="3 6" strokeOpacity="0.35" />
              <circle cx={dims.w / 2} cy={dims.h / 2} r={Math.max(140, Math.min(320, Math.max(320, Math.min(dims.w, dims.h)) * 0.38))}
                fill="none" stroke={T.border} strokeWidth="1" strokeDasharray="5 8" strokeOpacity="0.28" />

              {/* ── Edges ── */}
              {renderEdges.map((e, i) => {
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
                const edgeFade = denseGraph && !isActive && !selected ? 0.12 : opacity;

                return (
                  <path key={i}
                    d={edgePath(a.x, a.y, b.x, b.y, e.type)}
                    fill="none"
                    stroke={meta.color}
                    strokeWidth={strokeW}
                    strokeOpacity={edgeFade}
                    strokeDasharray={meta.dash || undefined}
                    markerEnd={!isStructural ? `url(#arrow-${e.type})` : undefined}
                    style={{ transition: "stroke-opacity .25s, stroke-width .25s" }}
                  />
                );
              })}

              {/* ── Nodes ── */}
              {renderNodes.map(n => {
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
                    {!isFolder && r >= 12 && !denseGraph && (
                      <text x={x} y={y + 4} textAnchor="middle"
                        fill="#fff" fontSize={r > 13 ? 8 : 7} fontWeight="700"
                        fontFamily="'DM Mono',monospace" fillOpacity={0.9}>
                        {(n.ext || "").toUpperCase().slice(0, 4)}
                      </text>
                    )}

                    {/* Label — always shown for selected/hovered, shown when not dimmed for others */}
                    {(isSel || isHov || (showAllLabels && !dimmed && !isFolder)) && (
                      <text x={x} y={y + r + 13} textAnchor="middle"
                        fill={dimmed ? T.faint : isFolder ? T.muted : T.text}
                        fontSize={isFolder ? 9 : (denseGraph ? 9 : 10)}
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

          <div style={{ position: "absolute", bottom: 12, left: 12, display: "flex", flexDirection: "column", gap: 6, pointerEvents: "none" }}>
            <div style={{ fontSize: 10, color: T.muted, fontFamily: "'DM Mono',monospace",
              background: `${T.surface}cc`, border: `1px solid ${T.border}`, borderRadius: 8, padding: "5px 8px" }}>
              Scroll to zoom · Drag canvas · Nodes are fixed
            </div>
            <div style={{ fontSize: 10, color: T.faint, fontFamily: "'DM Mono',monospace",
              background: `${T.surface}cc`, border: `1px solid ${T.border}`, borderRadius: 8, padding: "5px 8px", width: "fit-content" }}>
              Zoom {Math.round(zoom * 100)}%
            </div>
            {denseGraph && (
              <div style={{ fontSize: 10, color: T.amber, fontFamily: "'DM Mono',monospace",
                background: `${T.amber}14`, border: `1px solid ${T.amber}28`, borderRadius: 8, padding: "5px 8px", width: "fit-content" }}>
                Dense graph: force layout + reduced labels for stability
              </div>
            )}
          </div>
        </div>

        {/* ── Node inspector panel ── */}
        {selectedNode && (
          <div className="fu" style={{
            width: inspectorWidth,
            flexShrink: 0,
            borderLeft: `1px solid ${T.border}`,
            background: inspectorOverlay ? `${T.surface}f5` : T.surface,
            overflowY: "auto",
            padding: "16px 14px",
            display: "flex",
            flexDirection: "column",
            ...(inspectorOverlay
              ? {
                  position: "absolute",
                  top: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 6,
                  boxShadow: "-16px 0 30px rgba(0,0,0,.35)",
                  backdropFilter: "blur(4px)",
                }
              : {}),
          }}>

            {/* Header with icon */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <NetworkIcon />
                <span style={{ fontSize: 11, color: T.faint, letterSpacing: "0.1em", fontWeight: 700, textTransform: "uppercase" }}>Details</span>
              </div>
              <button onClick={() => setSelected(null)}
                style={{ background: T.raised, border: `1px solid ${T.border}`, cursor: "pointer",
                  color: T.muted, padding: 4, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, transition: "all .15s" }}
                onMouseEnter={e => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.borderMd; }}
                onMouseLeave={e => { e.currentTarget.style.color = T.muted; e.currentTarget.style.borderColor = T.border; }}
                title="Close">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Node identity card */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16, padding: "12px", background: T.raised, borderRadius: 10, border: `1px solid ${T.borderMd}` }}>
              {selectedNode.nodeType === "folder" ? (
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${T.teal}15`, border: `1.5px solid ${T.teal}30`,
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.teal} strokeWidth="2" strokeLinecap="round">
                    <path d={FOLDER_ICON_PATH} />
                  </svg>
                </div>
              ) : (
                <div style={{ width: 40, height: 40, borderRadius: 10,
                  background: (EXT_COLOR[selectedNode.ext] || { bg: T.blueDim }).bg,
                  border: `1.5px solid ${(EXT_COLOR[selectedNode.ext] || { fg: T.blue }).fg}40`,
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: (EXT_COLOR[selectedNode.ext] || { fg: T.blue }).fg,
                    fontFamily: "'DM Mono',monospace" }}>
                    {(selectedNode.ext || "?").toUpperCase().slice(0, 3)}
                  </span>
                </div>
              )}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text, wordBreak: "break-word", lineHeight: 1.3, marginBottom: 5 }}>
                  {selectedNode.label}
                </div>
                <div style={{ fontSize: 9, color: T.teal, fontWeight: 600, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {selectedNode.nodeType === "folder" ? "📁 Folder" : selectedNode.docType || "File"}
                </div>
                {selectedNode.relPath && (
                  <div style={{ fontSize: 8, color: T.muted, marginTop: 4, fontFamily: "'DM Mono',monospace",
                    wordBreak: "break-all", lineHeight: 1.4, padding: "6px 8px", background: T.panel, borderRadius: 6 }}>
                    {selectedNode.relPath}
                  </div>
                )}
              </div>
            </div>

            {/* Connections */}
            {selectedEdges.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: T.faint, letterSpacing: "0.1em", marginBottom: 10, fontWeight: 700, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="3" r="1"/><circle cx="5" cy="3" r="1"/><path d="M12 13v4M9 19l3-3v0"/></svg>
                  CONNECTIONS
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {selectedEdges.slice(0, 10).map((e, i) => {
                    const otherId = e.from === selected ? e.to : e.from;
                    const other   = nodeMap[otherId];
                    const meta    = EDGE_META[e.type] || EDGE_META.RELATED_TO;
                    const isOut   = e.from === selected;
                    if (!other) return null;
                    return (
                      <div key={i}
                        onClick={() => setSelected(otherId)}
                        style={{ display: "flex", flexDirection: "column", gap: 6, padding: "9px 10px",
                          background: T.panel, borderRadius: 9, border: `1px solid ${T.border}`,
                          cursor: "pointer", transition: "all .18s" }}
                        onMouseEnter={ev => { ev.currentTarget.style.borderColor = meta.color; ev.currentTarget.style.background = `${meta.color}08`; }}
                        onMouseLeave={ev => { ev.currentTarget.style.borderColor = T.border; ev.currentTarget.style.background = T.panel; }}>
                        {/* Top row: color dot + label */}
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: meta.color, flexShrink: 0, marginTop: 2 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2 }}>
                              {other.label}
                            </div>
                            <div style={{ fontSize: 9, color: meta.color, fontFamily: "'DM Mono',monospace", display: "flex", alignItems: "center", gap: 3 }}>
                              <span style={{ fontSize: 10 }}>{isOut ? "→" : "←"}</span> {e.type.replace(/_/g, " ").toLowerCase()}
                            </div>
                          </div>
                        </div>
                        {/* Show shared entities inline for SHARES_ENTITY edges */}
                        {e.type === "SHARES_ENTITY" && e.shared && e.shared.length > 0 && (
                          <div style={{ display: "flex", gap: 3, flexWrap: "wrap", paddingLeft: 16 }}>
                            {e.shared.slice(0, 2).map((s, si) => (
                              <span key={si} style={{ fontSize: 8, padding: "2px 6px", borderRadius: 6,
                                background: `${T.coral}18`, color: T.coral, border: `0.5px solid ${T.coral}40`,
                                fontFamily: "'DM Mono',monospace" }}>
                                {s.length > 12 ? s.slice(0, 10) + "…" : s}
                              </span>
                            ))}
                            {e.shared.length > 2 && <span style={{ fontSize: 8, color: T.faint }}>+{e.shared.length - 2}</span>}
                          </div>
                        )}
                        {/* Show cluster for SAME_TOPIC edges */}
                        {e.type === "SAME_TOPIC" && e.cluster != null && (
                          <div style={{ paddingLeft: 16 }}>
                            <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 6,
                              background: `${T.violet}18`, color: T.violet, border: `0.5px solid ${T.violet}40`,
                              fontFamily: "'DM Mono',monospace" }}>
                              ⊙ topic {e.cluster}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {selectedEdges.length > 10 && (
                    <div style={{ fontSize: 9, color: T.faint, textAlign: "center", padding: "6px 0", opacity: 0.7 }}>
                      +{selectedEdges.length - 10} more connections
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Entity & cluster summary for file nodes */}
            {selectedNode && selectedNode.nodeType === "file" && (
              <>
                {selectedNode.keywords && selectedNode.keywords.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: T.faint, letterSpacing: "0.1em", marginBottom: 8, fontWeight: 700, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17-7.17a2 2 0 0 0-2.83 0L2 12a2 2 0 0 0 2.83 2.83l7.17-7.17"/><line x1="9" y1="9" x2="13.5" y2="4.5"/></svg>
                      Keywords
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {selectedNode.keywords.map((kw, i) => (
                        <span key={i} style={{ fontSize: 9, padding: "3px 7px", borderRadius: 7,
                          background: T.raised, color: T.text, border: `1px solid ${T.borderMd}`,
                          fontFamily: "'DM Mono',monospace", fontWeight: 500 }}>
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {selectedNode.topNames && selectedNode.topNames.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: T.faint, letterSpacing: "0.1em", marginBottom: 8, fontWeight: 700, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      Entities
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {selectedNode.topNames.map((nm, i) => (
                        <span key={i} style={{ fontSize: 9, padding: "3px 7px", borderRadius: 7,
                          background: `${T.coral}12`, color: T.coral,
                          border: `1px solid ${T.coral}30`,
                          fontFamily: "'DM Mono',monospace", fontWeight: 500 }}>
                          {nm}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {selectedNode.cluster != null && (
                  <div style={{ marginTop: 0, padding: "10px", background: `${T.violet}08`, border: `1px solid ${T.violet}30`, borderRadius: 9 }}>
                    <div style={{ fontSize: 10, color: T.faint, letterSpacing: "0.1em", marginBottom: 6, fontWeight: 700, textTransform: "uppercase" }}>
                      <svg style={{ display: "inline", marginRight: 5 }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="3" r="1"/><circle cx="5" cy="3" r="1"/><circle cx="21" cy="14" r="1"/><circle cx="3" cy="21" r="1"/><path d="M12 13v8M12 13L6.5 7.5M12 13l5.5-5.5M20 4l1 8M6 4l-1 8"/></svg>
                      Topic
                    </div>
                    <span style={{ fontSize: 11, padding: "5px 10px", borderRadius: 8,
                      background: `${T.violet}18`, color: T.violet,
                      border: `1px solid ${T.violet}40`,
                      fontFamily: "'DM Mono',monospace", fontWeight: 600, display: "inline-block" }}>
                      ⊙ Cluster {selectedNode.cluster}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Legend ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 14px",
        borderTop: `1px solid ${T.border}`, flexShrink: 0, flexWrap: "wrap",
        background: `linear-gradient(0deg, ${T.panel} 0%, ${T.surface} 100%)` }}>
        <span style={{ fontSize: 9, color: T.faint, letterSpacing: "0.09em", fontWeight: 700, textTransform: "uppercase" }}>Legend</span>
        {[
          ["Version of",     T.blue,   false],
          ["Co-located",     T.teal,   false],
          ["Related to",     T.amber,  true ],
          ["Shares entity",  T.coral,  false],
          ["Same topic",     T.violet, true ],
          ["Folder similar", T.green,  true ],
        ].map(([label, color, dashed]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 7px",
            borderRadius: 7, border: `1px solid ${T.border}`, background: T.raised }}>
            <div style={{ width: 16, height: 2, borderRadius: 1,
              background: dashed ? "transparent" : color,
              ...(dashed ? { borderTop: `2px dashed ${color}` } : {}) }} />
            <span style={{ fontSize: 10, color: T.faint }}>{label}</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 7px",
          borderRadius: 7, border: `1px solid ${T.border}`, background: T.raised }}>
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

function SimilarityPanel() {
  const [files, setFiles] = useState([]);
  const [selectedPaths, setSelectedPaths] = useState([]);
  const [query, setQuery] = useState("");
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const loadFiles = useCallback(async () => {
    setLoadingFiles(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE}/files`);
      const data = await res.json();
      const next = (data.files || []).sort((a, b) => a.path.localeCompare(b.path));
      setFiles(next);
      const validPaths = new Set(next.map(f => f.path));
      setSelectedPaths(prev => prev.filter(path => validPaths.has(path)));
    } catch {
      setErrorMsg("Could not load files for similarity comparison.");
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const togglePath = (path) => {
    setSelectedPaths(prev => prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]);
  };

  const selectFiltered = () => {
    const subset = filteredFiles.map(f => f.path);
    if (!subset.length) return;
    setSelectedPaths(prev => Array.from(new Set([...prev, ...subset])));
  };

  const clearSelection = () => {
    setSelectedPaths([]);
    setResult(null);
  };

  const runComparison = async () => {
    if (selectedPaths.length < 2 || comparing) return;
    setComparing(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE}/similarity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: selectedPaths }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Similarity request failed.");
      setResult(data);
    } catch (e) {
      setResult(null);
      setErrorMsg(e.message || "Similarity request failed.");
    } finally {
      setComparing(false);
    }
  };

  const filteredFiles = files.filter(f => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return f.path.toLowerCase().includes(q) || f.name.toLowerCase().includes(q);
  });

  const selectedCount = selectedPaths.length;

  return (
    <div style={{ height: "100%", display: "grid", gridTemplateColumns: "360px 1fr", minHeight: 0 }}>
      <aside style={{ borderRight: `1px solid ${T.border}`, background: T.surface, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ padding: "12px", borderBottom: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 }}>
            <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 9, color: T.faint, letterSpacing: "0.08em" }}>TOTAL FILES</div>
              <div style={{ fontSize: 13, color: T.text, fontWeight: 700, marginTop: 2, fontFamily: "'DM Mono',monospace" }}>{files.length}</div>
            </div>
            <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 9, color: T.faint, letterSpacing: "0.08em" }}>SELECTED</div>
              <div style={{ fontSize: 13, color: T.text, fontWeight: 700, marginTop: 2, fontFamily: "'DM Mono',monospace" }}>{selectedCount}</div>
            </div>
          </div>

          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filter files…"
            style={{ width: "100%", background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 12, padding: "8px 10px", outline: "none" }}
          />

          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={selectFiltered}
              style={{ flex: 1, border: `1px solid ${T.border}`, borderRadius: 8, background: T.raised, color: T.muted, fontSize: 11, fontWeight: 600, padding: "7px 10px", cursor: "pointer", fontFamily: "inherit" }}>
              Select filtered
            </button>
            <button onClick={clearSelection}
              style={{ border: `1px solid ${T.border}`, borderRadius: 8, background: T.panel, color: T.muted, fontSize: 11, fontWeight: 600, padding: "7px 10px", cursor: "pointer", fontFamily: "inherit" }}>
              Clear
            </button>
            <button onClick={loadFiles}
              style={{ border: `1px solid ${T.border}`, borderRadius: 8, background: T.panel, color: T.muted, fontSize: 11, fontWeight: 600, padding: "7px 10px", cursor: "pointer", fontFamily: "inherit" }}>
              Refresh
            </button>
          </div>

          <button onClick={runComparison} disabled={selectedCount < 2 || comparing}
            style={{ border: "none", borderRadius: 8, background: (selectedCount < 2 || comparing) ? T.faint : T.blue,
              color: "#fff", fontSize: 11, fontWeight: 700, padding: "8px 12px", cursor: "pointer", fontFamily: "inherit" }}>
            {comparing ? "Comparing…" : "Compare selected files"}
          </button>

          <div style={{ fontSize: 10, color: T.faint, lineHeight: 1.5 }}>
            Select at least 2 files. Scores are context-aware (semantic + chunk alignment), so one or two shared keywords do not inflate similarity.
          </div>
        </div>

        <div style={{ padding: "10px 12px 6px", fontSize: 10, color: T.faint, letterSpacing: "0.08em", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>FILES</span>
          <span style={{ fontFamily: "'DM Mono',monospace" }}>{filteredFiles.length}/{files.length}</span>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 8px 8px" }}>
          {loadingFiles && <div style={{ padding: 10, fontSize: 12, color: T.muted }}>Loading files…</div>}
          {!loadingFiles && filteredFiles.length === 0 && (
            <Empty icon="∅" title="No files" sub="Try a different filter or add files first." />
          )}
          {!loadingFiles && filteredFiles.map((f) => {
            const ec = EXT_COLOR[f.ext] || EXT_COLOR.txt;
            const active = selectedPaths.includes(f.path);
            return (
              <button key={f.path} onClick={() => togglePath(f.path)}
                style={{ width: "100%", marginBottom: 4, textAlign: "left", border: `1px solid ${active ? T.borderHi : T.border}`,
                  borderRadius: 10, background: active ? T.raised : "transparent", color: T.text,
                  padding: "8px 10px", cursor: "pointer", fontFamily: "inherit", transition: "all .15s" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 14, color: active ? T.blue : T.faint, fontSize: 12 }}>{active ? "☑" : "☐"}</span>
                  <Pill label={(f.ext || "txt").toUpperCase()} fg={ec.fg} bg={ec.bg} />
                  <span style={{ fontSize: 12, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{f.name}</span>
                </div>
                <div style={{ marginTop: 4, fontSize: 10, color: T.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.path}</div>
              </button>
            );
          })}
        </div>
      </aside>

      <section style={{ display: "flex", flexDirection: "column", minHeight: 0, background: T.bg }}>
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: T.faint, letterSpacing: "0.08em", flex: 1 }}>
            {result ? `Compared ${result.count} files · ${result.pairs?.length || 0} pairs` : "Run a comparison to view pairwise semantic similarity"}
          </span>
        </div>

        {errorMsg && (
          <div style={{ margin: "10px 12px 0", padding: "8px 10px", borderRadius: 8,
            background: T.coralDim, border: `1px solid ${T.coral}44`, color: T.coral, fontSize: 11 }}>
            {errorMsg}
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {!result && !comparing && (
            <Empty icon="⋈" title="No comparison yet" sub="Select files and click Compare selected files." />
          )}

          {result && result.pairs?.length > 0 && result.pairs.map((pair, index) => {
            const pct = Math.round((pair.score || 0) * 100);
            const rankColor = pct >= 75 ? T.green : pct >= 55 ? T.amber : T.muted;
            const sharedCount = pair.word_overlap?.shared_count || 0;
            const unionCount = pair.word_overlap?.union_count || 0;
            const wordPct = Math.round((pair.word_overlap?.ratio || 0) * 100);
            const commonWords = pair.word_overlap?.top_shared_words?.length
              ? pair.word_overlap.top_shared_words
              : (pair.shared_keywords || []);
            return (
              <div key={`${pair.doc_a}-${pair.doc_b}-${index}`} className="fu"
                style={{ background: T.raised, borderRadius: 12, border: `1px solid ${T.border}`, padding: "12px 13px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: T.text, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {pair.file_a?.filename} ↔ {pair.file_b?.filename}
                  </span>
                  <span style={{ fontSize: 17, color: rankColor, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{pct}</span>
                </div>

                <div style={{ fontSize: 10, color: T.faint, marginBottom: 8 }}>{pair.label}</div>
                <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.65, marginBottom: 10 }}>{pair.explanation}</div>

                {pair.contextual_meaning?.label && (
                  <div style={{ marginBottom: 10, padding: "8px 9px", borderRadius: 8, background: T.panel, border: `1px solid ${T.border}` }}>
                    <div style={{ fontSize: 10, color: T.faint, letterSpacing: "0.08em", marginBottom: 4 }}>CONTEXTUAL MEANING</div>
                    <div style={{ fontSize: 11, color: T.text, fontWeight: 600, marginBottom: 3 }}>{pair.contextual_meaning.label}</div>
                    <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.55 }}>{pair.contextual_meaning.interpretation}</div>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                  <div>
                    <Bar label="Semantic meaning" value={pair.metrics?.embedding_similarity || 0} color={T.blue} />
                    <Bar label="Chunk context" value={pair.metrics?.chunk_alignment || 0} color={T.teal} />
                  </div>
                  <div>
                    <Bar label="Entity overlap" value={pair.metrics?.entity_overlap || 0} color={T.violet} />
                    <Bar label="Keyword overlap" value={pair.metrics?.keyword_overlap || 0} color={T.amber} />
                  </div>
                </div>

                <div style={{ marginTop: 9, fontSize: 11, color: T.muted }}>
                  Common words: <span style={{ color: T.text, fontWeight: 600 }}>{sharedCount}</span>
                  {unionCount > 0 ? ` / ${unionCount} unique words` : ""}
                  {unionCount > 0 ? ` (${wordPct}%)` : ""}
                </div>

                {commonWords.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                    {commonWords.slice(0, 10).map((kw) => (
                      <Pill key={kw} label={kw} fg={T.teal} bg={T.tealDim} size={9} />
                    ))}
                  </div>
                )}

                {pair.contextual_meaning?.shared_themes?.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 10, color: T.faint, letterSpacing: "0.08em", marginBottom: 5 }}>SHARED THEMES</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {pair.contextual_meaning.shared_themes.slice(0, 8).map((theme) => (
                        <Pill key={`theme-${theme}`} label={theme} fg={T.violet} bg={T.violetDim} size={9} />
                      ))}
                    </div>
                  </div>
                )}

                {pair.contextual_meaning?.matched_passages?.length > 0 && (
                  <div style={{ marginTop: 9, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 10, color: T.faint, letterSpacing: "0.08em" }}>MATCHED CONTEXT SNIPPETS</div>
                    {pair.contextual_meaning.matched_passages.slice(0, 2).map((m, idx) => (
                      <div key={`match-${idx}`} style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 9px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                          <span style={{ fontSize: 10, color: T.faint }}>Aligned passage {idx + 1}</span>
                          <span style={{ fontSize: 10, color: T.amber, fontFamily: "'DM Mono',monospace" }}>{Math.round((m.similarity || 0) * 100)}%</span>
                        </div>
                        <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.55 }}>A: {m.snippet_a}</div>
                        <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.55, marginTop: 4 }}>B: {m.snippet_b}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {result && result.matrix?.length > 0 && (
            <div style={{ background: T.raised, borderRadius: 12, border: `1px solid ${T.border}`, padding: "12px 13px" }}>
              <div style={{ fontSize: 10, color: T.faint, letterSpacing: "0.08em", marginBottom: 8 }}>SIMILARITY MATRIX</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", fontSize: 10, color: T.faint, padding: "6px 8px", borderBottom: `1px solid ${T.border}` }}>File</th>
                      {result.matrix.map(col => (
                        <th key={`h-${col.doc_id}`} style={{ textAlign: "center", fontSize: 10, color: T.faint, padding: "6px 8px", borderBottom: `1px solid ${T.border}` }}>
                          {col.filename}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.matrix.map((row, ridx) => (
                      <tr key={`r-${row.doc_id}`}>
                        <td style={{ fontSize: 11, color: T.text, padding: "7px 8px", borderBottom: `1px solid ${T.border}` }}>{row.filename}</td>
                        {(row.values || []).map((value, cidx) => {
                          const pct = Math.round((value || 0) * 100);
                          const color = pct >= 75 ? T.green : pct >= 55 ? T.amber : T.muted;
                          return (
                            <td key={`c-${ridx}-${cidx}`} style={{ textAlign: "center", padding: "7px 8px", borderBottom: `1px solid ${T.border}`, color, fontSize: 11, fontFamily: "'DM Mono',monospace" }}>
                              {pct}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function FileManagerPanel({ onManaged }) {
  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [selectedPath, setSelectedPath] = useState("");
  const [content, setContent] = useState("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [filter, setFilter] = useState("");
  const [showEditableOnly, setShowEditableOnly] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [reindexing, setReindexing] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState(() => new Set(["."]));
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorWrap, setEditorWrap] = useState(true);
  const [editorFontSize, setEditorFontSize] = useState(12);
  const [copyFlash, setCopyFlash] = useState(false);
  const [originalContent, setOriginalContent] = useState("");
  const [findQuery, setFindQuery] = useState("");
  const [findFlash, setFindFlash] = useState(false);
  const editorRef = useRef(null);

  const selectedFile = files.find(f => f.path === selectedPath) || null;

  const loadFiles = useCallback(async (preferredPath = "") => {
    setLoadingFiles(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE}/files`);
      const data = await res.json();
      const next = (data.files || []).sort((a, b) => a.path.localeCompare(b.path));
      setFiles(next);

      if (!next.length) {
        setSelectedPath("");
        setContent("");
        return;
      }

      const desired = preferredPath || selectedPath;
      const keep = next.find(f => f.path === desired);
      setSelectedPath(keep ? keep.path : next[0].path);
    } catch {
      setErrorMsg("Could not load files from backend.");
    } finally {
      setLoadingFiles(false);
    }
  }, [selectedPath]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const loadContent = useCallback(async (path, editable) => {
    if (!path) {
      setContent("");
      setOriginalContent("");
      return;
    }
    if (!editable) {
      const roContent = "This file type is not editable in-app. You can still delete it here.";
      setContent(roContent);
      setOriginalContent(roContent);
      return;
    }
    setLoadingContent(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE}/files/content?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to load content.");
      const nextContent = data.content || "";
      setContent(nextContent);
      setOriginalContent(nextContent);
    } catch (e) {
      setContent("");
      setOriginalContent("");
      setErrorMsg(e.message || "Failed to load file content.");
    } finally {
      setLoadingContent(false);
    }
  }, []);

  useEffect(() => {
    const file = files.find(f => f.path === selectedPath);
    if (!file) {
      setContent("");
      return;
    }
    if (!editorOpen) return;
    loadContent(file.path, file.editable);
  }, [selectedPath, files, loadContent, editorOpen]);

  useEffect(() => {
    if (!editorOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") setEditorOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editorOpen]);

  const createFile = async () => {
    let path = newPath.trim();
    if (!path || creating) return;

    const cleaned = path.replace(/\\/g, "/").replace(/\/+$/, "");
    const base = cleaned.split("/").pop() || "";
    if (base && !base.includes(".")) {
      path = `${cleaned}.txt`;
    } else {
      path = cleaned;
    }

    setCreating(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content: "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to create file.");
      setNewPath("");
      await loadFiles(data.path || path);
      if (onManaged) onManaged();
    } catch (e) {
      setErrorMsg(e.message || "Failed to create file.");
    } finally {
      setCreating(false);
    }
  };

  const renameFile = async () => {
    if (!selectedFile || renaming) return;
    const currentPath = selectedFile.path;
    const suggested = selectedFile.path;
    let targetPath = window.prompt("Rename file to:", suggested);
    if (targetPath == null) return;
    targetPath = targetPath.trim().replace(/\\/g, "/").replace(/\/+$/, "");
    if (!targetPath || targetPath === currentPath) return;

    const base = targetPath.split("/").pop() || "";
    if (base && !base.includes(".") && selectedFile.ext) {
      targetPath = `${targetPath}.${selectedFile.ext}`;
    }

    setRenaming(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE}/files/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ old_path: currentPath, new_path: targetPath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to rename file.");
      await loadFiles(data.new_path || targetPath);
      if (onManaged) onManaged();
    } catch (e) {
      setErrorMsg(e.message || "Failed to rename file.");
    } finally {
      setRenaming(false);
    }
  };

  const saveFile = async () => {
    if (!selectedFile || !selectedFile.editable || saving) return;
    setSaving(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE}/files/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selectedFile.path, content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to save file.");
      setOriginalContent(content);
      await loadFiles(selectedFile.path);
      if (onManaged) onManaged();
    } catch (e) {
      setErrorMsg(e.message || "Failed to save file.");
    } finally {
      setSaving(false);
    }
  };

  const deleteFile = async () => {
    if (!selectedFile) return;
    const ok = window.confirm(`Delete ${selectedFile.path}? This cannot be undone.`);
    if (!ok) return;
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE}/files?path=${encodeURIComponent(selectedFile.path)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to delete file.");
      await loadFiles("");
      if (onManaged) onManaged();
    } catch (e) {
      setErrorMsg(e.message || "Failed to delete file.");
    }
  };

  const runReindex = async () => {
    if (reindexing) return;
    setReindexing(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE}/reindex`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to reindex.");
      await loadFiles(selectedPath);
      if (onManaged) onManaged();
    } catch (e) {
      setErrorMsg(e.message || "Failed to reindex.");
    } finally {
      setReindexing(false);
    }
  };

  const visibleFiles = files.filter(f => {
    const q = filter.trim().toLowerCase();
    const matchesQuery = !q || f.path.toLowerCase().includes(q) || f.name.toLowerCase().includes(q);
    const matchesEditable = !showEditableOnly || f.editable;
    return matchesQuery && matchesEditable;
  });

  const buildTree = (items) => {
    const root = { path: ".", folders: {}, files: [] };
    for (const file of items) {
      const parts = file.path.split("/").filter(Boolean);
      const filename = parts.pop();
      let cursor = root;
      let currentPath = "";
      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (!cursor.folders[part]) {
          cursor.folders[part] = { name: part, path: currentPath, folders: {}, files: [] };
        }
        cursor = cursor.folders[part];
      }
      if (filename) {
        cursor.files.push(file);
      }
    }
    return root;
  };

  const tree = buildTree(visibleFiles);

  const countFolders = (node) => {
    const children = Object.values(node.folders);
    return children.reduce((sum, child) => sum + 1 + countFolders(child), 0);
  };

  const collectFolderPaths = (node) => {
    const out = [];
    for (const child of Object.values(node.folders)) {
      out.push(child.path, ...collectFolderPaths(child));
    }
    return out;
  };

  const formatBytes = (bytes) => {
    if (typeof bytes !== "number" || Number.isNaN(bytes)) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const countFilesDeep = (node) => {
    const children = Object.values(node.folders);
    return node.files.length + children.reduce((sum, child) => sum + countFilesDeep(child), 0);
  };

  const folderCount = countFolders(tree);
  const editableCount = files.filter(f => f.editable).length;

  const toggleFolder = (path) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const expandAllFolders = () => {
    setExpandedFolders(new Set([".", ...collectFolderPaths(tree)]));
  };

  const collapseAllFolders = () => {
    setExpandedFolders(new Set(["."]));
  };

  const allFolderPaths = collectFolderPaths(tree);
  const isTreeExpanded = allFolderPaths.length > 0 && allFolderPaths.every(path => expandedFolders.has(path));

  const toggleTreeExpanded = () => {
    if (isTreeExpanded) collapseAllFolders();
    else expandAllFolders();
  };

  const openEditor = (path = selectedPath) => {
    if (!path) return;
    setSelectedPath(path);
    setEditorOpen(true);
  };

  const findNextInEditor = () => {
    const editor = editorRef.current;
    const query = findQuery.trim();
    if (!editor || !query || !content) return;
    const haystack = content.toLowerCase();
    const needle = query.toLowerCase();
    const startFrom = Math.max(editor.selectionEnd || 0, 0);
    let idx = haystack.indexOf(needle, startFrom);
    if (idx === -1) idx = haystack.indexOf(needle, 0);
    if (idx === -1) {
      setFindFlash(true);
      setTimeout(() => setFindFlash(false), 900);
      return;
    }
    editor.focus();
    editor.setSelectionRange(idx, idx + query.length);
  };

  const insertTimestamp = () => {
    const editor = editorRef.current;
    if (!editor || !selectedFile?.editable) return;
    const stamp = new Date().toISOString();
    const start = editor.selectionStart || 0;
    const end = editor.selectionEnd || start;
    const next = `${content.slice(0, start)}${stamp}${content.slice(end)}`;
    setContent(next);
    requestAnimationFrame(() => {
      editor.focus();
      const pos = start + stamp.length;
      editor.setSelectionRange(pos, pos);
    });
  };

  const trimTrailingWhitespace = () => {
    if (!selectedFile?.editable) return;
    setContent(prev => prev.split("\n").map(line => line.replace(/[ \t]+$/g, "")).join("\n"));
  };

  useEffect(() => {
    if (!editorOpen) return;
    const handleEditorHotkeys = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveFile();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        const input = document.getElementById("editor-find-input");
        input?.focus();
      }
    };
    window.addEventListener("keydown", handleEditorHotkeys);
    return () => window.removeEventListener("keydown", handleEditorHotkeys);
  }, [editorOpen, saveFile]);

  const hasUnsavedChanges = !!selectedFile?.editable && content !== originalContent;

  const copyEditorContent = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopyFlash(true);
      setTimeout(() => setCopyFlash(false), 1200);
    } catch {
      setErrorMsg("Could not copy editor content.");
    }
  };

  const reloadEditorContent = async () => {
    if (!selectedFile) return;
    await loadContent(selectedFile.path, selectedFile.editable);
  };

  const formatJsonContent = () => {
    if (!selectedFile || selectedFile.ext !== "json") return;
    try {
      const parsed = JSON.parse(content || "{}");
      setContent(JSON.stringify(parsed, null, 2));
    } catch {
      setErrorMsg("JSON format failed. Fix syntax and try again.");
    }
  };

  const downloadCurrentFile = () => {
    if (!selectedFile) return;
    const blob = new Blob([content || ""], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = selectedFile.name || "document.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const renderFolder = (node, depth = 0) => {
    const isExpanded = expandedFolders.has(node.path);
    const folders = Object.values(node.folders).sort((a, b) => a.name.localeCompare(b.name));
    const folderFileCount = countFilesDeep(node);
    const folderIndent = 10 + depth * 14;

    return (
      <div key={node.path}>
        {node.path !== "." && (
          <button onClick={() => toggleFolder(node.path)}
            style={{ width: "100%", marginBottom: 3, textAlign: "left", border: `1px solid ${isExpanded ? T.borderHi : T.border}`,
              borderRadius: 10, background: isExpanded ? `linear-gradient(90deg, ${T.raised}, ${T.panel})` : "transparent", color: T.muted, padding: "7px 10px", cursor: "pointer",
              fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8, paddingLeft: folderIndent,
              transition: "all .15s", backdropFilter: "blur(2px)" }}>
            <span style={{ fontSize: 10, color: isExpanded ? T.text : T.faint, width: 10 }}>{isExpanded ? "▾" : "▸"}</span>
            <span style={{ width: 16, height: 16, borderRadius: 5, background: `${T.teal}14`, color: T.teal,
              display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9,
              fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>DIR</span>
            <span style={{ fontSize: 11, color: T.text, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.name}</span>
            <span style={{ fontSize: 10, color: T.faint, fontFamily: "'DM Mono',monospace" }}>{folderFileCount}f</span>
          </button>
        )}

        {(node.path === "." || isExpanded) && (
          <div style={node.path === "." ? undefined : { marginLeft: 14, paddingLeft: 8, borderLeft: `1px dashed ${T.border}` }}>
            {folders.map(child => renderFolder(child, depth + (node.path === "." ? 0 : 1)))}
            {node.files
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((f) => {
                const ec = EXT_COLOR[f.ext] || EXT_COLOR.txt;
                const active = selectedPath === f.path;
                const fileIndent = 36 + depth * 14;
                const glyph = FILE_GLYPH[f.ext] || "•";
                return (
                  <button key={f.path} onClick={() => openEditor(f.path)}
                    style={{ width: "100%", marginBottom: 3, textAlign: "left", border: `1px solid ${active ? T.borderHi : "transparent"}`,
                      borderRadius: 10, background: active ? `linear-gradient(90deg, ${T.raised}, ${T.panel})` : "transparent", color: T.text,
                      padding: "7px 10px", cursor: "pointer", fontFamily: "inherit", paddingLeft: fileIndent,
                      transition: "all .15s", boxShadow: active ? `inset 2px 0 0 ${T.blue}` : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ width: 18, height: 18, borderRadius: 6, background: ec.bg, color: ec.fg,
                        display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10,
                        fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>{glyph}</span>
                      <span style={{ fontSize: 11, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{f.name}</span>
                      <Pill label={(f.ext || "txt").toUpperCase()} fg={ec.fg} bg={ec.bg} size={9} />
                      {!f.editable && <span style={{ fontSize: 9, color: T.faint, letterSpacing: "0.05em" }}>RO</span>}
                      <span style={{ fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>{formatBytes(f.size)}</span>
                    </div>
                    {filter.trim() && (
                      <div style={{ marginTop: 3, fontSize: 10, color: T.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.path}
                      </div>
                    )}
                  </button>
                );
              })}
          </div>
        )}
      </div>
    );
  };

  const selectedParts = selectedFile ? selectedFile.path.split("/").filter(Boolean) : [];

  const Icon = ({ path, size = 12, stroke = "currentColor", strokeWidth = 2 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={path} />
    </svg>
  );

  const ICONS = {
    add: "M12 5v14M5 12h14",
    refresh: "M3 12a9 9 0 0 1 15.3-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.3 6.3L3 16M3 21v-5h5",
    tree: "M6 3v6M18 3v6M12 9v6M4 15h16M6 21h12",
    reindex: "M13 2 3 14h7l-1 8 10-12h-7z",
    editable: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z",
    delete: "M3 6h18M8 6V4h8v2M10 11v6M14 11v6M6 6l1 14h10l1-14",
    rename: "M4 7h11M4 12h8M4 17h6M15 17l5-5 2 2-5 5-3 1z",
    save: "M5 3h11l3 3v15H5zM8 3v6h8M9 17h6",
    close: "M6 6l12 12M18 6 6 18",
    find: "M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zm10 3-5.2-5.2",
    wrap: "M4 7h14M4 12h10a3 3 0 1 1 0 6h-2M12 18l-2-2 2-2",
    copy: "M9 9h11v12H9zM4 4h11v12",
    download: "M12 3v12M7 10l5 5 5-5M5 21h14",
    time: "M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
    trim: "M4 7h16M4 12h12M4 17h8",
    json: "M9 5c-2 2-2 12 0 14M15 5c2 2 2 12 0 14",
  };

  return (
    <div style={{ height: "100%", minHeight: 0, position: "relative", background: `radial-gradient(ellipse at 10% 10%, ${T.panel} 0%, ${T.bg} 52%)` }}>
      <section style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0, padding: 14 }}>
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 14, background: `linear-gradient(180deg, ${T.surface} 0%, ${T.bg} 100%)`,
          boxShadow: "0 18px 34px rgba(0,0,0,.33)", minHeight: 0, flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 10, color: T.faint, letterSpacing: "0.08em" }}>HIERARCHY</div>
            <div style={{ fontSize: 10, color: T.muted }}>{files.length} files · {folderCount} folders</div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: T.muted }}>{visibleFiles.length}/{files.length}</div>
            <div style={{ flex: 1 }} />
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter files..."
              style={{ width: 220, maxWidth: "35vw", background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 11, padding: "6px 8px", outline: "none" }}
            />
            <input
              value={newPath}
              onChange={e => setNewPath(e.target.value)}
              placeholder="Create file path..."
              style={{ width: 210, maxWidth: "35vw", background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 11, padding: "6px 8px", outline: "none" }}
            />
            <button onClick={createFile}
              style={{ border: "none", borderRadius: 8, background: creating ? T.faint : T.blue,
                color: "#fff", fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", padding: "6px 9px", cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", gap: 5 }}>
              <Icon path={ICONS.add} size={11} />
              {creating ? "CREATING" : "CREATE"}
            </button>
            <button onClick={() => loadFiles(selectedPath)}
              style={{ border: `1px solid ${T.border}`, borderRadius: 8, background: T.panel, color: T.muted,
                fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", padding: "6px 9px", cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", gap: 5 }}>
              <Icon path={ICONS.refresh} size={11} />
              REFRESH
            </button>
            <button onClick={toggleTreeExpanded}
              style={{ border: `1px solid ${isTreeExpanded ? T.teal : T.border}`, borderRadius: 8,
                background: isTreeExpanded ? `${T.teal}18` : T.panel, color: isTreeExpanded ? T.teal : T.muted,
                fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", padding: "6px 9px", cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", gap: 5 }}>
              <Icon path={ICONS.tree} size={11} />
              {isTreeExpanded ? "TREE: EXPANDED" : "TREE: COLLAPSED"}
            </button>
            <button onClick={runReindex}
              style={{ border: "none", borderRadius: 8, background: reindexing ? T.faint : T.amber,
                color: "#111", fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", padding: "6px 9px", cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", gap: 5 }}>
              <Icon path={ICONS.reindex} size={11} />
              {reindexing ? "REINDEXING" : "REINDEX"}
            </button>
            <button onClick={() => setShowEditableOnly(v => !v)}
              style={{ border: `1px solid ${showEditableOnly ? T.borderHi : T.border}`, borderRadius: 8,
                background: showEditableOnly ? T.raised : T.panel, color: showEditableOnly ? T.text : T.muted,
                fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", padding: "6px 9px", cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", gap: 5 }}>
              <Icon path={ICONS.editable} size={11} />
              EDITABLE
            </button>
            {selectedFile && (
              <>
                <button onClick={renameFile} disabled={renaming}
                  style={{ border: `1px solid ${T.border}`, borderRadius: 8, background: T.panel,
                    color: renaming ? T.faint : T.muted, fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
                    padding: "6px 9px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
                  <Icon path={ICONS.rename} size={11} />
                  {renaming ? "RENAMING" : "RENAME"}
                </button>
                <button onClick={deleteFile}
                  style={{ border: "none", borderRadius: 8, background: T.coral,
                    color: "#fff", fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", padding: "6px 9px", cursor: "pointer", fontFamily: "inherit",
                    display: "flex", alignItems: "center", gap: 5 }}>
                  <Icon path={ICONS.delete} size={11} />
                  DELETE
                </button>
              </>
            )}
          </div>

          <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.border}`, background: `${T.panel}99`, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, color: T.faint, letterSpacing: "0.07em" }}>ROOT</span>
            <span style={{ fontSize: 12, color: T.text, fontWeight: 600 }}>test_documents</span>
            <span style={{ fontSize: 10, color: T.faint }}>{folderCount} folders · {visibleFiles.length} files</span>
            {selectedFile && <span style={{ fontSize: 10, color: T.muted, marginLeft: "auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Selected: {selectedFile.path}</span>}
          </div>

          {errorMsg && (
            <div style={{ margin: "8px 12px 0", padding: "8px 10px", borderRadius: 8,
              background: T.coralDim, border: `1px solid ${T.coral}44`, color: T.coral, fontSize: 11 }}>
              {errorMsg}
            </div>
          )}

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px" }}>
            {loadingFiles && <div style={{ padding: 10, fontSize: 12, color: T.muted }}>Loading files…</div>}
            {!loadingFiles && visibleFiles.length === 0 && (
              <Empty icon="📁" title="No files" sub="Upload or create files to manage them here." />
            )}
            {!loadingFiles && renderFolder(tree, 0)}
          </div>
        </div>
      </section>

      {editorOpen && selectedFile && (
        <div onClick={() => setEditorOpen(false)} style={{ position: "absolute", inset: 0, zIndex: 30,
          background: "rgba(3, 5, 10, 0.72)", backdropFilter: "blur(7px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(1060px, 96vw)", height: "min(760px, 92vh)",
            borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column",
            border: `1px solid ${T.borderHi}`, background: `linear-gradient(180deg, ${T.surface}, ${T.bg})`,
            boxShadow: "0 30px 90px rgba(0,0,0,.65), 0 0 0 1px rgba(79,128,255,.14)" }}>

            <div style={{ padding: "11px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
                {selectedParts.map((part, idx) => (
                  <div key={`${part}-${idx}`} style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {idx > 0 && <span style={{ color: T.faint, fontSize: 10 }}>/</span>}
                    <span style={{ fontSize: idx === selectedParts.length - 1 ? 11 : 10,
                      color: idx === selectedParts.length - 1 ? T.text : T.muted,
                      fontWeight: idx === selectedParts.length - 1 ? 600 : 500,
                      fontFamily: idx === selectedParts.length - 1 ? "'DM Mono', monospace" : "inherit" }}>
                      {part}
                    </span>
                  </div>
                ))}
              </div>
              {!selectedFile.editable && (
                <span style={{ fontSize: 10, color: T.faint, border: `1px solid ${T.border}`,
                  borderRadius: 7, padding: "4px 7px", letterSpacing: "0.04em" }}>READ ONLY</span>
              )}
              <button onClick={saveFile} disabled={!selectedFile.editable || saving}
                style={{ border: "none", borderRadius: 8, background: (!selectedFile.editable || saving) ? T.faint : T.green,
                  color: "#fff", fontSize: 11, fontWeight: 700, padding: "7px 12px", cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 6 }}>
                <Icon path={ICONS.save} size={12} />
                {saving ? "Saving..." : hasUnsavedChanges ? "Save Changes" : "Saved"}
              </button>
              <button onClick={renameFile} disabled={renaming}
                style={{ border: `1px solid ${T.border}`, borderRadius: 8, background: T.panel,
                  color: renaming ? T.faint : T.muted, fontSize: 11, fontWeight: 700, padding: "7px 12px", cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 6 }}>
                <Icon path={ICONS.rename} size={12} />
                {renaming ? "Renaming..." : "Rename"}
              </button>
              <button onClick={deleteFile}
                style={{ border: "none", borderRadius: 8, background: T.coral,
                  color: "#fff", fontSize: 11, fontWeight: 700, padding: "7px 12px", cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 6 }}>
                <Icon path={ICONS.delete} size={12} />
                Delete
              </button>
              <button onClick={() => setEditorOpen(false)}
                style={{ border: `1px solid ${T.border}`, borderRadius: 8, background: T.panel,
                  color: T.muted, fontSize: 11, fontWeight: 700, padding: "7px 12px", cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 6 }}>
                <Icon path={ICONS.close} size={12} />
                Close
              </button>
            </div>

            <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <input
                id="editor-find-input"
                value={findQuery}
                onChange={e => setFindQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") findNextInEditor(); }}
                placeholder="Find in file..."
                style={{ width: 170, background: T.panel, border: `1px solid ${findFlash ? T.coral : T.border}`,
                  borderRadius: 7, color: T.text, fontSize: 10, padding: "5px 8px", outline: "none" }}
              />
              <button onClick={findNextInEditor}
                style={{ border: `1px solid ${T.border}`, borderRadius: 7, background: T.panel, color: T.muted,
                  fontSize: 10, fontWeight: 700, padding: "5px 8px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
                <Icon path={ICONS.find} size={11} />
                FIND NEXT
              </button>
              <button onClick={() => setEditorWrap(v => !v)}
                style={{ border: `1px solid ${editorWrap ? T.borderHi : T.border}`, borderRadius: 7,
                  background: editorWrap ? T.raised : T.panel, color: editorWrap ? T.text : T.muted,
                  fontSize: 10, fontWeight: 700, padding: "5px 8px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
                <Icon path={ICONS.wrap} size={11} />
                {editorWrap ? "WRAP ON" : "WRAP OFF"}
              </button>
              <button onClick={() => setEditorFontSize(v => Math.max(11, v - 1))}
                style={{ border: `1px solid ${T.border}`, borderRadius: 7, background: T.panel, color: T.muted,
                  fontSize: 10, fontWeight: 700, padding: "5px 8px", cursor: "pointer", fontFamily: "inherit" }}>
                A-
              </button>
              <button onClick={() => setEditorFontSize(v => Math.min(20, v + 1))}
                style={{ border: `1px solid ${T.border}`, borderRadius: 7, background: T.panel, color: T.muted,
                  fontSize: 10, fontWeight: 700, padding: "5px 8px", cursor: "pointer", fontFamily: "inherit" }}>
                A+
              </button>
              <button onClick={copyEditorContent}
                style={{ border: `1px solid ${copyFlash ? T.green : T.border}`, borderRadius: 7,
                  background: copyFlash ? `${T.green}1f` : T.panel, color: copyFlash ? T.green : T.muted,
                  fontSize: 10, fontWeight: 700, padding: "5px 8px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
                <Icon path={ICONS.copy} size={11} />
                {copyFlash ? "COPIED" : "COPY"}
              </button>
              <button onClick={reloadEditorContent}
                style={{ border: `1px solid ${T.border}`, borderRadius: 7, background: T.panel, color: T.muted,
                  fontSize: 10, fontWeight: 700, padding: "5px 8px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
                <Icon path={ICONS.refresh} size={11} />
                RELOAD
              </button>
              <button onClick={downloadCurrentFile}
                style={{ border: `1px solid ${T.border}`, borderRadius: 7, background: T.panel, color: T.muted,
                  fontSize: 10, fontWeight: 700, padding: "5px 8px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
                <Icon path={ICONS.download} size={11} />
                DOWNLOAD
              </button>
              <button onClick={insertTimestamp}
                style={{ border: `1px solid ${T.border}`, borderRadius: 7, background: T.panel, color: T.muted,
                  fontSize: 10, fontWeight: 700, padding: "5px 8px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
                <Icon path={ICONS.time} size={11} />
                INSERT TIME
              </button>
              <button onClick={trimTrailingWhitespace}
                style={{ border: `1px solid ${T.border}`, borderRadius: 7, background: T.panel, color: T.muted,
                  fontSize: 10, fontWeight: 700, padding: "5px 8px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
                <Icon path={ICONS.trim} size={11} />
                TRIM SPACES
              </button>
              {selectedFile.ext === "json" && (
                <button onClick={formatJsonContent}
                  style={{ border: `1px solid ${T.teal}55`, borderRadius: 7, background: `${T.teal}1b`, color: T.teal,
                    fontSize: 10, fontWeight: 700, padding: "5px 8px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
                  <Icon path={ICONS.json} size={11} />
                  FORMAT JSON
                </button>
              )}
              <span style={{ fontSize: 10, color: hasUnsavedChanges ? T.amber : T.faint, fontFamily: "'DM Mono', monospace" }}>
                {hasUnsavedChanges ? "Unsaved changes" : "All changes saved"}
              </span>
              <span style={{ marginLeft: "auto", fontSize: 10, color: T.faint, fontFamily: "'DM Mono', monospace" }}>
                {editorFontSize}px
              </span>
            </div>

            <div style={{ flex: 1, minHeight: 0, padding: 12 }}>
              {loadingContent && <div style={{ fontSize: 12, color: T.muted }}>Loading content…</div>}
              {!loadingContent && (
                <textarea
                  ref={editorRef}
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  readOnly={!selectedFile.editable}
                  style={{ width: "100%", height: "100%", resize: "none", borderRadius: 12,
                    border: `1px solid ${T.border}`, background: T.surface, color: selectedFile.editable ? T.text : T.muted,
                    fontSize: editorFontSize, lineHeight: 1.6, padding: "12px 14px", outline: "none",
                    whiteSpace: editorWrap ? "pre-wrap" : "pre",
                    fontFamily: "'DM Mono', monospace" }}
                />
              )}
            </div>
          </div>
        </div>
      )}
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
      <div style={{ padding:"12px 16px", borderRadius:"16px 16px 16px 4px",
        background:`linear-gradient(160deg, ${T.raised} 0%, ${T.panel} 100%)`, border:`1px solid ${T.border}`,
        display:"flex", alignItems:"center", gap:2 }}>
        <span className="typing-dot"/>
        <span className="typing-dot"/>
        <span className="typing-dot"/>
      </div>
    </div>
  );
}

function formatMsgTime(value) {
  if (!value) return "Now";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Now";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function ChatMessage({ msg }) {
  const isUser = msg.role === "user";

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

        <div style={{ display:"flex", alignItems:"center", gap:6, padding:"0 3px",
          fontSize:10, color:T.faint, letterSpacing:"0.03em" }}>
          <span style={{ fontWeight:600, color:isUser?T.blue:T.teal }}>{isUser ? "You" : "Assistant"}</span>
          <span style={{ opacity:.65 }}>•</span>
          <span>{formatMsgTime(msg.createdAt)}</span>
        </div>

        <div style={{ padding:"11px 15px",
          borderRadius:isUser?"16px 16px 4px 16px":"16px 16px 16px 4px",
          background:isUser
            ? `linear-gradient(145deg, ${T.blue} 0%, #5a9bff 100%)`
            : `linear-gradient(160deg, ${T.raised} 0%, ${T.panel} 100%)`,
          border:isUser?"none":`1px solid ${T.border}`,
          color:isUser?"#fff":T.text, fontSize:13, lineHeight:1.7,
          whiteSpace:"pre-wrap",
          boxShadow:isUser?`0 6px 18px ${T.blueDim}`:"none" }}>
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
      sources:[], confidence:null, streaming:false, createdAt:Date.now(),
    }]);
    setTimeout(()=>inputRef.current?.focus(), 100);
  }, [targetFile?.id]);

  useEffect(() => {
    setScope(targetFile ? "file" : "all");
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
      { role:"user", content:q, streaming:false, createdAt:Date.now() },
      { role:"assistant", content:"", sources:[], confidence:null, streaming:true, createdAt:Date.now() },
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
  const scopeOptions = targetFile
    ? [["file", "This file"], ["all", "All files"]]
    : [["all", "All files"]];

  return (
    <div className={`chat-popup${closing?" closing":""}`}>

      {/* ── Header ── */}
      <div style={{
        background:`linear-gradient(180deg, ${T.surface} 0%, ${T.panel} 100%)`,
        borderBottom:`1px solid ${T.border}`,
        padding:"14px 16px 12px",
        flexShrink:0,
        position:"relative",
        zIndex:1,
      }}>

        {/* Top row: avatar + title + close */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom: 10 }}>
          <div style={{ width:38, height:38, borderRadius:12,
            background:`linear-gradient(135deg,${T.blue},${T.teal})`,
            border:`1px solid rgba(255,255,255,.18)`,
            boxShadow:`0 6px 16px ${T.blueDim}`,
            display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="3" fill="#fff"/>
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="rgba(255,255,255,.7)" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:700, color:T.text, letterSpacing:"-0.01em" }}>SemanticGraph QA</div>
            <div style={{ display:"flex", alignItems:"center", gap:5, marginTop:1 }}>
              <Dot color={T.green} size={5} pulse/>
              <span style={{ fontSize:11, color:T.muted }}>
                {asking ? "Thinking…" : "Online · phi3:mini"}
              </span>
              <span style={{ fontSize:9, color:T.faint, letterSpacing:"0.07em", marginLeft:4 }}>LOCAL</span>
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

        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
          {/* Context chip */}
          {targetFile ? (
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
          ) : (
            <div style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px",
              background:T.raised, borderRadius:10, border:`1px solid ${T.borderMd}`,
              minWidth:0, flex:1 }}>
              <Dot color={T.teal} size={6}/>
              <span style={{ fontSize:11, color:T.text, fontWeight:500, whiteSpace:"nowrap" }}>
                Global search context
              </span>
            </div>
          )}

          {/* Scope pill toggle */}
          <div style={{ display:"flex", gap:2, background:T.panel, borderRadius:8,
            border:`1px solid ${T.border}`, padding:3, flexShrink:0 }}>
            {scopeOptions.map(([v,l])=>(
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
      </div>

      {/* ── Messages ── */}
      <div ref={scrollRef} style={{ flex:1, overflowY:"auto", padding:"16px 14px",
        display:"flex", flexDirection:"column",
        background:`linear-gradient(180deg, rgba(255,255,255,.01) 0%, rgba(255,255,255,0) 100%)` }}>

        {messages.map((m,i)=><ChatMessage key={i} msg={m}/>)}
        {asking && !messages[messages.length-1]?.streaming && <TypingIndicator/>}

        {/* Suggestions — only before first user message */}
        {!hasUserMsg && (
          <div className="fu1" style={{ marginTop:4, padding:"10px", borderRadius:14,
            border:`1px solid ${T.border}`, background:`linear-gradient(180deg, ${T.panel} 0%, ${T.raised} 100%)` }}>
            <div style={{ fontSize:10, color:T.faint, letterSpacing:"0.07em", marginBottom:8, textAlign:"center", fontWeight:600 }}>
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
        background:`linear-gradient(180deg, ${T.panel} 0%, ${T.surface} 100%)`, flexShrink:0 }}>
        <div style={{ display:"flex", gap:8, alignItems:"flex-end",
          background:T.raised, borderRadius:14, padding:"8px 8px 8px 14px",
          border:`1px solid ${T.borderMd}`,
          boxShadow:`inset 0 1px 0 rgba(255,255,255,.03)`,
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
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, marginTop:6 }}>
          <div style={{ fontSize:10,color:T.faint }}>
            Shift+Enter for newline
          </div>
          <div style={{ fontSize:10,color:T.faint,textAlign:"right" }}>
            Local answers via phi3:mini
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── FAB ─────────────────────────────────────────────────────────────────── */
function ChatFAB({ open, hasTarget, onClick }) {
  return (
    <button className={`chat-fab${hasTarget&&!open?" has-file":""}`} onClick={onClick}
      style={{
        background:open
          ? `linear-gradient(145deg, ${T.raised} 0%, ${T.panel} 100%)`
          : `linear-gradient(135deg, ${T.blue} 0%, #6b8fff 45%, ${T.teal} 100%)`,
        border:`1px solid ${open ? T.borderMd : "rgba(255,255,255,.2)"}`,
        boxShadow:open?`0 2px 16px rgba(0,0,0,.4)`:`0 8px 24px ${T.blue}55`,
      }}>
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

function VirtualPresetPopup({
  open,
  loading,
  presetName,
  setPresetName,
  topic,
  setTopic,
  person,
  setPerson,
  relation,
  setRelation,
  presets,
  onBuild,
  onSave,
  onApplyPreset,
  onDeletePreset,
  virtualFolders,
  onOpenFolder,
  onClose,
}) {
  if (!open) return null;

  const relationOptions = [
    "ALL",
    "VERSION_OF",
    "CO_LOCATED",
    "RELATED_TO",
    "SHARES_ENTITY",
    "SAME_TOPIC",
    "FOLDER_SIMILAR",
  ];

  return (
    <>
      <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.4)", zIndex:998 }} />
      <div className="fu" style={{
        position:"fixed",
        top:72,
        right:20,
        width:360,
        maxWidth:"calc(100vw - 24px)",
        zIndex:999,
        borderRadius:14,
        background:`linear-gradient(180deg, ${T.surface} 0%, ${T.bg} 100%)`,
        border:`1px solid ${T.borderMd}`,
        boxShadow:"0 18px 48px rgba(0,0,0,.55)",
        padding:12,
        display:"flex",
        flexDirection:"column",
        gap:10,
      }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:T.text }}>Virtual Folder Presets</div>
            <div style={{ fontSize:10, color:T.faint }}>Build once, save, reuse with one click.</div>
          </div>
          <button onClick={onClose} style={{
            width:22, height:22, borderRadius:6, cursor:"pointer", border:`1px solid ${T.border}`,
            background:T.panel, color:T.muted, fontFamily:"inherit"
          }}>x</button>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          <input value={topic} onChange={e=>setTopic(e.target.value)} placeholder="Topic 1" style={{
            height:30, background:T.panel, border:`1px solid ${T.border}`, borderRadius:8,
            color:T.text, padding:"0 9px", fontSize:11, outline:"none"
          }} />
          <input value={person} onChange={e=>setPerson(e.target.value)} placeholder="Topic 2" style={{
            height:30, background:T.panel, border:`1px solid ${T.border}`, borderRadius:8,
            color:T.text, padding:"0 9px", fontSize:11, outline:"none"
          }} />
          <select value={relation} onChange={e=>setRelation(e.target.value)} style={{
            height:30, background:T.panel, border:`1px solid ${T.border}`, borderRadius:8,
            color:T.text, padding:"0 9px", fontSize:11, outline:"none"
          }}>
            {relationOptions.map(opt => (
              <option key={opt} value={opt}>{opt === "ALL" ? "Any relation" : opt.replace(/_/g, " ")}</option>
            ))}
          </select>
          <button onClick={onBuild} style={{
            height:30, borderRadius:8, border:`1px solid ${T.blue}66`, background:T.blueDim,
            color:T.blue, fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit"
          }}>
            {loading ? "Building..." : "Build Virtual Folders"}
          </button>
        </div>

        <div style={{ display:"flex", gap:8 }}>
          <input value={presetName} onChange={e=>setPresetName(e.target.value)} placeholder="Preset name" style={{
            flex:1, height:30, background:T.panel, border:`1px solid ${T.border}`, borderRadius:8,
            color:T.text, padding:"0 9px", fontSize:11, outline:"none"
          }} />
          <button onClick={onSave} style={{
            width:88, height:30, borderRadius:8, border:`1px solid ${T.teal}66`, background:T.tealDim,
            color:T.teal, fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit"
          }}>
            Save
          </button>
        </div>

        <div style={{ borderTop:`1px solid ${T.border}`, paddingTop:10, maxHeight:220, overflowY:"auto" }}>
          <div style={{ fontSize:10, color:T.faint, letterSpacing:"0.06em", marginBottom:8 }}>SAVED PRESETS</div>
          {presets.length === 0 && (
            <div style={{ fontSize:11, color:T.muted }}>No presets yet.</div>
          )}
          {presets.map((p)=> (
            <div key={p.id} style={{
              display:"grid", gridTemplateColumns:"1fr auto auto", gap:6, alignItems:"center",
              background:T.raised, border:`1px solid ${T.border}`, borderRadius:8, padding:"6px 8px", marginBottom:6
            }}>
              <div>
                <div style={{ fontSize:11, color:T.text, fontWeight:600 }}>{p.name}</div>
                <div style={{ fontSize:9, color:T.faint, fontFamily:"'DM Mono',monospace" }}>
                  {(p.topic || "-")} · {(p.person || "-")} · {(p.relation || "ALL")}
                </div>
              </div>
              <button onClick={()=>onApplyPreset(p)} style={{
                height:24, padding:"0 8px", borderRadius:7, border:`1px solid ${T.blue}55`,
                background:T.blueDim, color:T.blue, fontSize:10, cursor:"pointer", fontFamily:"inherit"
              }}>Apply</button>
              <button onClick={()=>onDeletePreset(p.id)} style={{
                height:24, width:24, borderRadius:7, border:`1px solid ${T.coral}55`,
                background:T.coralDim, color:T.coral, fontSize:11, cursor:"pointer", fontFamily:"inherit"
              }}>x</button>
            </div>
          ))}
        </div>

        <div style={{ borderTop:`1px solid ${T.border}`, paddingTop:10, maxHeight:180, overflowY:"auto" }}>
          <div style={{ fontSize:10, color:T.faint, letterSpacing:"0.06em", marginBottom:8 }}>GENERATED VIRTUAL FOLDERS</div>
          {loading && <div style={{ fontSize:11, color:T.muted }}>Building virtual folders...</div>}
          {!loading && (!virtualFolders || virtualFolders.length === 0) && (
            <div style={{ fontSize:11, color:T.muted }}>Build with filters to generate folders here.</div>
          )}
          {!loading && (virtualFolders || []).map(folder => (
            <div key={folder.id} style={{
              display:"grid", gridTemplateColumns:"1fr auto", gap:6, alignItems:"center",
              background:T.raised, border:`1px solid ${T.border}`, borderRadius:8,
              padding:"6px 8px", marginBottom:6
            }}>
              <div>
                <div style={{ fontSize:11, color:T.text, fontWeight:600 }}>{folder.title}</div>
                <div style={{ fontSize:9, color:T.faint, fontFamily:"'DM Mono',monospace" }}>
                  {folder.file_count} files · {folder.source}
                </div>
              </div>
              <button onClick={()=>onOpenFolder && onOpenFolder(folder)} style={{
                height:24, padding:"0 8px", borderRadius:7, border:`1px solid ${T.teal}55`,
                background:T.tealDim, color:T.teal, fontSize:10, cursor:"pointer", fontFamily:"inherit"
              }}>Search</button>
            </div>
          ))}
        </div>
      </div>
    </>
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
  const [resultsCollapsed, setResultsCollapsed] = useState(false);
  const [scoreCollapsed, setScoreCollapsed] = useState(false);

  // Chat state
  const [chatOpen,   setChatOpen]   = useState(false);
  const [chatTarget, setChatTarget] = useState(null); // null = global

  // File viewer state
  const [fileViewerOpen,    setFileViewerOpen]    = useState(false);
  const [fileViewerContent, setFileViewerContent] = useState("");
  const [fileViewerFile,    setFileViewerFile]    = useState(null);
  const [fileViewerLoading, setFileViewerLoading] = useState(false);
  const [virtualFolders, setVirtualFolders] = useState([]);
  const [virtualLoading, setVirtualLoading] = useState(false);
  const [presetPopupOpen, setPresetPopupOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetTopic, setPresetTopic] = useState("");
  const [presetPerson, setPresetPerson] = useState("");
  const [presetRelation, setPresetRelation] = useState("ALL");
  const [savedPresets, setSavedPresets] = useState([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("semantic_virtual_folder_presets_v1");
      const parsed = raw ? JSON.parse(raw) : [];
      setSavedPresets(Array.isArray(parsed) ? parsed : []);
    } catch {
      setSavedPresets([]);
    }
  }, []);

  const fetchGraph = useCallback(async()=>{ try{const r=await fetch(`${API_BASE}/graph`);setGraphData(await r.json());}catch{} },[]);
  const fetchStats = useCallback(async()=>{ try{const r=await fetch(`${API_BASE}/status`);setStats(await r.json());setConn("ok");}catch{setConn("error");} },[]);
  const fetchVirtualFolders = useCallback(async(filters={})=>{
    setVirtualLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.topic) params.set("topic", filters.topic);
      if (filters.person) params.set("person", filters.person);
      if (filters.relation) params.set("relation", filters.relation);
      const queryString = params.toString();
      const r = await fetch(`${API_BASE}/virtual-folders${queryString ? `?${queryString}` : ""}`);
      const d = await r.json();
      setVirtualFolders(Array.isArray(d.folders) ? d.folders : []);
    } catch {
      setVirtualFolders([]);
    } finally {
      setVirtualLoading(false);
    }
  },[]);

  const applyVirtualFilters = useCallback(async(filters = {}) => {
    const normalized = {
      topic: (filters.topic || "").trim(),
      person: (filters.person || "").trim(),
      relation: (filters.relation || "").trim(),
    };
    await fetchVirtualFolders(normalized);
    setTab("graph");
  }, [fetchVirtualFolders]);

  const saveCurrentPreset = useCallback(() => {
    const name = presetName.trim();
    if (!name) return;
    const next = [
      {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name,
        topic: presetTopic.trim(),
        person: presetPerson.trim(),
        relation: presetRelation,
      },
      ...savedPresets,
    ].slice(0, 20);
    setSavedPresets(next);
    setPresetName("");
    try {
      window.localStorage.setItem("semantic_virtual_folder_presets_v1", JSON.stringify(next));
    } catch {}
  }, [presetName, presetTopic, presetPerson, presetRelation, savedPresets]);

  const deletePreset = useCallback((presetId) => {
    const next = savedPresets.filter(p => p.id !== presetId);
    setSavedPresets(next);
    try {
      window.localStorage.setItem("semantic_virtual_folder_presets_v1", JSON.stringify(next));
    } catch {}
  }, [savedPresets]);

  const applySavedPreset = useCallback(async(preset) => {
    setPresetTopic(preset.topic || "");
    setPresetPerson(preset.person || "");
    setPresetRelation(preset.relation || "ALL");
    await applyVirtualFilters({
      topic: preset.topic || "",
      person: preset.person || "",
      relation: preset.relation && preset.relation !== "ALL" ? preset.relation : "",
    });
    setPresetPopupOpen(false);
  }, [applyVirtualFilters]);
  useEffect(()=>{ fetchGraph(); fetchStats(); fetchVirtualFolders(); },[]);

  const runSearch = useCallback(async(searchValue)=>{
    const text = String(searchValue || "").trim();
    if(!text) return;
    setQuery(text);
    setResultsCollapsed(false);
    setScoreCollapsed(false);
    setLoading(true);setSearched(false);setSelected(null);setResults([]);
    try{
      const r=await fetch(`${API_BASE}/search?q=${encodeURIComponent(text)}`);
      const d=await r.json();
      setResults(d.results||[]);
      setSelected(d.results?.[0]??null);
      setSearched(true);
    }catch{
      setSearched(true);
    }finally{
      setLoading(false);
    }
  },[]);

  const handleSearch = async()=>{ await runSearch(query); };

  // "Ask about this file" from a result card → open chat scoped to that file
  const handleAsk = result => { setChatTarget(result); setChatOpen(true); };
  
  // "View File" from a result card → open file viewer with full content
  const handleView = async(result) => {
    setFileViewerFile(result);
    setFileViewerLoading(true);
    try {
      const r = await fetch(`${API_BASE}/files/content?path=${encodeURIComponent(result.fullPath)}`);
      if (!r.ok) throw new Error("Failed to fetch file content");
      const data = await r.json();
      setFileViewerContent(data.content);
      setFileViewerOpen(true);
    } catch (err) {
      setFileViewerContent(`Error loading file: ${err.message}`);
      setFileViewerOpen(true);
    } finally {
      setFileViewerLoading(false);
    }
  };
  // FAB toggle
  const toggleChat = () => setChatOpen(o=>!o);

  const highlightId = selected?.id || null;
  const connColor={connecting:T.amber,ok:T.green,error:T.coral}[conn];
  const connLabel={connecting:"Connecting…",ok:stats?.model??"Connected",error:"Backend offline"}[conn];

  const tabs=[
    {id:"graph",  label:"Knowledge Graph",  icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><path d="M12 8v3M5 16l7-3M19 16l-7-3"/></svg>},
    {id:"similarity", label:"Similarity", icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="7" cy="12" r="3"/><circle cx="17" cy="12" r="3"/><path d="M10 12h4"/></svg>},
    {id:"ingest", label:"File Ingestion",   icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>},
    {id:"manage", label:"File Manager",     icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 11V7a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8"/><path d="M18 16v6M15 19h6"/></svg>},
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
              <div style={{ fontSize:14,fontWeight:700,letterSpacing:"-0.02em",lineHeight:1.1 }}>Semantic Memory Graph File Explorer</div>
            </div>
          </div>
          <div style={{ flex:1,maxWidth:780 }}>
            <SearchBar value={query} onChange={setQuery} onSearch={handleSearch} loading={loading}/>
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:8,flexShrink:0,
            padding:"7px 13px",background:T.panel,borderRadius:10,border:`1px solid ${T.border}` }}>
            <Dot color={connColor} size={7} pulse={conn==="connecting"}/>
            <span style={{ fontSize:11,color:T.muted,fontFamily:"'DM Mono',monospace" }}>{connLabel}</span>
            <button
              onClick={() => setPresetPopupOpen(v => !v)}
              style={{
                height:24,
                padding:"0 8px",
                borderRadius:7,
                border:`1px solid ${T.blue}66`,
                background:T.blueDim,
                color:T.blue,
                fontSize:10,
                fontWeight:700,
                cursor:"pointer",
                fontFamily:"inherit",
              }}
              title="Build and save virtual folder presets"
            >
              Virtual Folders
            </button>
          </div>
        </header>

        {/* ── 3-column body (unchanged) ── */}
        <div style={{
          flex:1,
          display:"grid",
          gridTemplateColumns:`${resultsCollapsed ? "52px" : "310px"} 1fr ${scoreCollapsed ? "52px" : "268px"}`,
          minHeight:0,
          overflow:"hidden",
          transition:"grid-template-columns .2s ease"
        }}>

          {/* Col 1 — Results */}
          <aside style={{ borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",overflow:"hidden",background:T.surface }}>
            <div style={{ padding:"13px 15px 9px",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8 }}>
              {resultsCollapsed ? (
                <span style={{ fontSize:10,color:T.faint,letterSpacing:"0.08em",fontWeight:600,writingMode:"vertical-rl",transform:"rotate(180deg)",margin:"0 auto" }}>RESULTS</span>
              ) : (
                <>
                  <span style={{ fontSize:10,color:T.faint,letterSpacing:"0.08em",fontWeight:600 }}>RESULTS</span>
                  {searched&&<span className="fu" style={{ fontSize:11,color:T.teal,background:T.tealDim,padding:"2px 8px",borderRadius:10,fontFamily:"'DM Mono',monospace" }}>{results.length} found</span>}
                </>
              )}
              <button
                onClick={() => setResultsCollapsed(v => !v)}
                style={{
                  width:24,
                  height:24,
                  borderRadius:7,
                  border:`1px solid ${T.border}`,
                  background:T.panel,
                  color:T.muted,
                  cursor:"pointer",
                  display:"flex",
                  alignItems:"center",
                  justifyContent:"center",
                  flexShrink:0,
                  transition:"all .15s"
                }}
                onMouseEnter={e=>{e.currentTarget.style.color=T.text;e.currentTarget.style.borderColor=T.borderMd;}}
                onMouseLeave={e=>{e.currentTarget.style.color=T.muted;e.currentTarget.style.borderColor=T.border;}}
                title={resultsCollapsed ? "Expand results panel" : "Collapse results panel"}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d={resultsCollapsed ? "m9 18 6-6-6-6" : "m15 18-6-6 6-6"}/>
                </svg>
              </button>
            </div>
            {!resultsCollapsed && (
              <>
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
                      onAsk={handleAsk}
                      onView={handleView}/>
                  ))}
                </div>
              </>
            )}
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
                ?<GraphPanel
                    graphData={graphData}
                    highlightId={highlightId}
                  />
                :tab==="similarity"
                  ?<SimilarityPanel/>
                :tab==="ingest"
                  ?<IngestPanel onIngestComplete={()=>{fetchGraph();fetchStats();fetchVirtualFolders();}} stats={stats}/>
                  :<FileManagerPanel onManaged={()=>{fetchGraph();fetchStats();fetchVirtualFolders();}}/>}
            </div>
          </main>

          {/* Col 3 — Detail */}
          <aside style={{ borderLeft:`1px solid ${T.border}`,display:"flex",flexDirection:"column",overflow:"hidden",background:T.surface }}>
            <div style={{ padding: scoreCollapsed ? "10px 8px" : "13px 17px 9px",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8 }}>
              {scoreCollapsed ? (
                <span style={{ fontSize:10,color:T.faint,letterSpacing:"0.08em",fontWeight:600,writingMode:"vertical-rl",transform:"rotate(180deg)",margin:"0 auto" }}>SCORE</span>
              ) : (
                <span style={{ fontSize:10,color:T.faint,letterSpacing:"0.08em",fontWeight:600 }}>SCORE BREAKDOWN</span>
              )}
              <button
                onClick={() => setScoreCollapsed(v => !v)}
                style={{
                  width:24,
                  height:24,
                  borderRadius:7,
                  border:`1px solid ${T.border}`,
                  background:T.panel,
                  color:T.muted,
                  cursor:"pointer",
                  display:"flex",
                  alignItems:"center",
                  justifyContent:"center",
                  flexShrink:0,
                  transition:"all .15s"
                }}
                onMouseEnter={e=>{e.currentTarget.style.color=T.text;e.currentTarget.style.borderColor=T.borderMd;}}
                onMouseLeave={e=>{e.currentTarget.style.color=T.muted;e.currentTarget.style.borderColor=T.border;}}
                title={scoreCollapsed ? "Expand score panel" : "Collapse score panel"}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d={scoreCollapsed ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"}/>
                </svg>
              </button>
            </div>
            {!scoreCollapsed && (
              <>
                <Sep/>
                <div style={{ flex:1,overflowY:"auto" }}><DetailPanel result={selected}/></div>
              </>
            )}
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

      {/* ── File Viewer Modal ── */}
      <FileViewer
        open={fileViewerOpen}
        file={fileViewerFile}
        content={fileViewerContent}
        loading={fileViewerLoading}
        onClose={()=>setFileViewerOpen(false)}
      />

      {/* ── FAB ── */}
      <ChatFAB open={chatOpen} hasTarget={!!chatTarget} onClick={toggleChat}/>

      <VirtualPresetPopup
        open={presetPopupOpen}
        loading={virtualLoading}
        presetName={presetName}
        setPresetName={setPresetName}
        topic={presetTopic}
        setTopic={setPresetTopic}
        person={presetPerson}
        setPerson={setPresetPerson}
        relation={presetRelation}
        setRelation={setPresetRelation}
        presets={savedPresets}
        virtualFolders={virtualFolders}
        onBuild={() => applyVirtualFilters({
          topic: presetTopic,
          person: presetPerson,
          relation: presetRelation !== "ALL" ? presetRelation : "",
        })}
        onSave={saveCurrentPreset}
        onApplyPreset={applySavedPreset}
        onDeletePreset={deletePreset}
        onOpenFolder={(folder) => { runSearch(folder?.query_hint || folder?.title || ""); setPresetPopupOpen(false); }}
        onClose={() => setPresetPopupOpen(false)}
      />
    </>
  );
}