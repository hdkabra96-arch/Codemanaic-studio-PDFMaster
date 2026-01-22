
import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { TOOLS } from '../constants';
import { ShieldCheck, Zap, Globe, Search, ArrowRight, Sparkles, LayoutGrid, FileSearch } from 'lucide-react';
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
    <div className="min-h-screen pb-32 relative">
      {/* Immersive Background */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-brand-200/30 rounded-full blur-[120px] animate-blob"></div>
        <div className="absolute bottom-[10%] right-[-5%] w-[40%] h-[40%] bg-indigo-200/30 rounded-full blur-[100px] animate-blob animation-delay-2000"></div>
        <div className="absolute top-[40%] right-[20%] w-[30%] h-[30%] bg-rose-100/30 rounded-full blur-[80px] animate-blob animation-delay-4000"></div>
      </div>

      {/* Hero Content */}
      <section className="pt-28 pb-20 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-white/80 border border-slate-200 shadow-xl shadow-slate-200/20 backdrop-blur-xl mb-10 animate-fade-in">
            <div className="flex -space-x-2">
              {[1,2,3].map(i => <div key={i} className="w-6 h-6 rounded-full border-2 border-white bg-slate-200"></div>)}
            </div>
            <span className="text-xs font-black text-slate-700 uppercase tracking-widest">
              Trusted by <span className="text-indigo-600">50,000+</span> Professionals
            </span>
          </div>

          <h1 className="font-display text-6xl md:text-8xl font-black text-slate-900 tracking-tighter leading-[0.9] mb-8 animate-slide-up">
            PDF Excellence <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 via-indigo-600 to-violet-600">Redefined by AI.</span>
          </h1>

          <p className="text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed mb-12 animate-slide-up animation-delay-200">
            Convert, merge, and chat with documents using the world's most advanced intelligent PDF suite. Fast, secure, and purely browser-based.
          </p>

          {/* Search & Categories */}
          <div className="max-w-3xl mx-auto space-y-8 animate-slide-up animation-delay-400">
            <div className="relative group">
              <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-600 transition-colors">
                <Search size={24} />
              </div>
              <input
                type="text"
                className="w-full pl-16 pr-8 py-6 rounded-[2rem] border-none ring-1 ring-slate-200 bg-white/70 backdrop-blur-2xl shadow-2xl shadow-slate-200/50 focus:ring-4 focus:ring-indigo-100 text-xl transition-all font-medium placeholder:text-slate-300"
                placeholder="Find a tool (e.g. 'Merge', 'OCR', 'Protect')"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat as any)}
                  className={`px-6 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all ${
                    activeCategory === cat 
                    ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/20' 
                    : 'bg-white/50 text-slate-500 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Grid Section */}
      <section className="max-w-7xl mx-auto px-6">
        {filteredTools.length === 0 ? (
          <div className="text-center py-32 bg-white/40 backdrop-blur-md rounded-[3rem] border-2 border-dashed border-slate-200">
            <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center mx-auto mb-6 text-slate-400">
              <FileSearch size={40} />
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2">No tools match your criteria</h3>
            <p className="text-slate-500 mb-8">Try adjusting your search or category filter.</p>
            <button onClick={() => {setSearchQuery(''); setActiveCategory('All');}} className="text-indigo-600 font-bold hover:underline">Reset Filters</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredTools.map((tool, index) => (
              <Link 
                key={tool.id} 
                to={tool.path}
                className="group relative bg-white/60 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white shadow-xl shadow-slate-200/20 hover:shadow-2xl hover:shadow-indigo-900/10 hover:-translate-y-2 transition-all duration-500 flex flex-col h-full overflow-hidden"
              >
                {/* Decorative background element for each card */}
                <div className={`absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-5 blur-2xl transition-all group-hover:scale-150 ${tool.color}`}></div>

                <div className={`
                  w-16 h-16 rounded-2xl mb-8 flex items-center justify-center 
                  transition-all duration-500 group-hover:scale-110 group-hover:rotate-6
                  shadow-xl text-white ${tool.color} ring-4 ring-white/50
                `}>
                  <tool.icon size={32} strokeWidth={1.5} />
                </div>
                
                <div className="flex-grow">
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="font-display text-xl font-black text-slate-900 leading-none">
                      {tool.name}
                    </h3>
                    {tool.id === 'chat-pdf' && <Sparkles size={14} className="text-indigo-500 fill-indigo-500" />}
                  </div>
                  
                  <p className="text-slate-500 text-sm leading-relaxed mb-8">
                    {tool.description}
                  </p>
                </div>

                <div className="flex items-center justify-between mt-auto">
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest group-hover:text-indigo-500 transition-colors">
                    {tool.category}
                  </span>
                  <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                    <ArrowRight size={18} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Trust & Features */}
      <section className="max-w-7xl mx-auto px-6 mt-40">
        <div className="bg-slate-900 rounded-[3rem] p-12 md:p-20 relative overflow-hidden shadow-3xl shadow-slate-900/40">
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px]"></div>
          
          <div className="relative z-10 grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter mb-8 leading-[1.1]">
                Security is our <br/><span className="text-indigo-400">top priority.</span>
              </h2>
              <div className="space-y-6">
                {[
                  { icon: ShieldCheck, title: 'Local Processing', desc: 'Files stay in your browser for standard operations.' },
                  { icon: Zap, title: 'Instant Execution', desc: 'No upload queues or processing delays.' },
                  { icon: Globe, title: 'GDPR Compliant', desc: 'We never store your sensitive data or documents.' }
                ].map((item, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-indigo-400 shrink-0">
                      <item.icon size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-lg">{item.title}</h4>
                      <p className="text-slate-400 text-sm">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="aspect-square rounded-[3rem] bg-gradient-to-br from-indigo-500 to-brand-600 p-1">
                <div className="w-full h-full bg-slate-900 rounded-[2.8rem] flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-20 h-20 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400 mb-6">
                    <Sparkles size={40} />
                  </div>
                  <h3 className="text-2xl font-black text-white mb-4">AI-Powered Extraction</h3>
                  <p className="text-slate-400 leading-relaxed mb-8">
                    Our OCR technology uses Gemini 3 Flash to reconstruct documents with 99.9% accuracy.
                  </p>
                  <Link to="/pdf-to-ocr" className="px-8 py-3 bg-white text-slate-900 font-bold rounded-2xl hover:bg-indigo-50 transition-colors">
                    Try OCR Now
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
