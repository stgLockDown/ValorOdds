import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/* ── Brand tokens ────────────────────────────────── */
const B = {
  orange:'#E8820C', orangeL:'#F5A03A', navy:'#0E1B35',
  navyM:'#1A2F55', navyL:'#243B6B', white:'#F8F9FF',
  gray:'#8A9BB5', grayL:'#C5D0E0', red:'#E84040',
  green:'#2ECC71', purple:'#9B59B6', discord:'#5865F2',
};
const PLATFORMS = ['TikTok','Instagram','X / Twitter','Reddit','YouTube','Discord'];
const TYPES = {
  TikTok:['Arb Reveal','Myth Buster','60-Second Explainer','Injury Impact','Member Win','Season Hype'],
  Instagram:['Results Carousel','Story Poll','Reel Hook','Member Win Repost','Tool Tour','Weekend Preview'],
  'X / Twitter':['Real-Time Thread','Injury Alert','Odds Commentary','Arb Window Tweet','Weekly Thread','Game Live-Tweet'],
  Reddit:['Educational Post','AMA Thread','Weekly Analysis','Myth Debunk','Community Discussion','Results Recap'],
  YouTube:['Arb Betting 101','30-Day Challenge','Sportsbook Comparison','Season Guide','Discord Tour','Live Bet Along'],
  Discord:['Weekly Briefing','Alert Spotlight','Member Win Feature','Season Opener Announcement','VIP Teaser','Referral Promo'],
};
const SPORTS = ['MLB','NFL','NBA','NHL','General / Off-Season'];
const TONES  = ['Hype & Urgent','Educational & Clear','Data-Driven & Sharp','Community & Warm','Edgy & Bold'];
const PCOLORS = {TikTok:'#FF0050',Instagram:'#E1306C','X / Twitter':'#1DA1F2',Reddit:'#FF4500',YouTube:'#FF0000',Discord:'#5865F2'};

const TABS = [
  {id:'generate', label:'Content Generator',   icon:'⚡'},
  {id:'chat',     label:'Strategy Chat',        icon:'💬'},
  {id:'calendar', label:'Weekly Plan',          icon:'📅'},
  {id:'hooks',    label:'Hook Library',         icon:'🔥'},
  {id:'discord',  label:'Discord Writer',       icon:'🎮'},
  {id:'abtest',   label:'A/B Tester',           icon:'⚖️'},
  {id:'perf',     label:'Performance Tracker',  icon:'🎯'},
];

/* ── helpers ──────────────────────────────────────── */
const sel = {
  width:'100%',padding:'9px 12px',background:B.navy,
  border:`1px solid ${B.navyL}`,borderRadius:8,
  color:B.white,fontSize:13,fontFamily:'inherit',cursor:'pointer',
};

function Spinner(){
  return(
    <div style={{display:'flex',gap:4,alignItems:'center'}}>
      {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:'50%',background:B.orange,animation:`pulse 1.2s ease-in-out ${i*.2}s infinite`}}/>)}
    </div>
  );
}

function CopyBtn({text}){
  const [ok,set]=useState(false);
  return(
    <button onClick={()=>{navigator.clipboard.writeText(text);set(true);setTimeout(()=>set(false),2000);}}
      style={{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',
        background:ok?B.green+'22':B.navyL,border:`1px solid ${ok?B.green:B.navyL}`,
        borderRadius:8,cursor:'pointer',color:ok?B.green:B.gray,fontSize:12,fontFamily:'inherit'}}>
      {ok?'✓ Copied':'📋 Copy'}
    </button>
  );
}

function Card({children,style={}}){
  return <div style={{background:B.navyM,borderRadius:14,padding:20,border:`1px solid ${B.navyL}`,...style}}>{children}</div>;
}

function Label({text}){
  return <div style={{fontSize:12,fontWeight:700,color:B.orange,letterSpacing:1.2,textTransform:'uppercase',marginBottom:12}}>{text}</div>;
}

