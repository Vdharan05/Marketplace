import { useState, useMemo, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Cell, Legend } from "recharts";

// Platform commission defaults by category (India, approximate %)
const PLATFORM_COMMISSIONS = {
  amazon: { "Clothing & Apparel":17, "Electronics":7, "Home & Kitchen":11, "Beauty & Personal Care":12, "Books":12, "Toys & Games":14, "Sports & Outdoors":10, "Automotive":8, "Grocery & Food":5, "Jewelry":15, "Health & Wellness":10, "Baby Products":13, "Office Supplies":12, "Pet Supplies":12, "Music & Instruments":10, _default:12 },
  amazon_vendor: { _default:25 },
  flipkart: { "Clothing & Apparel":15, "Electronics":6, "Home & Kitchen":10, "Beauty & Personal Care":10, "Books":10, "Toys & Games":13, "Sports & Outdoors":9, "Automotive":7, "Grocery & Food":4, "Jewelry":14, "Health & Wellness":9, "Baby Products":12, "Office Supplies":10, "Pet Supplies":10, "Music & Instruments":9, _default:10 },
  meesho:  { _default:0 },
  shopify: { _default:0 },
};

// Platform fixed fees (per order, approximate INR)
const PLATFORM_FIXED_FEES = {
  amazon:       { collection_fee:25, closing_fee:20 },
  amazon_vendor:{ collection_fee:0,  closing_fee:0 },
  flipkart:     { collection_fee:18, closing_fee:15 },
  meesho:       { collection_fee:0,  closing_fee:0 },
  shopify:      { collection_fee:0,  closing_fee:0 },
};

const PLATFORM_META = {
  amazon:       { name:"Amazon Seller",  color:"#FF9900", icon:"ti-brand-amazon" },
  amazon_vendor:{ name:"Amazon Vendor",  color:"#146EB4", icon:"ti-building-store" },
  flipkart:     { name:"Flipkart",       color:"#2874F0", icon:"ti-shopping-cart" },
  meesho:       { name:"Meesho",         color:"#F43397", icon:"ti-tag" },
  shopify:      { name:"Shopify",        color:"#96BF48", icon:"ti-brand-shopify" },
};

const PLATFORM_IDS = Object.keys(PLATFORM_META);

const RADAR_COLORS = ["#FF9900","#146EB4","#2874F0","#F43397","#96BF48"];

function fmt(n) { return `₹${Math.round(n).toLocaleString("en-IN")}`; }
function pct(n) { return `${n.toFixed(1)}%`; }

