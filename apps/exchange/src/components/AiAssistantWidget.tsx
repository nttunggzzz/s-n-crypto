import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Send, Sparkles, ArrowRight, MessageSquare, 
  HelpCircle, RefreshCw, Zap, TrendingUp, ShieldCheck, 
  Coins, ChevronDown, CheckCircle2, ChevronRight, User
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

/**
 * Exquisite SVG Anime Girl Character (AI Concierge - Mai Linh)
 * Featuring: V-line face, sparkling anime eyes with winking animation,
 * warm welcoming smile, blushing cheeks, silky hair with angel-ring shine,
 * cyberpunk fintech headset with pulsing LED & mic, and friendly waving hand!
 */
export const AnimeGirlAvatar: React.FC<{
  className?: string;
  idPrefix?: string;
  wavingHand?: boolean;
}> = ({ className = 'w-full h-full', idPrefix = 'ag', wavingHand = true }) => {
  const p = (name: string) => `${idPrefix}_${name}`;

  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* Hair Gradient: Cyber Lavender to Deep Indigo/Magenta */}
        <linearGradient id={p('hairGrad')} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="45%" stopColor="#6366f1" />
          <stop offset="80%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>

        {/* Soft porcelain anime skin */}
        <linearGradient id={p('skinGrad')} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fff8f5" />
          <stop offset="60%" stopColor="#ffede5" />
          <stop offset="100%" stopColor="#ffdcd2" />
        </linearGradient>

        {/* Sparkling Anime Eyes Gradient (HoYoverse/Genshin style cyan-violet glow) */}
        <linearGradient id={p('eyeIrisGrad')} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="35%" stopColor="#38bdf8" />
          <stop offset="85%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#a7f3d0" />
        </linearGradient>

        {/* Cyberpunk Fintech Headset & Glow */}
        <linearGradient id={p('headsetGrad')} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ec4899" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>

        {/* CEX Concierge Blazer / Uniform */}
        <linearGradient id={p('suitGrad')} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1e1b4b" />
          <stop offset="60%" stopColor="#172554" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>

        {/* Glossy Hair Shine Band (Tenshi no wa / Angel ring) */}
        <linearGradient id={p('hairShineGrad')} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="25%" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="50%" stopColor="#fef08a" stopOpacity="0.95" />
          <stop offset="75%" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>

        {/* Cheek Blush Radial Gradient */}
        <radialGradient id={p('blushGrad')}>
          <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.65" />
          <stop offset="70%" stopColor="#fb7185" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#fb7185" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 1. Hair Back Silhouette */}
      <path
        d="M20 40 C14 62 17 84 23 93 C27 96 33 90 35 78 C38 78 62 78 65 78 C67 90 73 96 77 93 C83 84 86 62 80 40 Z"
        fill={`url(#${p('hairGrad')})`}
      />

      {/* 2. Neck & Fintech Uniform */}
      {/* Neck */}
      <path d="M44 55 L44 67 C47 70 53 70 56 67 L56 55 Z" fill={`url(#${p('skinGrad')})`} />
      {/* Neck Shadow under Chin */}
      <path d="M44 55 C48 59 52 59 56 55 C54 58 46 58 44 55 Z" fill="#fca5a5" opacity="0.45" />

      {/* CEX Concierge Blazer / Uniform */}
      <path
        d="M25 88 C26 73 36 67 44 67 L56 67 C64 67 74 73 75 88 L77 100 L23 100 Z"
        fill={`url(#${p('suitGrad')})`}
      />
      {/* White Crisp Inner Collar */}
      <polygon points="44,67 56,67 50,77" fill="#ffffff" />
      {/* Cyberpunk Pink Ribbon / Tie */}
      <polygon points="48.5,74 51.5,74 50.5,83 49.5,83" fill="#ec4899" />
      {/* Lapel Cyber Trim */}
      <path d="M34 71 L44 83 L44 100" stroke="#818cf8" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.8" />
      <path d="M66 71 L56 83 L56 100" stroke="#818cf8" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.8" />
      {/* VIP Gold Badge */}
      <circle cx="36" cy="79" r="2.2" fill="#fbbf24" stroke="#d97706" strokeWidth="0.5" />

      {/* 3. Anime V-line Face */}
      <path
        d="M26 36 C26 21 74 21 74 36 C74 52 63 65 50 66 C37 65 26 52 26 36 Z"
        fill={`url(#${p('skinGrad')})`}
      />

      {/* Blushing Cheeks */}
      <ellipse cx="34" cy="48" rx="6" ry="3.5" fill={`url(#${p('blushGrad')})`} />
      <ellipse cx="66" cy="48" rx="6" ry="3.5" fill={`url(#${p('blushGrad')})`} />
      {/* Cute blush stripes */}
      <line x1="32" y1="47.5" x2="34" y2="49.5" stroke="#f43f5e" strokeWidth="0.8" strokeLinecap="round" opacity="0.7" />
      <line x1="35" y1="47.5" x2="37" y2="49.5" stroke="#f43f5e" strokeWidth="0.8" strokeLinecap="round" opacity="0.7" />
      <line x1="63" y1="47.5" x2="65" y2="49.5" stroke="#f43f5e" strokeWidth="0.8" strokeLinecap="round" opacity="0.7" />
      <line x1="66" y1="47.5" x2="68" y2="49.5" stroke="#f43f5e" strokeWidth="0.8" strokeLinecap="round" opacity="0.7" />

      {/* Cute Anime Nose */}
      <circle cx="50" cy="48.5" r="0.75" fill="#f43f5e" opacity="0.55" />

      {/* Warm Welcoming Smile */}
      <path
        d="M45 53.5 Q50 58.5 55 53.5 Q50 55.5 45 53.5 Z"
        fill="#f43f5e"
      />
      <path
        d="M45.5 53.8 Q50 55.2 54.5 53.8"
        stroke="#ffffff"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
      {/* Lip Corner Dimples */}
      <path d="M44 53 Q43.5 52 43 52.5" stroke="#db2777" strokeWidth="0.8" strokeLinecap="round" fill="none" />
      <path d="M56 53 Q56.5 52 57 52.5" stroke="#db2777" strokeWidth="0.8" strokeLinecap="round" fill="none" />

      {/* 4. Left Eye (Wide sparkling anime eye) */}
      <g>
        {/* Soft Eyebrow */}
        <path d="M30 31 Q36 28 42 31" stroke="#4f46e5" strokeWidth="1.4" strokeLinecap="round" fill="none" />
        {/* Double eyelid crease */}
        <path d="M32 34 Q36 32.5 40 34.5" stroke="#93c5fd" strokeWidth="0.8" fill="none" opacity="0.7" />
        {/* Upper Eyelash line with wing flick */}
        <path d="M29 37.5 Q35.5 32 43 37" stroke="#1e1b4b" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <path d="M41.5 35.8 L44 34.2" stroke="#1e1b4b" strokeWidth="1.6" strokeLinecap="round" />
        {/* Iris */}
        <ellipse cx="36.5" cy="41" rx="4.6" ry="5.8" fill={`url(#${p('eyeIrisGrad')})`} />
        {/* Deep navy pupil */}
        <ellipse cx="36.5" cy="39.8" rx="2.5" ry="3.2" fill="#0f172a" />
        {/* Eye bottom glow crescent */}
        <path d="M33 42 Q36.5 46.5 40 42" stroke="#e0e7ff" strokeWidth="1.3" strokeLinecap="round" fill="none" opacity="0.85" />
        {/* Big sparkling highlight */}
        <circle cx="34.8" cy="38" r="1.7" fill="#ffffff" />
        {/* Small secondary sparkle */}
        <circle cx="38.5" cy="42.8" r="0.85" fill="#ffffff" />
        {/* Micro sparkle */}
        <circle cx="33.8" cy="42" r="0.5" fill="#ffffff" opacity="0.8" />
        {/* Lower eyelash */}
        <path d="M33 45.8 Q36.5 47.2 40 45.8" stroke="#4338ca" strokeWidth="0.9" strokeLinecap="round" fill="none" opacity="0.7" />
      </g>

      {/* 5. Right Eye (Winking animation) */}
      <g className="animate-anime-eye-wink origin-[58.5px_42px]">
        {/* Soft Eyebrow */}
        <path d="M58 31 Q64 28 70 31" stroke="#4f46e5" strokeWidth="1.4" strokeLinecap="round" fill="none" />
        {/* Double eyelid crease */}
        <path d="M60 34.5 Q64 32.5 68 34" stroke="#93c5fd" strokeWidth="0.8" fill="none" opacity="0.7" />
        {/* Upper Eyelash line with wing flick */}
        <path d="M57 37 Q64.5 32 71 37.5" stroke="#1e1b4b" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <path d="M58.5 35.8 L56 34.2" stroke="#1e1b4b" strokeWidth="1.6" strokeLinecap="round" />
        {/* Iris */}
        <ellipse cx="63.5" cy="41" rx="4.6" ry="5.8" fill={`url(#${p('eyeIrisGrad')})`} />
        {/* Deep navy pupil */}
        <ellipse cx="63.5" cy="39.8" rx="2.5" ry="3.2" fill="#0f172a" />
        {/* Eye bottom glow crescent */}
        <path d="M60 42 Q63.5 46.5 67 42" stroke="#e0e7ff" strokeWidth="1.3" strokeLinecap="round" fill="none" opacity="0.85" />
        {/* Big sparkling highlight */}
        <circle cx="61.8" cy="38" r="1.7" fill="#ffffff" />
        {/* Small secondary sparkle */}
        <circle cx="65.5" cy="42.8" r="0.85" fill="#ffffff" />
        {/* Micro sparkle */}
        <circle cx="60.8" cy="42" r="0.5" fill="#ffffff" opacity="0.8" />
        {/* Lower eyelash */}
        <path d="M60 45.8 Q63.5 47.2 67 45.8" stroke="#4338ca" strokeWidth="0.9" strokeLinecap="round" fill="none" opacity="0.7" />
      </g>

      {/* 6. Hair Front: Bangs & Side Locks */}
      {/* Left side curved lock (tóc mai uốn nhẹ) */}
      <path
        d="M24 37 C21 47 22 58 25 64 C26 64 26 59 25 51 C26 45 27 40 26 37 Z"
        fill={`url(#${p('hairGrad')})`}
      />
      {/* Right side curved lock (tóc mai uốn nhẹ) */}
      <path
        d="M74 37 C77 47 76 58 73 64 C72 64 72 59 73 51 C72 45 71 40 72 37 Z"
        fill={`url(#${p('hairGrad')})`}
      />

      {/* Bangs */}
      <path d="M25 33 C27 41 33 45 35 43 C33 39 32 31 29 25 Z" fill={`url(#${p('hairGrad')})`} />
      <path d="M33 21 C35 33 41 41 43 41 C42 35 41 25 39 21 Z" fill={`url(#${p('hairGrad')})`} />
      <path d="M42 21 C44 34 51 43 52 42 C50 34 47 23 45 21 Z" fill={`url(#${p('hairGrad')})`} />
      <path d="M51 21 C54 32 59 40 63 40 C61 32 57 23 54 21 Z" fill={`url(#${p('hairGrad')})`} />
      <path d="M61 24 C65 31 67 39 72 37 C70 29 67 22 63 21 Z" fill={`url(#${p('hairGrad')})`} />

      {/* Glossy Hair Shine Band (Angel Ring) */}
      <ellipse
        cx="50"
        cy="27"
        rx="18"
        ry="3.5"
        fill={`url(#${p('hairShineGrad')})`}
        className="animate-anime-hair-shimmer"
      />
      <circle cx="42" cy="26" r="1" fill="#ffffff" />
      <circle cx="57" cy="27" r="0.8" fill="#ffffff" />

      {/* 7. Cyberpunk / Fintech AI Headset & Mic */}
      {/* Headset Arch */}
      <path
        d="M20 33 C20 13 80 13 80 33"
        stroke="#1e1b4b"
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M21 32 C22 15 78 15 79 32"
        stroke="#818cf8"
        strokeWidth="1.2"
        fill="none"
        opacity="0.9"
      />

      {/* Left Earpiece with Glowing LED Ring */}
      <rect x="15" y="30" width="7" height="13" rx="3.5" fill="#1e1b4b" stroke="#ec4899" strokeWidth="1.4" />
      <circle cx="18.5" cy="36.5" r="2.2" fill="#ec4899" className="animate-anime-headset-pulse" />
      <circle cx="18.5" cy="36.5" r="1" fill="#ffffff" />

      {/* Right Earpiece with Glowing LED Ring */}
      <rect x="78" y="30" width="7" height="13" rx="3.5" fill="#1e1b4b" stroke="#ec4899" strokeWidth="1.4" />
      <circle cx="81.5" cy="36.5" r="2.2" fill="#ec4899" className="animate-anime-headset-pulse" />
      <circle cx="81.5" cy="36.5" r="1" fill="#ffffff" />

      {/* Slim Concierge Microphone Boom */}
      <path
        d="M19 41 C20 52 31 56 41 55"
        stroke="#475569"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      {/* Glowing Mic Tip */}
      <circle cx="42" cy="55" r="2" fill="#38bdf8" className="animate-anime-headset-pulse" />
      <circle cx="42" cy="55" r="0.9" fill="#ffffff" />

      {/* 8. Waving Anime Hand (Hiếu khách & sống động) */}
      {wavingHand && (
        <g className="animate-anime-hand-wave">
          {/* Cuff */}
          <path
            d="M74 76 L82 72 L85 78 L77 82 Z"
            fill="#1e1b4b"
            stroke="#ec4899"
            strokeWidth="0.8"
          />
          {/* Hand Palm & Waving Fingers */}
          <path
            d="M78 72 C76 70 75 64 77 62 C78 60 80 61 80 64 L81 59 C82 57 84 58 84 60 L85 58 C86 56 88 57 88 60 L89 62 C90 61 92 62 91 65 C90 71 87 75 82 76 Z"
            fill={`url(#${p('skinGrad')})`}
            stroke="#f472b6"
            strokeWidth="0.75"
          />
          {/* Finger blush tint */}
          <circle cx="81" cy="61" r="1" fill="#fb7185" opacity="0.6" />
          <circle cx="85" cy="60" r="1" fill="#fb7185" opacity="0.6" />
          <circle cx="88" cy="61" r="1" fill="#fb7185" opacity="0.6" />
          {/* Welcome Sparkle */}
          <path
            d="M91 55 L92 51 L93 55 L97 56 L93 57 L92 61 L91 57 L87 56 Z"
            fill="#fbbf24"
            opacity="0.9"
          />
        </g>
      )}
    </svg>
  );
};

