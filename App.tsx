import React, { useEffect, useState } from 'react';
import Calendar from './components/Calendar';
import Chatbot from './components/Chatbot';
import { scheduleData } from './data/scheduleData';
import { manualData } from './data/manualData';
import ApiKeyModal from './components/ApiKeyModal';
import { useApiKey } from './contexts/ApiKeyContext';
import { ThemeProvider, ThemeType, useTheme } from './contexts/ThemeContext';
import GuidedTour, { GuidedTourStep } from './components/GuidedTour';

interface HowToUseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const HowToUseModal: React.FC<HowToUseModalProps> = ({ isOpen, onClose }) => {
  const { colors } = useTheme();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`${colors.componentBg} p-6 rounded-xl shadow-2xl border ${colors.border} w-full max-w-2xl max-h-[80vh] flex flex-col relative`} onClick={e => e.stopPropagation()}>
        <button
          onClick={onClose}
          className={`absolute top-4 right-4 ${colors.textSecondary} hover:${colors.textPrimary} transition-colors`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h2 className={`text-xl sm:text-2xl font-bold ${colors.accentColor} mb-4 pr-8`}>스마트캘린더 사용법</h2>
        <div className="flex-grow overflow-y-auto min-h-0 scrollbar-thin pr-2">
          <ul className={`space-y-4 ${colors.textSecondary}`}>
            <li className="flex items-start">
              <span className={`${colors.accentColor} mr-2 mt-1 flex-shrink-0 text-lg`}>&#8227;</span>
              <span>
                <strong>캘린더 이동:</strong> 이전/다음 버튼으로 월을 이동하고, 오늘 날짜가 강조됩니다.
              </span>
            </li>
            <li className="flex items-start">
              <span className={`${colors.accentColor} mr-2 mt-1 flex-shrink-0 text-lg`}>&#8227;</span>
              <span>
                <strong>일정 확인:</strong> 날짜/일정을 클릭하면 AI 보고서(업무 설명·처리절차)를 볼 수 있습니다.
              </span>
            </li>
            <li className="flex items-start">
              <span className={`${colors.accentColor} mr-2 mt-1 flex-shrink-0 text-lg`}>&#8227;</span>
              <span>
                <strong>AI 기능:</strong> Gemini 또는 OpenRouter API Key를 설정하면 일정 설명/챗봇이 동작합니다. (Gemini가 있으면 Gemini를 우선 사용)
              </span>
            </li>
            <li className="flex items-start">
              <span className={`${colors.accentColor} mr-2 mt-1 flex-shrink-0 text-lg`}>&#8227;</span>
              <span>
                <strong>API 키 발급:</strong> 상단 <strong>API Key 설정</strong> → <strong>키 발급받기</strong> 버튼 → Google 로그인 후 키를 만들고 복사해 붙여넣으세요.
              </span>
            </li>
            <li className="flex items-start">
              <span className={`${colors.accentColor} mr-2 mt-1 flex-shrink-0 text-lg`}>&#8227;</span>
              <span>
                <strong>일정 추가:</strong> 달력 칸에 마우스를 올리면 왼쪽 상단에 <strong>＋</strong> 버튼이 보입니다. 칸/버튼을 클릭해 일정을 추가하세요.
              </span>
            </li>
            <li className="flex items-start">
              <span className={`${colors.accentColor} mr-2 mt-1 flex-shrink-0 text-lg`}>&#8227;</span>
              <span>
                <strong>업무 분류/날짜 이동:</strong> 일정 추가/수정 창에서 업무 분류(예: 예산·급여·지출 등)를 고르고, 날짜 드롭다운으로 다른 날짜로 옮길 수 있습니다. 또는 일정을 드래그&드롭으로 다른 날짜로 옮길 수 있습니다. (수정: 일정 클릭 → AI 보고서 상단 <strong>수정</strong>)
              </span>
            </li>
          </ul>
        </div>
        <div className="mt-6 text-center">
          <button onClick={onClose} className={`${colors.accentBg} hover:opacity-90 ${colors.buttonText} px-6 py-2 rounded-lg font-semibold transition-colors`}>닫기</button>
        </div>
      </div>
    </div>
  );
};

interface HeaderProps {
  onOpenUsage: () => void;
}

const TOUR_SEEN_STORAGE_KEY = 'smartcalendar:tourSeen';

const TOUR_STEPS: GuidedTourStep[] = [
  { target: 'chat-input', title: '챗봇 입력창', description: '여기에서 AI에게 질문하거나, 일정 추가를 요청할 수 있어요.' },
  { target: 'ai-schedule-toggle', title: 'AI 일정 추가', description: '이 버튼을 켜면 입력한 문장을 바탕으로 캘린더 일정을 제안해줘요.' },
  { target: 'calendar-event', title: '일정 클릭', description: '일정을 클릭하면 해당 일정의 AI 보고서가 열립니다.' },
  { target: 'view-week', title: '주간 보기', description: '주간 캘린더로 전환해서 한 주 단위로 확인할 수 있어요.' },
  { target: 'calendar-more', title: '더보기', description: '하루에 일정이 많을 때 +N 더보기로 숨겨진 일정을 펼칠 수 있어요.', arrowOffset: { y: -16 } },
  { target: 'calendar-event', title: '일정 이동(드래그)', description: '일정을 드래그&드롭으로 다른 날짜로 옮길 수 있어요.' },
  { target: 'filter-button', title: '필터', description: '카테고리/생성 출처(사용자/AI)별로 일정을 필터링할 수 있어요.' },
  { target: 'api-settings-button', title: '설정', description: 'Provider 선택, API Key 등록, 백업/가져오기 기능을 설정할 수 있어요.' },
];