export default function ProfitabilityTab({ product }) {
  const [costs, setCosts] = useState({
    cogs: "", inbound_shipping: "", import_duty_pct: "0", packaging: "",
    storage_monthly: "", advertising: "", return_rate_pct: "3",
    outbound_shipping: "", overhead: "",
  });

  const [prices, setPrices] = useState(
    Object.fromEntries(PLATFORM_IDS.map(id => [id, { selling_price: product?.price||"", gst_pct: product?.gst||"18", commission_override:"", enabled: true }]))
  );

  // FIX BUG 5: When product prop changes (user fills Create tab), pre-fill selling prices
  // Only update fields the user hasn't already manually edited
  useEffect(() => {
    if (!product) return;
    setPrices(prev =>
      Object.fromEntries(
        PLATFORM_IDS.map(id => [
          id,
          {
            ...prev[id],
            // Only pre-fill selling_price if the field is still empty
            selling_price: prev[id].selling_price || product.price || "",
            gst_pct: prev[id].gst_pct !== "18" ? prev[id].gst_pct : (product.gst || "18"),
          }
        ])
      )
    );
  }, [product?.price, product?.gst]); // eslint-disable-line react-hooks/exhaustive-deps

  const [activePlatforms, setActivePlatforms] = useState(new Set(["amazon","flipkart","meesho","shopify"]));
  const [activeView, setActiveView] = useState("table"); // table | bar | radar

  const updCost = (k,v) => setCosts(p=>({...p,[k]:v}));
  const updPrice = (pid,k,v) => setPrices(p=>({...p,[pid]:{...p[pid],[k]:v}}));
  const togglePlatform = pid => setActivePlatforms(prev=>{ const s=new Set(prev); s.has(pid)?s.delete(pid):s.add(pid); return s; });

  // ── Calculation engine ───────────────────────────────────────────────────────
  const results = useMemo(() => {
    const c = {
      cogs:          parseFloat(costs.cogs)||0,
      inbound:       parseFloat(costs.inbound_shipping)||0,
      import_duty:   parseFloat(costs.import_duty_pct)||0,
      packaging:     parseFloat(costs.packaging)||0,
      storage:       parseFloat(costs.storage_monthly)||0,
      advertising:   parseFloat(costs.advertising)||0,
      return_rate:   parseFloat(costs.return_rate_pct)||0,
      outbound:      parseFloat(costs.outbound_shipping)||0,
      overhead:      parseFloat(costs.overhead)||0,
    };

    const importDutyAmt = c.cogs * (c.import_duty / 100);
    const totalFixedCost = c.cogs + importDutyAmt + c.inbound + c.packaging + c.storage + c.overhead;

    return Object.fromEntries(
      PLATFORM_IDS.filter(pid => activePlatforms.has(pid)).map(pid => {
        const pp = prices[pid];
        const sp = parseFloat(pp.selling_price) || 0;
        const gst = parseFloat(pp.gst_pct) || 18;
        const category = product?.category || "";
        const commRate = parseFloat(pp.commission_override) || (PLATFORM_COMMISSIONS[pid][category] ?? PLATFORM_COMMISSIONS[pid]._default ?? 0);
        const fixedFees = (PLATFORM_FIXED_FEES[pid]?.collection_fee||0) + (PLATFORM_FIXED_FEES[pid]?.closing_fee||0);

        const commAmt    = sp * (commRate / 100);
        const gstAmt     = sp * (gst / 100) / (1 + gst/100); // GST backed out of selling price
        const returnCost = sp * (c.return_rate / 100) * 0.5; // assume 50% resell recovery
        const totalCost  = totalFixedCost + commAmt + fixedFees + c.advertising + c.outbound + returnCost;
        const netProfit  = sp - totalCost - gstAmt;
        const grossProfit= sp - c.cogs - importDutyAmt;
        const netMargin  = sp > 0 ? (netProfit / sp) * 100 : 0;
        const grossMargin= sp > 0 ? (grossProfit / sp) * 100 : 0;
        const roi        = c.cogs > 0 ? (netProfit / c.cogs) * 100 : 0;
        const breakEven  = totalCost + gstAmt;

        return [pid, { sp, gst, commRate, commAmt, gstAmt, fixedFees, returnCost, totalCost, netProfit, grossProfit, netMargin, grossMargin, roi, breakEven }];
      })
    );
  }, [costs, prices, activePlatforms, product]);

  const best = useMemo(() => {
    const entries = Object.entries(results);
    if (!entries.length) return null;
    return entries.reduce((best, [pid, r]) => r.netProfit > (results[best]?.netProfit ?? -Infinity) ? pid : best, entries[0][0]);
  }, [results]);

  const barData = useMemo(() => Object.entries(results).map(([pid, r]) => ({
    name: PLATFORM_META[pid].name.replace("Amazon Seller","Amazon").replace("Amazon Vendor","Vendor"),
    "Net profit": Math.round(r.netProfit),
    "Gross profit": Math.round(r.grossProfit),
    color: PLATFORM_META[pid].color,
  })), [results]);

  const radarData = useMemo(() => {
    const metrics = ["Net margin","Gross margin","ROI","Commission efficiency","Price competitiveness"];
    return metrics.map(m => {
      const entry = { metric: m };
      Object.entries(results).forEach(([pid, r]) => {
        if (m==="Net margin")             entry[pid] = Math.max(0, Math.min(100, r.netMargin));
        else if (m==="Gross margin")      entry[pid] = Math.max(0, Math.min(100, r.grossMargin));
        else if (m==="ROI")               entry[pid] = Math.max(0, Math.min(100, r.roi/2));
        else if (m==="Commission efficiency") entry[pid] = Math.max(0, 100 - r.commRate * 3);
        else if (m==="Price competitiveness") entry[pid] = 70;
      });
      return entry;
    });
  }, [results]);

  const inp = { boxSizing:"border-box", padding:"7px 10px", fontSize:13, borderRadius:7, border:"0.5px solid var(--color-border-secondary)", background:"var(--color-background-primary)", color:"var(--color-text-primary)" };

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
        <i className="ti ti-trending-up" style={{ fontSize:18, color:"#16a34a" }} aria-hidden="true" />
        <span style={{ fontSize:16, fontWeight:500 }}>Profitability Calculator</span>
      </div>
      <p style={{ margin:"0 0 20px", fontSize:13, color:"var(--color-text-secondary)" }}>
        Enter all costs and selling prices to calculate net profit, margin, and ROI per marketplace — then compare side by side.
      </p>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:24 }}>
        {/* Cost inputs */}
        <div>
          <div style={{ fontSize:13, fontWeight:500, marginBottom:12, display:"flex", alignItems:"center", gap:6 }}>
            <i className="ti ti-coins" style={{ fontSize:15, color:"var(--color-text-secondary)" }} />Cost inputs (per unit)
          </div>
          {[
            ["cogs",             "Cost of Goods (COGS) ₹", "Purchase / manufacturing cost"],
            ["inbound_shipping", "Inbound shipping ₹",      "Warehouse/FBA inbound cost"],
            ["import_duty_pct",  "Import duty %",           "As % of COGS"],
            ["packaging",        "Packaging cost ₹",        "Box, tape, inserts"],
            ["storage_monthly",  "Storage fee ₹/month",     "Warehouse or FBA storage"],
            ["advertising",      "Advertising cost ₹",      "PPC / sponsored ads per unit"],
            ["return_rate_pct",  "Expected return rate %",  "% of orders returned"],
            ["outbound_shipping","Outbound shipping ₹",     "Your shipping to customer (if not platform)"],
            ["overhead",         "Other overhead ₹",        "Photography, team, tools etc."],
          ].map(([key, label, hint]) => (
            <div key={key} style={{ marginBottom:10 }}>
              <div style={{ fontSize:12, color:"var(--color-text-secondary)", marginBottom:3 }}>{label} <span style={{ fontSize:11, color:"var(--color-border-primary)" }}>— {hint}</span></div>
              <input type="number" style={{ ...inp, width:"100%" }} placeholder="0" value={costs[key]} onChange={e=>updCost(key,e.target.value)} />
            </div>
          ))}
        </div>

        {/* Per-platform prices */}
        <div>
          <div style={{ fontSize:13, fontWeight:500, marginBottom:12, display:"flex", alignItems:"center", gap:6 }}>
            <i className="ti ti-currency-rupee" style={{ fontSize:15, color:"var(--color-text-secondary)" }} />Selling prices by platform
          </div>
          {PLATFORM_IDS.map(pid => {
            const p = PLATFORM_META[pid];
            const enabled = activePlatforms.has(pid);
            const comm = PLATFORM_COMMISSIONS[pid][product?.category||""] ?? PLATFORM_COMMISSIONS[pid]._default ?? 0;
            return (
              <div key={pid} style={{ marginBottom:12, border:`0.5px solid ${enabled?p.color+"50":"var(--color-border-tertiary)"}`, borderRadius:10, overflow:"hidden" }}>
                <div style={{ padding:"8px 12px", background:enabled?PLATFORM_META[pid].color+"18":"var(--color-background-secondary)", display:"flex", alignItems:"center", gap:8 }}>
                  <input type="checkbox" checked={enabled} onChange={()=>togglePlatform(pid)} />
                  <i className={`ti ${p.icon}`} style={{ fontSize:14, color:p.color }} aria-hidden="true" />
                  <span style={{ fontSize:13, fontWeight:500, color:enabled?"var(--color-text-primary)":"var(--color-text-secondary)" }}>{p.name}</span>
                  {enabled && <span style={{ marginLeft:"auto", fontSize:11, color:"var(--color-text-secondary)" }}>default commission: {comm}%</span>}
                </div>
                {enabled && (
                  <div style={{ padding:"10px 12px", display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                    <div>
                      <div style={{ fontSize:11, color:"var(--color-text-secondary)", marginBottom:3 }}>Selling price ₹</div>
                      <input type="number" style={{ ...inp, width:"100%" }} placeholder="0" value={prices[pid].selling_price} onChange={e=>updPrice(pid,"selling_price",e.target.value)} />
                    </div>
                    <div>
                      <div style={{ fontSize:11, color:"var(--color-text-secondary)", marginBottom:3 }}>GST %</div>
                      <input type="number" style={{ ...inp, width:"100%" }} placeholder="18" value={prices[pid].gst_pct} onChange={e=>updPrice(pid,"gst_pct",e.target.value)} />
                    </div>
                    <div>
                      <div style={{ fontSize:11, color:"var(--color-text-secondary)", marginBottom:3 }}>Override commission %</div>
                      <input type="number" style={{ ...inp, width:"100%" }} placeholder={String(comm)} value={prices[pid].commission_override} onChange={e=>updPrice(pid,"commission_override",e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Results */}
      {Object.keys(results).length > 0 && (
        <div>
          {/* Best platform banner */}
          {best && results[best]?.netProfit > 0 && (
            <div style={{ marginBottom:16, padding:"12px 16px", borderRadius:12, background:"var(--color-background-success)", color:"var(--color-text-success)", display:"flex", alignItems:"center", gap:12 }}>
              <i className="ti ti-trophy" style={{ fontSize:24 }} />
              <div>
                <div style={{ fontWeight:500, fontSize:15 }}>Most profitable: {PLATFORM_META[best].name}</div>
                <div style={{ fontSize:13 }}>Net profit {fmt(results[best].netProfit)} · Margin {pct(results[best].netMargin)} · ROI {pct(results[best].roi)}</div>
              </div>
            </div>
          )}

          {/* View toggles */}
          <div style={{ display:"flex", gap:8, marginBottom:16 }}>
            {[{id:"table",icon:"ti-table",label:"Detail table"},{id:"bar",icon:"ti-chart-bar",label:"Profit comparison"},{id:"radar",icon:"ti-radar",label:"Metric radar"}].map(v=>(
              <button key={v.id} onClick={()=>setActiveView(v.id)} style={{ padding:"6px 14px", borderRadius:8, border:activeView===v.id?"2px solid #16a34a":"0.5px solid var(--color-border-secondary)", background:activeView===v.id?"var(--color-background-success)":"var(--color-background-primary)", fontSize:12, cursor:"pointer", color:activeView===v.id?"var(--color-text-success)":"var(--color-text-secondary)", display:"flex", alignItems:"center", gap:5 }}>
                <i className={`ti ${v.icon}`} style={{ fontSize:13 }} />{v.label}
              </button>
            ))}
          </div>

          {/* Table view */}
          {activeView==="table" && (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr style={{ background:"var(--color-background-secondary)" }}>
                    <th style={{ padding:"8px 12px", textAlign:"left", fontWeight:500, borderBottom:"0.5px solid var(--color-border-tertiary)" }}>Metric</th>
                    {Object.keys(results).map(pid=>(
                      <th key={pid} style={{ padding:"8px 12px", textAlign:"right", fontWeight:500, color:PLATFORM_META[pid].color, borderBottom:"0.5px solid var(--color-border-tertiary)" }}>
                        <i className={`ti ${PLATFORM_META[pid].icon}`} style={{ marginRight:4, fontSize:12 }} aria-hidden="true" />
                        {PLATFORM_META[pid].name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Selling price","sp",false,v=>fmt(v)],
                    ["Platform commission","commRate",false,v=>pct(v)],
                    ["Commission amount","commAmt",false,v=>fmt(v)],
                    ["Platform fixed fees","fixedFees",false,v=>fmt(v)],
                    ["GST (backed out)","gstAmt",false,v=>fmt(v)],
                    ["Return cost","returnCost",false,v=>fmt(v)],
                    ["Total cost per unit","totalCost",false,v=>fmt(v)],
                    ["Gross profit","grossProfit",true,v=>fmt(v)],
                    ["Gross margin","grossMargin",true,v=>pct(v)],
                    ["Net profit","netProfit",true,v=>fmt(v)],
                    ["Net margin","netMargin",true,v=>pct(v)],
                    ["ROI on COGS","roi",true,v=>pct(v)],
                    ["Break-even price","breakEven",null,v=>fmt(v)],
                  ].map(([label, field, positive, format], i) => (
                    <tr key={label} style={{ background: i%2===0?"transparent":"var(--color-background-secondary)" }}>
                      <td style={{ padding:"7px 12px", color:"var(--color-text-secondary)", borderBottom:"0.5px solid var(--color-border-tertiary)" }}>{label}</td>
                      {Object.entries(results).map(([pid, r]) => {
                        const val = r[field];
                        const isBest = positive && Object.entries(results).every(([p2,r2])=>p2===pid||r[field]>=r2[field]);
                        return (
                          <td key={pid} style={{ padding:"7px 12px", textAlign:"right", borderBottom:"0.5px solid var(--color-border-tertiary)", fontWeight:isBest?600:400, color:positive===true&&val>0?"var(--color-text-success)":positive===true&&val<0?"var(--color-text-danger)":positive===false&&isBest?"var(--color-text-success)":"var(--color-text-primary)" }}>
                            {format(val)}{isBest&&positive?" ✓":""}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Bar chart */}
          {activeView==="bar" && (
            <div style={{ height:280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top:10, right:10, left:0, bottom:5 }}>
                  <XAxis dataKey="name" tick={{ fontSize:11 }} />
                  <YAxis tickFormatter={v=>`₹${v}`} tick={{ fontSize:11 }} />
                  <Tooltip formatter={(value)=>[`₹${value.toLocaleString("en-IN")}`]} />
                  <Legend />
                  <Bar dataKey="Net profit" radius={[4,4,0,0]}>
                    {barData.map((entry, i)=><Cell key={i} fill={entry.color} />)}
                  </Bar>
                  <Bar dataKey="Gross profit" fill="#e5e7eb" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Radar chart */}
          {activeView==="radar" && (
            <div style={{ height:320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize:11 }} />
                  <PolarRadiusAxis domain={[0,100]} tick={false} />
                  {Object.keys(results).map((pid,i)=>(
                    <Radar key={pid} name={PLATFORM_META[pid].name} dataKey={pid} stroke={RADAR_COLORS[i]} fill={RADAR_COLORS[i]} fillOpacity={0.15} />
                  ))}
                  <Legend />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Quick summary cards */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))", gap:10, marginTop:20 }}>
            {Object.entries(results).map(([pid, r])=>(
              <div key={pid} style={{ background:"var(--color-background-secondary)", borderRadius:10, padding:"10px 12px", borderLeft:`3px solid ${PLATFORM_META[pid].color}` }}>
                <div style={{ fontSize:11, color:PLATFORM_META[pid].color, fontWeight:500, marginBottom:4 }}>{PLATFORM_META[pid].name}</div>
                <div style={{ fontSize:16, fontWeight:500, color:r.netProfit>=0?"var(--color-text-success)":"var(--color-text-danger)" }}>{fmt(r.netProfit)}</div>
                <div style={{ fontSize:11, color:"var(--color-text-secondary)" }}>net profit</div>
                <div style={{ fontSize:12, marginTop:4 }}>{pct(r.netMargin)} margin</div>
                <div style={{ fontSize:12 }}>{pct(r.roi)} ROI</div>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div style={{ marginTop:20, padding:"10px 14px", borderRadius:8, background:"var(--color-background-secondary)", fontSize:12, color:"var(--color-text-secondary)", lineHeight:1.7 }}>
            <strong>Notes:</strong> Meesho commission is 0% but sellers set lower prices for reseller margins. Shopify has no marketplace commission but has Shopify subscription fees (~₹2,000-20,000/month). Amazon Vendor Central margin is your wholesale-to-retail markup (typically 25-40% retained by Amazon). Returns assume 50% resell recovery. All figures are estimates — verify with your actual platform dashboards.
          </div>
        </div>
      )}
    </div>
  );
}
