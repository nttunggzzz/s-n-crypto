import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Send, Sparkles, RefreshCw, Zap, TrendingUp, ShieldCheck, 
  Coins, ChevronRight, User, HelpCircle, Bot, BarChart3, Volume2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';

export interface AiAssistantWidgetProps {
  onNavigate: (path: string) => void;
}

export type SakuraExpression = 'default' | 'cheerful' | 'explaining' | 'thoughtful';

interface Message {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  time: string;
  expression?: SakuraExpression;
  action?: {
    label: string;
    path: string;
  };
}

const INITIAL_SUGGESTIONS = [
  { icon: Coins, text: 'Làm sao nhận 1.000 USDT Faucet miễn phí?', prompt: 'Làm sao nhận USDT từ Faucet để trải nghiệm?' },
  { icon: TrendingUp, text: 'Hướng dẫn đặt lệnh Spot & chọn cặp coin', prompt: 'Hướng dẫn giao dịch Spot và cách đặt lệnh Limit, Market' },
  { icon: Zap, text: 'Futures đòn bẩy 20x & ký quỹ thế nào?', prompt: 'Futures đòn bẩy 20x, ký quỹ ban đầu và giá thanh lý hoạt động thế nào?' },
  { icon: Bot, text: 'Cách tạo Bot lưới (Grid) & DCA định kỳ', prompt: 'Cách tạo Bot lưới và Kế hoạch DCA mua định kỳ' },
  { icon: ShieldCheck, text: 'Chính sách thuế 0.1% & bảo mật 2FA', prompt: 'Chính sách khấu trừ thuế bán Spot 0.1% và kích hoạt 2FA' },
];

/** Avatar mapping for Sakura's expressions */
const SAKURA_SPRITES: Record<SakuraExpression, string> = {
  default: '/sakura/sakura-chibi-avatar.png',
  cheerful: '/sakura/sakura-chibi-avatar.png',
  explaining: '/sakura/sakura-chibi-avatar.png',
  thoughtful: '/sakura/sakura-chibi-avatar.png',
};

