import React, { useState, useRef, useEffect } from "react";

const BRAND = {
  orange: "#E8820C", orangeLight: "#F5A03A", navy: "#0E1B35",
  navyMid: "#1A2F55", navyLight: "#243B6B", gold: "#FFD166",
  white: "#F8F9FF", gray: "#8A9BB5", grayLight: "#C5D0E0",
  red: "#E84040", green: "#2ECC71", purple: "#9B59B6",
};

const PLATFORMS = ["TikTok", "Instagram", "X / Twitter", "Reddit", "YouTube", "Discord"];
const CONTENT_TYPES = {
  TikTok: ["Arb Reveal", "Myth Buster", "60-Second Explainer", "Injury Impact", "Member Win", "Season Hype"],
  Instagram: ["Results Carousel", "Story Poll", "Reel Hook", "Member Win Repost", "Tool Tour", "Weekend Preview"],
  "X / Twitter": ["Real-Time Thread", "Injury Alert", "Odds Commentary", "Arb Window Tweet", "Weekly Thread", "Game Live-Tweet"],
  Reddit: ["Educational Post", "AMA Thread", "Weekly Analysis", "Myth Debunk", "Community Discussion", "Results Recap"],
  YouTube: ["Arb Betting 101", "30-Day Challenge", "Sportsbook Comparison", "Season Guide", "Discord Tour", "Live Bet Along"],
  Discord: ["Weekly Briefing", "Alert Spotlight", "Member Win Feature", "Season Opener Announcement", "VIP Teaser", "Referral Promo"],
};
const SPORTS_CONTEXT = ["MLB", "NFL", "NBA", "NHL", "General / Off-Season"];
const TONES = ["Hype & Urgent", "Educational & Clear", "Data-Driven & Sharp", "Community & Warm", "Edgy & Bold"];

const SYSTEM_PROMPT = `You are the Valor Odds Marketing Agent — a specialized AI content strategist for Valor Odds and Sports, a premium Discord-based sports betting intelligence community.

BRAND IDENTITY:
- Valor Odds is the smart bettor's edge — an intelligence platform, not a tipster service
- Core pillars: EDGE (mathematical advantage via arbitrage), TRUST (transparent, data-backed), COMMUNITY (bettors helping bettors), SPEED (real-time alerts)
- Brand voice: Confident, data-driven, slightly edgy. Like a sharp trader, not a desperate tout
- NOT: gamblers, tipsters, get-rich-quick, or promise-makers

PRIMARY TAGLINES:
- "Tired of Losing? Turn the Odds in Your Favor."
- "The Smart Money Knows. Now You Do Too."
- "Stop Guessing. Start Winning."
- "The Edge Closes Fast. Get In Before the Line Moves."

PRODUCTS:
- Discord server with Supporter (~$9-15/mo) and VIP (~$29-49/mo) subscription tiers via MEE6
- Website: ValorOdds.com | Mobile app coming soon
- Social: TikTok, Instagram, Reddit, X/Twitter, YouTube
- Sports focus: MLB, NFL, NBA, NHL

CONTENT RULES:
- Never make specific income guarantees or ROI promises
- Frame as "data intelligence" and "odds analysis," not "guaranteed picks"
- Always include a subtle CTA directing to Discord or ValorOdds.com
- Create FOMO and urgency without being desperate
- Use data points, percentages, and specific numbers wherever possible

When generating content, be specific, punchy, and ready-to-post. Format output cleanly with clear sections.`;

async function callClaude(messages, onChunk, maxTokens = 1200) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages,
      stream: true,
    }),
  });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value).split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "content_block_delta" && data.delta?.text) {
            fullText += data.delta.text;
            onChunk(fullText);
          }
        } catch {}
      }
    }
  }
  return fullText;
}

// ── ICONS ──
const Icon = ({ name, size = 18, color = "currentColor" }) => {
  const icons = {
    bolt: <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
    copy: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>,
    check: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>,
    send: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
    chat: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
    calendar: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    sparkles: <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>,
    refresh: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>,
    fire: <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M12 2c0 0-5 6-5 11a5 5 0 0010 0c0-5-5-11-5-11zm0 14a2 2 0 01-2-2c0-2 2-5 2-5s2 3 2 5a2 2 0 01-2 2z"/></svg>,
    trophy: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M6 9H4a2 2 0 000 4h2"/><path d="M18 9h2a2 2 0 010 4h-2"/><path d="M6 3h12v10a6 6 0 01-12 0V3z"/><path d="M10 21h4"/><path d="M9 21v-2"/><path d="M15 21v-2"/></svg>,
    target: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
    discord: <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028 14.09 14.09 0 001.226-1.994.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/></svg>,
    zap: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    eye: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
    scale: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><line x1="12" y1="3" x2="12" y2="21"/><path d="M3 9l9-7 9 7"/><path d="M3 9h4l2 6H3"/><path d="M21 9h-4l-2 6h6"/></svg>,
    star: <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
    code: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
    clock: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    megaphone: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>,
    search: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  };
  return icons[name] || null;
};

function Spinner() {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {[0,1,2].map(i => (
        <div key={i} style={{ width:6,height:6,borderRadius:"50%",background:BRAND.orange,
          animation:`pulse 1.2s ease-in-out ${i*0.2}s infinite` }} />
      ))}
    </div>
  );
}

function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(()=>setCopied(false),2000); }} style={{
      display:"flex",alignItems:"center",gap:6,padding:"6px 12px",
      background: copied ? BRAND.green+"22" : BRAND.navyLight,
      border:`1px solid ${copied ? BRAND.green : BRAND.navyLight}`,
      borderRadius:8,cursor:"pointer",color: copied ? BRAND.green : BRAND.gray,
      fontSize:12,fontFamily:"inherit",transition:"all 0.2s",
    }}>
      <Icon name={copied?"check":"copy"} size={13} color={copied?BRAND.green:BRAND.gray}/>
      {copied?"Copied!":label}
    </button>
  );
}

function MarkdownText({ text, style = {} }) {
  return (
    <div style={{ fontSize:14, lineHeight:1.8, color:BRAND.grayLight, whiteSpace:"pre-wrap", fontFamily:"inherit", ...style }}>
      {text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
        part.startsWith("**") && part.endsWith("**")
          ? <strong key={i} style={{ color:BRAND.white, fontWeight:700 }}>{part.slice(2,-2)}</strong>
          : part
      )}
    </div>
  );
}

