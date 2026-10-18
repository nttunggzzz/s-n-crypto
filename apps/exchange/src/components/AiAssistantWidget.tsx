import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, X, Send, Sparkles, ArrowRight, MessageSquare, 
  HelpCircle, RefreshCw, Zap, TrendingUp, ShieldCheck, 
  Coins, ChevronDown, CheckCircle2, ChevronRight
} from 'lucide-react';

export interface AiAssistantWidgetProps {
  onNavigate: (path: string) => void;
}

interface Message {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  time: string;
  action?: {
    label: string;
    path: string;
  };
}

const INITIAL_SUGGESTIONS = [
  { icon: Coins, text: 'Làm sao nhận USDT từ Faucet để test?', prompt: 'Làm sao nhận USDT từ Faucet để test?' },
  { icon: TrendingUp, text: 'Hướng dẫn đặt lệnh Spot & chọn cặp', prompt: 'Hướng dẫn giao dịch Spot và cách đặt lệnh Limit, Market' },
  { icon: Zap, text: 'Futures & đòn bẩy hoạt động thế nào?', prompt: 'Futures đòn bẩy 20x, ký quỹ ban đầu và giá thanh lý hoạt động thế nào?' },
  { icon: Bot, text: 'Cách tạo Bot lưới (Grid) & DCA định kỳ', prompt: 'Cách tạo Bot lưới và Kế hoạch DCA mua định kỳ' },
  { icon: ShieldCheck, text: 'Chính sách thuế 0.1% & bảo mật 2FA', prompt: 'Chính sách khấu trừ thuế bán Spot và kích hoạt 2FA' },
];