/** Intelligent localized AI answering engine for Sakura (Chatbot CSKH) */
function getSakuraResponse(query: string): { 
  text: string; 
  expression: SakuraExpression;
  action?: { label: string; path: string }; 
} {
  const q = query.toLowerCase().trim();

  // 1. Faucet / Nạp tiền ảo
  if (q.includes('faucet') || q.includes('nạp tiền') || q.includes('tiền ảo') || q.includes('nhận usdt') || q.includes('xin tiền') || q.includes('free') || q.includes('1.000') || q.includes('1000')) {
    return {
      text: 'Dạ chào anh/chị! ✨ Để nhận tiền thử nghiệm, anh/chị chỉ cần vào mục **Tài sản** (hoặc Ví), bấm nút **Faucet** để nhận ngay **1.000 USDT** hoàn toàn miễn phí!\n\nAnh/chị có thể sử dụng số dư này để mua bán Spot, ký quỹ mở lệnh Futures hoặc tạo Bot tự động. Sau mỗi 24 giờ hệ thống sẽ cho phép nhận tiếp một lần ạ!',
      expression: 'cheerful',
      action: {
        label: 'Mở trang Tài sản & Faucet',
        path: '/assets',
      },
    };
  }

  // 2. Spot Trading
  if (q.includes('spot') || q.includes('giao ngay') || (q.includes('mua') && q.includes('bán') && !q.includes('futures')) || q.includes('lệnh limit') || q.includes('lệnh market')) {
    return {
      text: 'Dạ về giao dịch **Spot (Giao ngay)**, anh/chị có thể sở hữu trực tiếp các tài sản mã hóa (BTC, ETH, SOL...):\n\n• **Lệnh Giới hạn (Limit)**: Anh/chị chủ động đặt mức giá mong muốn, lệnh sẽ treo trên sổ lệnh đến khi có người khớp.\n• **Lệnh Thị trường (Market)**: Khớp tức thì với mức giá tốt nhất hiện có trên sổ lệnh.\n• **Minh bạch thuế & phí**: Phí giao dịch từ 0.02% - 0.1%. Thuế chỉ khấu trừ 0.1% khi anh/chị đặt lệnh BÁN (chiều MUA hoàn toàn không tính thuế 0%).',
      expression: 'explaining',
      action: {
        label: 'Đến sàn giao dịch Spot BTC/USDT',
        path: '/trade/BTCUSDT',
      },
    };
  }

  // 3. Futures & Đòn bẩy
  if (q.includes('futures') || q.includes('đòn bẩy') || q.includes('leverage') || q.includes('long') || q.includes('short') || q.includes('ký quỹ') || q.includes('thanh lý') || q.includes('funding')) {
    return {
      text: 'Dạ giao dịch **Futures (Hợp đồng tương lai)** cho phép anh/chị tìm kiếm lợi nhuận 2 chiều linh hoạt:\n\n• **Mở Long**: Khi anh/chị kỳ vọng giá sẽ tăng.\n• **Mở Short**: Khi anh/chị dự đoán giá sẽ giảm.\n• **Đòn bẩy tối đa 20×**: Cần lưu ý tỷ lệ ký quỹ để bảo vệ vị thế không chạm giá thanh lý.\n• **Phí Funding**: Tự động thanh toán giữa 2 phe Long và Short mỗi 8 giờ dựa trên Funding Rate của thị trường.\n\n*Mẹo nhỏ từ Sakura: Anh/chị hãy chuyển USDT từ ví Spot sang ví Futures trước khi bắt đầu đặt lệnh nhé!*',
      expression: 'explaining',
      action: {
        label: 'Trải nghiệm Futures đòn bẩy 20x',
        path: '/futures/BTCUSDT',
      },
    };
  }

  // 4. Bot giao dịch & DCA
  if (q.includes('bot') || q.includes('lưới') || q.includes('grid') || q.includes('dca') || q.includes('tự động') || q.includes('định kỳ')) {
    return {
      text: 'Dạ hiện sàn đang hỗ trợ 2 chiến lược giao dịch tự động cực kỳ thông minh:\n\n1. **Grid Bot (Bot lưới)**: Tự động chia vốn rải lệnh mua thấp bán cao liên tục trong biên độ giá anh/chị cài đặt, tối ưu hóa lợi nhuận khi thị trường đi ngang.\n2. **Kế hoạch DCA (Mua định kỳ)**: Tự động trích tiền mua lượng coin cố định theo chu kỳ (mỗi giờ, ngày, tuần) giúp trung bình hóa giá vốn hiệu quả mà không tốn công theo dõi bảng điện tử ạ!',
      expression: 'cheerful',
      action: {
        label: 'Khởi tạo Bot giao dịch ngay',
        path: '/bots',
      },
    };
  }

  // 5. Thuế Crypto
  if (q.includes('thuế') || q.includes('tax') || q.includes('khấu trừ') || q.includes('chiết khấu')) {
    return {
      text: 'Dạ về chính sách **Thuế tiền mã hóa** trên sàn:\n\n• **Tự động kích hoạt khi BÁN Spot**: Thuế suất chuẩn là **0.1%** tính trên tổng giá trị lệnh bán khớp thành công.\n• **Chiều MUA**: Thuế suất 0% (hoàn toàn miễn thuế).\n• **Tổ chức trong nước (DOMESTIC_ORG)**: Tự kê khai, sàn không trích khấu trừ.\n• Anh/chị có thể xem trước số tiền thuế và số tiền thực nhận ngay trên form trước khi ấn nút Đặt lệnh, đồng thời tải bản kê khai chi tiết tại mục Thuế của tôi ạ!',
      expression: 'explaining',
      action: {
        label: 'Xem báo cáo thuế của tôi',
        path: '/account/tax',
      },
    };
  }

  // 6. 2FA & Bảo mật
  if (q.includes('2fa') || q.includes('bảo mật') || q.includes('mật khẩu') || q.includes('google') || q.includes('authenticator') || q.includes('xác minh')) {
    return {
      text: 'Dạ để bảo vệ tài sản tối đa, Sakura khuyến khích anh/chị kích hoạt **Xác thực 2 yếu tố (2FA)** bằng Google Authenticator trong mục Cài đặt -> Bảo mật. Khi bật 2FA, mọi thao tác đăng nhập và rút tiền đều được bảo vệ bằng lớp mã OTP 6 số an toàn tuyệt đối!',
      expression: 'thoughtful',
      action: {
        label: 'Cài đặt bảo mật 2FA',
        path: '/settings',
      },
    };
  }

  // 7. Chuyển tiền giữa các ví
  if (q.includes('chuyển') || q.includes('transfer') || q.includes('ví') || q.includes('wallet')) {
    return {
      text: 'Dạ sàn phân định tài sản giữa **Ví Spot** (dùng cho giao ngay, bot) và **Ví Futures** (dùng ký quỹ hợp đồng). Anh/chị có thể bấm nút **Chuyển tiền** tại màn hình Futures hoặc Tài sản để luân chuyển USDT tức thì và hoàn toàn không tốn phí ạ!',
      expression: 'cheerful',
      action: {
        label: 'Đến trang Tài sản / Ví',
        path: '/assets',
      },
    };
  }

  // Default response
  return {
    text: `Dạ em là Sakura - Trợ lý CSKH của sàn! ✨ Sàn cung cấp đầy đủ các sản phẩm tài chính hiện đại:
• **Spot**: Khớp lệnh tức thì, thanh khoản sâu.
• **Futures**: Đòn bẩy lên tới 20× với bảo vệ thanh lý.
• **Bot & DCA**: Giao dịch tự động kỷ luật.
• **Faucet**: Tặng ngay 1.000 USDT miễn phí trải nghiệm.
• **Thuế tự động**: Minh bạch 0.1% cho lệnh bán.

Anh/chị có thể bấm vào các câu hỏi gợi ý bên dưới hoặc nhắn câu hỏi cụ thể, Sakura rất vui được hỗ trợ ạ!`,
    expression: 'cheerful',
    action: {
      label: 'Khám phá bảng giá thị trường',
      path: '/markets',
    },
  };
}