function Card({ children, style = {}, onClick }) {
  return (
    <div onClick={onClick} style={{
      background:BRAND.navyMid, borderRadius:14, padding:20,
      border:`1px solid ${BRAND.navyLight}`, ...style,
      cursor: onClick ? "pointer" : "default",
      transition: onClick ? "border-color 0.2s" : undefined,
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ text }) {
  return <div style={{ fontSize:12,fontWeight:700,color:BRAND.orange,letterSpacing:1.2,
    textTransform:"uppercase",marginBottom:12 }}>{text}</div>;
}

function ActionBtn({ onClick, disabled, loading, children, style={} }) {
  return (
    <button onClick={onClick} disabled={disabled||loading} style={{
      display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"11px 20px",
      background: (disabled||loading) ? BRAND.navyLight : `linear-gradient(135deg,${BRAND.orange},${BRAND.orangeLight})`,
      border:"none",borderRadius:10,color:BRAND.white,fontSize:13,fontWeight:700,
      cursor:(disabled||loading)?"not-allowed":"pointer",fontFamily:"inherit",transition:"all 0.2s",...style,
    }}>
      {loading ? <><Spinner/>Loading...</> : children}
    </button>
  );
}

// ── TABS ──
const TABS = [
  { id:"generate",  label:"Content Generator",    icon:"bolt"     },
  { id:"chat",      label:"Strategy Chat",         icon:"chat"     },
  { id:"calendar",  label:"Weekly Plan",           icon:"calendar" },
  { id:"hooks",     label:"Hook Library",          icon:"fire"     },
  { id:"season",    label:"Season Calendar",       icon:"star"     },
  { id:"discord",   label:"Discord Writer",        icon:"discord"  },
  { id:"abtest",    label:"A/B Tester",            icon:"scale"    },
  { id:"intel",     label:"Competitor Intel",      icon:"eye"      },
  { id:"perf",      label:"Performance Tracker",   icon:"target"   },
  { id:"automation",label:"Automation Export",     icon:"code"     },
];

// ── MARKETING AGENT (embedded in DashboardLayout) ──
export default function ValorMarketingAgent() {
  const [activeTab, setActiveTab] = useState("generate");

  return (
    <div className="dash-page" style={{ fontFamily:"'DM Sans','Segoe UI',sans-serif", color:BRAND.white }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Oswald:wght@600;700&display=swap');
        @keyframes pulse{0%,80%,100%{transform:scale(0.6);opacity:0.4}40%{transform:scale(1);opacity:1}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes glow{0%,100%{box-shadow:0 0 20px ${BRAND.orange}44}50%{box-shadow:0 0 40px ${BRAND.orange}88}}
        @keyframes slideIn{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}
        .hoverable:hover{filter:brightness(1.08);transform:translateY(-1px)}
        .mktg-tab:hover{background:${BRAND.navyMid}!important;color:${BRAND.white}!important}
        textarea:focus,select:focus,input:focus{outline:none;border-color:${BRAND.orange}!important;box-shadow:0 0 0 2px ${BRAND.orange}33}
        .score-bar{transition:width 0.8s cubic-bezier(.4,0,.2,1)}
        .mktg-tabs-bar{display:flex;gap:6px;padding:12px 0 16px;overflow-x:auto;flex-wrap:wrap}
        .mktg-tabs-bar::-webkit-scrollbar{height:0}
      `}</style>

      {/* PAGE HEADER */}
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4 }}>
        <div>
          <h1 style={{ fontSize:22,fontWeight:700,fontFamily:"Oswald,sans-serif",letterSpacing:1,margin:0 }}>
            Marketing Agent
          </h1>
          <p style={{ fontSize:12,color:BRAND.gray,margin:"4px 0 0" }}>AI-powered content strategy & creation</p>
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
          <div style={{ width:7,height:7,borderRadius:"50%",background:BRAND.green,boxShadow:`0 0 8px ${BRAND.green}` }}/>
          <span style={{ fontSize:11,color:BRAND.gray }}>AI Active</span>
        </div>
      </div>

      {/* HORIZONTAL TAB BAR */}
      <div className="mktg-tabs-bar">
        {TABS.map(tab => (
          <button key={tab.id} className="mktg-tab" onClick={() => setActiveTab(tab.id)} style={{
            display:"flex",alignItems:"center",gap:7,padding:"8px 14px",
            background: activeTab===tab.id ? BRAND.navy : "transparent",
            border: activeTab===tab.id ? `1px solid ${BRAND.navyLight}` : "1px solid transparent",
            borderBottom: activeTab===tab.id ? `2px solid ${BRAND.orange}` : "2px solid transparent",
            borderRadius:8,color: activeTab===tab.id ? BRAND.white : BRAND.gray,
            cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"inherit",
            whiteSpace:"nowrap",transition:"all 0.15s",flexShrink:0,
          }}>
            <Icon name={tab.icon} size={13} color={activeTab===tab.id ? BRAND.orange : BRAND.gray}/>
            {tab.label}
          </button>
        ))}
      </div>

      {/* MAIN CONTENT */}
      <div style={{ animation:"fadeIn 0.3s ease", maxWidth:1200 }}>
        {activeTab==="generate"   && <ContentGenerator/>}
        {activeTab==="chat"       && <StrategyChat/>}
        {activeTab==="calendar"   && <WeeklyCalendar/>}
        {activeTab==="hooks"      && <HookLibrary/>}
        {activeTab==="season"     && <SeasonCalendar/>}
        {activeTab==="discord"    && <DiscordWriter/>}
        {activeTab==="abtest"     && <ABTester/>}
        {activeTab==="intel"      && <CompetitorIntel/>}
        {activeTab==="perf"       && <PerformanceTracker/>}
        {activeTab==="automation" && <AutomationExport/>}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// TAB 1 — CONTENT GENERATOR
// ════════════════════════════════════════════
function ContentGenerator() {
  const [platform, setPlatform] = useState("TikTok");
  const [contentType, setContentType] = useState("Arb Reveal");
  const [sport, setSport] = useState("NFL");
  const [tone, setTone] = useState("Hype & Urgent");
  const [extra, setExtra] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => setContentType(CONTENT_TYPES[platform][0]), [platform]);

  const generate = async () => {
    setLoading(true); setOutput("");
    const prompt = `Generate ready-to-post ${platform} content for Valor Odds.
Content Type: ${contentType} | Sport: ${sport} | Tone: ${tone}
Extra context: ${extra||"None"}

Provide:
1. **Hook / Opening** (first 2-3 seconds)
2. **Main Body** (full post/script/caption)
3. **CTA** (call to action)
4. **Hashtags** (if applicable)
5. **Pro Tips** (1-2 performance tips)`;
    try {
      const result = await callClaude([{role:"user",content:prompt}], setOutput);
      setHistory(h => [{platform,contentType,sport,output:result,ts:new Date()},...h.slice(0,4)]);
    } catch { setOutput("Error. Please try again."); }
    setLoading(false);
  };

  const selStyle = { width:"100%",padding:"9px 12px",background:BRAND.navy,
    border:`1px solid ${BRAND.navyLight}`,borderRadius:8,color:BRAND.white,
    fontSize:13,fontFamily:"inherit",cursor:"pointer",transition:"border-color 0.2s" };

  return (
    <div style={{ display:"grid",gridTemplateColumns:"300px 1fr",gap:20 }}>
      <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
        <Card>
          <SectionLabel text="Configure Content"/>
          {[
            {label:"Platform",    val:platform,    set:setPlatform,    opts:PLATFORMS},
            {label:"Content Type",val:contentType, set:setContentType, opts:CONTENT_TYPES[platform]},
            {label:"Sport Focus", val:sport,       set:setSport,       opts:SPORTS_CONTEXT},
            {label:"Tone",        val:tone,        set:setTone,        opts:TONES},
          ].map(({label,val,set,opts}) => (
            <div key={label} style={{ marginBottom:12 }}>
              <label style={{ fontSize:11,color:BRAND.gray,fontWeight:700,display:"block",marginBottom:5,letterSpacing:0.6 }}>{label.toUpperCase()}</label>
              <select value={val} onChange={e=>set(e.target.value)} style={selStyle}>
                {opts.map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
          <label style={{ fontSize:11,color:BRAND.gray,fontWeight:700,display:"block",marginBottom:5,letterSpacing:0.6 }}>EXTRA CONTEXT</label>
          <textarea value={extra} onChange={e=>setExtra(e.target.value)}
            placeholder="e.g. 'Mahomes injury just dropped' or 'promoting free trial weekend'"
            rows={3} style={{ ...selStyle,resize:"none",marginBottom:14 }}/>
          <ActionBtn onClick={generate} loading={loading} style={{ width:"100%" }}>
            <Icon name="bolt" size={15} color={BRAND.white}/> Generate
          </ActionBtn>
        </Card>
        {history.length>0 && (
          <Card>
            <SectionLabel text="Recent"/>
            {history.map((h,i)=>(
              <button key={i} onClick={()=>setOutput(h.output)} style={{
                width:"100%",textAlign:"left",padding:"8px 10px",background:i===0?BRAND.navy:"transparent",
                border:"none",borderRadius:8,cursor:"pointer",marginBottom:4 }}>
                <div style={{ fontSize:12,fontWeight:600,color:BRAND.orange }}>{h.platform} · {h.contentType}</div>
                <div style={{ fontSize:11,color:BRAND.gray }}>{h.sport} · {h.ts.toLocaleTimeString()}</div>
              </button>
            ))}
          </Card>
        )}
      </div>
      <Card style={{ minHeight:500,position:"relative" }}>
        {!output && !loading && (
          <div style={{ position:"absolute",inset:0,display:"flex",flexDirection:"column",
            alignItems:"center",justifyContent:"center",gap:12 }}>
            <div style={{ width:52,height:52,borderRadius:12,background:`${BRAND.orange}22`,
              display:"flex",alignItems:"center",justifyContent:"center" }}>
              <Icon name="sparkles" size={26} color={BRAND.orange}/>
            </div>
            <div style={{ color:BRAND.gray,fontSize:14,textAlign:"center" }}>Configure settings<br/>and hit Generate</div>
          </div>
        )}
        {(output||loading) && (
          <div style={{ animation:"fadeIn 0.3s ease" }}>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18 }}>
              <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                <span style={{ padding:"3px 10px",borderRadius:6,background:`${BRAND.orange}22`,
                  color:BRAND.orange,fontSize:12,fontWeight:700 }}>{platform}</span>
                <span style={{ fontSize:12,color:BRAND.gray }}>{contentType} · {sport}</span>
              </div>
              {output && <CopyButton text={output}/>}
            </div>
            {loading && !output && <div style={{ display:"flex",gap:10,color:BRAND.gray }}><Spinner/> Writing...</div>}
            <MarkdownText text={output}/>
            {loading && <span style={{ display:"inline-block",width:2,height:16,background:BRAND.orange,
              marginLeft:2,animation:"pulse 1s infinite" }}/>}
          </div>
        )}
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════
// TAB 2 — STRATEGY CHAT
// ════════════════════════════════════════════
function StrategyChat() {
  const [messages, setMessages] = useState([{role:"assistant",content:"Hey! I'm your Valor Odds Marketing Agent. Ask me anything — what to post, how to grow a platform, Discord strategy, how to pitch VIP upgrades, or anything else. What do you need?"}]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  useEffect(()=>bottomRef.current?.scrollIntoView({behavior:"smooth"}),[messages,loading]);

  const send = async () => {
    if (!input.trim()||loading) return;
    const userMsg = {role:"user",content:input};
    const newMessages = [...messages,userMsg];
    setMessages(newMessages); setInput(""); setLoading(true);
    setMessages(m=>[...m,{role:"assistant",content:""}]);
    try {
      await callClaude(newMessages.map(m=>({role:m.role,content:m.content})), text=>{
        setMessages(m=>{const u=[...m];u[u.length-1]={role:"assistant",content:text};return u;});
      });
    } catch {
      setMessages(m=>{const u=[...m];u[u.length-1]={role:"assistant",content:"Connection error."};return u;});
    }
    setLoading(false);
  };

  const QUICK = ["What should I post this Sunday for NFL?","Write me a Discord invite tweet","How do I grow Reddit organically?","Give me a TikTok hook for arbitrage","How should I pitch the VIP upgrade?","What to post for NBA opening night?"];

  return (
    <div style={{ display:"grid",gridTemplateColumns:"1fr 200px",gap:20,height:"calc(100vh - 160px)",minHeight:500 }}>
      <Card style={{ display:"flex",flexDirection:"column",overflow:"hidden",padding:0 }}>
        <div style={{ flex:1,overflowY:"auto",padding:20,display:"flex",flexDirection:"column",gap:14 }}>
          {messages.map((msg,i)=>(
            <div key={i} style={{ display:"flex",gap:10,justifyContent:msg.role==="user"?"flex-end":"flex-start",animation:"fadeIn 0.3s ease" }}>
              {msg.role==="assistant" && (
                <div style={{ width:30,height:30,borderRadius:8,flexShrink:0,marginTop:2,
                  background:`linear-gradient(135deg,${BRAND.orange},${BRAND.orangeLight})`,
                  display:"flex",alignItems:"center",justifyContent:"center" }}>
                  <Icon name="bolt" size={15} color={BRAND.white}/>
                </div>
              )}
              <div style={{ maxWidth:"78%",padding:"11px 15px",borderRadius:12,
                background:msg.role==="user"?`linear-gradient(135deg,${BRAND.orange},${BRAND.orangeLight})`:BRAND.navy,
                color:BRAND.white,fontSize:14,lineHeight:1.7,
                borderTopLeftRadius:msg.role==="assistant"?4:12,
                borderTopRightRadius:msg.role==="user"?4:12 }}>
                {msg.content.split(/(\*\*[^*]+\*\*)/).map((p,j)=>
                  p.startsWith("**")&&p.endsWith("**")
                    ?<strong key={j} style={{color:msg.role==="user"?BRAND.white:BRAND.orangeLight}}>{p.slice(2,-2)}</strong>
                    :<span key={j} style={{whiteSpace:"pre-wrap"}}>{p}</span>
                )}
                {loading&&i===messages.length-1&&msg.content===""&&<Spinner/>}
              </div>
            </div>
          ))}
          <div ref={bottomRef}/>
        </div>
        <div style={{ borderTop:`1px solid ${BRAND.navyLight}`,padding:14,display:"flex",gap:10,alignItems:"flex-end" }}>
          <textarea value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
            placeholder="Ask anything about your marketing strategy..." rows={2}
            style={{ flex:1,padding:"9px 13px",background:BRAND.navy,border:`1px solid ${BRAND.navyLight}`,
              borderRadius:10,color:BRAND.white,fontSize:13,fontFamily:"inherit",resize:"none",transition:"border-color 0.2s,box-shadow 0.2s" }}/>
          <button onClick={send} disabled={loading||!input.trim()} style={{
            width:42,height:42,borderRadius:10,flexShrink:0,border:"none",
            background:loading||!input.trim()?BRAND.navyLight:`linear-gradient(135deg,${BRAND.orange},${BRAND.orangeLight})`,
            cursor:loading||!input.trim()?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>
            <Icon name="send" size={17} color={BRAND.white}/>
          </button>
        </div>
      </Card>
      <Card style={{ height:"fit-content" }}>
        <SectionLabel text="Quick Prompts"/>
        {QUICK.map((q,i)=>(
          <button key={i} onClick={()=>setInput(q)} style={{
            width:"100%",textAlign:"left",padding:"8px 10px",background:BRAND.navy,
            border:`1px solid ${BRAND.navyLight}`,borderRadius:8,color:BRAND.grayLight,
            fontSize:11,cursor:"pointer",marginBottom:7,fontFamily:"inherit",lineHeight:1.4,transition:"all 0.15s" }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=BRAND.orange;e.currentTarget.style.color=BRAND.white;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=BRAND.navyLight;e.currentTarget.style.color=BRAND.grayLight;}}>
            {q}
          </button>
        ))}
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════
// TAB 3 — WEEKLY CALENDAR
// ════════════════════════════════════════════
function WeeklyCalendar() {
  const [week, setWeek] = useState("");
  const [loading, setLoading] = useState(false);
  const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const PC = {TikTok:"#FF0050",Instagram:"#E1306C","X / Twitter":"#1DA1F2",Reddit:"#FF4500",YouTube:"#FF0000",Discord:"#5865F2"};

  const generate = async () => {
    setLoading(true); setWeek("");
    const prompt = `Generate a detailed 7-day Valor Odds content calendar. For each day (Monday-Sunday):
- **TikTok**: specific video concept and hook
- **Instagram**: post type and caption idea
- **X / Twitter**: tweet or thread idea
- **Discord**: what to post/announce

Format exactly:
**MONDAY**
TikTok: [idea]
Instagram: [idea]
X / Twitter: [idea]
Discord: [idea]

Reference real weekly rhythms (Thursday NFL injuries, Sunday games, Monday recaps). Make every idea specific and actionable.`;
    try { await callClaude([{role:"user",content:prompt}], setWeek); }
    catch { setWeek("Error generating. Please try again."); }
    setLoading(false);
  };

  const parsed = {};
  if (week) {
    const blocks = week.split(/\*\*([A-Z]+)\*\*/g).filter(Boolean);
    for (let i=0;i<blocks.length-1;i+=2) {
      const day = blocks[i].trim();
      if (DAYS.map(d=>d.toUpperCase()).includes(day)) {
        const lines = {};
        for (const m of blocks[i+1].matchAll(/^(TikTok|Instagram|X \/ Twitter|Discord|Reddit|YouTube):\s*(.+)$/gm))
          lines[m[1]] = m[2];
        parsed[day] = lines;
      }
    }
  }

  return (
    <div>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20 }}>
        <div>
          <div style={{ fontSize:18,fontWeight:700 }}>Weekly Content Calendar</div>
          <div style={{ fontSize:13,color:BRAND.gray,marginTop:2 }}>AI-generated 7-day posting plan</div>
        </div>
        <ActionBtn onClick={generate} loading={loading}>
          <Icon name="refresh" size={14} color={BRAND.white}/> Generate This Week
        </ActionBtn>
      </div>
      {!week && !loading && (
        <Card style={{ textAlign:"center",padding:"60px 20px" }}>
          <Icon name="calendar" size={36} color={BRAND.navyLight}/>
          <div style={{ color:BRAND.gray,marginTop:12,fontSize:14 }}>Click "Generate This Week" to build your full 7-day plan</div>
        </Card>
      )}
      {loading && !week && <Card style={{ textAlign:"center",padding:"60px 20px" }}><Spinner/><div style={{ color:BRAND.gray,marginTop:12 }}>Building your plan...</div></Card>}
      {week && (
        <div style={{ display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:10,animation:"fadeIn 0.4s ease" }}>
          {DAYS.map(day=>{
            const data = parsed[day.toUpperCase()]||{};
            return (
              <div key={day} style={{ background:BRAND.navyMid,borderRadius:12,overflow:"hidden",border:`1px solid ${BRAND.navyLight}` }}>
                <div style={{ padding:"8px 12px",background:BRAND.navyLight,borderBottom:`2px solid ${BRAND.orange}` }}>
                  <div style={{ fontSize:11,fontWeight:700,fontFamily:"Oswald,sans-serif",letterSpacing:1 }}>{day.toUpperCase()}</div>
                </div>
                <div style={{ padding:8,display:"flex",flexDirection:"column",gap:7 }}>
                  {Object.entries(data).map(([plat,text])=>(
                    <div key={plat} style={{ padding:"7px 9px",borderRadius:7,background:BRAND.navy,borderLeft:`3px solid ${PC[plat]||BRAND.orange}` }}>
                      <div style={{ fontSize:9,fontWeight:700,color:PC[plat]||BRAND.orange,marginBottom:2,letterSpacing:0.5 }}>{plat.toUpperCase()}</div>
                      <div style={{ fontSize:10,color:BRAND.grayLight,lineHeight:1.5 }}>{text}</div>
                    </div>
                  ))}
                  {Object.keys(data).length===0&&<div style={{ fontSize:10,color:BRAND.gray,textAlign:"center",padding:4 }}>—</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════
// TAB 4 — HOOK LIBRARY
// ════════════════════════════════════════════
function HookLibrary() {
  const [selected, setSelected] = useState(null);
  const [remixInput, setRemixInput] = useState("");
  const [remixed, setRemixed] = useState("");
  const [loading, setLoading] = useState(false);
  const HOOKS = {
    "Scroll-Stoppers": [
      {text:"You lost again. We didn't.",tag:"Emotional"},
      {text:"While you were guessing, our members were cashing.",tag:"Social Proof"},
      {text:"Sportsbooks are a business. We found the loophole.",tag:"Intrigue"},
      {text:"This isn't gambling. This is math.",tag:"Authority"},
      {text:"Every alert. Every injury. Every edge. One Discord.",tag:"Value Stack"},
      {text:"The line closes in 4 minutes. Our members already know.",tag:"Urgency"},
    ],
    "Platform Hooks": [
      {text:"Sportsbooks hate this — here's how we made $X risk-free this weekend",tag:"TikTok"},
      {text:"The play that hit +340 last night. Our members had it at 6pm.",tag:"Instagram"},
      {text:"I tracked every Valor alert for 30 days. Here's what happened.",tag:"Reddit"},
      {text:"Real-time odds drop on [Team]. Line just moved. Arb window: 4.1%.",tag:"X / Twitter"},
      {text:"How Arbitrage Betting Actually Works (And Why Sportsbooks Can't Stop It)",tag:"YouTube"},
      {text:"Free access this weekend. See why 1,000+ bettors joined Valor Odds.",tag:"Discord"},
    ],
    "Taglines": [
      {text:"Tired of Losing? Turn the Odds in Your Favor.",tag:"Primary"},
      {text:"The Smart Money Knows. Now You Do Too.",tag:"Authority"},
      {text:"Stop Guessing. Start Winning.",tag:"Clean"},
      {text:"The Edge Closes Fast. Get In Before the Line Moves.",tag:"Urgency"},
      {text:"Bet Smarter. Win Consistently.",tag:"Positioning"},
      {text:"Your Analytics Team. Your Scout. Your Edge.",tag:"Value Prop"},
    ],
    "Objection Busters": [
      {text:"Arbitrage betting is NOT illegal. Here's what the sportsbooks don't want you to know.",tag:"Myth Bust"},
      {text:"You don't need to pick winners. You need to pick sportsbooks.",tag:"Reframe"},
      {text:"One arb alert pays for your Valor VIP subscription 3x over.",tag:"ROI"},
      {text:"This isn't a pick service. This is a data intelligence platform.",tag:"Positioning"},
    ],
  };
  const TC = {Emotional:"#E84040",Social:"#2ECC71",Intrigue:"#9B59B6",Authority:"#3498DB",
    "Value Stack":"#E8820C","Value Prop":"#E8820C",Urgency:"#E74C3C",TikTok:"#FF0050",
    Instagram:"#E1306C",Reddit:"#FF4500","X / Twitter":"#1DA1F2",YouTube:"#FF0000",
    Discord:"#5865F2",Primary:"#E8820C",Clean:"#2ECC71",Positioning:"#3498DB",
    "Myth Bust":"#E84040",Reframe:"#9B59B6",ROI:"#2ECC71","Social Proof":"#2ECC71"};
  const remix = async () => {
    setLoading(true); setRemixed("");
    const prompt = `Take this Valor Odds hook and create 3 distinct variations with different angles/platforms.
Original: "${selected}"
Direction: ${remixInput||"Create strong punchy variations"}
Return exactly 3 numbered variations, labeled with best platform/angle.`;
    try { await callClaude([{role:"user",content:prompt}], setRemixed); }
    catch { setRemixed("Error generating variations."); }
    setLoading(false);
  };

  return (
    <div style={{ display:"grid",gridTemplateColumns:"1fr 360px",gap:20 }}>
      <div>
        {Object.entries(HOOKS).map(([cat,hooks])=>(
          <div key={cat} style={{ marginBottom:22 }}>
            <SectionLabel text={cat}/>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
              {hooks.map((h,i)=>(
                <div key={i} onClick={()=>{setSelected(h.text);setRemixed("");setRemixInput("");}}
                  style={{ padding:"13px 15px",borderRadius:10,cursor:"pointer",transition:"all 0.2s",
                    background:selected===h.text?`${BRAND.orange}18`:BRAND.navyMid,
                    border:`1px solid ${selected===h.text?BRAND.orange:BRAND.navyLight}` }}>
                  <div style={{ display:"inline-block",padding:"2px 8px",borderRadius:4,marginBottom:7,fontSize:10,fontWeight:700,letterSpacing:0.5,
                    background:`${TC[h.tag]||BRAND.orange}22`,color:TC[h.tag]||BRAND.orange }}>{h.tag}</div>
                  <div style={{ fontSize:12,lineHeight:1.6,color:BRAND.grayLight,fontStyle:"italic" }}>"{h.text}"</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Card style={{ height:"fit-content",position:"sticky",top:20 }}>
        <SectionLabel text="AI Remix Studio"/>
        {!selected
          ? <div style={{ color:BRAND.gray,fontSize:13,textAlign:"center",padding:"30px 0" }}>Click any hook to select it</div>
          : <>
            <div style={{ padding:"11px 13px",borderRadius:10,marginBottom:14,background:BRAND.navy,
              border:`1px solid ${BRAND.orange}44`,fontSize:13,color:BRAND.white,lineHeight:1.6,fontStyle:"italic" }}>
              "{selected}"
            </div>
            <label style={{ fontSize:11,color:BRAND.gray,fontWeight:700,display:"block",marginBottom:5,letterSpacing:0.6 }}>REMIX DIRECTION</label>
            <textarea value={remixInput} onChange={e=>setRemixInput(e.target.value)}
              placeholder="e.g. 'NBA season opener' or 'more aggressive tone'"
              rows={2} style={{ width:"100%",padding:"9px 12px",marginBottom:12,background:BRAND.navy,
                border:`1px solid ${BRAND.navyLight}`,borderRadius:8,color:BRAND.white,
                fontSize:13,fontFamily:"inherit",resize:"none" }}/>
            <div style={{ display:"flex",gap:8,marginBottom:14 }}>
              <ActionBtn onClick={remix} loading={loading} style={{ flex:1,padding:"9px" }}>
                <Icon name="sparkles" size={13} color={BRAND.white}/> Remix
              </ActionBtn>
              <CopyButton text={selected}/>
            </div>
            {remixed && (
              <div style={{ padding:13,borderRadius:10,background:BRAND.navy,border:`1px solid ${BRAND.navyLight}`,animation:"fadeIn 0.3s ease" }}>
                <SectionLabel text="Variations"/>
                <MarkdownText text={remixed} style={{ fontSize:12 }}/>
                <div style={{ marginTop:10 }}><CopyButton text={remixed}/></div>
              </div>
            )}
          </>
        }
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════
// TAB 5 — SEASON CALENDAR & TRIGGER EVENTS
// ════════════════════════════════════════════
function SeasonCalendar() {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [contentPlan, setContentPlan] = useState("");
  const [loading, setLoading] = useState(false);

  const EVENTS = [
    { sport:"NFL", color:"#1a73e8", events:[
      {name:"NFL Draft",         date:"Apr 24–26",  type:"hype",    lead:"3 weeks"},
      {name:"Training Camp Opens",date:"Jul 22",    type:"prep",    lead:"1 week"},
      {name:"Preseason Week 1",  date:"Aug 7",      type:"content", lead:"3 days"},
      {name:"Regular Season Kick-Off",date:"Sep 4", type:"major",   lead:"2 weeks"},
      {name:"Week 1 Sunday",     date:"Sep 7",      type:"major",   lead:"4 days"},
      {name:"Trade Deadline",    date:"Nov 4",      type:"alert",   lead:"1 week"},
      {name:"Thanksgiving Games",date:"Nov 27",     type:"major",   lead:"1 week"},
      {name:"Wild Card Weekend", date:"Jan 10–11",  type:"major",   lead:"1 week"},
      {name:"Super Bowl LX",     date:"Feb 8",      type:"major",   lead:"2 weeks"},
    ]},
    { sport:"MLB", color:"#e83a1a", events:[
      {name:"Spring Training",   date:"Feb 17",     type:"hype",    lead:"1 week"},
      {name:"Opening Day",       date:"Mar 27",     type:"major",   lead:"2 weeks"},
      {name:"MLB All-Star Game", date:"Jul 15",     type:"content", lead:"1 week"},
      {name:"Trade Deadline",    date:"Jul 31",     type:"alert",   lead:"3 days"},
      {name:"Wild Card Series",  date:"Sep 30",     type:"major",   lead:"1 week"},
      {name:"World Series",      date:"Oct 25",     type:"major",   lead:"2 weeks"},
    ]},
    { sport:"NBA", color:"#e85a1a", events:[
      {name:"Free Agency Opens", date:"Jun 30",     type:"alert",   lead:"3 days"},
      {name:"NBA Draft",         date:"Jun 25",     type:"hype",    lead:"1 week"},
      {name:"Training Camp",     date:"Sep 30",     type:"prep",    lead:"3 days"},
      {name:"Opening Night",     date:"Oct 21",     type:"major",   lead:"1 week"},
      {name:"Trade Deadline",    date:"Feb 6",      type:"alert",   lead:"1 week"},
      {name:"NBA All-Star",      date:"Feb 15",     type:"content", lead:"1 week"},
      {name:"NBA Playoffs",      date:"Apr 18",     type:"major",   lead:"2 weeks"},
      {name:"NBA Finals",        date:"Jun 4",      type:"major",   lead:"2 weeks"},
    ]},
    { sport:"NHL", color:"#1a8ce8", events:[
      {name:"Training Camp",     date:"Sep 18",     type:"prep",    lead:"3 days"},
      {name:"Opening Night",     date:"Oct 7",      type:"major",   lead:"1 week"},
      {name:"NHL All-Star",      date:"Feb 1",      type:"content", lead:"3 days"},
      {name:"Trade Deadline",    date:"Mar 7",      type:"alert",   lead:"1 week"},
      {name:"Stanley Cup Playoffs",date:"Apr 19",   type:"major",   lead:"2 weeks"},
      {name:"Stanley Cup Final", date:"Jun 2",      type:"major",   lead:"2 weeks"},
    ]},
  ];

  const TYPE_STYLES = {
    major:   { label:"MAJOR EVENT",   bg:"#E8820C22", color:BRAND.orange  },
    hype:    { label:"HYPE WINDOW",   bg:"#2ECC7122", color:BRAND.green   },
    alert:   { label:"ALERT TRIGGER", bg:"#E8404022", color:BRAND.red     },
    content: { label:"CONTENT SPIKE", bg:"#9B59B622", color:BRAND.purple  },
    prep:    { label:"PREP CONTENT",  bg:"#1DA1F222", color:"#1DA1F2"     },
  };

  const generatePlan = async (event, sport) => {
    setLoading(true); setContentPlan("");
    const prompt = `Create a Valor Odds content drop plan for: "${event.name}" (${sport}, ${event.date})

Start content ${event.lead} before the event.

Provide:
**Pre-Event Content (${event.lead} out)**
- TikTok: [specific hook/concept]
- Instagram: [specific post idea]
- X / Twitter: [tweet/thread]
- Discord: [announcement]

**Day-Of Content**
- TikTok: [real-time content idea]
- Instagram: [story/reel idea]
- X / Twitter: [live commentary angle]
- Discord: [alert or announcement]

**Post-Event Content**
- TikTok: [recap angle]
- Instagram: [results content]

**Arbitrage/Odds Angle**
How Valor Odds members can leverage this event for arb opportunities.

**Discord CTA**
Specific invite copy tied to this event.

Be specific and ready to execute. Reference the actual sport and event.`;
    try { await callClaude([{role:"user",content:prompt}], setContentPlan, 1400); }
    catch { setContentPlan("Error generating plan."); }
    setLoading(false);
  };

  return (
    <div style={{ display:"grid",gridTemplateColumns:"1fr 420px",gap:20 }}>
      <div>
        <div style={{ fontSize:18,fontWeight:700,marginBottom:4 }}>Season Calendar & Trigger Events</div>
        <div style={{ fontSize:13,color:BRAND.gray,marginBottom:20 }}>Click any event to generate a full content drop plan</div>
        {EVENTS.map(({sport,color,events})=>(
          <div key={sport} style={{ marginBottom:24 }}>
            <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:12 }}>
              <div style={{ width:3,height:20,background:color,borderRadius:2 }}/>
              <div style={{ fontSize:14,fontWeight:700,color:BRAND.white }}>{sport}</div>
            </div>
            <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
              {events.map((ev,i)=>{
                const ts = TYPE_STYLES[ev.type];
                const isSelected = selectedEvent?.name===ev.name;
                return (
                  <div key={i} onClick={()=>{setSelectedEvent({...ev,sport});generatePlan(ev,sport);}}
                    style={{ display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderRadius:10,
                      cursor:"pointer",transition:"all 0.2s",
                      background:isSelected?`${BRAND.orange}18`:BRAND.navyMid,
                      border:`1px solid ${isSelected?BRAND.orange:BRAND.navyLight}` }}>
                    <div style={{ width:3,height:32,background:color,borderRadius:2,flexShrink:0 }}/>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13,fontWeight:600,color:BRAND.white }}>{ev.name}</div>
                      <div style={{ fontSize:11,color:BRAND.gray,marginTop:2 }}>{ev.date} · Start content {ev.lead} out</div>
                    </div>
                    <div style={{ padding:"3px 8px",borderRadius:5,background:ts.bg,color:ts.color,fontSize:10,fontWeight:700,letterSpacing:0.5,flexShrink:0 }}>
                      {ts.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <Card style={{ position:"sticky",top:20,height:"fit-content",maxHeight:"calc(100vh - 120px)",overflowY:"auto" }}>
        {!selectedEvent && !loading
          ? <div style={{ textAlign:"center",padding:"40px 0" }}>
              <Icon name="calendar" size={32} color={BRAND.navyLight}/>
              <div style={{ color:BRAND.gray,marginTop:12,fontSize:13 }}>Select an event to generate<br/>a full content drop plan</div>
            </div>
          : <>
            {selectedEvent && (
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:16,fontWeight:700,color:BRAND.white }}>{selectedEvent.name}</div>
                <div style={{ fontSize:12,color:BRAND.gray,marginTop:2 }}>{selectedEvent.sport} · {selectedEvent.date}</div>
              </div>
            )}
            {loading && !contentPlan && <div style={{ display:"flex",gap:10,color:BRAND.gray,alignItems:"center" }}><Spinner/> Building content plan...</div>}
            {contentPlan && (
              <div style={{ animation:"fadeIn 0.3s ease" }}>
                <div style={{ display:"flex",justifyContent:"flex-end",marginBottom:12 }}>
                  <CopyButton text={contentPlan}/>
                </div>
                <MarkdownText text={contentPlan} style={{ fontSize:13 }}/>
              </div>
            )}
          </>
        }
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════
// TAB 6 — DISCORD WRITER
// ════════════════════════════════════════════
function DiscordWriter() {
  const [type, setType] = useState("Welcome Message");
  const [tier, setTier] = useState("All Members");
  const [context, setContext] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);

  const TYPES = ["Welcome Message","VIP Upgrade Pitch","Member Win Feature","Free Trial Announcement",
    "Season Opener Alert","Arb Alert Spotlight","Weekly Briefing","Referral Program Launch",
    "MEE6 Tier Description","Server Rules","Channel Descriptions","Mobile App Teaser"];
  const TIERS = ["All Members","Free Members Only","Supporter Tier","VIP Tier","Potential Upgraders"];

  const generate = async () => {
    setLoading(true); setOutput("");
    const prompt = `Write a Valor Odds Discord message/announcement.

Type: ${type}
Target Audience: ${tier}
Context: ${context||"None provided"}

Requirements:
- Use proper Discord markdown (** for bold, __ for underline, > for quotes, \`\`\` for code blocks)
- Use Discord-appropriate emojis sparingly but effectively
- Include role mentions where appropriate (e.g. @Supporter, @VIP)
- Match the Valor Odds brand voice: confident, data-driven, edgy
- For upgrade pitches: create genuine FOMO, include a clear CTA
- For welcome messages: be warm but exciting, set expectations
- For announcements: be clear and action-oriented

Format with clear sections. Make it ready to paste directly into Discord.`;
    try { await callClaude([{role:"user",content:prompt}], setOutput); }
    catch { setOutput("Error generating. Please try again."); }
    setLoading(false);
  };

  const selStyle = { width:"100%",padding:"9px 12px",background:BRAND.navy,
    border:`1px solid ${BRAND.navyLight}`,borderRadius:8,color:BRAND.white,
    fontSize:13,fontFamily:"inherit",cursor:"pointer" };

  return (
    <div style={{ display:"grid",gridTemplateColumns:"280px 1fr",gap:20 }}>
      <div>
        <Card>
          <SectionLabel text="Discord Post Builder"/>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11,color:BRAND.gray,fontWeight:700,display:"block",marginBottom:5,letterSpacing:0.6 }}>MESSAGE TYPE</label>
            <select value={type} onChange={e=>setType(e.target.value)} style={selStyle}>
              {TYPES.map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11,color:BRAND.gray,fontWeight:700,display:"block",marginBottom:5,letterSpacing:0.6 }}>TARGET AUDIENCE</label>
            <select value={tier} onChange={e=>setTier(e.target.value)} style={selStyle}>
              {TIERS.map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <label style={{ fontSize:11,color:BRAND.gray,fontWeight:700,display:"block",marginBottom:5,letterSpacing:0.6 }}>CONTEXT / DETAILS</label>
          <textarea value={context} onChange={e=>setContext(e.target.value)}
            placeholder="e.g. 'Member @Jake_wins just hit a +$340 arb play on Packers vs Bears' or 'promoting our new VIP tier launch'"
            rows={4} style={{ ...selStyle,resize:"none",marginBottom:14 }}/>
          <ActionBtn onClick={generate} loading={loading} style={{ width:"100%" }}>
            <Icon name="discord" size={15} color={BRAND.white}/> Generate Discord Post
          </ActionBtn>
        </Card>

        <Card style={{ marginTop:14 }}>
          <SectionLabel text="Discord Markdown Tips"/>
          {[["**bold**","Bold text"],["__underline__","Underlined"],["*italic*","Italics"],
            ["> quote","Block quote"],["```code```","Code block"],["||spoiler||","Spoiler"],
            ["@role","Role mention"],["#channel","Channel link"],
          ].map(([code,desc])=>(
            <div key={code} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"5px 0",borderBottom:`1px solid ${BRAND.navyLight}` }}>
              <code style={{ fontSize:11,color:BRAND.orange,fontFamily:"monospace" }}>{code}</code>
              <span style={{ fontSize:11,color:BRAND.gray }}>{desc}</span>
            </div>
          ))}
        </Card>
      </div>

      <Card style={{ minHeight:500,position:"relative" }}>
        {!output && !loading && (
          <div style={{ position:"absolute",inset:0,display:"flex",flexDirection:"column",
            alignItems:"center",justifyContent:"center",gap:12 }}>
            <div style={{ width:52,height:52,borderRadius:12,background:"#5865F222",
              display:"flex",alignItems:"center",justifyContent:"center" }}>
              <Icon name="discord" size={26} color="#5865F2"/>
            </div>
            <div style={{ color:BRAND.gray,fontSize:14,textAlign:"center" }}>Choose a message type<br/>and generate Discord-ready copy</div>
          </div>
        )}
        {(output||loading) && (
          <div style={{ animation:"fadeIn 0.3s ease" }}>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18 }}>
              <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                <span style={{ padding:"3px 10px",borderRadius:6,background:"#5865F222",color:"#5865F2",fontSize:12,fontWeight:700 }}>Discord</span>
                <span style={{ fontSize:12,color:BRAND.gray }}>{type} · {tier}</span>
              </div>
              {output && <CopyButton text={output} label="Copy for Discord"/>}
            </div>
            {/* Preview box */}
            {output && (
              <div style={{ padding:16,borderRadius:10,background:"#36393f",marginBottom:16,
                border:`1px solid #202225`,fontFamily:"Whitney,sans-serif" }}>
                <div style={{ fontSize:11,color:"#72767d",marginBottom:8,fontWeight:600 }}>DISCORD PREVIEW</div>
                <div style={{ fontSize:13,color:"#dcddde",lineHeight:1.7,whiteSpace:"pre-wrap" }}>
                  {output.replace(/\*\*(.+?)\*\*/g,"$1").replace(/__(.+?)__/g,"$1")}
                </div>
              </div>
            )}
            {loading && !output && <div style={{ display:"flex",gap:10,color:BRAND.gray }}><Spinner/> Writing Discord post...</div>}
            <MarkdownText text={output}/>
          </div>
        )}
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════
// TAB 7 — A/B TESTER
// ════════════════════════════════════════════
function ABTester() {
  const [hookA, setHookA] = useState("");
  const [hookB, setHookB] = useState("");
  const [platform, setPlatform] = useState("TikTok");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [raw, setRaw] = useState("");

  const test = async () => {
    if (!hookA.trim()||!hookB.trim()) return;
    setLoading(true); setResult(null); setRaw("");
    const prompt = `You are a conversion rate expert analyzing two Valor Odds marketing hooks for ${platform}.

Hook A: "${hookA}"
Hook B: "${hookB}"

Score EACH hook out of 10 on:
1. Attention (scroll-stop power)
2. Clarity (is the value prop instantly clear?)
3. FOMO Factor (urgency/fear of missing out)
4. CTA Strength (does it drive action?)
5. Brand Fit (matches Valor Odds voice)

Then declare a WINNER and explain why in 2-3 punchy sentences.
Finally, suggest ONE improvement for the losing hook.

Respond ONLY with valid JSON, no markdown, no explanation outside JSON:
{
  "hookA": { "attention":8,"clarity":7,"fomo":9,"cta":7,"brand":8,"total":39,"notes":"..." },
  "hookB": { "attention":6,"clarity":9,"fomo":5,"cta":8,"brand":7,"total":35,"notes":"..." },
  "winner": "A",
  "reason": "...",
  "improvement": "Revised Hook B: ..."
}`;
    try {
      let raw = "";
      await callClaude([{role:"user",content:prompt}], t=>{ raw=t; setRaw(t); });
      const clean = raw.replace(/```json|```/g,"").trim();
      const parsed = JSON.parse(clean);
      setResult(parsed);
    } catch { setRaw("Could not parse scores. Raw output above."); }
    setLoading(false);
  };

  const ScoreBar = ({score,label,color}) => (
    <div style={{ marginBottom:8 }}>
      <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
        <span style={{ fontSize:11,color:BRAND.gray }}>{label}</span>
        <span style={{ fontSize:11,fontWeight:700,color }}>{score}/10</span>
      </div>
      <div style={{ height:6,borderRadius:3,background:BRAND.navyLight,overflow:"hidden" }}>
        <div className="score-bar" style={{ height:"100%",borderRadius:3,background:color,width:`${score*10}%` }}/>
      </div>
    </div>
  );

  const METRICS = [
    {key:"attention",label:"Attention"},
    {key:"clarity",  label:"Clarity"},
    {key:"fomo",     label:"FOMO Factor"},
    {key:"cta",      label:"CTA Strength"},
    {key:"brand",    label:"Brand Fit"},
  ];

  return (
    <div>
      <div style={{ fontSize:18,fontWeight:700,marginBottom:4 }}>A/B Hook Tester</div>
      <div style={{ fontSize:13,color:BRAND.gray,marginBottom:20 }}>Score two hooks head-to-head across 5 dimensions</div>

      <Card style={{ marginBottom:20 }}>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:14,alignItems:"end" }}>
          <div>
            <label style={{ fontSize:11,color:BRAND.gray,fontWeight:700,display:"block",marginBottom:6,letterSpacing:0.6 }}>HOOK A</label>
            <textarea value={hookA} onChange={e=>setHookA(e.target.value)}
              placeholder="e.g. 'You lost again. We didn't.'"
              rows={3} style={{ width:"100%",padding:"10px 13px",background:BRAND.navy,
                border:`2px solid ${BRAND.orange}44`,borderRadius:10,color:BRAND.white,
                fontSize:13,fontFamily:"inherit",resize:"none" }}/>
          </div>
          <div>
            <label style={{ fontSize:11,color:BRAND.gray,fontWeight:700,display:"block",marginBottom:6,letterSpacing:0.6 }}>HOOK B</label>
            <textarea value={hookB} onChange={e=>setHookB(e.target.value)}
              placeholder="e.g. 'Stop guessing. Start winning with data.'"
              rows={3} style={{ width:"100%",padding:"10px 13px",background:BRAND.navy,
                border:`2px solid #5865F244`,borderRadius:10,color:BRAND.white,
                fontSize:13,fontFamily:"inherit",resize:"none" }}/>
          </div>
          <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
            <div>
              <label style={{ fontSize:11,color:BRAND.gray,fontWeight:700,display:"block",marginBottom:6,letterSpacing:0.6 }}>PLATFORM</label>
              <select value={platform} onChange={e=>setPlatform(e.target.value)} style={{
                padding:"9px 12px",background:BRAND.navy,border:`1px solid ${BRAND.navyLight}`,
                borderRadius:8,color:BRAND.white,fontSize:13,fontFamily:"inherit",cursor:"pointer",width:"100%" }}>
                {PLATFORMS.map(p=><option key={p}>{p}</option>)}
              </select>
            </div>
            <ActionBtn onClick={test} loading={loading} disabled={!hookA.trim()||!hookB.trim()}>
              <Icon name="scale" size={14} color={BRAND.white}/> Test
            </ActionBtn>
          </div>
        </div>
      </Card>

      {result && (
        <div style={{ animation:"fadeIn 0.4s ease" }}>
          {/* WINNER BANNER */}
          <div style={{ padding:"16px 20px",borderRadius:12,marginBottom:20,
            background:`linear-gradient(135deg,${BRAND.orange}22,${BRAND.orange}11)`,
            border:`1px solid ${BRAND.orange}55`,display:"flex",alignItems:"center",gap:12 }}>
            <Icon name="trophy" size={24} color={BRAND.orange}/>
            <div>
              <div style={{ fontSize:16,fontWeight:700,color:BRAND.orange }}>Winner: Hook {result.winner}</div>
              <div style={{ fontSize:13,color:BRAND.grayLight,marginTop:2 }}>{result.reason}</div>
            </div>
          </div>

          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16 }}>
            {["A","B"].map(side=>{
              const data = result[`hook${side}`];
              const isWinner = result.winner===side;
              const color = side==="A" ? BRAND.orange : "#5865F2";
              return (
                <Card key={side} style={{ border:`1px solid ${isWinner?color:BRAND.navyLight}` }}>
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14 }}>
                    <div style={{ fontSize:14,fontWeight:700,color }}>Hook {side}</div>
                    <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                      {isWinner && <span style={{ fontSize:11,fontWeight:700,color,padding:"2px 8px",background:`${color}22`,borderRadius:5 }}>WINNER</span>}
                      <span style={{ fontSize:18,fontWeight:800,color }}>{data.total}/50</span>
                    </div>
                  </div>
                  <div style={{ padding:"8px 12px",borderRadius:8,background:BRAND.navy,marginBottom:14,
                    fontSize:12,color:BRAND.white,lineHeight:1.5,fontStyle:"italic" }}>
                    "{side==="A"?hookA:hookB}"
                  </div>
                  {METRICS.map(m=><ScoreBar key={m.key} score={data[m.key]} label={m.label} color={color}/>)}
                  {data.notes && <div style={{ marginTop:10,fontSize:12,color:BRAND.gray,lineHeight:1.5 }}>{data.notes}</div>}
                </Card>
              );
            })}
          </div>

          {result.improvement && (
            <Card style={{ background:`${BRAND.green}11`,border:`1px solid ${BRAND.green}44` }}>
              <div style={{ display:"flex",gap:10,alignItems:"flex-start" }}>
                <Icon name="sparkles" size={18} color={BRAND.green}/>
                <div>
                  <div style={{ fontSize:13,fontWeight:700,color:BRAND.green,marginBottom:4 }}>Improvement Suggestion</div>
                  <div style={{ fontSize:13,color:BRAND.grayLight,lineHeight:1.6 }}>{result.improvement}</div>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {loading && (
        <Card style={{ textAlign:"center",padding:"40px" }}>
          <Spinner/><div style={{ color:BRAND.gray,marginTop:12 }}>Analyzing both hooks...</div>
        </Card>
      )}
    </div>
  );
}

