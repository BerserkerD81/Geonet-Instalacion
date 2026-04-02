import { useState, useRef, useEffect } from 'react';
import { ProcessingModal } from './components/ui/ProcessingModal';
import ReactCountryFlag from 'react-country-flag';
import { Controller, useForm } from 'react-hook-form';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Textarea } from './components/ui/textarea';
import { Card, CardContent } from './components/ui/card';
import { MapPin, Upload, User, Phone, FileText, Image as Mail, Calendar, Wifi, Loader2, ChevronDown, Tv, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { TimeSelect } from './components/ui/time-select';

// Tipos para Google Maps
declare global {
  interface Window {
    google: any;
    __ENV__?: {
      VITE_GOOGLE_MAPS_API_KEY?: string;
    };
    __onGoogleMapsLoaded?: () => void;
  }
}

let googleMapsLoadPromise: Promise<void> | null = null;

// --- CARGA DE GOOGLE MAPS OPTIMIZADA ---
const loadGoogleMapsPlaces = (apiKey: string) => {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.maps?.marker && window.google?.maps?.places) return Promise.resolve();
  if (googleMapsLoadPromise) return googleMapsLoadPromise;

  googleMapsLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById('google-maps-js') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar Google Maps')), { once: true });
      return;
    }

    window.__onGoogleMapsLoaded = () => {
      resolve();
    };

    const script = document.createElement('script');
    script.id = 'google-maps-js';
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error('No se pudo cargar Google Maps'));
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey,
    )}&libraries=marker,places&loading=async&language=es&region=CL&callback=__onGoogleMapsLoaded`;
    document.head.appendChild(script);
  });

  return googleMapsLoadPromise;
};

interface GooglePrediction {
  place_id: string;
  description: string;
  structured_formatting: { main_text: string; secondary_text: string };
}

interface FormData {
  firstName: string;
  lastName: string;
  ci: string;
  email: string;
  plan: string;
  address: string;
  coordinates: string;
  neighborhood: string;
  city: string;
  postalCode: string;
  phone: string;
  additionalPhone: string;
  idFront: FileList;
  idBack: FileList;
  addressProof: FileList;
  coupon: FileList;
  comments: string;
  installationDates: string[];
  timeFrom: string;
  timeTo: string;
  pagaInstalacion?: boolean;
}

interface SmartOltOdb {
  id?: number | string;
  name?: string;
  nr_of_ports?: number | string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  zone_id?: number | string | null;
  zone_name?: string | null;
}

interface OdbZone {
  key: string;
  zoneId: string;
  zoneName: string;
  rawZoneName: string;
  zoneSequence: number | null;
  points: Array<{ lat: number; lng: number }>;
}

const toFiniteNumber = (value: unknown) => {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : null;
};

const computeCentroid = (points: Array<{ lat: number; lng: number }>) => {
  const total = points.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 },
  );
  const n = points.length;
  if (n === 0) return { lat: 0, lng: 0 };
  return { lat: total.lat / n, lng: total.lng / n };
};

const getConvexHull = (points: Array<{ lat: number; lng: number }>) => {
  if (points.length <= 3) return [...points];
  const sorted = [...points].sort((a, b) => (a.lng === b.lng ? a.lat - b.lat : a.lng - b.lng));
  const cross = (o: { lat: number; lng: number }, a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
    (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);
  const lower: Array<{ lat: number; lng: number }> = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Array<{ lat: number; lng: number }> = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
};

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const approxDistanceMeters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const meanLatRad = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const metersPerLat = 111_320;
  const metersPerLng = Math.cos(meanLatRad) * 111_320;
  const dLat = (a.lat - b.lat) * metersPerLat;
  const dLng = (a.lng - b.lng) * metersPerLng;
  return Math.hypot(dLat, dLng);
};

const filterZoneOutliers = (points: Array<{ lat: number; lng: number }>) => {
  if (points.length < 5) return points;
  const centroid = computeCentroid(points);
  const distances = points.map((point) => approxDistanceMeters(point, centroid)).sort((a, b) => a - b);
  const p90Index = Math.floor((distances.length - 1) * 0.9);
  const p90 = distances[p90Index] || 0;
  const maxAllowed = p90 * 1.35;
  const filtered = points.filter((point) => approxDistanceMeters(point, centroid) <= maxAllowed);
  return filtered.length >= 3 ? filtered : points;
};

const dedupeZonePoints = (points: Array<{ lat: number; lng: number }>) => {
  const seen = new Set<string>();
  const result: Array<{ lat: number; lng: number }> = [];
  for (const point of points) {
    const key = `${point.lat.toFixed(6)}:${point.lng.toFixed(6)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(point);
  }
  return result;
};

const getNearestNeighborDistances = (points: Array<{ lat: number; lng: number }>) => {
  if (points.length <= 1) return [] as number[];
  return points.map((current, idx) => {
    let minDistance = Number.POSITIVE_INFINITY;
    for (let j = 0; j < points.length; j += 1) {
      if (j === idx) continue;
      const d = approxDistanceMeters(current, points[j]);
      if (d < minDistance) minDistance = d;
    }
    return Number.isFinite(minDistance) ? minDistance : 0;
  });
};

const getMedian = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[middle - 1] + sorted[middle]) / 2;
  return sorted[middle];
};

const getCtoBubbleRadius = (points: Array<{ lat: number; lng: number }>) => {
  if (points.length <= 1) return 130;
  const nearestDistances = getNearestNeighborDistances(points);
  const medianDistance = getMedian(nearestDistances);
  return clampNumber(medianDistance * 0.55, 70, 170);
};

const shiftPointByMeters = (origin: { lat: number; lng: number }, eastMeters: number, northMeters: number) => {
  const latShift = northMeters / 111_320;
  const cosLat = Math.cos(origin.lat * (Math.PI / 180));
  const safeCos = Math.abs(cosLat) < 0.00001 ? 0.00001 : cosLat;
  const lngShift = eastMeters / (111_320 * safeCos);
  return { lat: origin.lat + latShift, lng: origin.lng + lngShift };
};

const splitIntoSpatialClusters = (points: Array<{ lat: number; lng: number }>, linkDistanceMeters: number) => {
  if (points.length <= 1) return [points];
  const visited = new Array(points.length).fill(false);
  const clusters: Array<Array<{ lat: number; lng: number }>> = [];
  for (let i = 0; i < points.length; i += 1) {
    if (visited[i]) continue;
    const queue = [i];
    visited[i] = true;
    const cluster: Array<{ lat: number; lng: number }> = [];
    while (queue.length > 0) {
      const currentIndex = queue.pop() as number;
      const currentPoint = points[currentIndex];
      cluster.push(currentPoint);
      for (let j = 0; j < points.length; j += 1) {
        if (visited[j]) continue;
        const distance = approxDistanceMeters(currentPoint, points[j]);
        if (distance <= linkDistanceMeters) { visited[j] = true; queue.push(j); }
      }
    }
    clusters.push(cluster);
  }
  return clusters;
};

const buildCoverageEnvelope = (points: Array<{ lat: number; lng: number }>, radiusMeters: number, steps = 14) => {
  const cloud: Array<{ lat: number; lng: number }> = [];
  for (const point of points) {
    cloud.push(point);
    for (let i = 0; i < steps; i += 1) {
      const angle = (2 * Math.PI * i) / steps;
      cloud.push(shiftPointByMeters(point, Math.cos(angle) * radiusMeters, Math.sin(angle) * radiusMeters));
    }
  }
  return getConvexHull(cloud);
};

const sanitizeZoneName = (value: unknown, zoneId: string) => {
  const raw = String(value ?? '').trim();
  if (!raw) return `Sector ${zoneId}`;
  const cleaned = raw
    .replace(/\b(?:zona|vlan|odf)\s*[-–—_:#]*\s*\d+\b/gi, '')
    .replace(/\s*[-–—]?\s*Z\s*\d+\b/gi, '')
    .replace(/\b(?:zona|vlan|odf)\b/gi, '')
    .replace(/\s*[-–—]?\s*torres?\s*[a-z0-9]+(?:\s*[-–—/]\s*[a-z0-9]+)*\s*$/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*[-–—,:;|/]+\s*/g, '')
    .replace(/\s*[-–—,:;|/]+\s*$/g, '')
    .trim();
  return cleaned || `Sector ${zoneId}`;
};

const normalizeNameKey = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const splitBaseAndTrailingNumber = (value: string) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(.*?)(?:\s+(\d+))?$/);
  const baseName = (match?.[1] || raw).trim();
  const trailing = match?.[2] ? parseInt(match[2], 10) : null;
  return { baseName: baseName || raw, trailingNumber: Number.isFinite(trailing as number) ? trailing : null };
};

const extractZoneSequence = (value: unknown) => {
  const raw = String(value ?? '');
  const m = raw.match(/\bZ\s*0*(\d+)\b/i);
  if (!m) return null;
  const parsed = parseInt(m[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const assignDisplayNamesBySequence = (zones: OdbZone[]) => {
  const grouped = new Map<string, OdbZone[]>();
  for (const zone of zones) {
    const { baseName } = splitBaseAndTrailingNumber(zone.zoneName);
    const key = normalizeNameKey(baseName);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(zone);
  }
  for (const group of grouped.values()) {
    if (group.length <= 1) continue;
    const items = group
      .map((zone) => { const { baseName, trailingNumber } = splitBaseAndTrailingNumber(zone.zoneName); return { zone, baseName, trailingNumber, sequence: zone.zoneSequence ?? Number.MAX_SAFE_INTEGER }; })
      .sort((a, b) => a.sequence - b.sequence || a.zone.zoneId.localeCompare(b.zone.zoneId, 'es'));
    const sharedBase = items[0].baseName || 'Sector';
    const used = new Set<number>();
    let nextNumber = 1;
    const pickNextNumber = () => { while (used.has(nextNumber)) nextNumber += 1; return nextNumber; };
    for (const item of items) {
      let finalNumber = item.trailingNumber;
      if (!finalNumber || finalNumber <= 0 || used.has(finalNumber)) finalNumber = pickNextNumber();
      used.add(finalNumber);
      item.zone.zoneName = `${sharedBase} ${finalNumber}`.trim();
    }
  }
  return zones;
};

const ZONE_NAME_STOPWORDS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'en', 'sector', 'zona', 'torre', 'torres', 'cto', 'ctos']);

const getZoneNameTokens = (value: string) => {
  const normalized = normalizeNameKey(value).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return [] as string[];
  return normalized.split(' ').filter((token) => token.length > 1 && !ZONE_NAME_STOPWORDS.has(token));
};

const areZoneNamesVerySimilar = (a: string, b: string) => {
  const normalizedA = normalizeNameKey(a).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const normalizedB = normalizeNameKey(b).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalizedA || !normalizedB) return false;
  if (normalizedA === normalizedB) return true;
  const [shorter, longer] = normalizedA.length <= normalizedB.length ? [normalizedA, normalizedB] : [normalizedB, normalizedA];
  if (shorter.length >= 8 && longer.includes(shorter)) return true;
  const tokensA = getZoneNameTokens(normalizedA);
  const tokensB = getZoneNameTokens(normalizedB);
  if (tokensA.length === 0 || tokensB.length === 0) return false;
  const tokensBSet = new Set(tokensB);
  let shared = 0;
  for (const token of tokensA) { if (tokensBSet.has(token)) shared += 1; }
  const overlap = shared / Math.max(tokensA.length, tokensB.length);
  return shared >= 2 && overlap >= 0.66;
};