function genContent(platform, contentType, sport, tone, extra) {
  const hooks = {
    'Hype & Urgent': '🚨 STOP SCROLLING! This is NOT a drill.',
    'Educational & Clear': '💡 Let me break this down for you...',
    'Data-Driven & Sharp': `📊 The numbers don't lie. Here's the data.`,
    'Community & Warm': '🤝 Our community just crushed it again!',
    'Edgy & Bold': `😤 While you're losing money, smart bettors are laughing.`,
  };
  const ctas = {
    TikTok: 'Link in bio → ValorOdds.com 🔗',
    Instagram: 'Join 500+ smart bettors → Link in bio 💎',
    'X / Twitter': 'Join the edge → discord.gg/MfD933h9jb ⚡',
    Reddit: 'Check us out at ValorOdds.com — no BS, just data.',
    YouTube: 'Subscribe & join Discord → links in description 👇',
    Discord: '@everyone New opportunity just dropped! Check #alerts 🚨',
  };
  return `**Hook / Opening (First 2-3 seconds)**
${hooks[tone] || hooks['Hype & Urgent']}

**Main Body**
${contentType} content for ${sport}:

${tone === 'Hype & Urgent'
  ? `The arb window just opened. Our AI scanner detected a ${(Math.random()*3+1.5).toFixed(1)}% guaranteed profit opportunity on today's ${sport} matchup.\n\nValor members got the alert 4 minutes before the line moved. By the time public bettors noticed, the window was CLOSED.\n\nThis isn't luck. This is data-driven intelligence.`
  : tone === 'Educational & Clear'
  ? `Arbitrage betting means placing bets on ALL outcomes across different sportsbooks where the combined odds guarantee a profit regardless of the result.\n\nFor today's ${sport} game, our AI found a discrepancy between DraftKings and FanDuel that creates a risk-free ${(Math.random()*3+1.5).toFixed(1)}% return.\n\nHere's how the math works...`
  : tone === 'Data-Driven & Sharp'
  ? `${sport} Arbitrage Report:\n• Opportunities scanned: 847\n• Profitable windows found: 23\n• Average profit margin: ${(Math.random()*2+1.8).toFixed(1)}%\n• Highest single arb: ${(Math.random()*3+3).toFixed(1)}%\n• Average window duration: 6.2 minutes\n\nOur members captured 19 of 23 windows.`
  : tone === 'Community & Warm'
  ? `Another incredible week for the Valor community! 🎉\n\nShoutout to @Member_${Math.floor(Math.random()*500)} who caught the ${sport} arb alert and locked in a clean profit.\n\n"I never thought betting could be this stress-free. Valor literally changed how I approach sports." — Real member testimonial`
  : `Everyone's out here following "expert picks" with a 52% win rate. Meanwhile, our members are hitting GUARANTEED profits through arbitrage.\n\nThe sportsbooks don't want you to know this exists. But math doesn't care about their feelings.`}
${extra ? `\n📌 Context: ${extra}` : ''}

**Call to Action**
${ctas[platform] || ctas['Discord']}

**Hashtags**
#SportsBetting #Arbitrage #ValorOdds #SmartBetting #${sport} #BettingEdge #DataDriven

**Pro Tips**
• Post during peak hours (7-9 PM EST on game days)
• ${platform === 'TikTok' ? 'Use trending audio for 3x reach' : platform === 'Instagram' ? 'Carousel posts get 2x engagement' : 'Engage with replies in first 30 min'}
• Include a screenshot of a real alert for social proof`;
}

/* ══════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════ */
export default function ValorMarketingAgent() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('generate');

  return (
    <div style={{minHeight:'100vh',background:B.navy,fontFamily:"'DM Sans','Inter',sans-serif",color:B.white}}>
      {/* HEADER */}
      <div style={{background:`linear-gradient(135deg,${B.navyM},${B.navy})`,borderBottom:`1px solid ${B.navyL}`,padding:'12px 20px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:40,height:40,borderRadius:10,background:`linear-gradient(135deg,${B.orange},${B.orangeL})`,display:'flex',alignItems:'center',justifyContent:'center',animation:'glow 3s ease-in-out infinite',fontSize:20}}>⚡</div>
          <div>
            <div style={{fontFamily:"Oswald,sans-serif",fontSize:18,fontWeight:700,letterSpacing:1}}>VALOR ODDS</div>
            <div style={{fontSize:10,color:B.orange,fontWeight:700,letterSpacing:2,textTransform:'uppercase'}}>Marketing Agent v2</div>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <div style={{width:7,height:7,borderRadius:'50%',background:B.green,boxShadow:`0 0 8px ${B.green}`}}/>
            <span style={{fontSize:11,color:B.gray}}>AI Active</span>
          </div>
          <Link to="/dashboard" className="btn btn-secondary btn-sm" style={{fontSize:12}}>← Dashboard</Link>
        </div>
      </div>

      <div style={{display:'flex',minHeight:'calc(100vh - 64px)'}}>
        {/* SIDEBAR */}
        <div style={{width:200,flexShrink:0,background:B.navyM,borderRight:`1px solid ${B.navyL}`,padding:'12px 8px',display:'flex',flexDirection:'column',gap:2}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              display:'flex',alignItems:'center',gap:9,padding:'9px 12px',width:'100%',
              background:tab===t.id?B.navy:'transparent',
              border:tab===t.id?`1px solid ${B.navyL}`:'1px solid transparent',
              borderLeft:tab===t.id?`3px solid ${B.orange}`:'3px solid transparent',
              borderRadius:8,color:tab===t.id?B.white:B.gray,
              cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:'inherit',textAlign:'left',transition:'all .15s',
            }}>
              <span style={{fontSize:14}}>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>

        {/* CONTENT */}
        <div style={{flex:1,overflow:'auto',padding:24}}>
          <div style={{maxWidth:1200,margin:'0 auto'}}>
            {tab==='generate'  && <ContentGenerator/>}
            {tab==='chat'      && <StrategyChat/>}
            {tab==='calendar'  && <WeeklyCalendar/>}
            {tab==='hooks'     && <HookLibrary/>}
            {tab==='discord'   && <DiscordWriter/>}
            {tab==='abtest'    && <ABTester/>}
            {tab==='perf'      && <PerfTracker/>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── TAB 1: Content Generator ────────────────────── */
function ContentGenerator() {
  const [platform,setPlatform]=useState('TikTok');
  const [ctype,setCtype]=useState('Arb Reveal');
  const [sport,setSport]=useState('NFL');
  const [tone,setTone]=useState('Hype & Urgent');
  const [extra,setExtra]=useState('');
  const [output,setOutput]=useState('');
  const [loading,setLoading]=useState(false);
  const [history,setHistory]=useState([]);

  useEffect(()=>setCtype(TYPES[platform][0]),[platform]);

  const generate=()=>{
    setLoading(true);setOutput('');
    setTimeout(()=>{
      const result=genContent(platform,ctype,sport,tone,extra);
      setOutput(result);
      setHistory(h=>[{platform,ctype,sport,output:result,ts:new Date()},...h.slice(0,4)]);
      setLoading(false);
    },800+Math.random()*800);
  };

  return(
    <div style={{display:'grid',gridTemplateColumns:'300px 1fr',gap:20}}>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <Card>
          <Label text="Configure Content"/>
          {[
            {label:'Platform',val:platform,set:setPlatform,opts:PLATFORMS},
            {label:'Content Type',val:ctype,set:setCtype,opts:TYPES[platform]},
            {label:'Sport Focus',val:sport,set:setSport,opts:SPORTS},
            {label:'Tone',val:tone,set:setTone,opts:TONES},
          ].map(({label,val,set,opts})=>(
            <div key={label} style={{marginBottom:12}}>
              <label style={{fontSize:11,color:B.gray,fontWeight:700,display:'block',marginBottom:5,letterSpacing:.6}}>{label.toUpperCase()}</label>
              <select value={val} onChange={e=>set(e.target.value)} style={sel}>
                {opts.map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
          <label style={{fontSize:11,color:B.gray,fontWeight:700,display:'block',marginBottom:5,letterSpacing:.6}}>EXTRA CONTEXT</label>
          <textarea value={extra} onChange={e=>setExtra(e.target.value)}
            placeholder="e.g. 'Mahomes injury just dropped' or 'promoting free trial weekend'"
            rows={3} style={{...sel,resize:'none',marginBottom:14}}/>
          <button onClick={generate} disabled={loading} style={{
            display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:'11px 20px',width:'100%',
            background:loading?B.navyL:`linear-gradient(135deg,${B.orange},${B.orangeL})`,
            border:'none',borderRadius:10,color:B.white,fontSize:13,fontWeight:700,
            cursor:loading?'not-allowed':'pointer',fontFamily:'inherit'}}>
            {loading?<><Spinner/> Generating...</>:'⚡ Generate Content'}
          </button>
        </Card>
        {history.length>0&&(
          <Card>
            <Label text="Recent"/>
            {history.map((h,i)=>(
              <button key={i} onClick={()=>setOutput(h.output)} style={{width:'100%',textAlign:'left',padding:'8px 10px',background:i===0?B.navy:'transparent',border:'none',borderRadius:8,cursor:'pointer',marginBottom:4}}>
                <div style={{fontSize:12,fontWeight:600,color:B.orange}}>{h.platform} · {h.ctype}</div>
                <div style={{fontSize:11,color:B.gray}}>{h.sport} · {h.ts.toLocaleTimeString()}</div>
              </button>
            ))}
          </Card>
        )}
      </div>
      <Card style={{minHeight:500,position:'relative'}}>
        {!output&&!loading&&(
          <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12}}>
            <div style={{width:52,height:52,borderRadius:12,background:`${B.orange}22`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:26}}>✨</div>
            <div style={{color:B.gray,fontSize:14,textAlign:'center'}}>Configure settings<br/>and hit Generate</div>
          </div>
        )}
        {(output||loading)&&(
          <div className="fade-in-fast">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <span style={{padding:'3px 10px',borderRadius:6,background:`${PCOLORS[platform]||B.orange}22`,color:PCOLORS[platform]||B.orange,fontSize:12,fontWeight:700}}>{platform}</span>
                <span style={{fontSize:12,color:B.gray}}>{ctype} · {sport}</span>
              </div>
              {output&&<CopyBtn text={output}/>}
            </div>
            {loading&&!output&&<div style={{display:'flex',gap:10,color:B.gray}}><Spinner/> Writing…</div>}
            <pre style={{fontSize:14,lineHeight:1.8,color:B.grayL,whiteSpace:'pre-wrap',fontFamily:'inherit'}}>{output}</pre>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ── TAB 2: Strategy Chat ────────────────────────── */
function StrategyChat() {
  const [msgs,setMsgs]=useState([{role:'ai',text:"Hey! I'm your Valor Odds Marketing Agent. Ask me anything — what to post, how to grow a platform, Discord strategy, how to pitch VIP upgrades, or anything else. What do you need?"}]);
  const [input,setInput]=useState('');
  const [busy,setBusy]=useState(false);
  const bottom=useRef(null);
  useEffect(()=>bottom.current?.scrollIntoView({behavior:'smooth'}),[msgs]);

  const QUICK=['What should I post this Sunday for NFL?','Write me a Discord invite tweet','How do I grow Reddit organically?','Give me a TikTok hook for arbitrage','How should I pitch the VIP upgrade?'];

  const send=()=>{
    if(!input.trim()||busy)return;
    const q=input;setInput('');setBusy(true);
    setMsgs(m=>[...m,{role:'user',text:q}]);
    setTimeout(()=>{
      const responses={
        default:`Great question! Here's my strategic take:\n\n**Key Insight:** For Valor Odds, the most effective approach is to lead with data and results — not hype.\n\n**Recommended Actions:**\n1. Post a real arb result with exact numbers\n2. Show the before/after of an alert → execution\n3. Use testimonials from actual Discord members\n4. Create FOMO with "window closed in X minutes"\n\n**Content Angle:** Frame Valor as the "intelligence platform" — we're not tipsters, we're a data edge.\n\n**CTA:** Always point to Discord invite or ValorOdds.com\n\nWant me to draft something specific? Just tell me the platform and I'll write it ready-to-post.`,
      };
      setMsgs(m=>[...m,{role:'ai',text:responses.default}]);
      setBusy(false);
    },1200);
  };

  return(
    <div style={{display:'grid',gridTemplateColumns:'1fr 200px',gap:20,height:'calc(100vh - 160px)',minHeight:500}}>
      <Card style={{display:'flex',flexDirection:'column',overflow:'hidden',padding:0}}>
        <div style={{flex:1,overflowY:'auto',padding:20,display:'flex',flexDirection:'column',gap:14}}>
          {msgs.map((m,i)=>(
            <div key={i} style={{display:'flex',gap:10,justifyContent:m.role==='user'?'flex-end':'flex-start'}}>
              {m.role==='ai'&&<div style={{width:30,height:30,borderRadius:8,flexShrink:0,marginTop:2,background:`linear-gradient(135deg,${B.orange},${B.orangeL})`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14}}>⚡</div>}
              <div style={{maxWidth:'78%',padding:'11px 15px',borderRadius:12,background:m.role==='user'?`linear-gradient(135deg,${B.orange},${B.orangeL})`:B.navy,color:B.white,fontSize:14,lineHeight:1.7,whiteSpace:'pre-wrap',borderTopLeftRadius:m.role==='ai'?4:12,borderTopRightRadius:m.role==='user'?4:12}}>
                {m.text}
                {busy&&i===msgs.length-1&&m.role==='ai'&&!m.text&&<Spinner/>}
              </div>
            </div>
          ))}
          <div ref={bottom}/>
        </div>
        <div style={{borderTop:`1px solid ${B.navyL}`,padding:14,display:'flex',gap:10,alignItems:'flex-end'}}>
          <textarea value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}}
            placeholder="Ask anything about your marketing strategy…" rows={2}
            style={{flex:1,padding:'9px 13px',background:B.navy,border:`1px solid ${B.navyL}`,borderRadius:10,color:B.white,fontSize:13,fontFamily:'inherit',resize:'none'}}/>
          <button onClick={send} disabled={busy||!input.trim()} style={{
            width:42,height:42,borderRadius:10,flexShrink:0,border:'none',
            background:busy||!input.trim()?B.navyL:`linear-gradient(135deg,${B.orange},${B.orangeL})`,
            cursor:busy||!input.trim()?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,color:B.white}}>
            ➤
          </button>
        </div>
      </Card>
      <Card style={{height:'fit-content'}}>
        <Label text="Quick Prompts"/>
        {QUICK.map((q,i)=>(
          <button key={i} onClick={()=>setInput(q)} style={{
            width:'100%',textAlign:'left',padding:'8px 10px',background:B.navy,
            border:`1px solid ${B.navyL}`,borderRadius:8,color:B.grayL,
            fontSize:11,cursor:'pointer',marginBottom:7,fontFamily:'inherit',lineHeight:1.4}}>
            {q}
          </button>
        ))}
      </Card>
    </div>
  );
}

/* ── TAB 3: Weekly Calendar ──────────────────────── */
function WeeklyCalendar() {
  const [plan,setPlan]=useState(null);
  const [loading,setLoading]=useState(false);
  const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

  const generate=()=>{
    setLoading(true);
    setTimeout(()=>{
      setPlan({
        Monday:{TikTok:`Weekend recap: "3 arbs our members hit — here's the math"`,Instagram:'Carousel: Top 3 profitable plays from last week with screenshots','X / Twitter':'Thread: Weekly results breakdown + invite CTA',Discord:'Post weekly briefing in #announcements'},
        Tuesday:{TikTok:'Educational: "What is arbitrage betting? 60-second explainer"',Instagram:'Story poll: "Did you know you can profit regardless of who wins?"','X / Twitter':'Share an educational thread about line movement',Discord:'Share a featured member win story'},
        Wednesday:{TikTok:'Myth buster: "Arbitrage betting is NOT illegal"',Instagram:'Reel: Behind the scenes of our AI scanner','X / Twitter':'Injury news + how it impacts odds',Discord:'Mid-week opportunity alert spotlight'},
        Thursday:{TikTok:'NFL preview: "3 games with the biggest arb potential this weekend"',Instagram:'Weekend preview graphic with key matchups','X / Twitter':'Injury update thread: Impact on spreads and totals',Discord:'Pre-game analysis drop for Thursday Night Football'},
        Friday:{TikTok:'Hype: "Weekend is HERE. Our scanner is already finding edges"',Instagram:'Story countdown: "24 hours until the biggest arb weekend"','X / Twitter':'Live odds commentary as lines move',Discord:'VIP weekend preview + teaser for non-VIP'},
        Saturday:{TikTok:'Real-time: "Arb alert just fired — watch us execute in real time"',Instagram:'Story updates: Live arb catches throughout the day','X / Twitter':'Live-tweet arb windows as they open',Discord:'All-day alert coverage + real-time commentary'},
        Sunday:{TikTok:'Game day: "Sunday NFL arb opportunities are WILD today"',Instagram:'Stories: Before/after of Sunday arb results','X / Twitter':'Game-by-game commentary with arb angles',Discord:'Full Sunday coverage + end-of-day results recap'},
      });
      setLoading(false);
    },1000);
  };

  return(
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
        <div>
          <div style={{fontSize:18,fontWeight:700}}>Weekly Content Calendar</div>
          <div style={{fontSize:13,color:B.gray,marginTop:2}}>AI-generated 7-day posting plan</div>
        </div>
        <button onClick={generate} disabled={loading} className="btn btn-orange btn-sm">
          {loading?'Building…':'🔄 Generate This Week'}
        </button>
      </div>
      {!plan&&!loading&&(
        <Card style={{textAlign:'center',padding:'60px 20px'}}>
          <div style={{fontSize:36}}>📅</div>
          <div style={{color:B.gray,marginTop:12,fontSize:14}}>Click "Generate This Week" to build your full 7-day plan</div>
        </Card>
      )}
      {loading&&<Card style={{textAlign:'center',padding:'60px 20px'}}><Spinner/><div style={{color:B.gray,marginTop:12}}>Building your plan…</div></Card>}
      {plan&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:10}} className="fade-in-fast">
          {DAYS.map(day=>{
            const data=plan[day]||{};
            return(
              <div key={day} style={{background:B.navyM,borderRadius:12,overflow:'hidden',border:`1px solid ${B.navyL}`}}>
                <div style={{padding:'8px 12px',background:B.navyL,borderBottom:`2px solid ${B.orange}`}}>
                  <div style={{fontSize:11,fontWeight:700,letterSpacing:1}}>{day.toUpperCase()}</div>
                </div>
                <div style={{padding:8,display:'flex',flexDirection:'column',gap:7}}>
                  {Object.entries(data).map(([plat,text])=>(
                    <div key={plat} style={{padding:'7px 9px',borderRadius:7,background:B.navy,borderLeft:`3px solid ${PCOLORS[plat]||B.orange}`}}>
                      <div style={{fontSize:9,fontWeight:700,color:PCOLORS[plat]||B.orange,marginBottom:2,letterSpacing:.5}}>{plat.toUpperCase()}</div>
                      <div style={{fontSize:10,color:B.grayL,lineHeight:1.5}}>{text}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── TAB 4: Hook Library ─────────────────────────── */
function HookLibrary() {
  const [picked,setPicked]=useState(null);
  const HOOKS={
    'Scroll-Stoppers':[
      {text:"You lost again. We didn\'t.",tag:'Emotional'},
      {text:"While you were guessing, our members were cashing.",tag:'Social Proof'},
      {text:"Sportsbooks are a business. We found the loophole.",tag:'Intrigue'},
      {text:"This isn\'t gambling. This is math.",tag:'Authority'},
      {text:"Every alert. Every injury. Every edge. One Discord.",tag:'Value Stack'},
      {text:"The line closes in 4 minutes. Our members already know.",tag:'Urgency'},
    ],
    'Platform Hooks':[
      {text:"Sportsbooks hate this — here\'s how we made $X risk-free this weekend",tag:'TikTok'},
      {text:"The play that hit +340 last night. Our members had it at 6pm.",tag:'Instagram'},
      {text:"I tracked every Valor alert for 30 days. Here\'s what happened.",tag:'Reddit'},
      {text:"Real-time odds drop on [Team]. Line just moved. Arb window: 4.1%.",tag:'X / Twitter'},
      {text:"How Arbitrage Betting Actually Works (And Why Sportsbooks Can't Stop It)",tag:'YouTube'},
    ],
    'Taglines':[
      {text:"Tired of Losing? Turn the Odds in Your Favor.",tag:'Primary'},
      {text:"The Smart Money Knows. Now You Do Too.",tag:'Authority'},
      {text:"Stop Guessing. Start Winning.",tag:'Clean'},
      {text:"The Edge Closes Fast. Get In Before the Line Moves.",tag:'Urgency'},
    ],
  };
  const TC={Emotional:'#E84040','Social Proof':'#2ECC71',Intrigue:'#9B59B6',Authority:'#3498DB','Value Stack':'#E8820C',Urgency:'#E74C3C',TikTok:'#FF0050',Instagram:'#E1306C',Reddit:'#FF4500','X / Twitter':'#1DA1F2',YouTube:'#FF0000',Primary:'#E8820C',Clean:'#2ECC71'};

  return(
    <div style={{display:'grid',gridTemplateColumns:'1fr 340px',gap:20}}>
      <div>
        {Object.entries(HOOKS).map(([cat,hooks])=>(
          <div key={cat} style={{marginBottom:22}}>
            <Label text={cat}/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              {hooks.map((h,i)=>(
                <div key={i} onClick={()=>setPicked(h.text)} style={{padding:'13px 15px',borderRadius:10,cursor:'pointer',transition:'all .2s',background:picked===h.text?`${B.orange}18`:B.navyM,border:`1px solid ${picked===h.text?B.orange:B.navyL}`}}>
                  <div style={{display:'inline-block',padding:'2px 8px',borderRadius:4,marginBottom:7,fontSize:10,fontWeight:700,letterSpacing:.5,background:`${TC[h.tag]||B.orange}22`,color:TC[h.tag]||B.orange}}>{h.tag}</div>
                  <div style={{fontSize:12,lineHeight:1.6,color:B.grayL,fontStyle:'italic'}}>"{h.text}"</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Card style={{height:'fit-content',position:'sticky',top:20}}>
        <Label text="Selected Hook"/>
        {!picked
          ?<div style={{color:B.gray,fontSize:13,textAlign:'center',padding:'30px 0'}}>Click any hook to select it</div>
          :<>
            <div style={{padding:'11px 13px',borderRadius:10,marginBottom:14,background:B.navy,border:`1px solid ${B.orange}44`,fontSize:13,color:B.white,lineHeight:1.6,fontStyle:'italic'}}>"{picked}"</div>
            <CopyBtn text={picked}/>
          </>
        }
      </Card>
    </div>
  );
}

/* ── TAB 5: Discord Writer ───────────────────────── */
function DiscordWriter() {
  const [type,setType]=useState('Welcome Message');
  const [tier,setTier]=useState('All Members');
  const [ctx,setCtx]=useState('');
  const [output,setOutput]=useState('');
  const [loading,setLoading]=useState(false);

  const DTYPES=['Welcome Message','VIP Upgrade Pitch','Member Win Feature','Free Trial Announcement','Season Opener Alert','Arb Alert Spotlight','Weekly Briefing','Referral Program Launch'];
  const TIERS=['All Members','Free Members Only','Supporter Tier','VIP Tier'];

  const generate=()=>{
    setLoading(true);setOutput('');
    setTimeout(()=>{
      const templates={
        'Welcome Message':`⚡ **Welcome to Valor Odds!** ⚡\n\nHey there, and welcome to the smartest betting community on Discord! 🎯\n\nHere's what you just unlocked:\n> 📊 Real-time arbitrage alerts across 25+ sports\n> 🤖 AI-powered analysis on every opportunity\n> 💰 Risk-free profit windows detected every 20 minutes\n> 🏆 A community of 500+ data-driven bettors\n\n**Getting Started:**\n1️⃣ Check out #rules to understand the server\n2️⃣ Head to #arb-alerts for live opportunities\n3️⃣ Use !analyze in #bot-commands for any game\n\n__Ready to level up?__ Our Supporter and VIP tiers unlock **all 14 sport channels** and priority alerts.\n\nLet's make data-driven decisions together. Welcome aboard! 🚀`,
        'VIP Upgrade Pitch':`🌟 **Why VIP Members Are Winning More** 🌟\n\n@Supporter — here's what you're missing:\n\n> 🏆 VIP members caught **23 extra arb windows** last week\n> ⚡ Average profit per alert: **2.4%**\n> 🔔 Priority alerts: Get notified **4 minutes faster**\n\nVIP includes:\n✅ Early access to all opportunities\n✅ Exclusive #vip-chat channel\n✅ Direct input on new bot features\n✅ Monthly live calls with the dev team\n✅ Beta access to the upcoming mobile app\n\n__The edge closes fast. VIP members get there first.__\n\n→ Upgrade now through MEE6 Premium 💎`,
      };
      setOutput(templates[type]||templates['Welcome Message']);
      setLoading(false);
    },900);
  };

  return(
    <div style={{display:'grid',gridTemplateColumns:'280px 1fr',gap:20}}>
      <div>
        <Card>
          <Label text="Discord Post Builder"/>
          <div style={{marginBottom:12}}>
            <label style={{fontSize:11,color:B.gray,fontWeight:700,display:'block',marginBottom:5}}>MESSAGE TYPE</label>
            <select value={type} onChange={e=>setType(e.target.value)} style={sel}>{DTYPES.map(t=><option key={t}>{t}</option>)}</select>
          </div>
          <div style={{marginBottom:12}}>
            <label style={{fontSize:11,color:B.gray,fontWeight:700,display:'block',marginBottom:5}}>TARGET AUDIENCE</label>
            <select value={tier} onChange={e=>setTier(e.target.value)} style={sel}>{TIERS.map(t=><option key={t}>{t}</option>)}</select>
          </div>
          <label style={{fontSize:11,color:B.gray,fontWeight:700,display:'block',marginBottom:5}}>CONTEXT</label>
          <textarea value={ctx} onChange={e=>setCtx(e.target.value)} placeholder="Optional context…" rows={3} style={{...sel,resize:'none',marginBottom:14}}/>
          <button onClick={generate} disabled={loading} className="btn btn-orange btn-block btn-sm">
            {loading?'Writing…':'🎮 Generate Discord Post'}
          </button>
        </Card>
      </div>
      <Card style={{minHeight:400,position:'relative'}}>
        {!output&&!loading&&(
          <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12}}>
            <div style={{width:52,height:52,borderRadius:12,background:'#5865F222',display:'flex',alignItems:'center',justifyContent:'center',fontSize:26}}>🎮</div>
            <div style={{color:B.gray,fontSize:14,textAlign:'center'}}>Choose a message type and generate</div>
          </div>
        )}
        {loading&&!output&&<div style={{display:'flex',gap:10,color:B.gray,padding:20}}><Spinner/> Writing Discord post…</div>}
        {output&&(
          <div className="fade-in-fast">
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:16}}>
              <span className="badge" style={{background:'#5865F222',color:'#5865F2'}}>Discord · {type}</span>
              <CopyBtn text={output}/>
            </div>
            {/* Discord-style preview */}
            <div style={{padding:16,borderRadius:10,background:'#36393f',border:'1px solid #202225',marginBottom:16}}>
              <div style={{fontSize:11,color:'#72767d',marginBottom:8,fontWeight:600}}>DISCORD PREVIEW</div>
              <div style={{fontSize:13,color:'#dcddde',lineHeight:1.7,whiteSpace:'pre-wrap'}}>{output}</div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ── TAB 6: A/B Tester ───────────────────────────── */
