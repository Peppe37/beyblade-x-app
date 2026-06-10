import { useState, useEffect, useMemo } from 'react';
import { useBladers, useSettings, useToast } from '../store';
import { Swords, Trophy, Search, QrCode, Copy, Check } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { VERSUS_MODES, VersusModeInfo, FinishType, FINISH_POINTS, FINISH_LABELS, FINISH_COLORS } from '../types';
import BattleAnimation from '../components/battle/BattleAnimation';
import Modal from '../components/common/Modal';
import { QRCodeSVG } from 'qrcode.react';

const FINISHES: FinishType[] = ['spin', 'over', 'burst', 'xtreme'];

type VersusPhase = 'setup' | 'animation' | 'result';

interface RoundResult {
  winnerId: string;
  finishType: FinishType;
  b1Pts: number;
  b2Pts: number;
}

export default function Versus() {
  const { lang, localIp } = useSettings();
  const { bladers, fetchBladers } = useBladers();
  const { addToast } = useToast();

  const [selectedMode, setSelectedMode] = useState<VersusModeInfo>(VERSUS_MODES[0]);
  const [pointThreshold, setPointThreshold] = useState<4 | 7>(4);
  const [b1, setB1] = useState('');
  const [b2, setB2] = useState('');
  const [search1, setSearch1] = useState('');
  const [search2, setSearch2] = useState('');
  const [phase, setPhase] = useState<VersusPhase>('setup');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const lobbyUrl = `http://${localIp || '127.0.0.1'}:7878/lobby`;
  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(lobbyUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      addToast(lang === 'it' ? 'Link copiato!' : 'Link copied!', 'success');
    } catch {
      addToast('Error', 'error');
    }
  };

  // Round tracking for best-of-3 modes
  const [rounds, setRounds] = useState<RoundResult[]>([]);
  const [currentResultForm, setCurrentResultForm] = useState({
    finish_type: 'xtreme' as FinishType,
    winner_id: '',
  });

  useEffect(() => { fetchBladers(); }, []);

  const filtered1 = useMemo(() =>
    bladers.filter(b => b.id !== b2 && b.name.toLowerCase().includes(search1.toLowerCase())),
    [bladers, b2, search1]
  );
  const filtered2 = useMemo(() =>
    bladers.filter(b => b.id !== b1 && b.name.toLowerCase().includes(search2.toLowerCase())),
    [bladers, b1, search2]
  );

  const b1Data = bladers.find(b => b.id === b1);
  const b2Data = bladers.find(b => b.id === b2);

  // Count wins and points per blader in current match
  const b1Wins = rounds.filter(r => r.winnerId === b1).length;
  const b2Wins = rounds.filter(r => r.winnerId === b2).length;
  const winsNeeded = Math.ceil(selectedMode.bestOf / 2);

  const b1Points = rounds.reduce((sum, r) => sum + r.b1Pts, 0);
  const b2Points = rounds.reduce((sum, r) => sum + r.b2Pts, 0);

  const is1on1 = selectedMode.id === '1on1_single' || selectedMode.id === '1on1_bo3';
  const matchOver = is1on1
    ? (b1Points >= pointThreshold || b2Points >= pointThreshold)
    : (b1Wins >= winsNeeded || b2Wins >= winsNeeded);

  const startBattle = () => {
    if (!b1 || !b2 || b1 === b2) {
      addToast(lang === 'it' ? 'Seleziona due blader diversi!' : 'Select two different bladers!', 'error');
      return;
    }
    setCurrentResultForm({ finish_type: 'xtreme', winner_id: b1 });
    setPhase('animation');
  };

  const handleAnimationReady = () => {
    setPhase('result');
  };

  const handleRoundResult = async () => {
    const { winner_id, finish_type } = currentResultForm;
    if (!winner_id) return;

    const pts = FINISH_POINTS[finish_type];
    const isB1Winner = winner_id === b1;
    const newRound: RoundResult = {
      winnerId: winner_id,
      finishType: finish_type,
      b1Pts: isB1Winner ? pts : 0,
      b2Pts: isB1Winner ? 0 : pts,
    };

    const newRounds = [...rounds, newRound];
    const newB1Wins = newRounds.filter(r => r.winnerId === b1).length;
    const newB2Wins = newRounds.filter(r => r.winnerId === b2).length;
    const newB1Pts = newRounds.reduce((sum, r) => sum + r.b1Pts, 0);
    const newB2Pts = newRounds.reduce((sum, r) => sum + r.b2Pts, 0);

    const isMatchOver = is1on1
      ? (newB1Pts >= pointThreshold || newB2Pts >= pointThreshold)
      : (newB1Wins >= winsNeeded || newB2Wins >= winsNeeded);

    setRounds(newRounds);

    if (isMatchOver) {
      // Record final result
      const finalWinnerId = is1on1
        ? (newB1Pts >= newB2Pts ? b1 : b2)
        : (newB1Wins >= newB2Wins ? b1 : b2);
      const finalLoser = finalWinnerId === b1 ? b2 : b1;
      const totalWinnerPts = finalWinnerId === b1 ? newB1Pts : newB2Pts;
      setIsSubmitting(true);
      try {
        await invoke('record_versus_battle', {
          args: {
            winner_id: finalWinnerId,
            loser_id: finalLoser,
            winner_points: totalWinnerPts || pointThreshold,
          }
        });
        addToast(
          lang === 'it'
            ? `🏆 ${bladers.find(b => b.id === finalWinnerId)?.name} vince la sfida!`
            : `🏆 ${bladers.find(b => b.id === finalWinnerId)?.name} wins the match!`,
          'success'
        );
        fetchBladers();
        // Reset
        setB1('');
        setB2('');
        setRounds([]);
        setPhase('setup');
      } catch (e: any) {
        addToast(e.toString(), 'error');
      } finally {
        setIsSubmitting(false);
        setPhase('setup');
      }
    } else {
      // More rounds to play
      setCurrentResultForm({ finish_type: 'xtreme', winner_id: b1 });
      setPhase('animation');
    }
  };

  const cancelMatch = () => {
    setRounds([]);
    setPhase('setup');
  };

  return (
    <div className="page-inner animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-xl">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Swords color="var(--primary)" />
            {lang === 'it' ? 'Battaglia Libera' : 'Free Battle'}
          </h1>
          <p className="page-subtitle">
            {lang === 'it'
              ? 'Registra l\'esito di una battaglia amichevole.'
              : 'Record the outcome of a friendly battle.'}
          </p>
        </div>
        <button 
          className="btn btn-secondary"
          onClick={() => setShowQrModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: 'auto', padding: '10px 16px' }}
          id="btn-lobby-qr"
        >
          <QrCode size={16} />
          {lang === 'it' ? 'QR Lobby Mobile' : 'Mobile Lobby QR'}
        </button>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>

        {/* Mode Selection */}
        <div className="card">
          <div style={{ fontFamily: 'Orbitron', fontSize: '0.75rem', color: 'var(--primary)', marginBottom: 16, letterSpacing: 2, textTransform: 'uppercase' }}>
            {lang === 'it' ? 'Modalità di Sfida' : 'Battle Mode'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
            {VERSUS_MODES.map((mode) => {
              const isSelected = selectedMode.id === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => setSelectedMode(mode)}
                  style={{
                    padding: '14px 16px',
                    background: isSelected ? 'rgba(0,212,255,0.1)' : 'var(--surface-2)',
                    border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                    borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    transition: 'all 0.2s',
                  }}
                  id={`mode-${mode.id}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: '1.2rem' }}>{mode.icon}</span>
                    <span style={{
                      fontFamily: 'Orbitron', fontSize: '0.75rem', fontWeight: 700,
                      color: isSelected ? 'var(--primary)' : 'var(--text)',
                    }}>
                      {lang === 'it' ? mode.labelIt : mode.label}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    {lang === 'it' ? mode.descIt : mode.desc}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Point threshold */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: 2, flexShrink: 0 }}>
              {lang === 'it' ? 'SOGLIA PUNTI:' : 'POINT THRESHOLD:'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([4, 7] as const).map(pts => (
                <button
                  key={pts}
                  onClick={() => setPointThreshold(pts)}
                  className={`btn btn-sm ${pointThreshold === pts ? 'btn-primary' : 'btn-secondary'}`}
                  id={`pts-${pts}`}
                >
                  ⚡ {pts} {lang === 'it' ? 'pt' : 'pts'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Players */}
        <div style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'center', gap: 24, flexWrap: 'wrap' }}>

          {/* Blader 1 */}
          <div className="card" style={{
            flex: 1, minWidth: 260,
            background: 'linear-gradient(145deg, rgba(0,212,255,0.06) 0%, rgba(0,0,0,0) 100%)',
            borderColor: b1 ? 'var(--primary)' : 'var(--border)',
            transition: 'border-color 0.2s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div className="avatar avatar-md" style={{
                background: b1Data?.avatar_color || 'var(--surface-3)',
                border: '2px solid var(--primary)', color: 'white',
                fontFamily: 'Orbitron', fontSize: '0.65rem', fontWeight: 700, overflow: 'hidden',
              }}>
                {b1Data?.avatar_image ? <img src={b1Data.avatar_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (b1Data?.avatar_initials || '?')}
              </div>
              <div>
                <div style={{ fontFamily: 'Orbitron', fontSize: '0.7rem', color: 'var(--primary)', letterSpacing: 2 }}>PLAYER 1</div>
                {b1Data && <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{b1Data.name}</div>}
              </div>
            </div>
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="form-input"
                placeholder={lang === 'it' ? 'Cerca blader...' : 'Search blader...'}
                value={search1}
                onChange={e => setSearch1(e.target.value)}
                style={{ paddingLeft: 32, fontSize: '0.8rem' }}
                id="search-b1"
              />
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filtered1.map(bl => (
                <div
                  key={bl.id}
                  onClick={() => { setB1(bl.id); setSearch1(''); }}
                  style={{
                    padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                    background: b1 === bl.id ? 'rgba(0,212,255,0.12)' : 'var(--surface-2)',
                    border: `1px solid ${b1 === bl.id ? 'var(--primary)' : 'var(--border-2)'}`,
                    display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s',
                  }}
                  id={`b1-sel-${bl.id}`}
                >
                  <div className="avatar avatar-sm" style={{ background: bl.avatar_color, color: 'white', fontFamily: 'Orbitron', fontSize: '0.55rem', overflow: 'hidden' }}>
                    {bl.avatar_image ? <img src={bl.avatar_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : bl.avatar_initials}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{bl.name}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{bl.wins}W · {bl.losses}L</div>
                  </div>
                  {b1 === bl.id && <span style={{ color: 'var(--primary)', fontSize: '0.8rem' }}>✓</span>}
                </div>
              ))}
              {filtered1.length === 0 && (
                <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  {lang === 'it' ? 'Nessun blader trovato' : 'No bladers found'}
                </div>
              )}
            </div>
          </div>

          {/* VS */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 16, flexShrink: 0, minWidth: 80,
          }}>
            <div className="bey-spin-icon" style={{ width: 60, height: 60 }} />
            <div style={{
              fontFamily: 'Orbitron', fontSize: '1.8rem', fontWeight: 900,
              color: 'white', textShadow: '0 0 15px var(--accent), 0 0 30px var(--primary)',
            }}>VS</div>
            {/* Score tracker */}
            {rounds.length > 0 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
                  <span style={{
                    fontFamily: 'Orbitron',
                    fontSize: '1.5rem',
                    fontWeight: 900,
                    color: (is1on1 ? b1Points > b2Points : b1Wins > b2Wins) ? 'var(--primary)' : 'var(--text-muted)'
                  }}>
                    {is1on1 ? b1Points : b1Wins}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>–</span>
                  <span style={{
                    fontFamily: 'Orbitron',
                    fontSize: '1.5rem',
                    fontWeight: 900,
                    color: (is1on1 ? b2Points > b1Points : b2Wins > b1Wins) ? 'var(--danger)' : 'var(--text-muted)'
                  }}>
                    {is1on1 ? b2Points : b2Wins}
                  </span>
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'Orbitron', letterSpacing: 1 }}>
                  {is1on1 
                    ? (lang === 'it' ? `SOGLIA: ${pointThreshold} PT` : `LIMIT: ${pointThreshold} PTS`)
                    : `BO${selectedMode.bestOf}`
                  }
                </div>
              </div>
            )}
          </div>

          {/* Blader 2 */}
          <div className="card" style={{
            flex: 1, minWidth: 260,
            background: 'linear-gradient(145deg, rgba(255,68,68,0.06) 0%, rgba(0,0,0,0) 100%)',
            borderColor: b2 ? 'var(--danger)' : 'var(--border)',
            transition: 'border-color 0.2s',
          }}>
            <div style={{ display: 'flex', flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div className="avatar avatar-md" style={{
                background: b2Data?.avatar_color || 'var(--surface-3)',
                border: '2px solid var(--danger)', color: 'white',
                fontFamily: 'Orbitron', fontSize: '0.65rem', fontWeight: 700, overflow: 'hidden',
              }}>
                {b2Data?.avatar_image ? <img src={b2Data.avatar_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (b2Data?.avatar_initials || '?')}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'Orbitron', fontSize: '0.7rem', color: 'var(--danger)', letterSpacing: 2 }}>PLAYER 2</div>
                {b2Data && <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{b2Data.name}</div>}
              </div>
            </div>
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="form-input"
                placeholder={lang === 'it' ? 'Cerca blader...' : 'Search blader...'}
                value={search2}
                onChange={e => setSearch2(e.target.value)}
                style={{ paddingLeft: 32, fontSize: '0.8rem' }}
                id="search-b2"
              />
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filtered2.map(bl => (
                <div
                  key={bl.id}
                  onClick={() => { setB2(bl.id); setSearch2(''); }}
                  style={{
                    padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                    background: b2 === bl.id ? 'rgba(255,68,68,0.12)' : 'var(--surface-2)',
                    border: `1px solid ${b2 === bl.id ? 'var(--danger)' : 'var(--border-2)'}`,
                    display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s',
                  }}
                  id={`b2-sel-${bl.id}`}
                >
                  <div className="avatar avatar-sm" style={{ background: bl.avatar_color, color: 'white', fontFamily: 'Orbitron', fontSize: '0.55rem', overflow: 'hidden' }}>
                    {bl.avatar_image ? <img src={bl.avatar_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : bl.avatar_initials}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{bl.name}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{bl.wins}W · {bl.losses}L</div>
                  </div>
                  {b2 === bl.id && <span style={{ color: 'var(--danger)', fontSize: '0.8rem' }}>✓</span>}
                </div>
              ))}
              {filtered2.length === 0 && (
                <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  {lang === 'it' ? 'Nessun blader trovato' : 'No bladers found'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Start Battle Button */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
          {rounds.length > 0 && (
            <button className="btn btn-secondary" onClick={cancelMatch}>
              {lang === 'it' ? 'Annulla Match' : 'Cancel Match'}
            </button>
          )}
          <button
            className="btn btn-primary btn-lg"
            style={{
              padding: '16px 56px', fontSize: '1.1rem', borderRadius: 100,
              boxShadow: b1 && b2 ? '0 0 30px var(--primary-glow)' : 'none',
              transition: 'all 0.3s',
            }}
            onClick={startBattle}
            disabled={!b1 || !b2 || isSubmitting || matchOver}
            id="btn-start-battle"
          >
            <Swords size={20} />
            {rounds.length === 0
              ? (lang === 'it' ? 'Inizia Battaglia' : 'Start Battle')
              : (lang === 'it' ? `Round ${rounds.length + 1}` : `Round ${rounds.length + 1}`)}
          </button>
        </div>

        {/* Round history */}
        {rounds.length > 0 && (
          <div className="card">
            <div style={{ fontFamily: 'Orbitron', fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: 2, marginBottom: 12 }}>
              {lang === 'it' ? 'STORICO ROUND' : 'ROUND HISTORY'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rounds.map((r, i) => {
                const winner = bladers.find(b => b.id === r.winnerId);
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 8,
                  }}>
                    <span style={{ fontFamily: 'Orbitron', fontSize: '0.65rem', color: 'var(--text-muted)', width: 60 }}>Round {i + 1}</span>
                    <span style={{ fontWeight: 700, color: 'var(--accent)', flex: 1 }}>{winner?.name}</span>
                    <span style={{
                      fontSize: '0.65rem', padding: '2px 8px', borderRadius: 99,
                      background: `${FINISH_COLORS[r.finishType]}22`,
                      color: FINISH_COLORS[r.finishType],
                      fontWeight: 700,
                    }}>
                      {FINISH_LABELS[r.finishType]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Battle Animation */}
      {phase === 'animation' && b1Data && b2Data && (
        <BattleAnimation
          blader1={b1Data}
          blader2={b2Data}
          lang={lang}
          onReady={handleAnimationReady}
          onCancel={cancelMatch}
        />
      )}

      {/* Result Modal */}
      {phase === 'result' && b1Data && b2Data && (
        <Modal
          title={lang === 'it' ? `Round ${rounds.length + 1} — Risultato` : `Round ${rounds.length + 1} — Result`}
          onClose={cancelMatch}
          maxWidth={480}
          closeOnOverlayClick={false}
        >
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 24 }}>
            <WinnerPill
              blader={b1Data}
              selected={currentResultForm.winner_id === b1}
              side="left"
              onClick={() => setCurrentResultForm(f => ({ ...f, winner_id: b1 }))}
            />
            <div style={{ display: 'flex', alignItems: 'center', fontFamily: 'Orbitron', fontWeight: 900, color: 'var(--secondary)', fontSize: '0.9rem' }}>VS</div>
            <WinnerPill
              blader={b2Data}
              selected={currentResultForm.winner_id === b2}
              side="right"
              onClick={() => setCurrentResultForm(f => ({ ...f, winner_id: b2 }))}
            />
          </div>

          <div style={{ fontFamily: 'Orbitron', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 10, letterSpacing: 2 }}>
            {lang === 'it' ? 'TIPO DI FINISH' : 'FINISH TYPE'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 24 }}>
            {FINISHES.map(f => (
              <button
                key={f}
                className={`btn ${currentResultForm.finish_type === f ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setCurrentResultForm(bf => ({ ...bf, finish_type: f }))}
                style={{
                  borderColor: currentResultForm.finish_type === f ? FINISH_COLORS[f] : undefined,
                  background: currentResultForm.finish_type === f ? `${FINISH_COLORS[f]}22` : undefined,
                }}
                id={`v-finish-${f}`}
              >
                <div>
                  <div style={{ color: FINISH_COLORS[f] }}>{FINISH_LABELS[f]}</div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>+{FINISH_POINTS[f]} pts</div>
                </div>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={cancelMatch}>{lang === 'it' ? 'Annulla' : 'Cancel'}</button>
            <button
              className="btn btn-primary"
              onClick={handleRoundResult}
              disabled={!currentResultForm.winner_id || isSubmitting}
              id="confirm-round"
            >
              <Trophy size={16} />
              {lang === 'it' ? 'Conferma' : 'Confirm'}
            </button>
          </div>
        </Modal>
      )}

      {showQrModal && (
        <Modal
          title={lang === 'it' ? 'Connetti alla Lobby Mobile' : 'Connect to Mobile Lobby'}
          onClose={() => setShowQrModal(false)}
          maxWidth={400}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', lineHeight: 1.4 }}>
              {lang === 'it' 
                ? 'Scansiona il codice QR per accedere alla Lobby sul tuo telefono. I giocatori possono sfidarsi e registrare i risultati in autonomia!'
                : 'Scan the QR code to access the Lobby on your phone. Players can challenge each other and register results independently!'}
            </p>
            
            <div style={{
              background: '#ffffff',
              padding: 16,
              borderRadius: 16,
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <QRCodeSVG
                value={lobbyUrl}
                size={200}
                bgColor="#ffffff"
                fgColor="#0a0a1a"
                level="H"
              />
            </div>
            
            <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', padding: '8px 12px', borderRadius: 8 }}>
              <span style={{ flex: 1, fontFamily: 'Orbitron', fontSize: '0.75rem', color: 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lobbyUrl}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={copyUrl} style={{ padding: 6, flexShrink: 0 }}>
                {copied ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
              </button>
            </div>
            
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center' }}>
              ⚠️ {lang === 'it' ? 'Assicurati che il telefono sia connesso alla stessa rete Wi-Fi.' : 'Ensure your phone is connected to the same Wi-Fi network.'}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function WinnerPill({ blader, selected, side, onClick }: {
  blader: any; selected: boolean; side: 'left' | 'right'; onClick: () => void;
}) {
  const color = side === 'left' ? 'var(--primary)' : 'var(--danger)';
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '12px 16px', borderRadius: 12, cursor: 'pointer',
        background: selected ? `${color}18` : 'var(--surface-2)',
        border: `2px solid ${selected ? color : 'var(--border)'}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        transition: 'all 0.2s',
      }}
    >
      <div className="avatar avatar-md" style={{
        background: blader.avatar_color, color: 'white',
        fontFamily: 'Orbitron', fontSize: '0.65rem', fontWeight: 700, overflow: 'hidden',
        boxShadow: selected ? `0 0 15px ${color}66` : 'none',
      }}>
        {blader.avatar_image
          ? <img src={blader.avatar_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : blader.avatar_initials}
      </div>
      <span style={{ fontFamily: 'Orbitron', fontSize: '0.7rem', fontWeight: 700, color: selected ? color : 'var(--text)' }}>
        {blader.name}
      </span>
      {selected && <span style={{ fontSize: '0.6rem', color, fontFamily: 'Orbitron' }}>✓ WINNER</span>}
    </button>
  );
}
