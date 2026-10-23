import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/Auth.jsx';
import { Skeleton } from './ui.jsx';

export function Protected({ children, admin }) {
  const { user, ready, isAdmin } = useAuth();
  const loc = useLocation();
  if (!ready) return <div className="container"><Skeleton h={300} /></div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (admin && !isAdmin) return <Navigate to="/" replace />;
  return children;
}