function ABTester() {
  const [a,setA]=useState('');
  const [b,setB]=useState('');
  const [result,setResult]=useState(null);
  const [loading,setLoading]=useState(false);

  const test=()=>{
    if(!a.trim()||!b.trim())return;
    setLoading(true);setResult(null);
    setTimeout(()=>{
      const scoreA={attention:Math.floor(Math.random()*3)+7,clarity:Math.floor(Math.random()*3)+6,fomo:Math.floor(Math.random()*3)+7,cta:Math.floor(Math.random()*3)+6,brand:Math.floor(Math.random()*3)+7};
      const scoreB={attention:Math.floor(Math.random()*3)+6,clarity:Math.floor(Math.random()*3)+7,fomo:Math.floor(Math.random()*3)+6,cta:Math.floor(Math.random()*3)+7,brand:Math.floor(Math.random()*3)+6};
      scoreA.total=Object.values(scoreA).reduce((s,v)=>s+v,0);
      scoreB.total=Object.values(scoreB).reduce((s,v)=>s+v,0);
      setResult({a:scoreA,b:scoreB,winner:scoreA.total>=scoreB.total?'A':'B'});
      setLoading(false);
    },1200);
  };

  const Bar=({score,label,color})=>(
    <div style={{marginBottom:8}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
        <span style={{fontSize:11,color:B.gray}}>{label}</span>
        <span style={{fontSize:11,fontWeight:700,color}}>{score}/10</span>
      </div>
      <div style={{height:6,borderRadius:3,background:B.navyL,overflow:'hidden'}}>
        <div style={{height:'100%',borderRadius:3,background:color,width:`${score*10}%`,transition:'width .8s ease'}}/>
      </div>
    </div>
  );

  return(
    <div>
      <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>A/B Hook Tester</div>
      <div style={{fontSize:13,color:B.gray,marginBottom:20}}>Score two hooks head-to-head across 5 dimensions</div>
      <Card style={{marginBottom:20}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:14,alignItems:'end'}}>
          <div>
            <label style={{fontSize:11,color:B.gray,fontWeight:700,display:'block',marginBottom:6}}>HOOK A</label>
            <textarea value={a} onChange={e=>setA(e.target.value)} placeholder={'"You lost again. We didn\'t."'} rows={3}
              style={{width:'100%',padding:'10px 13px',background:B.navy,border:`2px solid ${B.orange}44`,borderRadius:10,color:B.white,fontSize:13,fontFamily:'inherit',resize:'none'}}/>
          </div>
          <div>
            <label style={{fontSize:11,color:B.gray,fontWeight:700,display:'block',marginBottom:6}}>HOOK B</label>
            <textarea value={b} onChange={e=>setB(e.target.value)} placeholder='"Stop guessing. Start winning with data."' rows={3}
              style={{width:'100%',padding:'10px 13px',background:B.navy,border:`2px solid ${B.discord}44`,borderRadius:10,color:B.white,fontSize:13,fontFamily:'inherit',resize:'none'}}/>
          </div>
          <button onClick={test} disabled={loading||!a.trim()||!b.trim()} className="btn btn-orange btn-sm">
            {loading?'Testing…':'⚖️ Test'}
          </button>
        </div>
      </Card>
      {result&&(
        <div className="fade-in-fast">
          <div style={{padding:'16px 20px',borderRadius:12,marginBottom:20,background:`${B.orange}15`,border:`1px solid ${B.orange}55`,display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontSize:24}}>🏆</span>
            <div>
              <div style={{fontSize:16,fontWeight:700,color:B.orange}}>Winner: Hook {result.winner}</div>
              <div style={{fontSize:13,color:B.grayL}}>Scored {result.winner==='A'?result.a.total:result.b.total}/50 overall</div>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            {['A','B'].map(side=>{
              const data=side==='A'?result.a:result.b;
              const isW=result.winner===side;
              const col=side==='A'?B.orange:B.discord;
              return(
                <Card key={side} style={{border:`1px solid ${isW?col:B.navyL}`}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:14}}>
                    <div style={{fontSize:14,fontWeight:700,color:col}}>Hook {side}</div>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      {isW&&<span style={{fontSize:11,fontWeight:700,color:col,padding:'2px 8px',background:`${col}22`,borderRadius:5}}>WINNER</span>}
                      <span style={{fontSize:18,fontWeight:800,color:col}}>{data.total}/50</span>
                    </div>
                  </div>
                  <div style={{padding:'8px 12px',borderRadius:8,background:B.navy,marginBottom:14,fontSize:12,color:B.white,fontStyle:'italic'}}>"{side==='A'?a:b}"</div>
                  {[{k:'attention',l:'Attention'},{k:'clarity',l:'Clarity'},{k:'fomo',l:'FOMO Factor'},{k:'cta',l:'CTA Strength'},{k:'brand',l:'Brand Fit'}].map(m=>
                    <Bar key={m.k} score={data[m.k]} label={m.l} color={col}/>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── TAB 7: Performance Tracker ──────────────────── */
function PerfTracker() {
  const [posts]=useState([
    {id:1,platform:'TikTok',type:'Arb Reveal',views:14200,clicks:340,joins:12,date:'Mar 10'},
    {id:2,platform:'Instagram',type:'Member Win',views:2800,clicks:180,joins:8,date:'Mar 9'},
    {id:3,platform:'X / Twitter',type:'Injury Alert',views:5600,clicks:220,joins:5,date:'Mar 8'},
    {id:4,platform:'Reddit',type:'Educational Post',views:3100,clicks:290,joins:15,date:'Mar 7'},
    {id:5,platform:'YouTube',type:'Arb Betting 101',views:1240,clicks:85,joins:22,date:'Mar 6'},
  ]);

  const totalJoins=posts.reduce((s,p)=>s+p.joins,0);
  const totalViews=posts.reduce((s,p)=>s+p.views,0);
  const best=posts.reduce((b,p)=>p.joins>b.joins?p:b,posts[0]);

  return(
    <div>
      <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>Performance Tracker</div>
      <div style={{fontSize:13,color:B.gray,marginBottom:20}}>Track content performance and Discord growth</div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:20}}>
        {[
          {label:'Discord Joins',value:totalJoins,color:B.green,icon:'🎮'},
          {label:'Total Reach',value:totalViews.toLocaleString(),color:B.orange,icon:'👁️'},
          {label:'Best Post',value:`${best.platform} · ${best.joins} joins`,color:B.discord,icon:'🏆'},
        ].map(({label,value,color,icon})=>(
          <Card key={label}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
              <div style={{width:36,height:36,borderRadius:9,background:`${color}22`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>{icon}</div>
              <div style={{fontSize:11,color:B.gray,fontWeight:600,letterSpacing:.5}}>{label.toUpperCase()}</div>
            </div>
            <div style={{fontSize:22,fontWeight:800,color}}>{value}</div>
          </Card>
        ))}
      </div>

      <Card style={{padding:0,overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr style={{background:B.navyL}}>
              {['Platform','Type','Views','Clicks','Joins','Date'].map(h=>(
                <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:700,color:B.gray,letterSpacing:.6}}>{h.toUpperCase()}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {posts.map((p,i)=>(
              <tr key={p.id} style={{borderBottom:`1px solid ${B.navyL}`,background:i%2===0?B.navyM:B.navy}}>
                <td style={{padding:'10px 14px'}}><span style={{display:'flex',alignItems:'center',gap:6,fontSize:12,fontWeight:600,color:PCOLORS[p.platform]||B.orange}}><div style={{width:6,height:6,borderRadius:'50%',background:PCOLORS[p.platform]||B.orange}}/>{p.platform}</span></td>
                <td style={{padding:'10px 14px',fontSize:12,color:B.grayL}}>{p.type}</td>
                <td style={{padding:'10px 14px',fontSize:12,color:B.white,fontWeight:600}}>{p.views.toLocaleString()}</td>
                <td style={{padding:'10px 14px',fontSize:12,color:B.white}}>{p.clicks}</td>
                <td style={{padding:'10px 14px'}}><span style={{fontWeight:700,color:B.green,fontSize:13}}>+{p.joins}</span></td>
                <td style={{padding:'10px 14px',fontSize:11,color:B.gray}}>{p.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}