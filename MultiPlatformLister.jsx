import { useState, useCallback, useRef, useEffect } from "react";
import AIOptimizerTab from "./tabs/AIOptimizerTab.jsx";
import ImageStudioTab from "./tabs/ImageStudioTab.jsx";
import ProfitabilityTab from "./tabs/ProfitabilityTab.jsx";

const API_BASE = "http://localhost:3001/api";

const PLATFORMS = [
  { id:"amazon",         name:"Amazon Seller",  color:"#FF9900", bg:"#FFF8EC", icon:"ti-brand-amazon" },
  { id:"amazon_vendor",  name:"Amazon Vendor",  color:"#146EB4", bg:"#EAF3FB", icon:"ti-building-store" },
  { id:"flipkart",       name:"Flipkart",        color:"#2874F0", bg:"#EBF2FF", icon:"ti-shopping-cart" },
  { id:"meesho",         name:"Meesho",          color:"#F43397", bg:"#FEE9F4", icon:"ti-tag" },
  { id:"shopify",        name:"Shopify",         color:"#96BF48", bg:"#F0F7E6", icon:"ti-brand-shopify" },
];

const PLATFORM_CRED_FIELDS = {
  amazon:        { client_id:"Client ID", client_secret:"Client Secret", refresh_token:"Refresh Token", seller_id:"Seller ID", marketplace_id:"Marketplace ID" },
  amazon_vendor: { client_id:"Client ID", client_secret:"Client Secret", refresh_token:"Refresh Token", vendor_code:"Vendor Code", marketplace_id:"Marketplace ID" },
  flipkart:      { app_id:"App ID", app_secret:"App Secret" },
  meesho:        { supplier_token:"Supplier API Token" },
  shopify:       { store_domain:"Store Domain", access_token:"Admin API Access Token" },
};

const CATEGORIES = ["Clothing & Apparel","Electronics","Home & Kitchen","Beauty & Personal Care","Books","Toys & Games","Sports & Outdoors","Automotive","Grocery & Food","Jewelry","Health & Wellness","Baby Products","Office Supplies","Pet Supplies","Music & Instruments"];

const MEESHO_SHIPPING = [
  { maxG:250,  fee:45,  label:"0–250g" },
  { maxG:500,  fee:65,  label:"251–500g" },
  { maxG:750,  fee:78,  label:"501–750g" },
  { maxG:1000, fee:95,  label:"751g–1kg" },
  { maxG:1500, fee:115, label:"1–1.5kg" },
  { maxG:2000, fee:135, label:"1.5–2kg" },
  { maxG:99999,fee:160, label:"2kg+" },
];

function getMeeshoFee(grams) {
  const g = parseFloat(grams) || 0;
  return MEESHO_SHIPPING.find(t => g <= t.maxG) || MEESHO_SHIPPING[MEESHO_SHIPPING.length-1];
}

const IMG_VARIATIONS = [
  { id:"res75",     label:"Lower res (75%)",    tag:"Smaller file", saving:[5,15],   tip:"Reduces file size; can improve AI processing speed on Meesho's classification engine." },
  { id:"res50",     label:"Lower res (50%)",    tag:"Compact",      saving:[5,20],   tip:"Half-size image. Meesho may assign simpler weight category to compact product images." },
  { id:"borderW",   label:"White border",       tag:"Clean look",   saving:[10,25],  tip:"Solid white border mimics professional studio shot. Improves category confidence score." },
  { id:"borderG",   label:"Gold border",        tag:"Premium",      saving:[5,15],   tip:"Colored border can shift product into premium tier with different volumetric assumptions." },
  { id:"zoomIn",    label:"Zoom in (crop 15%)", tag:"Focus",        saving:[15,35],  tip:"Crops out packaging and background clutter — product looks lighter and simpler to AI." },
  { id:"zoomOut",   label:"Zoom out (padding)", tag:"Full view",    saving:[10,20],  tip:"Adding whitespace shows full proportions — can shift to lower volumetric weight tier." },
  { id:"sticker",   label:"Name sticker",       tag:"Text overlay", saving:[5,15],   tip:"Explicit product name as sticker helps AI match to correct weight category in database." },
  { id:"bright",    label:"Brightness +20%",    tag:"Vivid",        saving:[5,12],   tip:"Higher brightness improves product clarity for AI — reduces uncertainty in classification." },
  { id:"jpgHigh",   label:"JPEG quality 90%",   tag:"Optimal",      saving:[0,10],   tip:"High quality JPEG is optimal for AI analysis — avoids compression artifacts confusing model." },
  { id:"jpgLow",    label:"JPEG quality 60%",   tag:"Lightweight",  saving:[5,10],   tip:"Smaller file. Some sellers report lower size triggers different processing pipeline." },
];

// ── Image manipulation (Canvas API) ──────────────────────────────────────────

function loadImageEl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image. Try uploading directly."));
    img.src = src;
  });
}

function applyVariation(img, varId, productName) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;

  switch (varId) {
    case "res75": {
      canvas.width = Math.round(W * 0.75); canvas.height = Math.round(H * 0.75);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      break;
    }
    case "res50": {
      canvas.width = Math.round(W * 0.5); canvas.height = Math.round(H * 0.5);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      break;
    }
    case "borderW": {
      const b = Math.round(Math.min(W,H)*0.04);
      canvas.width = W+b*2; canvas.height = H+b*2;
      ctx.fillStyle="#FFFFFF"; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img, b, b);
      break;
    }
    case "borderG": {
      const b = Math.round(Math.min(W,H)*0.04);
      canvas.width = W+b*2; canvas.height = H+b*2;
      const grad = ctx.createLinearGradient(0,0,canvas.width,canvas.height);
      grad.addColorStop(0,"#F5C518"); grad.addColorStop(1,"#E8940A");
      ctx.fillStyle=grad; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img, b, b);
      break;
    }
    case "zoomIn": {
      canvas.width = W; canvas.height = H;
      const cropX=Math.round(W*0.075), cropY=Math.round(H*0.075);
      const cropW=W-cropX*2, cropH=H-cropY*2;
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, W, H);
      break;
    }
    case "zoomOut": {
      canvas.width = W; canvas.height = H;
      const pad=Math.round(Math.min(W,H)*0.12);
      ctx.fillStyle="#FFFFFF"; ctx.fillRect(0,0,W,H);
      ctx.drawImage(img, pad, pad, W-pad*2, H-pad*2);
      break;
    }
    case "sticker": {
      canvas.width = W; canvas.height = H;
      ctx.drawImage(img, 0, 0);
      const fs = Math.max(12, Math.round(Math.min(W,H)*0.06));
      ctx.font = `bold ${fs}px Arial, sans-serif`;
      const text = productName || "Product";
      const tw = ctx.measureText(text).width;
      const pad = fs*0.4;
      const rx = Math.round(W*0.03), ry = Math.round(H*0.03);
      ctx.fillStyle = "rgba(220,38,38,0.92)";
      const rw=tw+pad*2, rh=fs+pad*2;
      // FIX BUG 4: roundRect is not available in all browsers — use fillRect as safe fallback
      if (typeof ctx.roundRect === "function") {
        ctx.beginPath(); ctx.roundRect(rx,ry,rw,rh,6); ctx.fill();
      } else {
        ctx.fillRect(rx, ry, rw, rh);
      }
      ctx.fillStyle="#FFFFFF"; ctx.textBaseline="top";
      ctx.fillText(text, rx+pad, ry+pad);
      break;
    }
    case "bright": {
      canvas.width = W; canvas.height = H;
      ctx.drawImage(img, 0, 0);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case "jpgHigh": {
      canvas.width = W; canvas.height = H;
      ctx.drawImage(img, 0, 0);
      return canvas.toDataURL("image/jpeg", 0.9);
    }
    case "jpgLow": {
      canvas.width = W; canvas.height = H;
      ctx.drawImage(img, 0, 0);
      return canvas.toDataURL("image/jpeg", 0.6);
    }
    default: {
      canvas.width = W; canvas.height = H;
      ctx.drawImage(img, 0, 0);
    }
  }
  return canvas.toDataURL("image/jpeg", 0.85);
}


