import React, { useCallback, useEffect, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps';
import {
  Compass,
  ExternalLink,
  Loader2,
  MapPin,
  Navigation,
  Search,
  Trash2,
} from 'lucide-react';
import type { MapsGroundingPlace } from '../lib/aiValidation';
import {
  AiApiError,
  deleteMeetupSpot,
  fetchMeetupSpots,
  queryMapsGrounding,
  saveMeetupSpot,
  type MeetupSpotRecord,
} from '../services/aiClient';

const DEFAULT_CAMPUS_CENTER = { lat: 5.6506, lng: -0.187 };

interface MeetupSpotMarkerProps {
  spot: MeetupSpotRecord;
  selected: boolean;
  onSelect: () => void;
  onClose: () => void;
  onDelete: (id: number) => void;
}

function MeetupSpotMarker({
  spot,
  selected,
  onSelect,
  onClose,
  onDelete,
}: MeetupSpotMarkerProps) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: spot.lat, lng: spot.lng }}
        onClick={onSelect}
        title={spot.name}
      >
        <Pin
          background="#064e3b"
          borderColor="#022c22"
          glyphColor="#ecfdf5"
        />
      </AdvancedMarker>

      {selected && marker && (
        <InfoWindow anchor={marker} maxWidth={260} onCloseClick={onClose}>
          <div className="p-1 space-y-1.5 text-zinc-900">
            <p className="text-sm font-bold leading-snug">{spot.name}</p>
            <p className="text-xs text-zinc-600">{spot.address}</p>
            {spot.notes && (
              <p className="text-xs text-zinc-700 border-t border-stone-200 pt-1">
                {spot.notes}
              </p>
            )}
            <div className="flex items-center justify-between gap-2 pt-1">
              {spot.placeUri ? (
                <a
                  href={spot.placeUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-900 underline"
                >
                  Open in Maps
                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                </a>
              ) : (
                <span className="text-[11px] font-mono text-zinc-500">
                  {spot.lat.toFixed(4)}, {spot.lng.toFixed(4)}
                </span>
              )}
              <button
                type="button"
                onClick={() => onDelete(spot.id)}
                className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-800"
              >
                <Trash2 className="w-3 h-3" aria-hidden="true" />
                Remove
              </button>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

export function CampusMapPage() {
  const mapsApiKey =
    (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || '';

  const [spots, setSpots] = useState<MeetupSpotRecord[]>([]);
  const [selectedSpotId, setSelectedSpotId] = useState<number | null>(null);
  const [draftPin, setDraftPin] = useState<{ lat: number; lng: number } | null>(null);
  const [spotName, setSpotName] = useState('');
  const [spotAddress, setSpotAddress] = useState('');
  const [spotNotes, setSpotNotes] = useState('');
  const [savingSpot, setSavingSpot] = useState(false);

  const [groundingQuery, setGroundingQuery] = useState(
    'Safe daylight public libraries or campus cafes for student meetups nearby'
  );
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locating, setLocating] = useState(false);
  const [groundingLoading, setGroundingLoading] = useState(false);
  const [groundingText, setGroundingText] = useState('');
  const [groundingPlaces, setGroundingPlaces] = useState<MapsGroundingPlace[]>([]);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CAMPUS_CENTER);
  const [error, setError] = useState('');
  const [spotMessage, setSpotMessage] = useState('');

  const loadSpots = useCallback(async () => {
    try {
      const saved = await fetchMeetupSpots();
      setSpots(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load saved meetup spots.');
    }
  }, []);

  useEffect(() => {
    void loadSpots();
  }, [loadSpots]);

  const handleLocateMe = () => {
    setError('');
    if (!navigator.geolocation) {
      setError('Geolocation is not supported in this browser.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
        setUserLocation(coords);
        setMapCenter({ lat: coords.latitude, lng: coords.longitude });
        setLocating(false);
      },
      () => {
        setError('Unable to access your current location. Allow location permission or search by campus name.');
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  };

  const handleMapClick = (event: MapMouseEvent) => {
    const latLng = event.detail.latLng;
    if (!latLng) return;
    setDraftPin({ lat: latLng.lat, lng: latLng.lng });
    setSelectedSpotId(null);
    setSpotMessage('');
    if (!spotAddress.trim()) {
      setSpotAddress(`${latLng.lat.toFixed(5)}, ${latLng.lng.toFixed(5)}`);
    }
  };

  const handleSaveDraftSpot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftPin) return;
    const cleanName = spotName.trim();
    const cleanAddress = spotAddress.trim();
    if (!cleanName || !cleanAddress) {
      setError('Enter a meetup spot name and description or address.');
      return;
    }

    setSavingSpot(true);
    setError('');
    setSpotMessage('');
    try {
      const created = await saveMeetupSpot({
        name: cleanName,
        address: cleanAddress,
        lat: draftPin.lat,
        lng: draftPin.lng,
        notes: spotNotes.trim() || undefined,
      });
      setSpots((prev) => [created, ...prev]);
      setSelectedSpotId(created.id);
      setDraftPin(null);
      setSpotName('');
      setSpotAddress('');
      setSpotNotes('');
      setSpotMessage(`Saved "${created.name}" to your meetup spots.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save meetup spot.');
    } finally {
      setSavingSpot(false);
    }
  };

  const handleDeleteSpot = async (id: number) => {
    setError('');
    try {
      await deleteMeetupSpot(id);
      setSpots((prev) => prev.filter((item) => item.id !== id));
      if (selectedSpotId === id) {
        setSelectedSpotId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove meetup spot.');
    }
  };

  const handleGroundingSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = groundingQuery.trim();
    if (!clean) return;

    setGroundingLoading(true);
    setError('');
    try {
      const result = await queryMapsGrounding({
        query: clean,
        latLng: userLocation ?? {
          latitude: mapCenter.lat,
          longitude: mapCenter.lng,
        },
      });
      setGroundingText(result.text);
      setGroundingPlaces(result.places);
    } catch (err) {
      if (err instanceof AiApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Maps Grounding search failed.');
      }
    } finally {
      setGroundingLoading(false);
    }
  };

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Campus Meetup Map &amp; Grounded Place Finder
          </h1>
          <p className="text-sm text-zinc-600">
            Search verified public landmarks with Google Maps Grounding, or click the map to pin safe meetup locations for buyers and sellers.
          </p>
        </div>

        <button
          type="button"
          disabled={locating}
          onClick={handleLocateMe}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-zinc-800 bg-white border border-stone-200 hover:bg-stone-50 rounded-lg transition-colors shrink-0"
        >
          <Navigation className="w-3.5 h-3.5 text-emerald-900" aria-hidden="true" />
          {locating
            ? 'Locating...'
            : userLocation
              ? 'Location Active'
              : 'Use My Location'}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="px-4 py-3 text-xs sm:text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl"
        >
          {error}
        </div>
      )}

      {spotMessage && (
        <div className="px-4 py-3 text-xs sm:text-sm text-emerald-950 bg-emerald-50 border border-emerald-200 rounded-xl">
          {spotMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Interactive Google Map + Pin Form */}
        <section className="lg:col-span-7 space-y-4">
          <div className="w-full h-[420px] rounded-xl overflow-hidden border border-stone-200 bg-stone-100">
            {mapsApiKey ? (
              <APIProvider
                apiKey={mapsApiKey}
                libraries={['marker']}
                language="en"
                region="GH"
              >
                <GoogleMap
                  mapId="DEMO_MAP_ID"
                  internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  defaultCenter={mapCenter}
                  defaultZoom={15}
                  gestureHandling="greedy"
                  onClick={handleMapClick}
                  className="w-full h-full"
                >
                  {spots.map((spot) => (
                    <MeetupSpotMarker
                      key={spot.id}
                      spot={spot}
                      selected={selectedSpotId === spot.id}
                      onSelect={() => {
                        setSelectedSpotId(spot.id);
                        setDraftPin(null);
                      }}
                      onClose={() => setSelectedSpotId(null)}
                      onDelete={(id) => void handleDeleteSpot(id)}
                    />
                  ))}

                  {draftPin && (
                    <AdvancedMarker position={draftPin} title="New meetup pin">
                      <Pin
                        background="#b45309"
                        borderColor="#78350f"
                        glyphColor="#fffbeb"
                      />
                    </AdvancedMarker>
                  )}
                </GoogleMap>
              </APIProvider>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-2 text-zinc-600">
                <MapPin className="w-8 h-8 text-emerald-900" aria-hidden="true" />
                <p className="text-sm font-semibold text-zinc-900">
                  Google Maps interactive canvas unavailable
                </p>
                <p className="text-xs text-zinc-500 max-w-sm">
                  Set VITE_GOOGLE_MAPS_API_KEY to render the interactive map. You can still use Maps Grounding search on the right.
                </p>
              </div>
            )}
          </div>

          {draftPin && (
            <form
              onSubmit={handleSaveDraftSpot}
              className="bg-white border border-stone-200 rounded-xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-zinc-900">
                  Save Selected Meetup Pin
                </h2>
                <span className="font-mono text-[11px] text-zinc-500">
                  {draftPin.lat.toFixed(5)}, {draftPin.lng.toFixed(5)}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={spotName}
                  onChange={(e) => setSpotName(e.target.value)}
                  placeholder="Spot name (e.g. Balme Library Steps)"
                  className="px-3 py-2 text-sm text-zinc-900 bg-stone-50 border border-stone-200 rounded-lg"
                />
                <input
                  type="text"
                  required
                  maxLength={240}
                  value={spotAddress}
                  onChange={(e) => setSpotAddress(e.target.value)}
                  placeholder="Landmark or campus building"
                  className="px-3 py-2 text-sm text-zinc-900 bg-stone-50 border border-stone-200 rounded-lg"
                />
              </div>

              <input
                type="text"
                maxLength={300}
                value={spotNotes}
                onChange={(e) => setSpotNotes(e.target.value)}
                placeholder="Optional handover tip (e.g. Meet near security desk 9am–5pm)"
                className="w-full px-3 py-2 text-sm text-zinc-900 bg-stone-50 border border-stone-200 rounded-lg"
              />

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={savingSpot}
                  className="px-4 py-2 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 disabled:opacity-50 rounded-lg transition-colors"
                >
                  {savingSpot ? 'Saving...' : 'Save Meetup Spot'}
                </button>
                <button
                  type="button"
                  onClick={() => setDraftPin(null)}
                  className="px-3 py-2 text-xs font-medium text-zinc-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Saved Meetup Spots List */}
          <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-zinc-900">
              Your Saved Meetup Spots ({spots.length})
            </h2>
            {spots.length === 0 ? (
              <p className="text-xs text-zinc-500">
                Click anywhere on the map above to drop and save a campus handover spot.
              </p>
            ) : (
              <ul className="divide-y divide-stone-200">
                {spots.map((spot) => (
                  <li
                    key={spot.id}
                    className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSpotId(spot.id);
                        setMapCenter({ lat: spot.lat, lng: spot.lng });
                      }}
                      className="text-left min-w-0 flex-1 space-y-0.5 hover:opacity-80"
                    >
                      <p className="text-sm font-medium text-zinc-900 truncate">
                        {spot.name}
                      </p>
                      <p className="text-xs text-zinc-600 truncate">{spot.address}</p>
                      {spot.notes && (
                        <p className="text-xs text-zinc-500">{spot.notes}</p>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteSpot(spot.id)}
                      aria-label={`Remove ${spot.name}`}
                      className="p-1.5 text-zinc-400 hover:text-red-700 rounded transition-colors shrink-0"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Right: Maps Grounding Search & Grounded Links */}
        <section className="lg:col-span-5 bg-white border border-stone-200 rounded-xl p-5 space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-emerald-900">
              <Compass className="w-4 h-4" aria-hidden="true" />
              <h2 className="text-sm font-bold text-zinc-900">
                Google Maps Grounding Search
              </h2>
            </div>
            <p className="text-xs text-zinc-600">
              Ask Gemini with real-time Google Maps data for campus libraries, cafes, banks, or courier drop-offs.
            </p>
          </div>

          <form onSubmit={handleGroundingSearch} className="space-y-2">
            <textarea
              rows={2}
              value={groundingQuery}
              onChange={(e) => setGroundingQuery(e.target.value)}
              placeholder="e.g. Safe public study cafes or courier offices near Legon campus..."
              className="w-full px-3 py-2 text-sm text-zinc-900 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-900/20"
            />
            <button
              type="submit"
              disabled={groundingLoading || !groundingQuery.trim()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 disabled:opacity-50 rounded-lg transition-colors"
            >
              {groundingLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  Searching Google Maps data...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" aria-hidden="true" />
                  Search Grounded Places
                </>
              )}
            </button>
          </form>

          {groundingText && (
            <div className="border-t border-stone-200 pt-4 space-y-4">
              <div className="text-sm text-zinc-800 whitespace-pre-line leading-relaxed">
                {groundingText}
              </div>

              {groundingPlaces.length > 0 && (
                <div className="space-y-2.5">
                  <h3 className="text-xs font-semibold text-zinc-700">
                    Google Maps Grounded Sources
                  </h3>
                  <ul className="space-y-2">
                    {groundingPlaces.map((place) => (
                      <li
                        key={place.uri}
                        className="p-3 rounded-lg bg-stone-50 border border-stone-200 space-y-1.5"
                      >
                        <a
                          href={place.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-900 hover:underline"
                        >
                          {place.title}
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        </a>

                        {place.reviewSnippets.length > 0 && (
                          <div className="space-y-1 pt-1 border-t border-stone-200">
                            {place.reviewSnippets.map((snippet, idx) => (
                              <div key={`${place.uri}-snippet-${idx}`} className="text-xs text-zinc-600">
                                {snippet.text && <p>“{snippet.text}”</p>}
                                {snippet.uri && (
                                  <a
                                    href={snippet.uri}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-900 hover:underline"
                                  >
                                    {snippet.author ? `Review by ${snippet.author}` : 'View review on Google Maps'}
                                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
