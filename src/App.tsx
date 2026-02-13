import { useState, useRef, useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Textarea } from './components/ui/textarea';
import { Card, CardContent } from './components/ui/card';
import { MapPin, Upload, User, Phone, FileText, Image as Mail, Calendar, Wifi } from 'lucide-react';
import { toast } from 'sonner';
import { motion} from 'motion/react';
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
const loadGoogleMapsPlaces = (apiKey: string) => {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.maps?.places?.Autocomplete) return Promise.resolve();
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
    )}&libraries=places&language=es&region=CL&callback=__onGoogleMapsLoaded`;
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
  const { register, handleSubmit, formState: { errors }, reset, setValue, watch, control } = useForm<FormData>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitErrorMsg, setSubmitErrorMsg] = useState<string | null>(null);

  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const [idFrontName, setIdFrontName] = useState<string>('');
  const [idBackName, setIdBackName] = useState<string>('');
  const [addressProofName, setAddressProofName] = useState<string>('');
  const [couponName, setCouponName] = useState<string>('');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [planCategory, setPlanCategory] = useState<'home' | 'pyme'>('home');

  // --- Cámara con guía (DESACTIVADA por ahora, requiere HTTPS en móvil) ---
  // const [cameraOpen, setCameraOpen] = useState<null | 'front' | 'back'>(null);
  // const [cameraStarting, setCameraStarting] = useState(false);
  // const [cameraError, setCameraError] = useState<string | null>(null);
  // const videoRef = useRef<HTMLVideoElement | null>(null);
  // const streamRef = useRef<MediaStream | null>(null);
  const idFrontFileInputRef = useRef<HTMLInputElement | null>(null);
  const idBackFileInputRef = useRef<HTMLInputElement | null>(null);

  const idFrontFiles = watch('idFront');
  const timeFromValue = watch('timeFrom');
  const timeToValue = watch('timeTo');
  const planValue = watch('plan');
  const hasIdFront = Boolean(idFrontName) || ((idFrontFiles?.length ?? 0) > 0);
  const submitMsgRef = useRef<HTMLDivElement | null>(null);

  /*
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const closeCamera = () => {
    stopCamera();
    setCameraError(null);
    setCameraStarting(false);
    setCameraOpen(null);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const getCameraErrorMessage = (e: unknown) => {
    const err = e as any;
    const name = String(err?.name || '');
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return 'Permiso denegado. Habilita la cámara en tu navegador y reintenta.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'No se encontró una cámara disponible en el dispositivo.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return 'La cámara está en uso por otra app.';
    }
    if (name === 'OverconstrainedError') {
      return 'No se pudo usar la cámara trasera. Intenta nuevamente.';
    }
    if (name === 'SecurityError') {
      return 'La cámara requiere un contexto seguro (HTTPS) o localhost.';
    }
    return 'No se pudo acceder a la cámara.';
  };

  const openCamera = async (side: 'front' | 'back') => {
    if (side === 'back' && !hasIdFront) {
      toast.error('Primero debes subir/tomar la foto del frente');
      return;
    }

    stopCamera();
    setCameraError(null);
    setCameraStarting(true);
    setCameraOpen(side);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;

      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {
          // Some mobile browsers may block autoplay even when muted; user can still see preview once it starts.
        }
      }
    } catch (e) {
      console.error(e);
      const msg = getCameraErrorMessage(e);
      setCameraError(msg);
      toast.error(msg);
    } finally {
      setCameraStarting(false);
    }
  };
  */

  const fileToFileList = (file: File) => {
    const dt = new DataTransfer();
    dt.items.add(file);
    return dt.files;
  };

  /*
  const captureFromCamera = async () => {
    if (!cameraOpen || !videoRef.current) return;

    if (cameraOpen === 'back' && !hasIdFront) {
      toast.error('Primero debes subir/tomar la foto del frente');
      closeCamera();
      return;
    }

    const video = videoRef.current;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    // Recorte basado en el rectángulo guía (mismas proporciones y centrado)
    const GUIDE_WIDTH_RATIO = 0.85;
    const ID_CARD_ASPECT = 1.586; // ancho / alto (aprox. tarjeta)

    let cropW = Math.round(width * GUIDE_WIDTH_RATIO);
    let cropH = Math.round(cropW / ID_CARD_ASPECT);

    // Si por altura no cabe, ajustar por altura y recalcular ancho
    const maxH = Math.round(height * 0.85);
    if (cropH > maxH) {
      cropH = maxH;
      cropW = Math.round(cropH * ID_CARD_ASPECT);
    }

    // Centrado
    const sx = Math.max(0, Math.round((width - cropW) / 2));
    const sy = Math.max(0, Math.round((height - cropH) / 2));

    const canvas = document.createElement('canvas');
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, cropW, cropH);

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) return;

    const file = new File([blob], `${cameraOpen === 'front' ? 'id-front' : 'id-back'}.jpg`, { type: 'image/jpeg' });
    const files = fileToFileList(file);

    if (cameraOpen === 'front') {
      setIdFrontName(file.name);
      setValue('idFront', files as any, { shouldValidate: true });
    } else {
      setIdBackName(file.name);
      setValue('idBack', files as any, { shouldValidate: true });
    }

    closeCamera();
  };
  */

  const idFrontRegister = register('idFront', {
    required: 'Este campo es requerido',
    onChange: (e) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        setIdFrontName(files[0].name);
      }
    },
  });

  const idBackRegister = register('idBack', {
    required: 'Este campo es requerido',
    onChange: (e) => {
      if (!hasIdFront) {
        toast.error('Primero debes subir la identificación (frente)');
        if (e?.target) e.target.value = '';
        setIdBackName('');
        return;
      }
      const files = e.target.files;
      if (files && files.length > 0) {
        setIdBackName(files[0].name);
      }
    },
  });

  // Referencia para el input de dirección y la instancia de Autocomplete
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteInstance = useRef<any>(null);

  const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

  // Inicializar Google Maps Autocomplete (Places) vía js-api-loader
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

        const Autocomplete = window.google?.maps?.places?.Autocomplete;
        if (!Autocomplete) throw new Error('Google Maps Places no disponible (Autocomplete)');

        if (addressInputRef.current) {
          autocompleteInstance.current = new Autocomplete(addressInputRef.current, {
            componentRestrictions: { country: 'cl' },
            fields: ['address_components', 'geometry', 'formatted_address'],
            types: ['geocode'],
          });

          autocompleteInstance.current.addListener('place_changed', () => {
            const place = autocompleteInstance.current.getPlace();
            fillAddressForm(place);
          });
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

  // Función para procesar la respuesta de Google (simplificada)
  const fillAddressForm = (place: any) => {
    if (!place.geometry || !place.geometry.location) {
      toast.error('No se encontraron detalles para esta dirección');
      return;
    }

    const loc = place.geometry.location;
    const latNum = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
    const lngNum = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
    
    // Rellenar coordenadas
    setValue('coordinates', `${latNum.toFixed(6)}, ${lngNum.toFixed(6)}`, { shouldValidate: true });

    // Rellenar dirección formateada en el input
    // Nota: El widget lo hace visualmente, pero actualizamos el estado de react-hook-form
    if (place.formatted_address) {
       setValue('address', place.formatted_address.split(',')[0]); // Tomamos la primera parte usualmente
    }

    // Parsear componentes
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

    toast.success('Dirección seleccionada', { description: 'Campos completados automáticamente.' });
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
        {
          value: 'Internet Fibra Hogar 400 Mbps - $13.990',
          label: 'Internet Fibra Hogar 400 Mbps',
          price: '13.990',
        },
        {
          value: 'Internet Fibra Hogar 600 Mbps - $15.990',
          label: 'Internet Fibra Hogar 600 Mbps',
          price: '15.990',
        },
        {
          value: 'Internet Fibra Hogar 800 Mbps - $18.990',
          label: 'Internet Fibra Hogar 800 Mbps',
          price: '18.990',
        },
      ],
    },
    {
      title: 'Planes PyME',
      category: 'pyme' as const,
      options: [
        {
          value: 'Plan de Internet FO EMPRESA 700 Mbps - Valor 3.4UF+IVA',
          label: 'Plan de Internet FO EMPRESA 700 Mbps',
          price: '3.4UF+IVA',
        },
        {
          value: 'Plan de Internet FO EMPRESA 940 Mbps - Valor 3.9UF+IVA',
          label: 'Plan de Internet FO EMPRESA 940 Mbps',
          price: '3.9UF+IVA',
        },
        {
          value: 'Plan Internet FO PyME 600 Mbps - $24.990',
          label: 'Plan Internet FO PyME 600 Mbps',
          price: '24.990',
        },
        {
          value: 'Plan Internet FO PyME 800 Mbps - $26.990',
          label: 'Plan Internet FO PyME 800 Mbps',
          price: '26.990',
        },
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


  // Helpers para RUT (formato y validación)
  const cleanRut = (rut: string) => rut.replace(/[^0-9kK]/g, '').toUpperCase();

  const formatRut = (rut: string) => {
    const cleaned = cleanRut(rut);
    if (!cleaned) return '';
    const dv = cleaned.length > 1 ? cleaned.slice(-1) : '';
    let body = cleaned.length > 1 ? cleaned.slice(0, -1) : cleaned;
    // Evitar eliminar ceros significativos en entradas parciales
    body = body.replace(/^0+/, '') || body;
    // Agregar puntos de miles
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
    setIsSubmitting(true);
    setSubmitErrorMsg(null);
    
    try {
      // Validar que se hayan seleccionado fechas
      if (selectedDates.length === 0) {
        toast.error('Debes seleccionar al menos una fecha de instalación');
        setIsSubmitting(false);
        return;
      }

      if (!data.plan) {
        toast.error('Debes seleccionar un plan de internet');
        setIsSubmitting(false);
        return;
      }

      const timeValid = validateTimeRange(data.timeFrom, data.timeTo);
      if (timeValid !== true) {
        toast.error(String(timeValid));
        setIsSubmitting(false);
        return;
      }

      if (!data.idFront || data.idFront.length === 0) {
        toast.error('Debes subir la identificación (frente)');
        setIsSubmitting(false);
        return;
      }

      if (data.idBack && data.idBack.length > 0 && !data.idFront?.length) {
        toast.error('No puedes subir el reverso sin el frente');
        setIsSubmitting(false);
        return;
      }

      // Crear FormData para enviar
      const formData = new window.FormData();
      
      // Agregar campos de texto
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
      formData.append('phone', data.phone);
      formData.append('additionalPhone', data.additionalPhone || '');
      formData.append('comments', data.comments || '');
      formData.append('installationDates', selectedDates.join(','));
      formData.append('timeFrom', data.timeFrom);
      formData.append('timeTo', data.timeTo);

      // Agregar archivos (fotos)
      if (data.idFront && data.idFront.length > 0) {
        formData.append('idFront', data.idFront[0]);
      }
      if (data.idBack && data.idBack.length > 0) {
        formData.append('idBack', data.idBack[0]);
      }
      if (data.addressProof && data.addressProof.length > 0) {
        formData.append('addressProof', data.addressProof[0]);
      }
      if (data.coupon && data.coupon.length > 0) {
        formData.append('coupon', data.coupon[0]);
      }

      // Enviar petición al servidor
      const response = await fetch('/api/installations', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        // Intentar leer JSON con detalles de validación (p. ej. { email: ['...'] })
        let errBody: any = null;
        try {
          errBody = await response.json();
        } catch (e) {
          // no-op
        }

        let errText = `${response.status} ${response.statusText}`;
        if (errBody && typeof errBody === 'object') {
          // Formatear objetos tipo { field: [messages] } a líneas legibles
          try {
            const parts: string[] = [];
            for (const [k, v] of Object.entries(errBody)) {
              if (Array.isArray(v)) {
                parts.push(`${k}: ${v.join(', ')}`);
              } else if (typeof v === 'string') {
                parts.push(`${k}: ${v}`);
              } else {
                parts.push(`${k}: ${JSON.stringify(v)}`);
              }
            }
            if (parts.length > 0) errText = parts.join(' — ');
          } catch (e) {
            errText = JSON.stringify(errBody);
          }
        }
        setSubmitErrorMsg(errText);
        setTimeout(() => { try { submitMsgRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }, 100);
        setIsSubmitting(false);
        return;
      }

      const result = await response.json();
      console.log('Respuesta del servidor:', result);

      toast.success('¡Solicitud enviada exitosamente!', { 
        description: 'Nos pondremos en contacto contigo pronto.' 
      });
      
      setSubmitted(true);
      setIsSubmitting(false);
      
      // Resetear formulario después de 3 segundos
      setTimeout(() => {
        reset();
        setSubmitted(false);
        setIdFrontName('');
        setIdBackName('');
        setAddressProofName('');
        setCouponName('');
        setSelectedDates([]);
        if (addressInputRef.current) addressInputRef.current.value = '';
      }, 3000);

    } catch (error) {
      console.error('Error al enviar el formulario:', error);
      const msg = error instanceof Error ? error.message : 'Por favor, intenta nuevamente.';
      setSubmitErrorMsg(msg);
      setTimeout(() => { try { submitMsgRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }, 100);
      toast.error('Error al enviar la solicitud', { 
        description: msg
      });
      setIsSubmitting(false);
    }
  };

  // Validaciones automáticas por documentos eliminadas (modo pruebas).

  // Hook para combinar refs (React Hook Form + useRef de Google Maps)
  const { ref: addressHookRef, ...addressRest } = register('address', { required: 'Este campo es requerido' });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50/50 via-white to-orange-50/50">
      {isSubmitting && (
        <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-white/40 overflow-hidden">
            <div className="bg-gradient-to-r from-primary to-primary/90 px-6 py-5 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white/90 border-t-transparent rounded-full animate-spin" />
                </div>
                <div>
                  <div className="font-bold text-lg leading-tight">Enviando solicitud…</div>
                  <div className="text-xs text-white/80">Subiendo datos y fotografías</div>
                </div>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                <div className="h-2 w-1/3 bg-accent animate-pulse rounded-full" />
              </div>
              <p className="text-sm text-gray-600">
                No cierres esta pantalla. Esto puede tardar unos segundos.
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
            <div className="hidden sm:flex items-center gap-2 text-gray-700 text-sm">
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-5xl font-bold text-primary mb-4">
            Solicitar Instalación
          </h2>
          <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto">
            Completa el siguiente formulario y un asesor te contactará para coordinar la instalación de tu servicio de internet de alta velocidad
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

          {/*
            Cámara con guía (DESACTIVADA por ahora): requiere HTTPS en móviles.
            Reactivar cuando tengas HTTPS.

            {cameraOpen && (
              <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
                <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden shadow-2xl">
                  <div className="flex items-center justify-between px-4 py-3 border-b">
                    <div className="font-bold text-gray-800">
                      {cameraOpen === 'front' ? 'Tomar foto (Frente)' : 'Tomar foto (Reverso)'}
                    </div>
                    <button
                      type="button"
                      onClick={() => closeCamera()}
                      className="text-gray-600 hover:text-gray-900 text-xl leading-none"
                      aria-label="Cerrar"
                    >
                      ×
                    </button>
                  </div>

                  <div className="relative bg-black">
                    <video
                      ref={videoRef}
                      className="w-full h-[65vh] max-h-[520px] object-cover"
                      playsInline
                      muted
                    />

                    {(cameraStarting || cameraError) && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white p-6">
                        <div className="text-center space-y-3">
                          {cameraStarting && (
                            <div className="flex items-center justify-center gap-3">
                              <div className="w-5 h-5 border-2 border-white/90 border-t-transparent rounded-full animate-spin" />
                              <span className="text-sm font-semibold">Activando cámara…</span>
                            </div>
                          )}
                          {cameraError && (
                            <div className="space-y-3">
                              <p className="text-sm">{cameraError}</p>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => void openCamera(cameraOpen)}
                                className="bg-white/10 border-white/30 text-white hover:bg-white/20"
                              >
                                Reintentar
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="w-[85%] aspect-[1.586/1] border-2 border-white/90 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                    </div>
                    <div className="pointer-events-none absolute bottom-4 left-0 right-0 text-center text-white text-xs px-6">
                      Alinea la cédula dentro del rectángulo, con buena luz.
                    </div>
                  </div>

                  <div className="p-4 flex gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => closeCamera()}
                      className="flex-1"
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void captureFromCamera()}
                      disabled={cameraStarting || Boolean(cameraError)}
                      className="flex-1 bg-gradient-to-r from-accent to-accent/90 hover:from-accent/90 hover:to-accent text-white"
                    >
                      Capturar
                    </Button>
                  </div>
                </div>
              </div>
            )}
          */}
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
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div>
                    Nombre(s) <span className="text-accent">*</span>
                  </Label>
                  <Input
                    id="firstName"
                    placeholder="Ej. Juan Carlos"
                    {...register('firstName', { required: 'Este campo es requerido' })}
                    className="h-12 border-2 border-gray-200 focus:border-accent focus:ring-accent/20 rounded-xl transition-all"
                  />
                  {errors.firstName && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <span className="w-1 h-1 bg-destructive rounded-full"></span>
                      {errors.firstName.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="lastName" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div>
                    Apellidos <span className="text-accent">*</span>
                  </Label>
                  <Input
                    id="lastName"
                    placeholder="Ej. García Rodríguez"
                    {...register('lastName', { required: 'Este campo es requerido' })}
                    className="h-12 border-2 border-gray-200 focus:border-accent focus:ring-accent/20 rounded-xl transition-all"
                  />
                  {errors.lastName && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <span className="w-1 h-1 bg-destructive rounded-full"></span>
                      {errors.lastName.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="ci" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div>
                    Cédula de Identidad <span className="text-accent">*</span>
                  </Label>
                    <Input
                      id="ci"
                      placeholder="Ej. 12.345.678-5"
                      {...register('ci', {
                        required: 'Este campo es requerido',
                        onChange: (e: any) => {
                          const input = e.target as HTMLInputElement;
                          const formatted = formatRut(input.value);
                          // Actualizar el valor del input y react-hook-form
                          input.value = formatted;
                          setValue('ci', formatted, { shouldValidate: true });
                        },
                        validate: (value: string) => validateRut(value) || 'RUT inválido',
                      })}
                      className="h-12 border-2 border-gray-200 focus:border-accent focus:ring-accent/20 rounded-xl transition-all"
                    />
                  {errors.ci && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <span className="w-1 h-1 bg-destructive rounded-full"></span>
                      {errors.ci.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="email" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div>
                    Correo electrónico <span className="text-accent">*</span>
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="ejemplo@correo.com"
                      {...register('email', { 
                        required: 'Este campo es requerido',
                        pattern: {
                          value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                          message: 'Email inválido'
                        }
                      })}
                      className="h-12 pl-10 border-2 border-gray-200 focus:border-accent focus:ring-accent/20 rounded-xl transition-all"
                    />
                  </div>
                  {errors.email && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <span className="w-1 h-1 bg-destructive rounded-full"></span>
                      {errors.email.message}
                    </p>
                  )}
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
                  <div className="w-1.5 h-1.5 bg-accent rounded-full"></div>
                  Dirección completa <span className="text-accent">*</span>
                </Label>

                <div className="relative">
                  <div className="flex gap-3">
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
                        className="h-12 border-2 border-gray-200 focus:border-accent focus:ring-accent/20 rounded-xl transition-all"
                      />
                    </div>
                  </div>
                  {/* El Dropdown ahora lo maneja Google Maps (clase .pac-container) */}
                </div>

                {errors.address && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <span className="w-1 h-1 bg-destructive rounded-full"></span>
                    {errors.address.message}
                  </p>
                )}
              </div>

              <div className="space-y-2.5">
                <Label htmlFor="coordinates" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-accent rounded-full"></div>
                  Coordenadas GPS <span className="text-accent">*</span>
                </Label>
                <Input
                  id="coordinates"
                  placeholder="-17.783299, -63.182140"
                  {...register('coordinates', {
                    required: 'Este campo es requerido',
                    pattern: {
                      value: /^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/,
                      message: 'Formato inválido (usar: lat,lng)'
                    }
                  })}
                  className="h-12 border-2 border-gray-200 focus:border-accent focus:ring-accent/20 rounded-xl transition-all"
                />
                {errors.coordinates && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <span className="w-1 h-1 bg-destructive rounded-full"></span>
                    {errors.coordinates.message}
                  </p>
                )}
                <p className="text-xs text-gray-500 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  Se completa automáticamente al seleccionar una dirección.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="space-y-2.5">
                  <Label htmlFor="neighborhood" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div>
                    Barrio/Zona <span className="text-accent">*</span>
                  </Label>
                  <Input
                    id="neighborhood"
                    placeholder="Ej. Villa 1ro de Mayo"
                    {...register('neighborhood', { required: 'Este campo es requerido' })}
                    className="h-12 border-2 border-gray-200 focus:border-accent focus:ring-accent/20 rounded-xl transition-all"
                  />
                  {errors.neighborhood && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <span className="w-1 h-1 bg-destructive rounded-full"></span>
                      {errors.neighborhood.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="city" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div>
                    Ciudad <span className="text-accent">*</span>
                  </Label>
                  <Input
                    id="city"
                    placeholder="Ej. Santa Cruz"
                    {...register('city', { required: 'Este campo es requerido' })}
                    className="h-12 border-2 border-gray-200 focus:border-accent focus:ring-accent/20 rounded-xl transition-all"
                  />
                  {errors.city && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <span className="w-1 h-1 bg-destructive rounded-full"></span>
                      {errors.city.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="postalCode" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div>
                    Código Postal <span className="text-accent">*</span>
                  </Label>
                  <Input
                    id="postalCode"
                    placeholder="Ej. 0000"
                    {...register('postalCode', { required: 'Este campo es requerido' })}
                    className="h-12 border-2 border-gray-200 focus:border-accent focus:ring-accent/20 rounded-xl transition-all"
                  />
                  {errors.postalCode && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <span className="w-1 h-1 bg-destructive rounded-full"></span>
                      {errors.postalCode.message}
                    </p>
                  )}
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
                    <button
                      type="button"
                      onClick={() => setPlanCategory('home')}
                      className={`relative z-10 px-5 sm:px-6 py-2 text-sm sm:text-base font-bold rounded-full transition-all ${
                        planCategory === 'home'
                          ? 'text-white'
                          : 'text-gray-700 hover:text-gray-900'
                      }`}
                    >
                      Hogar
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlanCategory('pyme')}
                      className={`relative z-10 px-5 sm:px-6 py-2 text-sm sm:text-base font-bold rounded-full transition-all ${
                        planCategory === 'pyme'
                          ? 'text-white'
                          : 'text-gray-700 hover:text-gray-900'
                      }`}
                    >
                      PyME
                    </button>
                    <span
                      className={`absolute top-1.5 bottom-1.5 left-1.5 w-[calc(50%-0.375rem)] rounded-full bg-gradient-to-r from-accent to-accent/90 shadow-xl transition-transform duration-300 ${
                        planCategory === 'home' ? 'translate-x-0' : 'translate-x-full'
                      }`}
                    />
                  </div>
                </div>
                {filteredPlanSections.map((section) => (
                  <div key={section.title} className="space-y-3">
                    <div className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-accent rounded-full"></div>
                      {section.title}
                    </div>
                    <div
                      className={
                        section.options.length === 2
                          ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-5 xl:max-w-4xl xl:mx-auto'
                          : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5'
                      }
                    >
                      {section.options.map((option) => {
                        const isSelected = planValue === option.value;
                        return (
                          <label
                            key={option.value}
                            className={`cursor-pointer rounded-2xl border-2 p-5 min-h-[120px] transition-all duration-200 transform-gpu ${
                              isSelected
                                ? 'border-accent bg-accent/5 shadow-lg scale-[1.01]'
                                : 'border-gray-200 bg-white/70 hover:border-accent/50 hover:shadow-md hover:-translate-y-0.5 hover:scale-[1.01]'
                            }`}
                          >
                            <input
                              type="radio"
                              value={option.value}
                              className="sr-only"
                              {...register('plan', { required: 'Este campo es requerido' })}
                            />
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-1">
                                <p className="text-base font-bold text-gray-800">{option.label}</p>
                                <p className="text-xs text-gray-500">Servicio de internet fibra óptica</p>
                                <div className="text-[11px] text-gray-500">Instalación sujeta a factibilidad</div>
                              </div>
                              <div className="text-right">
                                <p className="text-xl font-extrabold text-primary">$ {option.price}</p>
                                <p className="text-xs text-gray-500">/Mes</p>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {errors.plan && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <span className="w-1 h-1 bg-destructive rounded-full"></span>
                    {errors.plan.message}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Contacto, Documentos, Comentarios, Fechas y Footer (Se mantienen igual) */}
          {/* ... El resto de tus componentes siguen aquí (Contacto, Documentos, etc) ... */}
          {/* Para acortar la respuesta, asumo que mantienes el resto del formulario igual */}
          <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm overflow-hidden">
             {/* ... Pega aquí el resto de tus Cards (Contacto, Documentos, etc) ... */}
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
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div>
                    Teléfono Celular <span className="text-accent">*</span>
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="Ej. 70123456"
                      {...register('phone', { required: 'Este campo es requerido' })}
                      className="h-12 pl-10 border-2 border-gray-200 focus:border-accent focus:ring-accent/20 rounded-xl transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-2.5">
                  <Label htmlFor="additionalPhone" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-gray-300 rounded-full"></div>
                    Teléfono Adicional
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      id="additionalPhone"
                      type="tel"
                      placeholder="Ej. 3456789"
                      {...register('additionalPhone')}
                      className="h-12 pl-10 border-2 border-gray-200 focus:border-accent focus:ring-accent/20 rounded-xl transition-all"
                    />
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
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div>
                    Identificación (Frente) <span className="text-accent">*</span>
                  </Label>
                  <div className="relative group">
                    <input
                      id="idFront"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      {...idFrontRegister}
                      ref={(el) => {
                        idFrontRegister.ref(el);
                        idFrontFileInputRef.current = el;
                      }}
                      className="hidden"
                    />
                    <label
                      htmlFor="idFront"
                      onClick={() => {
                        if (idFrontFileInputRef.current) {
                          idFrontFileInputRef.current.value = '';
                        }
                      }}
                      className="flex items-center justify-center gap-3 h-14 bg-gradient-to-r from-accent to-accent/90 hover:from-accent/90 hover:to-accent text-white rounded-xl cursor-pointer transition-all duration-200 shadow-md hover:shadow-lg font-semibold"
                    >
                      <Upload className="w-5 h-5" />
                      {idFrontName ? 'Cambiar archivo' : 'Seleccionar archivo'}
                    </label>
                  </div>
                  {/* Cámara con guía desactivada por ahora (sin HTTPS) */}
                  {errors.idFront && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <span className="w-1 h-1 bg-destructive rounded-full"></span>
                      {errors.idFront.message}
                    </p>
                  )}
                </div>

                {/* ID Back */}
                <div className="space-y-3">
                  <Label htmlFor="idBack" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div>
                    Identificación (Reverso) <span className="text-accent">*</span>
                  </Label>
                  <div className="relative group">
                    <input
                      id="idBack"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      disabled={!hasIdFront}
                      {...idBackRegister}
                      ref={(el) => {
                        idBackRegister.ref(el);
                        idBackFileInputRef.current = el;
                      }}
                      className="hidden"
                    />
                    <label
                      htmlFor="idBack"
                      onClick={(e) => {
                        if (!hasIdFront) {
                          e.preventDefault();
                          toast.error('Primero debes subir la identificación (frente)');
                          return;
                        }
                        if (idBackFileInputRef.current) {
                          idBackFileInputRef.current.value = '';
                        }
                      }}
                      className={
                        hasIdFront
                          ? 'flex items-center justify-center gap-3 h-14 bg-gradient-to-r from-accent to-accent/90 hover:from-accent/90 hover:to-accent text-white rounded-xl cursor-pointer transition-all duration-200 shadow-md hover:shadow-lg font-semibold'
                          : 'flex items-center justify-center gap-3 h-14 bg-gray-200 text-gray-500 rounded-xl cursor-not-allowed transition-all duration-200 font-semibold'
                      }
                    >
                      <Upload className="w-5 h-5" />
                      {idBackName ? 'Cambiar archivo' : 'Seleccionar archivo'}
                    </label>
                  </div>
                  {!hasIdFront && (
                    <p className="text-xs text-gray-500">Primero sube el frente para habilitar el reverso.</p>
                  )}
                  {/* Cámara con guía desactivada por ahora (sin HTTPS) */}
                  {errors.idBack && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <span className="w-1 h-1 bg-destructive rounded-full"></span>
                      {errors.idBack.message}
                    </p>
                  )}
                </div>

                {/* Address Proof */}
                <div className="space-y-3">
                  <Label htmlFor="addressProof" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div>
                    Comprobante de Domicilio <span className="text-accent">*</span>
                  </Label>
                  <div className="relative group">
                    <input
                      id="addressProof"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      {...register('addressProof', { 
                        required: 'Este campo es requerido',
                        onChange: (e) => {
                          const files = e.target.files;
                          if (files && files.length > 0) {
                            setAddressProofName(files[0].name);
                          }
                        }
                      })}
                      className="hidden"
                    />
                    <label
                      htmlFor="addressProof"
                      className="flex items-center justify-center gap-3 h-14 bg-gradient-to-r from-accent to-accent/90 hover:from-accent/90 hover:to-accent text-white rounded-xl cursor-pointer transition-all duration-200 shadow-md hover:shadow-lg font-semibold"
                    >
                      <Upload className="w-5 h-5" />
                      {addressProofName ? 'Cambiar archivo' : 'Seleccionar archivo'}
                    </label>
                  </div>
                  {errors.addressProof && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <span className="w-1 h-1 bg-destructive rounded-full"></span>
                      {errors.addressProof.message}
                    </p>
                  )}
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
                  <div className="w-1.5 h-1.5 bg-gray-300 rounded-full"></div>
                  Comentarios o solicitudes especiales
                </Label>
                <Textarea
                  id="comments"
                  placeholder="Ej. Prefiero que me llamen después de las 2 PM..."
                  rows={5}
                  {...register('comments')}
                  className="border-2 border-gray-200 focus:border-accent focus:ring-accent/20 resize-none rounded-xl transition-all"
                />
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
                  <h3 className="text-2xl font-bold">Fecha y Horario de Instalación</h3>
                  <p className="text-sm text-white/80">Selecciona los días disponibles (Lunes a Viernes)</p>
                </div>
              </div>
            </div>
            
            <CardContent className="p-6 sm:p-8 space-y-6">
              <div className="space-y-4">
                <Label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-accent rounded-full"></div>
                  Días Disponibles <span className="text-accent">*</span>
                </Label>
                
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-2">
                  {validDates.map((dateInfo) => {
                    const displayDate = formatDateDisplay(dateInfo.formatted);
                    const isSelected = selectedDates.includes(dateInfo.formatted);
                    
                    return (
                      <motion.button
                        key={dateInfo.formatted}
                        type="button"
                        onClick={() => toggleDate(dateInfo.formatted)}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`relative p-3 rounded-lg border transition-all duration-200 flex flex-col items-center justify-center gap-0.5 min-h-[70px] ${
                          isSelected
                            ? 'bg-gradient-to-br from-accent via-accent to-accent/80 border-accent/50 text-white shadow-lg shadow-accent/25'
                            : 'bg-white/60 backdrop-blur-sm border-gray-300/50 hover:border-accent/50 hover:shadow-md hover:bg-white text-gray-700'
                        }`}
                      >
                        <motion.span className={`text-[10px] uppercase font-bold tracking-wider ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>{displayDate.dayName}</motion.span>
                        <motion.span className="text-xl font-extrabold leading-none">{displayDate.dayNumber}</motion.span>
                        <motion.span className={`text-[9px] uppercase font-semibold ${isSelected ? 'text-white/70' : 'text-gray-400'}`}>{displayDate.month}</motion.span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2.5">
                  <Label htmlFor="timeFrom" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>
                    Desde <span className="text-primary">*</span>
                  </Label>
                  <Controller
                    name="timeFrom"
                    control={control}
                    rules={{
                      required: 'Este campo es requerido',
                      validate: (v) => validateTimeRange(v, timeToValue || ''),
                    }}
                    render={({ field }) => (
                      <TimeSelect
                        id="timeFrom"
                        tone="primary"
                        value={field.value}
                        onValueChange={field.onChange}
                        options={timeOptions}
                        placeholder="Seleccionar hora"
                      />
                    )}
                  />
                  {errors.timeFrom && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <span className="w-1 h-1 bg-destructive rounded-full"></span>
                      {errors.timeFrom.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2.5">
                  <Label htmlFor="timeTo" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div>
                    Hasta <span className="text-accent">*</span>
                  </Label>
                  <Controller
                    name="timeTo"
                    control={control}
                    rules={{
                      required: 'Este campo es requerido',
                      validate: (v) => validateTimeRange(timeFromValue || '', v),
                    }}
                    render={({ field }) => (
                      <TimeSelect
                        id="timeTo"
                        tone="accent"
                        disabled={!timeFromValue}
                        value={field.value}
                        onValueChange={field.onChange}
                        options={filteredTimeToOptions}
                        placeholder={timeFromValue ? 'Seleccionar hora' : 'Selecciona "Desde" primero'}
                      />
                    )}
                  />
                  {errors.timeTo && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <span className="w-1 h-1 bg-destructive rounded-full"></span>
                      {errors.timeTo.message}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="pt-4">
            <Button 
              type="submit" 
              className="w-full bg-gradient-to-r from-accent to-accent/90 hover:from-accent/90 hover:to-accent text-white py-7 text-lg shadow-2xl hover:shadow-accent/50 transition-all duration-300 font-bold rounded-2xl"
              disabled={isSubmitting || submitted}
            >
              {isSubmitting ? 'Enviando solicitud...' : submitted ? '¡Enviado!' : 'Enviar Solicitud'}
            </Button>
          </div>
          {/* Mensajes de resultado (error / éxito) colocados debajo del botón */}
          {submitErrorMsg && (
            <div ref={submitMsgRef} className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/5 px-5 py-4 text-destructive shadow-sm">
              <div className="font-bold">No se pudo enviar la solicitud</div>
              <div className="text-sm opacity-90">{submitErrorMsg}</div>
            </div>
          )}
          {submitted && !submitErrorMsg && (
            <div ref={submitMsgRef} className="mt-4 rounded-2xl border border-accent/20 bg-accent/10 px-5 py-4 text-primary shadow-sm">
              <div className="font-bold">¡Solicitud enviada!</div>
              <div className="text-sm opacity-90">Nos pondremos en contacto contigo pronto.</div>
            </div>
          )}
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