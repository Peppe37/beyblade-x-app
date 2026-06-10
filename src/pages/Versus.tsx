import { useState, useEffect, useMemo } from 'react';
import { useBladers, useSettings, useToast } from '../store';
import { Swords, Trophy, Search, QrCode, Copy, Check } from 'lucide-react';
import { api, getBackendMode, getRemoteUrl } from '../services/api';
import { VERSUS_MODES, VersusModeInfo, FinishType, FINISH_POINTS, FINISH_LABELS, FINISH_COLORS, BattleRound } from '../types';
import BattleAnimation from '../components/battle/BattleAnimation';
import Modal from '../components/common/Modal';
import { QRCodeSVG } from 'qrcode.react';

const FINISHES: FinishType[] = ['spin', 'over', 'burst', 'xtreme'];

type VersusPhase = 'setup' | 'animation' | 'result';

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

  const backendMode = getBackendMode();
  const remoteUrl = getRemoteUrl();
  const lobbyUrl = backendMode === 'remote' ? `${remoteUrl.replace(/\/$/, '')}/lobby` : `http://${localIp || '127.0.0.1'}:7878/lobby`;

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
  const [rounds, setRounds] = useState<BattleRound[]>([]);
  const [roundType, setRoundType] = useState<'finish' | 'draw' | 'foul'>('finish');
  const [foulBladerId, setFoulBladerId] = useState('');
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
  const b1Wins = rounds.filter(r => r.round_type === 'finish' && r.winner_id === b1).length;
  const b2Wins = rounds.filter(r => r.round_type === 'finish' && r.winner_id === b2).length;
  const winsNeeded = Math.ceil(selectedMode.bestOf / 2);

  const b1Points = rounds.reduce((sum, r) => sum + r.b1_points, 0);
  const b2Points = rounds.reduce((sum, r) => sum + r.b2_points, 0);

  const is1on1 = selectedMode.id === '1on1_single' || selectedMode.id === '1on1_bo3';
  const matchOver = is1on1
    ? (b1Points >= pointThreshold || b2Points >= pointThreshold)
    : (b1Wins >= winsNeeded || b2Wins >= winsNeeded);

  const startBattle = () => {
    if (!b1 || !b2 || b1 === b2) {
      addToast(lang === 'it' ? 'Seleziona due blader diversi!' : 'Select two different bladers!', 'error');
      return;
    }
    setRoundType('finish');
    setFoulBladerId('');
    setCurrentResultForm({ finish_type: 'xtreme', winner_id: b1 });
    setPhase('animation');
  };

  const handleAnimationReady = () => {
    setPhase('result');
  };

  const handleRoundResult = async () => {
    let newRound: BattleRound;
    const roundNum = rounds.length + 1;

    if (roundType === 'draw') {
      newRound = {
        round_num: roundNum,
        round_type: 'draw',
        finish_type: 'draw',
        b1_points: 0,
        b2_points: 0,
      };
    } else if (roundType === 'foul') {
      if (!foulBladerId) return;
      let b1Pts = 0;
      let b2Pts = 0;

      if (foulBladerId === b1) {
        const prevFouls = rounds.filter(r => r.round_type === 'foul' && r.foul_blader_id === b1).length;
        if ((prevFouls + 1) % 2 === 0) {
          b2Pts = 1;
        }
      } else {
        const prevFouls = rounds.filter(r => r.round_type === 'foul' && r.foul_blader_id === b2).length;
        if ((prevFouls + 1) % 2 === 0) {
          b1Pts = 1;
        }
      }

      newRound = {
        round_num: roundNum,
        round_type: 'foul',
        finish_type: 'foul',
        foul_blader_id: foulBladerId,
        b1_points: b1Pts,
        b2_points: b2Pts,
      };
    } else {
      const { winner_id, finish_type } = currentResultForm;
      if (!winner_id) return;

      const pts = FINISH_POINTS[finish_type];
      const isB1Winner = winner_id === b1;
      newRound = {
        round_num: roundNum,
        round_type: 'finish',
        winner_id,
        finish_type,
        b1_points: isB1Winner ? pts : 0,
        b2_points: isB1Winner ? 0 : pts,
      };
    }

    const newRounds = [...rounds, newRound];
    const newB1Wins = newRounds.filter(r => r.round_type === 'finish' && r.winner_id === b1).length;
    const newB2Wins = newRounds.filter(r => r.round_type === 'finish' && r.winner_id === b2).length;
    const newB1Pts = newRounds.reduce((sum, r) => sum + r.b1_points, 0);
    const newB2Pts = newRounds.reduce((sum, r) => sum + r.b2_points, 0);

    const isMatchOver = is1on1
      ? (newB1Pts >= pointThreshold || newB2Pts >= pointThreshold)
      : (newB1Wins >= winsNeeded || newB2Wins >= winsNeeded);

    setRounds(newRounds);

    if (isMatchOver) {
      // Record final result
      const finalWinnerId = is1on1
        ? (newB1Pts >= newB2Pts ? b1 : b2)
        : (newB1Wins >= newB2Wins ? b1 : b2);
      const totalWinnerPts = finalWinnerId === b1 ? newB1Pts : newB2Pts;
      setIsSubmitting(true);
      try {
        await api.recordVersusBattle({
          blader1_id: b1,
          blader2_id: b2,
          winner_id: finalWinnerId,
          winner_points: totalWinnerPts || pointThreshold,
          rounds: newRounds,
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
      setRoundType('finish');
      setFoulBladerId('');
      setCurrentResultForm({ finish_type: 'xtreme', winner_id: b1 });
      setPhase('setup');
    }
  };

  const cancelMatch = () => {
    setRounds([]);
    setRoundType('finish');
    setFoulBladerId('');
    setPhase('setup');
  };

  const startBattleDirectly = () => {
    if (!b1 || !b2 || b1 === b2) {
      addToast(lang === 'it' ? 'Seleziona due blader diversi!' : 'Select two different bladers!', 'error');
      return;
    }
    setRoundType('finish');
    setFoulBladerId('');
    setCurrentResultForm({ finish_type: 'xtreme', winner_id: b1 });
    setPhase('result');
  };

  const rightColumnContent = useMemo(() => {
    if (rounds.length > 0) {
      const b1Fouls = rounds.filter(r => r.round_type === 'foul' && r.foul_blader_id === b1).length;
      const b2Fouls = rounds.filter(r => r.round_type === 'foul' && r.foul_blader_id === b2).length;
      
      const leaderText = is1on1
        ? (b1Points > b2Points ? `${b1Data?.name} ${lang === 'it' ? 'è in testa' : 'is leading'}` : b2Points > b1Points ? `${b2Data?.name} ${lang === 'it' ? 'è in testa' : 'is leading'}` : (lang === 'it' ? 'Pareggio temporaneo' : 'Temporary tie'))
        : (b1Wins > b2Wins ? `${b1Data?.name} ${lang === 'it' ? 'è in testa' : 'is leading'}` : b2Wins > b1Wins ? `${b2Data?.name} ${lang === 'it' ? 'è in testa' : 'is leading'}` : (lang === 'it' ? 'Pareggio temporaneo' : 'Temporary tie'));

      return (
        <div className="card animate-fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: '0.85rem', color: 'var(--primary)', letterSpacing: 2, textTransform: 'uppercase' }}>
            {lang === 'it' ? 'Stato Incontro Live' : 'Live Match Status'}
          </div>
          
          <div style={{ background: 'var(--surface-2)', padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(0,212,255,0.08)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'Orbitron', textTransform: 'uppercase', marginBottom: 4 }}>
              {lang === 'it' ? 'Leader Attuale' : 'Current Leader'}
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--accent)' }}>
              ⚡ {leaderText}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, background: 'var(--surface-2)', padding: '14px 12px', borderRadius: 12, border: '1px solid rgba(0,212,255,0.05)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'Orbitron', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', marginBottom: 6 }}>{b1Data?.name}</div>
              
              {/* Score / Wins */}
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--primary)', fontFamily: 'Orbitron' }}>
                {is1on1 ? b1Points : b1Wins} <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 500 }}>{is1on1 ? (lang === 'it' ? 'PT' : 'PTS') : (lang === 'it' ? 'VITT.' : 'WINS')}</span>
              </div>

              {/* Fouls */}
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: b1Fouls > 0 ? '#ffaa00' : 'var(--text-muted)', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                ⚠️ {b1Fouls} {b1Fouls === 1 ? (lang === 'it' ? 'Fallo' : 'Foul') : (lang === 'it' ? 'Falli' : 'Fouls')}
              </div>
              
              {b1Fouls % 2 === 1 && (
                <div style={{ fontSize: '0.55rem', color: '#ffaa00', marginTop: 4 }}>
                  {lang === 'it' ? 'Prossimo = +1 pt avv.' : 'Next = +1 pt opp.'}
                </div>
              )}
            </div>

            <div style={{ flex: 1, background: 'var(--surface-2)', padding: '14px 12px', borderRadius: 12, border: '1px solid rgba(255,68,68,0.05)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'Orbitron', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', marginBottom: 6 }}>{b2Data?.name}</div>
              
              {/* Score / Wins */}
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--danger)', fontFamily: 'Orbitron' }}>
                {is1on1 ? b2Points : b2Wins} <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 500 }}>{is1on1 ? (lang === 'it' ? 'PT' : 'PTS') : (lang === 'it' ? 'VITT.' : 'WINS')}</span>
              </div>

              {/* Fouls */}
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: b2Fouls > 0 ? '#ffaa00' : 'var(--text-muted)', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                ⚠️ {b2Fouls} {b2Fouls === 1 ? (lang === 'it' ? 'Fallo' : 'Foul') : (lang === 'it' ? 'Falli' : 'Fouls')}
              </div>
              
              {b2Fouls % 2 === 1 && (
                <div style={{ fontSize: '0.55rem', color: '#ffaa00', marginTop: 4 }}>
                  {lang === 'it' ? 'Prossimo = +1 pt avv.' : 'Next = +1 pt opp.'}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: 1 }}>
              {lang === 'it' ? 'CRONOLOGIA ROUND' : 'ROUND HISTORY'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto', paddingRight: 4 }} className="custom-scrollbar">
              {rounds.map((r, i) => {
                let text = '';
                let color = 'var(--text)';
                let badgeText = '';
                let badgeColor = '';

                if (r.round_type === 'draw') {
                  text = lang === 'it' ? 'Pareggio' : 'Draw';
                  color = 'var(--text-muted)';
                  badgeText = lang === 'it' ? 'Pareggio' : 'Draw';
                  badgeColor = FINISH_COLORS.draw;
                } else if (r.round_type === 'foul') {
                  const foulBlader = bladers.find(b => b.id === r.foul_blader_id)?.name || 'Blader';
                  text = lang === 'it' ? `Fallo di ${foulBlader}` : `Foul by ${foulBlader}`;
                  color = '#ffaa00';
                  badgeText = lang === 'it' ? 'Fallo' : 'Foul';
                  badgeColor = FINISH_COLORS.foul;
                  if (r.b1_points > 0) {
                    const opponent = bladers.find(b => b.id === b1)?.name || 'Player 1';
                    text += ` (+1 pt a ${opponent})`;
                  } else if (r.b2_points > 0) {
                    const opponent = bladers.find(b => b.id === b2)?.name || 'Player 2';
                    text += ` (+1 pt a ${opponent})`;
                  }
                } else {
                  const winner = bladers.find(b => b.id === r.winner_id);
                  text = winner?.name || 'Winner';
                  badgeText = FINISH_LABELS[r.finish_type || 'spin'];
                  badgeColor = FINISH_COLORS[r.finish_type || 'spin'];
                }

                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', background: 'var(--surface-3)', borderRadius: 8,
                    fontSize: '0.8rem', borderLeft: `3px solid ${badgeColor}`
                  }}>
                    <span style={{ fontFamily: 'Orbitron', fontSize: '0.6rem', color: 'var(--text-muted)', width: 36 }}>R{i + 1}</span>
                    <span style={{ fontWeight: 600, color, flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{text}</span>
                    <span style={{
                      fontSize: '0.55rem', padding: '2px 6px', borderRadius: 4,
                      background: `${badgeColor}22`,
                      color: badgeColor,
                      fontWeight: 700,
                    }}>
                      {badgeText}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="card animate-fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontFamily: 'Orbitron', fontSize: '0.85rem', color: 'var(--accent)', letterSpacing: 2, textTransform: 'uppercase' }}>
          {lang === 'it' ? 'Confronto Blader' : 'Blader Comparison'}
        </div>

        {b1Data && b2Data ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, justifyContent: 'center', flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'Orbitron' }}>
                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '35%' }}>{b1Data.name} ({b1Data.wins})</span>
                <span style={{ flex: 1, textAlign: 'center' }}>{lang === 'it' ? 'VITTORIE' : 'WINS'}</span>
                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '35%' }}>{b2Data.name} ({b2Data.wins})</span>
              </div>
              <div style={{ display: 'flex', height: 8, background: 'var(--surface-3)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${(b1Data.wins / (b1Data.wins + b2Data.wins || 1)) * 100}%`, background: 'var(--primary)' }} />
                <div style={{ flex: 1, background: 'var(--danger)' }} />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'Orbitron' }}>
                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '35%' }}>{b1Data.name} ({b1Data.losses})</span>
                <span style={{ flex: 1, textAlign: 'center' }}>{lang === 'it' ? 'SCONFITTE' : 'LOSSES'}</span>
                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '35%' }}>{b2Data.name} ({b2Data.losses})</span>
              </div>
              <div style={{ display: 'flex', height: 8, background: 'var(--surface-3)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${(b1Data.losses / (b1Data.losses + b2Data.losses || 1)) * 100}%`, background: 'var(--primary)' }} />
                <div style={{ flex: 1, background: 'var(--danger)' }} />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'Orbitron' }}>
                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '35%' }}>{b1Data.name} ({b1Data.points_total})</span>
                <span style={{ flex: 1, textAlign: 'center' }}>{lang === 'it' ? 'PUNTI TOTALI' : 'TOTAL POINTS'}</span>
                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '35%' }}>{b2Data.name} ({b2Data.points_total})</span>
              </div>
              <div style={{ display: 'flex', height: 8, background: 'var(--surface-3)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${(b1Data.points_total / (b1Data.points_total + b2Data.points_total || 1)) * 100}%`, background: 'var(--primary)' }} />
                <div style={{ flex: 1, background: 'var(--danger)' }} />
              </div>
            </div>

            <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-2)', paddingTop: 16 }}>
              💡 {lang === 'it' ? 'Seleziona una modalità e clicca Inizia per combattere.' : 'Select a game mode and click Start to fight.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: 32, gap: 12, background: 'var(--surface-2)', borderRadius: 12, border: '1px dashed var(--border)' }}>
            <span style={{ fontSize: '2rem' }}>⚔️</span>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', margin: 0, lineHeight: 1.4 }}>
              {lang === 'it'
                ? 'Seleziona due blader per visualizzare il loro confronto delle statistiche storiche.'
                : 'Select two bladers to see their historical stats comparison.'}
            </p>
          </div>
        )}
      </div>
    );
  }, [rounds, b1Points, b2Points, b1Wins, b2Wins, b1Data, b2Data, lang, bladers, b1, b2, is1on1]);

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

      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'stretch' }} className="animate-fade-in">
        {/* Left Column (Configuration & Scoreboard) */}
        <div style={{ flex: '3 1 600px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          
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
                    onClick={() => { if (rounds.length === 0) setSelectedMode(mode); }}
                    style={{
                      padding: '14px 16px',
                      background: isSelected ? 'rgba(0,212,255,0.1)' : 'var(--surface-2)',
                      border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: 12, cursor: rounds.length > 0 ? 'not-allowed' : 'pointer', textAlign: 'left',
                      transition: 'all 0.2s',
                      opacity: rounds.length > 0 && !isSelected ? 0.5 : 1,
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
                    onClick={() => { if (rounds.length === 0) setPointThreshold(pts); }}
                    className={`btn btn-sm ${pointThreshold === pts ? 'btn-primary' : 'btn-secondary'}`}
                    disabled={rounds.length > 0}
                    id={`pts-${pts}`}
                  >
                    ⚡ {pts} {lang === 'it' ? 'pt' : 'pts'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Players */}
          <div style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
            
            {/* Blader 1 */}
            <div className="card" style={{
              flex: 1, minWidth: 260,
              background: 'linear-gradient(145deg, rgba(0,212,255,0.06) 0%, rgba(0,0,0,0) 100%)',
              borderColor: b1 ? 'var(--primary)' : 'var(--border)',
              transition: 'all 0.25s',
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
                  disabled={rounds.length > 0}
                />
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filtered1.map(bl => (
                  <div
                    key={bl.id}
                    onClick={() => { if (rounds.length === 0) { setB1(bl.id); setSearch1(''); } }}
                    style={{
                      padding: '8px 12px', borderRadius: 8, cursor: rounds.length > 0 ? 'not-allowed' : 'pointer',
                      background: b1 === bl.id ? 'rgba(0,212,255,0.12)' : 'var(--surface-2)',
                      border: `1px solid ${b1 === bl.id ? 'var(--primary)' : 'var(--border-2)'}`,
                      display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s',
                      opacity: rounds.length > 0 && b1 !== bl.id ? 0.5 : 1,
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

            {/* VS Box & Score */}
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 16, flexShrink: 0, minWidth: 80,
            }}>
              <div className="bey-spin-icon" style={{ width: 50, height: 50 }} />
              <div style={{
                fontFamily: 'Orbitron', fontSize: '1.6rem', fontWeight: 900,
                color: 'white', textShadow: '0 0 12px var(--accent), 0 0 24px var(--primary)',
              }}>VS</div>
              {rounds.length > 0 && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
                    <span style={{
                      fontFamily: 'Orbitron',
                      fontSize: '1.4rem',
                      fontWeight: 900,
                      color: (is1on1 ? b1Points > b2Points : b1Wins > b2Wins) ? 'var(--primary)' : 'var(--text-muted)'
                    }}>
                      {is1on1 ? b1Points : b1Wins}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>–</span>
                    <span style={{
                      fontFamily: 'Orbitron',
                      fontSize: '1.4rem',
                      fontWeight: 900,
                      color: (is1on1 ? b2Points > b1Points : b2Wins > b1Wins) ? 'var(--danger)' : 'var(--text-muted)'
                    }}>
                      {is1on1 ? b2Points : b2Wins}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'Orbitron', letterSpacing: 1 }}>
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
              transition: 'all 0.25s',
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
                  disabled={rounds.length > 0}
                />
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filtered2.map(bl => (
                  <div
                    key={bl.id}
                    onClick={() => { if (rounds.length === 0) { setB2(bl.id); setSearch2(''); } }}
                    style={{
                      padding: '8px 12px', borderRadius: 8, cursor: rounds.length > 0 ? 'not-allowed' : 'pointer',
                      background: b2 === bl.id ? 'rgba(255,68,68,0.12)' : 'var(--surface-2)',
                      border: `1px solid ${b2 === bl.id ? 'var(--danger)' : 'var(--border-2)'}`,
                      display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s',
                      opacity: rounds.length > 0 && b2 !== bl.id ? 0.5 : 1,
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

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
            {rounds.length > 0 && (
              <button className="btn btn-secondary" onClick={cancelMatch} style={{ borderRadius: 100, padding: '12px 24px' }}>
                {lang === 'it' ? 'Annulla Match' : 'Cancel Match'}
              </button>
            )}
            
            <button
              className="btn btn-primary"
              style={{
                padding: '12px 32px', borderRadius: 100,
                boxShadow: b1 && b2 ? '0 0 20px var(--primary-glow)' : 'none',
                transition: 'all 0.3s',
              }}
              onClick={startBattle}
              disabled={!b1 || !b2 || isSubmitting || matchOver}
              id="btn-start-battle"
            >
              <Swords size={16} />
              {rounds.length === 0
                ? (lang === 'it' ? 'Inizia con Animazione' : 'Start with Animation')
                : (lang === 'it' ? 'Prossimo Round' : 'Next Round')}
            </button>

            <button
              className="btn btn-secondary"
              style={{
                padding: '12px 32px', borderRadius: 100,
                border: '1px solid var(--accent)',
                color: 'var(--accent)',
                background: 'transparent',
                boxShadow: b1 && b2 ? '0 0 20px rgba(255,215,0,0.15)' : 'none',
                transition: 'all 0.3s',
              }}
              onClick={startBattleDirectly}
              disabled={!b1 || !b2 || isSubmitting || matchOver}
              id="btn-fast-battle"
            >
              ⚡ {lang === 'it' ? 'Registra Risultato' : 'Record Result'}
            </button>
          </div>
        </div>

        {/* Right Column (Live Match Status / Stats Comparison) */}
        <div style={{ flex: '2 1 340px' }}>
          {rightColumnContent}
        </div>
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
          {/* Outcome Type Selector */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <button
              className={`btn ${roundType === 'finish' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setRoundType('finish')}
              style={{ flex: 1 }}
              id="btn-outcome-finish"
            >
              {lang === 'it' ? 'Vittoria' : 'Winner'}
            </button>
            <button
              className={`btn ${roundType === 'draw' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setRoundType('draw')}
              style={{ flex: 1 }}
              id="btn-outcome-draw"
            >
              {lang === 'it' ? 'Pareggio' : 'Draw'}
            </button>
            <button
              className={`btn ${roundType === 'foul' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setRoundType('foul')}
              style={{ flex: 1 }}
              id="btn-outcome-foul"
            >
              {lang === 'it' ? 'Fallo' : 'Foul'}
            </button>
          </div>

          {roundType === 'finish' && (
            <>
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
            </>
          )}

          {roundType === 'draw' && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 24 }}>
              📢 {lang === 'it' ? 'Pareggio registrato. Nessun punto assegnato a nessuno dei blader.' : 'Draw recorded. No points awarded to either blader.'}
            </div>
          )}

          {roundType === 'foul' && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontFamily: 'Orbitron', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 12, letterSpacing: 2, textAlign: 'center' }}>
                {lang === 'it' ? 'CHI HA COMMESSO IL FALLO?' : 'WHO COMMITTED THE FOUL?'}
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button
                  onClick={() => setFoulBladerId(b1)}
                  style={{
                    flex: 1, padding: '12px 16px', borderRadius: 12, cursor: 'pointer',
                    background: foulBladerId === b1 ? 'rgba(255,170,0,0.18)' : 'var(--surface-2)',
                    border: `2px solid ${foulBladerId === b1 ? '#ffaa00' : 'var(--border)'}`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    transition: 'all 0.2s',
                  }}
                  id="btn-foul-b1"
                >
                  <div className="avatar avatar-md" style={{ background: b1Data.avatar_color, color: 'white', overflow: 'hidden' }}>
                    {b1Data.avatar_image ? <img src={b1Data.avatar_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : b1Data.avatar_initials}
                  </div>
                  <span style={{ fontFamily: 'Orbitron', fontSize: '0.7rem', fontWeight: 700, color: foulBladerId === b1 ? '#ffaa00' : 'var(--text)' }}>
                    {b1Data.name}
                  </span>
                  {foulBladerId === b1 && <span style={{ fontSize: '0.6rem', color: '#ffaa00', fontFamily: 'Orbitron' }}>FALLO</span>}
                </button>
                <button
                  onClick={() => setFoulBladerId(b2)}
                  style={{
                    flex: 1, padding: '12px 16px', borderRadius: 12, cursor: 'pointer',
                    background: foulBladerId === b2 ? 'rgba(255,170,0,0.18)' : 'var(--surface-2)',
                    border: `2px solid ${foulBladerId === b2 ? '#ffaa00' : 'var(--border)'}`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    transition: 'all 0.2s',
                  }}
                  id="btn-foul-b2"
                >
                  <div className="avatar avatar-md" style={{ background: b2Data.avatar_color, color: 'white', overflow: 'hidden' }}>
                    {b2Data.avatar_image ? <img src={b2Data.avatar_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : b2Data.avatar_initials}
                  </div>
                  <span style={{ fontFamily: 'Orbitron', fontSize: '0.7rem', fontWeight: 700, color: foulBladerId === b2 ? '#ffaa00' : 'var(--text)' }}>
                    {b2Data.name}
                  </span>
                  {foulBladerId === b2 && <span style={{ fontSize: '0.6rem', color: '#ffaa00', fontFamily: 'Orbitron' }}>FALLO</span>}
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={cancelMatch}>{lang === 'it' ? 'Annulla' : 'Cancel'}</button>
            <button
              className="btn btn-primary"
              onClick={handleRoundResult}
              disabled={isSubmitting || (roundType === 'finish' && !currentResultForm.winner_id) || (roundType === 'foul' && !foulBladerId)}
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