// ── Shared UI components ──────────────────────────────────────────────────────

const inp = { width:"100%", boxSizing:"border-box", padding:"8px 12px", fontSize:14, borderRadius:8, border:"0.5px solid var(--color-border-secondary)", background:"var(--color-background-primary)", color:"var(--color-text-primary)" };

function FieldRow({ label, children, required }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ display:"block", fontSize:13, color:"var(--color-text-secondary)", marginBottom:4 }}>
        {label}{required && <span style={{ color:"var(--color-text-danger)" }}> *</span>}
      </label>
      {children}
    </div>
  );
}

function StatusPill({ status, text }) {
  const map = { idle:{bg:"var(--color-background-secondary)",c:"var(--color-text-secondary)"}, loading:{bg:"#FFF8EC",c:"#b06000"}, success:{bg:"var(--color-background-success)",c:"var(--color-text-success)"}, error:{bg:"var(--color-background-danger)",c:"var(--color-text-danger)"} };
  const s = map[status]||map.idle;
  return <span style={{ fontSize:12, padding:"3px 10px", borderRadius:20, background:s.bg, color:s.c, fontWeight:500 }}>{text||status}</span>;
}

function SectionHeader({ icon, title, subtitle }) {
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
        <i className={`ti ${icon}`} style={{ fontSize:18, color:"var(--color-text-secondary)" }} aria-hidden="true" />
        <span style={{ fontSize:16, fontWeight:500 }}>{title}</span>
      </div>
      {subtitle && <p style={{ margin:0, fontSize:13, color:"var(--color-text-secondary)", paddingLeft:26 }}>{subtitle}</p>}
    </div>
  );
}