/** Intelligent localized AI answering engine for the exchange */
function getAiResponse(query: string): { text: string; action?: { label: string; path: string } } {
  const q = query.toLowerCase().trim();

  // 1. Faucet / Nạp tiền ảo
  if (q.includes('faucet') || q.includes('nạp tiền') || q.includes('tiền ảo') || q.includes('nhận usdt') || q.includes('xin tiền') || q.includes('free')) {
    return {
      text: 'Để nhận tiền thử nghiệm, bạn vào trang **Tài sản** (hoặc Ví), bấm nút **Faucet** để nhận ngay **1.000 USDT** miễn phí! Bạn có thể sử dụng số dư này để mua Spot, nạp vào ví Futures hoặc tạo Bot tự động. Sau mỗi 24 giờ bạn có thể nhận thêm một lần.',
      action: {
        label: 'Mở trang Tài sản & Faucet',
        path: '/assets',
      },
    };
  }

  // 2. Spot Trading
  if (q.includes('spot') || q.includes('giao ngay') || (q.includes('mua') && q.includes('bán') && !q.includes('futures')) || q.includes('lệnh limit') || q.includes('lệnh market')) {
    return {
      text: 'Giao dịch **Spot (Giao ngay)** cho phép bạn sở hữu trực tiếp tài sản mã hóa (BTC, ETH, SOL...):\n\n• **Lệnh Giới hạn (Limit)**: Bạn chỉ định mức giá mong muốn, lệnh sẽ chờ trên sổ lệnh đến khi có người khớp.\n• **Lệnh Thị trường (Market)**: Khớp ngay lập tức với mức giá tốt nhất hiện có trên sổ lệnh.\n• **Phí & Thuế**: Phí giao dịch từ 0.02% - 0.1%. Thuế chỉ khấu trừ 0.1% khi bạn đặt lệnh BÁN (chiều MUA hoàn toàn không chịu thuế).',
      action: {
        label: 'Đến sàn giao dịch Spot',
        path: '/trade/BTCUSDT',
      },
    };
  }

  // 3. Futures & Đòn bẩy
  if (q.includes('futures') || q.includes('đòn bẩy') || q.includes('leverage') || q.includes('long') || q.includes('short') || q.includes('ký quỹ') || q.includes('thanh lý') || q.includes('funding')) {
    return {
      text: 'Giao dịch **Futures (Hợp đồng tương lai)** cho phép bạn kiếm lợi nhuận từ cả 2 chiều thị trường:\n\n• **Mở Long**: Khi bạn dự đoán giá sẽ tăng.\n• **Mở Short**: Khi bạn dự đoán giá sẽ giảm.\n• **Đòn bẩy**: Hỗ trợ đòn bẩy tối đa lên tới 20×. Cần chú ý tỷ lệ ký quỹ để tránh rủi ro chạm Giá thanh lý.\n• **Phí Funding**: Được trao đổi giữa bên Long và Short mỗi 8 giờ dựa trên Funding Rate.\n\n*Lưu ý: Bạn cần chuyển USDT từ ví Spot sang ví Futures trước khi mở vị thế.*',
      action: {
        label: 'Trải nghiệm Futures đòn bẩy',
        path: '/futures/BTCUSDT',
      },
    };
  }

  // 4. Bot giao dịch & DCA
  if (q.includes('bot') || q.includes('lưới') || q.includes('grid') || q.includes('dca') || q.includes('tự động') || q.includes('định kỳ')) {
    return {
      text: 'Hệ thống hỗ trợ 2 chiến lược giao dịch tự động thông minh:\n\n1. **Grid Bot (Bot lưới Spot)**: Tự động chia vốn rải lệnh mua thấp bán cao liên tục trong khoảng giá bạn chọn, kiếm lợi nhuận từ biến động thị trường.\n2. **Kế hoạch DCA (Mua định kỳ)**: Tự động mua một lượng coin cố định theo chu kỳ (mỗi giờ, ngày, tuần) giúp trung bình hóa giá vốn và giảm bớt áp lực tâm lý.',
      action: {
        label: 'Tạo Bot giao dịch ngay',
        path: '/bots',
      },
    };
  }

  // 5. Thuế Crypto
  if (q.includes('thuế') || q.includes('tax') || q.includes('khấu trừ') || q.includes('chiết khấu')) {
    return {
      text: 'Cơ chế **Thuế tiền mã hóa** trên sàn được thiết kế theo chuẩn thử nghiệm minh bạch:\n\n• **Chỉ khấu trừ khi BÁN Spot**: Mức thuế suất chuẩn là 0.1% tính trên tổng giá trị khớp lệnh bán.\n• **Chiều MUA**: Thuế 0% (không áp dụng).\n• **Tổ chức trong nước (DOMESTIC_ORG)**: Tự kê khai, sàn không trích khấu trừ.\n• Bạn có thể xem bảng kê chi tiết và tải file CSV tại trang "Thuế của tôi".',
      action: {
        label: 'Xem báo cáo thuế của tôi',
        path: '/account/tax',
      },
    };
  }

  // 6. 2FA & Bảo mật
  if (q.includes('2fa') || q.includes('bảo mật') || q.includes('mật khẩu') || q.includes('google') || q.includes('authenticator') || q.includes('xác minh')) {
    return {
      text: 'Để bảo vệ tài khoản tối đa, bạn nên bật **Xác thực 2 yếu tố (2FA)** bằng Google Authenticator trong mục Cài đặt -> Bảo mật. Khi bật 2FA, mỗi lần đăng nhập hoặc rút tiền hệ thống sẽ yêu cầu mã OTP 6 chữ số.',
      action: {
        label: 'Đi tới Cài đặt bảo mật',
        path: '/settings',
      },
    };
  }

  // 7. Chuyển tiền giữa các ví
  if (q.includes('chuyển') || q.includes('transfer') || q.includes('ví') || q.includes('wallet')) {
    return {
      text: 'Sàn phân định tài sản giữa **Ví Spot** (cho giao dịch giao ngay, bot) và **Ví Futures** (ký quỹ hợp đồng). Bạn có thể bấm nút **Chuyển tiền** tại màn hình Futures hoặc màn hình Tài sản để luân chuyển USDT tức thì và hoàn toàn miễn phí!',
      action: {
        label: 'Đến trang Tài sản / Ví',
        path: '/assets',
      },
    };
  }

  // Default response
  return {
    text: `Cảm ơn bạn đã hỏi! Sàn giao dịch mô phỏng cung cấp đầy đủ hệ sinh thái:
• **Spot**: Giao dịch giao ngay tức thì.
• **Futures**: Đòn bẩy lên tới 20× với bảo vệ thanh lý.
• **Bot & DCA**: Tự động hóa chiến lược tài chính.
• **Faucet**: Cấp 1.000 USDT miễn phí để bạn trải nghiệm.

Bạn có thể bấm vào một trong các câu hỏi gợi ý bên dưới hoặc gõ câu hỏi cụ thể để tôi hướng dẫn chi tiết nhé!`,
    action: {
      label: 'Khám phá thị trường coin',
      path: '/markets',
    },
  };
}

