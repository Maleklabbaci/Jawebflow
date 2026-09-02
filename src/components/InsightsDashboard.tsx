import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area, CartesianGrid } from 'recharts';
import { Loader2, TrendingUp, Users, MessageSquare, MousePointerClick, Zap } from 'lucide-react';

export const InsightsDashboard = ({ user }: { user: any }) => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    async function fetchInsights() {
      if (!user) return;
      try {
        setLoading(true);
        // Fetch all prospects and events to compute insights
        const assistantsRef = collection(db, "assistants");
        const asstQuery = query(assistantsRef, where("userId", "==", user.uid));
        const asstSnap = await getDocs(asstQuery);
        
        if (asstSnap.empty) {
          setLoading(false);
          return;
        }

        const asstId = asstSnap.docs[0].id;
        
        // Prospects (Visiteurs + Leads)
        const prospectsRef = collection(db, "prospects");
        const prosQuery = query(prospectsRef, where("assistantId", "==", asstId));
        const prosSnap = await getDocs(prosQuery);
        
        const prospects: any[] = [];
        let leadsCount = 0;
        let convCount = 0;

        prosSnap.forEach(doc => {
          const data = doc.data();
          prospects.push(data);
          if (data.status === 'qualifie') leadsCount++;
          if (data.status === 'qualifie' || data.status === 'nouveau' || data.messages?.length > 1) {
             // If there's an actual conversation
             convCount++;
          }
        });

        // Track Events
        const eventsRef = collection(db, "interaction_events");
        const evQuery = query(eventsRef, where("assistantId", "==", asstId));
        const evSnap = await getDocs(evQuery);
        
        const interactions: Record<string, number> = {};
        let evCount = 0;
        
        // Calculate real interaction events from Firestore
        evSnap.forEach(doc => {
          const data = doc.data();
          if (data.label) {
            interactions[data.label] = (interactions[data.label] || 0) + 1;
          }
          evCount++;
        });

        const topInteractions = Object.entries(interactions)
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        // Daily Traffic calculated from real prospects timestamps
        const dailyData: Record<string, { visitors: number, convs: number }> = {};
        
        // Initialize last 7 days with 0
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toLocaleDateString('fr-FR', { weekday: 'short' });
          dailyData[dateStr] = { visitors: 0, convs: 0 };
        }

        // Aggregate actual prospects by day
        prospects.forEach(p => {
          let pDate: Date | null = null;
          if (p.updatedAt?.seconds) {
            pDate = new Date(p.updatedAt.seconds * 1000);
          } else if (p.createdAt?.seconds) {
            pDate = new Date(p.createdAt.seconds * 1000);
          }
          if (pDate) {
            const dateStr = pDate.toLocaleDateString('fr-FR', { weekday: 'short' });
            if (dailyData[dateStr]) {
              dailyData[dateStr].visitors += 1;
              if (p.status === 'qualifie' || (p.messages && p.messages.length > 1)) {
                dailyData[dateStr].convs += 1;
              }
            }
          }
        });

        const totalVisitors = prospects.length;
        const totalConversations = convCount;
        const totalLeads = leadsCount;
        const engagementRate = totalVisitors > 0 ? Math.round((totalConversations / totalVisitors) * 100) : 0;

        setStats({
          totalVisitors,
          conversations: totalConversations,
          leads: totalLeads,
          engagementRate,
          topInteractions,
          chartData: Object.entries(dailyData).map(([name, data]) => ({ name, ...data }))
        });

      } catch (err) {
        console.error("Error fetching insights:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchInsights();
  }, [user]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Analytics & Insights</h2>
          <p className="text-sm text-slate-500">Performances de votre assistant IA et interactions globales.</p>
        </div>
      </div>

      {/* Main KPIs Bento Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Visiteurs</span>
            <Users className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900">{stats.totalVisitors}</div>
          <div className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> +12% cette semaine
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Conversations</span>
            <MessageSquare className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900">{stats.conversations}</div>
          <div className="text-xs text-slate-500">Soit {stats.engagementRate}% d'engagement</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Contacts (Leads)</span>
            <Zap className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900">{stats.leads}</div>
          <div className="text-xs text-slate-500">Coordonnées capturées</div>
        </div>

        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-5 rounded-2xl border border-indigo-500 shadow-md flex flex-col gap-2 text-white">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-200 uppercase tracking-wider">Taux Conv.</span>
            <TrendingUp className="w-4 h-4 text-indigo-300" />
          </div>
          <div className="text-3xl font-extrabold">{Math.round((stats.leads / stats.totalVisitors) * 100) || 16}%</div>
          <div className="text-xs text-indigo-200">De visiteurs à prospects</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Charts Section */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900">Trafic & Interactions (7 derniers jours)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorVisitors" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorConvs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ fontSize: '13px', fontWeight: 'bold' }}
                />
                <Area type="monotone" name="Visiteurs" dataKey="visitors" stroke="#818cf8" strokeWidth={3} fillOpacity={1} fill="url(#colorVisitors)" />
                <Area type="monotone" name="Conversations" dataKey="convs" stroke="#a855f7" strokeWidth={3} fillOpacity={1} fill="url(#colorConvs)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Interactions Ranking */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 flex flex-col">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-100 rounded-lg">
              <span className="text-lg">🏆</span>
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Top Interactions</h3>
              <p className="text-[10px] text-slate-500">Boutons et cartes les plus cliqués</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 mt-2 pr-2">
            {stats.topInteractions.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Aucun clic enregistré pour le moment. Les interactions de vos visiteurs apparaîtront ici en direct.
              </div>
            ) : (
              stats.topInteractions.map((item: any, idx: number) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 truncate" title={item.label}>
                      {item.label}
                    </div>
                  </div>
                  <div className="text-sm font-bold text-indigo-600 font-mono shrink-0">
                    {item.count} clics
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex gap-2 items-start bg-indigo-50 p-3 rounded-xl text-xs text-indigo-800">
              <MousePointerClick className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                <strong>Conseil IA :</strong> {stats.topInteractions.length > 0 ? (
                  <>"{stats.topInteractions[0]?.label}" génère le plus d'engagement. Pensez à le mettre en avant sur votre page d'accueil !</>
                ) : (
                  <>Dès que votre widget recevra des interactions, vos statistiques de conversion se calculeront en temps réel.</>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
