import { useState, useRef, useEffect } from 'react';
import ReactCountryFlag from 'react-country-flag';
import { Controller, useForm } from 'react-hook-form';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Textarea } from './components/ui/textarea';
import { Card, CardContent } from './components/ui/card';
import { MapPin, Upload, User, Phone, FileText, Image as Mail, Calendar, Wifi, Loader2 } from 'lucide-react';
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
  // Verificamos si las librerías necesarias ya están cargadas
  if (window.google?.maps?.places && window.google?.maps?.marker) return Promise.resolve();
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
    // Se añade loading=async y la librería marker
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey,
    )}&libraries=places,marker&loading=async&language=es&region=CL&callback=__onGoogleMapsLoaded`;
    document.head.appendChild(script);
  });

  return googleMapsLoadPromise;
};

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
}

export default function App() {
  const { register, handleSubmit, formState: { errors }, reset, setValue, watch, control, clearErrors, trigger } = useForm<FormData>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitErrorMsg, setSubmitErrorMsg] = useState<string | null>(null);
  const [submissionStatus, setSubmissionStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  
  // Estado para controlar el loading del botón de ubicación
  const [isLocating, setIsLocating] = useState(false);

  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Control para interacción del mapa en móvil
  const [mapInteractionEnabled, setMapInteractionEnabled] = useState<boolean>(() => !isMobile);

  const [idFrontName, setIdFrontName] = useState<string>('');
  const [idBackName, setIdBackName] = useState<string>('');
  const [addressProofName, setAddressProofName] = useState<string>('');
  const [idFrontError, setIdFrontError] = useState<string>('');
  const [idBackError, setIdBackError] = useState<string>('');
  const [addressProofError, setAddressProofError] = useState<string>('');
  const [couponName, setCouponName] = useState<string>('');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [planCategory, setPlanCategory] = useState<'home' | 'pyme'>('home');

  const idFrontFileInputRef = useRef<HTMLInputElement | null>(null);
  const idBackFileInputRef = useRef<HTMLInputElement | null>(null);

  const idFrontFiles = watch('idFront');
  const timeFromValue = watch('timeFrom');
  const timeToValue = watch('timeTo');
  const planValue = watch('plan');
  const hasIdFront = Boolean(idFrontName) || ((idFrontFiles?.length ?? 0) > 0);
  const submitMsgRef = useRef<HTMLDivElement | null>(null);

  const fileToFileList = (file: File) => {
    const dt = new DataTransfer();
    dt.items.add(file);
    return dt.files;
  };

  const scrollToField = (fieldName?: string) => {
    try {
      let el: Element | null = null;
      if (fieldName) {
        el = document.querySelector(`[name="${fieldName}"], #${fieldName}, [data-field="${fieldName}"]`);
      }
      if (!el) el = document.querySelector('.is-invalid, [aria-invalid="true"], :invalid');
      if (!el) el = document.querySelector('input[name], select[name], textarea[name]');
      if (el && (el as HTMLElement).scrollIntoView) {
        (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
        try { (el as HTMLElement).focus(); } catch (e) {}
      }
    } catch (e) {
      // ignore
    }
  };

  // Valida que el archivo sea JPG o PNG estrictamente
  const isAllowedImage = (file?: File | null) => {
    if (!file) return false;
    const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'image/pjpeg'];
    if (allowed.includes(file.type)) return true;
    return /\.(jpe?g|png)$/i.test(file.name || '');
  };

  // Resolución mínima requerida (px)
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
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ ok: false, width: 0, height: 0 });
      };
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
          toast.error(msg);
          setIdFrontError(msg);
          if (e?.target) e.target.value = '';
          setIdFrontName('');
          try { setValue('idFront', new DataTransfer().files); } catch (err) {}
          return;
        }
        const res = await checkImageResolution(f);
        if (!res.ok) {
          const msg = `Resolución insuficiente — la imagen debe medir al menos ${MIN_IMAGE_WIDTH}×${MIN_IMAGE_HEIGHT} px. (Actual: ${res.width}×${res.height} px)`;
          toast.error(msg);
          setIdFrontError(msg);
          if (e?.target) e.target.value = '';
          setIdFrontName('');
          try { setValue('idFront', new DataTransfer().files); } catch (err) {}
          return;
        }
        setIdFrontError('');
        setIdFrontName(f.name);
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
          toast.error(msg);
          setIdBackError(msg);
          if (e?.target) e.target.value = '';
          setIdBackName('');
          try { setValue('idBack', new DataTransfer().files); } catch (err) {}
          return;
        }
        const res = await checkImageResolution(f);
        if (!res.ok) {
          const msg = `Resolución insuficiente — la imagen debe medir al menos ${MIN_IMAGE_WIDTH}×${MIN_IMAGE_HEIGHT} px. (Actual: ${res.width}×${res.height} px)`;
          toast.error(msg);
          setIdBackError(msg);
          if (e?.target) e.target.value = '';
          setIdBackName('');
          try { setValue('idBack', new DataTransfer().files); } catch (err) {}
          return;
        }
        if (!hasIdFront) {
          const msg = 'Primero debes subir la identificación (frente)';
          toast.error(msg);
          setIdBackError(msg);
          if (e?.target) e.target.value = '';
          setIdBackName('');
          return;
        }
        setIdBackError('');
        setIdBackName(f.name);
      }
    },
  });

  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteInstance = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  // Refs para evitar repetir notificaciones de autocorrección
  const phoneAutoCorrectedRef = useRef(false);
  const addPhoneAutoCorrectedRef = useRef(false);

  // Inicializar Autocomplete con la nueva API (PlaceAutocomplete)
  useEffect(() => {
    let cancelled = false;

    const initAutocomplete = async () => {
      try {
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
        const runtimeKey = window.__ENV__?.VITE_GOOGLE_MAPS_API_KEY;
        const effectiveKey = apiKey || runtimeKey;
        if (!effectiveKey) {
          console.error('Falta VITE_GOOGLE_MAPS_API_KEY');
          return;
        }

        await loadGoogleMapsPlaces(effectiveKey);
        if (cancelled) return;

        if (!addressInputRef.current) return;

        const Places = window.google?.maps?.places || {};

        // Intentar con la nueva API: PlaceAutocomplete
        if (Places.PlaceAutocomplete) {
          const ac = new Places.PlaceAutocomplete(addressInputRef.current, {
            componentRestrictions: { country: 'cl' },
            fields: ['address_components', 'geometry', 'formatted_address'],
            types: ['geocode'],
          });
          autocompleteInstance.current = ac;
          ac.addListener('place_changed', () => {
            const place = ac.getPlace();
            fillAddressForm(place);
            if (place?.geometry?.location) {
              const lat = typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat;
              const lng = typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng;
              if (!mapInstanceRef.current && mapContainerRef.current) {
                initMiniMap().then(() => updateMapMarker(lat, lng));
              } else {
                updateMapMarker(lat, lng);
              }
            }
          });
        } 
        // Fallback al antiguo Autocomplete (solo si no existe PlaceAutocomplete)
        else if (Places.Autocomplete) {
          const ac = new Places.Autocomplete(addressInputRef.current, {
            componentRestrictions: { country: 'cl' },
            fields: ['address_components', 'geometry', 'formatted_address'],
            types: ['geocode'],
          });
          autocompleteInstance.current = ac;
          ac.addListener('place_changed', () => {
            const place = ac.getPlace();
            fillAddressForm(place);
            if (place?.geometry?.location) {
              const lat = typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat;
              const lng = typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng;
              if (!mapInstanceRef.current && mapContainerRef.current) {
                initMiniMap().then(() => updateMapMarker(lat, lng));
              } else {
                updateMapMarker(lat, lng);
              }
            }
          });
        } else {
          console.warn('No se encontró ninguna API de autocompletado de Google Maps');
        }
      } catch (error) {
        console.error('Error cargando Google Maps Places Library', error);
      }
    };

    void initAutocomplete();
    return () => {
      cancelled = true;
    };
  }, []);

  const getEffectiveGoogleKey = () => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
    const runtimeKey = window.__ENV__?.VITE_GOOGLE_MAPS_API_KEY;
    return apiKey || runtimeKey || '';
  };

  const ensureMapsLoaded = async () => {
    const key = getEffectiveGoogleKey();
    if (!key) return Promise.reject(new Error('Falta VITE_GOOGLE_MAPS_API_KEY'));
    return loadGoogleMapsPlaces(key);
  };

  // --- MAPAS Y MARCADORES (Modernizado con AdvancedMarkerElement) ---
  const updateMapMarker = (lat: number, lng: number, pan = true) => {
    try {
      if (!mapInstanceRef.current || !window.google?.maps) return;
      const pos = { lat, lng };

      // Eliminar marcador anterior
      if (markerRef.current) {
        markerRef.current.map = null;
        markerRef.current = null;
      }

      // Usar AdvancedMarkerElement si está disponible (evita warnings de depreciación)
      const { AdvancedMarkerElement } = window.google.maps.marker || {};
      
      if (AdvancedMarkerElement) {
         markerRef.current = new AdvancedMarkerElement({
            map: mapInstanceRef.current,
            position: pos,
         });
      } else {
         // Fallback legacy
         markerRef.current = new window.google.maps.Marker({
            position: pos,
            map: mapInstanceRef.current
         });
      }

      if (pan) mapInstanceRef.current.panTo(pos);
      mapInstanceRef.current.setZoom(16);
    } catch (e) {
       console.error("Error actualizando marcador", e);
    }
  };

  const reverseGeocodeAndFill = async (lat: number, lng: number) => {
    try {
      if (!window.google?.maps?.Geocoder) return;
      
      const geocoder = new window.google.maps.Geocoder();
      const res = await new Promise<any>((resolve, reject) =>
        geocoder.geocode({ location: { lat, lng } }, (results: any, status: any) => {
          if (status === 'OK') resolve(results); else reject(status);
        }),
      );
      const place = Array.isArray(res) && res.length > 0 ? res[0] : null;
      if (!place) return;

      const formatted = place.formatted_address as string | undefined;
      if (formatted) {
        setValue('address', formatted.split(',')[0]);
        if (addressInputRef.current) addressInputRef.current.value = formatted.split(',')[0];
      }

      const components = place.address_components || [];
      const getComponent = (types: string[]) =>
        components.find((c: any) => types.every((t: string) => c.types.includes(t)))?.long_name;

      const cityVal =
        getComponent(['locality']) || getComponent(['administrative_area_level_2']) || getComponent(['administrative_area_level_1']);
      const neighborhoodVal = getComponent(['sublocality']) || getComponent(['neighborhood']) || getComponent(['sublocality_level_1']);
      const postalCodeVal = getComponent(['postal_code']);

      if (cityVal) setValue('city', cityVal);
      if (neighborhoodVal) setValue('neighborhood', neighborhoodVal);
      if (postalCodeVal) setValue('postalCode', postalCodeVal);

      setValue('coordinates', `${lat.toFixed(6)}, ${lng.toFixed(6)}`, { shouldValidate: true });
    } catch (e) {
      // Si falla geocodificación inversa, al menos guardamos las coordenadas
      setValue('coordinates', `${lat.toFixed(6)}, ${lng.toFixed(6)}`, { shouldValidate: true });
    }
  };

  const initMiniMap = async () => {
    try {
      if (!mapContainerRef.current) return;
      try {
        await ensureMapsLoaded();
      } catch (e) {
        console.warn('Google Maps not loaded, minimap disabled');
        return;
      }

      if (!window.google?.maps) return;
      if (mapInstanceRef.current) return;

      const defaultCenter = { lat: -35.4269, lng: -71.6554 };
      
      // mapId es necesario para AdvancedMarkerElement. 'DEMO_MAP_ID' es válido para desarrollo.
      mapInstanceRef.current = new window.google.maps.Map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: 13,
        zoomControl: true,
        fullscreenControl: true,
        streetViewControl: false,
        mapTypeControl: false,
        clickableIcons: false,
        gestureHandling: mapInteractionEnabled ? 'greedy' : (isMobile ? 'cooperative' : 'auto'),
        mapId: 'DEMO_MAP_ID',
      });

      mapInstanceRef.current.addListener('click', (ev: any) => {
        const lat = ev.latLng.lat();
        const lng = ev.latLng.lng();
        updateMapMarker(lat, lng);
        void reverseGeocodeAndFill(lat, lng);
      });

      // Si el usuario toca el mapa en móvil, habilitamos interacción (pellizcar/arrastrar)
      if (isMobile && mapContainerRef.current) {
        const onTouch = () => {
          try {
            if (mapInstanceRef.current) mapInstanceRef.current.setOptions({ gestureHandling: 'greedy' });
            setMapInteractionEnabled(true);
          } catch (e) {}
        };
        mapContainerRef.current.addEventListener('touchstart', onTouch, { passive: true, once: true });
      }

      const coords = (watch('coordinates') || '') as string;
      if (coords) {
        const [latS, lngS] = coords.split(',').map((s: string) => s.trim());
        const lat = parseFloat(latS);
        const lng = parseFloat(lngS);
        if (Number.isFinite(lat) && Number.isFinite(lng)) updateMapMarker(lat, lng, false);
      }
    } catch (e) {
      console.error('initMiniMap error', e);
    }
  };

  useEffect(() => {
    void initMiniMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapContainerRef.current]);


  // --- ESTRATEGIA DE GEOLOCALIZACIÓN DE 3 NIVELES ---

  // 1. Google Geolocation API (Requiere habilitar "Geolocation API" en Google Cloud)
  const fetchGoogleGeolocation = async (): Promise<{ lat: number; lng: number } | null> => {
    try {
      const apiKey = getEffectiveGoogleKey();
      if (!apiKey) return null;

      const res = await fetch(`https://www.googleapis.com/geolocation/v1/geolocate?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ considerIp: true }), 
      });

      if (!res.ok) return null;
      
      const data = await res.json();
      if (data.location) {
        return { lat: data.location.lat, lng: data.location.lng };
      }
      return null;
    } catch (e) {
      console.error("Error en Google Geolocation API:", e);
      return null;
    }
  };

  // 2. IP Fallback (Último recurso)
  const fetchIPLocation = async (): Promise<{ lat: number; lng: number } | null> => {
    try {
      const res = await fetch('https://ipapi.co/json/');
      if (!res.ok) return null;
      const body = await res.json();
      const lat = parseFloat(body.latitude ?? body.lat ?? '');
      const lng = parseFloat(body.longitude ?? body.lon ?? body.lon ?? '');
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
      return null;
    } catch (e) {
      return null;
    }
  };

  // 3. Manejador Principal
  const handleUseGeolocation = async () => {
    setIsLocating(true);
    
    // Helper para procesar ubicación encontrada
    const processFoundLocation = async (lat: number, lng: number, msg: string) => {
        try { await ensureMapsLoaded(); } catch(e) {}
        
        if (!mapInstanceRef.current && mapContainerRef.current) {
            await initMiniMap();
        }
        
        updateMapMarker(lat, lng);
        await reverseGeocodeAndFill(lat, lng);
        toast.success(msg);
    };

    try {
      // PLAN A: Intentar GPS del Navegador (Alta precisión)
      const getPosition = (opts: PositionOptions): Promise<GeolocationPosition> => {
          return new Promise((resolve, reject) => {
              if (!navigator.geolocation) return reject(new Error("No support"));
              navigator.geolocation.getCurrentPosition(resolve, reject, opts);
          });
      }
      
      // Timeout corto (3s) para no hacer esperar si el navegador falla
      const pos = await getPosition({ enableHighAccuracy: true, timeout: 7000, maximumAge: 0 });
      await processFoundLocation(pos.coords.latitude, pos.coords.longitude, 'Ubicación GPS encontrada');

    } catch (browserError: any) {
      console.warn("Navegador falló, intentando fallback de baja precisión...", browserError);

      // Intentar segunda lectura con menor precisión antes de usar Google API
      try {
        const getPosition = (opts: PositionOptions): Promise<GeolocationPosition> => {
          return new Promise((resolve, reject) => {
            if (!navigator.geolocation) return reject(new Error("No support"));
            navigator.geolocation.getCurrentPosition(resolve, reject, opts);
          });
        };
        const pos2 = await getPosition({ enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
        await processFoundLocation(pos2.coords.latitude, pos2.coords.longitude, 'Ubicación GPS (baja precisión) encontrada');
        setIsLocating(false);
        return;
      } catch (secondaryError) {
        console.warn('Fallback de baja precisión falló, intentando Google API...', secondaryError);
      }

      // PLAN B: Google Geolocation API (Ideal para Desktop sin GPS)
      try {
        const googleLoc = await fetchGoogleGeolocation();
        if (googleLoc) {
           await processFoundLocation(googleLoc.lat, googleLoc.lng, 'Ubicación detectada por Google');
           setIsLocating(false);
           return;
        }
      } catch (googleError) {
         console.warn("Google API falló, intentando IP...");
      }

      // PLAN C: IP (Baja precisión)
      try {
          const ipLoc = await fetchIPLocation();
          if (ipLoc) {
             await processFoundLocation(ipLoc.lat, ipLoc.lng, 'Ubicación aproximada (ISP)');
             toast.warning('Ubicación aproximada. Verifica en el mapa.');
          } else {
             toast.error('No se pudo obtener la ubicación.');
          }
      } catch (ipError) {
          toast.error('Error al detectar ubicación. Ingrésala manualmente.');
      }
    } finally {
      setIsLocating(false);
    }
  };

  const fillAddressForm = (place: any) => {
    if (!place.geometry || !place.geometry.location) {
      toast.error('No se encontraron detalles para esta dirección');
      return;
    }

    const loc = place.geometry.location;
    const latNum = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
    const lngNum = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
    
    setValue('coordinates', `${latNum.toFixed(6)}, ${lngNum.toFixed(6)}`, { shouldValidate: true });

    if (place.formatted_address) {
       setValue('address', place.formatted_address.split(',')[0]);
    }

    const components = place.address_components || [];
    const getComponent = (types: string[]) =>
      components.find((c: any) => types.every((t: string) => c.types.includes(t)))?.long_name;

    const cityVal =
      getComponent(['locality']) ||
      getComponent(['administrative_area_level_2']) ||
      getComponent(['administrative_area_level_1']);

    const neighborhoodVal =
      getComponent(['sublocality']) ||
      getComponent(['neighborhood']) ||
      getComponent(['sublocality_level_1']);

    const postalCodeVal = getComponent(['postal_code']);

    if (cityVal) setValue('city', cityVal);
    if (neighborhoodVal) setValue('neighborhood', neighborhoodVal);
    if (postalCodeVal) setValue('postalCode', postalCodeVal);

    toast.success('Dirección seleccionada');
  };


  const getValidDates = () => {
    const dates: {date: Date, formatted: string}[] = [];
    const today = new Date();
    const twoWeeksLater = new Date();
    twoWeeksLater.setDate(today.getDate() + 14);

    let currentDate = new Date(today);
    currentDate.setDate(currentDate.getDate() + 1); 

    while (currentDate <= twoWeeksLater) {
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        const formatted = currentDate.toISOString().split('T')[0];
        dates.push({ date: new Date(currentDate), formatted });
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return dates;
  };

  const validDates = getValidDates();

  const timeOptions = [
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
    '15:00', '15:30', '16:00', '16:30', '17:00'
  ];

  const planSections = [
    {
      title: 'Internet Fibra Hogar',
      category: 'home' as const,
      options: [
        { value: 'Internet Fibra Hogar 400 Mbps - $13.990', label: 'Internet Fibra Hogar 400 Mbps', price: '13.990' },
        { value: 'Internet Fibra Hogar 600 Mbps - $15.990', label: 'Internet Fibra Hogar 600 Mbps', price: '15.990' },
        { value: 'Internet Fibra Hogar 800 Mbps - $18.990', label: 'Internet Fibra Hogar 800 Mbps', price: '18.990' },
      ],
    },
    {
      title: 'Planes PyME',
      category: 'pyme' as const,
      options: [
        { value: 'Plan de Internet FO EMPRESA 700 Mbps - Valor 3.4UF+IVA', label: 'Plan de Internet FO EMPRESA 700 Mbps', price: '3.4UF+IVA' },
        { value: 'Plan de Internet FO EMPRESA 940 Mbps - Valor 3.9UF+IVA', label: 'Plan de Internet FO EMPRESA 940 Mbps', price: '3.9UF+IVA' },
        { value: 'Plan Internet FO PyME 600 Mbps - $24.990', label: 'Plan Internet FO PyME 600 Mbps', price: '24.990' },
        { value: 'Plan Internet FO PyME 800 Mbps - $26.990', label: 'Plan Internet FO PyME 800 Mbps', price: '26.990' },
      ],
    },
  ];

  const filteredPlanSections = planSections.filter((section) => section.category === planCategory);

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

  const filteredTimeToOptions =
    timeFromValue && Number.isFinite(timeToMinutes(timeFromValue))
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
    let sum = 0;
    let mul = 2;
    for (const n of numbers) {
      sum += parseInt(n, 10) * mul;
      mul = mul === 7 ? 2 : mul + 1;
    }
    const res = 11 - (sum % 11);
    const computedDv = res === 11 ? '0' : res === 10 ? 'K' : String(res);
    return computedDv === dv.toUpperCase();
  };

  const toggleDate = (dateStr: string) => {
    if (selectedDates.includes(dateStr)) {
      setSelectedDates(selectedDates.filter(d => d !== dateStr));
    } else {
      setSelectedDates([...selectedDates, dateStr]);
    }
  };

  const formatDateDisplay = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return {
      dayName: days[date.getDay()],
      dayNumber: date.getDate(),
      month: months[date.getMonth()]
    };
  };

  const onSubmit = async (data: FormData) => {
      // Trigger validation for all fields before proceeding
      const allValid = await trigger();
      if (!allValid) {
        const msgs: string[] = [];
        try {
          for (const [k, v] of Object.entries(errors)) {
            if (v && (v as any).message) msgs.push(`${k}: ${(v as any).message}`);
          }
        } catch (e) {}
        const summary = msgs.length > 0 ? msgs.join(' — ') : 'Faltan o hay campos inválidos en el formulario';
        toast.error(summary);
        setSubmissionStatus('error');
        setIsSubmitting(false);
        // scroll to first invalid field
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
        toast.error(msg);
        setSubmitErrorMsg(msg);
        setSubmissionStatus('error');
        setIsSubmitting(false);
        setTimeout(() => scrollToField('installationDates'), 150);
        setTimeout(() => setSubmissionStatus('idle'), 2000);
        return;
      }

      if (!data.plan) {
        const msg = 'Debes seleccionar un plan de internet';
        toast.error(msg);
        setSubmitErrorMsg(msg);
        setSubmissionStatus('error');
        setIsSubmitting(false);
        setTimeout(() => scrollToField('plan'), 150);
        setTimeout(() => setSubmissionStatus('idle'), 2000);
        return;
      }

      const timeValid = validateTimeRange(data.timeFrom, data.timeTo);
      if (timeValid !== true) {
        const msg = String(timeValid);
        toast.error(msg);
        setSubmitErrorMsg(msg);
        setSubmissionStatus('error');
        setIsSubmitting(false);
        setTimeout(() => scrollToField('timeFrom'), 150);
        setTimeout(() => setSubmissionStatus('idle'), 2000);
        return;
      }

      // Las imágenes no son obligatorias (idFront/idBack/comprobante/cupón opcionales)

      const formData = new window.FormData();
      formData.append('firstName', data.firstName);
      formData.append('lastName', data.lastName);
      formData.append('ci', data.ci);
      formData.append('email', data.email);
      formData.append('plan', data.plan);
      formData.append('address', data.address);
      formData.append('coordinates', data.coordinates);
      formData.append('neighborhood', data.neighborhood);
      formData.append('city', data.city);
      formData.append('postalCode', data.postalCode);
      const phoneDigits = String(data.phone || '').replace(/\D/g, '').slice(0,9);
      const additionalDigits = String(data.additionalPhone || '').replace(/\D/g, '').slice(0,9);
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

      const response = await fetch('/api/installations', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errBody: any = null;
        try { errBody = await response.json(); } catch (e) {}
        let errText = `${response.status} ${response.statusText}`;
        if (errBody && typeof errBody === 'object') {
           try {
             const parts: string[] = [];
             for (const [k, v] of Object.entries(errBody)) {
                parts.push(`${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
             }
             if (parts.length > 0) errText = parts.join(' — ');
           } catch(e) { errText = JSON.stringify(errBody); }
        }
        setSubmitErrorMsg(errText);
        setSubmissionStatus('error');
        setIsSubmitting(false);
        const missingField = (errBody && typeof errBody === 'object' && (errBody.field || errBody.name)) ? (errBody.field || errBody.name) : undefined;
        setTimeout(() => scrollToField(missingField), 150);
        setTimeout(() => setSubmissionStatus('idle'), 2000);
        return;
      }

      setSubmissionStatus('success');
      setIsSubmitting(false);
      // show tick briefly then redirect
      setTimeout(() => {
        try { window.location.href = 'https://geonet.cl'; } catch (e) { window.open('https://geonet.cl', '_self'); }
      }, 1200);

    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Por favor, intenta nuevamente.';
      setSubmitErrorMsg(msg);
      setSubmissionStatus('error');
      setTimeout(() => scrollToField(undefined), 150);
      setTimeout(() => setSubmissionStatus('idle'), 2000);
      toast.error('Error al enviar la solicitud', { description: msg });
      setIsSubmitting(false);
    }
  };

  const { ref: addressHookRef, ...addressRest } = register('address', { required: 'Este campo es requerido' });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50/50 via-white to-orange-50/50">
{(isSubmitting || submissionStatus !== 'idle') && (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
    <div className="flex flex-col items-center gap-6 rounded-2xl bg-white px-10 py-8 shadow-2xl animate-fadeIn">

      {/* CÍRCULO CENTRAL */}
      <div
        className={`
          relative flex h-20 w-20 items-center justify-center rounded-full
          transition-all duration-500
          ${submissionStatus === 'loading' ? 'bg-primary/10' : ''}
          ${submissionStatus === 'success' ? 'bg-emerald-500' : ''}
          ${submissionStatus === 'error' ? 'bg-red-500' : ''}
        `}
      >
        {/* SPINNER */}
        {submissionStatus === 'loading' && (
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
        )}

        {/* CHECK */}
        {submissionStatus === 'success' && (
          <svg
            viewBox="0 0 24 24"
            className="h-10 w-10 text-white animate-check"
            fill="none"
          >
            <path
              d="M5 13l4 4L19 7"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}

        {/* ERROR */}
        {submissionStatus === 'error' && (
          <svg
            viewBox="0 0 24 24"
            className="h-10 w-10 text-white animate-shake"
            fill="none"
          >
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>

      {/* TEXTO */}
      <div className="text-center">
        <p className="text-base font-semibold text-gray-800">
          {submissionStatus === 'loading' && 'Enviando solicitud'}
          {submissionStatus === 'success' && 'Solicitud enviada'}
          {submissionStatus === 'error' && 'Error al enviar'}
        </p>

        <p className="mt-1 text-sm text-gray-500">
          {submissionStatus === 'loading' && 'Por favor espera…'}
          {submissionStatus === 'success' && 'Redirigiendo…'}
          {submissionStatus === 'error' && 'Corrige los campos faltantes'}
        </p>
      </div>

    </div>
  </div>
)}

      <header className="bg-white border-b border-gray-200 shadow-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ fontFamily: "'Quicksand', sans-serif", letterSpacing: '-0.02em' }}>
              <img
                src="https://geonet.cl/wp-content/uploads/2024/12/Logo_186x86.svg"
                alt="Geonet"
                className="h-8 sm:h-10 object-contain"
              />
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

          {/* Información Personal */}
          <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm overflow-hidden">
            <div className="bg-gradient-to-r from-primary to-primary/90 p-6">
              <div className="flex items-center gap-3 text-white">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">Información Personal</h3>
                  <p className="text-sm text-white/80">Tus datos básicos de identificación</p>
                </div>
              </div>
            </div>
            
            <CardContent className="p-6 sm:p-8 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-2.5">
                  <Label htmlFor="firstName" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div> Nombre(s) <span className="text-accent">*</span>
                  </Label>
                  <Input id="firstName" placeholder="Ej. Juan Carlos" {...register('firstName', { required: 'Este campo es requerido' })} className="h-12 border-2 border-gray-200 focus:border-accent rounded-xl" />
                  {errors.firstName && <p className="text-sm text-destructive">{errors.firstName.message}</p>}
                </div>
                <div className="space-y-2.5">
                  <Label htmlFor="lastName" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div> Apellidos <span className="text-accent">*</span>
                  </Label>
                  <Input id="lastName" placeholder="Ej. García Rodríguez" {...register('lastName', { required: 'Este campo es requerido' })} className="h-12 border-2 border-gray-200 focus:border-accent rounded-xl" />
                  {errors.lastName && <p className="text-sm text-destructive">{errors.lastName.message}</p>}
                </div>
                <div className="space-y-2.5">
                  <Label htmlFor="ci" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div> Cédula de Identidad <span className="text-accent">*</span>
                  </Label>
                    <Input id="ci" placeholder="Ej. 12.345.678-5"
                      {...register('ci', {
                        required: 'Este campo es requerido',
                        onChange: (e) => {
                          const val = formatRut(e.target.value);
                          e.target.value = val;
                          setValue('ci', val, { shouldValidate: true });
                        },
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
                    <Input id="email" type="email" placeholder="ejemplo@correo.com" {...register('email', { required: 'Este campo es requerido', pattern: { value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i, message: 'Email inválido' } })} className="h-12 pl-10 border-2 border-gray-200 focus:border-accent rounded-xl" />
                  </div>
                  {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
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
                  <p className="text-sm text-white/80">Dónde instalaremos tu servicio</p>
                </div>
              </div>
            </div>

            <CardContent className="p-6 sm:p-8 space-y-6">
              <div className="space-y-2.5">
                <Label htmlFor="address" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-accent rounded-full"></div> Dirección completa <span className="text-accent">*</span>
                </Label>

                <div className="relative">
                  <div className="flex gap-3 items-center">
                    <div className="flex-1">
                      <Input
                        id="address"
                        autoComplete="off"
                        placeholder="Ej. Calle Principal #123, entre Av. Libertad"
                        {...addressRest}
                        ref={(e) => {
                          addressHookRef(e);
                          addressInputRef.current = e;
                        }}
                        className="h-12 border-2 border-gray-200 focus:border-accent rounded-xl"
                      />
                    </div>
                    <div className="shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void handleUseGeolocation()}
                        disabled={isLocating}
                        className="h-12 w-12 p-0 flex items-center justify-center rounded-xl border-2 border-gray-200 bg-white/60 hover:bg-white"
                        aria-label="Usar mi ubicación"
                      >
                         {isLocating ? (
                            <Loader2 className="w-5 h-5 text-accent animate-spin" />
                         ) : (
                            <MapPin className="w-5 h-5 text-gray-700" />
                         )}
                      </Button>
                    </div>
                  </div>
                    <div className="mt-3">
                                  <div className="relative">
                                    <div ref={(el) => { mapContainerRef.current = el; }} className="h-56 sm:h-72 md:h-96 rounded-xl border-2 border-gray-200 overflow-hidden" />
                                    {/* Overlay button to enable map interaction on mobile */}
                                    {isMobile && !mapInteractionEnabled && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          try {
                                            if (mapInstanceRef.current) mapInstanceRef.current.setOptions({ gestureHandling: 'greedy' });
                                          } catch (e) {}
                                          setMapInteractionEnabled(true);
                                        }}
                                        className="absolute right-3 top-3 bg-white/90 text-gray-700 px-3 py-2 rounded-lg shadow-sm text-sm flex items-center gap-2"
                                      >
                                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                        Interactuar
                                      </button>
                                    )}
                                    {isMobile && mapInteractionEnabled && (
                                      <div className="absolute right-3 top-3 bg-white/90 text-gray-700 px-3 py-2 rounded-lg shadow-sm text-sm">Interactuando</div>
                                    )}
                                  </div>
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
                <p className="text-xs text-gray-500">Se completa automáticamente al seleccionar una dirección.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="space-y-2.5">
                  <Label htmlFor="neighborhood" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div> Barrio/Zona
                  </Label>
                  <Input id="neighborhood" placeholder="Ej. Villa 1ro de Mayo" {...register('neighborhood')} className="h-12 border-2 border-gray-200 focus:border-accent rounded-xl" />
                  {errors.neighborhood && <p className="text-sm text-destructive">{errors.neighborhood.message}</p>}
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
                  {errors.postalCode && <p className="text-sm text-destructive">{errors.postalCode.message}</p>}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Plan de Internet */}
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
                <div className="flex items-center justify-center">
                  <div className="relative inline-flex items-center rounded-full bg-white/90 border border-gray-200 shadow-lg p-1.5">
                    <button type="button" onClick={() => setPlanCategory('home')} className={`relative z-10 px-5 sm:px-6 py-2 text-sm sm:text-base font-bold rounded-full transition-all ${planCategory === 'home' ? 'text-white' : 'text-gray-700'}`}>Hogar</button>
                    <button type="button" onClick={() => setPlanCategory('pyme')} className={`relative z-10 px-5 sm:px-6 py-2 text-sm sm:text-base font-bold rounded-full transition-all ${planCategory === 'pyme' ? 'text-white' : 'text-gray-700'}`}>PyME</button>
                    <span className={`absolute top-1.5 bottom-1.5 left-1.5 w-[calc(50%-0.375rem)] rounded-full bg-gradient-to-r from-accent to-accent/90 shadow-xl transition-transform duration-300 ${planCategory === 'home' ? 'translate-x-0' : 'translate-x-full'}`} />
                  </div>
                </div>
                {filteredPlanSections.map((section) => (
                  <div key={section.title} className="space-y-3">
                    <div className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-accent rounded-full"></div> {section.title}
                    </div>
                    <div className={section.options.length === 2 ? 'grid grid-cols-1 md:grid-cols-2 gap-5' : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5'}>
                      {section.options.map((option) => (
                        <label key={option.value} className={`cursor-pointer rounded-2xl border-2 p-5 min-h-[120px] transition-all ${planValue === option.value ? 'border-accent bg-accent/5 shadow-lg scale-[1.01]' : 'border-gray-200 bg-white/70 hover:border-accent/50 hover:shadow-md'}`}>
                          <input type="radio" value={option.value} className="sr-only" {...register('plan', { required: 'Este campo es requerido' })} />
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1">
                              <p className="text-base font-bold text-gray-800">{option.label}</p>
                              <div className="text-[11px] text-gray-500">Instalación sujeta a factibilidad</div>
                            </div>
                            <div className="text-right">
                              <p className="text-xl font-extrabold text-primary">$ {option.price}</p>
                              <p className="text-xs text-gray-500">/Mes</p>
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                {errors.plan && <p className="text-sm text-destructive">{errors.plan.message}</p>}
              </div>
            </CardContent>
          </Card>

          {/* Contacto */}
          <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm overflow-hidden">
            <div className="bg-gradient-to-r from-primary to-primary/90 p-6">
              <div className="flex items-center gap-3 text-white">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center">
                  <Phone className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">Información de Contacto</h3>
                  <p className="text-sm text-white/80">Para coordinar la instalación</p>
                </div>
              </div>
            </div>
            <CardContent className="p-6 sm:p-8 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-2.5">
                  <Label htmlFor="phone" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div> Teléfono Celular <span className="text-accent">*</span>
                  </Label>
                  <div className="relative">
                    <div className="absolute left-3 top-3 flex items-center gap-2 pointer-events-none w-[72px]">
                      <span className="flex-none w-5 h-3 overflow-hidden rounded-sm">
                        <ReactCountryFlag svg countryCode="CL" aria-label="Chile" style={{ width: '18px', height: '12px', display: 'block' }} />
                      </span>
                      <span className="flex-none text-sm text-gray-600 whitespace-nowrap">+56</span>
                    </div>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="9XXXXXXXX"
                      aria-invalid={!!errors.phone}
                      {...register('phone', {
                        required: 'Este campo es requerido',
                        onChange: (e: any) => {
                          let v = String(e.target.value || '');
                          v = v.replace(/\D/g, '');
                          if (v.length > 9) v = v.slice(0, 9);
                          // Forzar el primer dígito a 9 para cumplir formato chileno móvil
                          if (v.length > 0 && v[0] !== '9') {
                            v = '9' + (v.slice(1) || '');
                            if (!phoneAutoCorrectedRef.current) {
                              toast.info('Se ha ajustado el primer dígito a 9 (formato celular chileno)');
                              phoneAutoCorrectedRef.current = true;
                            }
                          }
                          e.target.value = v;
                          setValue('phone', v, { shouldValidate: true });
                        },
                        validate: (v: string) => {
                          const cleaned = String(v || '').replace(/\D/g, '');
                          if (cleaned.length !== 9) return 'El número debe tener 9 dígitos';
                          if (!/^9/.test(cleaned)) return 'El número debe comenzar con 9';
                          return true;
                        },
                        onBlur: (e: any) => {
                          const v = String(e.target.value || '').replace(/\D/g, '');
                          if (!v) return;
                          if (v.length !== 9 || !/^9/.test(v)) {
                            toast.error('Teléfono inválido: debe tener 9 dígitos y comenzar con 9');
                          }
                        },
                      })}
                      className={errors.phone ? 'h-12 pl-[72px] border-2 border-red-500 rounded-xl' : 'h-12 pl-[72px] border-2 border-gray-200 focus:border-accent rounded-xl'}
                    />
                    {errors.phone?.message && <p className="text-sm text-red-600 mt-2">{String(errors.phone.message)}</p>}
                  </div>
                </div>
                <div className="space-y-2.5">
                  <Label htmlFor="additionalPhone" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-gray-300 rounded-full"></div> Teléfono Adicional
                  </Label>
                  <div className="relative">
                    <div className="absolute left-3 top-3 flex items-center gap-2 pointer-events-none w-[72px]">
                      <span className="flex-none w-5 h-3 overflow-hidden rounded-sm">
                        <ReactCountryFlag svg countryCode="CL" aria-label="Chile" style={{ width: '18px', height: '12px', display: 'block' }} />
                      </span>
                      <span className="flex-none text-sm text-gray-600 whitespace-nowrap">+56</span>
                    </div>
                    <Input
                      id="additionalPhone"
                      type="tel"
                      placeholder="9XXXXXXXX"
                      aria-invalid={!!errors.additionalPhone}
                      {...register('additionalPhone', {
                        onChange: (e: any) => {
                          let v = String(e.target.value || '');
                          v = v.replace(/\D/g, '');
                          if (v.length > 9) v = v.slice(0, 9);
                          if (v.length > 0 && v[0] !== '9') {
                            v = '9' + (v.slice(1) || '');
                            if (!addPhoneAutoCorrectedRef.current) {
                              toast.info('Se ha ajustado el primer dígito a 9 (formato celular chileno)');
                              addPhoneAutoCorrectedRef.current = true;
                            }
                          }
                          e.target.value = v;
                          setValue('additionalPhone', v, { shouldValidate: true });
                        },
                        validate: (v: string) => {
                          if (!v) return true;
                          const cleaned = String(v || '').replace(/\D/g, '');
                          if (cleaned.length !== 9) return 'El número adicional debe tener 9 dígitos';
                          if (!/^9/.test(cleaned)) return 'El número debe comenzar con 9';
                          return true;
                        },
                        onBlur: (e: any) => {
                          const v = String(e.target.value || '').replace(/\D/g, '');
                          if (!v) return;
                          if (v.length !== 9 || !/^9/.test(v)) {
                            toast.error('Teléfono adicional inválido: debe tener 9 dígitos y comenzar con 9');
                          }
                        },
                      })}
                      className={errors.additionalPhone ? 'h-12 pl-[72px] border-2 border-red-500 rounded-xl' : 'h-12 pl-[72px] border-2 border-gray-200 focus:border-accent rounded-xl'}
                    />
                    {errors.additionalPhone?.message && <p className="text-sm text-red-600 mt-2">{String(errors.additionalPhone.message)}</p>}
                  </div>
                </div>
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
                      <div className="w-1.5 h-1.5 bg-accent rounded-full"></div> Identificación (Frente)
                    </Label>
                  <div className="relative group">
                    <input id="idFront" type="file" accept="image/jpeg,image/png" capture="environment" {...idFrontRegister} ref={(el) => { idFrontRegister.ref(el); idFrontFileInputRef.current = el; }} className="hidden" />
                    <label htmlFor="idFront" onClick={() => { if (idFrontFileInputRef.current) idFrontFileInputRef.current.value = ''; }} className="flex items-center justify-center gap-3 h-14 bg-gradient-to-r from-accent to-accent/90 hover:from-accent/90 hover:to-accent text-white rounded-xl cursor-pointer shadow-md font-semibold">
                      <Upload className="w-5 h-5" /> {idFrontName ? 'Cambiar archivo' : 'Seleccionar archivo'}
                    </label>
                    <p className="text-xs text-gray-500 mt-2">Requerimientos: JPG/JPEG/PNG · Mínimo {MIN_IMAGE_WIDTH}×{MIN_IMAGE_HEIGHT} px</p>
                    {idFrontError && <p className="text-sm text-destructive mt-2">{idFrontError}</p>}
                  </div>
                  {errors.idFront && <p className="text-sm text-destructive">{errors.idFront.message}</p>}
                </div>
                {/* ID Back */}
                <div className="space-y-3">
                  <Label htmlFor="idBack" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div> Identificación (Reverso)
                  </Label>
                  <div className="relative group">
                    <input id="idBack" type="file" accept="image/jpeg,image/png" capture="environment" disabled={!hasIdFront} {...idBackRegister} ref={(el) => { idBackRegister.ref(el); idBackFileInputRef.current = el; }} className="hidden" />
                    <label htmlFor="idBack" onClick={(e) => { if (!hasIdFront) { e.preventDefault(); toast.error('Primero sube el frente'); return; } if (idBackFileInputRef.current) idBackFileInputRef.current.value = ''; }} className={hasIdFront ? 'flex items-center justify-center gap-3 h-14 bg-gradient-to-r from-accent to-accent/90 hover:from-accent/90 hover:to-accent text-white rounded-xl cursor-pointer shadow-md font-semibold' : 'flex items-center justify-center gap-3 h-14 bg-gray-200 text-gray-500 rounded-xl cursor-not-allowed font-semibold'}>
                      <Upload className="w-5 h-5" /> {idBackName ? 'Cambiar archivo' : 'Seleccionar archivo'}
                    </label>
                    <p className="text-xs text-gray-500 mt-2">Requerimientos: JPG/JPEG/PNG · Mínimo {MIN_IMAGE_WIDTH}×{MIN_IMAGE_HEIGHT} px</p>
                    {idBackError && <p className="text-sm text-destructive mt-2">{idBackError}</p>}
                  </div>
                  {errors.idBack && <p className="text-sm text-destructive">{errors.idBack.message}</p>}
                </div>
                {/* Address Proof */}
                <div className="space-y-3">
                  <Label htmlFor="addressProof" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div> Comprobante de Domicilio
                  </Label>
                  <div className="relative group">
                    <input id="addressProof" type="file" accept="image/jpeg,image/png" capture="environment" {...register('addressProof', { onChange: async (e) => { const files = e.target.files; if (files?.length) { const f = files[0]; if (!isAllowedImage(f)) { toast.error('Solo se permiten imágenes JPG o PNG'); if (e?.target) e.target.value = ''; setAddressProofName(''); try { setValue('addressProof', new DataTransfer().files); } catch (err) {} return; } const res = await checkImageResolution(f); if (!res.ok) { toast.error(`Resolución insuficiente: mínimo ${MIN_IMAGE_WIDTH}x${MIN_IMAGE_HEIGHT}px — imagen ${res.width}x${res.height}px`); if (e?.target) e.target.value = ''; setAddressProofName(''); try { setValue('addressProof', new DataTransfer().files); } catch (err) {} return; } setAddressProofName(f.name); } } })} className="hidden" />
                    <label htmlFor="addressProof" className="flex items-center justify-center gap-3 h-14 bg-gradient-to-r from-accent to-accent/90 hover:from-accent/90 hover:to-accent text-white rounded-xl cursor-pointer shadow-md font-semibold">
                      <Upload className="w-5 h-5" /> {addressProofName ? 'Cambiar archivo' : 'Seleccionar archivo'}
                    </label>
                    <p className="text-xs text-gray-500 mt-2">Requerimientos: JPG/JPEG/PNG · Mínimo {MIN_IMAGE_WIDTH}×{MIN_IMAGE_HEIGHT} px</p>
                    {addressProofError && <p className="text-sm text-destructive mt-2">{addressProofError}</p>}
                  </div>
                  {errors.addressProof && <p className="text-sm text-destructive">{errors.addressProof.message}</p>}
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
                <Textarea id="comments" rows={5} {...register('comments')} className="border-2 border-gray-200 focus:border-accent rounded-xl" />
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
                  <h3 className="text-2xl font-bold">Fecha y Horario</h3>
                  <p className="text-sm text-white/80">Selecciona días disponibles (Lunes a Viernes)</p>
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
                      <motion.button key={dateInfo.formatted} type="button" onClick={() => toggleDate(dateInfo.formatted)} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className={`relative p-3 rounded-lg border transition-all flex flex-col items-center justify-center gap-0.5 min-h-[70px] ${isSelected ? 'bg-gradient-to-br from-accent via-accent to-accent/80 border-accent/50 text-white shadow-lg' : 'bg-white/60 border-gray-300/50 hover:bg-white text-gray-700'}`}>
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
                    <TimeSelect id="timeTo" tone="accent" disabled={!timeFromValue} value={field.value} onValueChange={(v) => { field.onChange(v); try { clearErrors('timeTo'); } catch (e) {} }} options={filteredTimeToOptions} placeholder={timeFromValue ? 'Seleccionar hora' : 'Selecciona "Desde" primero'} />
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
            {/* Logo y Descripción */}
            <div className="md:col-span-4 text-center md:text-left space-y-4">
              <h2 className="text-3xl sm:text-4xl font-bold" style={{ fontFamily: "'Quicksand', sans-serif", letterSpacing: '-0.02em' }}>
                <img
                  src="https://geonet.cl/wp-content/uploads/2024/12/logo-footer.png"
                  alt="Geonet"
                  className="h-8 sm:h-10 mx-auto md:mx-0 object-contain"
                />
              </h2>
              <p className="text-sm text-white/90 leading-relaxed max-w-xs mx-auto md:mx-0">
                Con 20 años de experiencia brindando internet de alta calidad a empresas, en GEONET estamos emocionados de llevar este mismo nivel de servicio a los hogares.
              </p>
            </div>

            {/* Separador vertical (solo visible en desktop) */}
            <div className="hidden md:block md:col-span-1 h-32 border-l border-white/20 mx-auto"></div>

            {/* Enlaces */}
            <div className="md:col-span-3 text-center md:text-left space-y-3">
              <ul className="space-y-3 text-sm">
                <li>
                  <a href="#" className="text-white hover:text-accent transition-colors font-medium">
                    Planes
                  </a>
                </li>
                <li>
                  <a href="https://clientes.portalinternet.app/saldo/geonet/" className="text-white hover:text-accent transition-colors font-medium">
                    Paga tu cuenta
                  </a>
                </li>
                <li>
                  <a href="#" className="text-white hover:text-accent transition-colors font-medium">
                    Preguntas frecuentes
                  </a>
                </li>
                <li>
                  <a href="https://empresas.geonet.cl" className="text-white hover:text-accent transition-colors font-medium">
                    Internet rural
                  </a>
                </li>
              </ul>
            </div>

            {/* Contacto */}
            <div className="md:col-span-4 text-center md:text-left space-y-3">
              <div className="flex items-center justify-center md:justify-start gap-3 mb-4">
                <h3 className="text-accent font-bold text-lg">Contáctanos</h3>
                <div className="w-3 h-3 bg-accent rounded-full"></div>
              </div>
              <div className="space-y-2 text-sm">
                <p className="text-white font-semibold">+56 9 4071 5729</p>
                <p className="text-white/90">Tres Sur 681, Talca - Chile</p>
                <a href="https://www.google.com/maps/place/Geonet/@-35.4292574,-71.6698095,17z/data=!4m14!1m7!3m6!1s0x9665c6a08f923119:0x67e998824942341b!2sGeonet!8m2!3d-35.4292574!4d-71.6672292!16s%2Fg%2F1tdyxkrb!3m5!1s0x9665c6a08f923119:0x67e998824942341b!8m2!3d-35.4292574!4d-71.6672292!16s%2Fg%2F1tdyxkrb?entry=ttu&g_ep=EgoyMDI0MTIxMS4wIKXMDSoASAFQAw%3D%3D" className="text-white/90 hover:text-accent transition-colors inline-block underline">
                  Ver en el mapa
                </a>
              </div>
            </div>
          </div>

          {/* Copyright */}
          <div className="mt-12 pt-6 text-center text-sm text-white/80">
            <p>Talca - Chile © 2026 Geonet</p>
          </div>
        </div>
      </footer>

      {/* Botón flotante de WhatsApp */}
      <motion.a
        href="https://wa.me/56940715729"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 w-16 h-16 bg-[#25D366] hover:bg-[#20BA5A] rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        <svg 
          viewBox="0 0 24 24" 
          className="w-9 h-9" 
          fill="white"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
        </svg>
      </motion.a>
    </div>
  );
}