export const AiAssistantWidget: React.FC<AiAssistantWidgetProps> = ({ onNavigate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showGreetingBubble, setShowGreetingBubble] = useState(false);
  const [displayedGreeting, setDisplayedGreeting] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'bot',
      text: 'Xin chào bạn! 👋 Tôi là Trợ lý AI của sàn giao dịch. Tôi có thể hỗ trợ bạn tìm hiểu cách giao dịch Spot, đòn bẩy Futures, cài đặt Bot tự động hoặc nhận 1.000 USDT miễn phí từ Faucet. Bạn cần hỗ trợ gì hôm nay?',
      time: 'Vừa xong',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fullGreeting = 'Xin chào! Tôi có thể giúp gì cho bạn?';

  // Smooth typewriter effect for greeting bubble after 1.5s
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowGreetingBubble(true);
      let i = 0;
      const interval = setInterval(() => {
        if (i < fullGreeting.length) {
          setDisplayedGreeting(fullGreeting.slice(0, i + 1));
          i++;
        } else {
          clearInterval(interval);
        }
      }, 45);
      return () => clearInterval(interval);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping, isOpen]);

  const handleSendMessage = (textToSend?: string) => {
    const query = (textToSend || inputValue).trim();
    if (!query) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: query,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputValue('');
    setIsTyping(true);

    // Realistic typing delay for smooth AI feel
    setTimeout(() => {
      const response = getAiResponse(query);
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'bot',
        text: response.text,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        action: response.action,
      };
      setMessages((prev) => [...prev, botMsg]);
      setIsTyping(false);
    }, 600);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-auto">
      {/* Speech Bubble Tooltip beside Robot */}
      {!isOpen && showGreetingBubble && (
        <div className="mb-3 mr-1 relative max-w-xs animate-speech-reveal">
          <div className="relative group bg-[rgba(15,18,25,0.92)] text-white text-xs px-4 py-2.5 rounded-2xl border border-[var(--accent,#818cf8)]/40 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.6)] backdrop-blur-xl flex items-center gap-2 cursor-pointer hover:border-[var(--accent,#818cf8)] transition-all">
            <Sparkles size={14} className="text-[var(--accent,#818cf8)] shrink-0 animate-pulse" />
            <span 
              onClick={() => { setIsOpen(true); setShowGreetingBubble(false); }}
              className="font-medium text-[var(--text,#f4f4f5)] leading-relaxed select-none"
            >
              {displayedGreeting}
              <span className="inline-block w-1.5 h-3.5 bg-[var(--accent,#818cf8)] ml-0.5 animate-pulse" />
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowGreetingBubble(false);
              }}
              className="text-[var(--text-3,#63636b)] hover:text-white p-0.5 ml-1 transition-colors rounded-full"
              title="Đóng thông báo"
            >
              <X size={12} />
            </button>
            {/* Bubble arrow pointing down */}
            <div className="absolute -bottom-1.5 right-6 w-3 h-3 bg-[rgba(15,18,25,0.92)] border-r border-b border-[var(--accent,#818cf8)]/40 transform rotate-45" />
          </div>
        </div>
      )}

      {/* Main Chat Drawer / Window */}
      {isOpen && (
        <div className="mb-4 w-[380px] max-w-[calc(100vw-32px)] h-[540px] max-h-[calc(100vh-120px)] rounded-3xl bg-[rgba(13,15,22,0.94)] border border-white/10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] backdrop-blur-2xl flex flex-col overflow-hidden animate-chat-pop">
          {/* Header */}
          <div className="px-5 py-4 bg-gradient-to-r from-[rgba(26,29,42,0.95)] via-[rgba(20,23,34,0.95)] to-[rgba(15,18,26,0.95)] border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Mini Animated Robot Icon in Header */}
              <div className="relative w-9 h-9 rounded-xl bg-gradient-to-tr from-[var(--accent,#818cf8)]/30 to-purple-500/20 border border-[var(--accent,#818cf8)]/40 flex items-center justify-center shadow-inner">
                <svg width="22" height="22" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* Antena */}
                  <line x1="20" y1="4" x2="20" y2="10" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx="20" cy="4" r="2.5" fill="#a78bfa" />
                  {/* Head */}
                  <rect x="8" y="10" width="24" height="22" rx="7" fill="#1e2230" stroke="#818cf8" strokeWidth="2" />
                  {/* Left Eye */}
                  <circle cx="15" cy="18" r="2.5" fill="#38bdf8" />
                  {/* Right Eye (Winking) */}
                  <path d="M22.5 18 Q25 15.5 27.5 18" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" fill="none" className="animate-robot-wink" />
                  {/* Cheeks */}
                  <circle cx="12" cy="22" r="1.5" fill="#f472b6" opacity="0.6" />
                  <circle cx="28" cy="22" r="1.5" fill="#f472b6" opacity="0.6" />
                  {/* Smile */}
                  <path d="M16 23.5 Q20 27.5 24 23.5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" fill="none" />
                </svg>
                {/* Active Green Dot */}
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[var(--up,#1fc27a)] border-2 border-[var(--panel,#0a0a0b)] rounded-full" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5 font-display">
                  <span>Trợ lý AI CEX</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-[var(--accent,#818cf8)]/20 text-[var(--accent,#818cf8)]">
                    24/7
                  </span>
                </h3>
                <p className="text-[11px] text-[var(--text-3,#63636b)] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--up,#1fc27a)] animate-pulse" />
                  Sẵn sàng giải đáp thắc mắc
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setMessages([
                  {
                    id: Date.now().toString(),
                    sender: 'bot',
                    text: 'Lịch sử chat đã được làm mới. Tôi có thể hỗ trợ gì cho bạn?',
                    time: 'Vừa xong',
                  }
                ])}
                className="p-1.5 rounded-lg text-[var(--text-3,#63636b)] hover:text-white hover:bg-white/5 transition-colors"
                title="Làm mới cuộc trò chuyện"
              >
                <RefreshCw size={14} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-[var(--text-3,#63636b)] hover:text-white hover:bg-white/5 transition-colors"
                title="Đóng cửa sổ"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs leading-relaxed">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-2.5 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.sender === 'bot' && (
                  <div className="w-7 h-7 rounded-lg bg-[var(--accent,#818cf8)]/20 border border-[var(--accent,#818cf8)]/30 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot size={15} className="text-[var(--accent,#818cf8)]" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                    m.sender === 'user'
                      ? 'bg-gradient-to-r from-[var(--accent,#818cf8)] to-indigo-600 text-white rounded-br-none shadow-md shadow-[var(--accent,#818cf8)]/15'
                      : 'bg-white/[0.05] border border-white/[0.08] text-[var(--text,#f4f4f5)] rounded-tl-none shadow-sm'
                  }`}
                >
                  <p className="whitespace-pre-line select-text">{m.text}</p>
                  {m.action && (
                    <button
                      onClick={() => {
                        onNavigate(m.action!.path);
                        setIsOpen(false);
                      }}
                      className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--accent,#818cf8)]/20 hover:bg-[var(--accent,#818cf8)]/30 border border-[var(--accent,#818cf8)]/40 text-[var(--accent,#818cf8)] font-semibold transition-all hover:scale-[1.02] active:scale-95"
                    >
                      <span>{m.action.label}</span>
                      <ChevronRight size={14} />
                    </button>
                  )}
                  <span className={`block text-[9px] mt-1 text-right ${m.sender === 'user' ? 'text-white/60' : 'text-[var(--text-3,#63636b)]'}`}>
                    {m.time}
                  </span>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-2.5 items-center">
                <div className="w-7 h-7 rounded-lg bg-[var(--accent,#818cf8)]/20 border border-[var(--accent,#818cf8)]/30 flex items-center justify-center shrink-0">
                  <Bot size={15} className="text-[var(--accent,#818cf8)]" />
                </div>
                <div className="bg-white/[0.05] border border-white/[0.08] px-3.5 py-2 rounded-2xl rounded-tl-none flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent,#818cf8)] typing-dot-1" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent,#818cf8)] typing-dot-2" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent,#818cf8)] typing-dot-3" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestions Pills */}
          <div className="px-3 py-2 border-t border-white/[0.06] bg-black/30 overflow-x-auto flex gap-1.5 no-scrollbar">
            {INITIAL_SUGGESTIONS.map((s, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(s.prompt)}
                className="whitespace-nowrap flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-[11px] text-[var(--text-2,#a1a1aa)] hover:text-white transition-all cursor-pointer active:scale-95"
              >
                <s.icon size={11} className="text-[var(--accent,#818cf8)]" />
                <span>{s.text}</span>
              </button>
            ))}
          </div>

          {/* Message Input Box */}
          <div className="p-3 border-t border-white/10 bg-black/40">
            <div className="flex items-center gap-2 bg-white/[0.06] border border-white/10 rounded-2xl px-3 py-1.5 focus-within:border-[var(--accent,#818cf8)] transition-all">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Hỏi về nạp tiền, Spot, Futures, Bot..."
                className="flex-1 bg-transparent text-xs text-white placeholder-[var(--text-3,#63636b)] outline-none py-1"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={!inputValue.trim() || isTyping}
                className="p-1.5 rounded-xl bg-[var(--accent,#818cf8)] hover:bg-[var(--accent,#818cf8)]/90 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 cursor-pointer shadow-sm shadow-[var(--accent,#818cf8)]/30"
                title="Gửi tin nhắn"
              >
                <Send size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Animated Robot Button */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          setShowGreetingBubble(false);
        }}
        aria-label="Trợ lý AI hỗ trợ người dùng mới"
        className="relative group p-1.5 rounded-full cursor-pointer focus:outline-none transition-transform hover:scale-110 active:scale-95"
      >
        {/* Radar Wave Pulse Background */}
        <span className="absolute inset-0 rounded-full bg-[var(--accent,#818cf8)] opacity-25 animate-radar-ripple pointer-events-none" />
        <span className="absolute -inset-1 rounded-full bg-gradient-to-tr from-[var(--accent,#818cf8)] to-purple-600 opacity-60 blur-md group-hover:opacity-100 transition-opacity pointer-events-none" />

        {/* Robot Avatar Body Circle */}
        <div className="relative w-14 h-14 rounded-full bg-gradient-to-b from-[#1e2235] via-[#161826] to-[#0d0f17] border-2 border-[var(--accent,#818cf8)]/80 shadow-[0_8px_30px_rgba(129,140,248,0.4)] flex items-center justify-center overflow-hidden animate-robot-float">
          {/* Animated Robot SVG Character */}
          <svg width="34" height="34" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Antena */}
            <line x1="20" y1="3" x2="20" y2="9" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="20" cy="3" r="2.5" fill="#c084fc" className="animate-pulse" />

            {/* Robot Head Outer */}
            <rect x="7" y="9" width="26" height="23" rx="8" fill="#1b1f2e" stroke="#818cf8" strokeWidth="2" />
            
            {/* Ear lights */}
            <rect x="4" y="17" width="3" height="7" rx="1.5" fill="#818cf8" />
            <rect x="33" y="17" width="3" height="7" rx="1.5" fill="#818cf8" />

            {/* Face Screen Visor */}
            <rect x="10" y="12" width="20" height="17" rx="5" fill="#0d0f18" />

            {/* Left Eye (Sparkling Open) */}
            <circle cx="15" cy="18" r="3" fill="#38bdf8" />
            <circle cx="14" cy="17" r="1" fill="#ffffff" />

            {/* Right Eye (Winking Cute Robot Animation) */}
            <g className="animate-robot-wink">
              <path d="M22 18.5 Q25 15.5 28 18.5" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              <path d="M24 16 L25 14" stroke="#38bdf8" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M27 16.5 L28.5 15" stroke="#38bdf8" strokeWidth="1.2" strokeLinecap="round" />
            </g>

            {/* Rosy Cheeks */}
            <circle cx="12.5" cy="22.5" r="1.5" fill="#f43f5e" opacity="0.75" />
            <circle cx="27.5" cy="22.5" r="1.5" fill="#f43f5e" opacity="0.75" />

            {/* Big Cute Smile */}
            <path d="M16 23 Q20 28 24 23" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" fill="none" />
          </svg>

          {/* Sparkle badge */}
          <div className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-[var(--accent,#818cf8)] border border-white animate-ping" />
        </div>
      </button>
    </div>
  );
};
