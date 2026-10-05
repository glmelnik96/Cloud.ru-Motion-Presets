import { useEffect, useState } from 'preact/hooks';
import type { AppState, PanelApp } from '../app/controller';

// Re-renders on every state change of the controller. Preact runs effects after the paint, so the start-up
// may finish before the subscription: the state of that moment is taken right after subscribing (Premiere
// 2026-10-05: the panel stayed on «Загрузка библиотеки…» until the pointer entered it).
export function useAppState(app: PanelApp): AppState {
  const [state, setState] = useState(app.state);
  useEffect(() => {
    const off = app.subscribe(setState);
    setState(app.state);
    return off;
  }, [app]);
  return state;
}
