import { motion, AnimatePresence } from 'framer-motion';
import { Check, Wifi, X } from 'lucide-react';

type ProcessingState = 'loading' | 'success' | 'error';

type ProcessingModalProps = {
  isOpen: boolean;
  status?: ProcessingState;
  title?: string;
  description?: string;
};

export function ProcessingModal({ isOpen, status = 'loading', title, description }: ProcessingModalProps) {
  const isLoading = status === 'loading';
  const isSuccess = status === 'success';
  const isError = status === 'error';

  const accentClass = isSuccess
    ? 'from-emerald-400 to-green-500'
    : isError
      ? 'from-rose-400 to-red-500'
      : 'from-orange-400 to-amber-500';

  const arcColor = isSuccess
    ? 'border-emerald-500'
    : isError
      ? 'border-red-500'
      : 'border-orange-500';

  const arcBaseColor = isSuccess
    ? 'border-emerald-200'
    : isError
      ? 'border-red-200'
      : 'border-orange-200';

  const titleClass = isSuccess ? 'text-emerald-700' : isError ? 'text-red-700' : 'text-blue-800';
  const textClass = isSuccess ? 'text-emerald-600/95' : isError ? 'text-red-600/95' : 'text-blue-600/95';
  const glowClass = isSuccess
    ? 'shadow-[0_0_24px_rgba(16,185,129,0.35)]'
    : isError
      ? 'shadow-[0_0_24px_rgba(239,68,68,0.35)]'
      : 'shadow-[0_0_22px_rgba(249,115,22,0.28)]';

  const defaultTitle = isSuccess ? 'Aprobado' : isError ? 'Error de autorización' : 'Cargando…';
  const defaultDescription = isSuccess
    ? 'Servicio autorizado y ONU registrada correctamente'
    : isError
      ? 'Falló la autorización en SmartOLT o el registro de la ONU'
      : 'Dame un momento mientras autorizo en SmartOLT y registro las ONU';

  const resolvedTitle = title?.trim() || defaultTitle;
  const resolvedDescription = description?.trim() || defaultDescription;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
        >
          <motion.div
            layoutId="modal-container"
            initial={{ scale: 0.96, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 12 }}
            className="bg-white border border-gray-200 p-6 md:p-8 rounded-2xl shadow-2xl shadow-gray-900/10 max-w-sm w-full relative overflow-hidden"
          >
            <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${accentClass}`} />

            <div className="flex flex-col items-center text-center gap-6 relative z-10">
              <div className="relative h-36 w-40 flex items-end justify-center" aria-label="Cargando">
                <div className="absolute left-1/2 -translate-x-1/2 bottom-16">
                  <motion.div
                    className={`rounded-t-full border-t-4 border-x-4 border-b-0 ${arcBaseColor}`}
                    style={{ width: 108, height: 64 }}
                    animate={isLoading ? { opacity: [0.3, 1, 0.3] } : { opacity: 1 }}
                    transition={{ duration: 1.35, repeat: Infinity, ease: 'easeInOut', delay: 0 }}
                  />
                  <motion.div
                    className={`absolute left-1/2 -translate-x-1/2 bottom-0 rounded-t-full border-t-4 border-x-4 border-b-0 ${arcBaseColor}`}
                    style={{ width: 82, height: 50 }}
                    animate={isLoading ? { opacity: [0.25, 1, 0.25] } : { opacity: 1 }}
                    transition={{ duration: 1.35, repeat: Infinity, ease: 'easeInOut', delay: 0.45 }}
                  />
                  <motion.div
                    className={`absolute left-1/2 -translate-x-1/2 bottom-0 rounded-t-full border-t-4 border-x-4 border-b-0 ${arcColor} ${glowClass}`}
                    style={{ width: 56, height: 34 }}
                    animate={isLoading ? { opacity: [0.25, 1, 0.25] } : { opacity: 1 }}
                    transition={{ duration: 1.35, repeat: Infinity, ease: 'easeInOut', delay: 0.9 }}
                  />
                </div>

                <motion.div
                  className="absolute left-1/2 -translate-x-1/2 bottom-16 rounded-full"
                  style={{ width: 14, height: 14, backgroundColor: isSuccess ? '#10b981' : isError ? '#ef4444' : '#f97316' }}
                  animate={isLoading ? { scale: [1, 1.2, 1], opacity: [0.8, 1, 0.8] } : { scale: 1, opacity: 1 }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                />

                <div className="relative h-16 w-24 rounded-2xl bg-gradient-to-b from-slate-100 to-slate-200 border border-slate-300 flex items-center justify-center shadow-sm">
                  <div className="absolute -top-6 left-4 h-6 w-[3px] rounded-full bg-slate-300" />
                  <div className="absolute -top-6 right-4 h-6 w-[3px] rounded-full bg-slate-300" />
                  <Wifi className="absolute top-2 size-4 text-slate-400" />

                  {isError ? (
                    <X className="size-6 text-red-600" />
                  ) : isSuccess ? (
                    <Check className="size-6 text-emerald-600" />
                  ) : (
                    <motion.div
                      className={`h-2.5 w-2.5 rounded-full ${isLoading ? 'bg-orange-500' : isSuccess ? 'bg-emerald-500' : 'bg-red-500'}`}
                      animate={{ scale: [1, 1.2, 1], opacity: [0.9, 1, 0.9] }}
                      transition={{ repeat: Infinity, duration: 1.1, ease: 'easeInOut' }}
                    />
                  )}

                  <div className="absolute bottom-2 left-3 flex items-center gap-1.5">
                    {[0, 1, 2].map((lightIndex) => (
                      <motion.span
                        key={lightIndex}
                        className={`h-1.5 w-1.5 rounded-full ${isError ? 'bg-red-400' : isSuccess ? 'bg-emerald-400' : 'bg-orange-400'}`}
                        animate={isLoading ? { opacity: [0.25, 1, 0.25] } : { opacity: 1 }}
                        transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut', delay: lightIndex * 0.22 }}
                      />
                    ))}
                  </div>
                </div>

                <div className="absolute bottom-3 h-1 w-24 rounded-full bg-slate-200" />
              </div>

              <div>
                <h3 className={`text-xl font-bold tracking-tight ${titleClass}`}>
                  {resolvedTitle}
                </h3>
                <p className={`text-sm mt-1 leading-relaxed max-w-[19rem] ${textClass}`}>
                  {resolvedDescription}
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}