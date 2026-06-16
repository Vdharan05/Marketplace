import { useState, useRef } from "react";

const API_BASE = "http://localhost:3001/api";

const IMAGE_TYPES = [
  { id:"white_bg",     label:"White BG product",  icon:"ti-photo",          desc:"Clean product shot on white — required main image for Amazon & Flipkart" },
  { id:"lifestyle",    label:"Lifestyle",          icon:"ti-home",           desc:"Product in natural use environment with real people" },
  { id:"size_reference",label:"Size reference",   icon:"ti-ruler",          desc:"Product next to common objects to show scale clearly" },
  { id:"infographic",  label:"Feature infographic",icon:"ti-chart-bar",      desc:"Product with labeled callouts highlighting key features" },
  { id:"comparison",   label:"Comparison chart",  icon:"ti-columns-2",      desc:"Side-by-side vs competitor / generic — shows your advantages" },
  { id:"size_chart",   label:"Size chart",        icon:"ti-table",          desc:"Dimension/measurement chart (essential for clothing)" },
  { id:"packaging",    label:"Packaging shot",    icon:"ti-package",        desc:"What the customer receives — builds trust" },
  { id:"aplus_hero",   label:"A+ Hero banner",   icon:"ti-panorama",       desc:"Full-width lifestyle banner for A+ Content section 1" },
  { id:"aplus_feature",label:"A+ Feature module",icon:"ti-layout-columns", desc:"3-column feature highlight layout for A+ Content" },
  { id:"aplus_brand",  label:"A+ Brand story",   icon:"ti-heart-handshake",desc:"Brand narrative image for A+ Content brand story module" },
];

const PROVIDERS = [
  { id:"stability", label:"Stability AI", note:"Best for product shots" },
  { id:"dalle",     label:"DALL-E 3",     note:"Best for lifestyle/scene" },
  { id:"ideogram",  label:"Ideogram v2",  note:"Best for text in images" },
];

const APLUS_PLATFORMS = [
  { id:"amazon", label:"Amazon A+ Content", color:"#FF9900" },
  { id:"flipkart", label:"Flipkart ECC", color:"#2874F0" },
];

const inp = { width:"100%", boxSizing:"border-box", padding:"7px 11px", fontSize:13, borderRadius:7, border:"0.5px solid var(--color-border-secondary)", background:"var(--color-background-primary)", color:"var(--color-text-primary)" };

