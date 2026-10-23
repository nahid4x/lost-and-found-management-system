import { Link } from 'react-router-dom';
import { Empty } from '../components/ui.jsx';
export default function NotFound() {
  return <div className="container"><Empty icon="🧭" title="Page not found" action={<Link to="/" className="btn primary">Back home</Link>}>We could not find what you were looking for.</Empty></div>;
}
