import React, { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Calendar from './components/Calendar';
import Chatbot from './components/Chatbot';
import Payment from './components/Payment';
import SuccessPage from './components/SuccessPage';
import FailPage from './components/FailPage';
import { scheduleData } from './data/scheduleData';
import { manualData } from './data/manualData';
import ApiKeyModal from './components/ApiKeyModal';
import { useApiKey, ApiKeyProvider } from './contexts/ApiKeyContext';

const HowToUsePanel: React.FC = () => (
  <div className="bg-slate-800 p-4 sm:p-6 rounded-xl shadow-lg border border-slate-700 h-full flex flex-col">
    <h2 className="text-lg sm:text-xl font-semibold text-cyan-400 mb-3 sm:mb-4 flex-shrink-0">스마트캘린더 사용법</h2>
    <div className="flex-grow overflow-y-auto min-h-0 scrollbar-thin pr-1">
      <ul className="space-y-3 text-sm text-slate-300">
        <li className="flex items-start">
          <span className="text-cyan-400 mr-2 mt-1 flex-shrink-0">&#8227;</span>
          <span>
            <strong>캘린더 이동:</strong> 이전/다음 버튼으로 월을 이동하고, 오늘 날짜가 강조됩니다.
          </span>
        </li>
        <li className="flex items-start">
          <span className="text-cyan-400 mr-2 mt-1 flex-shrink-0">&#8227;</span>
          <span>
            <strong>일정 확인:</strong> 날짜를 클릭하면 상세 내용을 보고 AI 설명을 받을 수 있습니다.
          </span>
        </li>
        <li className="flex items-start">
          <span className="text-cyan-400 mr-2 mt-1 flex-shrink-0">&#8227;</span>
          <span>
            <strong>AI 기능:</strong> Gemini API Key를 설정하면 일정 설명/챗봇이 동작합니다.
          </span>
        </li>
      </ul>
    </div>
  </div>
);

const Header: React.FC = () => {
  const { apiKey, setApiKey, clearApiKey } = useApiKey();
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);

  return (
    <header className="flex justify-between items-center p-4 bg-slate-900 text-white">
      <h1 className="text-xl font-bold text-cyan-400">마음ON 학교행정 스마트캘린더</h1>
      <div className="flex items-center gap-2">
        <div className="hidden sm:block text-xs text-slate-300">API Key: {apiKey ? '설정됨' : '미설정'}</div>
        <button
          onClick={() => setIsApiKeyModalOpen(true)}
          className="bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
        >
          API Key 설정
        </button>
      </div>
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        apiKey={apiKey}
        onSave={setApiKey}
        onClear={clearApiKey}
      />
    </header>
  );
};

const MainLayout = () => (
  <div className="min-h-screen flex flex-col bg-slate-950 antialiased">
    <Header />
    <main className="flex-grow p-4 sm:p-6 md:p-8">
      <div className="flex flex-col md:flex-row gap-4 sm:gap-6 w-full max-w-screen-2xl mx-auto">
        <div className="md:w-[20%] w-full order-1 md:order-1 flex flex-col h-[400px] sm:h-[500px] md:h-[650px]">
          <HowToUsePanel />
        </div>
        <div className="md:w-[55%] w-full order-2 md:order-2 flex flex-col md:min-h-0">
          <div className="w-full md:flex-grow">
            <Calendar scheduleText={scheduleData} manualContextText={manualData} />
          </div>
        </div>
        <div className="md:w-[25%] w-full order-3 md:order-3 flex flex-col h-[400px] sm:h-[500px] md:h-[650px]">
          <Chatbot manualContextText={manualData} />
        </div>
      </div>
    </main>
  </div>
);

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/payment" element={<Payment />} />
      <Route path="/success" element={<SuccessPage />} />
      <Route path="/fail" element={<FailPage />} />
      <Route path="/" element={<MainLayout />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
