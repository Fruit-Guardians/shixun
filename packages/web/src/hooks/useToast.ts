import { useCallback, useEffect, useRef, useState } from 'react';

const VISIBLE_MS = 3000;

export function useToast(): [message: string, show: (message: string) => void] {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback((next: string) => {
    clearTimeout(timer.current);
    setMessage(next);
    timer.current = setTimeout(() => setMessage(''), VISIBLE_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);
  return [message, show];
}
