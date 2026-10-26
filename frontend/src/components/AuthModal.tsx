import React from 'react';
import { Sparkles, Terminal, ShieldCheck } from 'lucide-react';

interface Props {
  isLoggingIn: boolean;
  onStartLogin: () => void;
}

export const AuthModal: React.FC<Props> = ({ isLoggingIn, onStartLogin }) => {
  return (
    <div className="h-full flex-1 flex flex-col items-center justify-center p-6 text-center select-none bg-[#06070b] bg-cosmic-grid relative overflow-hidden font-sans">
      <div className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[350px] bg-violet-600/20 rounded-full blur-[130px]"></div>

      <div className="relative z-10 max-w-md w-full glass-panel rounded-3xl p-8 sm:p-10 shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-2xl shadow-violet-600/30 mx-auto mb-6 border border-white/20">
          <Sparkles size={30} />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-[11px] font-medium mb-3">
          <span>Workspace Cloud Personnel</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Antigravity OS
        </h1>
        <p className="text-xs sm:text-sm text-zinc-400 mt-2.5 leading-relaxed">
          Authentifiez votre compte Google pour déverrouiller votre environnement d'agent autonome, vos modèles et votre terminal privé.
        </p>

        <button
          type="button"
          onClick={onStartLogin}
          disabled={isLoggingIn}
          className="mt-8 w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm font-semibold shadow-xl shadow-violet-600/25 flex items-center justify-center gap-2.5 transition-all cursor-pointer disabled:opacity-50 border border-white/15"
        >
          {isLoggingIn ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              <span>Connexion en cours...</span>
            </>
          ) : (
            <>
              <Terminal size={17} />
              <span>Se connecter avec Google Workspace</span>
            </>
          )}
        </button>

        <div className="mt-8 pt-6 border-t border-white/[0.06] flex items-start gap-3 text-left">
          <ShieldCheck size={18} className="text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            <strong>Isolation cryptographique :</strong> Vos clés API, historiques et sessions shell sont cloisonnés dans votre espace personnel sécurisé.
          </p>
        </div>
      </div>
    </div>
  );
};
