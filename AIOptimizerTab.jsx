import { useState, useCallback, useMemo } from "react";

const API_BASE = "http://localhost:3001/api";

const PLATFORMS = [
  { id:"amazon",        name:"Amazon Seller",  color:"#FF9900", bg:"#FFF8EC", icon:"ti-brand-amazon" },
  { id:"amazon_vendor", name:"Amazon Vendor",  color:"#146EB4", bg:"#EAF3FB", icon:"ti-building-store" },
  { id:"flipkart",      name:"Flipkart",       color:"#2874F0", bg:"#EBF2FF", icon:"ti-shopping-cart" },
  { id:"meesho",        name:"Meesho",         color:"#F43397", bg:"#FEE9F4", icon:"ti-tag" },
  { id:"shopify",       name:"Shopify",        color:"#96BF48", bg:"#F0F7E6", icon:"ti-brand-shopify" },
];

const inp = { width:"100%", boxSizing:"border-box", padding:"7px 11px", fontSize:13, borderRadius:7, border:"0.5px solid var(--color-border-secondary)", background:"var(--color-background-primary)", color:"var(--color-text-primary)" };

function ScoreRing({ score }) {
  const r = 28, cx = 32, cy = 32;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 75 ? "#16a34a" : score >= 50 ? "#ca8a04" : "#dc2626";
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" style={{ flexShrink:0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-border-tertiary)" strokeWidth="5" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 32 32)" />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        style={{ fontSize:14, fontWeight:600, fill:color }}>{score}</text>
    </svg>
  );
}

function RecBadge({ type }) {
  const map = { critical:{ bg:"var(--color-background-danger)", c:"var(--color-text-danger)", label:"Critical" }, warning:{ bg:"var(--color-background-warning)", c:"var(--color-text-warning)", label:"Warning" }, tip:{ bg:"var(--color-background-success)", c:"var(--color-text-success)", label:"Tip" } };
  const s = map[type] || map.tip;
  return <span style={{ fontSize:10, padding:"2px 7px", borderRadius:20, background:s.bg, color:s.c, fontWeight:500, whiteSpace:"nowrap" }}>{s.label}</span>;
}

