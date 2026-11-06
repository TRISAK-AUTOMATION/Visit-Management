// client/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './lib/AuthContext';
import { ToastProvider } from './lib/ToastContext';
import { PageContentProvider } from './lib/PageContentContext';
import './style.css';
import './components/ui-kit.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <PageContentProvider>
            <App />
          </PageContentProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
