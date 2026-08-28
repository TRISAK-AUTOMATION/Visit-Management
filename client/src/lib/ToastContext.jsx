// client/src/lib/ToastContext.jsx - เทียบเท่าฟังก์ชัน toast() เดิมใน public/js/api.js
import React, { createContext, useContext, useCallback, useRef, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null); // { message, type }
  const timerRef = useRef(null);

  const showToast = useCallback((message, type = 'default') => {
    setToast({ message, type });
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className={`toast ${toast ? 'show ' + toast.type : ''}`}>{toast ? toast.message : ''}</div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
