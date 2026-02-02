import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Textarea } from './components/ui/textarea';
import { Card, CardContent } from './components/ui/card';
import { MapPin, Upload, User, Phone, FileText, Image as Mail, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { motion} from 'motion/react';

// Tipos para Google Maps
declare global {
  interface Window {
    google: any;
  }
}

interface FormData {
  firstName: string;
  lastName: string;
  ci: string;
  email: string;
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
  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<FormData>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);

  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const [idFrontName, setIdFrontName] = useState<string>('');
  const [idBackName, setIdBackName] = useState<string>('');
  const [addressProofName, setAddressProofName] = useState<string>('');
  const [couponName, setCouponName] = useState<string>('');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [ocrFront, setOcrFront] = useState<{ rut: string | null; docNumber: string | null }>({ rut: null, docNumber: null });
  const [ocrBack, setOcrBack] = useState<{ rut: string | null; docNumber: string | null }>({ rut: null, docNumber: null });
  const [ocrLoading, setOcrLoading] = useState<{ front: boolean; back: boolean }>({ front: false, back: false });
  const [ocrProgress, setOcrProgress] = useState<{ front: number; back: number }>({ front: 0, back: 0 });

  const [cameraOpen, setCameraOpen] = useState<null | 'front' | 'back'>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const idFrontFileInputRef = useRef<HTMLInputElement | null>(null);
  const idBackFileInputRef = useRef<HTMLInputElement | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (e) {
        console.error(e);
        toast.error('No se pudo acceder a la cámara');
        setCameraOpen(null);
      }
    };

    if (cameraOpen) {
      void startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [cameraOpen]);

  const fileToFileList = (file: File) => {
    const dt = new DataTransfer();
    dt.items.add(file);
    return dt.files;
  };

  const captureFromCamera = async () => {
    if (!cameraOpen || !videoRef.current) return;

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
      void handleFileOcr('front', file);
    } else {
      setIdBackName(file.name);
      setValue('idBack', files as any, { shouldValidate: true });
      void handleFileOcr('back', file);
    }

    setCameraOpen(null);
  };

  const idFrontRegister = register('idFront', {
    required: 'Este campo es requerido',
    onChange: (e) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        setIdFrontName(files[0].name);
        void handleFileOcr('front', files[0]);
      }
    },
  });

  const idBackRegister = register('idBack', {
    required: 'Este campo es requerido',
    onChange: (e) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        setIdBackName(files[0].name);
        void handleFileOcr('back', files[0]);
      }
    },
  });

  // Referencia para el input de dirección y la instancia de Autocomplete
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteInstance = useRef<any>(null);

  const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

  // Inicializar Google Maps Autocomplete (Widget Oficial)
  useEffect(() => {
    const initAutocomplete = async () => {
      try {
        const { Autocomplete } = await google.maps.importLibrary("places") as any;
        
        if (addressInputRef.current) {
          // Configuración del Widget
          autocompleteInstance.current = new Autocomplete(addressInputRef.current, {
            componentRestrictions: { country: 'cl' },
            fields: ['address_components', 'geometry', 'formatted_address'], // Pedimos solo lo necesario
            types: ['geocode'], // O 'address' para mayor precisión
          });

          // Escuchar el evento de selección
          autocompleteInstance.current.addListener('place_changed', () => {
            const place = autocompleteInstance.current.getPlace();
            fillAddressForm(place);
          });
        }
      } catch (error) {
        console.error("Error cargando Google Maps Places Library", error);
      }
    };
    initAutocomplete();
  }, []); // Se ejecuta una vez al montar

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

  // Mantener reverseGeocode para el botón de "Mi ubicación actual"
  const reverseGeocode = async (lat: number, lon: number) => {
    try {
      const res = await fetch(
        `${NOMINATIM_BASE_URL}/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lon}`,
        { headers: { 'Accept-Language': 'es' } }
      );
      const data = await res.json();
      const addr = data.address || {};
      const street = [addr.road, addr.house_number].filter(Boolean).join(' ');

      if (street) setValue('address', street);
      if (addr.city || addr.town || addr.village) {
        setValue('city', addr.city || addr.town || addr.village);
      }
      if (addr.neighbourhood || addr.suburb) {
        setValue('neighborhood', addr.neighbourhood || addr.suburb);
      }
      if (addr.postcode) setValue('postalCode', addr.postcode);
    } catch (e) {
      console.error(e);
    }
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

  const getGeolocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocalización no soportada');
      return;
    }

    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        const coords = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;

        setValue('coordinates', coords, { shouldValidate: true });
        await reverseGeocode(lat, lon);

        toast.success('Ubicación obtenida');
        setGettingLocation(false);
      },
      (error) => {
        console.error(error);
        toast.error('Error al obtener ubicación');
        setGettingLocation(false);
      }
    );
  };

  const normalizeForKeywordSearch = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();

  const extractPreferredText = (page: any, kind: 'rut' | 'doc') => {
    const keywords =
      kind === 'rut'
        ? ['RUN', 'RUT', 'R.U.T']
        : ['NUMERO', 'N°', 'NRO', 'DOCUMENTO', 'DOC', 'NUM.'];

    const lines: string[] = [];
    const blocks = page?.blocks || [];
    for (const b of blocks) {
      const paragraphs = b?.paragraphs || [];
      for (const p of paragraphs) {
        const ls = p?.lines || [];
        for (const l of ls) {
          if (l?.text) lines.push(String(l.text));
        }
      }
    }

    const picked = lines.filter((line) => {
      const normalized = normalizeForKeywordSearch(line);
      return keywords.some((k) => normalized.includes(normalizeForKeywordSearch(k)));
    });

    const joinedPicked = picked.join('\n');
    const full = page?.text ? String(page.text) : '';
    return joinedPicked.trim().length > 0 ? joinedPicked : full;
  };

  // Ejecutar OCR sobre una imagen y extraer RUN/RUT + Número de documento
  const handleFileOcr = async (side: 'front' | 'back', file: File | null) => {
    if (!file) return;

    setOcrLoading((prev) => ({ ...prev, [side]: true }));
    setOcrProgress((prev) => ({ ...prev, [side]: 0 }));
    if (side === 'front') setOcrFront({ rut: null, docNumber: null });
    if (side === 'back') setOcrBack({ rut: null, docNumber: null });

    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('spa', undefined, {
        logger: (m: any) => {
          if (typeof m?.progress === 'number') {
            setOcrProgress((prev) => ({ ...prev, [side]: Math.round(m.progress * 100) }));
          }
        },
      });

      await worker.load();
      await worker.reinitialize('spa');
      await worker.setParameters({
        // Aumenta la precisión para RUN/RUT y números de documento
        tessedit_char_whitelist: '0123456789Kk.-',
        preserve_interword_spaces: '1',
      });

      const { data } = await worker.recognize(file);
      await worker.terminate();

      const rutText = extractPreferredText(data, 'rut').toUpperCase();
      const docText = extractPreferredText(data, 'doc').toUpperCase();
      const fallbackText = (data?.text || '').toUpperCase();

      const rutRegex = /\b[0-9]{1,2}\.?[0-9]{3}\.?[0-9]{3}-\s*[0-9Kk]\b|\b[0-9]{7,8}-\s*[0-9Kk]\b|\b[0-9]{7,8}[0-9Kk]\b/g;
      const docRegex = /\b\d{1,3}(?:\.\d{3}){2}\b|\b\d{9}\b/g;

      const normalizeRut = (value: string) => value.replace(/\s+/g, '').replace(/\./g, '').replace(/-?([0-9Kk])$/i, '-$1');
      const normalizeDoc = (value: string) => value.replace(/[^0-9]/g, '');

      const rutCandidates = (
        [...(rutText.match(rutRegex) || []), ...(fallbackText.match(rutRegex) || [])]
      ).map(normalizeRut);
      const docCandidates = (
        [...(docText.match(docRegex) || []), ...(fallbackText.match(docRegex) || [])]
      ).map(normalizeDoc);

      const extractedRut = rutCandidates.find((r) => validateRut(r)) || rutCandidates[0] || null;
      const extractedDoc = docCandidates.find((d) => d.length === 9) || docCandidates[0] || null;

      if (side === 'front') setOcrFront({ rut: extractedRut, docNumber: extractedDoc });
      if (side === 'back') setOcrBack({ rut: extractedRut, docNumber: extractedDoc });

      const currentCi = watch('ci') || '';
      if (extractedRut && cleanRut(currentCi) && cleanRut(extractedRut) !== cleanRut(currentCi)) {
        toast.error(`El RUN/RUT detectado en el ${side === 'front' ? 'frente' : 'reverso'} no coincide con el RUN/RUT ingresado`);
      }

      const other = side === 'front' ? ocrBack : ocrFront;
      if (extractedDoc && other.docNumber) {
        if (normalizeDoc(extractedDoc) !== normalizeDoc(other.docNumber)) {
          toast.error('El Número de documento detectado no coincide entre frente y reverso');
        }
      }
    } catch (err) {
      console.error('OCR error', err);
      toast.error('No se pudo procesar la imagen');
    } finally {
      setOcrLoading((prev) => ({ ...prev, [side]: false }));
      setOcrProgress((prev) => ({ ...prev, [side]: 0 }));
    }
  };


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
    
    try {
      // Validar que se hayan seleccionado fechas
      if (selectedDates.length === 0) {
        toast.error('Debes seleccionar al menos una fecha de instalación');
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
      const response = await fetch('http://localhost:3000/installations', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Error del servidor: ${response.status} ${response.statusText}`);
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
      toast.error('Error al enviar la solicitud', { 
        description: error instanceof Error ? error.message : 'Por favor, intenta nuevamente.' 
      });
      setIsSubmitting(false);
    }
  };

  const ciValue = watch('ci') || '';
  const frontRutMatches = !ocrFront.rut || cleanRut(ciValue) === cleanRut(ocrFront.rut);
  const backRutMatches = !ocrBack.rut || cleanRut(ciValue) === cleanRut(ocrBack.rut);
  const docNumbersMatch = !ocrFront.docNumber || !ocrBack.docNumber || ocrFront.docNumber === ocrBack.docNumber;
  const ocrBlocksSubmit = !frontRutMatches || !backRutMatches || !docNumbersMatch;

  // Hook para combinar refs (React Hook Form + useRef de Google Maps)
  const { ref: addressHookRef, ...addressRest } = register('address', { required: 'Este campo es requerido' });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50/50 via-white to-orange-50/50">
      <header className="bg-white border-b border-gray-200 shadow-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ fontFamily: "'Quicksand', sans-serif", letterSpacing: '-0.02em' }}>
              <span className="text-accent">G</span>
              <span className="text-primary">eonet</span>
            </h1>
            <div className="hidden sm:flex items-center gap-2 text-gray-700 text-sm">
              <Phone className="w-4 h-4" />
              <span className="font-semibold">+56 9 4071 5729</span>
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
          {cameraOpen && (
            <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
              <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between px-4 py-3 border-b">
                  <div className="font-bold text-gray-800">
                    {cameraOpen === 'front' ? 'Tomar foto (Frente)' : 'Tomar foto (Reverso)'}
                  </div>
                  <button
                    type="button"
                    onClick={() => setCameraOpen(null)}
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

                  {/* Guía de encuadre */}
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
                    onClick={() => setCameraOpen(null)}
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void captureFromCamera()}
                    className="flex-1 bg-gradient-to-r from-accent to-accent/90 hover:from-accent/90 hover:to-accent text-white"
                  >
                    Capturar
                  </Button>
                </div>
              </div>
            </div>
          )}
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
                <div className="flex gap-2">
                  <div className="flex-1">
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
                  </div>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={getGeolocation}
                    disabled={gettingLocation}
                    className="h-12 px-4 border-2 border-gray-200 hover:border-accent hover:text-accent rounded-xl"
                    title="Usar mi ubicación actual"
                  >
                    {gettingLocation ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div> : <MapPin className="w-5 h-5" />}
                  </Button>
                </div>
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
                  {isMobile && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCameraOpen('front')}
                      className="w-full h-12 border-2 border-gray-200 hover:border-accent hover:text-accent rounded-xl"
                    >
                      Tomar foto (con guía)
                    </Button>
                  )}
                  {errors.idFront && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <span className="w-1 h-1 bg-destructive rounded-full"></span>
                      {errors.idFront.message}
                    </p>
                  )}
                  {ocrLoading.front && (
                    <div className="flex items-center gap-3">
                      <p className="text-xs text-gray-500">Procesando imagen para OCR...</p>
                      <div className="flex-1 h-2 bg-gray-200 rounded overflow-hidden">
                        <div className="h-2 bg-accent" style={{ width: `${ocrProgress.front}%` }} />
                      </div>
                      <span className="text-xs text-gray-500">{ocrProgress.front}%</span>
                    </div>
                  )}
                  {(ocrFront.rut || ocrFront.docNumber) && (
                    <div className="space-y-1">
                      {ocrFront.rut && (
                        <p className={`text-sm ${frontRutMatches ? 'text-accent' : 'text-destructive'}`}>RUN/RUT detectado: {ocrFront.rut} {frontRutMatches ? '— coincide con el ingresado' : '— no coincide con el ingresado'}</p>
                      )}
                      {ocrFront.docNumber && (
                        <p className={`text-sm ${docNumbersMatch ? 'text-accent' : 'text-destructive'}`}>N° documento detectado: {ocrFront.docNumber}{ocrBack.docNumber ? (docNumbersMatch ? ' — coincide con el reverso' : ' — no coincide con el reverso') : ''}</p>
                      )}
                    </div>
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
                      {...idBackRegister}
                      ref={(el) => {
                        idBackRegister.ref(el);
                        idBackFileInputRef.current = el;
                      }}
                      className="hidden"
                    />
                    <label
                      htmlFor="idBack"
                      onClick={() => {
                        if (idBackFileInputRef.current) {
                          idBackFileInputRef.current.value = '';
                        }
                      }}
                      className="flex items-center justify-center gap-3 h-14 bg-gradient-to-r from-accent to-accent/90 hover:from-accent/90 hover:to-accent text-white rounded-xl cursor-pointer transition-all duration-200 shadow-md hover:shadow-lg font-semibold"
                    >
                      <Upload className="w-5 h-5" />
                      {idBackName ? 'Cambiar archivo' : 'Seleccionar archivo'}
                    </label>
                  </div>
                  {isMobile && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCameraOpen('back')}
                      className="w-full h-12 border-2 border-gray-200 hover:border-accent hover:text-accent rounded-xl"
                    >
                      Tomar foto (con guía)
                    </Button>
                  )}
                  {errors.idBack && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <span className="w-1 h-1 bg-destructive rounded-full"></span>
                      {errors.idBack.message}
                    </p>
                  )}
                  {ocrLoading.back && (
                    <div className="flex items-center gap-3">
                      <p className="text-xs text-gray-500">Procesando imagen para OCR...</p>
                      <div className="flex-1 h-2 bg-gray-200 rounded overflow-hidden">
                        <div className="h-2 bg-accent" style={{ width: `${ocrProgress.back}%` }} />
                      </div>
                      <span className="text-xs text-gray-500">{ocrProgress.back}%</span>
                    </div>
                  )}
                  {(ocrBack.rut || ocrBack.docNumber) && (
                    <div className="space-y-1">
                      {ocrBack.rut && (
                        <p className={`text-sm ${backRutMatches ? 'text-accent' : 'text-destructive'}`}>RUN/RUT detectado: {ocrBack.rut} {backRutMatches ? '— coincide con el ingresado' : '— no coincide con el ingresado'}</p>
                      )}
                      {ocrBack.docNumber && (
                        <p className={`text-sm ${docNumbersMatch ? 'text-accent' : 'text-destructive'}`}>N° documento detectado: {ocrBack.docNumber}{ocrFront.docNumber ? (docNumbersMatch ? ' — coincide con el frente' : ' — no coincide con el frente') : ''}</p>
                      )}
                    </div>
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

                {/* Coupon */}
                <div className="space-y-3">
                  <Label htmlFor="coupon" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-gray-300 rounded-full"></div>
                    Cupón de Descuento
                  </Label>
                  <div className="relative group">
                    <input
                      id="coupon"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      {...register('coupon', {
                        onChange: (e) => {
                          const files = e.target.files;
                          if (files && files.length > 0) {
                            setCouponName(files[0].name);
                          }
                        }
                      })}
                      className="hidden"
                    />
                    <label
                      htmlFor="coupon"
                      className="flex items-center justify-center gap-3 h-14 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-white rounded-xl cursor-pointer transition-all duration-200 shadow-md hover:shadow-lg font-semibold"
                    >
                      <Upload className="w-5 h-5" />
                      {couponName ? 'Cambiar archivo' : 'Seleccionar archivo'}
                    </label>
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
           <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm overflow-hidden">
            <div className="bg-gradient-to-r from-accent to-accent/90 p-6">
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
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div>
                    Desde <span className="text-accent">*</span>
                  </Label>
                  <select
                    id="timeFrom"
                    {...register('timeFrom', { required: 'Este campo es requerido' })}
                    className="h-12 w-full pl-3 pr-3 border-2 border-gray-200 bg-white rounded-xl focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition-all"
                  >
                    <option value="">Seleccionar hora</option>
                    {timeOptions.map(time => <option key={time} value={time}>{time}</option>)}
                  </select>
                </div>
                <div className="space-y-2.5">
                  <Label htmlFor="timeTo" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full"></div>
                    Hasta <span className="text-accent">*</span>
                  </Label>
                  <select
                    id="timeTo"
                    {...register('timeTo', { required: 'Este campo es requerido' })}
                    className="h-12 w-full pl-3 pr-3 border-2 border-gray-200 bg-white rounded-xl focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition-all"
                  >
                    <option value="">Seleccionar hora</option>
                    {timeOptions.map(time => <option key={time} value={time}>{time}</option>)}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="pt-4">
            <Button 
              type="submit" 
              className="w-full bg-gradient-to-r from-accent to-accent/90 hover:from-accent/90 hover:to-accent text-white py-7 text-lg shadow-2xl hover:shadow-accent/50 transition-all duration-300 font-bold rounded-2xl"
              disabled={isSubmitting || submitted || ocrBlocksSubmit}
            >
              {isSubmitting ? 'Enviando solicitud...' : submitted ? '¡Enviado!' : 'Enviar Solicitud'}
            </Button>
            {ocrBlocksSubmit && (
              <p className="mt-2 text-sm text-destructive">No puedes enviar: los datos detectados en las imágenes no coinciden con los datos ingresados.</p>
            )}
          </div>
        </form>
      </main>

      {/* Footer */}
      <footer className="bg-[#1a2b6d] text-white py-12 mt-16 relative">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 items-start">
            {/* Logo y Descripción */}
            <div className="md:col-span-4 text-center md:text-left space-y-4">
              <h2 className="text-3xl sm:text-4xl font-bold" style={{ fontFamily: "'Quicksand', sans-serif", letterSpacing: '-0.02em' }}>
                <span className="text-white">Geonet</span>
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
                  <a href="#" className="text-white hover:text-accent transition-colors font-medium">
                    Paga tu cuenta
                  </a>
                </li>
                <li>
                  <a href="#" className="text-white hover:text-accent transition-colors font-medium">
                    Preguntas frecuentes
                  </a>
                </li>
                <li>
                  <a href="#" className="text-white hover:text-accent transition-colors font-medium">
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
                <a href="#" className="text-white/90 hover:text-accent transition-colors inline-block underline">
                  Ver en el mapa
                </a>
              </div>
            </div>
          </div>

          {/* Copyright */}
          <div className="mt-12 pt-6 text-center text-sm text-white/80">
            <p>Talca - Chile © 2024 Geonet</p>
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