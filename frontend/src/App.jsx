import { useState, useCallback, useEffect, useRef } from "react";

const API_BASE = "http://localhost:8000";

/* ─── Design tokens ─────────────────────────────────────────────────────── */
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

const EDGE_COLOR = { VERSION_OF: T.blue, CO_LOCATED: T.teal, RELATED_TO: T.amber };
const EXT_COLOR  = {
  pdf:  { fg: T.coral,  bg: T.coralDim  },
  md:   { fg: T.teal,   bg: T.tealDim   },
  docx: { fg: T.blue,   bg: T.blueDim   },
  py:   { fg: T.green,  bg: T.greenDim  },
  txt:  { fg: T.violet, bg: T.violetDim },
  json: { fg: T.amber,  bg: T.amberDim  },
};

/* ─── Global styles ─────────────────────────────────────────────────────── */
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600&family=DM+Mono:wght@400;500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; width: 100%; overflow: hidden; background: ${T.bg}; font-family: 'DM Sans', system-ui, sans-serif; color: ${T.text}; font-size: 14px; -webkit-font-smoothing: antialiased; }
  ::-webkit-scrollbar { width: 3px; height: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${T.faint}; border-radius: 2px; }
  input, button, kbd { font-family: inherit; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:.35} }
  @keyframes spin   { to { transform: rotate(360deg); } }
  @keyframes shimmer{ 0%{background-position:-400px 0} 100%{background-position:400px 0} }
  .fu  { animation: fadeUp .28s ease both; }
  .fu1 { animation: fadeUp .28s .05s ease both; }
  .fu2 { animation: fadeUp .28s .10s ease both; }
  .fu3 { animation: fadeUp .28s .15s ease both; }
  .fu4 { animation: fadeUp .28s .20s ease both; }
  .sk  { background: linear-gradient(90deg,${T.panel} 25%,${T.raised} 50%,${T.panel} 75%); background-size:400px 100%; animation:shimmer 1.4s infinite; border-radius:6px; }
