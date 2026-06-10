import { useState, useMemo } from 'react';
import { BLADES, RATCHETS, BITS, calculateStats } from '../../data/parts';
import { useBladers, useToast } from '../../store';
import { X, Save } from 'lucide-react';

export default function CreateCustomBeyModal({ 
  onClose,
  lang 
}: { 
  onClose: () => void;
  lang: 'it' | 'en';
}) {
  const { createCustomBey } = useBladers();
  const { addToast } = useToast();

  const [name, setName] = useState('');
  const [bladeId, setBladeId] = useState('');
  const [ratchetId, setRatchetId] = useState('');
  const [bitId, setBitId] = useState('');
  const [color, setColor] = useState('#00d4ff');

  const stats = useMemo(() => {
    if (!bladeId || !ratchetId || !bitId) return null;
    return calculateStats(bladeId, ratchetId, bitId);
  }, [bladeId, ratchetId, bitId]);

  const handleSave = async () => {
    if (!name || !bladeId || !ratchetId || !bitId || !stats) {
      addToast(lang === 'it' ? 'Compila tutti i campi' : 'Fill all fields', 'error');
      return;
    }
    try {
      const bladeName = BLADES.find(b => b.id === bladeId)!.name;
      const ratchetName = RATCHETS.find(r => r.id === ratchetId)!.name;
      const bitName = BITS.find(b => b.id === bitId)!.name;

      await createCustomBey({
        blader_id: null,
        name,
        blade: bladeName,
        ratchet: ratchetName,
        bit: bitName,
        type_class: stats.typeClass,
        color,
        stats: JSON.stringify({
          weight: stats.weight,
          attack: stats.attack,
          defense: stats.defense,
          stamina: stats.stamina,
          speed: stats.speed,
        })
      });
      addToast(lang === 'it' ? 'Bey creato con successo!' : 'Bey created successfully!');
      onClose();
    } catch (e: any) {
      addToast(e.toString(), 'error');
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 800 }}>
        <div className="modal-header">
          <h2 className="modal-title">{lang === 'it' ? 'Crea Bey Personalizzato' : 'Create Custom Bey'}</h2>
          <button className="btn btn-ghost" style={{ padding: 8 }} onClick={onClose}><X size={20} /></button>
        </div>

        <div className="grid-2" style={{ gap: 32 }}>
          {/* Form */}
          <div>
            <div className="form-group">
              <label className="form-label">Nome Beyblade</label>
              <input 
                className="form-input" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="es. Dran Buster"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Blade</label>
              <select className="form-select" value={bladeId} onChange={e => setBladeId(e.target.value)}>
                <option value="">-- Seleziona Blade --</option>
                {BLADES.map(b => <option key={b.id} value={b.id}>{b.name} ({b.type})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Ratchet</label>
              <select className="form-select" value={ratchetId} onChange={e => setRatchetId(e.target.value)}>
                <option value="">-- Seleziona Ratchet --</option>
                {RATCHETS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Bit</label>
              <select className="form-select" value={bitId} onChange={e => setBitId(e.target.value)}>
                <option value="">-- Seleziona Bit --</option>
                {BITS.map(b => <option key={b.id} value={b.id}>{b.name} ({b.type})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Colore Principale</label>
              <input 
                type="color" 
                className="form-input" 
                value={color} 
                onChange={e => setColor(e.target.value)} 
                style={{ height: 48, padding: 4 }}
              />
            </div>
          </div>

          {/* Preview */}
          <div className="card" style={{ background: 'var(--surface-2)', border: `1px solid ${color}66` }}>
            <h3 style={{ fontFamily: 'Orbitron', marginBottom: 16, color: color, textShadow: `0 0 10px ${color}44` }}>
              {name || 'Anteprima Bey'}
            </h3>

            {stats ? (
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <span className={`badge badge-${stats.typeClass}`}>{stats.typeClass}</span>
                  <span className="badge badge-muted">{stats.weight}g</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <StatBar label="Attacco" value={stats.attack} color="var(--attack)" />
                  <StatBar label="Difesa" value={stats.defense} color="var(--defense)" />
                  <StatBar label="Resistenza" value={stats.stamina} color="var(--stamina)" />
                  <StatBar label="Velocità" value={stats.speed} color="var(--accent)" />
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '40px 0' }}>
                {lang === 'it' ? 'Seleziona Blade, Ratchet e Bit per visualizzare le statistiche' : 'Select Blade, Ratchet and Bit to view stats'}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-between items-center" style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost" onClick={onClose}>
            {lang === 'it' ? 'Annulla' : 'Cancel'}
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!stats || !name}>
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
