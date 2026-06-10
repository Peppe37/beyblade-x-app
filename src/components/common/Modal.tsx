import { ReactNode } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
  closeOnOverlayClick?: boolean;
}

export default function Modal({ title, onClose, children, maxWidth = 560, closeOnOverlayClick = true }: ModalProps) {
  return (
    <div className="modal-overlay" onClick={(e) => { if (closeOnOverlayClick && e.target === e.currentTarget) onClose(); }}>
      <div className="modal animate-slide-up" style={{ maxWidth }}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            id="modal-close"
            style={{ padding: '6px', borderRadius: '50%', minWidth: 32, minHeight: 32 }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
