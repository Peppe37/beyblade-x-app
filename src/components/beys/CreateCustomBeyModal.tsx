import { useState, useMemo, useEffect } from 'react';
import { useBladers, useToast, useSettings, useParts } from '../../store';
import { Part } from '../../types';
import { X, Save, Filter } from 'lucide-react';

function typeClassFromName(name: string): string {
  const n = name.toLowerCase();
  if (/sword|claw|fang|shark|dagger|slash/.test(n)) return 'attack';
  if (/shield|knight|armor|iron|steel/.test(n)) return 'defense';
  if (/wyvern|phoenix|halo|eternal|abyss/.test(n)) return 'stamina';
  return 'balance';
}

function makeStats(typeClass: string) {
  const base = { weight: 60, attack: 50, defense: 50, stamina: 50, speed: 50 };
  if (typeClass === 'attack')  return { ...base, attack: 85, defense: 35, stamina: 30, speed: 80 };
  if (typeClass === 'defense') return { ...base, attack: 35, defense: 85, stamina: 70, speed: 30 };
  if (typeClass === 'stamina') return { ...base, attack: 30, defense: 55, stamina: 85, speed: 60 };
  return base;
}

export default function CreateCustomBeyModal({
  onClose,
  lang,
}: {
  onClose: () => void;
  lang: 'it' | 'en';
}) {
  const { createCustomBey } = useBladers();
  const { addToast } = useToast();
  const { currentBladerId } = useSettings();
  const { parts, ownedPartIds, fetchParts, fetchOwnedParts } = useParts();

  const [name, setName] = useState('');
  const [bladeId, setBladeId] = useState('');
  const [ratchetId, setRatchetId] = useState('');
  const [bitId, setBitId] = useState('');
  const [assistBladeId, setAssistBladeId] = useState('');
  const [lockChipId, setLockChipId] = useState('');
  const [overBladeId, setOverBladeId] = useState('');
  const [color, setColor] = useState('#00d4ff');
  const [onlyMine, setOnlyMine] = useState(false);

  useEffect(() => {
    if (parts.length === 0) fetchParts();
    if (currentBladerId) fetchOwnedParts(currentBladerId);
  }, []);

  const visible = (p: Part) => !onlyMine || ownedPartIds.has(p.id);

  const blades = useMemo(() => parts.filter(p => p.part_type === 'blade' && visible(p)), [parts, onlyMine, ownedPartIds]);
  const ratchets = useMemo(() => parts.filter(p => p.part_type === 'ratchet' && visible(p)), [parts, onlyMine, ownedPartIds]);
  const bits = useMemo(() => parts.filter(p => p.part_type === 'bit' && visible(p)), [parts, onlyMine, ownedPartIds]);
  const assistBlades = useMemo(() => parts.filter(p => p.part_type === 'assist_blade' && visible(p)), [parts, onlyMine, ownedPartIds]);
  const lockChips = useMemo(() => parts.filter(p => p.part_type === 'lock_chip' && visible(p)), [parts, onlyMine, ownedPartIds]);
  const overBlades = useMemo(() => parts.filter(p => p.part_type === 'over_blade' && visible(p)), [parts, onlyMine, ownedPartIds]);

  const selectedBlade = parts.find(p => p.id === bladeId);
  const isCXNew = selectedBlade?.series === 'CX New';
  const isCX = selectedBlade?.series === 'CX' && !isCXNew;

  const ratchetLabel = (p: Part) =>
    p.protrusions && p.height ? `${p.protrusions}-${p.height}` : p.name;

  const typeClass = selectedBlade ? typeClassFromName(selectedBlade.name) : 'balance';
  const stats = makeStats(typeClass);

  const isComplete = name && bladeId && ratchetId && bitId;

  const handleSave = async () => {
    if (!isComplete) {
      addToast(lang === 'it' ? 'Compila tutti i campi obbligatori' : 'Fill all required fields', 'error');
      return;
    }
    try {
      const rp = parts.find(p => p.id === ratchetId);
      await createCustomBey({
        blader_id: currentBladerId ?? undefined,
        name,
        blade: selectedBlade!.name,
        ratchet: rp ? ratchetLabel(rp) : '',
        bit: parts.find(p => p.id === bitId)?.name ?? '',
        type_class: typeClass,
        color,
        stats: JSON.stringify(stats),
        blade_part_id: bladeId,
        ratchet_part_id: ratchetId,
        bit_part_id: bitId,
        assist_blade_part_id: assistBladeId || undefined,
        lock_chip_part_id: lockChipId || undefined,
        over_blade_part_id: overBladeId || undefined,
      });
      addToast(lang === 'it' ? 'Bey creato con successo!' : 'Bey created successfully!');
      onClose();
    } catch (e: any) {
      addToast(e.toString(), 'error');
    }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 760 }}>
        <div className="modal-header">
          <h2 className="modal-title">{lang === 'it' ? 'Crea Bey Personalizzato' : 'Create Custom Bey'}</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {currentBladerId && (
              <button
                className={`btn btn-sm ${onlyMine ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setOnlyMine(o => !o)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem' }}
              >
                <Filter size={13} />
                {lang === 'it' ? 'Solo i miei' : 'Mine only'}
              </button>
            )}
            <button className="btn btn-ghost" style={{ padding: 8 }} onClick={onClose}><X size={20} /></button>
          </div>
        </div>

        <div className="grid-2" style={{ gap: 28 }}>
          {/* Form */}
          <div>
            <div className="form-group">
              <label className="form-label">{lang === 'it' ? 'Nome Beyblade' : 'Beyblade Name'} *</label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="es. Dran Buster" />
            </div>

            <div className="form-group">
              <label className="form-label">Blade *</label>
              <select className="form-select" value={bladeId} onChange={e => { setBladeId(e.target.value); setAssistBladeId(''); setOverBladeId(''); setLockChipId(''); }}>
                <option value="">-- {lang === 'it' ? 'Seleziona' : 'Select'} --</option>
                {blades.map(p => (
                  <option key={p.id} value={p.id}>{p.name}{p.serial ? ` (${p.serial})` : ''}{p.series ? ` — ${p.series}` : ''}</option>
                ))}
              </select>
              {blades.length === 0 && <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>{lang === 'it' ? 'Nessun blade nel DB' : 'No blades in DB'}</p>}
            </div>

            {isCX && (
              <div className="form-group">
                <label className="form-label">Assist Blade</label>
                <select className="form-select" value={assistBladeId} onChange={e => setAssistBladeId(e.target.value)}>
                  <option value="">-- {lang === 'it' ? 'Seleziona' : 'Select'} --</option>
                  {assistBlades.map(p => <option key={p.id} value={p.id}>{p.name}{p.serial ? ` (${p.serial})` : ''}</option>)}
                </select>
              </div>
            )}

            {isCXNew && (
              <div className="form-group">
                <label className="form-label">Over Blade</label>
                <select className="form-select" value={overBladeId} onChange={e => setOverBladeId(e.target.value)}>
                  <option value="">-- {lang === 'it' ? 'Seleziona' : 'Select'} --</option>
                  {overBlades.map(p => <option key={p.id} value={p.id}>{p.name}{p.serial ? ` (${p.serial})` : ''}</option>)}
                </select>
              </div>
            )}

            {(isCX || isCXNew) && (
              <div className="form-group">
                <label className="form-label">Lock Chip</label>
                <select className="form-select" value={lockChipId} onChange={e => setLockChipId(e.target.value)}>
                  <option value="">-- {lang === 'it' ? 'Seleziona' : 'Select'} --</option>
                  {lockChips.map(p => <option key={p.id} value={p.id}>{p.name}{p.serial ? ` (${p.serial})` : ''}</option>)}
                </select>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Ratchet *</label>
              <select className="form-select" value={ratchetId} onChange={e => setRatchetId(e.target.value)}>
                <option value="">-- {lang === 'it' ? 'Seleziona' : 'Select'} --</option>
                {ratchets.map(p => <option key={p.id} value={p.id}>{ratchetLabel(p)}{p.series ? ` — ${p.series}` : ''}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Bit *</label>
              <select className="form-select" value={bitId} onChange={e => setBitId(e.target.value)}>
                <option value="">-- {lang === 'it' ? 'Seleziona' : 'Select'} --</option>
                {bits.map(p => <option key={p.id} value={p.id}>{p.name}{p.serial ? ` (${p.serial})` : ''}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{lang === 'it' ? 'Colore Principale' : 'Main Color'}</label>
              <input type="color" className="form-input" value={color} onChange={e => setColor(e.target.value)} style={{ height: 48, padding: 4 }} />
            </div>
          </div>

          {/* Preview */}
          <div className="card" style={{ background: 'var(--surface-2)', border: `1px solid ${color}66` }}>
            <h3 style={{ fontFamily: 'Orbitron', marginBottom: 16, color, textShadow: `0 0 10px ${color}44` }}>
              {name || (lang === 'it' ? 'Anteprima Bey' : 'Bey Preview')}
            </h3>

            {bladeId ? (
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  <span className={`badge badge-${typeClass}`}>{typeClass}</span>
                  {selectedBlade?.series && <span className="badge badge-muted">{selectedBlade.series}</span>}
                </div>

                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {selectedBlade && <span>🔵 {selectedBlade.name}</span>}
                  {assistBladeId && <span>🔵+ {parts.find(p => p.id === assistBladeId)?.name}</span>}
                  {overBladeId && <span>🔵++ {parts.find(p => p.id === overBladeId)?.name}</span>}
                  {lockChipId && <span>🔒 {parts.find(p => p.id === lockChipId)?.name}</span>}
                  {ratchetId && <span>⚙️ {ratchetLabel(parts.find(p => p.id === ratchetId)!)}</span>}
                  {bitId && <span>🔩 {parts.find(p => p.id === bitId)?.name}</span>}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <StatBar label={lang === 'it' ? 'Attacco' : 'Attack'} value={stats.attack} color="var(--attack)" />
                  <StatBar label={lang === 'it' ? 'Difesa' : 'Defense'} value={stats.defense} color="var(--defense)" />
                  <StatBar label={lang === 'it' ? 'Resistenza' : 'Stamina'} value={stats.stamina} color="var(--stamina)" />
                  <StatBar label={lang === 'it' ? 'Velocità' : 'Speed'} value={stats.speed} color="var(--accent)" />
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '40px 0' }}>
                {lang === 'it' ? 'Seleziona Blade, Ratchet e Bit' : 'Select Blade, Ratchet and Bit'}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-between items-center" style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost" onClick={onClose}>{lang === 'it' ? 'Annulla' : 'Cancel'}</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!isComplete}>
            <Save size={16} />
            {lang === 'it' ? 'Salva Bey' : 'Save Bey'}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between" style={{ fontSize: '0.75rem', marginBottom: 4, fontFamily: 'Orbitron' }}>
        <span>{label}</span>
        <span style={{ color }}>{value}</span>
      </div>
      <div style={{ width: '100%', height: 6, background: 'var(--bg-deep)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, boxShadow: `0 0 10px ${color}` }} />
      </div>
    </div>
  );
}
