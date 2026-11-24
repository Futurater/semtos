import Link from 'next/link';

const pages = [['/', 'Overview'], ['/driver', 'Commuter'], ['/ambulance', 'Ambulance'], ['/hospitals', 'Hospitals']];
export default function OperationsHeader({ active = '/' }) {
  return <header className="ops-header">
    <Link className="wordmark" aria-label="SEMTOS overview" href="/"><i aria-hidden="true"><b/><b/><b/></i>SEMTOS</Link>
    <nav aria-label="Workspace">{pages.map(([url, label]) =>
      <Link key={url} href={url} aria-current={active === url ? 'page' : undefined}>{label}</Link>)}</nav>
    <span className="city-tag">Bengaluru <i/> IN</span>
  </header>;
}
export function MapCredit({ imagery = false }) {
  return <div className="map-credit"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>{imagery && ' · Imagery © Google'}</div>;
}
