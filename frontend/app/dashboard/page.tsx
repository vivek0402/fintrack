'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { analyticsAPI, transactionsAPI, recurringAPI, budgetsAPI, aiAPI } from '@/lib/api';
import { getCurrentMonthYear } from '@/lib/utils';
import { AppLayout } from '@/components/layout/AppLayout';
import { Skeleton, SkeletonTitle, SkeletonCard, SkeletonCircle, SkeletonText } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { StatsCards } from '@/components/dashboard/StatsCards';
import { RecentTransactions } from '@/components/dashboard/RecentTransactions';
import { BudgetAlerts } from '@/components/dashboard/BudgetAlerts';
import { SpendingForecast } from '@/components/dashboard/SpendingForecast';

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

export default function DashboardPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const { month, year } = getCurrentMonthYear();
    const isMobile = useIsMobile();

    const [summary, setSummary] = useState<any>(null);
    const [trends, setTrends] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [budgets, setBudgets] = useState<any[]>([]);
    const [forecast, setForecast] = useState<any>(null);
    const [dataLoading, setDataLoading] = useState(true);

    const [salaryData, setSalaryData] = useState<any>(null);
    const [salaryBannerDismissed, setSalaryBannerDismissed] = useState(false);

    const [aiReport, setAiReport] = useState('');
    const [aiReportLoading, setAiReportLoading] = useState(false);


    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    useEffect(() => {
        const key = `salary-banner-dismissed-${month}-${year}`;
        setSalaryBannerDismissed(localStorage.getItem(key) === 'true');
    }, [month, year]);

    useEffect(() => {
        if (!user) return;
        const fetchData = async () => {
            setDataLoading(true);
            try {
                await recurringAPI.process();
                const [summaryRes, trendsRes, txRes, budgetsRes, forecastRes] = await Promise.all([
                    analyticsAPI.summary({ month, year }),
                    analyticsAPI.trends(),
                    transactionsAPI.getAll({ month, year }),
                    budgetsAPI.getAll({ month, year }),
                    analyticsAPI.forecast({ month, year }),
                ]);
                setSummary(summaryRes.data.summary);
                setCategories(summaryRes.data.category_breakdown);
                setTrends(trendsRes.data.trends);
                setTransactions(txRes.data.transactions);
                setBudgets(budgetsRes.data.budgets);
                setForecast(forecastRes.data.forecast);
            } catch (err) { console.error(err); }
            finally { setDataLoading(false); }
        };
        fetchData();

        aiAPI.salaryIntelligence().then(res => {
            if (res.data.detected) setSalaryData(res.data);
        }).catch(() => { });
    }, [user]);

    const handleGenerateReport = async () => {
        setAiReportLoading(true);
        try {
            const res = await aiAPI.report();
            setAiReport(res.data.report);
        } catch {
            setAiReport('Unable to generate report right now. Please try again.');
        } finally {
            setAiReportLoading(false);
        }
    };


    // Build sparkline data (last 6 months) from raw trends
    const sparklineData = (() => {
        const map: Record<string, { month: number; year: number; income: number; expenses: number }> = {};
        trends.forEach(row => {
            const key = `${row.year}-${String(row.month).padStart(2, '0')}`;
            if (!map[key]) map[key] = { month: row.month, year: row.year, income: 0, expenses: 0 };
            if (row.type === 'income') map[key].income = parseFloat(row.total);
            if (row.type === 'expense') map[key].expenses = parseFloat(row.total);
        });
        return Object.values(map)
            .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
            .slice(-6);
    })();
    const sparkMax = Math.max(...sparklineData.flatMap(d => [d.income, d.expenses]), 1);

    const sortedCategories = categories && categories.length > 0
        ? [...categories].sort((a, b) => parseFloat(b.total ?? b.value ?? 0) - parseFloat(a.total ?? a.value ?? 0))
        : [];
    const topCategory = sortedCategories.length > 0 ? sortedCategories[0] : null;
    const totalCatExpenses = categories?.reduce((sum, c) => sum + parseFloat(c.total ?? c.value ?? 0), 0) ?? 0;
    const topCategoryAmt = topCategory ? parseFloat(topCategory.total ?? topCategory.value ?? 0) : 0;
    const topCategoryPct = topCategory && totalCatExpenses > 0 ? Math.round((topCategoryAmt / totalCatExpenses) * 100) : 0;

    if (isLoading || !user) return (
        <AppLayout>
            <div style={{ marginBottom: '24px' }}>
                <SkeletonTitle />
                <Skeleton width="40%" height={14} borderRadius={4} style={{ marginTop: '8px' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                {[1, 2, 3, 4].map(i => <SkeletonCard key={i} height={90} />)}
            </div>
            <SkeletonCard height={110} style={{ marginBottom: '12px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px', marginBottom: '16px' }}>
                <SkeletonCard height={200} />
                <SkeletonCard height={200} />
            </div>
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '20px' }}>
                <Skeleton width="30%" height={16} borderRadius={4} style={{ marginBottom: '16px' }} />
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '12px', paddingBottom: '12px', borderBottom: i < 5 ? '1px solid var(--bg-border)' : 'none' }}>
                        <SkeletonCircle size={40} />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <SkeletonText />
                            <Skeleton width="50%" height={12} borderRadius={4} />
                        </div>
                        <Skeleton width={72} height={16} borderRadius={4} />
                    </div>
                ))}
            </div>
        </AppLayout>
    );

    const dismissSalaryBanner = () => {
        const key = `salary-banner-dismissed-${month}-${year}`;
        localStorage.setItem(key, 'true');
        setSalaryBannerDismissed(true);
    };

    // ── HERO CARD ──
    const HeroCard = () => isMobile ? (
        /* ── MOBILE HERO CARD ── */
        <div style={{background:'linear-gradient(160deg,#0a0f1e 0%,#0d1628 60%,#080d1a 100%)',borderRadius:20,border:'1px solid rgba(255,255,255,0.06)',padding:'20px',position:'relative',overflow:'hidden',marginBottom:12}}>

            {/* Ambient glows */}
            <div style={{position:'absolute',bottom:-40,left:-20,width:180,height:180,background:'radial-gradient(circle,rgba(16,185,129,0.10),transparent 70%)',borderRadius:'50%',pointerEvents:'none'}}/>
            <div style={{position:'absolute',bottom:-40,right:-20,width:180,height:180,background:'radial-gradient(circle,rgba(244,63,94,0.08),transparent 70%)',borderRadius:'50%',pointerEvents:'none'}}/>
            <div style={{position:'absolute',top:-30,right:-30,width:140,height:140,background:'radial-gradient(circle,rgba(59,130,246,0.07),transparent 70%)',borderRadius:'50%',pointerEvents:'none'}}/>

            {/* ── SECTION 1: Net Worth + mini income/expense stats ── */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',position:'relative',zIndex:1}}>
                <div>
                    <div style={{fontSize:10,color:'#4a5568',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Net worth</div>
                    <div style={{fontSize:38,fontWeight:800,color:'#f0f4ff',letterSpacing:'-0.03em',lineHeight:1}}>
                        {'₹' + Math.round((summary?.total_income ?? 0) - (summary?.total_expenses ?? 0)).toLocaleString('en-IN')}
                    </div>
                    <div style={{marginTop:8,display:'inline-block',padding:'4px 12px',borderRadius:20,background:'rgba(16,185,129,0.12)',color:'#10b981',fontSize:12,fontWeight:600}}>
                        {'+₹' + Math.round((summary?.total_income ?? 0) - (summary?.total_expenses ?? 0)).toLocaleString('en-IN') + ' this month'}
                    </div>
                    <div style={{fontSize:11,color:'#4a5568',marginTop:6}}>
                        {new Date().toLocaleString('default',{month:'long'})} {new Date().getFullYear()}
                    </div>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:10,alignItems:'flex-end'}}>
                    <div style={{textAlign:'right'}}>
                        <div style={{fontSize:10,color:'#4a5568',marginBottom:2}}>Income</div>
                        <div style={{fontSize:13,fontWeight:700,color:'#10b981'}}>{'₹'+Math.round(summary?.total_income ?? 0).toLocaleString('en-IN')}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                        <div style={{fontSize:10,color:'#4a5568',marginBottom:2}}>Expenses</div>
                        <div style={{fontSize:13,fontWeight:700,color:'#f43f5e'}}>{'₹'+Math.round(summary?.total_expenses ?? 0).toLocaleString('en-IN')}</div>
                    </div>
                </div>
            </div>

            {/* ── SECTION 2: Neon line chart ── */}
            {(() => {
                const raw = (sparklineData||[]).slice(-6);
                const padded: {income:number,expenses:number,month?:number}[] = Array(6).fill(null).map((_,i) => raw[i-(6-raw.length)] || {income:0,expenses:0});
                const maxVal = Math.max(...padded.flatMap(m => [m.income||0, m.expenses||0]), 1);
                const W=340, H=72, pad=6;
                const toY = (v:number) => pad + (1-(v/maxVal))*(H-pad*2);
                const xs = [0,68,136,204,272,340];
                const incPts = padded.map((m,i):[number,number] => [xs[i], toY(m.income||0)]);
                const expPts = padded.map((m,i):[number,number] => [xs[i], toY(m.expenses||0)]);
                const curve = (pts:[number,number][]) => {
                    if(!pts.length) return '';
                    let d=`M${pts[0][0]},${pts[0][1]}`;
                    for(let i=0;i<pts.length-1;i++){
                        const cpx=pts[i][0]+(pts[i+1][0]-pts[i][0])*0.5;
                        d+=` C${cpx},${pts[i][1]} ${cpx},${pts[i+1][1]} ${pts[i+1][0]},${pts[i+1][1]}`;
                    }
                    return d;
                };
                const ip=curve(incPts), ep=curve(expPts);
                const monthLabels = padded.map((m,i) => {
                    if(m.month) return new Date(0,m.month-1).toLocaleString('default',{month:'short'});
                    const d=new Date(); d.setMonth(d.getMonth()-(5-i));
                    return d.toLocaleString('default',{month:'short'});
                });
                return (
                    <div style={{position:'relative',zIndex:1,marginTop:16}}>
                        <div style={{fontSize:10,color:'#4a5568',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>6-month trend</div>
                        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{display:'block',overflow:'visible'}}>
                            <defs>
                                <filter id="mgneon"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                                <filter id="mrneon"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                                <linearGradient id="mig" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity="0.18"/><stop offset="100%" stopColor="#10b981" stopOpacity="0"/></linearGradient>
                                <linearGradient id="meg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f43f5e" stopOpacity="0.13"/><stop offset="100%" stopColor="#f43f5e" stopOpacity="0"/></linearGradient>
                            </defs>
                            {[0.25,0.5,0.75].map((r,i)=><line key={i} x1="0" y1={pad+r*(H-pad*2)} x2={W} y2={pad+r*(H-pad*2)} stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>)}
                            <path d={ip+` L${W},${H} L0,${H} Z`} fill="url(#mig)"/>
                            <path d={ep+` L${W},${H} L0,${H} Z`} fill="url(#meg)"/>
                            <path d={ip} fill="none" stroke="rgba(16,185,129,0.22)" strokeWidth="5" strokeLinecap="round"/>
                            <path d={ep} fill="none" stroke="rgba(244,63,94,0.18)" strokeWidth="5" strokeLinecap="round"/>
                            <path d={ip} fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" filter="url(#mgneon)"/>
                            <path d={ep} fill="none" stroke="#f43f5e" strokeWidth="1.8" strokeLinecap="round" filter="url(#mrneon)"/>
                            {incPts.map(([x,y],i)=><circle key={i} cx={x} cy={y} r={i===5?4:2.5} fill="#10b981" filter="url(#mgneon)"/>)}
                            {expPts.map(([x,y],i)=><circle key={i} cx={x} cy={y} r={i===5?4:2.5} fill="#f43f5e" filter="url(#mrneon)"/>)}
                            <line x1={W} y1="0" x2={W} y2={H} stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="3 3"/>
                        </svg>
                        <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
                            {monthLabels.map((m,i)=><span key={i} style={{fontSize:9,color:i===5?'#f0f4ff':'#4a5568',fontWeight:i===5?600:400}}>{m}</span>)}
                        </div>
                        <div style={{display:'flex',gap:14,marginTop:8}}>
                            <div style={{display:'flex',alignItems:'center',gap:5}}>
                                <div style={{width:8,height:8,borderRadius:'50%',background:'#10b981',boxShadow:'0 0 6px #10b981'}}/>
                                <span style={{fontSize:11,color:'#8892aa'}}>Income</span>
                            </div>
                            <div style={{display:'flex',alignItems:'center',gap:5}}>
                                <div style={{width:8,height:8,borderRadius:'50%',background:'#f43f5e',boxShadow:'0 0 6px #f43f5e'}}/>
                                <span style={{fontSize:11,color:'#8892aa'}}>Expenses</span>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* divider */}
            <div style={{height:1,background:'rgba(255,255,255,0.06)',margin:'16px 0'}}/>

            {/* ── SECTION 3: Top Spending ── */}
            {(() => {
                const sorted = [...(categories||[])].sort((a,b)=>parseFloat(b.total??b.value??0)-parseFloat(a.total??a.value??0));
                const top = sorted[0];
                if(!top) return null;
                const totalExp = (categories||[]).reduce((s:number,c:any)=>s+parseFloat(c.total??c.value??0),0);
                const topAmt = parseFloat(top.total??top.value??0);
                const pct = totalExp>0 ? Math.round((topAmt/totalExp)*100) : 0;
                return (
                    <div style={{position:'relative',zIndex:1}}>
                        <div style={{fontSize:10,color:'#4a5568',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>Top spending</div>
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                            <div style={{width:32,height:32,borderRadius:10,background:'rgba(244,63,94,0.12)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                                <div style={{width:10,height:10,borderRadius:'50%',background:top.color||'#f43f5e',boxShadow:`0 0 8px ${top.color||'#f43f5e'}`}}/>
                            </div>
                            <div style={{flex:1,minWidth:0}}>
                                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5}}>
                                    <span style={{fontSize:13,color:'#c8d4f0',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{top.name}</span>
                                    <span style={{fontSize:13,color:'#f43f5e',fontWeight:700,flexShrink:0,marginLeft:8}}>{'₹'+Math.round(topAmt).toLocaleString('en-IN')}</span>
                                </div>
                                <div style={{height:4,borderRadius:2,background:'rgba(255,255,255,0.07)',overflow:'hidden'}}>
                                    <div style={{height:'100%',width:pct+'%',maxWidth:'100%',background:'linear-gradient(90deg,#f43f5e,#f97316)',borderRadius:2}}/>
                                </div>
                                <div style={{fontSize:10,color:'#8892aa',marginTop:3}}>{pct}% of total expenses</div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* divider */}
            <div style={{height:1,background:'rgba(255,255,255,0.06)',margin:'16px 0'}}/>

            {/* ── SECTION 4: AI Insight ── */}
            <div style={{position:'relative',zIndex:1}}>
                <div style={{fontSize:10,color:'#4a5568',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8,display:'flex',alignItems:'center',gap:6}}>
                    <span style={{color:'#a78bfa',fontSize:13}}>✦</span>
                    <span>AI insight</span>
                </div>
                <div style={{fontSize:13,color:'#c8d4f0',lineHeight:1.6,marginBottom:12,padding:'10px 12px',background:'rgba(167,139,250,0.06)',borderRadius:10,borderLeft:'2px solid rgba(167,139,250,0.3)'}}>
                    {aiReport || 'Tap generate to get your monthly AI summary.'}
                </div>
                <button
                    onClick={handleGenerateReport}
                    style={{width:'100%',background:'linear-gradient(135deg,#1d4ed8,#3b82f6)',color:'white',border:'none',borderRadius:10,padding:'10px',fontSize:13,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}
                >
                    <span style={{fontSize:14}}>✦</span> Generate Report
                </button>
            </div>

        </div>
    ) : (
        /* ── DESKTOP HERO CARD (3-column) ── */
        <div style={{
            background: 'linear-gradient(135deg,#0a0f1e 0%,#0f1629 50%,#0a1225 100%)',
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.06)',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'stretch',
            gap: 0,
            position: 'relative',
            overflow: 'hidden',
            marginBottom: 12,
        }}>

            {/* Decorative glow */}
            <div style={{position:'absolute',top:-60,right:-60,width:200,height:200,background:'radial-gradient(circle,rgba(59,130,246,0.07),transparent 70%)',borderRadius:'50%',pointerEvents:'none'}} />

            {/* ── LEFT: This Month ── */}
            <div style={{width: 200, flexShrink: 0, paddingRight: 24}}>
                <div style={{fontSize:10,color:'#4a5568',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>This month</div>
                <div style={{fontSize:34,fontWeight:800,color:'#f0f4ff',letterSpacing:'-0.03em',lineHeight:1}}>
                    {'₹' + Math.round((summary?.total_income ?? 0) - (summary?.total_expenses ?? 0)).toLocaleString('en-IN')}
                </div>
                <div style={{marginTop:8,display:'inline-block',padding:'3px 10px',borderRadius:20,background:'rgba(16,185,129,0.12)',color:'#10b981',fontSize:12,fontWeight:600}}>
                    +{'₹' + Math.round((summary?.total_income ?? 0) - (summary?.total_expenses ?? 0)).toLocaleString('en-IN')} this month
                </div>
                <div style={{marginTop:10,fontSize:12,color:'#4a5568'}}>
                    {'₹' + Math.round(summary?.total_income ?? 0).toLocaleString('en-IN')} in · {'₹' + Math.round(summary?.total_expenses ?? 0).toLocaleString('en-IN')} out
                </div>
            </div>

            {/* Divider */}
            <div style={{width:1,background:'rgba(255,255,255,0.07)',flexShrink:0,alignSelf:'stretch'}} />

            {/* ── MIDDLE: Trend + Top Spending ── */}
            <div style={{flex:1,paddingLeft:24,paddingRight:24,minWidth:0,overflow:'hidden'}}>

                {/* Sparkline label */}
                <div style={{fontSize:10,color:'#4a5568',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>6-month trend</div>

                {/* Sparkline bar chart */}
                {(() => {
                    const data = sparklineData && sparklineData.length > 0 ? sparklineData.slice(-6) : [];
                    const maxVal = Math.max(...data.flatMap(m => [m.income || 0, m.expenses || 0]), 1);
                    const months = ['Oct','Nov','Dec','Jan','Feb','Mar'];
                    const padded = Array(6).fill(null).map((_: null, i: number) => data[i - (6 - data.length)] || { income: 0, expenses: 0 });
                    return (
                        <div>
                            <div style={{display:'flex',flexDirection:'row',alignItems:'flex-end',height:44,width:'100%',gap:4}}>
                                {padded.map((m: {income:number,expenses:number}, i: number) => (
                                    <div key={i} style={{flex:1,display:'flex',flexDirection:'row',alignItems:'flex-end',gap:2}}>
                                        <div style={{
                                            flex:1,
                                            height: Math.max(4, Math.round(((m.income||0) / maxVal) * 44)) + 'px',
                                            background:'linear-gradient(180deg,#10b981,rgba(16,185,129,0.25))',
                                            borderRadius:'2px 2px 0 0',
                                        }} />
                                        <div style={{
                                            flex:1,
                                            height: Math.max(4, Math.round(((m.expenses||0) / maxVal) * 44)) + 'px',
                                            background:'linear-gradient(180deg,#f43f5e,rgba(244,63,94,0.25))',
                                            borderRadius:'2px 2px 0 0',
                                        }} />
                                    </div>
                                ))}
                            </div>
                            <div style={{display:'flex',flexDirection:'row',justifyContent:'space-between',marginTop:4}}>
                                {months.map(m => <span key={m} style={{fontSize:9,color:'#4a5568'}}>{m}</span>)}
                            </div>
                        </div>
                    );
                })()}

                {/* Top Spending */}
                <div style={{marginTop:14}}>
                    <div style={{fontSize:10,color:'#4a5568',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>Top spending</div>
                    {(() => {
                        const sorted = [...(categories || [])].sort((a,b) => parseFloat(b.total ?? b.value ?? 0) - parseFloat(a.total ?? a.value ?? 0));
                        const top = sorted[0];
                        if (!top) return <div style={{fontSize:12,color:'#4a5568'}}>No spending data yet</div>;
                        const totalExp = (categories||[]).reduce((s: number, c: any) => s + parseFloat(c.total ?? c.value ?? 0), 0);
                        const amt = parseFloat(top.total ?? top.value ?? 0);
                        const pct = totalExp > 0 ? Math.round((amt / totalExp) * 100) : 0;
                        return (
                            <div style={{display:'flex',alignItems:'center',gap:8,overflow:'hidden'}}>
                                <div style={{flex:1,minWidth:0,overflow:'hidden'}}>
                                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
                                        <div style={{width:8,height:8,borderRadius:'50%',background:top.color||'#f43f5e',flexShrink:0}} />
                                        <span style={{fontSize:12,color:'#c8d4f0',fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{top.name}</span>
                                        <span style={{fontSize:10,color:'#8892aa',flexShrink:0}}>{pct}% of expenses</span>
                                    </div>
                                    <div style={{height:3,borderRadius:2,background:'rgba(255,255,255,0.08)',overflow:'hidden'}}>
                                        <div style={{height:'100%',width:pct+'%',maxWidth:'100%',background:'linear-gradient(90deg,#f43f5e,#f97316)',borderRadius:2}} />
                                    </div>
                                </div>
                                <div style={{fontSize:12,color:'#f43f5e',fontWeight:600,flexShrink:0}}>
                                    {'₹' + Math.round(amt).toLocaleString('en-IN')}
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* Divider */}
            <div style={{width:1,background:'rgba(255,255,255,0.07)',flexShrink:0,alignSelf:'stretch'}} />

            {/* ── RIGHT: AI Insight ── */}
            <div style={{width:260,flexShrink:0,paddingLeft:24}}>
                <div style={{fontSize:10,color:'#4a5568',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8,display:'flex',alignItems:'center',gap:6}}>
                    <span>✦</span><span>AI insight</span>
                </div>
                <div style={{fontSize:13,color:'#c8d4f0',lineHeight:1.55,marginBottom:12}}>
                    {aiReport || 'Tap generate to get your monthly AI summary.'}
                </div>
                <button
                    onClick={handleGenerateReport}
                    style={{background:'linear-gradient(135deg,#1d4ed8,#3b82f6)',color:'white',border:'none',borderRadius:8,padding:'8px 14px',fontSize:13,fontWeight:600,cursor:'pointer',width:'100%'}}
                >
                    Generate Report
                </button>
            </div>

        </div>
    );

    return (

        <AppLayout>
            {/* Salary Banner */}
            {salaryData && !salaryBannerDismissed && salaryData.plan && (
                <div style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(59,130,246,0.06))', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '16px', padding: '16px 20px', marginBottom: '16px', position: 'relative' }}>
                    <button onClick={dismissSalaryBanner} style={{ position: 'absolute', top: '12px', right: '12px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>✕</button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                        <span style={{ fontSize: '1.1rem' }}>💰</span>
                        <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.9rem', fontWeight: 600, color: 'var(--accent-green)' }}>Salary Detected — AI Allocation Plan</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '4px' }}>{salaryData.description} · ₹{salaryData.salary?.toLocaleString('en-IN')}</span>
                    </div>
                    {salaryData.insight && <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 12px 0', lineHeight: 1.5 }}>{salaryData.insight}</p>}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
                        {Object.entries(salaryData.plan).map(([key, val]: [string, any]) => (
                            <div key={key} style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '10px', padding: '10px 12px' }}>
                                <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: '0 0 3px 0', textTransform: 'capitalize' }}>{key}</p>
                                <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent-green)', margin: 0 }}>₹{val.amount?.toLocaleString('en-IN')}</p>
                                <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>{val.percentage}%</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Page header */}
            <div style={{ marginBottom: '16px' }}>
                <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.4rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Dashboard</h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '4px 0 0 0' }}>{MONTH_NAMES[month]} {year} — Overview</p>
            </div>

            {/* ── DESKTOP BENTO GRID ── */}
            {!isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Row 1 — Stat tiles */}
                    {dataLoading ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                            {[1, 2, 3, 4].map(i => <div key={i} style={{ background: 'var(--bg-card)', border: '0.5px solid var(--bg-border)', borderRadius: '14px', height: '90px' }} />)}
                        </div>
                    ) : summary && (
                        <StatsCards totalIncome={summary.total_income} totalExpenses={summary.total_expenses} balance={summary.balance} savingsRate={summary.savings_rate} currency={user.currency} month={month} year={year} />
                    )}

                    {/* Row 2 — Hero card */}
                    <HeroCard />

                    {/* Row 3 — Budget tile */}
                    <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--bg-border)', borderRadius: '12px', padding: '20px', overflow: 'hidden' }}>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 14px 0', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Budgets</p>
                        {budgets.length > 0
                            ? <BudgetAlerts budgets={budgets} currency={user.currency} />
                            : <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>All budgets on track ✅</p>
                        }
                    </div>

                    {/* Row 5 — Recent + Forecast */}
                    <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '12px' }}>
                        <RecentTransactions transactions={transactions} currency={user.currency} />
                        <SpendingForecast forecast={forecast} currency={user.currency} />
                    </div>
                </div>
            ) : (
                /* ── MOBILE STACK ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Stats 2x2 */}
                    {dataLoading ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            {[1, 2, 3, 4].map(i => <div key={i} style={{ background: 'var(--bg-card)', border: '0.5px solid var(--bg-border)', borderRadius: '14px', height: '80px' }} />)}
                        </div>
                    ) : summary && (
                        <StatsCards totalIncome={summary.total_income} totalExpenses={summary.total_expenses} balance={summary.balance} savingsRate={summary.savings_rate} currency={user.currency} month={month} year={year} />
                    )}

                    {/* Hero */}
                    <HeroCard />


                    {/* Budgets */}
                    <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--bg-border)', borderRadius: '12px', padding: '20px', overflow: 'hidden' }}>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 14px 0', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Budgets</p>
                        {budgets.length > 0
                            ? <BudgetAlerts budgets={budgets} currency={user.currency} />
                            : <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>All budgets on track ✅</p>
                        }
                    </div>

                    {/* Recent Transactions */}
                    <RecentTransactions transactions={transactions} currency={user.currency} />

                    {/* Forecast */}
                    <SpendingForecast forecast={forecast} currency={user.currency} />
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </AppLayout>
    );
}
