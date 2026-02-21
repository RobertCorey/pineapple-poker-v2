import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const PreviewPage = lazy(() => import('./preview/PreviewPage.tsx').then(m => ({ default: m.PreviewPage })));
const AdminPage = lazy(() => import('./components/AdminPage.tsx'));
const isAdmin = window.location.pathname === '/admin';
const isPreview = window.location.pathname === '/preview';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAdmin ? (
      <Suspense fallback={<div className="bg-gray-950 h-screen" />}>
        <AdminPage />
      </Suspense>
    ) : isPreview ? (
      <Suspense fallback={<div className="bg-gray-950 h-screen" />}>
        <PreviewPage />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
