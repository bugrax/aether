import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { labelsAPI } from './api';
import { initAnalytics } from './analytics';
import Sidebar from './components/Sidebar';
import SplashScreen from './components/SplashScreen';
import OnboardingPage from './pages/OnboardingPage';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import VaultPage from './pages/VaultPage';
import EditorPage from './pages/EditorPage';
import SharePage from './pages/SharePage';
import SettingsPage from './pages/SettingsPage';
import SynthesisViewPage from './pages/SynthesisViewPage';
import SharedNotePage from './pages/SharedNotePage';

function ProtectedLayout() {
  const { user, loading } = useAuth();
  const [labels, setLabels] = useState([]);

  const loadLabels = useCallback(async () => {
    try {
      const data = await labelsAPI.list();
      setLabels(data.labels || []);
    } catch {
      // Demo labels if API unavailable
      setLabels([
        { id: '1', name: 'Research', color: '#8B5CF6' },
        { id: '2', name: 'Design', color: '#62fae3' },
        { id: '3', name: 'Security', color: '#ff6e84' },
        { id: '4', name: 'AI', color: '#9093ff' },
      ]);
    }
  }, []);

  useEffect(() => {
    if (user) loadLabels();
  }, [user, loadLabels]);

  // Redirect to login only after loading is done and no user
  if (!loading && !user) {
    return <Navigate to="/login" replace />;
  }

  // Always render Sidebar (mobile nav stays visible during loading)
  return (
    <div className="app-layout">
      <Sidebar labels={labels} onLabelsChanged={loadLabels} />
      {loading ? (
        <div className="main-content">
          <div className="loading-state" style={{ height: '100%' }}>
            <div className="loading-spinner" />
          </div>
        </div>
      ) : (
        <Outlet context={{ labels, reloadLabels: loadLabels }} />
      )}
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem('aether_onboarded') === '1');

  // Show onboarding for users who haven't seen it yet
  if (!onboarded && !loading) {
    return <OnboardingPage onComplete={() => setOnboarded(true)} />;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          loading ? (
            <div className="loading-state" style={{ height: '100vh' }}>
              <div className="loading-spinner" />
            </div>
          ) : user ? (
            <Navigate to="/vault" replace />
          ) : (
            <LoginPage />
          )
        }
      />
      <Route path="/shared/:token" element={<SharedNotePage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/vault" element={<DashboardPage />} />
        <Route path="/vault/list" element={<VaultPage />} />
        <Route path="/vault/synthesis/:id" element={<SynthesisViewPage />} />
        <Route path="/vault/:id" element={<EditorPage />} />
        <Route path="/share" element={<SharePage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={
        loading ? (
          <div className="loading-state" style={{ height: '100vh' }}>
            <div className="loading-spinner" />
          </div>
        ) : (
          <Navigate to={user ? '/vault' : '/login'} replace />
        )
      } />
    </Routes>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => { initAnalytics(); }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <LanguageProvider>
          {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
          {!showSplash && <AppRoutes />}
        </LanguageProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