// ════════════════════════════════════════════
// TAB 8 — COMPETITOR INTEL
// ════════════════════════════════════════════
function CompetitorIntel() {
  const [input, setInput] = useState("");
  const [type, setType] = useState("Social Post");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    if (!input.trim()) return;
    setLoading(true); setOutput("");
    const prompt = `Analyze this competitor ${type} from the sports betting / sports intelligence space, then provide a counter-strategy for Valor Odds.

COMPETITOR CONTENT:
"${input}"

Provide:
**1. Strategy Breakdown**
What angle/tactics are they using? Who is their target? What's their hook?

**2. Strengths**
What's working about this content that Valor Odds should note?

**3. Weaknesses & Gaps**
Where are they falling short? What are they missing?

**4. Valor Odds Counter-Strategy**
How should Valor Odds respond or differentiate? Specific content angle to own the space they're leaving open.

**5. Counter-Hook**
Write a Valor Odds hook/post that directly positions against this competitor without naming them.

Be sharp and strategic. Assume the competitor is a real threat.`;
    try { await callClaude([{role:"user",content:prompt}], setOutput, 1200); }
    catch { setOutput("Error analyzing. Please try again."); }
    setLoading(false);
  };

  const TYPES = ["Social Post","Profile Bio","YouTube Video Title","Ad Copy","Discord Invite","Website Copy"];
  const EXAMPLES = [
    "Beat the books with our expert picks. 72% win rate guaranteed. Join 50,000 Discord members.",
    "I turned $500 into $4,200 in one weekend using our secret system. DM me for access.",
    "Why I only bet with sharp money — the method that changed everything",
  ];

  return (
    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:20 }}>
      <div>
        <div style={{ fontSize:18,fontWeight:700,marginBottom:4 }}>Competitor Intel Scanner</div>
        <div style={{ fontSize:13,color:BRAND.gray,marginBottom:20 }}>Paste a competitor's content — get a strategic counter-playbook</div>

        <Card style={{ marginBottom:14 }}>
          <SectionLabel text="Analyze Competitor Content"/>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11,color:BRAND.gray,fontWeight:700,display:"block",marginBottom:5,letterSpacing:0.6 }}>CONTENT TYPE</label>
            <select value={type} onChange={e=>setType(e.target.value)} style={{ width:"100%",padding:"9px 12px",
              background:BRAND.navy,border:`1px solid ${BRAND.navyLight}`,borderRadius:8,
              color:BRAND.white,fontSize:13,fontFamily:"inherit",cursor:"pointer" }}>
              {TYPES.map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <label style={{ fontSize:11,color:BRAND.gray,fontWeight:700,display:"block",marginBottom:5,letterSpacing:0.6 }}>PASTE COMPETITOR CONTENT</label>
          <textarea value={input} onChange={e=>setInput(e.target.value)}
            placeholder="Paste their caption, bio, tweet, ad copy, video title, or any marketing content here..."
            rows={6} style={{ width:"100%",padding:"10px 13px",background:BRAND.navy,
              border:`1px solid ${BRAND.navyLight}`,borderRadius:10,color:BRAND.white,
              fontSize:13,fontFamily:"inherit",resize:"none",marginBottom:14 }}/>
          <ActionBtn onClick={analyze} loading={loading} disabled={!input.trim()} style={{ width:"100%" }}>
            <Icon name="search" size={14} color={BRAND.white}/> Analyze & Counter
          </ActionBtn>
        </Card>

        <Card>
          <SectionLabel text="Try an Example"/>
          {EXAMPLES.map((ex,i)=>(
            <button key={i} onClick={()=>setInput(ex)} style={{
              width:"100%",textAlign:"left",padding:"10px 12px",background:BRAND.navy,
              border:`1px solid ${BRAND.navyLight}`,borderRadius:8,color:BRAND.grayLight,
              fontSize:12,cursor:"pointer",marginBottom:8,fontFamily:"inherit",lineHeight:1.5,transition:"all 0.15s",
              fontStyle:"italic" }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=BRAND.orange;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=BRAND.navyLight;}}>
              "{ex}"
            </button>
          ))}
        </Card>
      </div>

      <Card style={{ minHeight:500,position:"relative" }}>
        {!output && !loading && (
          <div style={{ position:"absolute",inset:0,display:"flex",flexDirection:"column",
            alignItems:"center",justifyContent:"center",gap:12 }}>
            <div style={{ width:52,height:52,borderRadius:12,background:`${BRAND.red}22`,
              display:"flex",alignItems:"center",justifyContent:"center" }}>
              <Icon name="eye" size={26} color={BRAND.red}/>
            </div>
            <div style={{ color:BRAND.gray,fontSize:14,textAlign:"center" }}>Paste competitor content<br/>to get your counter-strategy</div>
          </div>
        )}
        {loading && !output && <div style={{ display:"flex",gap:10,color:BRAND.gray,padding:20,alignItems:"center" }}><Spinner/> Analyzing competitor...</div>}
        {output && (
          <div style={{ animation:"fadeIn 0.3s ease" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
              <span style={{ padding:"3px 10px",borderRadius:6,background:`${BRAND.red}22`,color:BRAND.red,fontSize:12,fontWeight:700 }}>Intel Report</span>
              <CopyButton text={output}/>
            </div>
            <MarkdownText text={output} style={{ fontSize:13 }}/>
          </div>
        )}
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════
// TAB 9 — PERFORMANCE TRACKER
// ════════════════════════════════════════════
function PerformanceTracker() {
  const [posts, setPosts] = useState([
    {id:1,platform:"TikTok",  type:"Arb Reveal",      views:14200,clicks:340,joins:12,date:"Mar 10",notes:""},
    {id:2,platform:"Instagram",type:"Member Win",      views:2800, clicks:180,joins:8, date:"Mar 9", notes:""},
    {id:3,platform:"X / Twitter",type:"Injury Alert",  views:5600, clicks:220,joins:5, date:"Mar 8", notes:""},
    {id:4,platform:"Reddit",  type:"Educational Post", views:3100, clicks:290,joins:15,date:"Mar 7", notes:""},
    {id:5,platform:"YouTube", type:"Arb Betting 101",  views:1240, clicks:85, joins:22,date:"Mar 6", notes:""},
  ]);
  const [form, setForm] = useState({platform:"TikTok",type:"",views:"",clicks:"",joins:"",date:"",notes:""});
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const PC = {TikTok:"#FF0050",Instagram:"#E1306C","X / Twitter":"#1DA1F2",Reddit:"#FF4500",YouTube:"#FF0000",Discord:"#5865F2"};

  const addPost = () => {
    if (!form.type||!form.views) return;
    setPosts(p=>[...p,{id:Date.now(),...form,views:+form.views,clicks:+form.clicks,joins:+form.joins}]);
    setForm({platform:"TikTok",type:"",views:"",clicks:"",joins:"",date:"",notes:""});
    setShowForm(false);
  };

  const getAnalysis = async () => {
    setLoading(true); setAnalysis("");
    const data = posts.map(p=>`${p.platform} | ${p.type} | Views:${p.views} | Clicks:${p.clicks} | Discord Joins:${p.joins} | Date:${p.date}`).join("\n");
    const prompt = `Analyze this Valor Odds content performance data and provide strategic insights.

DATA:
${data}

Provide:
**Top Performers**
Which content types and platforms are driving the most Discord joins?

**Patterns & Insights**
What's working and why? Spot any patterns in high-performing posts.

**Weak Spots**
Where is effort not converting? What should be cut or changed?

**Recommendations**
3 specific, actionable changes to the content strategy based on this data.

**What to Double Down On**
The one content type/platform combo with the clearest ROI signal.

Be specific, data-referenced, and direct.`;
    try { await callClaude([{role:"user",content:prompt}], setAnalysis, 1200); }
    catch { setAnalysis("Error generating analysis."); }
    setLoading(false);
  };

  const totalJoins = posts.reduce((s,p)=>s+p.joins,0);
  const totalViews = posts.reduce((s,p)=>s+p.views,0);
  const bestPost = posts.reduce((b,p)=>p.joins>b.joins?p:b,posts[0]);

  return (
    <div>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20 }}>
        <div>
          <div style={{ fontSize:18,fontWeight:700 }}>Performance Tracker</div>
          <div style={{ fontSize:13,color:BRAND.gray,marginTop:2 }}>Log posts, track Discord joins, get AI insights</div>
        </div>
        <div style={{ display:"flex",gap:10 }}>
          <button onClick={()=>setShowForm(f=>!f)} style={{
            padding:"9px 16px",background:BRAND.navyMid,border:`1px solid ${BRAND.navyLight}`,
            borderRadius:10,color:BRAND.white,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit" }}>
            + Log Post
          </button>
          <ActionBtn onClick={getAnalysis} loading={loading}>
            <Icon name="sparkles" size={14} color={BRAND.white}/> AI Analysis
          </ActionBtn>
        </div>
      </div>

      {/* STATS */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:20 }}>
        {[
          {label:"Total Discord Joins",value:totalJoins,color:BRAND.green,icon:"discord"},
          {label:"Total Reach",value:totalViews.toLocaleString(),color:BRAND.orange,icon:"eye"},
          {label:"Best Post",value:`${bestPost?.platform} · ${bestPost?.joins} joins`,color:"#5865F2",icon:"trophy"},
        ].map(({label,value,color,icon})=>(
          <Card key={label}>
            <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:8 }}>
              <div style={{ width:36,height:36,borderRadius:9,background:`${color}22`,
                display:"flex",alignItems:"center",justifyContent:"center" }}>
                <Icon name={icon} size={18} color={color}/>
              </div>
              <div style={{ fontSize:11,color:BRAND.gray,fontWeight:600,letterSpacing:0.5 }}>{label.toUpperCase()}</div>
            </div>
            <div style={{ fontSize:22,fontWeight:800,color }}>{value}</div>
          </Card>
        ))}
      </div>

      {/* ADD FORM */}
      {showForm && (
        <Card style={{ marginBottom:16,border:`1px solid ${BRAND.orange}44`,animation:"fadeIn 0.2s ease" }}>
          <SectionLabel text="Log New Post"/>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr) repeat(3,1fr) 1fr",gap:10,alignItems:"end" }}>
            {[
              {label:"Platform",key:"platform",type:"select",opts:PLATFORMS},
              {label:"Content Type",key:"type",type:"text",ph:"e.g. Arb Reveal"},
              {label:"Date",key:"date",type:"text",ph:"e.g. Mar 13"},
              {label:"Views / Impressions",key:"views",type:"number",ph:"0"},
              {label:"Link Clicks",key:"clicks",type:"number",ph:"0"},
              {label:"Discord Joins",key:"joins",type:"number",ph:"0"},
            ].map(({label,key,type,opts,ph})=>(
              <div key={key}>
                <label style={{ fontSize:10,color:BRAND.gray,fontWeight:700,display:"block",marginBottom:4,letterSpacing:0.6 }}>{label.toUpperCase()}</label>
                {type==="select"
                  ? <select value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} style={{ width:"100%",padding:"8px 10px",background:BRAND.navy,border:`1px solid ${BRAND.navyLight}`,borderRadius:8,color:BRAND.white,fontSize:12,fontFamily:"inherit" }}>
                      {opts.map(o=><option key={o}>{o}</option>)}
                    </select>
                  : <input type={type} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} placeholder={ph}
                      style={{ width:"100%",padding:"8px 10px",background:BRAND.navy,border:`1px solid ${BRAND.navyLight}`,borderRadius:8,color:BRAND.white,fontSize:12,fontFamily:"inherit" }}/>
                }
              </div>
            ))}
            <ActionBtn onClick={addPost} style={{ padding:"9px 14px",fontSize:12 }}>Add</ActionBtn>
          </div>
        </Card>
      )}

      <div style={{ display:"grid",gridTemplateColumns:"1fr 400px",gap:16 }}>
        {/* TABLE */}
        <Card style={{ padding:0,overflow:"hidden" }}>
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ background:BRAND.navyLight }}>
                {["Platform","Type","Views","Clicks","Joins","Date"].map(h=>(
                  <th key={h} style={{ padding:"10px 14px",textAlign:"left",fontSize:11,fontWeight:700,color:BRAND.gray,letterSpacing:0.6 }}>{h.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {posts.map((p,i)=>(
                <tr key={p.id} style={{ borderBottom:`1px solid ${BRAND.navyLight}`,background:i%2===0?BRAND.navyMid:BRAND.navy }}>
                  <td style={{ padding:"10px 14px" }}>
                    <span style={{ display:"inline-flex",alignItems:"center",gap:6,fontSize:12,fontWeight:600,color:PC[p.platform]||BRAND.orange }}>
                      <div style={{ width:6,height:6,borderRadius:"50%",background:PC[p.platform]||BRAND.orange,flexShrink:0 }}/>
                      {p.platform}
                    </span>
                  </td>
                  <td style={{ padding:"10px 14px",fontSize:12,color:BRAND.grayLight }}>{p.type}</td>
                  <td style={{ padding:"10px 14px",fontSize:12,color:BRAND.white,fontWeight:600 }}>{p.views.toLocaleString()}</td>
                  <td style={{ padding:"10px 14px",fontSize:12,color:BRAND.white }}>{p.clicks}</td>
                  <td style={{ padding:"10px 14px" }}>
                    <span style={{ fontWeight:700,color:BRAND.green,fontSize:13 }}>+{p.joins}</span>
                  </td>
                  <td style={{ padding:"10px 14px",fontSize:11,color:BRAND.gray }}>{p.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* ANALYSIS */}
        <Card style={{ minHeight:200,position:"relative" }}>
          {!analysis && !loading && (
            <div style={{ textAlign:"center",padding:"30px 0" }}>
              <Icon name="target" size={30} color={BRAND.navyLight}/>
              <div style={{ color:BRAND.gray,marginTop:10,fontSize:13 }}>Click "AI Analysis" to get<br/>performance insights</div>
            </div>
          )}
          {loading && !analysis && <div style={{ display:"flex",gap:10,color:BRAND.gray,alignItems:"center" }}><Spinner/> Analyzing data...</div>}
          {analysis && (
            <div style={{ animation:"fadeIn 0.3s ease" }}>
              <div style={{ display:"flex",justifyContent:"space-between",marginBottom:12 }}>
                <SectionLabel text="AI Insights"/>
                <CopyButton text={analysis}/>
              </div>
              <MarkdownText text={analysis} style={{ fontSize:12 }}/>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// TAB 10 — AUTOMATION EXPORT
// ════════════════════════════════════════════
function AutomationExport() {
  const [trigger, setTrigger] = useState("New Injury Report");
  const [platform, setPlatform] = useState("X / Twitter");
  const [tool, setTool] = useState("Zapier");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeFormat, setActiveFormat] = useState("prompt");

  const TRIGGERS = ["New Injury Report","Odds Line Movement (>10%)","Arb Window Detected",
    "Game Starting in 2 Hours","Score Update (Final)","New Member Joined Discord",
    "Trade Announced","Weather Alert for Outdoor Game","Free Trial Starts","VIP Subscription Starts"];
  const TOOLS = ["Zapier","Make (Integromat)","n8n","Buffer","Manual / Copy-Paste"];
  const FORMATS = [
    {id:"prompt",  label:"AI Prompt"},
    {id:"zap",     label:"Zap Structure"},
    {id:"template",label:"Message Template"},
  ];

  const generate = async () => {
    setLoading(true); setOutput("");
    const prompt = `Create a ${tool} automation export for Valor Odds.

Trigger: ${trigger}
Output Platform: ${platform}
Automation Tool: ${tool}

Provide ALL of the following:

**1. Claude AI Prompt (for the AI step)**
The exact system prompt and user prompt to send to Claude API to generate the ${platform} post when this trigger fires. Include placeholders like {{player_name}}, {{odds_change}}, {{team}} etc.

**2. ${tool} Step Structure**
Walk through each step/module in ${tool} that would make this automation work. Be specific about which apps, triggers, and actions to use.

**3. Ready-to-Use Message Template**
A fallback template that works without AI — just fill in the blanks. Include every placeholder clearly labeled.

**4. Sample Output**
What a finished post would look like when this automation fires. Make it specific to ${trigger} and ${platform}.

**5. Setup Notes**
Any important tips, API keys needed, or gotchas when setting this up in ${tool}.

Be specific and technical enough that someone can actually implement this.`;
    try { await callClaude([{role:"user",content:prompt}], setOutput, 1400); }
    catch { setOutput("Error generating. Please try again."); }
    setLoading(false);
  };

  const selStyle = { width:"100%",padding:"9px 12px",background:BRAND.navy,
    border:`1px solid ${BRAND.navyLight}`,borderRadius:8,color:BRAND.white,
    fontSize:13,fontFamily:"inherit",cursor:"pointer" };

  return (
    <div style={{ display:"grid",gridTemplateColumns:"280px 1fr",gap:20 }}>
      <div>
        <Card>
          <SectionLabel text="Automation Builder"/>
          {[
            {label:"When This Happens (Trigger)", val:trigger, set:setTrigger, opts:TRIGGERS},
            {label:"Post To This Platform",       val:platform, set:setPlatform, opts:PLATFORMS},
            {label:"Automation Tool",             val:tool,    set:setTool,    opts:TOOLS},
          ].map(({label,val,set,opts})=>(
            <div key={label} style={{ marginBottom:12 }}>
              <label style={{ fontSize:11,color:BRAND.gray,fontWeight:700,display:"block",marginBottom:5,letterSpacing:0.6 }}>{label.toUpperCase()}</label>
              <select value={val} onChange={e=>set(e.target.value)} style={selStyle}>
                {opts.map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
          ))}
          <ActionBtn onClick={generate} loading={loading} style={{ width:"100%",marginTop:6 }}>
            <Icon name="code" size={14} color={BRAND.white}/> Generate Automation
          </ActionBtn>
        </Card>

        <Card style={{ marginTop:14 }}>
          <SectionLabel text="How This Works"/>
          <div style={{ fontSize:12,color:BRAND.grayLight,lineHeight:1.7 }}>
            This tool generates everything you need to set up a fully automated posting workflow:{" "}
            the AI prompt, the automation steps, and a fallback template.
            <br/><br/>
            Connect Valor Odds to your sportsbook data feeds or RSS alerts, then use these exports
            to automatically generate and post content the moment something happens.
          </div>
        </Card>
      </div>

      <Card style={{ minHeight:500,position:"relative" }}>
        {!output && !loading && (
          <div style={{ position:"absolute",inset:0,display:"flex",flexDirection:"column",
            alignItems:"center",justifyContent:"center",gap:12 }}>
            <div style={{ width:52,height:52,borderRadius:12,background:`${BRAND.purple}22`,
              display:"flex",alignItems:"center",justifyContent:"center" }}>
              <Icon name="zap" size={26} color={BRAND.purple}/>
            </div>
            <div style={{ color:BRAND.gray,fontSize:14,textAlign:"center" }}>
              Configure a trigger + platform<br/>and generate your automation package
            </div>
          </div>
        )}
        {loading && !output && <div style={{ display:"flex",gap:10,color:BRAND.gray,padding:20,alignItems:"center" }}><Spinner/> Building automation package...</div>}
        {output && (
          <div style={{ animation:"fadeIn 0.3s ease" }}>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18 }}>
              <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                <span style={{ padding:"3px 10px",borderRadius:6,background:`${BRAND.purple}22`,color:BRAND.purple,fontSize:12,fontWeight:700 }}>{tool}</span>
                <span style={{ fontSize:12,color:BRAND.gray }}>{trigger} → {platform}</span>
              </div>
              <CopyButton text={output} label="Copy All"/>
            </div>
            <MarkdownText text={output} style={{ fontSize:13 }}/>
          </div>
        )}
      </Card>
    </div>
  );
}
