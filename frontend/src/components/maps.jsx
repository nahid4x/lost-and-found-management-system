import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import { Button } from './ui.jsx';

// OpenStreetMap tiles (no API key). Dark look comes from the .osm-dark CSS filter.
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTR = '&copy; OpenStreetMap contributors';
const CENTER = [23.81, 90.41];
const dot = (type) => L.divIcon({ className: '', html: `<div class="dot ${type === 'found' ? 'found' : 'lost'}"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
const pin = L.divIcon({ className: '', html: '<div class="dot found" style="background:#8b6dff;color:#8b6dff"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });

// Reverse geocode (lat/lng -> "Suburb, City"). Only the approximate area, never the street.
async function areaFromCoords(lat, lng) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1&accept-language=en&lat=${lat}&lon=${lng}`);
    if (!r.ok) return '';
    const { address: a = {} } = await r.json();
    const area = a.suburb || a.neighbourhood || a.quarter || a.village || a.city_district;
    const city = a.city || a.town || a.county || a.state_district;
    return [...new Set([area, city].filter(Boolean))].join(', ');
  } catch {
    return '';
  }
}

function Clusters({ items, onSelect }) {
  const map = useMap();
  const group = useRef(null);
  useEffect(() => {
    group.current = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 48, spiderfyOnMaxZoom: true });
    map.addLayer(group.current);
    return () => { map.removeLayer(group.current); };
  }, [map]);
  useEffect(() => {
    const g = group.current; g.clearLayers();
    const markers = items.map((i) => {
      // No HTML popups: marker text goes through the `title` attribute only (no injection surface).
      const m = L.marker([i.lat, i.lng], { icon: dot(i.type), title: `${i.type}: ${i.title}`, keyboard: true });
      m.on('click', () => onSelect?.(i));
      return m;
    });
    g.addLayers(markers);
    if (markers.length) { const b = g.getBounds(); if (b.isValid()) map.fitBounds(b.pad(0.2), { maxZoom: 14, animate: false }); }
  }, [items, map, onSelect]);
  return null;
}

export function MapView({ items, onSelect, tall }) {
  return (
    <div className={tall ? 'map tall' : 'map'}>
      <MapContainer center={CENTER} zoom={11} style={{ height: '100%' }} scrollWheelZoom>
        <TileLayer url={TILES} attribution={ATTR} maxZoom={19} className="osm-dark" />
        <Clusters items={items} onSelect={onSelect} />
      </MapContainer>
    </div>
  );
}

function ClickToPlace({ onPick }) { useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) }); return null; }
function Fly({ value }) { const map = useMap(); useEffect(() => { if (value) map.flyTo([value.lat, value.lng], Math.max(map.getZoom(), 15), { duration: 0.6 }); }, [value, map]); return null; }

// onChange({lat, lng}) sets the pin. Optional onArea(name) receives the auto-detected area name.
export function MapPicker({ value, onChange, onArea }) {
  const reqId = useRef(0);
  const [msg, setMsg] = useState('');

  const pick = async (lat, lng) => {
    const point = { lat: +lat.toFixed(6), lng: +lng.toFixed(6) };
    onChange(point);
    if (!onArea) return;
    const id = ++reqId.current;
    const name = await areaFromCoords(point.lat, point.lng);
    if (id === reqId.current && name) onArea(name); // ignore stale responses
  };

  const locate = () => {
    if (!navigator.geolocation) { setMsg('Location is not supported in this browser.'); return; }
    setMsg('Finding your location...');
    navigator.geolocation.getCurrentPosition(
      (p) => { setMsg(''); pick(p.coords.latitude, p.coords.longitude); },
      (e) => setMsg(e.code === 1 ? 'Location is blocked. Allow it in your browser site settings.' : 'Could not get your location. Try again or click the map.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  return (
    <div className="col">
      <div className="map" aria-label="Map: click to drop a pin">
        <MapContainer center={value ? [value.lat, value.lng] : CENTER} zoom={value ? 15 : 11} style={{ height: '100%' }}>
          <TileLayer url={TILES} attribution={ATTR} maxZoom={19} className="osm-dark" />
          <ClickToPlace onPick={pick} />
          {value && <Marker position={[value.lat, value.lng]} icon={pin} draggable eventHandlers={{ dragend: (e) => { const p = e.target.getLatLng(); pick(p.lat, p.lng); } }} />}
          <Fly value={value} />
        </MapContainer>
      </div>
      <div className="row">
        <Button type="button" size="sm" onClick={locate}>Use my location</Button>
        <span className="hint">{msg || (value ? `${value.lat.toFixed(4)}, ${value.lng.toFixed(4)} (only the approximate area is shown publicly)` : 'Click the map to drop a pin')}</span>
      </div>
    </div>
  );
}

export function ApproxMap({ lat, lng, exact }) {
  return (
    <div className="map" style={{ height: 240 }}>
      <MapContainer center={[lat, lng]} zoom={exact ? 16 : 13} style={{ height: '100%' }} scrollWheelZoom={false}>
        <TileLayer url={TILES} attribution={ATTR} maxZoom={19} className="osm-dark" />
        {exact ? <Marker position={[lat, lng]} icon={pin} /> : <Circle center={[lat, lng]} radius={900} pathOptions={{ color: '#2dd4bf', fillColor: '#2dd4bf', fillOpacity: 0.18 }} />}
      </MapContainer>
    </div>
  );
}