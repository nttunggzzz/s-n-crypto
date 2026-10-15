import React, { useEffect, useRef, useState } from 'react';
import { formatPrice } from './format.ts';

export interface PriceTextProps {
  price: string | null | undefined;
  tickSize?: string;
  locale?: 'vi' | 'en';
  colored?: boolean;
  flash?: boolean;
  className?: string;
}

export const PriceText: React.FC<PriceTextProps> = ({
  price,
  tickSize,
  locale = 'vi',
  colored = false,
  flash = true,
  className = '',
}) => {
  const prevPriceRef = useRef<string | null | undefined>(price);
  const [flashClass, setFlashClass] = useState<'flash-up' | 'flash-down' | ''>('');

  useEffect(() => {
    if (!flash || !price || !prevPriceRef.current || price === prevPriceRef.current) {
      prevPriceRef.current = price;
      return;
    }

    // Compare string prices numerically without float rounding issues
    const prev = prevPriceRef.current;
    prevPriceRef.current = price;

    if (price > prev) {
      setFlashClass('flash-up');
    } else if (price < prev) {
      setFlashClass('flash-down');
    }

    const timer = setTimeout(() => setFlashClass(''), 600);
    return () => clearTimeout(timer);
  }, [price, flash]);

  if (price === null || price === undefined) {
    return <span className={`tabular-nums text-[var(--color-text-muted,#6b7280)] ${className}`}>—</span>;
  }

  const formatted = formatPrice(price, tickSize, locale);

  let textColor = 'text-[var(--color-text-primary,#f3f4f6)]';
  if (colored && flashClass === 'flash-up') {
    textColor = 'text-[var(--color-buy,#22c55e)]';
  } else if (colored && flashClass === 'flash-down') {
    textColor = 'text-[var(--color-sell,#f87171)]';
  }

  return (
    <span
      className={`tabular-nums font-mono transition-colors duration-300 inline-block px-1 rounded-[2px] ${textColor} ${flashClass} ${className}`}
    >
      {formatted}
    </span>
  );
};