function PlatformOptCard({ platform, data, onApply }) {
  const [expanded, setExpanded] = useState(false);
  const [applied, setApplied] = useState(false);
  const p = PLATFORMS.find(x=>x.id===platform);
  if (!p || !data) return null;

  const handleApply = () => { onApply(platform, data.optimized); setApplied(true); };

  return (
    <div style={{ border:`0.5px solid ${applied?"#16a34a":"var(--color-border-tertiary)"}`, borderRadius:12, overflow:"hidden", marginBottom:14 }}>
      {/* Header */}
      <div style={{ padding:"12px 16px", background:p.bg, display:"flex", alignItems:"center", gap:12 }}>
        <i className={`ti ${p.icon}`} style={{ fontSize:18, color:p.color }} aria-hidden="true" />
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:500, fontSize:14, color:"var(--color-text-primary)" }}>{p.name}</div>
          <div style={{ fontSize:12, color:"var(--color-text-secondary)" }}>{data.platform_insights?.slice(0,80)}…</div>
        </div>
        {data.score !== undefined && <ScoreRing score={data.score} />}
        <button onClick={()=>setExpanded(e=>!e)} style={{ padding:"5px 12px", borderRadius:8, border:"0.5px solid var(--color-border-secondary)", background:"var(--color-background-primary)", fontSize:12, cursor:"pointer", color:"var(--color-text-primary)" }}>
          {expanded?"Collapse":"Expand"}
        </button>
      </div>

      {expanded && (
        <div style={{ padding:16 }}>
          {/* Est improvement */}
          <div style={{ marginBottom:14, padding:"8px 12px", borderRadius:8, background:"var(--color-background-secondary)", fontSize:12 }}>
            <span style={{ color:"var(--color-text-secondary)" }}>Estimated improvement: </span>
            <strong>{data.estimated_improvement}</strong>
            {data.ab_test_suggestion && <>
              <span style={{ color:"var(--color-text-secondary)", marginLeft:12 }}>A/B test: </span>
              <span>{data.ab_test_suggestion}</span>
            </>}
          </div>

          {/* Optimized fields */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:12, fontWeight:500, marginBottom:8, color:"var(--color-text-secondary)" }}>OPTIMIZED CONTENT</div>
            {data.optimized && Object.entries(data.optimized).map(([field, value]) => (
              <div key={field} style={{ marginBottom:10 }}>
                <div style={{ fontSize:11, color:"var(--color-text-secondary)", marginBottom:3, textTransform:"uppercase", letterSpacing:"0.5px" }}>{field}</div>
                <div style={{ fontSize:13, padding:"7px 10px", background:"var(--color-background-secondary)", borderRadius:6, borderLeft:`3px solid ${p.color}`, lineHeight:1.5 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Recommendations */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:12, fontWeight:500, marginBottom:8, color:"var(--color-text-secondary)" }}>RECOMMENDATIONS</div>
            {(data.recommendations||[]).map((rec, i) => (
              <div key={i} style={{ marginBottom:10, padding:"8px 12px", borderRadius:8, border:"0.5px solid var(--color-border-tertiary)", background:"var(--color-background-primary)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                  <RecBadge type={rec.type} />
                  <span style={{ fontSize:12, fontWeight:500, color:"var(--color-text-secondary)" }}>{rec.field}</span>
                </div>
                <div style={{ fontSize:12, color:"var(--color-text-danger)", marginBottom:3 }}>Issue: {rec.issue}</div>
                <div style={{ fontSize:12, color:"var(--color-text-success)" }}>Fix: {rec.fix}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={handleApply} disabled={applied} style={{ flex:1, padding:"9px 0", borderRadius:8, border:"none", background:applied?"var(--color-background-success)":"#2563EB", color:applied?"var(--color-text-success)":"#fff", fontSize:13, fontWeight:500, cursor:applied?"default":"pointer" }}>
              {applied?"✓ Applied to product":"Apply optimizations to listing"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AIOptimizerTab({ product, onProductUpdate }) {
  const [selectedPlatforms, setSelectedPlatforms] = useState(new Set(["amazon","flipkart"]));
  const [anthropicKey, setAnthropicKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");

  const togglePlatform = id => setSelectedPlatforms(prev => { const s=new Set(prev); s.has(id)?s.delete(id):s.add(id); return s; });

  const runOptimization = async () => {
    if (!product?.title) { setError("No product loaded. Fill in product details in the Create tab first."); return; }
    setLoading(true); setError(""); setResults(null);
    try {
      const res = await fetch(`${API_BASE}/optimize`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ product, platforms:[...selectedPlatforms], anthropic_key:anthropicKey||undefined })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResults(data.results);
    } catch(e) { setError(e.message); }
    setLoading(false);
  };

  const handleApply = (platform, optimized) => {
    if (onProductUpdate) onProductUpdate(prev => ({ ...prev, ...optimized }));
  };

  const overallScore = useMemo(() => {
    if (!results) return null;
    // FIX BUG 11: Guard against divide-by-zero when no platforms returned a score
    const scored = Object.values(results).filter(r => typeof r.score === "number");
    if (scored.length === 0) return null;
    return Math.round(scored.reduce((a, r) => a + r.score, 0) / scored.length);
  }, [results]);

  return (
    <div>
      {/* Header info */}
      <div style={{ marginBottom:20 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
          <i className="ti ti-sparkles" style={{ fontSize:18, color:"#7c3aed" }} aria-hidden="true" />
          <span style={{ fontSize:16, fontWeight:500 }}>AI Listing Optimizer</span>
        </div>
        <p style={{ margin:0, fontSize:13, color:"var(--color-text-secondary)" }}>
          Claude analyzes your listing against each platform's algorithm and generates optimized titles, bullets, keywords, and actionable recommendations.
        </p>
      </div>

      {/* Current product summary */}
      {product?.title ? (
        <div style={{ marginBottom:16, padding:"10px 14px", background:"var(--color-background-secondary)", borderRadius:10, fontSize:13 }}>
          <span style={{ color:"var(--color-text-secondary)" }}>Optimizing: </span>
          <strong>{product.title}</strong>
          {product.category && <span style={{ color:"var(--color-text-secondary)", marginLeft:10 }}>in {product.category}</span>}
        </div>
      ) : (
        <div style={{ marginBottom:16, padding:"10px 14px", background:"var(--color-background-warning)", borderRadius:10, fontSize:13, color:"var(--color-text-warning)" }}>
          <i className="ti ti-info-circle" style={{ marginRight:5 }} />
          No product loaded. Fill in product details in the Create tab first, then return here.
        </div>
      )}

      {/* Platform selector */}
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:12, color:"var(--color-text-secondary)", marginBottom:8 }}>Select platforms to optimize for:</div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {PLATFORMS.map(p => {
            const on = selectedPlatforms.has(p.id);
            return <button key={p.id} onClick={()=>togglePlatform(p.id)} style={{ padding:"5px 12px", borderRadius:20, border:on?`2px solid ${p.color}`:"0.5px solid var(--color-border-tertiary)", background:on?p.bg:"var(--color-background-primary)", fontSize:12, cursor:"pointer", color:on?p.color:"var(--color-text-secondary)", display:"flex", alignItems:"center", gap:4 }}>
              <i className={`ti ${p.icon}`} style={{ fontSize:12 }} aria-hidden="true" />{p.name}
            </button>;
          })}
        </div>
      </div>

      {/* Anthropic key (optional override) */}
      <div style={{ marginBottom:16 }}>
        <label style={{ fontSize:12, color:"var(--color-text-secondary)", display:"block", marginBottom:4 }}>
          Anthropic API key (optional — uses backend .env key if blank)
        </label>
        <input type="password" style={{ ...inp, maxWidth:400 }} placeholder="sk-ant-…" value={anthropicKey} onChange={e=>setAnthropicKey(e.target.value)} />
      </div>

      <button onClick={runOptimization} disabled={loading||selectedPlatforms.size===0||!product?.title} style={{ padding:"9px 24px", borderRadius:8, border:"none", background:loading||!product?.title?"var(--color-border-tertiary)":"#7c3aed", color:loading||!product?.title?"var(--color-text-secondary)":"#fff", fontSize:14, fontWeight:500, cursor:"pointer", display:"flex", alignItems:"center", gap:8, marginBottom:20 }}>
        <i className={`ti ${loading?"ti-loader-2":"ti-sparkles"}`} style={{ fontSize:16 }} />
        {loading?`Optimizing for ${selectedPlatforms.size} platform${selectedPlatforms.size>1?"s":""}…`:`Optimize for ${selectedPlatforms.size} platform${selectedPlatforms.size>1?"s":""}`}
      </button>

      {error && <div style={{ marginBottom:16, padding:"10px 14px", borderRadius:8, background:"var(--color-background-danger)", color:"var(--color-text-danger)", fontSize:13 }}>{error}</div>}

      {/* Overall score */}
      {overallScore !== null && !isNaN(overallScore) && (
        <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:20, padding:"12px 16px", border:"0.5px solid var(--color-border-tertiary)", borderRadius:12 }}>
          <ScoreRing score={overallScore} />
          <div>
            <div style={{ fontSize:16, fontWeight:500 }}>Overall listing score: {overallScore}/100</div>
            <div style={{ fontSize:13, color:"var(--color-text-secondary)" }}>
              {overallScore>=75?"Strong listing — minor tweaks needed.":overallScore>=50?"Good foundation — several improvements available.":"Significant improvements will boost visibility."}
            </div>
          </div>
        </div>
      )}

      {/* Per-platform results */}
      {results && Object.entries(results).map(([platform, data]) => (
        <PlatformOptCard key={platform} platform={platform} data={data} onApply={handleApply} />
      ))}
    </div>
  );
}