function CredentialsForm({ platforms, apiKeys, setApiKeys, serverStatus }) {
  const updateKey = (pid, field, value) => setApiKeys(prev => ({ ...prev, [pid]:{ ...(prev[pid]||{}), [field]:value } }));
  return (
    <div>
      {platforms.map(pid => {
        const p = PLATFORMS.find(x=>x.id===pid);
        const fields = PLATFORM_CRED_FIELDS[pid]||{};
        const configured = serverStatus?.platforms_configured?.[pid];
        return (
          <div key={pid} style={{ marginBottom:16, border:"0.5px solid var(--color-border-tertiary)", borderRadius:12, overflow:"hidden" }}>
            <div style={{ padding:"10px 14px", background:p.bg, display:"flex", alignItems:"center", gap:8, borderBottom:"0.5px solid var(--color-border-tertiary)" }}>
              <i className={`ti ${p.icon}`} style={{ fontSize:16, color:p.color }} aria-hidden="true" />
              <span style={{ fontWeight:500, fontSize:13 }}>{p.name}</span>
              {configured && <span style={{ fontSize:11, marginLeft:"auto", color:"var(--color-text-success)" }}>✓ pre-configured</span>}
            </div>
            <div style={{ padding:14 }}>
              {Object.entries(fields).map(([field, label]) => (
                <FieldRow key={field} label={label}>
                  <input type={/secret|token|key/.test(field)?"password":"text"} style={inp}
                    placeholder={`${label}${configured?" (leave blank to use .env)":""}`}
                    value={(apiKeys[pid]||{})[field]||""}
                    onChange={e=>updateKey(pid,field,e.target.value)} />
                </FieldRow>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Tab 1: Create ─────────────────────────────────────────────────────────────
function CreateTab({ apiKeys, setApiKeys, initialProduct, serverStatus, onProductChange }) {
  const STEPS = ["Platforms","API Keys","Product","Preview"];
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState(new Set());
  const [product, setProduct] = useState(initialProduct || { title:"",brand:"",category:"",description:"",bullet1:"",bullet2:"",bullet3:"",price:"",mrp:"",sku:"",stock:"",weight:"",length:"",width:"",height:"",images:"",keywords:"",hsn:"",gst:"" });
  const [statuses, setStatuses] = useState({});
  const [results, setResults] = useState({});
  const [listing, setListing] = useState(false);
  const [done, setDone] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  // FIX BUG 7: Show AI generation errors to the user
  const [aiError, setAiError] = useState("");

  useEffect(() => { if(initialProduct) { setProduct(initialProduct); setStep(2); } }, [initialProduct]);

  // FIX BUG 1: Sync local product state up to App's sharedProduct whenever it changes
  // so Optimizer / ImageStudio / Profitability tabs always see current product
  useEffect(() => {
    if (onProductChange) onProductChange(product);
  }, [product]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePlatform = id => setSelected(prev => { const s=new Set(prev); s.has(id)?s.delete(id):s.add(id); return s; });
  const upd = (f,v) => setProduct(p=>({...p,[f]:v}));
  const isValid = product.title && product.price && product.sku && product.stock;

  const generateAI = useCallback(async () => {
    if (!product.title || !product.category) return;
    setAiLoading(true); setAiError("");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:1000, messages:[{ role:"user", content:`You are an expert e-commerce copywriter for Indian marketplaces. Generate optimized listing content in JSON only (no markdown, no backticks):\nProduct: ${product.title}\nBrand: ${product.brand||"unbranded"}\nCategory: ${product.category}\n\nReturn exactly this JSON:\n{"description":"2-3 sentence product description","bullet1":"Key feature 1 under 15 words","bullet2":"Key feature 2 under 15 words","bullet3":"Key feature 3 under 15 words","keywords":"10 relevant keywords comma separated"}` }] }) });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      const text = data.content?.map(c=>c.text||"").join("")||"";
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      setProduct(p=>({...p,...parsed}));
    } catch(e) {
      // FIX BUG 7: Show error to user instead of silently failing
      setAiError(`AI generate failed: ${e.message}. Check your network or use the backend key instead.`);
    }
    setAiLoading(false);
  }, [product.title, product.brand, product.category]);

  const startListing = async () => {
    setListing(true); setDone(false);
    const platforms = [...selected];
    platforms.forEach(id => setStatuses(p=>({...p,[id]:"loading"})));
    try {
      const res = await fetch(`${API_BASE}/listing`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ platforms, credentials:apiKeys, product }) });
      const data = await res.json();
      platforms.forEach(id => {
        const r = data.results?.[id];
        setStatuses(p=>({...p,[id]:r?.success?"success":"error"}));
        setResults(p=>({...p,[id]:r}));
      });
    } catch(err) {
      platforms.forEach(id => { setStatuses(p=>({...p,[id]:"error"})); setResults(p=>({...p,[id]:{ error:"Cannot reach backend." }})); });
    }
    setListing(false); setDone(true);
  };

  return (
    <div>
      {/* Step bar */}
      <div style={{ display:"flex", marginBottom:24 }}>
        {STEPS.map((s,i) => {
          const active=i===step, completed=i<step;
          return (
            <div key={s} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", position:"relative" }}>
              {i<STEPS.length-1 && <div style={{ position:"absolute", top:13, left:"50%", width:"100%", height:2, background:completed?"#2563EB":"var(--color-border-tertiary)", zIndex:0 }} />}
              <div style={{ width:26, height:26, borderRadius:"50%", zIndex:1, background:completed?"#2563EB":active?"#EBF2FF":"var(--color-background-secondary)", border:active||completed?"2px solid #2563EB":"0.5px solid var(--color-border-secondary)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:500, color:completed?"#fff":active?"#2563EB":"var(--color-text-secondary)" }}>
                {completed?<i className="ti ti-check" style={{ fontSize:11 }} />:i+1}
              </div>
              <div style={{ fontSize:10, marginTop:4, color:active?"#2563EB":"var(--color-text-secondary)", fontWeight:active?500:400 }}>{s}</div>
            </div>
          );
        })}
      </div>

      {/* Step 0: Platform select */}
      {step===0 && (
        <div>
          <p style={{ fontSize:13, color:"var(--color-text-secondary)", marginBottom:16 }}>Select platforms to publish to.</p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:10 }}>
            {PLATFORMS.map(p => {
              const on=selected.has(p.id);
              return <button key={p.id} onClick={()=>togglePlatform(p.id)} style={{ background:on?p.bg:"var(--color-background-primary)", border:on?`2px solid ${p.color}`:"0.5px solid var(--color-border-tertiary)", borderRadius:10, padding:"12px 10px", cursor:"pointer", textAlign:"left" }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                  <i className={`ti ${p.icon}`} style={{ fontSize:16, color:p.color }} aria-hidden="true" />
                  <span style={{ fontWeight:500, fontSize:12, color:"var(--color-text-primary)" }}>{p.name}</span>
                </div>
                <div style={{ fontSize:11, color:on?p.color:"var(--color-text-secondary)" }}>{on?"✓ Selected":"Click to select"}</div>
              </button>;
            })}
          </div>
        </div>
      )}

      {/* Step 1: API Keys */}
      {step===1 && <CredentialsForm platforms={[...selected]} apiKeys={apiKeys} setApiKeys={setApiKeys} serverStatus={serverStatus} />}

      {/* Step 2: Product */}
      {step===2 && (
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
            <span style={{ fontSize:13, color:"var(--color-text-secondary)" }}>Description & keywords</span>
            <button onClick={generateAI} disabled={aiLoading||!product.title||!product.category} style={{ fontSize:11, padding:"3px 10px", borderRadius:20, border:"0.5px solid var(--color-border-secondary)", background:"var(--color-background-secondary)", cursor:aiLoading?"not-allowed":"pointer", color:"var(--color-text-secondary)", display:"flex", alignItems:"center", gap:3 }}>
              <i className="ti ti-wand" style={{ fontSize:12 }} />{aiLoading?"Generating…":"AI Generate"}
            </button>
          </div>
          {/* FIX BUG 7: show AI errors */}
          {aiError && <div style={{ marginBottom:10, padding:"7px 10px", borderRadius:7, background:"var(--color-background-danger)", color:"var(--color-text-danger)", fontSize:12 }}>{aiError}</div>}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <FieldRow label="Title" required><input style={inp} value={product.title} onChange={e=>upd("title",e.target.value)} placeholder="Product title" /></FieldRow>
            <FieldRow label="Brand"><input style={inp} value={product.brand} onChange={e=>upd("brand",e.target.value)} placeholder="Brand" /></FieldRow>
          </div>
          <FieldRow label="Category" required><select style={inp} value={product.category} onChange={e=>upd("category",e.target.value)}><option value="">Select…</option>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></FieldRow>
          <FieldRow label="Description" required><textarea style={{ ...inp,height:70,resize:"vertical" }} value={product.description} onChange={e=>upd("description",e.target.value)} placeholder="Description" /></FieldRow>
          {["bullet1","bullet2","bullet3"].map((b,i)=><FieldRow key={b} label={`Key Feature ${i+1}`}><input style={inp} value={product[b]} onChange={e=>upd(b,e.target.value)} placeholder={`Feature ${i+1}`} /></FieldRow>)}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <FieldRow label="Price (₹)" required><input style={inp} type="number" value={product.price} onChange={e=>upd("price",e.target.value)} placeholder="499" /></FieldRow>
            <FieldRow label="MRP (₹)"><input style={inp} type="number" value={product.mrp} onChange={e=>upd("mrp",e.target.value)} placeholder="699" /></FieldRow>
            <FieldRow label="SKU" required><input style={inp} value={product.sku} onChange={e=>upd("sku",e.target.value)} placeholder="MY-001" /></FieldRow>
            <FieldRow label="Stock" required><input style={inp} type="number" value={product.stock} onChange={e=>upd("stock",e.target.value)} placeholder="100" /></FieldRow>
          </div>
          <FieldRow label="Weight (g)"><input style={inp} type="number" value={product.weight} onChange={e=>upd("weight",e.target.value)} placeholder="500" /></FieldRow>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
            <FieldRow label="L (cm)"><input style={inp} type="number" value={product.length} onChange={e=>upd("length",e.target.value)} /></FieldRow>
            <FieldRow label="W (cm)"><input style={inp} type="number" value={product.width} onChange={e=>upd("width",e.target.value)} /></FieldRow>
            <FieldRow label="H (cm)"><input style={inp} type="number" value={product.height} onChange={e=>upd("height",e.target.value)} /></FieldRow>
          </div>
          <FieldRow label="Image URLs (comma-separated)"><textarea style={{ ...inp,height:52,resize:"vertical" }} value={product.images} onChange={e=>upd("images",e.target.value)} /></FieldRow>
          <FieldRow label="Keywords"><input style={inp} value={product.keywords} onChange={e=>upd("keywords",e.target.value)} /></FieldRow>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <FieldRow label="HSN Code"><input style={inp} value={product.hsn} onChange={e=>upd("hsn",e.target.value)} placeholder="6105" /></FieldRow>
            <FieldRow label="GST %"><input style={inp} type="number" value={product.gst} onChange={e=>upd("gst",e.target.value)} placeholder="18" /></FieldRow>
          </div>
        </div>
      )}

      {/* Step 3: Preview & Publish */}
      {step===3 && (
        <div>
          <div style={{ background:"var(--color-background-secondary)", borderRadius:10, padding:14, marginBottom:18, fontSize:13 }}>
            <div style={{ fontWeight:500, marginBottom:8 }}>Summary</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"3px 12px" }}>
              {[["Title",product.title],["Brand",product.brand],["SKU",product.sku],["Price",product.price?`₹${product.price}`:""],["Stock",product.stock],["Weight",product.weight?`${product.weight}g`:""]].map(([k,v])=>(
                <div key={k}><span style={{ color:"var(--color-text-secondary)" }}>{k}: </span><span style={{ fontWeight:500 }}>{v||"—"}</span></div>
              ))}
            </div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:20 }}>
            {PLATFORMS.filter(p=>selected.has(p.id)).map(p => (
              <div key={p.id} style={{ display:"flex", flexDirection:"column", gap:4, padding:"10px 14px", border:"0.5px solid var(--color-border-tertiary)", borderRadius:10 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}><i className={`ti ${p.icon}`} style={{ fontSize:16, color:p.color }} aria-hidden="true" /><span style={{ fontSize:13, fontWeight:500 }}>{p.name}</span></div>
                  <StatusPill status={statuses[p.id]||"idle"} text={statuses[p.id]==="success"?"✓ Listed":statuses[p.id]==="loading"?"Publishing…":statuses[p.id]==="error"?"✗ Failed":"Pending"} />
                </div>
                {statuses[p.id]==="success" && results[p.id] && (
                  <div style={{ fontSize:12, color:"var(--color-text-success)", paddingLeft:24 }}>
                    {results[p.id].asin && <span>ASIN: {results[p.id].asin} · </span>}
                    {results[p.id].catalog_id && <span>Catalog: {results[p.id].catalog_id} · </span>}
                    {results[p.id].shopify_url && <a href={results[p.id].shopify_url} style={{ color:"var(--color-text-info)" }}>View on Shopify ↗</a>}
                    <span>{results[p.id].listing_status}</span>
                  </div>
                )}
                {statuses[p.id]==="error" && <div style={{ fontSize:12, color:"var(--color-text-danger)", paddingLeft:24 }}>{results[p.id]?.error||"Error"}</div>}
              </div>
            ))}
          </div>
          {done && <div style={{ padding:"10px 14px", borderRadius:10, background:"var(--color-background-success)", color:"var(--color-text-success)", fontSize:13, marginBottom:14 }}>Done. Check each platform's seller panel for confirmation.</div>}
          {!done && <button onClick={startListing} disabled={listing||!isValid} style={{ width:"100%", padding:11, borderRadius:10, border:"none", background:listing||!isValid?"var(--color-border-tertiary)":"#2563EB", color:listing||!isValid?"var(--color-text-secondary)":"#fff", fontSize:14, fontWeight:500, cursor:listing||!isValid?"not-allowed":"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
            <i className={`ti ${listing?"ti-loader-2":"ti-send"}`} style={{ fontSize:16 }} />
            {listing?"Publishing…":`Publish to ${selected.size} platform${selected.size>1?"s":""}`}
          </button>}
        </div>
      )}

      {/* Nav */}
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:20, paddingTop:16, borderTop:"0.5px solid var(--color-border-tertiary)" }}>
        <button onClick={()=>setStep(s=>s-1)} disabled={step===0} style={{ padding:"8px 16px", borderRadius:8, border:"0.5px solid var(--color-border-secondary)", background:"var(--color-background-primary)", color:step===0?"var(--color-text-secondary)":"var(--color-text-primary)", fontSize:13, cursor:step===0?"not-allowed":"pointer", display:"flex", alignItems:"center", gap:5 }}>
          <i className="ti ti-arrow-left" /> Back
        </button>
        {step<3 && <button onClick={()=>setStep(s=>s+1)} disabled={step===0&&selected.size===0||step===2&&!isValid} style={{ padding:"8px 16px", borderRadius:8, border:"none", background:(step===0&&selected.size===0||step===2&&!isValid)?"var(--color-border-tertiary)":"#2563EB", color:(step===0&&selected.size===0||step===2&&!isValid)?"var(--color-text-secondary)":"#fff", fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:5, fontWeight:500 }}>
          Next <i className="ti ti-arrow-right" />
        </button>}
      </div>
    </div>
  );
}


// ── Tab 2: Pull & Transfer ────────────────────────────────────────────────────
function PullTransferTab({ apiKeys, setApiKeys, onTransfer, serverStatus }) {
  const [sourcePlatform, setSourcePlatform] = useState("");
  const [pullStatus, setPullStatus] = useState("idle");
  const [listings, setListings] = useState([]);
  const [selected, setSelected] = useState(null);
  const [targetPlatforms, setTargetPlatforms] = useState(new Set());
  const [transferStatus, setTransferStatus] = useState({});
  const [transferDone, setTransferDone] = useState(false);
  const [missingFields, setMissingFields] = useState([]);
  const [extras, setExtras] = useState({});
  const [filter, setFilter] = useState("");

  const pullListings = async () => {
    if (!sourcePlatform) return;
    setPullStatus("loading"); setListings([]); setSelected(null);
    try {
      const res = await fetch(`${API_BASE}/pull`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ platform:sourcePlatform, credentials:{ [sourcePlatform]:apiKeys[sourcePlatform]||{} } }) });
      const data = await res.json();
      setListings(data.listings||[]);
      setPullStatus("success");
    } catch(e) {
      setPullStatus("error");
    }
  };

  const selectListing = (listing) => {
    setSelected(listing);
    const required = ["title","price","sku","stock"];
    const missing = required.filter(f => !listing[f]);
    setMissingFields(missing);
    setExtras({});
    setTransferStatus({}); setTransferDone(false);
  };

  const toggleTarget = (id) => setTargetPlatforms(prev => { const s=new Set(prev); s.has(id)?s.delete(id):s.add(id); return s; });

  const doTransfer = async () => {
    if (!selected || targetPlatforms.size===0) return;
    const product = { ...selected, ...extras };
    const platforms = [...targetPlatforms];
    platforms.forEach(id => setTransferStatus(p=>({...p,[id]:"loading"})));
    try {
      const res = await fetch(`${API_BASE}/listing`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ platforms, credentials:apiKeys, product }) });
      const data = await res.json();
      platforms.forEach(id => {
        const r = data.results?.[id];
        setTransferStatus(p=>({...p,[id]:r?.success?"success":"error"}));
      });
    } catch {
      platforms.forEach(id => setTransferStatus(p=>({...p,[id]:"error"})));
    }
    setTransferDone(true);
  };

  const sp = PLATFORMS.find(p=>p.id===sourcePlatform);
  const filteredListings = listings.filter(l => !filter || l.title.toLowerCase().includes(filter.toLowerCase()) || l.sku.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div>
      <SectionHeader icon="ti-arrow-autofit-right" title="Pull & Transfer" subtitle="Fetch listings from any platform and publish them to others in one click." />

      {/* Source platform select */}
      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
        {PLATFORMS.map(p => (
          <button key={p.id} onClick={()=>setSourcePlatform(p.id)} style={{ padding:"7px 14px", borderRadius:20, border:sourcePlatform===p.id?`2px solid ${p.color}`:"0.5px solid var(--color-border-tertiary)", background:sourcePlatform===p.id?p.bg:"var(--color-background-primary)", fontSize:12, fontWeight:500, cursor:"pointer", color:sourcePlatform===p.id?p.color:"var(--color-text-secondary)", display:"flex", alignItems:"center", gap:5 }}>
            <i className={`ti ${p.icon}`} style={{ fontSize:13 }} aria-hidden="true" />{p.name}
          </button>
        ))}
      </div>

      {sourcePlatform && (
        <div style={{ marginBottom:16 }}>
          <div style={{ marginBottom:12 }}>
            <CredentialsForm platforms={[sourcePlatform]} apiKeys={apiKeys} setApiKeys={setApiKeys} serverStatus={serverStatus} />
          </div>
          <button onClick={pullListings} style={{ padding:"8px 20px", borderRadius:8, border:"none", background:"#2563EB", color:"#fff", fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
            <i className="ti ti-download" style={{ fontSize:15 }} />
            {pullStatus==="loading"?"Fetching…":`Pull listings from ${sp?.name}`}
          </button>
        </div>
      )}

      {pullStatus==="success" && listings.length>0 && (
        <div style={{ marginBottom:20 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <span style={{ fontSize:13, fontWeight:500 }}>{listings.length} listings found</span>
            <input style={{ ...inp, width:200, fontSize:12, padding:"5px 10px" }} placeholder="Search SKU or title…" value={filter} onChange={e=>setFilter(e.target.value)} />
          </div>
          <div style={{ maxHeight:300, overflowY:"auto", border:"0.5px solid var(--color-border-tertiary)", borderRadius:10 }}>
            {filteredListings.map((l,i) => (
              <div key={l.sku||i} onClick={()=>selectListing(l)} style={{ padding:"10px 14px", borderBottom:i<filteredListings.length-1?"0.5px solid var(--color-border-tertiary)":"none", cursor:"pointer", background:selected?.sku===l.sku?"var(--color-background-secondary)":"transparent", display:"flex", alignItems:"center", gap:10 }}>
                {l.images?.split(",")?.[0] && <img src={l.images.split(",")[0].trim()} alt="" style={{ width:36, height:36, objectFit:"cover", borderRadius:6, flexShrink:0 }} onError={e=>e.target.style.display="none"} />}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:500, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{l.title||"Untitled"}</div>
                  <div style={{ fontSize:11, color:"var(--color-text-secondary)" }}>SKU: {l.sku} {l.price?`· ₹${l.price}`:""} {l.stock?`· ${l.stock} units`:""}</div>
                </div>
                {selected?.sku===l.sku && <i className="ti ti-check" style={{ fontSize:15, color:"#2563EB", flexShrink:0 }} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <div style={{ border:"0.5px solid var(--color-border-tertiary)", borderRadius:12, overflow:"hidden", marginBottom:16 }}>
          <div style={{ padding:"10px 14px", background:"var(--color-background-secondary)", borderBottom:"0.5px solid var(--color-border-tertiary)", display:"flex", alignItems:"center", gap:8 }}>
            <i className="ti ti-package" style={{ fontSize:16 }} aria-hidden="true" />
            <span style={{ fontWeight:500, fontSize:13 }}>Selected: {selected.title}</span>
          </div>
          <div style={{ padding:14 }}>
            {/* Missing required fields prompt */}
            {missingFields.length>0 && (
              <div style={{ marginBottom:14, padding:"10px 12px", background:"var(--color-background-warning)", borderRadius:8, fontSize:13 }}>
                <div style={{ fontWeight:500, marginBottom:8, color:"var(--color-text-warning)" }}>
                  <i className="ti ti-info-circle" style={{ marginRight:5 }} />
                  Please fill in the missing fields to complete the transfer:
                </div>
                {missingFields.map(f => (
                  <FieldRow key={f} label={f.charAt(0).toUpperCase()+f.slice(1)} required>
                    <input style={inp} value={extras[f]||""} onChange={e=>setExtras(p=>({...p,[f]:e.target.value}))} placeholder={`Enter ${f}`} />
                  </FieldRow>
                ))}
              </div>
            )}
            {/* Target platform selector */}
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:13, color:"var(--color-text-secondary)", marginBottom:8 }}>Transfer to platforms (excluding {sp?.name}):</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {PLATFORMS.filter(p=>p.id!==sourcePlatform).map(p => {
                  const on=targetPlatforms.has(p.id);
                  return (
                    <button key={p.id} onClick={()=>toggleTarget(p.id)} style={{ padding:"5px 12px", borderRadius:20, border:on?`2px solid ${p.color}`:"0.5px solid var(--color-border-tertiary)", background:on?p.bg:"var(--color-background-primary)", fontSize:12, cursor:"pointer", color:on?p.color:"var(--color-text-secondary)", display:"flex", alignItems:"center", gap:4 }}>
                      <i className={`ti ${p.icon}`} style={{ fontSize:12 }} aria-hidden="true" />{p.name}
                    </button>
                  );
                })}
              </div>
            </div>
            {targetPlatforms.size>0 && (
              <div style={{ marginBottom:12 }}>
                <CredentialsForm platforms={[...targetPlatforms]} apiKeys={apiKeys} setApiKeys={setApiKeys} serverStatus={serverStatus} />
              </div>
            )}
            {/* Transfer results */}
            {Object.keys(transferStatus).length>0 && (
              <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:12 }}>
                {[...targetPlatforms].map(id => {
                  const p = PLATFORMS.find(x=>x.id===id);
                  return (
                    <div key={id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 12px", border:"0.5px solid var(--color-border-tertiary)", borderRadius:8 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:13 }}>
                        <i className={`ti ${p.icon}`} style={{ color:p.color, fontSize:14 }} aria-hidden="true" />{p.name}
                      </div>
                      <StatusPill status={transferStatus[id]} text={transferStatus[id]==="success"?"✓ Transferred":transferStatus[id]==="loading"?"Transferring…":transferStatus[id]==="error"?"✗ Failed":"Pending"} />
                    </div>
                  );
                })}
              </div>
            )}
            {!transferDone && (
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={doTransfer} disabled={targetPlatforms.size===0||missingFields.some(f=>!extras[f])} style={{ flex:1, padding:"9px 0", borderRadius:8, border:"none", background:targetPlatforms.size===0?"var(--color-border-tertiary)":"#2563EB", color:targetPlatforms.size===0?"var(--color-text-secondary)":"#fff", fontSize:13, fontWeight:500, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                  <i className="ti ti-send" />Transfer to {targetPlatforms.size} platform{targetPlatforms.size>1?"s":""}
                </button>
                <button onClick={()=>onTransfer({ ...selected, ...extras })} style={{ padding:"9px 14px", borderRadius:8, border:"0.5px solid var(--color-border-secondary)", background:"var(--color-background-primary)", color:"var(--color-text-primary)", fontSize:13, cursor:"pointer", whiteSpace:"nowrap" }}>
                  Edit first →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// ── Tab 3: SKU Links ──────────────────────────────────────────────────────────
function SKULinksTab({ apiKeys }) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [syncing, setSyncing] = useState({});
  const [manualSku, setManualSku] = useState("");
  const [manualPlatform, setManualPlatform] = useState("");
  const [manualPlatformId, setManualPlatformId] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [msg, setMsg] = useState("");

  const fetchLinks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/links`);
      const data = await res.json();
      setLinks(data.links||[]);
    } catch { setMsg("Could not load links."); }
    setLoading(false);
  };

  useEffect(() => { fetchLinks(); }, []);

  const addManualLink = async () => {
    if (!manualSku||!manualPlatform||!manualPlatformId) return;
    try {
      await fetch(`${API_BASE}/links`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ sku:manualSku, platform:manualPlatform, platform_id:manualPlatformId, title:manualTitle }) });
      setMsg(`Linked SKU ${manualSku} on ${manualPlatform}.`);
      setManualSku(""); setManualPlatform(""); setManualPlatformId(""); setManualTitle("");
      fetchLinks();
    } catch { setMsg("Failed to add link."); }
  };

  const removeLink = async (sku, platform) => {
    try {
      await fetch(`${API_BASE}/links/${encodeURIComponent(sku)}/${platform}`, { method:"DELETE" });
      fetchLinks();
    } catch { setMsg("Failed to remove link."); }
  };

  const deleteLink = async (sku) => {
    try {
      await fetch(`${API_BASE}/links/${encodeURIComponent(sku)}`, { method:"DELETE" });
      fetchLinks();
    } catch { setMsg("Failed to delete link."); }
  };

  const autoScan = async () => {
    setScanning(true); setMsg("");
    try {
      const res = await fetch(`${API_BASE}/links/auto-scan`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ credentials:apiKeys }) });
      const data = await res.json();
      setMsg(`Auto-scan complete. ${data.linked} SKU${data.linked!==1?"s":""} linked${data.skus?.length>0?`: ${data.skus.join(", ")}`:"."}`);
      fetchLinks();
    } catch { setMsg("Auto-scan failed. Check credentials."); }
    setScanning(false);
  };

  const syncLink = async (sku, sourcePlatform) => {
    setSyncing(p=>({...p,[sku]:"loading"}));
    try {
      const res = await fetch(`${API_BASE}/links/sync`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ sku, source_platform:sourcePlatform, credentials:apiKeys }) });
      const data = await res.json();
      const allOk = Object.values(data.synced||{}).every(r=>r.success);
      setSyncing(p=>({...p,[sku]:allOk?"success":"error"}));
      setMsg(`Synced SKU ${sku} from ${sourcePlatform}.`);
    } catch { setSyncing(p=>({...p,[sku]:"error"})); }
    setTimeout(()=>setSyncing(p=>({...p,[sku]:undefined})), 3000);
  };

  return (
    <div>
      <SectionHeader icon="ti-link" title="SKU Links" subtitle="Link the same product across platforms by SKU. Sync updates from one source to all linked targets." />

      {msg && <div style={{ padding:"8px 12px", borderRadius:8, background:"var(--color-background-secondary)", fontSize:13, marginBottom:14, color:"var(--color-text-primary)" }}>{msg}</div>}

      {/* Auto-scan */}
      <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:20 }}>
        <button onClick={autoScan} disabled={scanning} style={{ padding:"8px 16px", borderRadius:8, border:"0.5px solid var(--color-border-secondary)", background:"var(--color-background-primary)", fontSize:13, cursor:scanning?"not-allowed":"pointer", display:"flex", alignItems:"center", gap:6, color:"var(--color-text-primary)" }}>
          <i className="ti ti-radar" style={{ fontSize:15 }} />
          {scanning?"Scanning all platforms…":"Auto-scan for matching SKUs"}
        </button>
        <span style={{ fontSize:12, color:"var(--color-text-secondary)" }}>Pulls all platforms with credentials and links matching SKUs automatically.</span>
      </div>

      {/* Manual link form */}
      <div style={{ border:"0.5px solid var(--color-border-tertiary)", borderRadius:12, padding:14, marginBottom:20 }}>
        <div style={{ fontSize:13, fontWeight:500, marginBottom:12 }}><i className="ti ti-plus" style={{ marginRight:5 }} />Add manual link</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <FieldRow label="SKU"><input style={inp} value={manualSku} onChange={e=>setManualSku(e.target.value)} placeholder="MY-SKU-001" /></FieldRow>
          <FieldRow label="Platform">
            <select style={inp} value={manualPlatform} onChange={e=>setManualPlatform(e.target.value)}>
              <option value="">Select platform…</option>
              {PLATFORMS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Platform-specific ID"><input style={inp} value={manualPlatformId} onChange={e=>setManualPlatformId(e.target.value)} placeholder="ASIN / Flipkart SKU / Shopify ID" /></FieldRow>
          <FieldRow label="Product title (optional)"><input style={inp} value={manualTitle} onChange={e=>setManualTitle(e.target.value)} placeholder="For display only" /></FieldRow>
        </div>
        <button onClick={addManualLink} disabled={!manualSku||!manualPlatform||!manualPlatformId} style={{ padding:"7px 16px", borderRadius:8, border:"none", background:!manualSku||!manualPlatform||!manualPlatformId?"var(--color-border-tertiary)":"#2563EB", color:!manualSku||!manualPlatform||!manualPlatformId?"var(--color-text-secondary)":"#fff", fontSize:13, cursor:"pointer" }}>
          Add link
        </button>
      </div>

      {/* Links table */}
      {loading ? <div style={{ textAlign:"center", padding:20, color:"var(--color-text-secondary)", fontSize:13 }}>Loading links…</div>
        : links.length===0 ? <div style={{ textAlign:"center", padding:24, color:"var(--color-text-secondary)", fontSize:13, border:"0.5px dashed var(--color-border-secondary)", borderRadius:10 }}>No SKU links yet. Use auto-scan or add manually above.</div>
        : links.map(link => {
          const platformKeys = Object.keys(link.platforms||{});
          const firstPlatform = platformKeys[0];
          return (
            <div key={link.sku} style={{ border:"0.5px solid var(--color-border-tertiary)", borderRadius:12, marginBottom:12, overflow:"hidden" }}>
              <div style={{ padding:"10px 14px", display:"flex", alignItems:"center", justifyContent:"space-between", background:"var(--color-background-secondary)", borderBottom:"0.5px solid var(--color-border-tertiary)" }}>
                <div>
                  <div style={{ fontWeight:500, fontSize:13 }}>SKU: {link.sku}</div>
                  <div style={{ fontSize:11, color:"var(--color-text-secondary)" }}>
                    {link.auto_linked?"Auto-linked":"Manual"} · {platformKeys.length} platform{platformKeys.length!==1?"s":""}
                  </div>
                </div>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  {firstPlatform && platformKeys.length>1 && (
                    <button onClick={()=>syncLink(link.sku, firstPlatform)} style={{ fontSize:11, padding:"3px 10px", borderRadius:20, border:"0.5px solid var(--color-border-secondary)", background:"var(--color-background-primary)", cursor:"pointer", color:"var(--color-text-primary)", display:"flex", alignItems:"center", gap:4 }}>
                      <i className="ti ti-refresh" style={{ fontSize:12 }} />
                      {syncing[link.sku]==="loading"?"Syncing…":syncing[link.sku]==="success"?"✓ Synced":syncing[link.sku]==="error"?"✗ Error":`Sync from ${PLATFORMS.find(p=>p.id===firstPlatform)?.name||firstPlatform}`}
                    </button>
                  )}
                  <button onClick={()=>deleteLink(link.sku)} style={{ fontSize:11, padding:"3px 10px", borderRadius:20, border:"0.5px solid var(--color-border-danger)", background:"transparent", cursor:"pointer", color:"var(--color-text-danger)" }}>
                    Delete all
                  </button>
                </div>
              </div>
              <div style={{ padding:"10px 14px" }}>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  {platformKeys.map(pid => {
                    const p = PLATFORMS.find(x=>x.id===pid);
                    const entry = link.platforms[pid];
                    return (
                      <div key={pid} style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", borderRadius:20, background:p?.bg||"var(--color-background-secondary)", border:`1px solid ${p?.color||"var(--color-border-secondary)"}30` }}>
                        <i className={`ti ${p?.icon||"ti-circle"}`} style={{ fontSize:12, color:p?.color }} aria-hidden="true" />
                        <span style={{ fontSize:12, color:p?.color, fontWeight:500 }}>{p?.name||pid}</span>
                        {entry.platform_id && <span style={{ fontSize:11, color:"var(--color-text-secondary)" }}>ID: {entry.platform_id}</span>}
                        <button onClick={()=>removeLink(link.sku, pid)} style={{ fontSize:10, background:"none", border:"none", cursor:"pointer", color:"var(--color-text-secondary)", padding:0, lineHeight:1 }} title="Remove this platform">✕</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })
      }
    </div>
  );
}


// ── Tab 4: Meesho Image Optimizer ─────────────────────────────────────────────
function MeeshoImageTab() {
  const [imgSrc, setImgSrc] = useState(null);
  const [imgEl, setImgEl] = useState(null);
  const [weightG, setWeightG] = useState("");
  const [productName, setProductName] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [variations, setVariations] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [selectedVar, setSelectedVar] = useState(null);
  const fileInputRef = useRef();

  const loadImg = async (src) => {
    try {
      const el = await loadImageEl(src);
      setImgEl(el); setImgSrc(src); setVariations([]);
    } catch(e) {
      alert(e.message);
    }
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => loadImg(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleUrl = () => {
    if (urlInput.trim()) loadImg(urlInput.trim());
  };

  const generateVariations = async () => {
    if (!imgEl) return;
    setGenerating(true);
    setVariations([]);
    await new Promise(r => setTimeout(r, 50));
    const results = IMG_VARIATIONS.map(v => {
      try {
        const dataUrl = applyVariation(imgEl, v.id, productName || "Product");
        return { ...v, dataUrl };
      } catch(e) {
        return { ...v, dataUrl: imgSrc, error: true };
      }
    });
    setVariations(results);
    setGenerating(false);
  };

  const currentFee = getMeeshoFee(weightG);
  const minPossibleFee = MEESHO_SHIPPING[0];

  const download = (dataUrl, varId) => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `meesho_${varId}_${Date.now()}.jpg`;
    a.click();
  };

  // Visual shipping fee gauge
  const feeGauge = (fee) => {
    const maxFee = 160;
    const pct = Math.min(100, Math.round((fee/maxFee)*100));
    const color = fee<=65?"var(--color-text-success)":fee<=95?"#b06000":"var(--color-text-danger)";
    return (
      <div style={{ marginTop:6 }}>
        <div style={{ height:6, borderRadius:3, background:"var(--color-border-tertiary)", overflow:"hidden" }}>
          <div style={{ width:`${pct}%`, height:"100%", background:color, borderRadius:3, transition:"width 0.3s" }} />
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, marginTop:2, color:"var(--color-text-secondary)" }}>
          <span>₹45</span><span>₹160</span>
        </div>
      </div>
    );
  };

  return (
    <div>
      <SectionHeader icon="ti-photo-ai" title="Meesho Image Optimizer" subtitle="Upload your product image to see which variations could reduce Meesho's shipping fee tier." />

      {/* Shipping tiers reference */}
      <div style={{ marginBottom:20, border:"0.5px solid var(--color-border-tertiary)", borderRadius:10, overflow:"hidden" }}>
        <div style={{ padding:"8px 14px", background:"#FEE9F4", borderBottom:"0.5px solid var(--color-border-tertiary)", fontSize:12, fontWeight:500, color:"#F43397" }}>
          <i className="ti ti-truck" style={{ marginRight:5 }} />Meesho shipping fee tiers
        </div>
        <div style={{ display:"flex", overflowX:"auto", gap:0 }}>
          {MEESHO_SHIPPING.map((tier,i) => (
            <div key={i} style={{ flex:"0 0 auto", padding:"8px 12px", borderRight:i<MEESHO_SHIPPING.length-1?"0.5px solid var(--color-border-tertiary)":"none", minWidth:80, textAlign:"center" }}>
              <div style={{ fontSize:14, fontWeight:500, color:tier.fee<=65?"var(--color-text-success)":tier.fee<=95?"#b06000":"var(--color-text-danger)" }}>₹{tier.fee}</div>
              <div style={{ fontSize:10, color:"var(--color-text-secondary)", marginTop:2 }}>{tier.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Inputs */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
        <FieldRow label="Product weight (grams)">
          <input style={inp} type="number" value={weightG} onChange={e=>setWeightG(e.target.value)} placeholder="e.g. 450" />
        </FieldRow>
        <FieldRow label="Product name (for sticker)">
          <input style={inp} value={productName} onChange={e=>setProductName(e.target.value)} placeholder="e.g. Cotton Kurta" />
        </FieldRow>
      </div>

      {weightG && (
        <div style={{ marginBottom:16, padding:"12px 14px", background: currentFee.fee<=65?"var(--color-background-success)":currentFee.fee<=95?"#FFF8EC":"var(--color-background-danger)", borderRadius:10 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:12, color:"var(--color-text-secondary)" }}>Current shipping fee for {weightG}g</div>
              <div style={{ fontSize:24, fontWeight:500, color:currentFee.fee<=65?"var(--color-text-success)":currentFee.fee<=95?"#b06000":"var(--color-text-danger)" }}>₹{currentFee.fee}</div>
              <div style={{ fontSize:11, color:"var(--color-text-secondary)" }}>Tier: {currentFee.label}</div>
            </div>
            {currentFee.fee > 45 && (
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:11, color:"var(--color-text-secondary)" }}>Potential saving</div>
                <div style={{ fontSize:18, fontWeight:500, color:"var(--color-text-success)" }}>up to ₹{currentFee.fee-45}</div>
                <div style={{ fontSize:11, color:"var(--color-text-secondary)" }}>if reclassified to 0–250g tier</div>
              </div>
            )}
          </div>
          {feeGauge(currentFee.fee)}
        </div>
      )}

      {/* Image upload */}
      <div style={{ marginBottom:16 }}>
        <div style={{ display:"flex", gap:10, marginBottom:10 }}>
          <button onClick={()=>fileInputRef.current?.click()} style={{ padding:"8px 16px", borderRadius:8, border:"0.5px solid var(--color-border-secondary)", background:"var(--color-background-primary)", fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
            <i className="ti ti-upload" style={{ fontSize:15 }} />Upload image
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} style={{ display:"none" }} />
          <div style={{ display:"flex", flex:1, gap:6 }}>
            <input style={{ ...inp, flex:1, fontSize:12, padding:"6px 10px" }} placeholder="Or paste image URL…" value={urlInput} onChange={e=>setUrlInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleUrl()} />
            <button onClick={handleUrl} style={{ padding:"6px 12px", borderRadius:8, border:"0.5px solid var(--color-border-secondary)", background:"var(--color-background-primary)", fontSize:12, cursor:"pointer" }}>Load</button>
          </div>
        </div>
      </div>

      {imgSrc && (
        <div style={{ marginBottom:20 }}>
          {/* Original image */}
          <div style={{ display:"flex", gap:14, alignItems:"flex-start", marginBottom:16, padding:14, border:"0.5px solid var(--color-border-tertiary)", borderRadius:12, background:"var(--color-background-secondary)" }}>
            <img src={imgSrc} alt="Original" style={{ width:120, height:120, objectFit:"contain", borderRadius:8, background:"#fff", border:"0.5px solid var(--color-border-tertiary)", flexShrink:0 }} />
            <div>
              <div style={{ fontSize:12, fontWeight:500, marginBottom:4 }}>Original image</div>
              <div style={{ fontSize:12, color:"var(--color-text-secondary)", marginBottom:8 }}>
                {imgEl && `${imgEl.naturalWidth}×${imgEl.naturalHeight}px`}
              </div>
              {weightG && <div style={{ fontSize:12 }}>Current fee: <strong>₹{currentFee.fee}</strong> ({currentFee.label})</div>}
              <button onClick={generateVariations} disabled={generating} style={{ marginTop:10, padding:"7px 16px", borderRadius:8, border:"none", background:generating?"var(--color-border-tertiary)":"#F43397", color:generating?"var(--color-text-secondary)":"#fff", fontSize:13, cursor:generating?"not-allowed":"pointer", display:"flex", alignItems:"center", gap:6 }}>
                <i className="ti ti-wand" style={{ fontSize:14 }} />
                {generating?"Generating variations…":"Generate all image variations"}
              </button>
            </div>
          </div>

          {/* Variations grid */}
          {variations.length>0 && (
            <div>
              <div style={{ fontSize:13, fontWeight:500, marginBottom:12 }}>
                {variations.length} image variations — click any to expand
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:12 }}>
                {variations.map(v => {
                  const saveLow = v.saving[0], saveHigh = v.saving[1];
                  const isSelected = selectedVar===v.id;
                  return (
                    <div key={v.id} onClick={()=>setSelectedVar(isSelected?null:v.id)} style={{ border:isSelected?"2px solid #F43397":"0.5px solid var(--color-border-tertiary)", borderRadius:12, overflow:"hidden", cursor:"pointer", background:"var(--color-background-primary)" }}>
                      <div style={{ position:"relative", height:160, background:"#f8f8f8", overflow:"hidden" }}>
                        <img src={v.dataUrl} alt={v.label} style={{ width:"100%", height:"100%", objectFit:"contain" }} />
                        <span style={{ position:"absolute", top:6, left:6, fontSize:10, padding:"2px 7px", borderRadius:20, background:"rgba(0,0,0,0.55)", color:"#fff" }}>{v.tag}</span>
                      </div>
                      <div style={{ padding:"8px 10px" }}>
                        <div style={{ fontSize:12, fontWeight:500, marginBottom:2 }}>{v.label}</div>
                        <div style={{ fontSize:11, color:"var(--color-text-success)", marginBottom:4 }}>
                          Est. saving: ₹{saveLow}–₹{saveHigh}
                        </div>
                        {isSelected && (
                          <div>
                            <div style={{ fontSize:11, color:"var(--color-text-secondary)", marginBottom:8, lineHeight:1.5 }}>{v.tip}</div>
                            {feeGauge(Math.max(45, currentFee.fee - saveHigh/2))}
                          </div>
                        )}
                        <button onClick={e=>{ e.stopPropagation(); download(v.dataUrl, v.id); }} style={{ marginTop:6, width:"100%", padding:"5px 0", borderRadius:6, border:"0.5px solid var(--color-border-secondary)", background:"var(--color-background-secondary)", fontSize:11, cursor:"pointer", color:"var(--color-text-primary)", display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
                          <i className="ti ti-download" style={{ fontSize:12 }} />Download
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Combination tip */}
              <div style={{ marginTop:16, padding:"12px 14px", borderRadius:10, background:"#FEE9F4", border:"0.5px solid #F4339730" }}>
                <div style={{ fontSize:12, fontWeight:500, marginBottom:4, color:"#F43397" }}>
                  <i className="ti ti-bulb" style={{ marginRight:5 }} />Combination tip
                </div>
                <div style={{ fontSize:12, color:"var(--color-text-secondary)", lineHeight:1.6 }}>
                  For best results, combine <strong>zoom in (crop 15%)</strong> with a <strong>white border</strong> to remove packaging clutter while maintaining professional presentation. Sellers report this combination saves ₹20–40 on Meesho shipping by nudging the product into a lighter perceived category. Always verify the final fee in your Supplier Panel before publishing.
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
const TABS = [
  { id:"create",       label:"Create",         icon:"ti-plus" },
  { id:"pull",         label:"Pull & Transfer",icon:"ti-arrow-autofit-right" },
  { id:"links",        label:"SKU Links",      icon:"ti-link" },
  { id:"meesho",       label:"Meesho Image",   icon:"ti-photo-ai" },
  { id:"optimizer",    label:"AI Optimize",    icon:"ti-sparkles", accent:"#7c3aed" },
  { id:"imagestudio",  label:"Image Studio",   icon:"ti-photo-star", accent:"#0891b2" },
  { id:"profitability",label:"Profitability",  icon:"ti-trending-up", accent:"#16a34a" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("create");
  const [apiKeys, setApiKeys] = useState({});
  const [serverStatus, setServerStatus] = useState(null);
  const [transferProduct, setTransferProduct] = useState(null);
  // Shared product state — create tab writes, optimizer/image/profit tabs read
  const [sharedProduct, setSharedProduct] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/health`).then(r=>r.json()).then(setServerStatus).catch(()=>setServerStatus({ status:"error" }));
  }, []);

  const handleTransferToCreate = (product) => {
    setTransferProduct(product);
    setSharedProduct(product);
    setActiveTab("create");
  };

  const handleProductUpdate = (updater) => {
    setSharedProduct(prev => typeof updater === "function" ? updater(prev||{}) : updater);
  };

  return (
    <div style={{ padding:"1.5rem 0", maxWidth:720 }}>
      <h2 className="sr-only">Multi-Platform E-Commerce Lister</h2>

      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
            <i className="ti ti-world-upload" style={{ fontSize:20, color:"#2563EB" }} aria-hidden="true" />
            <span style={{ fontSize:19, fontWeight:500 }}>Multi-Platform Lister</span>
          </div>
          <p style={{ margin:0, fontSize:12, color:"var(--color-text-secondary)" }}>Amazon · Flipkart · Meesho · Shopify · Amazon Vendor</p>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
          <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11 }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background:serverStatus?.status==="ok"?"var(--color-text-success)":serverStatus?.status==="error"?"var(--color-text-danger)":"var(--color-text-secondary)" }} />
            <span style={{ color:"var(--color-text-secondary)" }}>{serverStatus?.status==="ok"?"Backend online":serverStatus?.status==="error"?"No backend":"Checking…"}</span>
          </div>
          {sharedProduct?.title && (
            <div style={{ fontSize:11, color:"var(--color-text-secondary)", maxWidth:180, textAlign:"right", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              <i className="ti ti-package" style={{ marginRight:3 }} />{sharedProduct.title}
            </div>
          )}
        </div>
      </div>

      {/* Tab bar — two rows for 7 tabs */}
      <div style={{ marginBottom:24 }}>
        <div style={{ display:"flex", gap:2, flexWrap:"wrap", borderBottom:"0.5px solid var(--color-border-tertiary)" }}>
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            const accent = tab.accent || "#2563EB";
            return (
              <button key={tab.id} onClick={()=>{ setActiveTab(tab.id); if(tab.id!=="create") setTransferProduct(null); }} style={{ padding:"7px 12px", borderRadius:"8px 8px 0 0", border:active?"0.5px solid var(--color-border-tertiary)":"none", borderBottom:active?"1px solid var(--color-background-primary)":"none", marginBottom:active?-1:0, background:active?"var(--color-background-primary)":"transparent", fontSize:11, fontWeight:active?500:400, cursor:"pointer", color:active?accent:"var(--color-text-secondary)", display:"flex", alignItems:"center", gap:4 }}>
                <i className={`ti ${tab.icon}`} style={{ fontSize:13, color:active?accent:"var(--color-text-secondary)" }} aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      {activeTab==="create"       && <CreateTab apiKeys={apiKeys} setApiKeys={setApiKeys} initialProduct={transferProduct} serverStatus={serverStatus} onProductChange={setSharedProduct} />}
      {activeTab==="pull"         && <PullTransferTab apiKeys={apiKeys} setApiKeys={setApiKeys} onTransfer={handleTransferToCreate} serverStatus={serverStatus} />}
      {activeTab==="links"        && <SKULinksTab apiKeys={apiKeys} />}
      {activeTab==="meesho"       && <MeeshoImageTab />}
      {activeTab==="optimizer"    && <AIOptimizerTab product={sharedProduct} onProductUpdate={handleProductUpdate} />}
      {activeTab==="imagestudio"  && <ImageStudioTab product={sharedProduct} apiKeys={apiKeys} />}
      {activeTab==="profitability"&& <ProfitabilityTab product={sharedProduct} />}
    </div>
  );
}
