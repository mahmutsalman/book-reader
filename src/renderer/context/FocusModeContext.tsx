import React, { createContext, useContext, useState, ReactNode } from 'react';

interface FocusModeContextType {
  isFocusMode: boolean;
  setIsFocusMode: (value: boolean) => void;
}

const FocusModeContext = createContext<FocusModeContextType | null>(null);

export const useFocusMode = () => {
  const context = useContext(FocusModeContext);
  if (!context) {
    throw new Error('useFocusMode must be used within FocusModeProvider');
  }
  return context;
};

interface FocusModeProviderProps {
  children: ReactNode;
}

export const FocusModeProvider: React.FC<FocusModeProviderProps> = ({ children }) => {
  const [isFocusMode, setIsFocusMode] = useState(false);

  return (
    <FocusModeContext.Provider value={{ isFocusMode, setIsFocusMode }}>
      {children}
    </FocusModeContext.Provider>
  );
};