`;

/* ─── Primitives ────────────────────────────────────────────────────────── */
const Pill = ({ label, fg, bg, size = 10 }) => (
  <span style={{ display:"inline-flex", alignItems:"center", fontSize:size, fontWeight:600,
    letterSpacing:"0.06em", padding:"2px 8px", borderRadius:20, background:bg, color:fg,
    whiteSpace:"nowrap", fontFamily:"'DM Mono',monospace" }}>{label}</span>
);

const Dot = ({ color, size = 7, pulse = false }) => (
  <span style={{ display:"inline-block", width:size, height:size, borderRadius:"50%",
    background:color, flexShrink:0, animation:pulse?"pulse 2s ease infinite":"none" }} />
);

const Sep = () => <div style={{ height:1, background:T.border, margin:"0 16px" }} />;

const Bar = ({ label, value, color, delay = 0 }) => (
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

/* ─── SearchBar ─────────────────────────────────────────────────────────── */
function SearchBar({ value, onChange, onSearch, loading }) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef();

  useEffect(() => {
    const h = e => { if ((e.metaKey||e.ctrlKey) && e.key==="k") { e.preventDefault(); inputRef.current?.focus(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <div
      style={{ display:"flex", alignItems:"center", gap:12, height:48, padding:"0 16px",
        background: focused ? T.raised : T.panel,
        border:`1.5px solid ${focused ? T.blue : T.borderMd}`,
        borderRadius:14,
        transition:"all .2s",
        boxShadow: focused ? `0 0 0 3px ${T.blueDim},0 4px 20px rgba(0,0,0,.3)` : "0 2px 8px rgba(0,0,0,.2)" }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {loading
        ? <div style={{ width:17, height:17, border:`2px solid ${T.faint}`, borderTopColor:T.blue,
            borderRadius:"50%", animation:"spin .7s linear infinite", flexShrink:0 }} />
        : <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
            stroke={focused ? T.blue : T.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ flexShrink:0, transition:"stroke .2s" }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
      }
      <input ref={inputRef} value={value} onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key==="Enter" && onSearch()}
        placeholder='Search your knowledge base… try "latest resume" or "cloudflare invoice"'
        style={{ flex:1, background:"transparent", border:"none", outline:"none",
          color:T.text, fontSize:14, caretColor:T.blue }} />
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <kbd style={{ fontSize:10, color:T.faint, background:T.raised, border:`1px solid ${T.border}`,
          borderRadius:5, padding:"2px 6px", fontFamily:"'DM Mono',monospace", flexShrink:0 }}>⌘K</kbd>
        <button onClick={onSearch}
          style={{ background:loading?T.faint:T.blue, border:"none", borderRadius:9,
            padding:"7px 18px", color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer",
            transition:"all .15s", whiteSpace:"nowrap",
            boxShadow:loading?"none":`0 2px 12px ${T.blueDim}` }}
          onMouseEnter={e => { if(!loading) e.currentTarget.style.transform="translateY(-1px)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform=""; }}>
          Search
        </button>
      </div>
    </div>
  );
}

/* ─── ResultCard ────────────────────────────────────────────────────────── */
function ResultCard({ result, selected, onClick, index }) {
  const ec = EXT_COLOR[result.ext] || EXT_COLOR.txt;
  const pct = Math.round(result.final * 100);
  const rankColor = pct>=80 ? T.green : pct>=60 ? T.amber : T.muted;

  return (
    <div className={`fu${Math.min(index+1,4)}`} onClick={onClick}
      style={{ position:"relative", background:selected?T.raised:"transparent",
        border:`1px solid ${selected?T.borderHi:"transparent"}`,
        borderRadius:12, padding:"13px 15px", cursor:"pointer",
        transition:"all .18s", marginBottom:3, overflow:"hidden" }}
      onMouseEnter={e => { if(!selected){ e.currentTarget.style.background=T.panel; e.currentTarget.style.borderColor=T.border; } }}
      onMouseLeave={e => { if(!selected){ e.currentTarget.style.background="transparent"; e.currentTarget.style.borderColor="transparent"; } }}
    >
      {selected && <div style={{ position:"absolute", left:0, top:"18%", bottom:"18%", width:3, background:T.blue, borderRadius:"0 3px 3px 0" }} />}

      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7 }}>
        <Pill label={result.ext.toUpperCase()} fg={ec.fg} bg={ec.bg} />
        <span style={{ flex:1, fontSize:13, fontWeight:500, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {result.file}
        </span>
        <span style={{ fontSize:17, fontWeight:700, color:rankColor, fontFamily:"'DM Mono',monospace", lineHeight:1, flexShrink:0 }}>
          {pct}
        </span>
      </div>

      <div style={{ fontSize:11, color:T.faint, marginBottom:7, display:"flex", gap:5, alignItems:"center" }}>
        <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{result.path}</span>
        <span style={{ flexShrink:0 }}>{result.chunk}</span>
        <span style={{ color:T.border }}>·</span>
        <span style={{ flexShrink:0 }}>{result.date}</span>
      </div>

      <p style={{ fontSize:12, color:T.muted, lineHeight:1.65, margin:0,
        display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>
        {result.snippet}
      </p>

      {result.tags.length > 0 && (
        <div style={{ display:"flex", gap:5, marginTop:9, flexWrap:"wrap" }}>
          {result.tags.map(t => (
            <Pill key={t} label={t.replace(/_/g," ")} fg={EDGE_COLOR[t]||T.muted} bg={`${(EDGE_COLOR[t]||T.muted)}18`} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Skeleton + Empty ──────────────────────────────────────────────────── */
const SkeletonCard = ({ delay }) => (
  <div style={{ padding:"14px 15px", marginBottom:3, animation:`fadeUp .28s ${delay}s ease both` }}>
    <div style={{ display:"flex", gap:8, marginBottom:9 }}>
      <div className="sk" style={{ width:38, height:20 }} />
      <div className="sk" style={{ flex:1, height:20 }} />
      <div className="sk" style={{ width:26, height:20 }} />
    </div>
    <div className="sk" style={{ width:"55%", height:11, marginBottom:7 }} />
    <div className="sk" style={{ width:"100%", height:11, marginBottom:5 }} />
    <div className="sk" style={{ width:"70%", height:11 }} />
  </div>
);

const Empty = ({ icon, title, sub }) => (
  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
    height:"100%", padding:32, textAlign:"center", gap:10 }}>
    <div style={{ fontSize:32, opacity:0.12 }}>{icon}</div>
    <div style={{ fontSize:13, fontWeight:500, color:T.muted }}>{title}</div>
    {sub && <div style={{ fontSize:11, color:T.faint, lineHeight:1.65, maxWidth:220 }}>{sub}</div>}
  </div>
);

/* ─── Detail panel ──────────────────────────────────────────────────────── */
function DetailPanel({ result }) {
  if (!result) return (
    <Empty icon="◎" title="Nothing selected"
      sub="Pick a result to see its score breakdown and document relationships" />
  );

  const ec = EXT_COLOR[result.ext] || EXT_COLOR.txt;
  const pct = Math.round(result.final * 100);
  const rc  = pct>=80 ? T.green : pct>=60 ? T.amber : T.coral;
  const circ = 2 * Math.PI * 24; // r=24

  return (
    <div className="fu" style={{ padding:"18px 16px", display:"flex", flexDirection:"column", gap:16 }}>

      {/* File identity */}
      <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
        <div style={{ width:42, height:42, borderRadius:10, background:ec.bg,
          display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <span style={{ fontSize:11, fontWeight:700, color:ec.fg, fontFamily:"'DM Mono'" }}>
            {result.ext.toUpperCase()}
          </span>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:600, color:T.text, wordBreak:"break-all", lineHeight:1.4 }}>{result.file}</div>
          <div style={{ fontSize:11, color:T.faint, marginTop:3 }}>{result.path}</div>
          <div style={{ fontSize:11, color:T.faint }}>{result.chunk} · {result.date}</div>
        </div>
      </div>

      {/* Score ring */}
      <div style={{ background:T.raised, borderRadius:12, padding:14, border:`1px solid ${T.border}`,
        display:"flex", alignItems:"center", gap:14 }}>
        <svg width="58" height="58" viewBox="0 0 58 58" style={{ flexShrink:0 }}>
          <circle cx="29" cy="29" r="24" fill="none" stroke={T.panel} strokeWidth="5.5" />
          <circle cx="29" cy="29" r="24" fill="none" stroke={rc} strokeWidth="5.5"
            strokeDasharray={`${pct/100*circ} ${circ}`}
            strokeLinecap="round" strokeDashoffset={circ*0.25}
            style={{ transition:"stroke-dasharray .8s cubic-bezier(.4,0,.2,1)",
              filter:`drop-shadow(0 0 5px ${rc}66)` }} />
          <text x="29" y="34" textAnchor="middle" fill={rc} fontSize="14"
            fontWeight="700" fontFamily="'DM Mono',monospace">{pct}</text>
        </svg>
        <div>
          <div style={{ fontSize:10, color:T.faint, letterSpacing:"0.07em", marginBottom:3 }}>RELEVANCE SCORE</div>
          <div style={{ fontSize:13, fontWeight:500, color:T.text }}>
            {pct>=80?"Strong match":pct>=60?"Good match":"Partial match"}
          </div>
          <div style={{ fontSize:11, color:T.faint, marginTop:2 }}>Hybrid BM25 + semantic + graph</div>
        </div>
      </div>

      {/* Breakdown bars */}
      <div style={{ background:T.raised, borderRadius:12, padding:"14px 14px", border:`1px solid ${T.border}` }}>
        <div style={{ fontSize:10, color:T.faint, letterSpacing:"0.08em", marginBottom:13 }}>RETRIEVAL BREAKDOWN</div>
        <Bar label="Semantic similarity" value={result.scores.semantic} color={T.blue}   delay={0.0} />
        <Bar label="BM25 lexical"        value={result.scores.bm25}     color={T.teal}   delay={0.1} />
        <Bar label="Graph centrality"    value={result.scores.graph}    color={T.violet} delay={0.2} />
      </div>

      {/* Relationships */}
      {result.tags.length > 0 && (
        <div style={{ background:T.raised, borderRadius:12, padding:"14px 14px", border:`1px solid ${T.border}` }}>
          <div style={{ fontSize:10, color:T.faint, letterSpacing:"0.08em", marginBottom:11 }}>RELATIONSHIPS</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {result.tags.map(t => {
              const c = EDGE_COLOR[t] || T.muted;
              return (
                <div key={t} style={{ display:"flex", alignItems:"center", gap:10,
                  padding:"9px 12px", background:`${c}0d`, borderRadius:8, border:`1px solid ${c}28` }}>
                  <Dot color={c} size={7} />
                  <span style={{ fontSize:12, color:T.text, fontWeight:500 }}>{t.replace(/_/g," ")}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Preview */}
      <div style={{ background:T.raised, borderRadius:12, padding:"14px 14px", border:`1px solid ${T.border}` }}>
        <div style={{ fontSize:10, color:T.faint, letterSpacing:"0.08em", marginBottom:10 }}>CONTENT PREVIEW</div>
        <p style={{ fontSize:11, color:T.muted, lineHeight:1.8, margin:0, fontFamily:"'DM Mono',monospace" }}>
          {result.snippet || "No preview available."}
        </p>
      </div>
    </div>
  );
}

/* ─── Graph panel ───────────────────────────────────────────────────────── */
function GraphPanel({ graphData, highlightId }) {
  const [hovered, setHovered] = useState(null);
  const [filter,  setFilter]  = useState("ALL");

  if (!graphData || graphData.nodes.length === 0)
    return <Empty icon="⬡" title="No graph data" sub="Index some documents and the relationship graph will appear here" />;

  const nodeMap = {};
  graphData.nodes.forEach(n => (nodeMap[n.id] = n));
  const visibleEdges = graphData.edges.filter(e => filter==="ALL" || e.type===filter);

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", padding:"14px 16px" }}>
      {/* Filter row */}
      <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap", flexShrink:0 }}>
        {["ALL","VERSION_OF","CO_LOCATED","RELATED_TO"].map(f => {
          const active = filter===f;
          const c = EDGE_COLOR[f] || T.blue;
          return (
            <button key={f} onClick={() => setFilter(f)}
              style={{ fontSize:10, fontWeight:600, letterSpacing:"0.05em", padding:"4px 12px",
                borderRadius:20, border:`1px solid ${active?c:T.border}`,
                background:active?`${c}18`:"transparent", color:active?c:T.muted,
                cursor:"pointer", fontFamily:"inherit", transition:"all .15s" }}>
              {f==="ALL" ? "All edges" : f.replace(/_/g," ")}
            </button>
          );
        })}
      </div>

      {/* Graph canvas */}
      <div style={{ flex:1, borderRadius:12, overflow:"hidden", border:`1px solid ${T.border}`,
        background:`radial-gradient(ellipse at 40% 40%, ${T.raised} 0%, ${T.panel} 100%)`,
        position:"relative" }}>
        <svg width="100%" height="100%" viewBox="0 0 560 400" style={{ display:"block" }}>
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          {visibleEdges.map((e, i) => {
            const a = nodeMap[e.from], b = nodeMap[e.to];
            if (!a || !b) return null;
            const c = EDGE_COLOR[e.type] || T.muted;
            const hi = hovered===a.id || hovered===b.id || highlightId===a.id || highlightId===b.id;
            return (
              <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={c} strokeWidth={hi ? e.weight*3.5 : e.weight*1.2}
                strokeOpacity={hi ? 0.85 : 0.2}
                strokeDasharray={e.type==="RELATED_TO" ? "5 4" : undefined}
                style={{ transition:"stroke-opacity .2s,stroke-width .2s" }} />
            );
          })}

          {graphData.nodes.map(n => {
            const hi = hovered===n.id || highlightId===n.id;
            const r  = hi ? (n.size||10)+5 : (n.size||10);
            return (
              <g key={n.id} onMouseEnter={() => setHovered(n.id)} onMouseLeave={() => setHovered(null)} style={{ cursor:"pointer" }}>
                {hi && <circle cx={n.x} cy={n.y} r={r+8} fill={n.color} fillOpacity={0.10} />}
                <circle cx={n.x} cy={n.y} r={r} fill={n.color}
                  fillOpacity={hi?1:0.65}
                  filter={hi?"url(#glow)":undefined}
                  style={{ transition:"all .18s" }} />
                {hi && (
                  <g>
                    <rect x={n.x+r+8} y={n.y-11} rx={6}
                      width={Math.min(n.label.length*6+16,195)} height={21}
                      fill={T.surface} stroke={T.borderMd} strokeWidth={1} />
                    <text x={n.x+r+16} y={n.y+3.5}
                      fill={T.text} fontSize={10} fontFamily="'DM Sans',sans-serif" fontWeight="500">
                      {n.label.length>27 ? n.label.slice(0,25)+"…" : n.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div style={{ display:"flex", gap:18, marginTop:11, flexWrap:"wrap", flexShrink:0 }}>
        {Object.entries(EDGE_COLOR).map(([type, color]) => (
          <div key={type} style={{ display:"flex", alignItems:"center", gap:6 }}>
            <div style={{ width:18, height:2, borderRadius:1,
              background:type==="RELATED_TO"?"transparent":color,
              ...(type==="RELATED_TO" ? { borderTop:`2px dashed ${color}` } : {}) }} />
            <span style={{ fontSize:10, color:T.faint }}>{type.replace(/_/g," ")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Ingest panel ──────────────────────────────────────────────────────── */
function IngestPanel({ onIngestComplete, stats }) {
  const [dragging, setDragging] = useState(false);
  const [files,    setFiles]    = useState([]);

  const statusStyle = {
    indexed:  { color:T.green,  label:"Indexed"   },
    indexing: { color:T.amber,  label:"Indexing…" },
    error:    { color:T.coral,  label:"Failed"    },
  };

  const upload = async fileList => {
    const arr = Array.from(fileList);
    if (!arr.length) return;
    const pending = arr.map(f => ({
      name:f.name, size:`${Math.max(1,Math.round(f.size/1024))} KB`,
      status:"indexing", ext:f.name.split(".").pop().toLowerCase(),
    }));
    setFiles(prev => [...pending, ...prev]);
    const form = new FormData();
    arr.forEach(f => form.append("files", f));
    try {
      const res  = await fetch(`${API_BASE}/ingest`, { method:"POST", body:form });
      const data = await res.json();
      const saved   = new Set((data.saved   ||[]).map(s=>s.file));
      const skipped = new Set((data.skipped ||[]).map(s=>s.file));
      setFiles(prev => prev.map(f =>
        saved.has(f.name)   ? {...f,status:"indexed"} :
        skipped.has(f.name) ? {...f,status:"error"}   : f
      ));
      if (onIngestComplete) onIngestComplete();
    } catch {
      setFiles(prev => prev.map(f =>
        pending.find(p=>p.name===f.name) ? {...f,status:"error"} : f
      ));
    }
  };

  const handleDrop = useCallback(async e => { e.preventDefault(); setDragging(false); await upload(e.dataTransfer.files); }, []);

  return (
    <div style={{ padding:"16px", display:"flex", flexDirection:"column", gap:14, height:"100%", overflowY:"auto" }}>
      {/* Stat cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
        {[
          { label:"Documents",  value:stats?.total_documents??"—", color:T.blue   },
          { label:"Chunks",     value:stats?.total_chunks   ??"—", color:T.teal   },
          { label:"Graph edges",value:stats?.graph_edges    ??"—", color:T.amber  },
        ].map(s => (
          <div key={s.label} style={{ background:T.raised, borderRadius:10, padding:"14px 12px", border:`1px solid ${T.border}` }}>
            <div style={{ fontSize:22, fontWeight:700, color:s.color, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{s.value}</div>
            <div style={{ fontSize:10, color:T.faint, marginTop:4, letterSpacing:"0.04em" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Drop zone */}
      <label htmlFor="file-upload" style={{ cursor:"pointer", display:"block" }}>
        <div onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={handleDrop}
          style={{ border:`2px dashed ${dragging?T.blue:T.border}`, borderRadius:14, padding:"26px 20px",
            textAlign:"center", background:dragging?T.blueDim:T.panel, transition:"all .2s",
            boxShadow:dragging?`0 0 0 3px ${T.blueDim}`:"none" }}>
          <div style={{ width:40, height:40, borderRadius:10,
            background:dragging?T.blueDim:T.raised, border:`1px solid ${dragging?T.blue:T.border}`,
            display:"flex", alignItems:"center", justifyContent:"center",
            margin:"0 auto 12px", transition:"all .2s" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke={dragging?T.blue:T.muted} strokeWidth="2" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <div style={{ fontSize:13, fontWeight:500, color:dragging?T.blue:T.text, marginBottom:4 }}>
            {dragging ? "Release to upload" : "Drop files here or click to browse"}
          </div>
          <div style={{ fontSize:11, color:T.faint }}>.txt · .md · .pdf · .docx · .py · .json</div>
        </div>
      </label>
      <input id="file-upload" type="file" multiple accept=".txt,.md,.pdf,.docx,.py,.json"
        onChange={e=>{upload(e.target.files);e.target.value="";}} style={{ display:"none" }} />

      {/* File list */}
      {files.length > 0 && (
        <div>
          <div style={{ fontSize:10, color:T.faint, letterSpacing:"0.08em", marginBottom:8 }}>RECENT UPLOADS</div>
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            {files.slice(0,10).map((f,i) => {
              const ec = EXT_COLOR[f.ext] || EXT_COLOR.txt;
              const sc = statusStyle[f.status] || statusStyle.indexing;
              return (
                <div key={i} className="fu"
                  style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 12px",
                    background:T.raised, borderRadius:9, border:`1px solid ${T.border}` }}>
                  <Pill label={f.ext.toUpperCase()} fg={ec.fg} bg={ec.bg} />
                  <span style={{ flex:1, fontSize:12, color:T.text, overflow:"hidden",
                    textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</span>
                  <span style={{ fontSize:10, color:T.faint, flexShrink:0 }}>{f.size}</span>
                  <div style={{ display:"flex", alignItems:"center", gap:5, flexShrink:0 }}>
                    <Dot color={sc.color} size={6} pulse={f.status==="indexing"} />
                    <span style={{ fontSize:10, fontWeight:600, color:sc.color }}>{sc.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── App ───────────────────────────────────────────────────────────────── */
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

  const fetchGraph = useCallback(async () => {
    try { const r = await fetch(`${API_BASE}/graph`); setGraphData(await r.json()); } catch {}
  }, []);

  const fetchStats = useCallback(async () => {
    try { const r = await fetch(`${API_BASE}/status`); setStats(await r.json()); setConn("ok"); }
    catch { setConn("error"); }
  }, []);

  useEffect(() => { fetchGraph(); fetchStats(); }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true); setSearched(false); setSelected(null); setResults([]);
    try {
      const r = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query.trim())}`);
      const d = await r.json();
      setResults(d.results||[]);
      setSelected(d.results?.[0]??null);
      setSearched(true);
    } catch { setSearched(true); }
    finally { setLoading(false); }
  };

  const highlightId = selected && graphData
    ? graphData.nodes.find(n => n.label.toLowerCase().includes(selected.file.split(".")[0].toLowerCase().slice(0,12)))?.id
    : null;

  const connColor = { connecting:T.amber, ok:T.green, error:T.coral }[conn];
  const connLabel = { connecting:"Connecting…", ok:stats?.model??"Connected", error:"Backend offline" }[conn];

  const tabs = [
    { id:"graph",  label:"Knowledge Graph",
      icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><path d="M12 8v3M5 16l7-3M19 16l-7-3"/></svg> },
    { id:"ingest", label:"File Ingestion",
      icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> },
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />

      <div style={{ display:"flex", flexDirection:"column", height:"100vh", width:"100vw", overflow:"hidden" }}>

        {/* ── Topbar ── */}
        <header style={{ display:"flex", alignItems:"center", gap:16, padding:"10px 20px",
          background:T.surface, borderBottom:`1px solid ${T.border}`, flexShrink:0, zIndex:10 }}>

          <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
            <div style={{ width:34, height:34, borderRadius:10,
              background:`linear-gradient(135deg,${T.blueDim},${T.tealDim})`,
              border:`1px solid ${T.borderMd}`,
              display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="3" fill={T.blue}/>
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"
                  stroke={T.teal} strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, letterSpacing:"-0.02em", lineHeight:1.1 }}>SMG File Explorer</div>
              
            </div>
          </div>

          <div style={{ flex:1, maxWidth:780 }}>
            <SearchBar value={query} onChange={setQuery} onSearch={handleSearch} loading={loading} />
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0,
            padding:"7px 13px", background:T.panel, borderRadius:10, border:`1px solid ${T.border}` }}>
            <Dot color={connColor} size={7} pulse={conn==="connecting"} />
            <span style={{ fontSize:11, color:T.muted, fontFamily:"'DM Mono',monospace" }}>{connLabel}</span>
          </div>
        </header>

        {/* ── 3-column body ── */}
        <div style={{ flex:1, display:"grid", gridTemplateColumns:"310px 1fr 268px", minHeight:0, overflow:"hidden" }}>

          {/* Col 1 — Results */}
          <aside style={{ borderRight:`1px solid ${T.border}`, display:"flex",
            flexDirection:"column", overflow:"hidden", background:T.surface }}>

            <div style={{ padding:"13px 15px 9px", flexShrink:0,
              display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontSize:10, color:T.faint, letterSpacing:"0.08em", fontWeight:600 }}>RESULTS</span>
              {searched && (
                <span className="fu" style={{ fontSize:11, color:T.teal, background:T.tealDim,
                  padding:"2px 8px", borderRadius:10, fontFamily:"'DM Mono',monospace" }}>
                  {results.length} found
                </span>
              )}
            </div>
            <Sep />

            <div style={{ flex:1, overflowY:"auto", padding:"8px 8px" }}>
              {loading && [0,1,2,3].map(i => <SkeletonCard key={i} delay={i*0.07} />)}

              {!loading && !searched && (
                <Empty icon="⌕" title="Search your documents"
                  sub='Natural language queries like "latest resume" or "invoices from cloudflare" work great' />
              )}

              {!loading && searched && results.length===0 && (
                <Empty icon="∅" title="No results found" sub="Try different keywords or check that your documents are indexed" />
              )}

              {!loading && searched && results.map((r,i) => (
                <ResultCard key={r.id} result={r} index={i}
                  selected={selected?.id===r.id} onClick={() => setSelected(r)} />
              ))}
            </div>
          </aside>

          {/* Col 2 — Graph / Ingest */}
          <main style={{ display:"flex", flexDirection:"column", overflow:"hidden", background:T.bg }}>
            {/* Tab bar */}
            <div style={{ display:"flex", gap:2, padding:"10px 16px 0",
              borderBottom:`1px solid ${T.border}`, flexShrink:0, background:T.surface }}>
              {tabs.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  style={{ display:"flex", alignItems:"center", gap:6, background:"transparent",
                    border:"none", borderBottom:`2px solid ${tab===t.id?T.blue:"transparent"}`,
                    padding:"8px 12px", marginBottom:-1, color:tab===t.id?T.text:T.muted,
                    fontSize:12, fontWeight:tab===t.id?600:400, cursor:"pointer",
                    fontFamily:"inherit", transition:"all .15s" }}>
                  {t.icon}{t.label}
                </button>
              ))}
            </div>
            <div style={{ flex:1, overflow:"hidden" }}>
              {tab==="graph"
                ? <GraphPanel graphData={graphData} highlightId={highlightId} />
                : <IngestPanel onIngestComplete={() => { fetchGraph(); fetchStats(); }} stats={stats} />}
            </div>
          </main>

          {/* Col 3 — Detail */}
          <aside style={{ borderLeft:`1px solid ${T.border}`, display:"flex",
            flexDirection:"column", overflow:"hidden", background:T.surface }}>
            <div style={{ padding:"13px 17px 9px", flexShrink:0 }}>
              <span style={{ fontSize:10, color:T.faint, letterSpacing:"0.08em", fontWeight:600 }}>SCORE BREAKDOWN</span>
            </div>
            <Sep />
            <div style={{ flex:1, overflowY:"auto" }}>
              <DetailPanel result={selected} />
            </div>
          </aside>
        </div>

        {/* ── Status bar ── */}
        <footer style={{ display:"flex", alignItems:"center", gap:18, padding:"4px 20px",
          background:T.surface, borderTop:`1px solid ${T.border}`,
          fontSize:10, color:T.faint, fontFamily:"'DM Mono',monospace", flexShrink:0 }}>
          <span>{stats?.model??"—"}</span>
          <span style={{ color:T.border }}>│</span>
          <span>BM25 0.55 · Semantic 0.30 · Graph 0.10</span>
          <span style={{ color:T.border }}>│</span>
          <span>Reranking {stats?.reranking_enabled?"on":"off"}</span>
          <span style={{ color:T.border }}>│</span>
          <span>{stats?.total_documents??"—"} docs · {stats?.total_chunks??"—"} chunks</span>
          <div style={{ flex:1 }} />
          <span>100% local · no cloud APIs</span>
        </footer>
      </div>
    </>
  );
}