'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';

/** Field properties from Admin → Field properties, loaded once per session. */
const ConfigContext = createContext({});
const ScreenContext = createContext(null);

export function FieldConfigProvider({ children }) {
  const [fields, setFields] = useState({});
  useEffect(() => { api('/ui/fields').then((r) => setFields(r.fields || {})).catch(() => {}); }, []);
  return <ConfigContext.Provider value={fields}>{children}</ConfigContext.Provider>;
}

/** Names the screen for the fields inside it (e.g. "fire.business"); keys are the field ids. */
export function FieldScreen({ name, children }) {
  return <ScreenContext.Provider value={name}>{children}</ScreenContext.Provider>;
}

/** Field ids for repeated rows end in an index (building0, building1); they share one configuration. */
export function useFieldConfig(id) {
  const fields = useContext(ConfigContext);
  const screen = useContext(ScreenContext);
  if (!screen || !id) return null;
  return fields[screen]?.[String(id).replace(/\d+$/, '')] || null;
}

export const useFieldScreen = () => useContext(ScreenContext);
