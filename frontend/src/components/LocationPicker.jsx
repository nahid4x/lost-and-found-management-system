import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const DHAKA = [90.4125, 23.8103]; // [lng, lat]
const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// Public area name only: neighbourhood + city, never the street or house number
async function reverseGeocode(lat, lng, signal) {
  const url =
    "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16" +
    `&addressdetails=1&accept-language=en&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error("Reverse geocode failed");
  const { address = {} } = await res.json();
  const local =
    address.neighbourhood || address.suburb || address.quarter || address.city_district;
  const city = address.city || address.town || address.village || address.county;
  return [local, city].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");
}

export default function LocationPicker({ onChange }) {
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const watchRef = useRef(null);
  const timerRef = useRef(null);
  const abortRef = useRef(null);
  const editedRef = useRef(false);
  const coordsRef = useRef(null);

  const [coords, setCoords] = useState(null);
  const [area, setArea] = useState("");
  const [tracking, setTracking] = useState(false);
  const [status, setStatus] = useState("");

  // Report changes to the parent form
  useEffect(() => {
    if (coords) onChange?.({ lat: coords.lat, lng: coords.lng, area });
  }, [coords, area]); // eslint-disable-line

  const lookupArea = (lat, lng) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (editedRef.current) return; // don't overwrite what the user typed
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setStatus("Finding area name…");
      try {
        const name = await reverseGeocode(lat, lng, abortRef.current.signal);
        if (!editedRef.current) setArea(name);
        setStatus("");
      } catch (e) {
        if (e.name !== "AbortError") setStatus("Couldn't detect the area, type it manually.");
      }
    }, 700); // debounce: Nominatim allows ~1 request/second
  };

  const setPoint = (lat, lng, { fly = false } = {}) => {
    coordsRef.current = { lat, lng };
    setCoords({ lat, lng });
    markerRef.current?.setLngLat([lng, lat]);
    if (fly) mapRef.current?.flyTo({ center: [lng, lat], zoom: 16, speed: 1.4 });
    lookupArea(lat, lng);
  };

  const stopTracking = () => {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    setTracking(false);
  };

  // Map setup
  useEffect(() => {
    const map = new maplibregl.Map({
      container: boxRef.current,
      style: STYLE,
      center: DHAKA,
      zoom: 12,
      pitch: 30,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");

    const marker = new maplibregl.Marker({ draggable: true, color: "#6d5efc" })
      .setLngLat(DHAKA)
      .addTo(map);

    marker.on("dragend", () => {
      stopTracking(); // user took manual control
      editedRef.current = false;
      const { lat, lng } = marker.getLngLat();
      setPoint(lat, lng);
    });

    map.on("click", (e) => {
      stopTracking();
      editedRef.current = false;
      setPoint(e.lngLat.lat, e.lngLat.lng);
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      stopTracking();
      clearTimeout(timerRef.current);
      abortRef.current?.abort();
      map.remove();
    };
  }, []); // eslint-disable-line

  const startLive = () => {
    if (!navigator.geolocation) return setStatus("Geolocation isn't supported in this browser.");
    editedRef.current = false;
    setTracking(true);
    setStatus("Getting your location…");
    let first = true;
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const prev = coordsRef.current;
        // skip tiny GPS jitter (~10 m) to avoid spamming the geocoder
        const moved = !prev || Math.abs(prev.lat - latitude) + Math.abs(prev.lng - longitude) > 0.0001;
        if (first || moved) setPoint(latitude, longitude, { fly: first });
        first = false;
        setStatus("");
      },
      (err) => {
        stopTracking();
        setStatus(
          err.code === 1
            ? "Location permission denied. Allow it in your browser, or drop the pin by hand."
            : "Couldn't get your location."
        );
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  };

  return (
    <div>
      <div ref={boxRef} style={{ height: 360, borderRadius: 16, overflow: "hidden" }} />
      <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "12px 0" }}>
        <button type="button" onClick={tracking ? stopTracking : startLive}>
          {tracking ? "⏹ Stop live location" : "📍 Use my live location"}
        </button>
        <small>
          {coords
            ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)} (only the approximate area is shown publicly)`
            : "Tap the map, drag the pin, or use live location"}
        </small>
      </div>

      <label>Area name (public)</label>
      <input
        value={area}
        placeholder="Auto-detected, e.g. Gulistan, Dhaka"
        onChange={(e) => {
          editedRef.current = true;
          setArea(e.target.value);
        }}
      />
      <small>{status || "Shown on the report instead of your exact pin."}</small>
    </div>
  );
}