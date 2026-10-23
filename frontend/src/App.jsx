import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ToastProvider } from './context/Toast.jsx';
import { AuthProvider } from './context/Auth.jsx';
import { LiveProvider } from './context/Live.jsx';
import { CallProvider } from './context/Call.jsx';
import { Navbar } from './components/Navbar.jsx';
import { Protected } from './components/RouteGuards.jsx';
import { Skeleton } from './components/ui.jsx';

const Home = lazy(() => import('./pages/Home.jsx'));
const ItemsPage = lazy(() => import('./pages/ItemsPage.jsx'));
const MapPage = lazy(() => import('./pages/MapPage.jsx'));
const ItemDetail = lazy(() => import('./pages/ItemDetail.jsx'));
const ReportPage = lazy(() => import('./pages/ReportPage.jsx'));
const MyReports = lazy(() => import('./pages/MyReports.jsx'));
const Claims = lazy(() => import('./pages/Claims.jsx'));
const Messages = lazy(() => import('./pages/Messages.jsx'));
const Notifications = lazy(() => import('./pages/Notifications.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));
const AuthPages = lazy(() => import('./pages/AuthPages.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

const fallback = <div className="container"><Skeleton h={320} /></div>;

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <LiveProvider>
          <CallProvider>
            <a className="skip" href="#main">Skip to content</a>
            <Navbar />
            <main id="main">
              <Suspense fallback={fallback}>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/lost" element={<ItemsPage type="lost" />} />
                  <Route path="/found" element={<ItemsPage type="found" />} />
                  <Route path="/map" element={<MapPage />} />
                  <Route path="/items/:id" element={<ItemDetail />} />
                  <Route path="/report/:type" element={<Protected><ReportPage /></Protected>} />
                  <Route path="/my-reports" element={<Protected><MyReports /></Protected>} />
                  <Route path="/claims" element={<Protected><Claims /></Protected>} />
                  <Route path="/messages" element={<Protected><Messages /></Protected>} />
                  <Route path="/messages/:id" element={<Protected><Messages /></Protected>} />
                  <Route path="/notifications" element={<Protected><Notifications /></Protected>} />
                  <Route path="/profile" element={<Protected><Profile /></Protected>} />
                  <Route path="/admin" element={<Protected admin><Admin /></Protected>} />
                  <Route path="/login" element={<AuthPages mode="login" />} />
                  <Route path="/register" element={<AuthPages mode="register" />} />
                  <Route path="/forgot-password" element={<AuthPages mode="forgot" />} />
                  <Route path="/reset-password" element={<AuthPages mode="reset" />} />
                  <Route path="/verify-email" element={<AuthPages mode="verify" />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </main>
            <footer className="footer">FindIt · Lost &amp; found, together. Map © OpenStreetMap contributors</footer>
          </CallProvider>
        </LiveProvider>
      </AuthProvider>
    </ToastProvider>
  );
}