
import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { TOOLS } from '../constants';
import { ShieldCheck, Zap, Globe, Search, ArrowRight, Sparkles, LayoutGrid, FileSearch, Check, Lock } from 'lucide-react';
import { ToolCategory } from '../types';

export const Home: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ToolCategory | 'All'>('All');

  const categories = ['All', ...Object.values(ToolCategory)];

  const filteredTools = useMemo(() => {
    return TOOLS.filter(tool => {
      const matchesSearch = tool.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           tool.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = activeCategory === 'All' || tool.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, activeCategory]);

  return (
    <div className="min-h-screen pb-40 relative">
      {/* Dynamic Background Blobs */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden opacity-40">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-emerald-200/40 rounded-full blur-[120px] animate-blob"></div>
        <div className="absolute bottom-[0%] right-[-10%] w-[50%] h-[50%] bg-indigo-200/40 rounded-full blur-[100px] animate-blob animation-delay-2000"></div>
        <div className="absolute top-[30%] right-[15%] w-[35%] h-[35%] bg-rose-100/40 rounded-full blur-[80px] animate-blob animation-delay-4000"></div>
      </div>

      {/* Hero Section */}
      <section className="pt-32 pb-24 px-6">
        <div className="max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center gap-3 px-6 py-2.5 rounded-full bg-white/80 border border-slate-200 shadow-2xl shadow-slate-200/30 backdrop-blur-2xl mb-12 animate-fade-in ring-1 ring-slate-900/5">
            <ShieldCheck size={16} className="text-emerald-500" />
            <span className="text-[10px] font-black text-slate-700 uppercase tracking-[0.3em]">
              100% Client-Side processing <span className="text-emerald-600 ml-1">Secure</span>
            </span>
          </div>

          <h1 className="font-display text-7xl md:text-9xl font-black text-slate-900 tracking-tighter leading-[0.85] mb-10 animate-slide-up">
            Private <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600">Document Suite.</span>
          </h1>

          <p className="text-xl md:text-2xl text-slate-500 max-w-3xl mx-auto leading-relaxed mb-16 animate-slide-up animation-delay-200 font-medium">
            Merge, convert, and index documents directly in your browser. No server uploads, no API keys, and zero external dependencies for your data.
          </p>

          {/* Search & Categories Bar */}
          <div className="max-w-4xl mx-auto space-y-10 animate-slide-up animation-delay-400">
            <div className="relative group">
              <div className="absolute inset-y-0 left-8 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-600 transition-colors">
                <Search size={28} />
              </div>
              <input
                type="text"
                className="w-full pl-20 pr-10 py-8 rounded-[2.5rem] border-none ring-1 ring-slate-200 bg-white/80 backdrop-blur-3xl shadow-3xl shadow-slate-200/50 focus:ring-4 focus:ring-emerald-100 text-2xl transition-all font-bold placeholder:text-slate-300"
                placeholder="Find a tool..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              {categories.map((cat) => (activeCategory === cat ? (
                <button
                  key={cat}
                  className="px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-slate-900 text-white shadow-2xl shadow-slate-900/30 flex items-center gap-2"
                >
                  <Check size={14} /> {cat}
                </button>
              ) : (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat as any)}
                  className="px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-white/60 text-slate-500 hover:bg-white hover:text-emerald-600 transition-all border border-slate-100 shadow-sm"
                >
                  {cat}
                </button>
              )))}
            </div>
          </div>
        </div>
      </section>

      {/* Grid Section */}
      <section className="max-w-7xl mx-auto px-8">
        {filteredTools.length === 0 ? (
          <div className="text-center py-40 bg-white/50 backdrop-blur-3xl rounded-[4rem] border-2 border-dashed border-slate-200 shadow-inner">
            <div className="w-24 h-24 bg-slate-100 rounded-[2rem] flex items-center justify-center mx-auto mb-8 text-slate-300">
              <FileSearch size={48} />
            </div>
            <h3 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Nothing found.</h3>
            <p className="text-slate-500 text-lg mb-10 max-w-sm mx-auto font-medium leading-relaxed">No local tools match your search criteria.</p>
            <button 
              onClick={() => {setSearchQuery(''); setActiveCategory('All');}} 
              className="text-emerald-600 font-black text-sm uppercase tracking-widest hover:underline decoration-2 underline-offset-8"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {filteredTools.map((tool, index) => (
              <Link 
                key={tool.id} 
                to={tool.path}
                className="group relative bg-white/70 backdrop-blur-3xl p-10 rounded-[3rem] border border-white shadow-xl shadow-slate-200/20 hover:shadow-3xl hover:shadow-emerald-900/10 hover:-translate-y-3 transition-all duration-500 flex flex-col h-full overflow-hidden ring-1 ring-slate-900/5"
              >
                {/* Visual Flair */}
                <div className={`absolute -right-6 -top-6 w-32 h-32 rounded-full opacity-0 blur-3xl transition-opacity group-hover:opacity-10 ${tool.color}`}></div>

                <div className={`
                  w-20 h-20 rounded-[1.75rem] mb-10 flex items-center justify-center 
                  transition-all duration-700 group-hover:scale-110 group-hover:rotate-6
                  shadow-2xl text-white ${tool.color} ring-[12px] ring-white
                `}>
                  <tool.icon size={36} strokeWidth={1.5} />
                </div>
                
                <div className="flex-grow">
                  <div className="flex items-center gap-3 mb-4">
                    <h3 className="font-display text-2xl font-black text-slate-900 tracking-tight leading-none group-hover:text-emerald-600 transition-colors">
                      {tool.name}
                    </h3>
                  </div>
                  
                  <p className="text-slate-500 text-sm leading-relaxed mb-10 font-medium">
                    {tool.description}
                  </p>
                </div>

                <div className="flex items-center justify-between mt-auto">
                  <span className="text-[9px] font-black text-slate-300 uppercase tracking-[0.3em] group-hover:text-emerald-500 transition-colors">
                    {tool.category}
                  </span>
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-all shadow-sm">
                    <ArrowRight size={22} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Modern Features Section */}
      <section className="max-w-7xl mx-auto px-8 mt-48">
        <div className="bg-slate-900 rounded-[4rem] p-16 md:p-24 relative overflow-hidden shadow-4xl shadow-slate-900/50">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-600/20 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2"></div>
          
          <div className="relative z-10 grid lg:grid-cols-2 gap-24 items-center">
            <div>
              <h2 className="text-5xl md:text-6xl font-black text-white tracking-tighter mb-10 leading-[1.05]">
                Truly Offline. <br/><span className="text-emerald-400">Browser Native.</span>
              </h2>
              <div className="grid sm:grid-cols-2 gap-10">
                {[
                  { title: 'Local Privacy', desc: 'No documents ever leave your machine. Processing happens 100% in RAM.' },
                  { title: 'Zero API Fees', desc: 'Unlimited usage. No subscriptions, no API keys, no hidden costs.' },
                  { title: 'Native Performance', desc: 'Uses WebAssembly and optimized JS for desktop-grade speed.' },
                  { title: 'No Account', desc: 'Start working instantly. No signup or personal data collection.' }
                ].map((item, i) => (
                  <div key={i} className="group">
                    <div className="w-10 h-1 bg-emerald-500 mb-6 group-hover:w-full transition-all duration-500"></div>
                    <h4 className="font-black text-white text-xl mb-3 tracking-tight">{item.title}</h4>
                    <p className="text-slate-400 text-sm font-medium leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="relative">
              <div className="aspect-video rounded-[3rem] bg-gradient-to-br from-emerald-500 to-teal-600 p-[2px] shadow-3xl">
                <div className="w-full h-full bg-slate-900 rounded-[2.9rem] flex flex-col items-center justify-center p-12 text-center">
                  <div className="w-24 h-24 bg-emerald-500/10 rounded-[2rem] flex items-center justify-center text-emerald-400 mb-8 border border-emerald-500/20">
                    <Lock size={48} className="fill-emerald-400" />
                  </div>
                  <h3 className="text-3xl font-black text-white mb-6 tracking-tight">Privacy First.</h3>
                  <p className="text-slate-400 text-lg leading-relaxed mb-10 font-medium">
                    Try the "Local PDF Index" to search and summarize documents without sending a single byte to the cloud.
                  </p>
                  <Link to="/chat-pdf" className="px-12 py-5 bg-white text-slate-900 font-black rounded-2xl hover:bg-emerald-50 transition-all hover:scale-105 shadow-2xl text-lg">
                    Open Local Assistant
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
