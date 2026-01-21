import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/Header';
import { Home } from './pages/Home';
import { ToolPage } from './pages/ToolPage';

const Footer = () => (
  <footer className="bg-slate-900 text-slate-400 py-12">
    <div className="max-w-7xl mx-auto px-4 grid md:grid-cols-4 gap-8">
      <div>
        <h5 className="text-white font-bold mb-4">Codemanic studio PDFMaster</h5>
        <p className="text-sm">Trusted by millions of people to manage their documents efficiently.</p>
      </div>
      <div>
        <h5 className="text-white font-bold mb-4">Solutions</h5>
        <ul className="space-y-2 text-sm">
          <li>Business</li>
          <li>Education</li>
          <li>Developers</li>
        </ul>
      </div>
      <div>
        <h5 className="text-white font-bold mb-4">Company</h5>
        <ul className="space-y-2 text-sm">
          <li>About Us</li>
          <li>Help & Support</li>
          <li>Legal & Privacy</li>
        </ul>
      </div>
      <div>
        <p className="text-xs">&copy; 2024 Codemanic studio PDFMaster. All rights reserved.</p>
      </div>
    </div>
  </footer>
);

const App: React.FC = () => {
  return (
    <HashRouter>
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/:toolId" element={<ToolPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </HashRouter>
  );
};

export default App;