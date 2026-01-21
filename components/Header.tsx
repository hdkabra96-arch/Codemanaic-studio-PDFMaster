import React from 'react';
import { FileText, Menu, X, Sparkles } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export const Header: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="glass sticky top-0 z-50 border-b border-white/50 shadow-sm transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20 items-center">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="bg-gradient-to-br from-brand-500 to-brand-700 text-white p-2.5 rounded-xl shadow-lg shadow-brand-500/30 group-hover:rotate-3 transition-transform duration-300">
              <FileText size={24} strokeWidth={2.5} />
            </div>
            <div className="flex flex-col">
              <span className="font-display text-xl font-bold tracking-tight text-slate-900 leading-none">
                Codemanic studio <span className="text-brand-600">PDFMaster</span>
              </span>
              <span className="text-[10px] font-medium text-slate-400 tracking-wider uppercase">Intelligent Suite</span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center space-x-2 bg-slate-100/50 p-1.5 rounded-full border border-slate-200/50">
            {[
              { path: '/', label: 'All Tools' },
              { path: '/merge', label: 'Merge' },
              { path: '/split', label: 'Split' },
              { path: '/compress', label: 'Compress' },
            ].map((link) => (
              <Link 
                key={link.path}
                to={link.path} 
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                  isActive(link.path) 
                    ? 'bg-white text-brand-600 shadow-sm' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          
          <div className="hidden md:flex items-center">
            <Link 
              to="/chat-pdf" 
              className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl font-medium transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
            >
              <Sparkles size={16} className="text-yellow-300" />
              <span>AI Assistant</span>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button 
            className="md:hidden p-2 text-slate-600 rounded-lg hover:bg-slate-100"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="md:hidden glass border-t border-slate-100 absolute w-full animate-fade-in">
          <div className="p-4 space-y-2">
            <Link to="/" className="block py-3 px-4 rounded-xl hover:bg-slate-50 text-slate-700 font-medium">All Tools</Link>
            <Link to="/merge" className="block py-3 px-4 rounded-xl hover:bg-slate-50 text-slate-700 font-medium">Merge PDF</Link>
            <Link to="/split" className="block py-3 px-4 rounded-xl hover:bg-slate-50 text-slate-700 font-medium">Split PDF</Link>
            <Link to="/chat-pdf" className="block py-3 px-4 rounded-xl bg-slate-900 text-white font-medium mt-4 flex items-center gap-2">
               <Sparkles size={16} /> AI Assistant
            </Link>
          </div>
        </div>
      )}
    </header>
  );
};