const toTitleToken = (value: string) => {
  if (!value) return value;
  if (value.length <= 2) return value.toUpperCase();
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const buildRepeatedCoreZoneName = (names: string[]) => {
  if (names.length === 0) return '';
  const tokenLists = names.map((name) => getZoneNameTokens(name));
  if (tokenLists.length <= 1) return tokenLists[0]?.map(toTitleToken).join(' ') || '';
  const frequency = new Map<string, number>();
  for (const tokens of tokenLists) {
    const uniqueTokens = new Set(tokens);
    for (const token of uniqueTokens) frequency.set(token, (frequency.get(token) ?? 0) + 1);
  }
  const repeated = new Set(Array.from(frequency.entries()).filter(([, count]) => count >= 2).map(([token]) => token));
  if (repeated.size === 0) return '';
  const orderedCore = (tokenLists[0] || []).filter((token, idx, arr) => repeated.has(token) && arr.indexOf(token) === idx);
  if (orderedCore.length === 0) return '';
  return orderedCore.map(toTitleToken).join(' ').trim();
};

const mergeCloseAndSimilarZones = (zones: OdbZone[]) => {
  if (zones.length <= 1) return zones;
  const MERGE_DISTANCE_METERS = 240;
  const parents = zones.map((_, idx) => idx);
  const centroids = zones.map((zone) => computeCentroid(zone.points));
  const findRoot = (idx: number): number => {
    let current = idx;
    while (parents[current] !== current) { parents[current] = parents[parents[current]]; current = parents[current]; }
    return current;
  };
  const union = (a: number, b: number) => { const rootA = findRoot(a); const rootB = findRoot(b); if (rootA !== rootB) parents[rootB] = rootA; };
  for (let i = 0; i < zones.length; i += 1) {
    for (let j = i + 1; j < zones.length; j += 1) {
      if (!areZoneNamesVerySimilar(zones[i].zoneName, zones[j].zoneName)) continue;
      if (approxDistanceMeters(centroids[i], centroids[j]) > MERGE_DISTANCE_METERS) continue;
      union(i, j);
    }
  }
  const groupedIndexes = new Map<number, number[]>();
  for (let idx = 0; idx < zones.length; idx += 1) {
    const root = findRoot(idx);
    if (!groupedIndexes.has(root)) groupedIndexes.set(root, []);
    groupedIndexes.get(root)!.push(idx);
  }
  let mergeIndex = 1;
  const mergedZones: OdbZone[] = [];
  for (const indexes of groupedIndexes.values()) {
    if (indexes.length === 1) { mergedZones.push(zones[indexes[0]]); continue; }
    const members = indexes
      .map((idx) => zones[idx])
      .sort((a, b) => (a.zoneSequence ?? Number.MAX_SAFE_INTEGER) - (b.zoneSequence ?? Number.MAX_SAFE_INTEGER) || b.points.length - a.points.length);
    const primary = members[0];
    const repeatedCoreName = buildRepeatedCoreZoneName(members.map((zone) => zone.zoneName));
    const mergedIds = Array.from(new Set(members.map((zone) => zone.zoneId))).join('+');
    const sequences = members.map((zone) => zone.zoneSequence).filter((value): value is number => value !== null && Number.isFinite(value));
    mergedZones.push({
      key: `${primary.zoneId}__merged__${mergeIndex}`,
      zoneId: mergedIds || primary.zoneId,
      zoneName: repeatedCoreName || primary.zoneName,
      rawZoneName: members.map((zone) => zone.rawZoneName).filter(Boolean).join(' | '),
      zoneSequence: sequences.length > 0 ? Math.min(...sequences) : null,
      points: members.flatMap((zone) => zone.points),
    });
    mergeIndex += 1;
  }
  return mergedZones;
};

const formatLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDaysKeepingLocal = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

// ─── TV plan slug detection ───────────────────────────────────────────────────
const TV_PLAN_SLUGS = new Set(['home-tv-400', 'home-tv-600', 'home-tv-800']);

const isTvPlan = (planValue: string) => {
  // Check by slug prefix pattern in value string
  return planValue.includes('+ TV') && planValue.includes('Hogar');
};

export default function App() {
  const { register, handleSubmit, formState: { errors }, setValue, watch, control, clearErrors, trigger } = useForm<FormData>();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitted = false;
  const [submitErrorMsg, setSubmitErrorMsg] = useState<string | null>(null);
  const [submissionStatus, setSubmissionStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [isLocating, setIsLocating] = useState(false);

  const [idFrontName, setIdFrontName] = useState<string>('');
  const [idBackName, setIdBackName] = useState<string>('');
  const [addressProofName, setAddressProofName] = useState<string>('');
  const [idFrontError, setIdFrontError] = useState<string>('');
  const [idBackError, setIdBackError] = useState<string>('');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [addressSuggestions, setAddressSuggestions] = useState<GooglePrediction[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // ─── Decoders state (0–2 extra decoders) ────────────────────────────────────
  const [decosExtras, setDecosExtras] = useState<number>(0);
  const PRICE_PER_DECO = 3500; // precio por cada decodificador extra

  const inferInitialCategory = () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const planParam = (params.get('plan') || params.get('category') || '').toLowerCase();
      if (planParam.includes('pyme')) return 'pyme' as const;
      if (planParam.includes('home') || planParam.includes('hogar')) return 'home' as const;
      if (planParam.includes('tv')) return 'home-tv' as const;
      const path = (window.location.pathname || '').replace(/^\/+/, '').toLowerCase();
      if (path.includes('pyme')) return 'pyme' as const;
      if (path.includes('tv')) return 'home-tv' as const;
      if (path.includes('home') || path.includes('hogar')) return 'home' as const;
    } catch (e) { }
    return 'home-tv' as const;
  };

  const [planCategory, setPlanCategory] = useState<'home' | 'home-tv' | 'pyme'>(inferInitialCategory());

  const idFrontFileInputRef = useRef<HTMLInputElement | null>(null);
  const idBackFileInputRef = useRef<HTMLInputElement | null>(null);

  const idFrontFiles = watch('idFront');
  const timeFromValue = watch('timeFrom');
  const timeToValue = watch('timeTo');
  const planValue = watch('plan');
  const hasIdFront = Boolean(idFrontName) || ((idFrontFiles?.length ?? 0) > 0);
  const submitMsgRef = useRef<HTMLDivElement | null>(null);

  // Reset decos when switching away from TV plan
  useEffect(() => {
    if (!isTvPlan(planValue || '')) {
      setDecosExtras(0);
    }
  }, [planValue]);

  const scrollToField = (fieldName?: string) => {
    try {
      let el: Element | null = null;
      if (fieldName) el = document.querySelector(`[name="${fieldName}"], #${fieldName}, [data-field="${fieldName}"]`);
      if (!el) el = document.querySelector('.is-invalid, [aria-invalid="true"], :invalid');
      if (!el) el = document.querySelector('input[name], select[name], textarea[name]');
      if (el && (el as HTMLElement).scrollIntoView) {
        (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
        try { (el as HTMLElement).focus(); } catch (e) { }
      }
    } catch (e) { }
  };

  const isAllowedImage = (file?: File | null) => {
    if (!file) return false;
    const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'image/pjpeg'];
    if (allowed.includes(file.type)) return true;
    return /\.(jpe?g|png)$/i.test(file.name || '');
  };

  const MIN_IMAGE_WIDTH = 800;
  const MIN_IMAGE_HEIGHT = 600;

  const checkImageResolution = (file: File, minW = MIN_IMAGE_WIDTH, minH = MIN_IMAGE_HEIGHT) => {
    return new Promise<{ ok: boolean; width: number; height: number }>((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        URL.revokeObjectURL(url);
        resolve({ ok: w >= minW && h >= minH, width: w, height: h });
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve({ ok: false, width: 0, height: 0 }); };
      img.src = url;
    });
  };

  const idFrontRegister = register('idFront', {
    onChange: async (e) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        const f = files[0];
        if (!isAllowedImage(f)) {
          const msg = 'Solo se permiten imágenes JPG o PNG (jpeg/jpg/png)';
          toast.error(msg); setIdFrontError(msg);
          if (e?.target) e.target.value = '';
          setIdFrontName('');
          try { setValue('idFront', new DataTransfer().files); } catch (err) { }
          return;
        }
        const res = await checkImageResolution(f);
        if (!res.ok) {
          const msg = `Resolución insuficiente — la imagen debe medir al menos ${MIN_IMAGE_WIDTH}×${MIN_IMAGE_HEIGHT} px. (Actual: ${res.width}×${res.height} px)`;
          toast.error(msg); setIdFrontError(msg);
          if (e?.target) e.target.value = '';
          setIdFrontName('');
          try { setValue('idFront', new DataTransfer().files); } catch (err) { }
          return;
        }
        setIdFrontError(''); setIdFrontName(f.name);
      }
    },
  });

  const idBackRegister = register('idBack', {
    onChange: async (e) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        const f = files[0];
        if (!isAllowedImage(f)) {
          const msg = 'Solo se permiten imágenes JPG o PNG (jpeg/jpg/png)';
          toast.error(msg); setIdBackError(msg);
          if (e?.target) e.target.value = '';
          setIdBackName('');
          try { setValue('idBack', new DataTransfer().files); } catch (err) { }
          return;
        }
        const res = await checkImageResolution(f);
        if (!res.ok) {
          const msg = `Resolución insuficiente — la imagen debe medir al menos ${MIN_IMAGE_WIDTH}×${MIN_IMAGE_HEIGHT} px. (Actual: ${res.width}×${res.height} px)`;
          toast.error(msg); setIdBackError(msg);
          if (e?.target) e.target.value = '';
          setIdBackName('');
          try { setValue('idBack', new DataTransfer().files); } catch (err) { }
          return;
        }
        if (!hasIdFront) {
          const msg = 'Primero debes subir la identificación (frente)';
          toast.error(msg); setIdBackError(msg);
          if (e?.target) e.target.value = '';
          setIdBackName('');
          return;
        }
        setIdBackError(''); setIdBackName(f.name);
      }
    },
  });

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const suggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoneOverlaysRef = useRef<any[]>([]);
  const zoneLabelMarkersRef = useRef<any[]>([]);
  const zoneZoomListenerRef = useRef<any>(null);
  const smartOltZonesRef = useRef<OdbZone[] | null>(null);
  const zonesRenderedRef = useRef(false);

  const [zonesStatus, setZonesStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [zoneOptions, setZoneOptions] = useState<OdbZone[]>([]);
  const [selectedZoneKey, setSelectedZoneKey] = useState('');
  const [zoneSearchTerm, setZoneSearchTerm] = useState('');
  const [showZoneSuggestions, setShowZoneSuggestions] = useState(false);
  const [mapsLoadError, setMapsLoadError] = useState<string | null>(null);

  const getEffectiveGoogleKey = () => {
    const runtimeKey = window.__ENV__?.VITE_GOOGLE_MAPS_API_KEY;
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
    return 'AIzaSyDdLCoDZHEZcaROaeyQ2JpPTMNZfS-yZ8w';
  };

  const ensureMapsLoaded = async () => {
    const key = getEffectiveGoogleKey();
    if (!key) return Promise.reject(new Error('Falta VITE_GOOGLE_MAPS_API_KEY'));
    return loadGoogleMapsPlaces(key);
  };

  const clearZoneOverlays = () => {
    for (const overlay of zoneOverlaysRef.current) {
      try { if (typeof overlay?.setMap === 'function') overlay.setMap(null); } catch (e) { }
    }
    if (zoneZoomListenerRef.current && window.google?.maps?.event?.removeListener) {
      try { window.google.maps.event.removeListener(zoneZoomListenerRef.current); } catch (e) { }
      zoneZoomListenerRef.current = null;
    }
    zoneLabelMarkersRef.current = [];
    zoneOverlaysRef.current = [];
  };

  const fetchSmartOltZones = async () => {
    if (smartOltZonesRef.current) { setZoneOptions(smartOltZonesRef.current); return smartOltZonesRef.current; }
    const res = await fetch('/api/smartolt/odbs', { method: 'GET', headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`SmartOLT respondió ${res.status} ${res.statusText}`);
    const body = await res.json();
    const odbRows: SmartOltOdb[] = Array.isArray(body) ? body : Array.isArray(body?.response) ? body.response : [];
    const byZone = new Map<string, OdbZone>();
    for (const row of odbRows) {
      const lat = toFiniteNumber(row.latitude);
      const lng = toFiniteNumber(row.longitude);
      if (lat === null || lng === null) continue;
      const zoneId = String(row.zone_id ?? 'sin-id');
      const rawZoneName = String(row.zone_name ?? '');
      const zoneName = sanitizeZoneName(rawZoneName, zoneId);
      const zoneSequence = extractZoneSequence(rawZoneName);
      const key = `${zoneId}__${zoneName}`;
      if (!byZone.has(key)) byZone.set(key, { key, zoneId, zoneName, rawZoneName, zoneSequence, points: [] });
      byZone.get(key)!.points.push({ lat, lng });
    }
    const preparedZones = Array.from(byZone.values()).filter((zone) => zone.points.length > 0);
    const mergedZones = mergeCloseAndSimilarZones(preparedZones);
    const namedZones = assignDisplayNamesBySequence(
      mergedZones.sort((a, b) => {
        const seqA = a.zoneSequence ?? Number.MAX_SAFE_INTEGER;
        const seqB = b.zoneSequence ?? Number.MAX_SAFE_INTEGER;
        if (seqA !== seqB) return seqA - seqB;
        return a.zoneName.localeCompare(b.zoneName, 'es', { sensitivity: 'base' });
      })
    );
    smartOltZonesRef.current = namedZones.map((zone, idx) => ({
      ...zone,
      key: `${zone.zoneId}__${normalizeNameKey(zone.zoneName).replace(/\s+/g, '-') || 'zona'}__${idx}`,
    }));
    setZoneOptions(smartOltZonesRef.current);
    return smartOltZonesRef.current;
  };

  const focusMapOnZone = async (zoneKey: string) => {
    if (!zoneKey) return;
    try {
      await ensureMapsLoaded();
      if (!mapInstanceRef.current && mapContainerRef.current) await initMiniMap();
      const zones = smartOltZonesRef.current || await fetchSmartOltZones();
      const zone = zones.find((z) => z.key === zoneKey);
      if (!zone || zone.points.length === 0 || !mapInstanceRef.current || !window.google?.maps) return;
      if (zone.points.length === 1) { mapInstanceRef.current.panTo(zone.points[0]); mapInstanceRef.current.setZoom(16); return; }
      const bounds = new window.google.maps.LatLngBounds();
      zone.points.forEach((p) => bounds.extend(p));
      if (!bounds.isEmpty()) mapInstanceRef.current.fitBounds(bounds, 60);
    } catch (e) { console.error('No se pudo enfocar la zona seleccionada', e); }
  };

  const handleZoneSelection = (zone: OdbZone) => {
    setSelectedZoneKey(zone.key);
    setZoneSearchTerm(zone.zoneName);
    setShowZoneSuggestions(false);
    setValue('neighborhood', zone.zoneName, { shouldValidate: true, shouldDirty: true });
    void focusMapOnZone(zone.key);
  };

  const filteredZoneOptions = (() => {
    const needle = zoneSearchTerm.trim().toLowerCase();
    if (!needle) return zoneOptions;
    return zoneOptions.filter((zone) => zone.zoneName.toLowerCase().includes(needle));
  })();

  const renderSmartOltZones = async (fitBounds = true) => {
    if (!mapInstanceRef.current || !window.google?.maps) return;
    setZonesStatus('loading');
    try {
      const zones = await fetchSmartOltZones();
      clearZoneOverlays();
      if (zones.length === 0) { setZonesStatus('success'); zonesRenderedRef.current = true; return; }
      const palette = ['#2563EB', '#F97316', '#0D9488', '#7C3AED', '#DB2777'];
      const bounds = new window.google.maps.LatLngBounds();
      zoneLabelMarkersRef.current = [];
      zones.forEach((zone, idx) => {
        const color = palette[idx % palette.length];
        const areaSeedPoints = dedupeZonePoints(filterZoneOutliers(zone.points));
        if (areaSeedPoints.length === 0) return;
        const centroid = computeCentroid(areaSeedPoints);
        const baseRadius = getCtoBubbleRadius(areaSeedPoints);
        const clusterLinkDistance = clampNumber(baseRadius * 3.2, 220, 650);
        const clusters = splitIntoSpatialClusters(areaSeedPoints, clusterLinkDistance);
        for (const cluster of clusters) {
          const clusterRadius = getCtoBubbleRadius(cluster);
          const envelopeRadius = clampNumber(clusterRadius * 1.35 * 0.7, 67, 168);
          const envelope = buildCoverageEnvelope(cluster, envelopeRadius, 14);
          if (envelope.length < 3) continue;
          const area = new window.google.maps.Polygon({ paths: envelope, strokeColor: color, strokeOpacity: 0.46, strokeWeight: 1.15, fillColor: color, fillOpacity: 0.08, geodesic: true, clickable: false, map: mapInstanceRef.current });
          zoneOverlaysRef.current.push(area);
          envelope.forEach((point) => bounds.extend(point));
        }
        const label = new window.google.maps.Marker({ position: centroid, map: mapInstanceRef.current, icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 0 }, label: { text: zone.zoneName, color, fontSize: '11px', fontWeight: '700' }, visible: false, zIndex: 999 });
        zoneLabelMarkersRef.current.push(label);
        zoneOverlaysRef.current.push(label);
      });
      const updateZoneLabelsVisibility = () => {
        const currentZoom = mapInstanceRef.current?.getZoom?.() ?? 0;
        const visible = currentZoom >= 16;
        for (const marker of zoneLabelMarkersRef.current) { try { marker.setVisible(visible); } catch (e) { } }
      };
      if (zoneZoomListenerRef.current && window.google?.maps?.event?.removeListener) {
        try { window.google.maps.event.removeListener(zoneZoomListenerRef.current); } catch (e) { }
      }
      zoneZoomListenerRef.current = mapInstanceRef.current.addListener('zoom_changed', updateZoneLabelsVisibility);
      updateZoneLabelsVisibility();
      if (fitBounds && !bounds.isEmpty()) mapInstanceRef.current.fitBounds(bounds, 40);
      setZonesStatus('success');
      zonesRenderedRef.current = true;
    } catch (e) {
      console.error('Error cargando zonas SmartOLT', e);
      setZonesStatus('error');
      toast.error('No se pudieron cargar las zonas de cobertura');
    }
  };

  const updateMapMarker = (lat: number, lng: number, pan = true) => {
    try {
      if (!mapInstanceRef.current || !window.google?.maps) return;
      const pos = { lat, lng };
      if (markerRef.current) { markerRef.current.map = null; markerRef.current = null; }
      const { AdvancedMarkerElement } = window.google.maps.marker || {};
      if (AdvancedMarkerElement) {
        markerRef.current = new AdvancedMarkerElement({ map: mapInstanceRef.current, position: pos });
      } else {
        markerRef.current = new window.google.maps.Marker({ position: pos, map: mapInstanceRef.current });
      }
      if (pan) mapInstanceRef.current.panTo(pos);
      mapInstanceRef.current.setZoom(16);
    } catch (e) { console.error("Error actualizando marcador", e); }
  };

  const reverseGeocodeAndFill = (lat: number, lng: number) => {
    setValue('coordinates', `${lat.toFixed(6)}, ${lng.toFixed(6)}`, { shouldValidate: true });
  };

  const searchAddress = async (query: string) => {
    try {
      await ensureMapsLoaded();
      const service = new window.google.maps.places.AutocompleteService();
      service.getPlacePredictions(
        { input: query, language: 'es', componentRestrictions: { country: 'cl' }, types: ['geocode'] },
        (predictions: GooglePrediction[] | null, status: string) => {
          if (status === 'OK' && predictions) { setAddressSuggestions(predictions); setShowSuggestions(true); }
          else { setAddressSuggestions([]); setShowSuggestions(false); }
        }
      );
    } catch (e) { console.warn('Google Places autocomplete error:', e); }
  };

  const pickSuggestion = async (pred: GooglePrediction) => {
    setShowSuggestions(false);
    setAddressSuggestions([]);
    try {
      await ensureMapsLoaded();
      if (!mapInstanceRef.current && mapContainerRef.current) await initMiniMap();
      const service = new window.google.maps.places.PlacesService(mapInstanceRef.current || document.createElement('div'));
      service.getDetails({ placeId: pred.place_id, fields: ['geometry'] }, (place: any, status: string) => {
        if (status === 'OK' && place?.geometry?.location) {
          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();
          setValue('coordinates', `${lat.toFixed(6)}, ${lng.toFixed(6)}`, { shouldValidate: true });
          updateMapMarker(lat, lng);
        }
      });
    } catch (e) { console.warn('Google Places getDetails error:', e); }
  };

  const initMiniMap = async () => {
    try {
      if (!mapContainerRef.current) return;
      setZonesStatus('loading');
      let preloadedZones: OdbZone[] = [];
      try { preloadedZones = await fetchSmartOltZones(); setZonesStatus('success'); }
      catch (e) { console.error('Error cargando ODBs/Zonas SmartOLT antes de inicializar el mapa', e); setZonesStatus('error'); }
      try { await ensureMapsLoaded(); setMapsLoadError(null); } catch (e) { console.warn('Google Maps not loaded, minimap disabled', e); setMapsLoadError(String(e ?? 'Error cargando Google Maps')); return; }
      if (!window.google?.maps) return;
      if (mapInstanceRef.current) { if (!zonesRenderedRef.current) void renderSmartOltZones(true); return; }
      const allZonePoints = preloadedZones.flatMap((z) => z.points);
      const defaultCenter = allZonePoints.length > 0 ? computeCentroid(allZonePoints) : { lat: -35.4269, lng: -71.6554 };
      const onMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const gestureHandling = onMobile ? 'cooperative' : 'greedy';
      mapInstanceRef.current = new window.google.maps.Map(mapContainerRef.current, { center: defaultCenter, zoom: 13, zoomControl: !onMobile, fullscreenControl: !onMobile, streetViewControl: false, mapTypeControl: false, clickableIcons: false, gestureHandling, mapId: 'DEMO_MAP_ID' });
      mapInstanceRef.current.addListener('click', (ev: any) => {
        const lat = ev.latLng.lat();
        const lng = ev.latLng.lng();
        updateMapMarker(lat, lng);
        void reverseGeocodeAndFill(lat, lng);
      });
      const coords = (watch('coordinates') || '') as string;
      let hasInitialCoords = false;
      if (coords) {
        const [latS, lngS] = coords.split(',').map((s: string) => s.trim());
        const lat = parseFloat(latS);
        const lng = parseFloat(lngS);
        if (Number.isFinite(lat) && Number.isFinite(lng)) { hasInitialCoords = true; updateMapMarker(lat, lng, false); }
      }
      if (!zonesRenderedRef.current) await renderSmartOltZones(!hasInitialCoords);
    } catch (e) { console.error('initMiniMap error', e); }
  };

  useEffect(() => { void initMiniMap(); }, [mapContainerRef.current]);
  useEffect(() => { return () => { if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current); clearZoneOverlays(); }; }, []);

  const fetchIPLocation = async (): Promise<{ lat: number; lng: number } | null> => {
    try {
      const res = await fetch('https://ipapi.co/json/');
      if (!res.ok) return null;
      const body = await res.json();
      const lat = parseFloat(body.latitude ?? body.lat ?? '');
      const lng = parseFloat(body.longitude ?? body.lon ?? '');
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
      return null;
    } catch (e) { return null; }
  };

  const handleUseGeolocation = async () => {
    setIsLocating(true);
    const applyPosition = async (lat: number, lng: number) => {
      try { await ensureMapsLoaded(); } catch (_e) { }
      if (!mapInstanceRef.current && mapContainerRef.current) await initMiniMap();
      updateMapMarker(lat, lng);
      reverseGeocodeAndFill(lat, lng);
    };
    if (!navigator.geolocation) { toast.error('Tu navegador no soporta geolocalización.'); setIsLocating(false); return; }
    const tryPosition = (opts: PositionOptions): Promise<{ pos: GeolocationPosition | null; errCode: number }> =>
      new Promise((resolve) => { navigator.geolocation.getCurrentPosition((pos) => resolve({ pos, errCode: 0 }), (err) => resolve({ pos: null, errCode: err.code }), opts); });
    const refinePosition = (maxMs = 25_000, targetAccuracy = 50): Promise<GeolocationPosition> =>
      new Promise((resolve, reject) => {
        let best: GeolocationPosition | null = null;
        let watchId: number;
        const finish = (pos: GeolocationPosition) => { navigator.geolocation.clearWatch(watchId); resolve(pos); };
        const timer = setTimeout(() => { navigator.geolocation.clearWatch(watchId); if (best) resolve(best); else reject({ code: 2 }); }, maxMs);
        watchId = navigator.geolocation.watchPosition(
          (pos) => { if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos; if (pos.coords.accuracy <= targetAccuracy) { clearTimeout(timer); finish(pos); } },
          (err) => { clearTimeout(timer); navigator.geolocation.clearWatch(watchId); if (best) resolve(best); else reject(err); },
          { enableHighAccuracy: true, maximumAge: 0, timeout: maxMs }
        );
      });
    try {
      const { pos: coarse, errCode: coarseErr } = await tryPosition({ enableHighAccuracy: false, maximumAge: 60_000, timeout: 4_000 });
      if (coarseErr === 1) { toast.error('Permiso de ubicación denegado.', { description: 'Activa la ubicación en la configuración del navegador e intenta de nuevo.', duration: 6000 }); setIsLocating(false); return; }
      if (coarseErr === 2) throw { code: 2 };
      if (coarse) { await applyPosition(coarse.coords.latitude, coarse.coords.longitude); toast.info(`Ubicación inicial ±${Math.round(coarse.coords.accuracy)} m. Mejorando precisión…`, { duration: 3000 }); }
      try {
        const refined = await refinePosition(25_000, 50);
        const coarseAcc = coarse ? coarse.coords.accuracy : Infinity;
        if (refined.coords.accuracy < coarseAcc) await applyPosition(refined.coords.latitude, refined.coords.longitude);
        const acc = Math.round(refined.coords.accuracy);
        if (acc <= 20) toast.success(`GPS de alta precisión ±${acc} m`);
        else if (acc <= 80) toast.success(`Ubicación GPS ±${acc} m`);
        else { toast.success(`Ubicación obtenida ±${acc} m`); toast.warning('Precisión limitada. Puedes ajustar el pin en el mapa.'); }
      } catch (_refineErr) { if (coarse) toast.success(`Ubicación obtenida ±${Math.round(coarse.coords.accuracy)} m`); }
    } catch (err: any) {
      const code: number = err?.code ?? 0;
      if (code === 1) { toast.error('Permiso de ubicación denegado.', { description: 'Activa la ubicación en la configuración del navegador.', duration: 6000 }); setIsLocating(false); return; }
      const ipLoc = await fetchIPLocation();
      if (ipLoc) { await applyPosition(ipLoc.lat, ipLoc.lng); toast.warning('No se detectó GPS. Ubicación aproximada por ciudad — ajusta el pin.', { duration: 7000 }); }
      else toast.error('No se pudo detectar la ubicación. Escríbela o fija el pin en el mapa.');
    } finally { setIsLocating(false); }
  };

  const getValidDates = () => {
    const dates: { date: Date, formatted: string }[] = [];
    const now = new Date();
    const baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
    const twoWeeksLater = addDaysKeepingLocal(baseDate, 14);
    let currentDate = addDaysKeepingLocal(baseDate, 1);
    while (currentDate <= twoWeeksLater) {
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) dates.push({ date: new Date(currentDate), formatted: formatLocalDateKey(currentDate) });
      currentDate = addDaysKeepingLocal(currentDate, 1);
    }
    return dates;
  };

  const validDates = getValidDates();

  const timeOptions = [
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
    '15:00', '15:30', '16:00', '16:30', '17:00'
  ];

  // ─── Plan sections ────────────────────────────────────────────────────────────
  const planSections = [
    {
      title: 'Internet Fibra Hogar',
      category: 'home' as const,
      options: [
        { value: 'Internet Fibra Hogar 400 Mbps - $13.990', label: 'Fibra HOGAR 400 Mbps', price: '13.990', slug: 'home-400', features: ['Internet hasta 400 MB simétrico', 'Diseñado para hogares pequeños', 'Videollamadas estables', 'Streaming Full HD'], pagaInstalacion: true },
        { value: 'Internet Fibra Hogar 600 Mbps - $15.990', label: 'Fibra PLUS 600 Mbps', price: '15.990', slug: 'home-600', features: ['Internet hasta 600 MB simétrico', 'Ideal para familias conectadas', 'Teletrabajo fluido', 'Streaming en 4K', 'Alto rendimiento para videollamadas'], pagaInstalacion: true },
        { value: 'Internet Fibra Hogar 800 Mbps - $18.990', label: 'Fibra MAX 800 Mbps', price: '18.990', slug: 'home-800', features: ['Internet hasta 800 MB simétrico', 'Perfecto para usuarios exigentes', 'Máximo rendimiento para gaming', 'Streaming en 4K y 8K', 'Teletrabajo avanzado para tareas exigentes', 'Excelente para hogares inteligentes'], pagaInstalacion: true },
      ],
    },
    {
      title: 'Internet Fibra Hogar + TV',
      category: 'home-tv' as const,
      options: [
        {
          value: 'Internet Fibra Hogar 400 Mbps + TV - $23.990',
          label: 'Fibra HOGAR 400 Mbps + TV',
          price: '23.990',
          slug: 'home-tv-400',
          basePrice: '13.990',
          features: [],
          installation: 'Sin costo de instalación',
          pagaInstalacion: false,
        },
        {
          value: 'Internet Fibra Hogar 600 Mbps + TV - $25.990',
          label: 'Fibra PLUS 600 Mbps + TV',
          price: '25.990',
          slug: 'home-tv-600',
          basePrice: '15.990',
          features: [],
          installation: 'Sin costo de instalación',
          pagaInstalacion: false,
        },
        {
          value: 'Internet Fibra Hogar 800 Mbps + TV - $28.990',
          label: 'Fibra MAX 800 Mbps + TV',
          price: '28.990',
          slug: 'home-tv-800',
          basePrice: '18.990',
          features: [],
          installation: 'Sin costo de instalación',
          pagaInstalacion: false,
        },
      ],
    },
    {
      title: 'Planes Negocio',
      category: 'pyme' as const,
      options: [
        {
          value: 'Plan Internet FO PyME 600 Mbps - $24.990',
          label: 'Internet Fibra Negocio 600 Mb',
          price: '24.990',
          slug: 'pyme-600',
          features: [
            'Velocidad simétrica, hasta 600 Mbps subida y bajada',
            'Incluye WiFi',
            'Experiencia 1:1',
            'Sin coste de instalación',
            'Soporte 7x12 (De 08:00 hasta 20:00 hrs.)',
          ],
          pagaInstalacion: false,
        },
        {
          value: 'Plan Internet FO PyME 800 Mbps - $26.990',
          label: 'Internet Fibra Negocio 800 Mb',
          price: '26.990',
          slug: 'pyme-800',
          features: [
            'Velocidad simétrica, hasta 800 Mbps subida y bajada',
            'Incluye WiFi',
            'Experiencia 1:1',
            'Sin coste de instalación',
            'Soporte 7x12 (De 08:00 hasta 20:00 hrs.)',
          ],
          pagaInstalacion: false,
        },
      ],
    },
  ];

  const filteredPlanSections = planSections.filter((section) => section.category === planCategory);
  const currentPlanIsTv = isTvPlan(planValue || '');

  useEffect(() => {
    try {
      const current = watch('plan');
      if (current) return;
      const section = filteredPlanSections[0];
      if (section && section.options && section.options.length > 0) setValue('plan', section.options[0].value, { shouldValidate: true, shouldDirty: false });
    } catch (e) { }
  }, [planCategory]);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const planParam = params.get('plan');
      const raw = (planParam || '').trim();
      if (raw) {
        const needle = raw.toLowerCase();
        for (const section of planSections) {
          for (const opt of section.options) {
            if (opt.value.toLowerCase().includes(needle) || (opt.label && opt.label.toLowerCase().includes(needle))) {
              setPlanCategory(section.category);
              setValue('plan', opt.value, { shouldValidate: true });
              return;
            }
          }
        }
      }
      const path = (window.location.pathname || '').toLowerCase();
      if (path && path !== '/') {
        const m = path.match(/^\/(home-tv|home|pyme)(?:\/([-a-z0-9]+))?$/);
        if (m) {
          const cat = m[1] as 'home' | 'home-tv' | 'pyme';
          const maybeSlug = m[2];
          if (maybeSlug) {
            for (const section of planSections) {
              for (const opt of section.options) {
                const slug = (opt as any).slug || opt.value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                if (slug === maybeSlug) { setPlanCategory(section.category); setValue('plan', opt.value, { shouldValidate: true }); return; }
              }
            }
          }
          setPlanCategory(cat);
          return;
        }
        for (const section of planSections) {
          for (const opt of section.options) {
            const slug = (opt as any).slug || opt.value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            if (path.includes(slug)) { setPlanCategory(section.category); setValue('plan', opt.value, { shouldValidate: true }); return; }
          }
        }
        if (path.includes('pyme')) setPlanCategory('pyme');
        if (path.includes('tv')) setPlanCategory('home-tv');
        else if (path.includes('home') || path.includes('hogar')) setPlanCategory('home');
      }
    } catch (e) { }
  }, []);

  const timeToMinutes = (value: string) => {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
    if (!m) return NaN;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  };

  const validateTimeRange = (from: string, to: string) => {
    if (!from || !to) return true;
    const fromMin = timeToMinutes(from);
    const toMin = timeToMinutes(to);
    if (!Number.isFinite(fromMin) || !Number.isFinite(toMin)) return true;
    return fromMin < toMin ? true : 'La hora "Desde" debe ser menor que "Hasta"';
  };

  const filteredTimeToOptions = timeFromValue && Number.isFinite(timeToMinutes(timeFromValue))
    ? timeOptions.filter((t) => timeToMinutes(t) > timeToMinutes(timeFromValue))
    : timeOptions;

  useEffect(() => {
    if (!timeFromValue) return;
    if (!timeToValue) return;
    if (validateTimeRange(timeFromValue, timeToValue) === true) return;
    setValue('timeTo', '', { shouldValidate: true, shouldDirty: true });
  }, [timeFromValue, timeToValue, setValue]);

  const cleanRut = (rut: string) => rut.replace(/[^0-9kK]/g, '').toUpperCase();
  const formatRut = (rut: string) => {
    const cleaned = cleanRut(rut);
    if (!cleaned) return '';
    const dv = cleaned.length > 1 ? cleaned.slice(-1) : '';
    let body = cleaned.length > 1 ? cleaned.slice(0, -1) : cleaned;
    body = body.replace(/^0+/, '') || body;
    const reversed = body.split('').reverse().join('');
    const groups = reversed.match(/.{1,3}/g) || [];
    const withDots = groups.join('.').split('').reverse().join('');
    return dv ? `${withDots}-${dv}` : withDots;
  };

  const validateRut = (rut: string) => {
    const cleaned = cleanRut(rut);
    if (cleaned.length < 2) return false;
    const dv = cleaned.slice(-1);
    const numbers = cleaned.slice(0, -1).split('').reverse();
    let sum = 0; let mul = 2;
    for (const n of numbers) { sum += parseInt(n, 10) * mul; mul = mul === 7 ? 2 : mul + 1; }
    const res = 11 - (sum % 11);
    const computedDv = res === 11 ? '0' : res === 10 ? 'K' : String(res);
    return computedDv === dv.toUpperCase();
  };

  const toggleDate = (dateStr: string) => {
    if (selectedDates.includes(dateStr)) setSelectedDates(selectedDates.filter(d => d !== dateStr));
    else setSelectedDates([...selectedDates, dateStr]);
  };

  const formatDateDisplay = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return { dayName: days[date.getDay()], dayNumber: date.getDate(), month: months[date.getMonth()] };
  };

  const removeAccentsAndSpecials = (str: string) =>
    str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z ]/g, '').replace(/ {2,}/g, ' ');

  // ─── Find the base hogar plan value for a TV plan ────────────────────────────
  const getBasePlanValueForTv = (tvPlanValue: string): string => {
    // Match TV plan to its hogar equivalent (same speed)
    const tvSection = planSections.find(s => s.category === 'home-tv');
    const hogarSection = planSections.find(s => s.category === 'home');
    if (!tvSection || !hogarSection) return tvPlanValue;

    const tvOpt = tvSection.options.find(o => o.value === tvPlanValue);
    if (!tvOpt) return tvPlanValue;

    // Match by slug: home-tv-400 → home-400, etc.
    const tvSlug = (tvOpt as any).slug as string;
    const speedPart = tvSlug.replace('home-tv-', '');
    const hogarOpt = hogarSection.options.find(o => ((o as any).slug as string) === `home-${speedPart}`);
    return hogarOpt ? hogarOpt.value : tvPlanValue;
  };

  const onSubmit = async (data: FormData) => {
    const allValid = await trigger();
    if (!allValid) {
      const msgs: string[] = [];
      try { for (const [k, v] of Object.entries(errors)) { if (v && (v as any).message) msgs.push(`${k}: ${(v as any).message}`); } } catch (e) { }
      const summary = msgs.length > 0 ? msgs.join(' — ') : 'Faltan o hay campos inválidos en el formulario';
      toast.error(summary);
      setSubmissionStatus('error');
      setIsSubmitting(false);
      try { const first = Object.keys(errors)[0]; scrollToField(first); } catch (e) { scrollToField(undefined); }
      setTimeout(() => setSubmissionStatus('idle'), 2000);
      return;
    }

    setSubmissionStatus('loading');
    setIsSubmitting(true);
    setSubmitErrorMsg(null);

    try {
      if (selectedDates.length === 0) {
        const msg = 'Debes seleccionar al menos una fecha de instalación';
        toast.error(msg); setSubmitErrorMsg(msg); setSubmissionStatus('error'); setIsSubmitting(false);
        setTimeout(() => scrollToField('installationDates'), 150);
        setTimeout(() => setSubmissionStatus('idle'), 2000);
        return;
      }

      if (!data.plan) {
        const msg = 'Debes seleccionar un plan de internet';
        toast.error(msg); setSubmitErrorMsg(msg); setSubmissionStatus('error'); setIsSubmitting(false);
        setTimeout(() => scrollToField('plan'), 150);
        setTimeout(() => setSubmissionStatus('idle'), 2000);
        return;
      }

      const timeValid = validateTimeRange(data.timeFrom, data.timeTo);
      if (timeValid !== true) {
        const msg = String(timeValid);
        toast.error(msg); setSubmitErrorMsg(msg); setSubmissionStatus('error'); setIsSubmitting(false);
        setTimeout(() => scrollToField('timeFrom'), 150);
        setTimeout(() => setSubmissionStatus('idle'), 2000);
        return;
      }

      const formData = new window.FormData();
      const cleanFirstName = removeAccentsAndSpecials(data.firstName).trim();
      const cleanLastName = removeAccentsAndSpecials(data.lastName).trim();
      formData.append('firstName', cleanFirstName);
      formData.append('lastName', cleanLastName);
      formData.append('ci', data.ci);
      formData.append('email', data.email);

      // ─── Plan value: if TV plan, send the equivalent hogar plan value ────────
      const tvPlan = isTvPlan(data.plan);
      const planToSend = tvPlan ? getBasePlanValueForTv(data.plan) : data.plan;
      formData.append('plan', planToSend);

      // ─── TV fields ────────────────────────────────────────────────────────────
      formData.append('tieneTV', tvPlan ? 'true' : 'false');
      formData.append('decosExtras', String(tvPlan ? decosExtras : 0));

      // ─── Paga instalación: usar la propiedad `pagaInstalacion` del plan si está definida
      try {
        const allOptions: any[] = planSections.flatMap((s) => (s.options || []) as any[]);
        const selectedOpt = allOptions.find((o) => o.value === data.plan);
        const paysInstallation = selectedOpt
          ? (typeof selectedOpt.pagaInstalacion === 'boolean'
              ? selectedOpt.pagaInstalacion
              : Boolean(selectedOpt.installation && !String(selectedOpt.installation).toLowerCase().includes('sin costo')))
          : false;
        formData.append('pagaInstalacion', paysInstallation ? 'true' : 'false');
      } catch (e) {
        formData.append('pagaInstalacion', 'false');
      }

      formData.append('address', data.address);
      formData.append('coordinates', data.coordinates);
      formData.append('neighborhood', data.neighborhood);
      formData.append('city', data.city);
      formData.append('postalCode', data.postalCode);
      const phoneDigits = String(data.phone || '').replace(/\D/g, '').slice(0, 9);
      const additionalDigits = String(data.additionalPhone || '').replace(/\D/g, '').slice(0, 9);
      formData.append('phone', phoneDigits);
      formData.append('additionalPhone', additionalDigits || '');
      formData.append('comments', data.comments || '');
      formData.append('installationDates', selectedDates.join(','));
      formData.append('timeFrom', data.timeFrom);
      formData.append('timeTo', data.timeTo);

      if (data.idFront && data.idFront.length > 0) formData.append('idFront', data.idFront[0]);
      if (data.idBack && data.idBack.length > 0) formData.append('idBack', data.idBack[0]);
      if (data.addressProof && data.addressProof.length > 0) formData.append('addressProof', data.addressProof[0]);
      if (data.coupon && data.coupon.length > 0) formData.append('coupon', data.coupon[0]);

      const response = await fetch('/api/installations', { method: 'POST', body: formData });

      if (!response.ok) {
        let errBody: any = null;
        try { errBody = await response.json(); } catch (e) { }
        let errText = `${response.status} ${response.statusText}`;
        if (errBody && typeof errBody === 'object') {
          try {
            const parts: string[] = [];
            for (const [k, v] of Object.entries(errBody)) parts.push(`${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
            if (parts.length > 0) errText = parts.join(' — ');
          } catch (e) { errText = JSON.stringify(errBody); }
        }
        setSubmitErrorMsg(errText); setSubmissionStatus('error'); setIsSubmitting(false);
        const missingField = (errBody && typeof errBody === 'object' && (errBody.field || errBody.name)) ? (errBody.field || errBody.name) : undefined;
        setTimeout(() => scrollToField(missingField), 150);
        setTimeout(() => setSubmissionStatus('idle'), 2000);
        return;
      }

      setSubmissionStatus('success');
      setIsSubmitting(false);
      setTimeout(() => {
        try { window.location.href = 'https://geonet.cl'; } catch (e) { window.open('https://geonet.cl', '_self'); }
      }, 1200);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Por favor, intenta nuevamente.';
      setSubmitErrorMsg(msg); setSubmissionStatus('error');
      setTimeout(() => scrollToField(undefined), 150);
      setTimeout(() => setSubmissionStatus('idle'), 2000);
      toast.error('Error al enviar la solicitud', { description: msg });
      setIsSubmitting(false);
    }
  };

  const { ref: addressHookRef, ...addressRest } = register('address', { required: 'Este campo es requerido' });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50/50 via-white to-orange-50/50">
      <ProcessingModal
        isOpen={isSubmitting || submissionStatus !== 'idle'}
        status={submissionStatus === 'loading' ? 'loading' : submissionStatus === 'success' ? 'success' : submissionStatus === 'error' ? 'error' : 'loading'}
        title={submissionStatus === 'loading' ? 'Enviando solicitud' : submissionStatus === 'success' ? 'Solicitud enviada' : submissionStatus === 'error' ? 'Error al enviar' : undefined}
        description={submissionStatus === 'loading' ? 'Por favor espera…' : submissionStatus === 'success' ? 'Redirigiendo…' : submissionStatus === 'error' ? 'Corrige los campos faltantes' : undefined}
      />

      <header className="bg-white border-b border-gray-200 shadow-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ fontFamily: "'Quicksand', sans-serif", letterSpacing: '-0.02em' }}>
              <img src="https://geonet.cl/wp-content/uploads/2024/12/Logo_186x86.svg" alt="Geonet" className="h-8 sm:h-10 object-contain" />
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-5xl font-bold text-primary mb-4">Solicitar Instalación</h2>
          <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto">
            Completa el siguiente formulario y un asesor te contactará para coordinar la instalación de tu servicio.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

          {/* ── Información Personal + Contacto (unified) ──────────────────────── */}
          <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm overflow-hidden">
            <div className="bg-gradient-to-r from-primary to-primary/90 p-6">
              <div className="flex items-center gap-3 text-white">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">Información Personal y de Contacto</h3>
                  <p className="text-sm text-white/80">Tus datos básicos de identificación y cómo comunicarnos contigo</p>
                </div>
              </div>
            </div>

            <CardContent className="p-6 sm:p-8 space-y-6">
              {/* Row 1: Nombre + Apellidos */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-2.5">
                  <Label htmlFor="firstName" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div> Nombre(s) <span className="text-accent">*</span>
                  </Label>
                  <Input id="firstName" placeholder="Ej. Juan Carlos"
                    {...register('firstName', {
                      required: 'Este campo es requerido',
                      onChange: (e) => { const clean = removeAccentsAndSpecials(e.target.value); setValue('firstName', clean, { shouldValidate: true, shouldDirty: true }); return e; },
                    })}
                    className="h-12 border-2 border-gray-200 focus:border-accent rounded-xl"
                  />
                  {errors.firstName && <p className="text-sm text-destructive">{errors.firstName.message}</p>}
                </div>
                <div className="space-y-2.5">
                  <Label htmlFor="lastName" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div> Apellidos <span className="text-accent">*</span>
                  </Label>
                  <Input id="lastName" placeholder="Ej. Garcia Rodriguez"
                    {...register('lastName', {
                      required: 'Este campo es requerido',
                      onChange: (e) => { const clean = removeAccentsAndSpecials(e.target.value); setValue('lastName', clean, { shouldValidate: true, shouldDirty: true }); return e; },
                    })}
                    className="h-12 border-2 border-gray-200 focus:border-accent rounded-xl"
                  />
                  {errors.lastName && <p className="text-sm text-destructive">{errors.lastName.message}</p>}
                </div>
              </div>

              {/* Row 2: CI + Email */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-2.5">
                  <Label htmlFor="ci" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div> Cédula de Identidad <span className="text-accent">*</span>
                  </Label>
                  <Input id="ci" placeholder="Ej. 12.345.678-5"
                    {...register('ci', {
                      required: 'Este campo es requerido',
                      onChange: (e) => { const val = formatRut(e.target.value); e.target.value = val; setValue('ci', val, { shouldValidate: true }); },
                      validate: (value) => validateRut(value) || 'RUT inválido',
                    })}
                    className="h-12 border-2 border-gray-200 focus:border-accent rounded-xl"
                  />
                  {errors.ci && <p className="text-sm text-destructive">{errors.ci.message}</p>}
                </div>
                <div className="space-y-2.5">
                  <Label htmlFor="email" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div> Correo electrónico <span className="text-accent">*</span>
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input id="email" type="email" placeholder="ejemplo@correo.com"
                      {...register('email', { required: 'Este campo es requerido', pattern: { value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i, message: 'Email inválido' } })}
                      className="h-12 pl-10 border-2 border-gray-200 focus:border-accent rounded-xl"
                    />
                  </div>
                  {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
                </div>
              </div>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-4 text-gray-500 font-medium flex items-center gap-2">
                    <Phone className="w-4 h-4" /> Datos de contacto
                  </span>
                </div>
              </div>

              {/* Row 3: Phone + Additional Phone */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-2.5">
                  <Label htmlFor="phone" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div> Teléfono Celular <span className="text-accent">*</span>
                  </Label>
                  <div className="relative">
                    <div className="absolute left-3 top-0 h-12 flex items-center gap-2 pointer-events-none w-[72px]">
                      <span className="flex-none w-5 h-3 overflow-hidden rounded-sm">
                        <ReactCountryFlag svg countryCode="CL" aria-label="Chile" style={{ width: '18px', height: '12px', display: 'block' }} />
                      </span>
                      <span className="flex-none text-sm text-gray-600 whitespace-nowrap">+56</span>
                    </div>
                    <Input
                      id="phone" type="tel" placeholder="9XXXXXXXX" aria-invalid={!!errors.phone}
                      {...register('phone', {
                        required: 'Este campo es requerido',
                        onChange: (e: any) => { let v = String(e.target.value || '').replace(/\D/g, ''); if (v.length > 9) v = v.slice(0, 9); e.target.value = v; setValue('phone', v, { shouldValidate: true }); },
                        validate: (v: string) => { const cleaned = String(v || '').replace(/\D/g, ''); if (cleaned.length !== 9) return 'El número debe tener 9 dígitos'; if (!/^9/.test(cleaned)) return 'El número debe comenzar con 9'; return true; },
                        onBlur: (e: any) => { const v = String(e.target.value || '').replace(/\D/g, ''); if (!v) return; if (v.length !== 9 || !/^9/.test(v)) toast.error('Teléfono inválido: debe tener 9 dígitos y comenzar con 9'); },
                      })}
                      className={errors.phone ? 'h-12 pl-[72px] border-2 border-red-500 rounded-xl' : 'h-12 pl-[72px] border-2 border-gray-200 focus:border-accent rounded-xl'}
                    />
                    <p className="text-sm text-red-600 mt-2 min-h-5">{errors.phone?.message ? String(errors.phone.message) : ''}</p>
                  </div>
                </div>
                <div className="space-y-2.5">
                  <Label htmlFor="additionalPhone" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-gray-300 rounded-full"></div> Teléfono Adicional
                  </Label>
                  <div className="relative">
                    <div className="absolute left-3 top-0 h-12 flex items-center gap-2 pointer-events-none w-[72px]">
                      <span className="flex-none w-5 h-3 overflow-hidden rounded-sm">
                        <ReactCountryFlag svg countryCode="CL" aria-label="Chile" style={{ width: '18px', height: '12px', display: 'block' }} />
                      </span>
                      <span className="flex-none text-sm text-gray-600 whitespace-nowrap">+56</span>
                    </div>
                    <Input
                      id="additionalPhone" type="tel" placeholder="9XXXXXXXX" aria-invalid={!!errors.additionalPhone}
                      {...register('additionalPhone', {
                        onChange: (e: any) => { let v = String(e.target.value || '').replace(/\D/g, ''); if (v.length > 9) v = v.slice(0, 9); e.target.value = v; setValue('additionalPhone', v, { shouldValidate: true }); },
                        validate: (v: string) => { if (!v) return true; const cleaned = String(v || '').replace(/\D/g, ''); if (cleaned.length !== 9) return 'El número adicional debe tener 9 dígitos'; if (!/^9/.test(cleaned)) return 'El número debe comenzar con 9'; return true; },
                        onBlur: (e: any) => { const v = String(e.target.value || '').replace(/\D/g, ''); if (!v) return; if (v.length !== 9 || !/^9/.test(v)) toast.error('Teléfono adicional inválido: debe tener 9 dígitos y comenzar con 9'); },
                      })}
                      className={errors.additionalPhone ? 'h-12 pl-[72px] border-2 border-red-500 rounded-xl' : 'h-12 pl-[72px] border-2 border-gray-200 focus:border-accent rounded-xl'}
                    />
                    <p className="text-sm text-red-600 mt-2 min-h-5">{errors.additionalPhone?.message ? String(errors.additionalPhone.message) : ''}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Dirección */}
          <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm overflow-hidden">
            <div className="bg-gradient-to-r from-accent to-accent/90 p-6">
              <div className="flex items-center gap-3 text-white">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center">
                  <MapPin className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">Dirección de Instalación</h3>
                  <p className="text-sm text-white/80">Dónde instalaremos tu servicio. Requerimos que introduzcas tu dirección Y la confirmes en el mapa para una mayor precisión.</p>
                </div>
              </div>
            </div>

            <CardContent className="p-6 sm:p-8 space-y-6">
              <div className="space-y-2.5">
                <div className="mb-4 rounded-xl border-2 border-gray-200 bg-white/80 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <Label htmlFor="zoneSelector" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-accent" /> Selecciona tu zona de referencia
                    </Label>
                    <span className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold text-gray-600">{zoneOptions.length} zonas</span>
                  </div>
                  <div className="relative">
                    <Input
                      id="zoneSelector"
                      value={zoneSearchTerm}
                      disabled={zonesStatus === 'loading' || zoneOptions.length === 0}
                      placeholder="Busca tu zona y selecciónala"
                      onChange={(e) => { const next = e.target.value; setZoneSearchTerm(next); setShowZoneSuggestions(true); if (!next.trim()) setSelectedZoneKey(''); }}
                      onFocus={() => setShowZoneSuggestions(true)}
                      onBlur={() => { setTimeout(() => setShowZoneSuggestions(false), 180); }}
                      className="h-12 w-full rounded-xl border-2 border-gray-200 bg-white px-3 pr-10 text-sm text-gray-700 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:bg-gray-100"
                    />
                    <ChevronDown className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 transition-transform ${showZoneSuggestions ? 'rotate-180' : ''}`} />
                    {showZoneSuggestions && (
                      <ul className="absolute z-50 left-0 right-0 top-full mt-1 max-h-64 overflow-y-auto rounded-xl border-2 border-gray-200 bg-white">
                        {zonesStatus === 'loading' && <li className="px-4 py-2.5 text-sm text-gray-500">Cargando zonas…</li>}
                        {zonesStatus !== 'loading' && filteredZoneOptions.length === 0 && <li className="px-4 py-2.5 text-sm text-gray-500">No se encontraron zonas para tu búsqueda.</li>}
                        {zonesStatus !== 'loading' && filteredZoneOptions.slice(0, 80).map((zone) => (
                          <li key={zone.key} onMouseDown={() => handleZoneSelection(zone)}
                            className={`cursor-pointer border-b border-gray-100 px-4 py-2.5 text-sm last:border-0 ${selectedZoneKey === zone.key ? 'bg-accent/10 font-semibold text-gray-800' : 'text-gray-700 hover:bg-accent/5'}`}>
                            {zone.zoneName}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">Si no te ubicas por dirección, usa este selector y luego confirma tu punto exacto en el mapa.</p>
                </div>

                <Label htmlFor="address" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-accent rounded-full"></div> Dirección completa <span className="text-accent">*</span>
                </Label>
                <div className="relative">
                  <div className="flex gap-3 items-center flex-wrap">
                    <div className="flex-1 relative">
                      <Input
                        id="address"
                        autoComplete="new-password"
                        data-lpignore="true"
                        data-form-type="other"
                        placeholder="Ej. Calle Principal #123, entre Av. Libertad"
                        {...addressRest}
                        ref={addressHookRef}
                        onInput={(e) => {
                          const val = (e.target as HTMLInputElement).value;
                          if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
                          if (val.length >= 3) suggestDebounceRef.current = setTimeout(() => void searchAddress(val), 420);
                          else { setShowSuggestions(false); setAddressSuggestions([]); }
                        }}
                        onBlur={() => { setTimeout(() => setShowSuggestions(false), 180); }}
                        onFocus={() => { if (addressSuggestions.length > 0) setShowSuggestions(true); }}
                        className="h-12 border-2 border-gray-200 focus:border-accent rounded-xl"
                      />
                      {showSuggestions && addressSuggestions.length > 0 && (
                        <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                          {addressSuggestions.map((pred, i) => (
                            <li key={pred.place_id ?? i} onMouseDown={() => void pickSuggestion(pred)}
                              className="px-4 py-2.5 text-sm text-gray-700 hover:bg-accent/10 cursor-pointer border-b last:border-0 border-gray-100">
                              <span className="font-medium">{pred.structured_formatting.main_text}</span>
                              {pred.structured_formatting.secondary_text && <span className="text-gray-400 text-xs block">{pred.structured_formatting.secondary_text}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="shrink-0">
                      <Button type="button" variant="outline" onClick={() => void handleUseGeolocation()} disabled={isLocating}
                        className="h-12 w-12 p-0 flex items-center justify-center rounded-xl border-2 border-gray-200 bg-white/60 hover:bg-white" aria-label="Usar mi ubicación">
                        {isLocating ? <Loader2 className="w-5 h-5 text-accent animate-spin" /> : <MapPin className="w-5 h-5 text-gray-700" />}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3">
                    {mapsLoadError ? (
                      <div className="h-[40vh] sm:h-72 md:h-96 rounded-xl border-2 border-gray-200 overflow-hidden flex items-center justify-center p-4 text-sm text-gray-500">
                        Mapa no disponible en este dispositivo. Usa la búsqueda de dirección o prueba desde un equipo.
                      </div>
                    ) : (
                      <div ref={(el) => { mapContainerRef.current = el; }} className="h-[40vh] sm:h-72 md:h-96 rounded-xl border-2 border-gray-200 overflow-hidden" />
                    )}
                  </div>
                </div>
                {errors.address && <p className="text-sm text-destructive">{errors.address.message}</p>}
              </div>

              <div className="space-y-2.5">
                <Label htmlFor="coordinates" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-accent rounded-full"></div> Coordenadas GPS <span className="text-accent">*</span>
                </Label>
                <Input id="coordinates" placeholder="-17.783299, -63.182140" {...register('coordinates', { required: 'Este campo es requerido' })} className="h-12 border-2 border-gray-200 focus:border-accent rounded-xl" />
                {errors.coordinates && <p className="text-sm text-destructive">{errors.coordinates.message}</p>}
                <p className="text-xs text-gray-500">Se completa automáticamente al fijar una ubicación en el mapa.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="space-y-2.5">
                  <Label htmlFor="neighborhood" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div> Barrio/Zona
                  </Label>
                  <Input id="neighborhood" placeholder="Ej. Villa 1ro de Mayo" {...register('neighborhood')} className="h-12 border-2 border-gray-200 focus:border-accent rounded-xl" />
                </div>
                <div className="space-y-2.5">
                  <Label htmlFor="city" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div> Ciudad <span className="text-accent">*</span>
                  </Label>
                  <Input id="city" placeholder="Ej. Santa Cruz" {...register('city', { required: 'Este campo es requerido' })} className="h-12 border-2 border-gray-200 focus:border-accent rounded-xl" />
                  {errors.city && <p className="text-sm text-destructive">{errors.city.message}</p>}
                </div>
                <div className="space-y-2.5">
                  <Label htmlFor="postalCode" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div> Código Postal
                  </Label>
                  <Input id="postalCode" placeholder="Ej. 0000" {...register('postalCode')} className="h-12 border-2 border-gray-200 focus:border-accent rounded-xl" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Plan de Internet ────────────────────────────────────────────────── */}
          <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm overflow-hidden">
            <div className="bg-gradient-to-r from-accent to-accent/90 p-6">
              <div className="flex items-center gap-3 text-white">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center">
                  <Wifi className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">Selecciona tu Plan</h3>
                  <p className="text-sm text-white/80">Elige el plan que deseas contratar</p>
                </div>
              </div>
            </div>

            <CardContent className="px-6 pb-8 pt-4 sm:px-8 sm:pt-5">
              <div className="space-y-5">
                {/* Category switcher — now 3 options */}
                <div className="flex items-center justify-center">
                  <div className="relative inline-flex items-center rounded-full bg-white/90 border border-gray-200 shadow-lg p-1.5 gap-0.5">
                    {[
                      { key: 'home', label: 'Internet' },
                      { key: 'home-tv', label: 'Internet + TV' },
                      { key: 'pyme', label: 'Negocio' },
                    ].map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setPlanCategory(key as any);
                          // Limpiar plan si el actual no pertenece a la nueva categoría
                          const section = planSections.find(s => s.category === key);
                          if (section && (!section.options.some(opt => opt.value === planValue))) {
                            setValue('plan', '', { shouldValidate: true });
                          }
                        }}
                        className={`relative z-10 px-4 sm:px-5 py-2 text-sm sm:text-base font-bold rounded-full transition-all ${planCategory === key ? 'text-white bg-gradient-to-r from-accent to-accent/90 shadow-lg' : 'text-gray-700 hover:text-gray-900'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredPlanSections.map((section) => (
                  <div key={section.title} className="space-y-3">
                    <div className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-accent rounded-full"></div> {section.title}
                    </div>

                    {/* Home + TV plans: richer card design matching the screenshot */}
                    {section.category === 'home-tv' ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {section.options.map((option) => {
                          const opt = option as typeof option & { features: string[]; installation: string; basePrice: string };
                          const isSelected = planValue === opt.value;
                          return (
                            <label key={opt.value}
                              className={`cursor-pointer rounded-2xl border-2 p-5 transition-all flex flex-col gap-3 ${isSelected ? 'border-accent bg-accent/5 shadow-lg scale-[1.01]' : 'border-gray-200 bg-white/70 hover:border-accent/50 hover:shadow-md'}`}>
                              <input type="radio" value={opt.value} className="sr-only" {...register('plan', { required: 'Este campo es requerido' })} />
                              <div className="flex flex-col items-center gap-2 text-center">
                                <div>
                                  <p className="text-sm font-bold text-gray-500 uppercase tracking-wide">{opt.label.split(' ').slice(0, 2).join(' ')}</p>
                                  <p className="text-base font-bold text-gray-800">{opt.label.split(' ').slice(2).join(' ')}</p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <Tv className={`w-5 h-5 ${isSelected ? 'text-accent' : 'text-gray-400'}`} />
                                </div>
                                <div>
                                  <p className="text-2xl font-extrabold text-primary">$ {opt.price}<span className="text-sm font-normal text-gray-500">/mes</span></p>
                                  <p className={`text-xs mt-0.5 ${String(opt.installation).includes('Sin') ? 'text-green-600 font-semibold' : 'text-orange-500 font-bold'}`}>{opt.installation}</p>
                                </div>
                              </div>
                              <ul className="space-y-1.5 text-xs text-gray-600 mt-1">
                                {opt.features.map((f, i) => (
                                  <li key={i} className="flex items-start gap-1.5">
                                    <span className={`mt-0.5 text-lg leading-none ${isSelected ? 'text-accent' : 'text-gray-400'}`}>✓</span>
                                    <span>{f}</span>
                                  </li>
                                ))}
                              </ul>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <div className={section.options.length === 2 ? 'grid grid-cols-1 md:grid-cols-2 gap-5' : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5'}>
                        {section.options.map((option) => {
                          const opt = option as any;
                          const isSelected = planValue === opt.value;
                          const showFeatures = Array.isArray(opt.features) && opt.features.length > 0;
                          let installationText = '';
                          if (section.category === 'home') installationText = 'Instalación: $9.990';
                          if (section.category === 'pyme') installationText = 'Sin costo de instalación';
                          return (
                            <label key={opt.value}
                              className={`cursor-pointer rounded-2xl border-2 p-5 transition-all flex flex-col gap-3 ${isSelected ? 'border-accent bg-accent/5 shadow-lg scale-[1.01]' : 'border-gray-200 bg-white/70 hover:border-accent/50 hover:shadow-md'}`}>
                              <input type="radio" value={opt.value} className="sr-only" {...register('plan', { required: 'Este campo es requerido' })} />
                              <div className="flex flex-col items-center gap-2 text-center">
                                <div>
                                  <p className="text-sm font-bold text-gray-500 uppercase tracking-wide">{String(opt.label).split(' ').slice(0, 2).join(' ')}</p>
                                  <p className="text-base font-bold text-gray-800">{String(opt.label).split(' ').slice(2).join(' ') || opt.label}</p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <div className={`w-5 h-5 ${isSelected ? 'text-accent' : 'text-gray-400'}`} />
                                </div>
                                <div>
                                  <p className="text-2xl font-extrabold text-primary">$ {opt.price}<span className="text-sm font-normal text-gray-500">/mes</span></p>
                                  {opt.installation || installationText ? (
                                    <p className={`text-xs mt-0.5 ${String(opt.installation || installationText).includes('Sin') ? 'text-green-600 font-semibold' : 'text-orange-500 font-bold'}`}>{opt.installation || installationText || 'Instalación sujeta a factibilidad'}</p>
                                  ) : null}
                                </div>
                              </div>
                              {showFeatures && (
                                <ul className="space-y-1.5 text-xs text-gray-600 mt-1">
                                  {opt.features.map((f: string, i: number) => (
                                    <li key={i} className="flex items-start gap-1.5">
                                      <span className={`mt-0.5 text-lg leading-none ${isSelected ? 'text-accent' : 'text-gray-400'}`}>✓</span>
                                      <span>{f}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
                {errors.plan && <p className="text-sm text-destructive">{errors.plan.message}</p>}

                {/* ── Decoders selector (only visible for TV plans) ──────────────── */}
                {currentPlanIsTv && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="rounded-2xl border-2 border-accent/30 bg-accent/5 p-4 sm:p-5"
                  >
                    <div className="flex items-start gap-4 flex-wrap sm:flex-nowrap">
                      <div className="flex items-center justify-center w-12 h-12 bg-accent/10 rounded-xl shrink-0">
                        <Tv className="w-6 h-6 text-accent" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-800 mb-0.5">Decodificadores adicionales</p>
                        <p className="text-xs text-gray-500">Tu plan incluye 1 decodificador. Puedes agregar hasta 2 decodificadores extra para otras habitaciones.</p>
                        <p className="text-sm text-accent font-semibold mt-1">Precio por decodificador extra: $ {new Intl.NumberFormat('es-CL').format(PRICE_PER_DECO)}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 mt-2 sm:mt-0 w-full sm:w-auto justify-between sm:justify-end">
                        <button
                          type="button"
                          onClick={() => setDecosExtras(Math.max(0, decosExtras - 1))}
                          disabled={decosExtras === 0}
                          className="w-12 h-12 sm:w-10 sm:h-10 rounded-xl border-2 border-gray-200 bg-white flex items-center justify-center text-gray-700 hover:border-accent hover:text-accent disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                          aria-label="Reducir decodificadores"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <div className="w-12 text-center flex flex-col items-center">
                          <span className="text-2xl font-extrabold text-primary">{decosExtras}</span>
                          <p className="text-[10px] text-gray-400 leading-tight">extra{decosExtras !== 1 ? 's' : ''}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDecosExtras(Math.min(2, decosExtras + 1))}
                          disabled={decosExtras === 2}
                          className="w-12 h-12 sm:w-10 sm:h-10 rounded-xl border-2 border-gray-200 bg-white flex items-center justify-center text-gray-700 hover:border-accent hover:text-accent disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                          aria-label="Agregar decodificador"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {decosExtras > 0 && (
                      <p className="mt-3 text-xs text-accent font-semibold ml-0 sm:ml-16">
                        {decosExtras === 1 ? '1 decodificador extra seleccionado' : '2 decodificadores extra seleccionados'} — Costo adicional: $ {new Intl.NumberFormat('es-CL').format(decosExtras * PRICE_PER_DECO)}
                      </p>
                    )}
                  </motion.div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Documentos */}
          <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm overflow-hidden">
            <div className="bg-gradient-to-r from-accent to-accent/90 p-6">
              <div className="flex items-center gap-3 text-white">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">Documentación Requerida</h3>
                  <p className="text-sm text-white/80">Sube tus documentos en formato de imagen</p>
                </div>
              </div>
            </div>
            <CardContent className="p-6 sm:p-8 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* ID Front */}
                <div className="space-y-3">
                  <Label htmlFor="idFront" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div> Cedula de Identidad/Carnet (Frente)
                  </Label>
                  <div className="relative group">
                    <input id="idFront" type="file" accept="image/jpeg,image/png" capture="environment" {...idFrontRegister} ref={(el) => { idFrontRegister.ref(el); idFrontFileInputRef.current = el; }} className="hidden" />
                    <label htmlFor="idFront" onClick={() => { if (idFrontFileInputRef.current) idFrontFileInputRef.current.value = ''; }}
                      className="flex items-center justify-center gap-3 h-14 bg-gradient-to-r from-accent to-accent/90 hover:from-accent/90 hover:to-accent text-white rounded-xl cursor-pointer shadow-md font-semibold">
                      <Upload className="w-5 h-5" /> {idFrontName ? 'Cambiar archivo' : 'Seleccionar archivo'}
                    </label>
                    <p className="text-xs text-gray-500 mt-2">Requerimientos: JPG/JPEG/PNG · Mínimo {MIN_IMAGE_WIDTH}×{MIN_IMAGE_HEIGHT} px</p>
                    {idFrontError && <p className="text-sm text-destructive mt-2">{idFrontError}</p>}
                  </div>
                </div>
                {/* ID Back */}
                <div className="space-y-3">
                  <Label htmlFor="idBack" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div> Cedula de Identidad/Carnet (Reverso)
                  </Label>
                  <div className="relative group">
                    <input id="idBack" type="file" accept="image/jpeg,image/png" capture="environment" disabled={!hasIdFront} {...idBackRegister} ref={(el) => { idBackRegister.ref(el); idBackFileInputRef.current = el; }} className="hidden" />
                    <label htmlFor="idBack"
                      onClick={(e) => { if (!hasIdFront) { e.preventDefault(); toast.error('Primero sube el frente'); return; } if (idBackFileInputRef.current) idBackFileInputRef.current.value = ''; }}
                      className={hasIdFront ? 'flex items-center justify-center gap-3 h-14 bg-gradient-to-r from-accent to-accent/90 hover:from-accent/90 hover:to-accent text-white rounded-xl cursor-pointer shadow-md font-semibold' : 'flex items-center justify-center gap-3 h-14 bg-gray-200 text-gray-500 rounded-xl cursor-not-allowed font-semibold'}>
                      <Upload className="w-5 h-5" /> {idBackName ? 'Cambiar archivo' : 'Seleccionar archivo'}
                    </label>
                    <p className="text-xs text-gray-500 mt-2">Requerimientos: JPG/JPEG/PNG · Mínimo {MIN_IMAGE_WIDTH}×{MIN_IMAGE_HEIGHT} px</p>
                    {idBackError && <p className="text-sm text-destructive mt-2">{idBackError}</p>}
                  </div>
                </div>
                {/* Address Proof */}
                <div className="space-y-3">
                  <Label htmlFor="addressProof" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div> Comprobante de Domicilio
                  </Label>
                  <div className="relative group">
                    <input id="addressProof" type="file" accept="image/jpeg,image/png" capture="environment"
                      {...register('addressProof', {
                        onChange: async (e) => {
                          const files = e.target.files;
                          if (files?.length) {
                            const f = files[0];
                            if (!isAllowedImage(f)) { toast.error('Solo se permiten imágenes JPG o PNG'); if (e?.target) e.target.value = ''; setAddressProofName(''); try { setValue('addressProof', new DataTransfer().files); } catch (err) { } return; }
                            const res = await checkImageResolution(f);
                            if (!res.ok) { toast.error(`Resolución insuficiente: mínimo ${MIN_IMAGE_WIDTH}x${MIN_IMAGE_HEIGHT}px — imagen ${res.width}x${res.height}px`); if (e?.target) e.target.value = ''; setAddressProofName(''); try { setValue('addressProof', new DataTransfer().files); } catch (err) { } return; }
                            setAddressProofName(f.name);
                          }
                        }
                      })} className="hidden" />
                    <label htmlFor="addressProof" className="flex items-center justify-center gap-3 h-14 bg-gradient-to-r from-accent to-accent/90 hover:from-accent/90 hover:to-accent text-white rounded-xl cursor-pointer shadow-md font-semibold">
                      <Upload className="w-5 h-5" /> {addressProofName ? 'Cambiar archivo' : 'Seleccionar archivo'}
                    </label>
                    <p className="text-xs text-gray-500 mt-2">Requerimientos: JPG/JPEG/PNG · Mínimo {MIN_IMAGE_WIDTH}×{MIN_IMAGE_HEIGHT} px</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Comentarios */}
          <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm overflow-hidden">
            <div className="bg-gradient-to-r from-primary to-primary/90 p-6">
              <div className="flex items-center gap-3 text-white">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">Comentarios Adicionales</h3>
                  <p className="text-sm text-white/80">Información extra que deseas compartir</p>
                </div>
              </div>
            </div>
            <CardContent className="p-6 sm:p-8">
              <div className="space-y-2.5">
                <Label htmlFor="comments" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-gray-300 rounded-full"></div> Comentarios o solicitudes especiales
                </Label>
                <Textarea id="comments" rows={5} placeholder="Ej. Referencia de la casa, horario preferente, indicaciones para el instalador, etc." {...register('comments')} className="border-2 border-gray-200 focus:border-accent rounded-xl" />
              </div>
            </CardContent>
          </Card>

          {/* Fecha y Horario */}
          <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
            <div className="bg-gradient-to-r from-accent to-accent/90 p-6 rounded-t-xl">
              <div className="flex items-center gap-3 text-white">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center">
                  <Calendar className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">Selecciona tu disponibilidad para agendar la instalación</h3>
                  <div className="mt-2 w-full">
                    <div className="flex items-center gap-2 px-2 py-1 rounded-lg border border-red-200 bg-red-50/80">
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-red-700">
                        <span className="text-white text-xs font-bold">!</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="block text-[11px] font-black uppercase tracking-widest text-red-700/70 leading-tight">Nota Importante</span>
                        <span className="block text-[11px] font-semibold text-red-900 leading-tight">
                          Elige los días de tu interés. El horario final queda sujeto a confirmación por parte de los agentes de ventas según disponibilidad y
                          <span className="ml-1 rounded-sm bg-red-100 px-1 text-red-700 underline decoration-red-400 underline-offset-2">no necesariamente será el día de tu instalación.</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <CardContent className="p-6 sm:p-8 space-y-6">
              <div className="space-y-4">
                <Label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-accent rounded-full"></div> Días Disponibles <span className="text-accent">*</span>
                </Label>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-2">
                  {validDates.map((dateInfo) => {
                    const displayDate = formatDateDisplay(dateInfo.formatted);
                    const isSelected = selectedDates.includes(dateInfo.formatted);
                    return (
                      <motion.button key={dateInfo.formatted} type="button" onClick={() => toggleDate(dateInfo.formatted)}
                        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                        className={`relative p-3 rounded-lg border transition-all flex flex-col items-center justify-center gap-0.5 min-h-[70px] ${isSelected ? 'bg-gradient-to-br from-accent via-accent to-accent/80 border-accent/50 text-white shadow-lg' : 'bg-white/60 border-gray-300/50 hover:bg-white text-gray-700'}`}>
                        <span className={`text-[10px] uppercase font-bold ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>{displayDate.dayName}</span>
                        <span className="text-xl font-extrabold leading-none">{displayDate.dayNumber}</span>
                        <span className={`text-[9px] uppercase font-semibold ${isSelected ? 'text-white/70' : 'text-gray-400'}`}>{displayDate.month}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2.5">
                  <Label htmlFor="timeFrom" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full"></div> Desde <span className="text-primary">*</span>
                  </Label>
                  <Controller name="timeFrom" control={control} rules={{ required: 'Este campo es requerido', validate: (v) => validateTimeRange(v, timeToValue || '') }} render={({ field }) => (
                    <TimeSelect id="timeFrom" tone="primary" value={field.value} onValueChange={field.onChange} options={timeOptions} placeholder="Seleccionar hora" />
                  )} />
                  {errors.timeFrom && <p className="text-sm text-destructive">{errors.timeFrom.message}</p>}
                </div>
                <div className="space-y-2.5">
                  <Label htmlFor="timeTo" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div> Hasta <span className="text-accent">*</span>
                  </Label>
                  <Controller name="timeTo" control={control} rules={{ required: 'Este campo es requerido', validate: (v) => validateTimeRange(timeFromValue || '', v) }} render={({ field }) => (
                    <TimeSelect id="timeTo" tone="accent" disabled={!timeFromValue} value={field.value} onValueChange={(v) => { field.onChange(v); try { clearErrors('timeTo'); } catch (e) { } }} options={filteredTimeToOptions} placeholder={timeFromValue ? 'Seleccionar hora' : 'Selecciona "Desde" primero'} />
                  )} />
                  {errors.timeTo && <p className="text-sm text-destructive">{errors.timeTo.message}</p>}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="pt-4">
            <Button type="submit" className="w-full bg-gradient-to-r from-accent to-accent/90 hover:from-accent/90 hover:to-accent text-white py-7 text-lg shadow-2xl font-bold rounded-2xl" disabled={isSubmitting || submitted}>
              {isSubmitting ? 'Enviando solicitud...' : submitted ? '¡Enviado!' : 'Enviar Solicitud'}
            </Button>
          </div>
          {submitErrorMsg && <div ref={submitMsgRef} className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/5 px-5 py-4 text-destructive shadow-sm font-bold">Error: {submitErrorMsg}</div>}
          {submitted && !submitErrorMsg && <div ref={submitMsgRef} className="mt-4 rounded-2xl border border-accent/20 bg-accent/10 px-5 py-4 text-primary shadow-sm font-bold">¡Solicitud enviada!</div>}
        </form>
      </main>

      {/* Footer */}
      <footer className="bg-[#1a2b6d] text-white py-12 mt-16 relative">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 items-start">
            <div className="md:col-span-4 text-center md:text-left space-y-4">
              <h2 className="text-3xl sm:text-4xl font-bold" style={{ fontFamily: "'Quicksand', sans-serif", letterSpacing: '-0.02em' }}>
                <img src="https://geonet.cl/wp-content/uploads/2024/12/logo-footer.png" alt="Geonet" className="h-8 sm:h-10 mx-auto md:mx-0 object-contain" />
              </h2>
              <p className="text-sm text-white/90 leading-relaxed max-w-xs mx-auto md:mx-0">
                Con 20 años de experiencia brindando internet de alta calidad a empresas, en GEONET estamos emocionados de llevar este mismo nivel de servicio a los hogares.
              </p>
            </div>
            <div className="hidden md:block md:col-span-1 h-32 border-l border-white/20 mx-auto"></div>
            <div className="md:col-span-3 text-center md:text-left space-y-3">
              <ul className="space-y-3 text-sm">
                <li><a href="#" className="text-white hover:text-accent transition-colors font-medium">Planes</a></li>
                <li><a href="https://clientes.portalinternet.app/saldo/geonet/" className="text-white hover:text-accent transition-colors font-medium">Paga tu cuenta</a></li>
                <li><a href="#" className="text-white hover:text-accent transition-colors font-medium">Preguntas frecuentes</a></li>
                <li><a href="https://empresas.geonet.cl" className="text-white hover:text-accent transition-colors font-medium">Internet rural</a></li>
              </ul>
            </div>
            <div className="md:col-span-4 text-center md:text-left space-y-3">
              <div className="flex items-center justify-center md:justify-start gap-3 mb-4">
                <h3 className="text-accent font-bold text-lg">Contáctanos</h3>
                <div className="w-3 h-3 bg-accent rounded-full"></div>
              </div>
              <div className="space-y-2 text-sm">
                <p className="text-white font-semibold">+56 9 4071 5729</p>
                <p className="text-white/90">Tres Sur 681, Talca - Chile</p>
                <a href="https://www.google.com/maps/place/Geonet/@-35.4292574,-71.6698095,17z" className="text-white/90 hover:text-accent transition-colors inline-block underline">Ver en el mapa</a>
              </div>
            </div>
          </div>
          <div className="mt-12 pt-6 text-center text-sm text-white/80">
            <p>Talca - Chile © 2026 Geonet</p>
          </div>
        </div>
      </footer>

      {/* WhatsApp button */}
      <motion.a
        href="https://wa.me/56940715729" target="_blank" rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 w-16 h-16 bg-[#25D366] hover:bg-[#20BA5A] rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110"
        initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
        whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}
      >
        <svg viewBox="0 0 24 24" className="w-9 h-9" fill="white" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
        </svg>
      </motion.a>
    </div>
  );
}