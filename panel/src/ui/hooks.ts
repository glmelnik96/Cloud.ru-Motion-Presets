import { useEffect, useState } from 'preact/hooks';
import type { AppState, PanelApp } from '../app/controller';

// Re-renders on every state change of the controller.
export function useAppState(app: PanelApp): AppState {
  const [state, setState] = useState(app.state);
  useEffect(() => app.subscribe(setState), [app]);
  return state;
}
