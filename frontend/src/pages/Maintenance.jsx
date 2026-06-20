import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function Maintenance() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 flex items-center justify-center">
      <section className="w-full max-w-lg rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <AlertTriangle size={26} />
        </div>
        <div className="text-[11px] font-black uppercase tracking-[0.22em] text-red-500">
          Maintenance Mode
        </div>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-gray-950">
          Platform temporarily unavailable
        </h1>
        <p className="mt-3 text-sm font-medium leading-6 text-gray-500">
          We are making updates right now. Please check back shortly.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-brand-crimson px-4 py-2.5 text-sm font-black text-white shadow-sm transition-all hover:bg-brand-crimson/90"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      </section>
    </main>
  );
}
