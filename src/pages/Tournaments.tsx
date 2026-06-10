import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trophy, Zap, ChevronRight, Search } from 'lucide-react';
import { useTournaments, useBladers, useSettings, useArenas, useToast } from '../store';
import { t, BATTLE_MODE_LABELS, BATTLE_MODE_DESC, BattleMode } from '../types';
import { ARENAS } from '../data/arenas';
import Modal from '../components/common/Modal';

const MODES: BattleMode[] = ['1on1', '3on3', 'deck', 'team'];

export default function Tournaments() {
  const { tournaments, fetchTournaments, createTournament } = useTournaments();
  const { bladers, fetchBladers } = useBladers();
  const { lang } = useSettings();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const tr = t[lang];

  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [form, setForm] = useState({
    name: '',
    format: '1on1' as BattleMode,
    arena: 'xtreme',
    point_threshold: 4,
    blader_ids: [] as string[],
  });

  const { customArenas, fetchCustomArenas } = useArenas();

  useEffect(() => {
    fetchTournaments();
    fetchBladers();
    fetchCustomArenas();
  }, []);

  const openWizard = () => {
    setStep(0);
    setForm({ name: '', format: '1on1', arena: 'xtreme', point_threshold: 4, blader_ids: [] });
    setSearchQuery('');
    setShowWizard(true);
  };

  const allArenas = [...ARENAS, ...customArenas];

  const handleCreate = async () => {
    if (!form.name.trim() || form.blader_ids.length < 2) return;
    try {
      const t = await createTournament(form);
      addToast(lang === 'it' ? 'Torneo creato!' : 'Tournament created!');
      setShowWizard(false);
      navigate(`/tournaments/${t.id}`);
    } catch {
      addToast(lang === 'it' ? 'Errore nella creazione' : 'Error creating tournament', 'error');
    }
  };

  const toggleBlader = (id: string) => {
    setForm((f) => ({
      ...f,
      blader_ids: f.blader_ids.includes(id)
        ? f.blader_ids.filter((b) => b !== id)
        : [...f.blader_ids, id],
    }));
  };

  const active = tournaments.filter((t) => t.status !== 'completed');
  const completed = tournaments.filter((t) => t.status === 'completed');

  return (
    <div className="page-inner animate-fade-in">
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <div>
          <h1 className="page-title">{tr.tournaments}</h1>
          <p className="page-subtitle">
            {lang === 'it' ? `${tournaments.length} tornei totali` : `${tournaments.length} total tournaments`}
          </p>
        </div>
        <button className="btn btn-primary" onClick={openWizard} id="btn-new-tournament">
          <Plus size={16} /> {tr.new_tournament}
        </button>
      </div>

      {tournaments.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-icon">🏆</div>
          <div className="empty-state-title">{tr.no_tournaments}</div>
          <p className="empty-state-text">
            {lang === 'it' ? 'Crea il tuo primo torneo Beyblade X!' : 'Create your first Beyblade X tournament!'}
          </p>
          <button className="btn btn-primary" onClick={openWizard} id="btn-empty-create">
            <Plus size={16} /> {tr.new_tournament}
          </button>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <>
              <h2 style={{ fontFamily: 'Orbitron', fontSize: '0.85rem', color: 'var(--success)', marginBottom: 12, textTransform: 'uppercase' }}>
                {lang === 'it' ? '⚡ Attivi' : '⚡ Active'}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {active.map((t) => <TournamentRow key={t.id} tournament={t} lang={lang} onClick={() => navigate(`/tournaments/${t.id}`)} />)}
              </div>
            </>
          )}
          {completed.length > 0 && (
            <>
              <h2 style={{ fontFamily: 'Orbitron', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase' }}>
                {lang === 'it' ? '✓ Completati' : '✓ Completed'}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {completed.map((t) => <TournamentRow key={t.id} tournament={t} lang={lang} onClick={() => navigate(`/tournaments/${t.id}`)} />)}
              </div>
            </>
          )}
        </>
      )}

      {/* Tournament Creation Wizard */}
      {showWizard && (
        <Modal
          title={lang === 'it' ? 'Crea Torneo' : 'Create Tournament'}
          onClose={() => setShowWizard(false)}
          maxWidth={600}
        >
          {/* Step indicator */}
          <div className="steps" style={{ marginBottom: 28 }}>
            {[
              lang === 'it' ? 'Dettagli' : 'Details',
              lang === 'it' ? 'Formato' : 'Format',
              lang === 'it' ? 'Blader' : 'Bladers',
            ].map((_label, i) => (
              <div key={i} className={`step ${i < step ? 'done' : i === step ? 'active' : ''}`}>
                <div className="step-circle">{i < step ? '✓' : i + 1}</div>
                {i < 2 && <div className="step-line" />}
              </div>
            ))}
          </div>

          {/* Step 0: Name + Arena */}
          {step === 0 && (
            <div className="animate-fade-in">
              <div className="form-group">
                <label className="form-label">{lang === 'it' ? 'Nome Torneo' : 'Tournament Name'}</label>
                <input
                  className="form-input"
                  placeholder={lang === 'it' ? 'Es. Campionato Estivo 2025' : 'e.g. Summer Championship 2025'}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  autoFocus
                  id="tournament-name"
                />
              </div>
              <div className="form-group">
                <label className="form-label">{tr.arena}</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {allArenas.map((a) => (
                    <label
                      key={a.id}
                      className="card"
                      style={{
                        cursor: 'pointer', padding: '12px 16px',
                        borderColor: form.arena === a.id ? a.color : 'var(--border)',
                        display: 'flex', alignItems: 'center', gap: 12,
                        marginBottom: 0, boxShadow: 'none',
                      }}
                      id={`arena-opt-${a.id}`}
                    >
                      <input
                        type="radio"
                        name="arena"
                        value={a.id}
                        checked={form.arena === a.id}
                        onChange={() => setForm((f) => ({ ...f, arena: a.id }))}
                        style={{ display: 'none' }}
                      />
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: a.color, boxShadow: `0 0 8px ${a.color}`, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontFamily: 'Orbitron', fontSize: '0.8rem', fontWeight: 700, color: form.arena === a.id ? a.color : 'var(--text)' }}>{a.name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{a.tags.join(' · ')}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-sm" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setShowWizard(false)} id="wizard-cancel">{tr.cancel}</button>
                <button className="btn btn-primary" onClick={() => setStep(1)} disabled={!form.name.trim()} id="wizard-step1-next">
                  {lang === 'it' ? 'Avanti' : 'Next'} →
                </button>
              </div>
            </div>
          )}

          {/* Step 1: Format + Points */}
          {step === 1 && (
            <div className="animate-fade-in">
              <div className="form-group">
                <label className="form-label">{tr.format}</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {MODES.map((mode) => (
                    <label
                      key={mode}
                      className="card"
                      style={{
                        cursor: 'pointer', padding: '12px 16px',
                        borderColor: form.format === mode ? 'var(--primary)' : 'var(--border)',
                        background: form.format === mode ? 'rgba(0,212,255,0.06)' : 'var(--surface-2)',
                        display: 'flex', alignItems: 'flex-start', gap: 12,
                        marginBottom: 0, boxShadow: 'none',
                      }}
                      id={`mode-${mode}`}
                    >
                      <input
                        type="radio"
                        name="format"
                        value={mode}
                        checked={form.format === mode}
                        onChange={() => setForm((f) => ({ ...f, format: mode }))}
                        style={{ display: 'none' }}
                      />
                      <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${form.format === mode ? 'var(--primary)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                        {form.format === mode && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)' }} />}
                      </div>
                      <div>
                        <div style={{ fontFamily: 'Orbitron', fontSize: '0.8rem', fontWeight: 700, color: form.format === mode ? 'var(--primary)' : 'var(--text)' }}>
                          {BATTLE_MODE_LABELS[mode]}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{BATTLE_MODE_DESC[mode]}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{tr.point_threshold}</label>
                <div className="flex gap-sm">
                  {[4, 7].map((pts) => (
                    <button
                      key={pts}
                      className={`btn ${form.point_threshold === pts ? 'btn-primary' : 'btn-secondary'} flex-1`}
                      onClick={() => setForm((f) => ({ ...f, point_threshold: pts }))}
                      id={`pts-${pts}`}
                    >
                      <Zap size={14} /> {pts} {lang === 'it' ? 'punti' : 'points'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-sm" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setStep(0)} id="wizard-back-0">← {lang === 'it' ? 'Indietro' : 'Back'}</button>
                <button className="btn btn-primary" onClick={() => setStep(2)} id="wizard-step2-next">{lang === 'it' ? 'Avanti' : 'Next'} →</button>
              </div>
            </div>
          )}

          {/* Step 2: Select bladers */}
          {step === 2 && (
            <div className="animate-fade-in">
              <div className="form-label" style={{ marginBottom: 12 }}>
                {tr.select_bladers} ({form.blader_ids.length} {lang === 'it' ? 'selezionati' : 'selected'})
              </div>
              {bladers.length === 0 ? (
                <div className="empty-state" style={{ padding: 24 }}>
                  <p style={{ color: 'var(--text-muted)' }}>
                    {lang === 'it' ? 'Nessun blader disponibile. Aggiungine prima!' : 'No bladers available. Add some first!'}
                  </p>
                </div>
              ) : (
                <>
                  <div style={{ position: 'relative', marginBottom: 12 }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      className="form-input"
                      placeholder={lang === 'it' ? 'Cerca blader...' : 'Search blader...'}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{ paddingLeft: 32, fontSize: '0.8rem' }}
                      id="search-wizard-bladers"
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto', marginBottom: 16 }}>
                    {bladers.filter(b => b.name.toLowerCase().includes(searchQuery.toLowerCase())).map((b) => {
                      const sel = form.blader_ids.includes(b.id);
                      return (
                        <div
                          key={b.id}
                          className="flex items-center gap-md"
                          style={{
                            padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                            background: sel ? 'rgba(0,212,255,0.08)' : 'var(--surface-2)',
                            border: `1px solid ${sel ? 'rgba(0,212,255,0.4)' : 'var(--border-2)'}`,
                            transition: 'all 0.2s',
                          }}
                          onClick={() => toggleBlader(b.id)}
                          id={`sel-blader-${b.id}`}
                        >
                          <div
                            className="avatar avatar-sm"
                            style={{ background: b.avatar_color, color: 'white', fontFamily: 'Orbitron', fontSize: '0.6rem' }}
                          >
                            {b.avatar_image ? <img src={b.avatar_image} alt={b.name} /> : b.avatar_initials}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700 }}>{b.name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{b.wins}W · {b.losses}L</div>
                          </div>
                          <div style={{
                            width: 20, height: 20, borderRadius: '50%',
                            border: `2px solid ${sel ? 'var(--primary)' : 'var(--border)'}`,
                            background: sel ? 'var(--primary)' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'white', fontSize: '0.6rem', transition: 'all 0.2s',
                          }}>
                            {sel ? '✓' : ''}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              <div className="flex gap-sm" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setStep(1)} id="wizard-back-1">← {lang === 'it' ? 'Indietro' : 'Back'}</button>
                <button
                  className="btn btn-primary"
                  onClick={handleCreate}
                  disabled={form.blader_ids.length < 2}
                  id="wizard-create"
                >
                  <Trophy size={16} /> {lang === 'it' ? 'Crea Torneo' : 'Create Tournament'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function TournamentRow({ tournament, lang, onClick }: { tournament: any; lang: string; onClick: () => void }) {
  const statusColor = tournament.status === 'active' ? 'var(--success)' : tournament.status === 'lobby' ? 'var(--primary)' : 'var(--text-muted)';
  return (
    <div
      className="card card-interactive"
      style={{ padding: '14px 20px', cursor: 'pointer' }}
      onClick={onClick}
      id={`tournament-row-${tournament.id}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-md">
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, boxShadow: `0 0 8px ${statusColor}` }} />
          <div>
            <div style={{ fontFamily: 'Orbitron', fontWeight: 700, fontSize: '0.9rem' }}>{tournament.name}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
              {BATTLE_MODE_LABELS[tournament.format as BattleMode] || tournament.format} ·{' '}
              {tournament.blader_ids.length} {lang === 'it' ? 'blader' : 'bladers'} ·{' '}
              <span style={{ fontFamily: 'Orbitron', fontSize: '0.7rem' }}>{tournament.join_code}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-md">
          <span className={`badge badge-${tournament.status === 'active' ? 'success' : tournament.status === 'lobby' ? 'primary' : 'muted'}`}>
            {tournament.status}
          </span>
          <ChevronRight size={16} color="var(--text-muted)" />
        </div>
      </div>
    </div>
  );
}