const INITIAL_SUGGESTIONS = [
  { icon: Coins, text: 'Làm sao nhận 1.000 USDT Faucet để test?', prompt: 'Làm sao nhận 1.000 USDT từ Faucet để test?' },
  { icon: TrendingUp, text: 'Hướng dẫn đặt lệnh Spot & chọn cặp', prompt: 'Hướng dẫn giao dịch Spot và cách đặt lệnh Limit, Market' },
  { icon: Zap, text: 'Futures & đòn bẩy hoạt động thế nào?', prompt: 'Futures đòn bẩy 20x, ký quỹ ban đầu và giá thanh lý hoạt động thế nào?' },
  { icon: Sparkles, text: 'Cách tạo Bot lưới (Grid) & DCA định kỳ', prompt: 'Cách tạo Bot lưới và Kế hoạch DCA mua định kỳ' },
  { icon: ShieldCheck, text: 'Chính sách thuế 0.1% & bảo mật 2FA', prompt: 'Chính sách khấu trừ thuế bán Spot và kích hoạt 2FA' },
];

/** Intelligent localized AI answering engine with warm Concierge persona */
function getAiResponse(query: string): { text: string; action?: { label: string; path: string } } {
  const q = query.toLowerCase().trim();

  // 1. Faucet / Nạp tiền ảo
  if (q.includes('faucet') || q.includes('nạp tiền') || q.includes('tiền ảo') || q.includes('nhận usdt') || q.includes('xin tiền') || q.includes('free')) {
    return {
      text: 'Dạ, để nhận tiền thử nghiệm, anh/chị vào mục **Tài sản** (hoặc Ví), bấm nút **Faucet** để nhận ngay **1.000 USDT** hoàn toàn miễn phí nhé! ✨\n\nAnh/chị có thể sử dụng số dư này để mua bán Spot, ký quỹ Futures đòn bẩy hoặc tạo Bot giao dịch tự động. Sau mỗi 24 giờ, hệ thống sẽ mở lại Faucet để anh/chị nhận thêm ạ.',
      action: {
        label: 'Mở trang Tài sản & Faucet',
        path: '/assets',
      },
    };
  }

  // 2. Spot Trading
  if (q.includes('spot') || q.includes('giao ngay') || (q.includes('mua') && q.includes('bán') && !q.includes('futures')) || q.includes('lệnh limit') || q.includes('lệnh market')) {
    return {
      text: 'Dạ, giao dịch **Spot (Giao ngay)** cho phép anh/chị sở hữu trực tiếp các tài sản mã hóa (BTC, ETH, SOL...):\n\n• **Lệnh Giới hạn (Limit)**: Anh/chị chọn mức giá mong muốn, lệnh sẽ treo trên sổ lệnh chờ khớp.\n• **Lệnh Thị trường (Market)**: Khớp ngay lập tức với giá tốt nhất trên thị trường.\n• **Ưu đãi Phí & Thuế**: Phí chỉ từ 0.02% - 0.1%. Thuế chỉ khấu trừ 0.1% khi anh/chị đặt lệnh BÁN (chiều MUA hoàn toàn 0% thuế ạ).\n\nEm mời anh/chị bấm nút bên dưới để trải nghiệm ngay nhé! ✨',
      action: {
        label: 'Đến sàn giao dịch Spot',
        path: '/trade/BTCUSDT',
      },
    };
  }

  // 3. Futures & Đòn bẩy
  if (q.includes('futures') || q.includes('đòn bẩy') || q.includes('leverage') || q.includes('long') || q.includes('short') || q.includes('ký quỹ') || q.includes('thanh lý') || q.includes('funding')) {
    return {
      text: 'Dạ, giao dịch **Futures (Hợp đồng tương lai)** giúp anh/chị tối ưu hóa lợi nhuận cả 2 chiều thị trường:\n\n• **Mở Long**: Khi anh/chị kỳ vọng giá coin sẽ tăng.\n• **Mở Short**: Khi anh/chị nhận định giá sẽ giảm.\n• **Đòn bẩy linh hoạt**: Hỗ trợ đòn bẩy tối đa lên tới 20×. Em khuyên anh/chị chú ý tỷ lệ ký quỹ để đảm bảo vị thế an toàn trước Giá thanh lý nhé.\n• **Phí Funding**: Được luân chuyển giữa bên Long và Short mỗi 8 giờ.\n\n*Lưu ý nhỏ: Anh/chị hãy chuyển USDT từ ví Spot sang ví Futures trước khi mở vị thế nhé ạ!* ✨',
      action: {
        label: 'Trải nghiệm Futures đòn bẩy',
        path: '/futures/BTCUSDT',
      },
    };
  }

  // 4. Bot giao dịch & DCA
  if (q.includes('bot') || q.includes('lưới') || q.includes('grid') || q.includes('dca') || q.includes('tự động') || q.includes('định kỳ')) {
    return {
      text: 'Dạ, hệ thống sàn hỗ trợ 2 chiến lược giao dịch tự động thông minh dành cho anh/chị:\n\n1. **Grid Bot (Bot lưới Spot)**: Tự động rải lệnh mua thấp bán cao liên tục theo biên độ giá anh/chị cài đặt, tối ưu hóa lợi nhuận khi thị trường đi ngang.\n2. **Kế hoạch DCA (Mua định kỳ)**: Tự động gom coin đều đặn theo giờ/ngày/tuần, giúp bình quân giá vốn hiệu quả mà không tốn thời gian canh bảng điện.\n\nAnh/chị muốn em đưa tới trang quản lý Bot ngay không ạ? ✨',
      action: {
        label: 'Tạo Bot giao dịch ngay',
        path: '/bots',
      },
    };
  }

  // 5. Thuế Crypto
  if (q.includes('thuế') || q.includes('tax') || q.includes('khấu trừ') || q.includes('chiết khấu')) {
    return {
      text: 'Dạ, cơ chế **Thuế giao dịch tiền mã hóa** trên sàn được triển khai minh bạch và tự động:\n\n• **Tự động bật khấu trừ thuế 0.1%**: Sàn tự động bật tính năng khấu trừ thuế 0.1% cho mọi lệnh BÁN Spot theo quy định thử nghiệm (chiều MUA hoàn toàn miễn thuế 0%).\n• **Xem trước minh bạch**: User có thể xem trước chi tiết số tiền thuế bị khấu trừ và số tiền thực nhận ngay trên form đặt lệnh trước khi bấm Xác nhận.\n• **Tổ chức trong nước (DOMESTIC_ORG)**: Tự kê khai độc lập, sàn không trích khấu trừ.\n• Anh/chị có thể tra cứu chi tiết và tải file CSV sao kê tại trang "Thuế của tôi" bất cứ lúc nào ạ. ✨',
      action: {
        label: 'Xem báo cáo thuế của tôi',
        path: '/account/tax',
      },
    };
  }

  // 6. 2FA & Bảo mật
  if (q.includes('2fa') || q.includes('bảo mật') || q.includes('mật khẩu') || q.includes('google') || q.includes('authenticator') || q.includes('xác minh')) {
    return {
      text: 'Dạ, để bảo vệ tài khoản an toàn tuyệt đối, em khuyến nghị anh/chị bật **Xác thực 2 yếu tố (2FA)** bằng Google Authenticator trong mục Cài đặt -> Bảo mật.\n\nKhi kích hoạt, mọi thao tác đăng nhập hoặc rút tiền đều sẽ cần mã OTP 6 số bảo vệ, giúp tài sản của anh/chị luôn an tâm tuyệt đối ạ! ✨',
      action: {
        label: 'Đi tới Cài đặt bảo mật',
        path: '/settings',
      },
    };
  }

  // 7. Chuyển tiền giữa các ví
  if (q.includes('chuyển') || q.includes('transfer') || q.includes('ví') || q.includes('wallet')) {
    return {
      text: 'Dạ, sàn phân định tài sản giữa **Ví Spot** (dùng cho giao dịch giao ngay, bot) và **Ví Futures** (dùng ký quỹ đòn bẩy). Anh/chị chỉ cần bấm nút **Chuyển tiền** tại màn hình Futures hoặc Tài sản là có thể luân chuyển USDT tức thì và hoàn toàn 0đ phí ạ! ✨',
      action: {
        label: 'Đến trang Tài sản / Ví',
        path: '/assets',
      },
    };
  }

  // Default response
  return {
    text: `Dạ, cảm ơn anh/chị đã trò chuyện cùng em! ✨ Em luôn trực tuyến 24/7 để hỗ trợ anh/chị mọi tính năng trên sàn:
• **Spot**: Giao dịch giao ngay tức thì.
• **Futures**: Đòn bẩy lên tới 20× với bảo vệ thanh lý.
• **Bot & DCA**: Tự động hóa chiến lược tài chính.
• **Faucet**: Cấp 1.000 USDT miễn phí để anh/chị trải nghiệm.

Anh/chị có thể bấm vào một trong các câu hỏi gợi ý bên dưới hoặc gõ câu hỏi cụ thể để em hướng dẫn chi tiết nhé ạ! ✨`,
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
      text: 'Xin chào anh/chị! Em là Mai Linh - Trợ lý AI Concierge của sàn giao dịch. ✨\n\nEm rất vui được đồng hành cùng anh/chị! Em có thể hướng dẫn nhận 1.000 USDT Faucet miễn phí, cách giao dịch Spot, đòn bẩy Futures 20x, cài đặt Bot tự động hay giải đáp chính sách thuế. Anh/chị cần em hỗ trợ điều gì hôm nay ạ?',
      time: 'Vừa xong',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fullGreeting = 'Xin chào! Em có thể giúp gì cho anh/chị hôm nay? ✨';

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
      {/* Speech Bubble Tooltip beside Mai Linh */}
      {!isOpen && showGreetingBubble && (
        <div className="mb-3 mr-1 relative max-w-xs animate-speech-reveal">
          <div className="relative group bg-[rgba(15,18,25,0.94)] text-white text-xs px-4 py-2.5 rounded-2xl border border-pink-400/40 shadow-[0_10px_25px_-5px_rgba(244,114,182,0.35)] backdrop-blur-xl flex items-center gap-2 cursor-pointer hover:border-pink-400 transition-all">
            <Sparkles size={14} className="text-pink-400 shrink-0 animate-pulse" />
            <span 
              onClick={() => { setIsOpen(true); setShowGreetingBubble(false); }}
              className="font-medium text-[var(--text,#f4f4f5)] leading-relaxed select-none"
            >
              {displayedGreeting}
              <span className="inline-block w-1.5 h-3.5 bg-pink-400 ml-0.5 animate-pulse" />
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
            <div className="absolute -bottom-1.5 right-6 w-3 h-3 bg-[rgba(15,18,25,0.94)] border-r border-b border-pink-400/40 transform rotate-45" />
          </div>
        </div>
      )}

      {/* Main Chat Drawer / Window */}
      {isOpen && (
        <div className="mb-4 w-[390px] max-w-[calc(100vw-32px)] h-[560px] max-h-[calc(100vh-120px)] rounded-3xl bg-[rgba(13,15,22,0.95)] border border-pink-500/20 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] backdrop-blur-2xl flex flex-col overflow-hidden animate-chat-pop">
          {/* Header */}
          <div className="px-5 py-3.5 bg-gradient-to-r from-[rgba(35,22,46,0.95)] via-[rgba(22,20,38,0.95)] to-[rgba(15,18,26,0.95)] border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Mini Animated Anime Girl Avatar in Header */}
              <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-500/20 via-purple-500/20 to-indigo-500/30 border border-pink-400/50 flex items-center justify-center overflow-hidden shadow-inner">
                <AnimeGirlAvatar idPrefix="hdr" wavingHand={false} className="w-full h-full transform scale-110 translate-y-1" />
                {/* Active Green Dot */}
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[var(--up,#1fc27a)] border-2 border-[var(--panel,#0a0a0b)] rounded-full animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5 font-display">
                  <span>Trợ lý AI - Mai Linh (AI Concierge)</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30">
                    VIP
                  </span>
                </h3>
                <p className="text-[11px] text-[var(--text-3,#63636b)] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--up,#1fc27a)] animate-pulse" />
                  <span>Trực tuyến 24/7 · Niềm nở giải đáp thắc mắc</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setMessages([
                  {
                    id: Date.now().toString(),
                    sender: 'bot',
                    text: 'Dạ, lịch sử trò chuyện đã được làm mới! Em là Mai Linh, em có thể hỗ trợ gì cho anh/chị ạ? ✨',
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
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs leading-relaxed">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-2.5 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.sender === 'bot' && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-pink-500/20 to-indigo-500/20 border border-pink-400/40 flex items-center justify-center shrink-0 mt-0.5 overflow-hidden shadow-sm">
                    <AnimeGirlAvatar idPrefix={`msg_${m.id}`} wavingHand={false} className="w-full h-full transform scale-120 translate-y-1" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                    m.sender === 'user'
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-br-none shadow-md shadow-indigo-500/15'
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
                      className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-pink-500/20 to-indigo-500/20 hover:from-pink-500/30 hover:to-indigo-500/30 border border-pink-400/40 text-pink-300 font-semibold transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
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
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-pink-500/20 to-indigo-500/20 border border-pink-400/40 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                  <AnimeGirlAvatar idPrefix="typing" wavingHand={false} className="w-full h-full transform scale-120 translate-y-1" />
                </div>
                <div className="bg-white/[0.05] border border-white/[0.08] px-3.5 py-2 rounded-2xl rounded-tl-none flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-400 typing-dot-1" />
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-400 typing-dot-2" />
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-400 typing-dot-3" />
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
                className="whitespace-nowrap flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-pink-500/10 border border-white/[0.08] hover:border-pink-500/30 text-[11px] text-[var(--text-2,#a1a1aa)] hover:text-pink-300 transition-all cursor-pointer active:scale-95"
              >
                <s.icon size={11} className="text-pink-400" />
                <span>{s.text}</span>
              </button>
            ))}
          </div>

          {/* Message Input Box */}
          <div className="p-3 border-t border-white/10 bg-black/40">
            <div className="flex items-center gap-2 bg-white/[0.06] border border-white/10 rounded-2xl px-3 py-1.5 focus-within:border-pink-400/60 transition-all">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Hỏi Mai Linh về nạp tiền, Spot, Futures, Bot..."
                className="flex-1 bg-transparent text-xs text-white placeholder-[var(--text-3,#63636b)] outline-none py-1"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={!inputValue.trim() || isTyping}
                className="p-1.5 rounded-xl bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-600 hover:to-indigo-700 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 cursor-pointer shadow-sm shadow-pink-500/30"
                title="Gửi tin nhắn"
              >
                <Send size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Animated Anime Girl Button */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          setShowGreetingBubble(false);
        }}
        aria-label="Trợ lý AI Mai Linh - Niềm nở hỗ trợ giao dịch"
        className="relative group p-1.5 rounded-full cursor-pointer focus:outline-none transition-transform hover:scale-105 active:scale-95"
      >
        {/* Radar Wave Pulse Background */}
        <span className="absolute inset-0 rounded-full bg-gradient-to-tr from-pink-500 to-indigo-500 opacity-25 animate-radar-ripple pointer-events-none" />
        <span className="absolute -inset-1 rounded-full bg-gradient-to-tr from-pink-500 via-purple-500 to-indigo-500 opacity-60 blur-md group-hover:opacity-100 transition-opacity pointer-events-none" />

        {/* Anime Girl Avatar Body Circle */}
        <div className="relative w-16 h-16 rounded-full bg-gradient-to-b from-[#2e1d42] via-[#1a172e] to-[#0d0f17] border-2 border-pink-400/80 shadow-[0_8px_30px_rgba(244,114,182,0.4)] flex items-center justify-center overflow-hidden animate-anime-float-soft">
          <AnimeGirlAvatar idPrefix="btn" wavingHand={true} className="w-full h-full transform scale-110 translate-y-1" />
        </div>

        {/* AI Sparkling Badge */}
        <div className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-pink-500 to-indigo-600 border border-white/80 shadow-md flex items-center gap-0.5 animate-pulse">
          <Sparkles size={9} className="text-yellow-300" />
          <span className="text-[9px] font-black tracking-wider text-white">AI</span>
        </div>
      </button>
    </div>
  );
};
