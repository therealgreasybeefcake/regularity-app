import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ElementPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WalkthroughContextType {
  elementPositions: {
    startButton?: ElementPosition;
    lapHistory?: ElementPosition;
    driverTabs?: ElementPosition;
    settingsTab?: ElementPosition;
  };
  setElementPosition: (element: string, position: ElementPosition) => void;
}

const WalkthroughContext = createContext<WalkthroughContextType | undefined>(undefined);

export const WalkthroughProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [elementPositions, setElementPositions] = useState<{
    startButton?: ElementPosition;
    lapHistory?: ElementPosition;
    driverTabs?: ElementPosition;
    settingsTab?: ElementPosition;
  }>({});

  const setElementPosition = (element: string, position: ElementPosition) => {
    setElementPositions(prev => ({
      ...prev,
      [element]: position,
    }));
  };

  return (
    <WalkthroughContext.Provider value={{ elementPositions, setElementPosition }}>
      {children}
    </WalkthroughContext.Provider>
  );
};

export const useWalkthroughContext = () => {
  const context = useContext(WalkthroughContext);
  if (context === undefined) {
    throw new Error('useWalkthroughContext must be used within a WalkthroughProvider');
  }
  return context;
};