export default function ImageStudioTab({ product, apiKeys }) {
  const [activeMode, setActiveMode] = useState("studio"); // "studio" | "aplus"
  const [selectedType, setSelectedType] = useState("lifestyle");
  const [provider, setProvider] = useState("stability");
  const [providerKeys, setProviderKeys] = useState({ stability_key:"", openai_key:"", ideogram_key:"" });
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("blurry, low quality, watermark, text, distorted");
  const [promptLoading, setPromptLoading] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [gallery, setGallery] = useState([]); // { base64, mime, type, prompt }
  const [selectedImage, setSelectedImage] = useState(null);
  const [uploadTarget, setUploadTarget] = useState("");
  const [uploadContext, setUploadContext] = useState({ productId:"" });
  const [uploadStatus, setUploadStatus] = useState("");
  // A+ content state
  const [aplusPlatform, setAplusPlatform] = useState("amazon");
  const [aplusLoading, setAplusLoading] = useState(false);
  const [aplusLayout, setAplusLayout] = useState(null);
  const [aplusImages, setAplusImages] = useState({});
  // FIX BUG 9: Track loading state per module index so buttons reflect their own loading state
  const [aplusModuleLoading, setAplusModuleLoading] = useState({});
  const [aplusUploadStatus, setAplusUploadStatus] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [error, setError] = useState("");

  const generatePrompt = async () => {
    if (!product?.title) { setError("No product loaded — fill in product details first."); return; }
    setPromptLoading(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/imagegen/prompt`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ product, image_type:selectedType, platform:uploadTarget||"general", anthropic_key:anthropicKey||undefined })
      });
      const data = await res.json();
      setGeneratedPrompt(data.prompt||"");
      setNegativePrompt(prev => data.negative_prompt || prev);
    } catch(e) { setError(e.message); }
    setPromptLoading(false);
  };

  const generateImage = async () => {
    if (!generatedPrompt) { setError("Generate or write a prompt first."); return; }
    setGenLoading(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/imagegen/generate`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ prompt:generatedPrompt, negative_prompt:negativePrompt, provider, credentials:providerKeys })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error||"Generation failed");
      const newImg = { base64:data.base64, mime:data.mime, type:selectedType, prompt:generatedPrompt, provider, id:Date.now() };
      setGallery(prev=>[newImg,...prev]);
      setSelectedImage(newImg);
    } catch(e) { setError(e.message); }
    setGenLoading(false);
  };

  const uploadImage = async () => {
    if (!selectedImage||!uploadTarget) return;
    setUploadStatus("uploading");
    try {
      const res = await fetch(`${API_BASE}/imagegen/upload`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ platform:uploadTarget, base64:selectedImage.base64, mime:selectedImage.mime, credentials:apiKeys[uploadTarget]||{}, context:uploadContext })
      });
      const data = await res.json();
      setUploadStatus(data.message || (data.success?"Uploaded successfully!":"Upload failed"));
    } catch(e) { setUploadStatus("Upload error: "+e.message); }
  };

  const downloadImage = (img) => {
    const a = document.createElement("a");
    a.href = `data:${img.mime};base64,${img.base64}`;
    a.download = `${img.type}_${img.id}.jpg`;
    a.click();
  };

  // A+ CONTENT FLOW
  const generateAplusLayout = async () => {
    if (!product?.title) { setError("No product loaded."); return; }
    setAplusLoading(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/optimize/aplus`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ product, platform:aplusPlatform, anthropic_key:anthropicKey||undefined })
      });
      const data = await res.json();
      setAplusLayout(data.layout);
    } catch(e) { setError(e.message); }
    setAplusLoading(false);
  };

  const generateAplusModuleImage = async (moduleIdx) => {
    const mod = aplusLayout?.modules?.[moduleIdx];
    if (!mod?.image_prompt) return;
    // FIX BUG 9: Set per-module loading flag
    setAplusModuleLoading(prev => ({ ...prev, [moduleIdx]: true }));
    try {
      const res = await fetch(`${API_BASE}/imagegen/generate`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ prompt:mod.image_prompt, negative_prompt:"text, watermark, blurry", provider, credentials:providerKeys })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Generation failed");
      setAplusImages(prev=>({...prev,[moduleIdx]:data.base64}));
    } catch(e) { setError(e.message); }
    setAplusModuleLoading(prev => ({ ...prev, [moduleIdx]: false }));
  };

  const uploadAplusContent = async () => {
    if (!aplusLayout || aplusPlatform!=="amazon") { setAplusUploadStatus("Only Amazon A+ upload is currently supported."); return; }
    setAplusUploadStatus("Uploading A+ content to Amazon…");
    try {
      const res = await fetch(`${API_BASE}/imagegen/aplus`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ asin:product.asin||"", layout:aplusLayout, moduleImages:Object.values(aplusImages), credentials:apiKeys })
      });
      const data = await res.json();
      setAplusUploadStatus(data.message || (data.success?"Uploaded!":"Failed."));
    } catch(e) { setAplusUploadStatus("Error: "+e.message); }
  };

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
        <i className="ti ti-photo-star" style={{ fontSize:18, color:"#0891b2" }} aria-hidden="true" />
        <span style={{ fontSize:16, fontWeight:500 }}>Image Studio</span>
      </div>
      <p style={{ margin:"0 0 20px", fontSize:13, color:"var(--color-text-secondary)" }}>
        Generate product images, lifestyle shots, infographics, and full A+ content panels. Upload directly to your marketplaces.
      </p>

      {/* Mode tabs */}
      <div style={{ display:"flex", gap:8, marginBottom:20 }}>
        {[{id:"studio",label:"Image generator"},{id:"aplus",label:"A+ Content builder"}].map(m=>(
          <button key={m.id} onClick={()=>setActiveMode(m.id)} style={{ padding:"7px 16px", borderRadius:8, border:activeMode===m.id?"2px solid #0891b2":"0.5px solid var(--color-border-secondary)", background:activeMode===m.id?"#EFF9FB":"var(--color-background-primary)", fontSize:13, cursor:"pointer", fontWeight:activeMode===m.id?500:400, color:activeMode===m.id?"#0e7490":"var(--color-text-secondary)" }}>
            {m.label}
          </button>
        ))}
      </div>

      {error && <div style={{ marginBottom:14, padding:"8px 12px", borderRadius:8, background:"var(--color-background-danger)", color:"var(--color-text-danger)", fontSize:13 }}>{error}</div>}

      {/* ── STUDIO MODE ── */}
      {activeMode==="studio" && (
        <div>
          {/* Image type grid */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:12, color:"var(--color-text-secondary)", marginBottom:8 }}>Image type:</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:8 }}>
              {IMAGE_TYPES.map(t => (
                <button key={t.id} onClick={()=>setSelectedType(t.id)} style={{ padding:"10px", borderRadius:10, border:selectedType===t.id?"2px solid #0891b2":"0.5px solid var(--color-border-tertiary)", background:selectedType===t.id?"#EFF9FB":"var(--color-background-primary)", cursor:"pointer", textAlign:"left" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                    <i className={`ti ${t.icon}`} style={{ fontSize:14, color:selectedType===t.id?"#0891b2":"var(--color-text-secondary)" }} aria-hidden="true" />
                    <span style={{ fontSize:12, fontWeight:500, color:selectedType===t.id?"#0e7490":"var(--color-text-primary)" }}>{t.label}</span>
                  </div>
                  <div style={{ fontSize:10, color:"var(--color-text-secondary)", lineHeight:1.4 }}>{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Provider + keys */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:14 }}>
            <div>
              <div style={{ fontSize:12, color:"var(--color-text-secondary)", marginBottom:6 }}>Image provider:</div>
              {PROVIDERS.map(prov=>(
                <label key={prov.id} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4, cursor:"pointer", fontSize:13 }}>
                  <input type="radio" value={prov.id} checked={provider===prov.id} onChange={e=>setProvider(e.target.value)} />
                  {prov.label} <span style={{ fontSize:11, color:"var(--color-text-secondary)" }}>({prov.note})</span>
                </label>
              ))}
            </div>
            <div>
              <div style={{ fontSize:12, color:"var(--color-text-secondary)", marginBottom:4 }}>Provider API key:</div>
              <input type="password" style={inp} placeholder={provider==="stability"?"sk-…":provider==="dalle"?"sk-…":"API key"} value={providerKeys[provider==="stability"?"stability_key":provider==="dalle"?"openai_key":"ideogram_key"]||""} onChange={e=>setProviderKeys(prev=>({...prev,[provider==="stability"?"stability_key":provider==="dalle"?"openai_key":"ideogram_key"]:e.target.value}))} />
            </div>
            <div>
              <div style={{ fontSize:12, color:"var(--color-text-secondary)", marginBottom:4 }}>Anthropic key (prompt gen):</div>
              <input type="password" style={inp} placeholder="sk-ant-… (uses .env if blank)" value={anthropicKey} onChange={e=>setAnthropicKey(e.target.value)} />
            </div>
          </div>

          {/* Prompt area */}
          <div style={{ marginBottom:14 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
              <div style={{ fontSize:12, color:"var(--color-text-secondary)" }}>Image prompt:</div>
              <button onClick={generatePrompt} disabled={promptLoading||!product?.title} style={{ fontSize:11, padding:"3px 10px", borderRadius:20, border:"0.5px solid var(--color-border-secondary)", background:"var(--color-background-secondary)", cursor:"pointer", color:"var(--color-text-secondary)", display:"flex", alignItems:"center", gap:3 }}>
                <i className="ti ti-wand" style={{ fontSize:12 }} />{promptLoading?"Generating…":"AI Generate prompt"}
              </button>
            </div>
            <textarea style={{ ...inp, height:80, resize:"vertical", marginBottom:8 }} placeholder="Describe the image you want to generate…" value={generatedPrompt} onChange={e=>setGeneratedPrompt(e.target.value)} />
            <div style={{ fontSize:12, color:"var(--color-text-secondary)", marginBottom:4 }}>Negative prompt (what to avoid):</div>
            <input style={inp} value={negativePrompt} onChange={e=>setNegativePrompt(e.target.value)} />
          </div>

          <button onClick={generateImage} disabled={genLoading||!generatedPrompt} style={{ padding:"9px 24px", borderRadius:8, border:"none", background:genLoading||!generatedPrompt?"var(--color-border-tertiary)":"#0891b2", color:genLoading||!generatedPrompt?"var(--color-text-secondary)":"#fff", fontSize:13, fontWeight:500, cursor:"pointer", display:"flex", alignItems:"center", gap:7, marginBottom:20 }}>
            <i className={`ti ${genLoading?"ti-loader-2":"ti-photo-ai"}`} style={{ fontSize:16 }} />
            {genLoading?"Generating image…":`Generate with ${PROVIDERS.find(p=>p.id===provider)?.label}`}
          </button>

          {/* Gallery */}
          {gallery.length>0 && (
            <div>
              <div style={{ fontSize:13, fontWeight:500, marginBottom:12 }}>Generated images ({gallery.length})</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:12, marginBottom:20 }}>
                {gallery.map(img=>(
                  <div key={img.id} onClick={()=>setSelectedImage(img)} style={{ border:selectedImage?.id===img.id?"2px solid #0891b2":"0.5px solid var(--color-border-tertiary)", borderRadius:10, overflow:"hidden", cursor:"pointer" }}>
                    <img src={`data:${img.mime};base64,${img.base64}`} alt={img.type} style={{ width:"100%", height:160, objectFit:"cover" }} />
                    <div style={{ padding:"6px 8px" }}>
                      <div style={{ fontSize:11, fontWeight:500 }}>{IMAGE_TYPES.find(t=>t.id===img.type)?.label}</div>
                      <div style={{ fontSize:10, color:"var(--color-text-secondary)" }}>{img.provider}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Selected image actions */}
              {selectedImage && (
                <div style={{ border:"0.5px solid var(--color-border-tertiary)", borderRadius:12, overflow:"hidden" }}>
                  <div style={{ display:"flex", gap:16, padding:16 }}>
                    <img src={`data:${selectedImage.mime};base64,${selectedImage.base64}`} alt="" style={{ width:200, height:200, objectFit:"contain", borderRadius:8, flexShrink:0, background:"#f5f5f5" }} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:500, marginBottom:10 }}>
                        {IMAGE_TYPES.find(t=>t.id===selectedImage.type)?.label}
                      </div>
                      <button onClick={()=>downloadImage(selectedImage)} style={{ padding:"7px 14px", borderRadius:8, border:"0.5px solid var(--color-border-secondary)", background:"var(--color-background-primary)", fontSize:12, cursor:"pointer", display:"flex", alignItems:"center", gap:5, marginBottom:12 }}>
                        <i className="ti ti-download" style={{ fontSize:13 }} />Download
                      </button>
                      <div style={{ fontSize:12, color:"var(--color-text-secondary)", marginBottom:8 }}>Upload to marketplace:</div>
                      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:10 }}>
                        {["amazon","flipkart","meesho","shopify"].map(pid=>(
                          <button key={pid} onClick={()=>setUploadTarget(pid)} style={{ padding:"4px 10px", borderRadius:20, border:uploadTarget===pid?"2px solid #0891b2":"0.5px solid var(--color-border-tertiary)", background:uploadTarget===pid?"#EFF9FB":"var(--color-background-primary)", fontSize:11, cursor:"pointer", color:uploadTarget===pid?"#0e7490":"var(--color-text-secondary)" }}>
                            {pid.charAt(0).toUpperCase()+pid.slice(1)}
                          </button>
                        ))}
                      </div>
                      {uploadTarget==="shopify" && (
                        <input style={{ ...inp, marginBottom:8 }} placeholder="Shopify Product ID" value={uploadContext.productId||""} onChange={e=>setUploadContext({productId:e.target.value})} />
                      )}
                      <button onClick={uploadImage} disabled={!uploadTarget} style={{ padding:"7px 16px", borderRadius:8, border:"none", background:!uploadTarget?"var(--color-border-tertiary)":"#0891b2", color:!uploadTarget?"var(--color-text-secondary)":"#fff", fontSize:12, cursor:"pointer" }}>
                        Upload to {uploadTarget||"…"}
                      </button>
                      {uploadStatus && <div style={{ marginTop:8, fontSize:12, color:"var(--color-text-secondary)" }}>{uploadStatus}</div>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── A+ CONTENT MODE ── */}
      {activeMode==="aplus" && (
        <div>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:12, color:"var(--color-text-secondary)", marginBottom:8 }}>Target platform:</div>
            <div style={{ display:"flex", gap:8 }}>
              {APLUS_PLATFORMS.map(ap=>(
                <button key={ap.id} onClick={()=>setAplusPlatform(ap.id)} style={{ padding:"6px 14px", borderRadius:20, border:aplusPlatform===ap.id?`2px solid ${ap.color}`:"0.5px solid var(--color-border-tertiary)", background:"var(--color-background-primary)", fontSize:12, cursor:"pointer", color:aplusPlatform===ap.id?ap.color:"var(--color-text-secondary)", fontWeight:aplusPlatform===ap.id?500:400 }}>
                  {ap.label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={generateAplusLayout} disabled={aplusLoading||!product?.title} style={{ padding:"9px 20px", borderRadius:8, border:"none", background:aplusLoading||!product?.title?"var(--color-border-tertiary)":"#7c3aed", color:aplusLoading||!product?.title?"var(--color-text-secondary)":"#fff", fontSize:13, fontWeight:500, cursor:"pointer", display:"flex", alignItems:"center", gap:7, marginBottom:20 }}>
            <i className={`ti ${aplusLoading?"ti-loader-2":"ti-layout"}`} style={{ fontSize:16 }} />
            {aplusLoading?"Generating A+ layout…":"Generate A+ Content layout"}
          </button>

          {aplusLayout && (
            <div>
              <div style={{ marginBottom:14, padding:"10px 14px", background:"var(--color-background-secondary)", borderRadius:10, fontSize:13 }}>
                <strong>Strategy:</strong> {aplusLayout.overall_strategy}
                {aplusLayout.color_scheme && <><br/><strong>Color:</strong> {aplusLayout.color_scheme}</>}
              </div>

              {aplusLayout.modules?.map((mod, i) => (
                <div key={i} style={{ marginBottom:14, border:"0.5px solid var(--color-border-tertiary)", borderRadius:12, overflow:"hidden" }}>
                  <div style={{ padding:"9px 14px", background:"var(--color-background-secondary)", borderBottom:"0.5px solid var(--color-border-tertiary)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <span style={{ fontSize:11, color:"var(--color-text-secondary)", textTransform:"uppercase", letterSpacing:"0.5px" }}>Module {i+1} · </span>
                      <span style={{ fontSize:13, fontWeight:500 }}>{mod.type?.replace(/_/g," ")}</span>
                    </div>
                    <button onClick={()=>generateAplusModuleImage(i)} disabled={aplusModuleLoading[i]||(!providerKeys.stability_key&&!providerKeys.openai_key&&!providerKeys.ideogram_key)} style={{ fontSize:11, padding:"3px 10px", borderRadius:20, border:"0.5px solid var(--color-border-secondary)", background:aplusImages[i]?"var(--color-background-success)":"var(--color-background-primary)", cursor:"pointer", color:aplusImages[i]?"var(--color-text-success)":aplusModuleLoading[i]?"var(--color-text-secondary)":"var(--color-text-secondary)" }}>
                      {aplusModuleLoading[i]?"Generating…":aplusImages[i]?"✓ Image generated":"Generate image"}
                    </button>
                  </div>
                  <div style={{ padding:14, display:"flex", gap:14 }}>
                    {aplusImages[i] && <img src={`data:image/jpeg;base64,${aplusImages[i]}`} alt={mod.type} style={{ width:100, height:100, objectFit:"cover", borderRadius:8, flexShrink:0 }} />}
                    <div style={{ flex:1, fontSize:13 }}>
                      {mod.headline && <div><strong>Headline:</strong> {mod.headline}</div>}
                      {mod.subheadline && <div style={{ color:"var(--color-text-secondary)" }}>{mod.subheadline}</div>}
                      {mod.story && <div style={{ marginTop:4, color:"var(--color-text-secondary)", lineHeight:1.5, fontSize:12 }}>{mod.story}</div>}
                      {mod.features && <div style={{ marginTop:4, fontSize:12, color:"var(--color-text-secondary)" }}>{mod.features.map(f=>f.title).join(" · ")}</div>}
                      {mod.rows && <div style={{ marginTop:4, fontSize:12 }}>{mod.rows.map(r=>`${r.attribute}: ${r.ours}`).join(", ")}</div>}
                      {mod.image_prompt && <div style={{ marginTop:6, fontSize:11, color:"var(--color-text-secondary)", fontStyle:"italic" }}>Image prompt: {mod.image_prompt.slice(0,80)}…</div>}
                    </div>
                  </div>
                </div>
              ))}

              <div style={{ marginTop:16, padding:14, border:"0.5px solid var(--color-border-tertiary)", borderRadius:12 }}>
                {aplusPlatform==="amazon" && (
                  <>
                    <div style={{ fontSize:12, color:"var(--color-text-secondary)", marginBottom:8 }}>Amazon ASIN for A+ upload:</div>
                    <input style={{ ...inp, marginBottom:12 }} placeholder="B0XXXXXXXXX" value={product?.asin||""} />
                  </>
                )}
                <button onClick={uploadAplusContent} style={{ padding:"9px 20px", borderRadius:8, border:"none", background:"#FF9900", color:"#fff", fontSize:13, fontWeight:500, cursor:"pointer", display:"flex", alignItems:"center", gap:7 }}>
                  <i className="ti ti-upload" style={{ fontSize:16 }} />
                  Upload A+ Content to {APLUS_PLATFORMS.find(p=>p.id===aplusPlatform)?.label}
                </button>
                {aplusUploadStatus && <div style={{ marginTop:10, fontSize:13, color:"var(--color-text-secondary)" }}>{aplusUploadStatus}</div>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