const Header: React.FC<HeaderProps> = ({ onOpenUsage }) => {
  const {
    apiKey,
    openRouterApiKey,
    aiProviderPreference,
    openRouterModel,
    setApiKey,
    setOpenRouterApiKey,
    setAiProviderPreference,
    setOpenRouterModel,
    clearApiKey,
    clearOpenRouterApiKey
  } = useApiKey();
  const { theme, setTheme, colors } = useTheme();
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);

  return (
    <header className={`flex justify-between items-center p-4 ${colors.headerBg} border-b ${colors.border}`}>
      <h1 className={`text-xl font-bold ${colors.accentColor}`}>마음ON 학교행정 스마트캘린더</h1>
      <div className="flex items-center gap-2">
        <div className={`flex rounded-lg p-1 border ${colors.border} mr-2`}>
          {(['dark', 'light', 'beige'] as ThemeType[]).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors mx-0.5
                 ${theme === t ? 'ring-2 ring-offset-1 ring-cyan-500' : 'hover:opacity-80'}
                 ${t === 'dark' ? 'bg-slate-800' : t === 'light' ? 'bg-white border border-gray-300' : 'bg-[#e4dcc0]'}
               `}
              title={`${t} theme`}
            />
          ))}
        </div>
        <button
          onClick={onOpenUsage}
          className={`${colors.accentBg} hover:opacity-90 ${colors.buttonText} font-semibold py-2 px-4 rounded-lg transition-colors mr-2`}
        >
          사용법
        </button>
        <div className={`hidden sm:block text-xs ${colors.textSecondary}`}>
          Provider: {aiProviderPreference === 'auto' ? '자동' : aiProviderPreference === 'gemini' ? 'Gemini' : 'OpenRouter'} · Key: {(apiKey || openRouterApiKey) ? '설정됨' : '미설정'}
        </div>
        <div className={`hidden lg:block text-xs ${colors.textSecondary}`}>
          Gemini: {apiKey ? '설정됨' : '미설정'} · OpenRouter: {openRouterApiKey ? '설정됨' : '미설정'}
        </div>
        <button
          onClick={() => setIsApiKeyModalOpen(true)}
          data-tour="api-settings-button"
          className={`bg-slate-700 hover:bg-slate-600 ${colors.buttonText} font-semibold py-2 px-4 rounded-lg transition-colors`}
        >
          API Key 설정
        </button>
      </div>
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        geminiApiKey={apiKey}
        openRouterApiKey={openRouterApiKey}
        aiProviderPreference={aiProviderPreference}
        openRouterModel={openRouterModel}
        onSaveGemini={setApiKey}
        onSaveOpenRouter={setOpenRouterApiKey}
        onSaveAiProviderPreference={setAiProviderPreference}
        onSaveOpenRouterModel={setOpenRouterModel}
        onClearGemini={clearApiKey}
        onClearOpenRouter={clearOpenRouterApiKey}
      />
    </header>
  );
};

const MainLayoutContent = () => {
  const [isUsageModalOpen, setIsUsageModalOpen] = useState(false);
  const [isTourOpen, setIsTourOpen] = useState(false);
  const { colors } = useTheme();

  useEffect(() => {
    const seen = localStorage.getItem(TOUR_SEEN_STORAGE_KEY) === '1';
    if (!seen) setIsTourOpen(true);
  }, []);

  return (
    <div className={`h-screen flex flex-col ${colors.mainBg} antialiased overflow-hidden`}>
      <Header onOpenUsage={() => setIsUsageModalOpen(true)} />
      <HowToUseModal isOpen={isUsageModalOpen} onClose={() => setIsUsageModalOpen(false)} />
      <GuidedTour
        isOpen={isTourOpen}
        steps={TOUR_STEPS}
        onClose={({ dismissed }) => {
          setIsTourOpen(false);
          localStorage.setItem(TOUR_SEEN_STORAGE_KEY, '1');
        }}
      />
      {!isTourOpen && (
        <button
          type="button"
          onClick={() => setIsTourOpen(true)}
          className={`fixed left-4 bottom-4 z-[150] w-11 h-11 rounded-full ${colors.accentBg} hover:opacity-90 ${colors.buttonText} font-bold shadow-xl`}
          aria-label="가이드 투어 다시보기"
        >
          ?
        </button>
      )}
      <main className="flex-grow p-4 sm:p-6 md:p-8 flex flex-col min-h-0">
        <div className="flex flex-col md:flex-row gap-4 sm:gap-6 w-full max-w-screen-2xl mx-auto flex-grow min-h-0">
          <div className="md:w-[75%] w-full order-1 md:order-1 flex flex-col min-h-0">
            <div className="w-full flex-grow min-h-0 flex flex-col">
              <Calendar scheduleText={scheduleData} manualContextText={manualData} />
            </div>
          </div>
          <div className="md:w-[25%] w-full order-2 md:order-2 flex flex-col min-h-0">
            <Chatbot manualContextText={manualData} />
          </div>
        </div>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <MainLayoutContent />
    </ThemeProvider>
  );
};

export default App;
