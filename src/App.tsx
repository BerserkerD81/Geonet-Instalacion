import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Textarea } from './components/ui/textarea';
import { Card, CardContent } from './components/ui/card';
import { MapPin, Upload, Check, User, Phone, FileText, Image as Mail, Calendar, Clock } from 'lucide-react';
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

  const [idFrontName, setIdFrontName] = useState<string>('');
  const [idBackName, setIdBackName] = useState<string>('');
  const [addressProofName, setAddressProofName] = useState<string>('');
  const [couponName, setCouponName] = useState<string>('');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);

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
                    placeholder="Ej. 1234567-8"
                    {...register('ci', { required: 'Este campo es requerido' })}
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
                      {...register('idFront', { 
                        required: 'Este campo es requerido',
                        onChange: (e) => {
                          const files = e.target.files;
                          if (files && files.length > 0) {
                            setIdFrontName(files[0].name);
                          }
                        }
                      })}
                      className="hidden"
                    />
                    <label
                      htmlFor="idFront"
                      className="flex items-center justify-center gap-3 h-14 bg-gradient-to-r from-accent to-accent/90 hover:from-accent/90 hover:to-accent text-white rounded-xl cursor-pointer transition-all duration-200 shadow-md hover:shadow-lg font-semibold"
                    >
                      <Upload className="w-5 h-5" />
                      {idFrontName ? 'Cambiar archivo' : 'Seleccionar archivo'}
                    </label>
                  </div>
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
                      {...register('idBack', { 
                        required: 'Este campo es requerido',
                        onChange: (e) => {
                          const files = e.target.files;
                          if (files && files.length > 0) {
                            setIdBackName(files[0].name);
                          }
                        }
                      })}
                      className="hidden"
                    />
                    <label
                      htmlFor="idBack"
                      className="flex items-center justify-center gap-3 h-14 bg-gradient-to-r from-accent to-accent/90 hover:from-accent/90 hover:to-accent text-white rounded-xl cursor-pointer transition-all duration-200 shadow-md hover:shadow-lg font-semibold"
                    >
                      <Upload className="w-5 h-5" />
                      {idBackName ? 'Cambiar archivo' : 'Seleccionar archivo'}
                    </label>
                  </div>
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
                  {validDates.map((dateInfo, index) => {
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
              disabled={isSubmitting || submitted}
            >
              {isSubmitting ? 'Enviando solicitud...' : submitted ? '¡Enviado!' : 'Enviar Solicitud'}
            </Button>
          </div>
        </form>
      </main>

      <footer className="bg-[#1a2b6d] text-white py-12 mt-16 relative">
          {/* Footer content... (igual al original) */}
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p>Talca - Chile © 2024 Geonet</p>
          </div>
      </footer>
    </div>
  );
}