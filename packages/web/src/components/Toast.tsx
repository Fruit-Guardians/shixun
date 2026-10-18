import { ChevronUp } from 'lucide-react';

export function Toast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="toast" role="status">
      <b>[ OK ]</b>
      {message}
    </div>
  );
}

export function BackToTop({ show }: { show: boolean }) {
  return (
    <button
      className={`to-top ${show ? 'show' : ''}`}
      aria-label="回到顶部"
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
      onClick={() => scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <ChevronUp size={18} />
    </button>
  );
}