export const AiAssistantWidget: React.FC<AiAssistantWidgetProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const accountName = user?.name || user?.email?.split('@')[0] || 'bạn';
  const fullGreeting = `Xin chào ${accountName}! Tôi có thể giúp gì cho bạn?`;

  const [isOpen, setIsOpen] = useState(false);
  const [showGreetingBubble, setShowGreetingBubble] = useState(false);
  const [displayedGreeting, setDisplayedGreeting] = useState('');
  const [isHovered, setIsHovered] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'bot',
      text: `Xin chào ${accountName}! ✨ Tôi là Sakura - Trợ lý CSKH của sàn giao dịch. Tôi có thể hỗ trợ bạn nhận 1.000 USDT từ Faucet, hướng dẫn đặt lệnh Spot, đòn bẩy Futures 20x hoặc chính sách thuế 0.1% ạ!`,
      time: 'Vừa xong',
      expression: 'cheerful',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Smooth typewriter effect for greeting bubble after 1.2s
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowGreetingBubble(true);
      setIsSpeaking(true);
      let i = 0;
      setDisplayedGreeting('');
      const interval = setInterval(() => {
        if (i < fullGreeting.length) {
          setDisplayedGreeting(fullGreeting.slice(0, i + 1));
          i++;
        } else {
          clearInterval(interval);
          setTimeout(() => setIsSpeaking(false), 1200);
        }
      }, 35);
      return () => clearInterval(interval);
    }, 1200);

    return () => clearTimeout(timer);
  }, [fullGreeting]);

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
      const response = getSakuraResponse(query);
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'bot',
        text: response.text,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        expression: response.expression,
        action: response.action,
      };
      setMessages((prev) => [...prev, botMsg]);
      setIsTyping(false);
      setIsSpeaking(true);
      setTimeout(() => setIsSpeaking(false), 2400);
    }, 650);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Determine active avatar sprite based on interaction state
  const getActiveAvatarSprite = () => {
    if (isTyping) return SAKURA_SPRITES.thoughtful;
    if (isHovered) return SAKURA_SPRITES.cheerful;
    if (isSpeaking) return SAKURA_SPRITES.explaining;
    return SAKURA_SPRITES.default;
  };

  // Determine active animation class for Sakura's avatar
  const getActiveAnimationClass = () => {
    if (isSpeaking) return 'animate-sakura-talk';
    if (isTyping) return 'animate-anime-float-soft';
    return 'animate-sakura-breathe';
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-auto select-none">
      {/* Speech Bubble Tooltip beside Sakura */}
      {!isOpen && showGreetingBubble && (
        <div className="mb-3 mr-1 relative max-w-xs animate-speech-reveal">
          <div className="relative group bg-[rgba(26,46,64,0.95)] text-white text-xs px-4 py-2.5 rounded-2xl border-2 border-[#FFB7C5]/60 shadow-[0_10px_30px_rgba(255,183,197,0.35)] backdrop-blur-xl flex items-center gap-2.5 cursor-pointer hover:border-[#FFD700] transition-all">
            <span className="w-2 h-2 rounded-full bg-[#FFD700] animate-ping shrink-0" />
            <span 
              onClick={() => { setIsOpen(true); setShowGreetingBubble(false); }}
              className="font-medium text-white leading-relaxed select-none"
            >
              {displayedGreeting}
              <span className="inline-block w-1.5 h-3.5 bg-[#FFB7C5] ml-0.5 animate-pulse" />
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowGreetingBubble(false);
              }}
              className="text-[#FFB7C5]/70 hover:text-white p-0.5 ml-1 transition-colors rounded-full"
              title="Đóng thông báo"
            >
              <X size={13} />
            </button>
            {/* Bubble arrow pointing down */}
            <div className="absolute -bottom-2 right-7 w-3.5 h-3.5 bg-[rgba(26,46,64,0.95)] border-r-2 border-b-2 border-[#FFB7C5]/60 transform rotate-45" />
          </div>
        </div>
      )}

      {/* Main Chat Drawer / Window */}
      {isOpen && (
        <div className="mb-4 w-[400px] max-w-[calc(100vw-32px)] h-[570px] max-h-[calc(100vh-110px)] rounded-3xl bg-[rgba(15,26,36,0.96)] border-2 border-[#FFB7C5]/40 shadow-[0_25px_60px_-10px_rgba(0,0,0,0.9),0_0_35px_rgba(255,183,197,0.2)] backdrop-blur-2xl flex flex-col overflow-hidden animate-chat-pop">
          {/* Header */}
          <div className="px-5 py-3.5 bg-gradient-to-r from-[#1A2E40] via-[#243B53] to-[#1A2E40] border-b border-[#FFD700]/30 flex items-center justify-between shadow-md">
            <div className="flex items-center gap-3">
              {/* Sakura Chibi Avatar in Header */}
              <div 
                className="relative w-10 h-10 rounded-full bg-[#0C1729] border-2 border-[#FFD700] flex items-center justify-center overflow-hidden shadow-inner shrink-0"
                title="Sakura Trợ lý CSKH ✨"
              >
                <img 
                  src="/sakura/sakura-chibi-avatar.png" 
                  alt="Sakura CSKH" 
                  className={`w-full h-full object-cover ${getActiveAnimationClass()}`}
                />
                {/* Active Green Dot */}
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#1fc27a] border-2 border-[#0C1729] rounded-full" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-bold text-white font-display tracking-wide">Sakura</h3>
                  <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-[#FFD700] text-[#1A2E40] tracking-wider uppercase">
                    SUPPORT
                  </span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-[#FFB7C5]/20 text-[#FFB7C5]">
                    24/7
                  </span>
                  {/* Voice Equalizer animation when speaking or thinking */}
                  {(isSpeaking || isTyping) && (
                    <div className="flex items-end gap-0.5 h-3 ml-1 px-1 py-0.5 rounded bg-[#FFD700]/10 border border-[#FFD700]/30" title="Sakura đang trả lời...">
                      <span className="w-0.5 h-2 bg-[#FFD700] animate-pulse" />
                      <span className="w-0.5 h-3 bg-[#FFB7C5] animate-pulse [animation-delay:0.15s]" />
                      <span className="w-0.5 h-1.5 bg-[#FFD700] animate-pulse [animation-delay:0.3s]" />
                      <span className="w-0.5 h-2.5 bg-pink-400 animate-pulse [animation-delay:0.45s]" />
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-pink-200/80 flex items-center gap-1 font-medium mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1fc27a] animate-pulse" />
                  {isSpeaking ? 'Đang giải đáp cho bạn...' : isTyping ? 'Đang suy nghĩ câu trả lời...' : 'Trợ lý CSKH & Giao dịch'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setMessages([
                  {
                    id: Date.now().toString(),
                    sender: 'bot',
                    text: 'Dạ lịch sử trò chuyện đã được làm mới. Em có thể hỗ trợ gì cho anh/chị ạ? ✨',
                    time: 'Vừa xong',
                    expression: 'cheerful',
                  }
                ])}
                className="p-1.5 rounded-lg text-pink-200/60 hover:text-white hover:bg-white/10 transition-colors"
                title="Làm mới cuộc trò chuyện"
              >
                <RefreshCw size={14} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-pink-200/60 hover:text-white hover:bg-white/10 transition-colors"
                title="Đóng cửa sổ"
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs leading-relaxed">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-2.5 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.sender === 'bot' && (
                  <div className="w-8 h-8 rounded-full bg-[#0C1729] border border-[#FFD700]/70 flex items-center justify-center shrink-0 mt-0.5 overflow-hidden shadow-sm">
                    <img 
                      src="/sakura/sakura-chibi-avatar.png" 
                      alt="Sakura" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                    m.sender === 'user'
                      ? 'bg-gradient-to-r from-pink-500 via-rose-500 to-indigo-600 text-white rounded-br-none shadow-md shadow-pink-500/20'
                      : 'bg-[#1A2E40]/80 border border-white/10 text-white rounded-tl-none shadow-sm'
                  }`}
                >
                  <p className="whitespace-pre-line select-text leading-relaxed">{m.text}</p>
                  {m.action && (
                    <button
                      onClick={() => {
                        onNavigate(m.action!.path);
                        setIsOpen(false);
                      }}
                      className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FFD700]/20 hover:bg-[#FFD700]/30 border border-[#FFD700]/50 text-[#FFD700] font-bold transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
                    >
                      <span>{m.action.label}</span>
                      <ChevronRight size={14} />
                    </button>
                  )}
                  <span className={`block text-[9px] mt-1.5 text-right ${m.sender === 'user' ? 'text-white/70' : 'text-pink-200/50'}`}>
                    {m.time}
                  </span>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-2.5 items-center">
                <div className="w-8 h-8 rounded-full bg-[#0C1729] border border-[#FFD700]/70 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                  <img 
                    src="/sakura/sakura-chibi-avatar.png" 
                    alt="Sakura suy nghĩ" 
                    className="w-full h-full object-cover animate-anime-float-soft"
                  />
                </div>
                <div className="bg-[#1A2E40]/80 border border-white/10 px-3.5 py-2 rounded-2xl rounded-tl-none flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FFB7C5] typing-dot-1" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FFD700] typing-dot-2" />
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-400 typing-dot-3" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestions Pills */}
          <div className="px-3 py-2 border-t border-white/[0.08] bg-[#0F1A24]/60 overflow-x-auto flex gap-1.5 no-scrollbar">
            {INITIAL_SUGGESTIONS.map((s, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(s.prompt)}
                className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1A2E40]/90 hover:bg-[#2A4365] border border-[#FFB7C5]/30 hover:border-[#FFD700] text-[11px] text-pink-100 hover:text-white transition-all cursor-pointer active:scale-95 shadow-sm"
              >
                <s.icon size={12} className="text-[#FFD700]" />
                <span>{s.text}</span>
              </button>
            ))}
          </div>

          {/* Message Input Box */}
          <div className="p-3 border-t border-[#FFD700]/20 bg-[#0F1A24]/90">
            <div className="flex items-center gap-2 bg-[#1A2E40] border border-[#FFB7C5]/30 rounded-2xl px-3 py-1.5 focus-within:border-[#FFD700] transition-all">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Hỏi Sakura về Spot, Futures, Faucet, Thuế..."
                className="flex-1 bg-transparent text-xs text-white placeholder-pink-200/40 outline-none py-1"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={!inputValue.trim() || isTyping}
                className="p-1.5 rounded-xl bg-gradient-to-r from-[#FFB7C5] via-pink-500 to-[#FFD700] hover:opacity-90 text-[#1A2E40] font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 cursor-pointer shadow-md shadow-pink-500/20"
                title="Gửi tin nhắn cho Sakura"
              >
                <Send size={13} className="text-[#1A2E40]" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Animated Sakura Chibi Mascot Button */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          setShowGreetingBubble(false);
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label="Sakura - Trợ lý CSKH Sàn Giao Dịch"
        className="relative group cursor-pointer focus:outline-none transition-all duration-300 hover:scale-105 active:scale-95"
      >
        {/* Floating Sakura Petals Animation when hovered */}
        {isHovered && (
          <div className="absolute -top-7 -left-3 pointer-events-none select-none z-30">
            <span className="absolute animate-sakura-petal-1 text-sm">🌸</span>
            <span className="absolute left-6 animate-sakura-petal-2 text-xs">🌸</span>
            <span className="absolute left-10 animate-sakura-petal-3 text-xs">✨</span>
          </div>
        )}

        {/* Ambient Fintech Gold/Pink Glow */}
        <span className="absolute -inset-1.5 rounded-full bg-gradient-to-tr from-[#FFB7C5] via-[#FFD700] to-[#1A2E40] opacity-60 blur-md group-hover:opacity-90 transition-opacity pointer-events-none" />

        {/* Sakura Chibi Avatar Circle */}
        <div className="relative w-16 h-16 rounded-full bg-gradient-to-b from-[#1E3348] via-[#12202E] to-[#0A131E] border-2 border-[#FFD700] shadow-[0_10px_35px_rgba(255,183,197,0.5),0_0_20px_rgba(255,215,0,0.4)] flex items-center justify-center overflow-hidden">
          <img 
            src="/sakura/sakura-chibi-avatar.png" 
            alt="Sakura Chibi Mascot" 
            className="w-full h-full object-cover select-none pointer-events-none transform transition-transform duration-300 group-hover:scale-110"
          />

          {/* Micro microphone pulse wave when speaking */}
          {isSpeaking && (
            <span className="absolute bottom-2.5 right-2.5 w-2.5 h-2.5 rounded-full bg-cyan-400 opacity-80 animate-sakura-mic-wave pointer-events-none" />
          )}
        </div>

        {/* Gold SUPPORT Badge */}
        <div className="absolute -bottom-1.5 left-1/2 transform -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-[#0B1520] border border-[#FFD700] shadow-md flex items-center justify-center pointer-events-none">
          <span className="text-[8.5px] font-black tracking-widest text-[#FFD700]">SUPPORT</span>
        </div>

        {/* Active Online Ping Dot */}
        <div className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#1fc27a] border-2 border-[#0B1520] shadow-sm flex items-center justify-center pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
        </div>
      </button>
    </div>
  );
};
