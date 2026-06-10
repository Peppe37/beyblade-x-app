import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Zap, Trophy, Wifi, Copy, Check } from 'lucide-react';
import { useTournaments, useSettings, useToast, useBladers, useArenas } from '../store';
import { t, Match, Blader, FINISH_POINTS, FINISH_LABELS, FINISH_COLORS, FinishType, BattleMode, BATTLE_MODE_LABELS, BATTLE_MODE_DESC, BattleRound } from '../types';
import { getBackendMode, getRemoteUrl } from '../services/api';
import { BEYS } from '../data/beys';
import { ARENAS } from '../data/arenas';
import Modal from '../components/common/Modal';
import BattleAnimation from '../components/battle/BattleAnimation';

const FINISHES: FinishType[] = ['spin', 'over', 'burst', 'xtreme'];
const MODES: BattleMode[] = ['1on1', '3on3', 'deck', 'team'];

export default function TournamentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentDetail, fetchTournamentDetail, addMatchResult, deleteTournament, resetTournament, updateTournament } = useTournaments();
  const { customBeys, fetchCustomBeys } = useBladers();
  const { lang, localIp } = useSettings();
  const { addToast } = useToast();
  const { customArenas, fetchCustomArenas } = useArenas();
  const tr = t[lang];

  const [activeTab, setActiveTab] = useState<'bracket' | 'standings' | 'connect' | 'settings'>('bracket');
  const [battleModal, setBattleModal] = useState<Match | null>(null);
  
  // Interactive Match Play State
  const [matchRounds, setMatchRounds] = useState<BattleRound[]>([]);
  const [roundType, setRoundType] = useState<'finish' | 'draw' | 'foul'>('finish');
  const [foulBladerId, setFoulBladerId] = useState('');
  const [matchPhase, setMatchPhase] = useState<'setup' | 'animation' | 'round_result' | 'match_progress'>('setup');
  const [currentRoundForm, setCurrentRoundForm] = useState({
    winner_id: '',
    finish_type: 'xtreme' as FinishType,
    bey1: '',
    bey2: '',
  });

  const [copied, setCopied] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);

  // Edit Settings state
  const [editName, setEditName] = useState('');
  const [editArena, setEditArena] = useState('');
  const [editPointThreshold, setEditPointThreshold] = useState(4);
  const [editFormat, setEditFormat] = useState<BattleMode>('1on1');

  const confirm = (message: string, onConfirm: () => void) => setConfirmDialog({ message, onConfirm });

  useEffect(() => {
    if (id) fetchTournamentDetail(id);
    fetchCustomBeys();
    fetchCustomArenas();
  }, [id]);

  useEffect(() => {
    if (currentDetail?.tournament) {
      const t = currentDetail.tournament;
      setEditName(t.name);
      setEditArena(t.arena);
      setEditPointThreshold(t.point_threshold);
      setEditFormat(t.format as BattleMode);
    }
  }, [currentDetail]);

  const allArenas = [...ARENAS, ...customArenas];

  if (!currentDetail) {
    return (
      <div className="page-inner">
        <div className="empty-state card"><div className="spinner" /></div>
      </div>
    );
  }

  const { tournament, bladers, matches } = currentDetail;

  const bladerMap = Object.fromEntries(bladers.map((b) => [b.id, b]));

  // Group matches by round
  const rounds: Record<number, Match[]> = {};
  matches.forEach((m) => {
    if (!rounds[m.round]) rounds[m.round] = [];
    rounds[m.round].push(m);
  });

  const standings = [...bladers].sort((a, b) => b.wins - a.wins || b.points_total - a.points_total);

  const backendMode = getBackendMode();
  const remoteUrl = getRemoteUrl();
  const joinUrl = backendMode === 'remote' ? `${remoteUrl.replace(/\/$/, '')}/join/${tournament.join_code}` : `http://${localIp}:7878/join/${tournament.join_code}`;
  const serverUrl = backendMode === 'remote' ? remoteUrl : `http://${localIp}:7878`;

  const b1Id = battleModal?.blader1_id || '';
  const b2Id = battleModal?.blader2_id || '';
  const b1 = bladerMap[b1Id];
  const b2 = bladerMap[b2Id];

  // Cumulative scores
  const score1 = matchRounds.reduce((acc, r) => acc + r.b1_points, 0);
  const score2 = matchRounds.reduce((acc, r) => acc + r.b2_points, 0);

  const openBattle = (match: Match) => {
    setMatchRounds([]);
    setRoundType('finish');
    setFoulBladerId('');
    setBattleModal(match);
    setCurrentRoundForm({
      winner_id: match.blader1_id,
      finish_type: 'xtreme',
      bey1: '',
      bey2: '',
    });
    setMatchPhase('match_progress');
  };

  const handleAnimationReady = () => {
    let defaultBey1 = '';
    let defaultBey2 = '';
    const roundIdx = matchRounds.length;
    if (b1 && b1.beys && b1.beys.length > 0) {
      if (tournament.format === '3on3') {
        defaultBey1 = b1.beys[roundIdx % b1.beys.length];
      } else {
        defaultBey1 = b1.beys[0];
      }
    }
    if (b2 && b2.beys && b2.beys.length > 0) {
      if (tournament.format === '3on3') {
        defaultBey2 = b2.beys[roundIdx % b2.beys.length];
      } else {
        defaultBey2 = b2.beys[0];
      }
    }

    setCurrentRoundForm({
      winner_id: b1Id,
      finish_type: 'xtreme',
      bey1: defaultBey1,
      bey2: defaultBey2,
    });
    setMatchPhase('round_result');
  };

  const handleRoundResult = async () => {
    if (!battleModal) return;
    let newRound: BattleRound;
    const roundNum = matchRounds.length + 1;
    const { winner_id, finish_type, bey1, bey2 } = currentRoundForm;

    if (roundType === 'draw') {
      newRound = {
        round_num: roundNum,
        round_type: 'draw',
        finish_type: 'draw',
        b1_points: 0,
        b2_points: 0,
        bey1: bey1 || undefined,
        bey2: bey2 || undefined,
      };
    } else if (roundType === 'foul') {
      if (!foulBladerId) return;
      let b1Pts = 0;
      let b2Pts = 0;

      if (foulBladerId === b1Id) {
        const prevFouls = matchRounds.filter(r => r.round_type === 'foul' && r.foul_blader_id === b1Id).length;
        if ((prevFouls + 1) % 2 === 0) {
          b2Pts = 1;
        }
      } else {
        const prevFouls = matchRounds.filter(r => r.round_type === 'foul' && r.foul_blader_id === b2Id).length;
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
        bey1: bey1 || undefined,
        bey2: bey2 || undefined,
      };
    } else {
      if (!winner_id) return;
      const pts = FINISH_POINTS[finish_type];
      const isB1Winner = winner_id === b1Id;
      newRound = {
        round_num: roundNum,
        round_type: 'finish',
        winner_id,
        finish_type,
        b1_points: isB1Winner ? pts : 0,
        b2_points: isB1Winner ? 0 : pts,
        bey1: bey1 || undefined,
        bey2: bey2 || undefined,
      };
    }

    const updatedRounds = [...matchRounds, newRound];
    const newScore1 = updatedRounds.reduce((acc, r) => acc + r.b1_points, 0);
    const newScore2 = updatedRounds.reduce((acc, r) => acc + r.b2_points, 0);
    setMatchRounds(updatedRounds);

    const isMatchOver = newScore1 >= tournament.point_threshold || newScore2 >= tournament.point_threshold;

    if (isMatchOver) {
      try {
        const finalWinnerId = newScore1 >= tournament.point_threshold ? b1Id : b2Id;
        const lastFinishType = newRound.round_type === 'finish' ? (newRound.finish_type || 'spin') : newRound.round_type;
        await addMatchResult({
          match_id: battleModal.id,
          winner_id: finalWinnerId,
          blader1_points: newScore1,
          blader2_points: newScore2,
          finish_type: lastFinishType,
          bey1: bey1 || undefined,
          bey2: bey2 || undefined,
          rounds: updatedRounds,
        });
        addToast(lang === 'it' ? 'Match completato!' : 'Match completed!', 'success');
        setBattleModal(null);
        setMatchPhase('setup');
      } catch (e: any) {
        console.error(e);
        addToast(lang === 'it' ? 'Errore!' : 'Error!', 'error');
      }
    } else {
      setMatchPhase('match_progress');
    }
  };

  const cancelMatch = () => {
    setBattleModal(null);
    setMatchRounds([]);
    setRoundType('finish');
    setFoulBladerId('');
    setMatchPhase('setup');
  };

  const getBeyName = (beyId: string) => {
    if (!beyId) return '';
    return BEYS.find(b => b.id === beyId || b.name === beyId)?.name || customBeys.find(cb => cb.id === beyId || cb.name === beyId)?.name || beyId;
  };

  const renderBeySelector = (blader: Blader, selectedBey: string, setSelectedBey: (val: string) => void) => {
    const hasBeys = blader.beys && blader.beys.length > 0;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 2 }}>{blader.name}</div>
        {hasBeys && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            {blader.beys.map(bid => {
              const name = getBeyName(bid);
              const isSelected = selectedBey === bid || selectedBey === name;
              return (
                <button
                  key={bid}
                  type="button"
                  className={`btn btn-xs ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSelectedBey(name)}
                  style={{ fontSize: '0.7rem', padding: '4px 10px' }}
                >
                  {name}
                </button>
              );
            })}
          </div>
        )}
        <select
          className="form-select"
          value={
            BEYS.find(b => b.name === selectedBey || b.id === selectedBey)?.name ||
            customBeys.find(cb => cb.name === selectedBey || cb.id === selectedBey)?.name ||
            ''
          }
          onChange={(e) => setSelectedBey(e.target.value)}
          style={{ fontSize: '0.8rem', padding: '6px 10px' }}
        >
          <option value="">{lang === 'it' ? '— Seleziona altro —' : '— Select other —'}</option>
          <optgroup label={lang === 'it' ? 'Ufficiali' : 'Official'}>
            {BEYS.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
          </optgroup>
          {customBeys.length > 0 && (
            <optgroup label={lang === 'it' ? 'Personalizzati' : 'Custom'}>
              {customBeys.map((cb) => <option key={cb.id} value={cb.name}>{cb.name}</option>)}
            </optgroup>
          )}
        </select>
      </div>
    );
  };

  const copyUrl = async () => {
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const roundLabel = (r: number, totalExpected: number) => {
    if (r === totalExpected) return lang === 'it' ? 'Finale' : 'Final';
    if (r === totalExpected - 1) return lang === 'it' ? 'Semifinale' : 'Semi-Final';
    if (r === totalExpected - 2) return lang === 'it' ? 'Quarti di Finale' : 'Quarter-Final';
    return lang === 'it' ? `Round ${r}` : `Round ${r}`;
  };
  // Compute expected total rounds from participant count (ceil(log2(n)))
  const expectedRounds = Math.max(1, Math.ceil(Math.log2(Math.max(2, bladers.length))));

  return (
    <div className="page-inner animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-md" style={{ marginBottom: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/tournaments')} id="btn-back-tournaments">
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <h1 className="page-title" style={{ marginBottom: 0 }}>{tournament.name}</h1>
          <div className="flex items-center gap-sm flex-wrap" style={{ marginTop: 4 }}>
            <span className={`badge badge-${tournament.status === 'active' ? 'success' : tournament.status === 'lobby' ? 'primary' : 'muted'}`}>
              {tr[tournament.status]}
            </span>
            <span className="badge badge-muted">{tournament.format}</span>
            <span style={{ fontFamily: 'Orbitron', fontSize: '0.75rem', color: 'var(--accent)', letterSpacing: 2 }}>
              {tournament.join_code}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              <Zap size={12} style={{ display: 'inline' }} /> {tournament.point_threshold} pts
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-xs" style={{ marginBottom: 24, background: 'var(--surface)', borderRadius: 12, padding: 4, border: '1px solid var(--border)', width: 'fit-content' }}>
        {(['bracket', 'standings', 'connect', 'settings'] as const).map((tab) => (
          <button
            key={tab}
            className={`btn btn-sm ${activeTab === tab ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab(tab)}
            id={`tab-${tab}`}
            style={{ fontFamily: 'Orbitron', fontSize: '0.65rem' }}
          >
            {tab === 'bracket' && <Trophy size={13} />}
            {tab === 'standings' && '📊'}
            {tab === 'connect' && <Wifi size={13} />}
            {tab === 'settings' && <Zap size={13} />}
            {tab === 'bracket' ? tr.bracket : tab === 'standings' ? tr.standings : tab === 'connect' ? tr.connect_mobile : tr.settings}
          </button>
        ))}
      </div>

      {/* Bracket Tab */}
      {activeTab === 'bracket' && (
        <div className="animate-fade-in">
          {Object.keys(rounds).length === 0 ? (
            <div className="card empty-state">
              <div className="empty-state-icon">🏆</div>
              <div className="empty-state-title">{lang === 'it' ? 'Nessuna partita ancora' : 'No matches yet'}</div>
            </div>
          ) : (
            <div className="bracket-container">
              {Object.keys(rounds).sort((a, b) => Number(a) - Number(b)).map((r) => {
                  const visibleMatches = rounds[Number(r)];
                  if (visibleMatches.length === 0) return null;
                  const isFinalRound = Number(r) === expectedRounds;
                  const round1MatchesCount = rounds[1]?.length || 0;
                  const bracketHeight = Math.max(280, round1MatchesCount * 220);

                  return (
                <div key={r} className={`bracket-round bracket-round-${r} ${isFinalRound ? 'bracket-round-final' : ''}`}>
                  <div className="bracket-round-label">{roundLabel(Number(r), expectedRounds)}</div>
                  <div className="bracket-round-matches" style={{ height: bracketHeight }}>
                    {visibleMatches.map((match, idx) => {
                      const b1 = bladerMap[match.blader1_id];
                      const isB2Bye = match.blader2_id?.startsWith('BYE_');
                      const b2 = isB2Bye ? undefined : bladerMap[match.blader2_id];
                      const isEven = idx % 2 === 0;

                      return (
                        <div key={match.id} className={`bracket-match-wrapper ${isEven ? 'bracket-match-wrapper-even' : 'bracket-match-wrapper-odd'}`}>
                          <div className="bracket-match">
                            <BracketSlot blader={b1} points={match.blader1_points} isWinner={match.winner_id === match.blader1_id} isDone={match.status === 'done'} lang={lang} />
                            <BracketSlot blader={b2} points={match.blader2_points} isWinner={match.winner_id === match.blader2_id} isDone={match.status === 'done'} isBye={isB2Bye} lang={lang} />
                            {match.status !== 'done' && (
                              <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-2)' }}>
                                <button
                                  className="btn btn-primary btn-sm"
                                  style={{ width: '100%' }}
                                  onClick={() => openBattle(match)}
                                  id={`battle-btn-${match.id}`}
                                >
                                  <Zap size={12} /> {lang === 'it' ? 'Registra Risultato' : 'Register Result'}
                                </button>
                              </div>
                            )}
                            {match.finish_type && match.finish_type !== 'bye' && (
                              <div style={{ padding: '4px 12px 8px', textAlign: 'center' }}>
                                <span style={{
                                  fontSize: '0.65rem', padding: '2px 8px', borderRadius: 99,
                                  background: `${FINISH_COLORS[match.finish_type]}22`,
                                  color: FINISH_COLORS[match.finish_type],
                                  fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1,
                                }}>
                                  {FINISH_LABELS[match.finish_type]}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="bracket-match-wrapper-vertical-line" />
                        </div>
                      );
                    })}
                  </div>
                </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Standings Tab */}
      {activeTab === 'standings' && (
        <div className="card animate-fade-in">
          <h2 style={{ fontFamily: 'Orbitron', fontSize: '0.9rem', marginBottom: 16 }}>{tr.standings}</h2>
          {standings.length === 0 ? (
            <div className="empty-state" style={{ padding: 24 }}>
              <div className="empty-state-icon">📊</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {standings.map((b, i) => (
                <div key={b.id} className="flex items-center gap-md" style={{
                  padding: '12px 0',
                  borderBottom: i < standings.length - 1 ? '1px solid var(--border-2)' : 'none',
                }}>
                  <span style={{
                    fontFamily: 'Orbitron', fontSize: '1.2rem', fontWeight: 900, width: 32,
                    color: i === 0 ? 'var(--accent)' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : 'var(--text-muted)',
                  }}>
                    {i + 1}
                  </span>
                  <div className="avatar avatar-md" style={{ background: b.avatar_color, color: 'white', fontFamily: 'Orbitron', fontSize: '0.7rem', fontWeight: 700 }}>
                    {b.avatar_image ? <img src={b.avatar_image} alt={b.name} /> : b.avatar_initials}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{b.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{b.wins}W · {b.losses}L</div>
                  </div>
                  <div style={{ fontFamily: 'Orbitron', fontSize: '1.1rem', color: 'var(--primary)', fontWeight: 700 }}>
                    {b.points_total}
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginLeft: 4 }}>pts</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Connect Tab */}
      {activeTab === 'connect' && (
        <div className="animate-fade-in">
          <div className="grid-2" style={{ gap: 24 }}>
            <div className="qr-container">
              <h2 style={{ fontFamily: 'Orbitron', fontSize: '0.9rem', color: 'var(--primary)' }}>
                {tr.scan_qr}
              </h2>
              <div className="qr-code-box">
                <QRCodeSVG
                  value={joinUrl}
                  size={180}
                  bgColor="#ffffff"
                  fgColor="#0a0a1a"
                  level="H"
                />
              </div>
              <div className="join-code-display">{tournament.join_code}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
                {lang === 'it' ? 'Stessa rete Wi-Fi' : 'Same Wi-Fi network'}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="card" style={{ background: 'var(--surface-2)' }}>
                <div className="form-label" style={{ marginBottom: 8 }}>{tr.share_url}</div>
                <div className="flex items-center gap-sm">
                  <div style={{
                    flex: 1, padding: '8px 12px', background: 'var(--surface-3)',
                    borderRadius: 8, fontFamily: 'Orbitron', fontSize: '0.7rem', color: 'var(--primary)',
                    wordBreak: 'break-all',
                  }}>
                    {joinUrl}
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={copyUrl} id="btn-copy-url" style={{ flexShrink: 0 }}>
                    {copied ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <div className="card" style={{ background: 'var(--surface-2)' }}>
                <div className="form-label" style={{ marginBottom: 8 }}>
                  {lang === 'it' ? 'URL Server' : 'Server URL'}
                </div>
                <div style={{ fontFamily: 'Orbitron', fontSize: '0.75rem', color: 'var(--success)', padding: '8px 12px', background: 'var(--surface-3)', borderRadius: 8 }}>
                  {serverUrl}
                </div>
              </div>

              <div className="card" style={{ borderColor: 'rgba(0,212,255,0.2)', background: 'rgba(0,212,255,0.04)', padding: 16 }}>
                <h3 style={{ fontFamily: 'Orbitron', fontSize: '0.75rem', color: 'var(--primary)', marginBottom: 10 }}>
                  {lang === 'it' ? 'Come Connettere' : 'How to Connect'}
                </h3>
                <ol style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(lang === 'it' ? [
                    'Connetti il telefono alla stessa rete Wi-Fi',
                    'Apri il browser e vai su ' + serverUrl,
                    'Inserisci il codice: ' + tournament.join_code,
                    'Segui il torneo in tempo reale!',
                  ] : [
                    'Connect phone to the same Wi-Fi network',
                    'Open browser and go to ' + serverUrl,
                    'Enter code: ' + tournament.join_code,
                    'Follow the tournament in real time!',
                  ]).map((step, i) => (
                    <li key={i} style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.5 }}>{step}</li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="animate-fade-in" style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Edit Settings Card */}
          <div className="card">
            <h3 style={{ fontFamily: 'Orbitron', fontSize: '0.85rem', color: 'var(--primary)', marginBottom: 16, letterSpacing: 1 }}>
              {lang === 'it' ? 'MODIFICA IMPOSTAZIONI' : 'EDIT SETTINGS'}
            </h3>

            {/* Name */}
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>{lang === 'it' ? 'Nome Torneo' : 'Tournament Name'}</label>
              <input
                className="form-input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                id="edit-tournament-name"
              />
            </div>

            {/* Arena Selection */}
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>{tr.arena}</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {allArenas.map((a) => (
                  <label
                    key={a.id}
                    className="card"
                    style={{
                      cursor: 'pointer', padding: '10px 14px',
                      borderColor: editArena === a.id ? a.color : 'var(--border-2)',
                      background: editArena === a.id ? 'rgba(0,212,255,0.02)' : 'var(--surface-2)',
                      display: 'flex', alignItems: 'center', gap: 12,
                      marginBottom: 0, boxShadow: 'none',
                    }}
                    id={`edit-arena-opt-${a.id}`}
                  >
                    <input
                      type="radio"
                      name="edit-arena"
                      value={a.id}
                      checked={editArena === a.id}
                      onChange={() => setEditArena(a.id)}
                      style={{ display: 'none' }}
                    />
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: a.color, boxShadow: `0 0 6px ${a.color}`, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'Orbitron', fontSize: '0.75rem', fontWeight: 700, color: editArena === a.id ? a.color : 'var(--text)' }}>{a.name}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Point Threshold */}
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>{tr.point_threshold}</label>
              <div className="flex gap-sm">
                {[4, 7].map((pts) => (
                  <button
                    key={pts}
                    type="button"
                    className={`btn btn-sm ${editPointThreshold === pts ? 'btn-primary' : 'btn-secondary'} flex-1`}
                    onClick={() => setEditPointThreshold(pts)}
                    id={`edit-pts-${pts}`}
                  >
                    ⚡ {pts} {lang === 'it' ? 'punti' : 'points'}
                  </button>
                ))}
              </div>
            </div>

            {/* Format Selector */}
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>{tr.format}</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {MODES.map(mode => (
                  <label key={mode} style={{
                    cursor: 'pointer', padding: '10px 14px',
                    borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: 12,
                    background: editFormat === mode ? 'rgba(0,212,255,0.06)' : 'var(--surface-2)',
                    border: `1px solid ${editFormat === mode ? 'var(--primary)' : 'var(--border-2)'}`,
                    transition: 'all 0.15s',
                  }}>
                    <input type="radio" name="edit-format" value={mode}
                      checked={editFormat === mode}
                      onChange={() => setEditFormat(mode)}
                      style={{ display: 'none' }}
                    />
                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${editFormat === mode ? 'var(--primary)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                      {editFormat === mode && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)' }} />}
                    </div>
                    <div>
                      <div style={{ fontFamily: 'Orbitron', fontSize: '0.75rem', fontWeight: 700, color: editFormat === mode ? 'var(--primary)' : 'var(--text)' }}>{BATTLE_MODE_LABELS[mode]}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{BATTLE_MODE_DESC[mode]}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Save Button */}
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={!editName.trim()}
              onClick={async () => {
                const needsReset = editFormat !== tournament.format || editArena !== tournament.arena || editPointThreshold !== tournament.point_threshold;

                const doSave = async () => {
                  try {
                    await updateTournament(tournament.id, editName.trim(), editArena, editPointThreshold, editFormat);
                    if (needsReset) {
                      await resetTournament(tournament.id);
                      addToast(lang === 'it' ? 'Torneo modificato e resettato!' : 'Tournament updated and reset!', 'success');
                    } else {
                      addToast(lang === 'it' ? 'Impostazioni aggiornate!' : 'Settings updated!', 'success');
                    }
                  } catch (e: any) {
                    addToast(e.toString(), 'error');
                  }
                };

                if (needsReset) {
                  confirm(
                    lang === 'it'
                      ? 'La modifica di formato, arena o soglia punti resetterà il tabellone ed eliminerà tutti i risultati. Continuare?'
                      : 'Modifying format, arena, or point threshold will reset the bracket and clear all results. Continue?',
                    doSave
                  );
                } else {
                  doSave();
                }
              }}
            >
              {lang === 'it' ? 'Salva Modifiche' : 'Save Changes'}
            </button>
          </div>

          {/* Reset */}
          <div className="card">
            <h3 style={{ fontFamily: 'Orbitron', fontSize: '0.85rem', marginBottom: 8, color: 'var(--text)' }}>
              {lang === 'it' ? 'Resetta Torneo' : 'Reset Tournament'}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>
              {lang === 'it' ? 'Azzera tutti i risultati e crea un nuovo tabellone con gli stessi giocatori.' : 'Clear all results and generate a new bracket with the same players.'}
            </p>
            <button
              className="btn btn-secondary"
              onClick={() => {
                confirm(
                  lang === 'it' ? 'Sei sicuro? Tutti i risultati andranno persi.' : 'Are you sure? All results will be lost.',
                  async () => {
                    try {
                      await resetTournament(tournament.id);
                      addToast(lang === 'it' ? 'Torneo resettato!' : 'Tournament reset!', 'success');
                    } catch (e: any) {
                      addToast(e.toString(), 'error');
                    }
                  }
                );
              }}
            >
              {lang === 'it' ? 'Resetta Torneo' : 'Reset Tournament'}
            </button>
          </div>

          {/* Delete */}
          <div className="card" style={{ border: '1px solid var(--danger)', background: 'rgba(255,51,102,0.04)' }}>
            <h3 style={{ fontSize: '0.9rem', marginBottom: 8, color: 'var(--danger)', fontFamily: 'Orbitron' }}>
              {lang === 'it' ? 'Elimina Torneo' : 'Delete Tournament'}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>
              {lang === 'it' ? 'Elimina definitivamente questo torneo e tutti i suoi dati.' : 'Permanently delete this tournament and all its data.'}
            </p>
            <button
              className="btn btn-primary"
              style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
              onClick={() => {
                confirm(
                  lang === 'it' ? 'Sei ASSOLUTAMENTE sicuro? Il torneo sarà eliminato per sempre.' : 'Are you ABSOLUTELY sure? The tournament will be permanently deleted.',
                  async () => {
                    try {
                      await deleteTournament(tournament.id);
                      addToast(lang === 'it' ? 'Torneo eliminato' : 'Tournament deleted', 'success');
                      navigate('/tournaments');
                    } catch (e: any) {
                      addToast(e.toString(), 'error');
                    }
                  }
                );
              }}
            >
              {lang === 'it' ? 'Elimina Torneo' : 'Delete Tournament'}
            </button>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <Modal title={lang === 'it' ? 'Conferma' : 'Confirm'} onClose={() => setConfirmDialog(null)} maxWidth={400}>
          <p style={{ fontSize: '0.9rem', color: 'var(--text)', marginBottom: 24, lineHeight: 1.6 }}>
            {confirmDialog.message}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setConfirmDialog(null)} id="confirm-cancel">
              {lang === 'it' ? 'Annulla' : 'Cancel'}
            </button>
            <button
              className="btn btn-primary"
              style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
              onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}
              id="confirm-ok"
            >
              {lang === 'it' ? 'Conferma' : 'Confirm'}
            </button>
          </div>
        </Modal>
      )}

      {/* Battle Animation */}
      {battleModal && matchPhase === 'animation' && (() => {
        const b1 = bladerMap[battleModal.blader1_id];
        const b2 = bladerMap[battleModal.blader2_id];
        if (!b1 || !b2) return null;
        return (
          <BattleAnimation
            blader1={b1}
            blader2={b2}
            lang={lang}
            onReady={handleAnimationReady}
            onCancel={cancelMatch}
          />
        );
      })()}

      {/* Round Result Modal */}
      {battleModal && matchPhase === 'round_result' && b1 && b2 && (
        <Modal
          title={lang === 'it' ? `Round ${matchRounds.length + 1} — Risultato` : `Round ${matchRounds.length + 1} — Result`}
          onClose={cancelMatch}
          maxWidth={500}
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
              {/* VS display */}
              <div className="flex items-center gap-md" style={{ marginBottom: 24, justifyContent: 'center' }}>
                <BladerPill blader={b1} selected={currentRoundForm.winner_id === b1.id} onClick={() => setCurrentRoundForm((f) => ({ ...f, winner_id: b1.id }))} id="winner-b1" />
                <span style={{ fontFamily: 'Orbitron', fontWeight: 900, color: 'var(--secondary)', fontSize: '1rem' }}>VS</span>
                <BladerPill blader={b2} selected={currentRoundForm.winner_id === b2.id} onClick={() => setCurrentRoundForm((f) => ({ ...f, winner_id: b2.id }))} id="winner-b2" />
              </div>

              <div className="form-label" style={{ marginBottom: 8 }}>{lang === 'it' ? 'Vincitore' : 'Winner'}</div>
              <div style={{ fontFamily: 'Orbitron', fontSize: '0.9rem', color: 'var(--accent)', textAlign: 'center', marginBottom: 20 }}>
                {currentRoundForm.winner_id ? bladerMap[currentRoundForm.winner_id]?.name || '?' : '—'}
              </div>

              <div className="form-label" style={{ marginBottom: 8 }}>{lang === 'it' ? 'Tipo di Finish' : 'Finish Type'}</div>
              <div className="grid-2" style={{ gap: 8, marginBottom: 20 }}>
                {FINISHES.map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`btn ${currentRoundForm.finish_type === f ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setCurrentRoundForm((bf) => ({ ...bf, finish_type: f }))}
                    id={`finish-${f}`}
                    style={{ borderColor: currentRoundForm.finish_type === f ? FINISH_COLORS[f] : undefined, background: currentRoundForm.finish_type === f ? `${FINISH_COLORS[f]}22` : undefined }}
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
                  type="button"
                  onClick={() => setFoulBladerId(b1Id)}
                  style={{
                    flex: 1, padding: '12px 16px', borderRadius: 12, cursor: 'pointer',
                    background: foulBladerId === b1Id ? 'rgba(255,170,0,0.18)' : 'var(--surface-2)',
                    border: `2px solid ${foulBladerId === b1Id ? '#ffaa00' : 'var(--border)'}`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    transition: 'all 0.2s',
                  }}
                  id="btn-t-foul-b1"
                >
                  <div className="avatar avatar-md" style={{ background: b1.avatar_color, color: 'white', overflow: 'hidden' }}>
                    {b1.avatar_image ? <img src={b1.avatar_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : b1.avatar_initials}
                  </div>
                  <span style={{ fontFamily: 'Orbitron', fontSize: '0.7rem', fontWeight: 700, color: foulBladerId === b1Id ? '#ffaa00' : 'var(--text)' }}>
                    {b1.name}
                  </span>
                  {foulBladerId === b1Id && <span style={{ fontSize: '0.6rem', color: '#ffaa00', fontFamily: 'Orbitron' }}>FALLO</span>}
                </button>
                <button
                  type="button"
                  onClick={() => setFoulBladerId(b2Id)}
                  style={{
                    flex: 1, padding: '12px 16px', borderRadius: 12, cursor: 'pointer',
                    background: foulBladerId === b2Id ? 'rgba(255,170,0,0.18)' : 'var(--surface-2)',
                    border: `2px solid ${foulBladerId === b2Id ? '#ffaa00' : 'var(--border)'}`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    transition: 'all 0.2s',
                  }}
                  id="btn-t-foul-b2"
                >
                  <div className="avatar avatar-md" style={{ background: b2.avatar_color, color: 'white', overflow: 'hidden' }}>
                    {b2.avatar_image ? <img src={b2.avatar_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : b2.avatar_initials}
                  </div>
                  <span style={{ fontFamily: 'Orbitron', fontSize: '0.7rem', fontWeight: 700, color: foulBladerId === b2Id ? '#ffaa00' : 'var(--text)' }}>
                    {b2.name}
                  </span>
                  {foulBladerId === b2Id && <span style={{ fontSize: '0.6rem', color: '#ffaa00', fontFamily: 'Orbitron' }}>FALLO</span>}
                </button>
              </div>
            </div>
          )}

          {/* Bey selection: only show if format is 3on3 or deck */}
          {(tournament.format === '3on3' || tournament.format === 'deck') && (
            <div style={{ marginBottom: 20 }}>
              <div className="form-label" style={{ marginBottom: 12 }}>{lang === 'it' ? 'Selezione Beyblade' : 'Beyblade Selection'}</div>
              <div className="grid-2" style={{ gap: 16 }}>
                {renderBeySelector(b1, currentRoundForm.bey1, (val) => setCurrentRoundForm(f => ({ ...f, bey1: val })))}
                {renderBeySelector(b2, currentRoundForm.bey2, (val) => setCurrentRoundForm(f => ({ ...f, bey2: val })))}
              </div>
            </div>
          )}

          <div className="flex gap-sm" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={cancelMatch} id="cancel-battle">{tr.cancel}</button>
            <button
              className="btn btn-primary"
              onClick={handleRoundResult}
              disabled={(roundType === 'finish' && !currentRoundForm.winner_id) || (roundType === 'foul' && !foulBladerId)}
              id="confirm-battle"
            >
              <Trophy size={16} /> {lang === 'it' ? 'Conferma Risultato' : 'Confirm Result'}
            </button>
          </div>
        </Modal>
      )}

         {battleModal && matchPhase === 'match_progress' && b1 && b2 && (() => {
        const b1Fouls = matchRounds.filter(r => r.round_type === 'foul' && r.foul_blader_id === b1Id).length;
        const b2Fouls = matchRounds.filter(r => r.round_type === 'foul' && r.foul_blader_id === b2Id).length;
        const leaderText = score1 > score2
          ? `${b1.name} ${lang === 'it' ? 'è in testa' : 'is leading'}`
          : score2 > score1
            ? `${b2.name} ${lang === 'it' ? 'è in testa' : 'is leading'}`
            : (lang === 'it' ? 'Pareggio temporaneo' : 'Temporary tie');

        return (
          <Modal
            title={lang === 'it' ? 'Match in Corso' : 'Match in Progress'}
            onClose={cancelMatch}
            maxWidth={520}
            closeOnOverlayClick={false}
          >
            {/* Leader Status */}
            <div style={{ background: 'var(--surface-2)', padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(0,212,255,0.08)', textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'Orbitron', textTransform: 'uppercase', marginBottom: 2 }}>
                {lang === 'it' ? 'Leader Attuale' : 'Current Leader'}
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent)' }}>
                ⚡ {leaderText}
              </div>
            </div>

            {/* Blader Scores Side by Side */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              {/* B1 Box */}
              <div style={{
                flex: 1, background: 'var(--surface-2)', padding: '14px 12px', borderRadius: 12,
                border: `1px solid ${score1 > score2 ? 'var(--primary)' : 'var(--border)'}`,
                textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8
              }}>
                <div className="avatar avatar-md" style={{ background: b1.avatar_color, color: 'white', fontFamily: 'Orbitron', fontSize: '0.65rem', fontWeight: 700, overflow: 'hidden' }}>
                  {b1.avatar_image ? <img src={b1.avatar_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : b1.avatar_initials}
                </div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', width: '100%' }}>{b1.name}</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--primary)', fontFamily: 'Orbitron', lineHeight: 1 }}>
                  {score1} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>{lang === 'it' ? 'PT' : 'PTS'}</span>
                </div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: b1Fouls > 0 ? '#ffaa00' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  ⚠️ {b1Fouls} {b1Fouls === 1 ? (lang === 'it' ? 'Fallo' : 'Foul') : (lang === 'it' ? 'Falli' : 'Fouls')}
                </div>
                {b1Fouls % 2 === 1 && (
                  <div style={{ fontSize: '0.55rem', color: '#ffaa00', marginTop: -2 }}>
                    {lang === 'it' ? 'Prossimo = +1 pt avv.' : 'Next = +1 pt opp.'}
                  </div>
                )}
              </div>

              {/* B2 Box */}
              <div style={{
                flex: 1, background: 'var(--surface-2)', padding: '14px 12px', borderRadius: 12,
                border: `1px solid ${score2 > score1 ? 'var(--danger)' : 'var(--border)'}`,
                textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8
              }}>
                <div className="avatar avatar-md" style={{ background: b2.avatar_color, color: 'white', fontFamily: 'Orbitron', fontSize: '0.65rem', fontWeight: 700, overflow: 'hidden' }}>
                  {b2.avatar_image ? <img src={b2.avatar_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : b2.avatar_initials}
                </div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', width: '100%' }}>{b2.name}</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--danger)', fontFamily: 'Orbitron', lineHeight: 1 }}>
                  {score2} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>{lang === 'it' ? 'PT' : 'PTS'}</span>
                </div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: b2Fouls > 0 ? '#ffaa00' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  ⚠️ {b2Fouls} {b2Fouls === 1 ? (lang === 'it' ? 'Fallo' : 'Foul') : (lang === 'it' ? 'Falli' : 'Fouls')}
                </div>
                {b2Fouls % 2 === 1 && (
                  <div style={{ fontSize: '0.55rem', color: '#ffaa00', marginTop: -2 }}>
                    {lang === 'it' ? 'Prossimo = +1 pt avv.' : 'Next = +1 pt opp.'}
                  </div>
                )}
              </div>
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: 20, fontFamily: 'Orbitron' }}>
              {lang === 'it' ? `Soglia per la vittoria: ${tournament.point_threshold} punti` : `Threshold to win: ${tournament.point_threshold} points`}
            </div>

            {/* History */}
            <div className="card" style={{ background: 'var(--surface-2)', marginBottom: 20, padding: 16 }}>
              <div style={{ fontFamily: 'Orbitron', fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: 2, marginBottom: 12, textTransform: 'uppercase' }}>
                {lang === 'it' ? 'Storico Round' : 'Round History'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto', paddingRight: 4 }} className="custom-scrollbar">
                {matchRounds.map((r, idx) => {
                  let text = '';
                  let color = 'var(--text)';
                  let badgeText = '';
                  let badgeColor = '';
                  let ptsText = '';

                  if (r.round_type === 'draw') {
                    text = lang === 'it' ? 'Pareggio' : 'Draw';
                    color = 'var(--text-muted)';
                    badgeText = lang === 'it' ? 'Pareggio' : 'Draw';
                    badgeColor = FINISH_COLORS.draw;
                  } else if (r.round_type === 'foul') {
                    const foulBlader = bladerMap[r.foul_blader_id || '']?.name || 'Blader';
                    text = lang === 'it' ? `Fallo di ${foulBlader}` : `Foul by ${foulBlader}`;
                    color = '#ffaa00';
                    badgeText = lang === 'it' ? 'Fallo' : 'Foul';
                    badgeColor = FINISH_COLORS.foul;
                    if (r.b1_points > 0) {
                      const opponent = bladerMap[b1Id]?.name || 'Player 1';
                      text += ` (+1 pt a ${opponent})`;
                    } else if (r.b2_points > 0) {
                      const opponent = bladerMap[b2Id]?.name || 'Player 2';
                      text += ` (+1 pt a ${opponent})`;
                    }
                  } else {
                    const roundWinner = bladerMap[r.winner_id || ''];
                    text = roundWinner?.name || '—';
                    badgeText = FINISH_LABELS[r.finish_type || 'spin'];
                    badgeColor = FINISH_COLORS[r.finish_type || 'spin'];
                    ptsText = ` (+${r.b1_points || r.b2_points})`;
                  }

                  return (
                    <div key={idx} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', background: 'var(--surface-3)', borderRadius: 8,
                      fontSize: '0.8rem', borderLeft: `3px solid ${badgeColor}`
                    }}>
                      <span style={{ fontFamily: 'Orbitron', fontSize: '0.6rem', color: 'var(--text-muted)', width: 36 }}>R{idx + 1}</span>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem', flex: 1, color, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{text}</span>
                      <span style={{
                        fontSize: '0.55rem', padding: '2px 6px', borderRadius: 4,
                        background: `${badgeColor}22`,
                        color: badgeColor,
                        fontWeight: 700, textTransform: 'uppercase'
                      }}>
                        {badgeText}{ptsText}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
              <button
                className="btn btn-secondary"
                onClick={cancelMatch}
                style={{ borderRadius: 100, padding: '10px 20px', fontSize: '0.85rem' }}
                id="cancel-progress-match"
              >
                {lang === 'it' ? 'Annulla Match' : 'Cancel Match'}
              </button>
              
              <button
                className="btn btn-primary"
                style={{
                  padding: '10px 24px', borderRadius: 100,
                  boxShadow: '0 0 20px var(--primary-glow)',
                  transition: 'all 0.3s',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                onClick={() => setMatchPhase('animation')}
                id="start-next-round"
              >
                <Zap size={14} />
                {lang === 'it' ? `Inizia Round ${matchRounds.length + 1}` : `Start Round ${matchRounds.length + 1}`}
              </button>

              <button
                className="btn btn-secondary"
                style={{
                  padding: '10px 24px', borderRadius: 100,
                  border: '1px solid var(--accent)',
                  color: 'var(--accent)',
                  background: 'transparent',
                  boxShadow: '0 0 20px rgba(255,215,0,0.15)',
                  transition: 'all 0.3s',
                  fontSize: '0.85rem',
                }}
                onClick={handleAnimationReady}
                id="btn-fast-battle"
              >
                ⚡ {lang === 'it' ? 'Registra Risultato' : 'Record Result'}
              </button>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

function BracketSlot({ blader, points, isWinner, isDone, isBye, lang }: {
  blader?: Blader; points: number; isWinner: boolean; isDone: boolean; isBye?: boolean; lang: string;
}) {
  return (
    <div className={`bracket-slot${isWinner ? ' winner-slot' : ''}`}>
      <div className="flex items-center gap-sm flex-1">
        {isBye ? (
          <div
            className="avatar avatar-sm"
            style={{ background: 'var(--surface-3)', color: 'var(--text-muted)', fontFamily: 'Orbitron', fontSize: '0.55rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            💤
          </div>
        ) : blader ? (
          <div
            className="avatar avatar-sm"
            style={{ background: blader.avatar_color, color: 'white', fontFamily: 'Orbitron', fontSize: '0.55rem' }}
          >
            {blader.avatar_image ? <img src={blader.avatar_image} alt={blader.name} /> : blader.avatar_initials}
          </div>
        ) : null}
        <span className={`bracket-slot-name${isWinner ? ' winner' : ''}`} style={{ color: isBye ? 'var(--text-muted)' : undefined, fontStyle: isBye ? 'italic' : 'normal' }}>
          {isBye ? (lang === 'it' ? 'Turno Libero' : 'BYE') : (blader?.name || '—')}
        </span>
      </div>
      {isDone && !isBye && (
        <span className="bracket-slot-score" style={{ color: isWinner ? 'var(--accent)' : 'var(--text-muted)' }}>
          {points}
        </span>
      )}
    </div>
  );
}

function BladerPill({ blader, selected, onClick, id }: {
  blader?: Blader; selected: boolean; onClick: () => void; id: string;
}) {
  if (!blader) return null;
  return (
    <button
      className="card card-interactive"
      style={{
        padding: '10px 16px', cursor: 'pointer', flex: 1,
        borderColor: selected ? 'var(--accent)' : 'var(--border)',
        background: selected ? 'rgba(255,215,0,0.1)' : 'var(--surface-2)',
        textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      }}
      onClick={onClick}
      id={id}
    >
      <div
        className="avatar avatar-md"
        style={{ background: blader.avatar_color, color: 'white', fontFamily: 'Orbitron', fontSize: '0.65rem', fontWeight: 700 }}
      >
        {blader.avatar_image ? <img src={blader.avatar_image} alt={blader.name} /> : blader.avatar_initials}
      </div>
      <span style={{ fontFamily: 'Orbitron', fontSize: '0.7rem', fontWeight: 700, color: selected ? 'var(--accent)' : 'var(--text)' }}>
        {blader.name}
      </span>
      {selected && <span style={{ fontSize: '0.65rem', color: 'var(--accent)', fontFamily: 'Orbitron' }}>✓ WINNER</span>}
    </button>
  );
}

