
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Chat, GroundingChunk } from "@google/genai";
import { marked } from 'marked';
import { useApiKey } from '../contexts/ApiKeyContext';

const SendIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
  </svg>
);

const BotIcon: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M4.5 3.75a3 3 0 00-3 3v10.5a3 3 0 003 3h15a3 3 0 003-3V6.75a3 3 0 00-3-3h-15zm4.125 3a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0zM15.375 3a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0zM19.5 6.75a1.125 1.125 0 11-2.25 0 1.125 1.125 0 012.25 0zM10.875 12a3.375 3.375 0 00-3.375 3.375h6.75A3.375 3.375 0 0010.875 12zM4.125 13.875a1.125 1.125 0 100-2.25 1.125 1.125 0 000 2.25z" clipRule="evenodd" />
  </svg>
);

const UserIcon: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
  </svg>
);

);


interface ChatMessage {
  id: string;
  text: string;
  isUser: boolean;
  sources?: GroundingChunk[];
}

interface ChatbotProps {
  manualContextText?: string;
}

const Chatbot: React.FC<ChatbotProps> = ({ manualContextText }) => {
  const { apiKey } = useApiKey();
  const [ai, setAi] = useState<GoogleGenAI | null>(null);
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKeyAvailable, setApiKeyAvailable] = useState(false);

  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const inputRef = useRef<null | HTMLInputElement>(null);

  useEffect(() => {
    if (apiKey) {
      try {
        const genAI = new GoogleGenAI({ apiKey });
        setAi(genAI);
        setApiKeyAvailable(true);
      } catch (e) {
        console.error("Failed to initialize GoogleGenAI:", e);
        setError("AI 서비스 초기화에 실패했습니다. API 키 형식을 확인해주세요.");
        setApiKeyAvailable(false);
      }
    } else {
      console.warn("API_KEY for chatbot is not set. Chatbot AI features will be disabled.");
      setError("AI 챗봇 기능을 사용하려면 API 키가 필요합니다.");
      setApiKeyAvailable(false);
    }
  }, [apiKey]);

  useEffect(() => {
    if (ai && apiKeyAvailable) {
      let systemInstructionContent = 'You are a helpful assistant for Korean school administration tasks. Provide concise and accurate information based on your knowledge and Google Search results. Cite your sources when available using the grounding information. Respond in Korean. Format your responses using markdown where appropriate (e.g., lists, bolding).무조건! 웹검색을 충분히 하여 정확한 답변을 출력해야한다';

      if (manualContextText) {
        systemInstructionContent += `\n\nAdditionally, you have access to the following table of contents from a school administration manual. When a user's query relates to topics covered in this manual, please reference the relevant sections or page numbers in your response if applicable. If you use information from this manual, please try to cite it (e.g., "학교행정업무매뉴얼 제10편, 168p 참조").\n\n--- SCHOOL ADMINISTRATION MANUAL (TABLE OF CONTENTS) START ---\n${manualContextText}\n--- SCHOOL ADMINISTRATION MANUAL (TABLE OF CONTENTS) END ---`;
      }

      try {
        const newChat = ai.chats.create({
          model: 'gemini-2.5-flash',
          config: {
            systemInstruction: systemInstructionContent,
            tools: [{ googleSearch: {} }],
          },
        });
        setChat(newChat);
        setMessages([
          { id: 'initial-ai-message', text: '안녕하세요! 학교 행정 업무에 대해 무엇이든 물어보세요.', isUser: false }
        ]);
        inputRef.current?.focus();
      } catch (e) {
        console.error("Failed to create chat session:", e);
        setError("챗봇 세션 시작에 실패했습니다. 네트워크 연결 또는 API 설정을 확인해주세요.");
      }
    }
  }, [ai, apiKeyAvailable, manualContextText]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSendMessage = useCallback(async () => {
    if (!userInput.trim() || !chat || isLoading || !apiKeyAvailable) return;

    const userMessageText = userInput.trim();
    const userMessage: ChatMessage = { id: `user-${Date.now()}`, text: userMessageText, isUser: true };
    setMessages(prev => [...prev, userMessage]);
    setUserInput('');
    setIsLoading(true);
    setError(null);

    const aiMessageId = `ai-${Date.now()}`;
    setMessages(prev => [...prev, { id: aiMessageId, text: '', isUser: false, sources: [] }]);

    try {
      const stream = await chat.sendMessageStream({ message: userMessageText });
      let accumulatedText = '';
      let accumulatedSources: GroundingChunk[] = [];

      for await (const chunk of stream) {
        const chunkText = chunk.text;
        if (chunkText) {
          accumulatedText += chunkText;
        }
        const chunkGrounding = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (chunkGrounding) {
          const newSources = chunkGrounding.filter(
            src => src.web && src.web.uri && !accumulatedSources.some(as => as.web?.uri === src.web?.uri)
          );
          accumulatedSources = [...accumulatedSources, ...newSources];
        }

        setMessages(prev => prev.map(msg =>
          msg.id === aiMessageId
            ? { ...msg, text: accumulatedText, sources: accumulatedSources }
            : msg
        ));
      }
    } catch (e) {
      console.error("Error sending message to Gemini API:", e);
      let errorMsg = "메시지 전송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
      if (e instanceof Error) {
        if (e.message.includes("API key not valid")) {
          errorMsg = "API 키가 유효하지 않습니다. 관리자에게 문의하세요.";
        } else if (e.message.includes("quota")) {
          errorMsg = "API 사용량 할당량을 초과했습니다.";
        } else if (e.message.toLowerCase().includes("network error") || e.message.toLowerCase().includes("failed to fetch")) {
          errorMsg = "네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.";
        }
      }
      setError(errorMsg);
      setMessages(prev => prev.map(msg =>
        msg.id === aiMessageId
          ? { ...msg, text: `오류: ${errorMsg}`, sources: [] }
          : msg
      ));
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [userInput, chat, isLoading, apiKeyAvailable]);


  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !isLoading) {
      handleSendMessage();
    }
  };

  const renderMessageText = (text: string) => {
    const html = marked.parse(text, { breaks: true, gfm: true });
    const styledHtml = (html as string)
      .replace(/<ul>/g, '<ul class="list-disc ml-5 mb-2">')
      .replace(/<ol>/g, '<ol class="list-decimal ml-5 mb-2">')
      .replace(/<p>/g, '<p class="mb-2">');
    return <div dangerouslySetInnerHTML={{ __html: styledHtml }} />;
  };


  return (
    <div className="bg-slate-800 p-3 sm:p-4 rounded-xl shadow-xl flex flex-col h-full border border-slate-700 text-slate-100">
      <h2 className="text-lg font-semibold text-cyan-400 mb-3 text-center border-b border-slate-700 pb-2 flex-shrink-0">
        AI 학교행정 도우미
      </h2>

      {!apiKeyAvailable && error && (
        <div className="p-3 my-2 text-sm text-yellow-300 bg-yellow-700/30 border border-yellow-600 rounded-md text-center flex-shrink-0">
          {error}
        </div>
      )}
      {apiKeyAvailable && error && !messages.find(m => m.text.includes(error || '')) && (
        <div className="p-3 my-2 text-sm text-red-400 bg-red-800/30 border border-red-700 rounded-md text-center flex-shrink-0">
          {error}
        </div>
      )}


      <div className="flex-grow overflow-y-auto min-h-0 space-y-4 pr-1 mb-3 scrollbar-thin scrollbar-track-slate-800 scrollbar-thumb-slate-600 hover:scrollbar-thumb-slate-500 scrollbar-thumb-rounded-md">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.isUser ? 'items-end' : 'items-start'}`}>
            <div className={`flex items-start max-w-[85%] ${msg.isUser ? 'flex-row-reverse' : 'flex-row'}`}>
              {!msg.isUser && <BotIcon className="w-5 h-5 text-cyan-400 mr-2 mt-1 flex-shrink-0" />}
              {msg.isUser && <UserIcon className="w-5 h-5 text-sky-400 ml-2 mt-1 flex-shrink-0" />}
              <div
                className={`px-3 py-2 rounded-lg ${msg.isUser
                  ? 'bg-sky-700 text-white rounded-br-none'
                  : 'bg-slate-700 text-slate-200 rounded-bl-none'
                  }`}
              >
                <div className="prose prose-sm prose-invert max-w-none chatbot-message-content">
                  {renderMessageText(msg.text)}
                </div>
              </div>
            </div>
            {msg.sources && msg.sources.length > 0 && !msg.isUser && (
              <div className="mt-1.5 ml-7 text-xs text-slate-400 max-w-[85%]">
                <p className="font-semibold mb-0.5">참고 자료:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {msg.sources.map((source, index) => (
                    source.web && source.web.uri && (
                      <li key={`${msg.id}-src-${index}`}>
                        <a
                          href={source.web.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-cyan-400 underline"
                          title={source.web.title || source.web.uri}
                        >
                          {source.web.title || source.web.uri}
                        </a>
                      </li>
                    )
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex-shrink-0 mt-auto pt-3 border-t border-slate-700">
        <div className="flex items-center space-x-2">
          <input
            ref={inputRef}
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={apiKeyAvailable ? "메시지를 입력하세요..." : "API 키 설정 필요"}
            className="flex-grow p-2.5 bg-slate-700 border border-slate-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none text-sm placeholder-slate-400 disabled:opacity-50"
            disabled={!apiKeyAvailable || isLoading}
            aria-label="채팅 메시지 입력"
          />
          <button
            onClick={handleSendMessage}
            disabled={!apiKeyAvailable || isLoading || !userInput.trim()}
            className="p-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400"
            aria-label="메시지 보내기"
          >
            {isLoading ? (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <SendIcon />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Chatbot;
