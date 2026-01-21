import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { TOOLS } from '../constants';
import { ShieldCheck, Zap, Globe, Search, ArrowRight } from 'lucide-react';

export const Home: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTools = TOOLS.filter(tool => 
    tool.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    tool.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen pb-20 overflow-hidden">
      {/* Dynamic Background Elements */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-200/40 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob"></div>
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-indigo-200/40 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-pink-200/40 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-4000"></div>
      </div>

      {/* Hero Section */}
      <div className="relative pt-24 pb-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 border border-white shadow-sm backdrop-blur-sm mb-4 animate-fade-in">
            <span className="flex h-2 w-2 rounded-full bg-green-500"></span>
            <span className="text-sm font-medium text-slate-600">v2.0 with Gemini AI Integration</span>
          </div>
          
          <h1 className="font-display text-5xl md:text-7xl font-extrabold text-slate-900 tracking-tight leading-tight animate-slide-up">
            Master your PDFs <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-indigo-600">in seconds.</span>
          </h1>
          
          <p className="text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed animate-slide-up" style={{animationDelay: '0.1s'}}>
            The ultimate suite for document management. Merge, split, convert, and chat with your PDFs using our intelligent AI tools.
          </p>

          {/* Search Bar */}
          <div className="max-w-xl mx-auto relative group animate-slide-up" style={{animationDelay: '0.2s'}}>
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-slate-400 group-focus-within:text-brand-500 transition-colors" />
            </div>
            <input
              type="text"
              className="w-full pl-12 pr-4 py-5 rounded-2xl border-none ring-1 ring-slate-200 shadow-xl shadow-slate-200/50 focus:ring-2 focus:ring-brand-500 focus:shadow-brand-500/20 text-lg transition-all"
              placeholder="What would you like to do? (e.g. 'Merge', 'Word to PDF')"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Tools Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8">
        {filteredTools.length === 0 ? (
          <div className="text-center py-20 bg-white/50 rounded-3xl border border-dashed border-slate-300">
            <p className="text-slate-500 text-lg">No tools found matching "{searchQuery}"</p>
            <button onClick={() => setSearchQuery('')} className="mt-4 text-brand-600 font-medium hover:underline">Clear search</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredTools.map((tool, index) => (
              <Link 
                key={tool.id} 
                to={tool.path}
                className="group relative bg-white/80 backdrop-blur-sm p-8 rounded-3xl border border-white shadow-sm hover:shadow-2xl hover:shadow-brand-900/5 hover:-translate-y-1 transition-all duration-300 flex flex-col h-full animate-slide-up"
                style={{ animationDelay: `${0.1 + (index * 0.05)}s` }}
              >
                <div className={`
                  w-14 h-14 rounded-2xl mb-6 flex items-center justify-center 
                  transition-all duration-300 group-hover:scale-110 group-hover:rotate-3
                  ${tool.id === 'chat-pdf' 
                    ? 'bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-indigo-200' 
                    : 'bg-gradient-to-br from-brand-500 to-brand-700 shadow-brand-200'
                  } shadow-lg text-white
                `}>
                  <tool.icon size={28} strokeWidth={2} />
                </div>
                
                <h3 className="font-display text-xl font-bold text-slate-800 mb-3 group-hover:text-brand-700 transition-colors">
                  {tool.name}
                </h3>
                
                <p className="text-slate-500 text-sm leading-relaxed mb-6 flex-grow">
                  {tool.description}
                </p>

                <div className="flex items-center text-sm font-bold text-brand-600 opacity-0 transform translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                  Use Tool <ArrowRight size={16} className="ml-1" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Features Section */}
      <div className="max-w-7xl mx-auto px-4 py-32">
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { 
              icon: Zap, 
              color: 'bg-amber-100 text-amber-600', 
              title: 'Lightning Fast', 
              desc: 'Client-side processing ensures your files are handled instantly without queueing.' 
            },
            { 
              icon: ShieldCheck, 
              color: 'bg-emerald-100 text-emerald-600', 
              title: 'Bank-Grade Security', 
              desc: 'Files are processed locally in your browser or securely handled with auto-deletion.' 
            },
            { 
              icon: Globe, 
              color: 'bg-blue-100 text-blue-600', 
              title: 'Universal Access', 
              desc: 'Access from any device, anywhere. No software installation required.' 
            }
          ].map((feature, i) => (
            <div key={i} className="bg-white/60 p-8 rounded-3xl border border-white shadow-sm hover:bg-white transition-colors">
              <div className={`w-12 h-12 ${feature.color} rounded-xl flex items-center justify-center mb-6`}>
                <feature.icon size={24} />
              </div>
              <h4 className="font-display text-lg font-bold text-slate-900 mb-2">{feature.title}</h4>
              <p className="text-slate-500 leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};