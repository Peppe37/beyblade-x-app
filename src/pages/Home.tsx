import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Users, Disc3, Zap, Plus, TrendingUp, Shield, Target, History } from 'lucide-react';
import { useBladers, useTournaments, useSettings } from '../store';
import { t } from '../types';
import { api } from '../services/api';

export default function Home() {
  const { bladers, fetchBladers } = useBladers();
  const { tournaments, fetchTournaments } = useTournaments();
  const { lang } = useSettings();
  const tr = t[lang];
  const navigate = useNavigate();

  const [activities, setActivities] = useState<any[]>([]);

  useEffect(() => {
    fetchBladers();
    fetchTournaments();
    api.getActivities()
      .then((res: any) => setActivities(res))
      .catch((err) => console.error(err));
  }, []);

  const activeTournaments = tournaments.filter((t) => t.status !== 'completed');

  const topBladers = [...bladers].sort((a, b) => b.wins - a.wins).slice(0, 3);

  const totalMatches = bladers.reduce((sum, b) => sum + b.wins + b.losses, 0) / 2;

  return (
    <div className="page-inner animate-fade-in">
      {/* Hero */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 40 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div className="bey-spin-icon" style={{ width: 48, height: 48 }} />
            <div>
              <h1 className="page-title" style={{ marginBottom: 0 }}>BEYBLADE X</h1>
              <p style={{ fontFamily: 'Orbitron', fontSize: '0.65rem', color: 'var(--secondary)', letterSpacing: 3, textTransform: 'uppercase' }}>
                Tournament Manager
              </p>
            </div>
          </div>
          <p className="page-subtitle">
            {lang === 'it'
              ? 'Gestisci i tuoi tornei locali con stile. Let it rip!'
              : 'Manage your local tournaments in style. Let it rip!'}
          </p>
          <div className="flex gap-sm flex-wrap">
            <button className="btn btn-primary" onClick={() => navigate('/tournaments')} id="btn-new-tournament">
              <Plus size={16} /> {tr.new_tournament}
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/bladers')} id="btn-go-bladers">
              <Users size={16} /> {tr.bladers}
            </button>
          </div>
        </div>
        {/* Decorative spinning bey */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 160, height: 160, flexShrink: 0 }}>
          <div style={{
            width: 140, height: 140, borderRadius: '50%',
            background: 'conic-gradient(from 0deg, var(--primary), var(--secondary), var(--accent), var(--primary))',
            animation: 'spin-bey 4s linear infinite',
            boxShadow: 'var(--shadow-neon), 0 0 60px rgba(0,212,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute',
              inset: 8, borderRadius: '50%',
              background: 'var(--bg-dark)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                inset: 8, borderRadius: '50%',
                background: 'conic-gradient(from 180deg, var(--secondary), var(--primary))',
                animation: 'spin-bey 2s linear infinite reverse',
                position: 'absolute',
              }} />
              <div style={{
                width: 16, height: 16, borderRadius: '50%',
                background: 'white', boxShadow: '0 0 16px white',
                position: 'relative', zIndex: 2,
              }} />
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom: 32 }}>
        <StatCard icon={<Users size={20} />} value={bladers.length} label={tr.bladers} color="var(--primary)" />
        <StatCard icon={<Trophy size={20} />} value={tournaments.length} label={tr.tournaments} color="var(--accent)" />
        <StatCard icon={<Zap size={20} />} value={activeTournaments.length} label={tr.active} color="var(--success)" />
        <StatCard icon={<Target size={20} />} value={Math.round(totalMatches)} label={lang === 'it' ? 'Battaglie' : 'Battles'} color="var(--secondary)" />
      </div>

      <div className="grid-2" style={{ gap: 24 }}>
        {/* Recent tournaments */}
        <div className="card">
          <div className="flex items-center justify-between mb-md">
            <h2 style={{ fontFamily: 'Orbitron', fontSize: '0.9rem', color: 'var(--text)' }}>
              <Trophy size={16} style={{ display: 'inline', marginRight: 8, color: 'var(--accent)' }} />
              {lang === 'it' ? 'Tornei Recenti' : 'Recent Tournaments'}
            </h2>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/tournaments')} id="btn-all-tournaments">
              {lang === 'it' ? 'Vedi tutti' : 'View all'}
            </button>
          </div>
          {tournaments.length === 0 ? (
            <div className="empty-state" style={{ padding: 24 }}>
              <div className="empty-state-icon">🏆</div>
              <p className="empty-state-text">{tr.no_tournaments}</p>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/tournaments')} id="btn-create-first">
                <Plus size={14} /> {tr.new_tournament}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tournaments.slice(0, 4).map((tournament) => (
                <div
                  key={tournament.id}
                  className="card card-interactive"
                  style={{ padding: '12px 16px', cursor: 'pointer' }}
                  onClick={() => navigate(`/tournaments/${tournament.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{tournament.name}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {tournament.format} · {tournament.blader_ids.length} {tr.participants}
                      </div>
                    </div>
                    <span className={`badge badge-${tournament.status === 'active' ? 'success' : tournament.status === 'lobby' ? 'primary' : 'muted'}`}>
                      {tr[tournament.status]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Bladers */}
        <div className="card">
          <div className="flex items-center justify-between mb-md">
            <h2 style={{ fontFamily: 'Orbitron', fontSize: '0.9rem', color: 'var(--text)' }}>
              <TrendingUp size={16} style={{ display: 'inline', marginRight: 8, color: 'var(--primary)' }} />
              {lang === 'it' ? 'Top Blader' : 'Top Bladers'}
            </h2>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/bladers')} id="btn-all-bladers">
              {lang === 'it' ? 'Vedi tutti' : 'View all'}
            </button>
          </div>
          {topBladers.length === 0 ? (
            <div className="empty-state" style={{ padding: 24 }}>
              <div className="empty-state-icon">👤</div>
              <p className="empty-state-text">{tr.no_bladers}</p>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/bladers')} id="btn-add-blader">
                <Plus size={14} /> {tr.new_blader}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topBladers.map((blader, i) => (
                <div key={blader.id} className="flex items-center gap-md" style={{ padding: '10px 0', borderBottom: i < topBladers.length - 1 ? '1px solid var(--border-2)' : 'none' }}>
                  <span style={{
                    fontFamily: 'Orbitron', fontSize: '1.1rem', fontWeight: 900, width: 28,
                    color: i === 0 ? 'var(--accent)' : i === 1 ? '#c0c0c0' : '#cd7f32',
                  }}>
                    {i + 1}
                  </span>
                  <div
                    className="avatar avatar-md"
                    style={{ background: blader.avatar_color, color: 'white' }}
                  >
                    {blader.avatar_image
                      ? <img src={blader.avatar_image} alt={blader.name} />
                      : blader.avatar_initials}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{blader.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {blader.wins}W · {blader.losses}L
                    </div>
                  </div>
                  <span style={{ fontFamily: 'Orbitron', fontSize: '1rem', color: 'var(--primary)', fontWeight: 700 }}>
                    {blader.points_total}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Activity Log */}
      <div className="card" style={{ marginTop: 24 }}>
        <h2 style={{ fontFamily: 'Orbitron', fontSize: '0.9rem', color: 'var(--text)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <History size={16} color="var(--primary)" />
          {lang === 'it' ? 'Cronologia Attività' : 'Activity History'}
        </h2>
        {activities.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {lang === 'it' ? 'Nessuna attività registrata' : 'No activity logged yet'}
          </div>
        ) : (
          <div className="custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto', paddingRight: '4px' }}>
            {activities.map((act) => {
              const date = new Date(act.created_at).toLocaleString(lang === 'it' ? 'it-IT' : 'en-US', {
                hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit'
              });
              let icon = '📝';
              let color = 'var(--text-muted)';
              if (act.event_type === 'versus') { icon = '⚔️'; color = 'var(--primary)'; }
              else if (act.event_type === 'tournament') { icon = '🏆'; color = 'var(--accent)'; }
              else if (act.event_type === 'blader') { icon = '👤'; color = 'var(--success)'; }
              else if (act.event_type === 'arena') { icon = '🏟️'; color = 'var(--secondary)'; }
              else if (act.event_type === 'beyblade') { icon = '🌀'; color = 'var(--primary)'; }

              return (
                <div key={act.id} style={{
                  display: 'flex', alignItems: 'center', gap: '16px',
                  padding: '10px 14px', background: 'var(--surface-2)', borderRadius: '8px',
                  borderLeft: `3px solid ${color}`, borderTop: '1px solid rgba(255,255,255,0.01)'
                }}>
                  <span style={{ fontSize: '1.2rem' }}>{icon}</span>
                  <div style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text)', textAlign: 'left' }}>
                    {lang === 'it' ? act.message_it : act.message_en}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'Orbitron' }}>
                    {date}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="card" style={{ marginTop: 24 }}>
        <h2 style={{ fontFamily: 'Orbitron', fontSize: '0.9rem', marginBottom: 16 }}>
          {lang === 'it' ? 'Accesso Rapido' : 'Quick Access'}
        </h2>
        <div className="grid-4" style={{ gap: 12 }}>
          {[
            { label: lang === 'it' ? 'Nuovo Blader' : 'New Blader', icon: <Users size={20} />, to: '/bladers', color: 'var(--primary)' },
            { label: lang === 'it' ? 'Database Bey' : 'Bey Database', icon: <Disc3 size={20} />, to: '/beys', color: 'var(--secondary)' },
            { label: lang === 'it' ? 'Arene' : 'Arenas', icon: <Shield size={20} />, to: '/arenas', color: 'var(--success)' },
            { label: lang === 'it' ? 'Nuovo Torneo' : 'New Tournament', icon: <Trophy size={20} />, to: '/tournaments', color: 'var(--accent)' },
          ].map(({ label, icon, to, color }) => (
            <button
              key={to}
              className="card card-interactive"
              style={{ cursor: 'pointer', padding: 16, textAlign: 'center', background: 'var(--surface-2)', border: `1px solid ${color}22` }}
              onClick={() => navigate(to)}
              id={`quick-${to.replace('/', '')}`}
            >
              <div style={{ color, marginBottom: 8 }}>{icon}</div>
              <div style={{ fontFamily: 'Orbitron', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text)' }}>{label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, value, label, color }: { icon: React.ReactNode; value: number; label: string; color: string }) {
  return (
    <div className="stat-card">
      <div style={{ color, marginBottom: 8 }}>{icon}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
