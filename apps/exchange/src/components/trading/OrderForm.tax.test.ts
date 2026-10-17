import { describe, it, expect } from 'vitest';
import { dec, roundUp } from '@cex/core';
import { formatDecimal } from '@cex/ui';

describe('S-03 Spot Trading Fee and Tax Line Logic', () => {
  const formatFeeRatePercent = (rate: string | null | undefined): string => {
    const effective = rate ?? '0.001';
    try {
      return `${formatDecimal(dec(effective).mul(100).toString(), { locale: 'vi', trimTrailingZeros: true })}%`;
    } catch {
      return '0,1%';
    }
  };

  const formatTaxRatePercent = (rate: string | null | undefined): string => {
    const effective = rate ?? '0.001';
    try {
      return `${formatDecimal(dec(effective).mul(100).toString(), { locale: 'vi', trimTrailingZeros: true })}%`;
    } catch {
      return '0,1%';
    }
  };

  describe('Fee Rate and Tax Rate Formatting', () => {
    it('formats standard 0.1% rate in Vietnamese locale', () => {
      expect(formatFeeRatePercent('0.001')).toBe('0,1%');
      expect(formatTaxRatePercent('0.001')).toBe('0,1%');
    });

    it('formats custom rates correctly', () => {
      expect(formatFeeRatePercent('0.002')).toBe('0,2%');
      expect(formatFeeRatePercent('0.0005')).toBe('0,05%');
      expect(formatTaxRatePercent('0.0015')).toBe('0,15%');
    });

    it('falls back to default 0,1% on invalid or missing rate', () => {
      expect(formatFeeRatePercent(null)).toBe('0,1%');
      expect(formatFeeRatePercent(undefined)).toBe('0,1%');
      expect(formatTaxRatePercent(null)).toBe('0,1%');
    });
  });

  describe('Spot Tax Line Content Logic', () => {
    const getTaxLineInfo = (params: {
      side: 'BUY' | 'SELL';
      taxMode: 'OFF' | 'WITHHOLD';
      isDomesticOrg: boolean;
      hasQuantity: boolean;
      taxRate?: string;
    }) => {
      const taxRatePercent = formatTaxRatePercent(params.taxRate);

      if (params.side === 'BUY') {
        return {
          label: `Thuế (${taxRatePercent}):`,
          value: '0 — chỉ khấu trừ khi bán',
        };
      }

      if (params.taxMode === 'OFF') {
        return {
          label: 'Thuế:',
          value: 'không áp dụng (sàn đang tắt)',
        };
      }

      if (params.isDomesticOrg) {
        return {
          label: 'Thuế:',
          value: '0 — tổ chức trong nước tự kê khai',
        };
      }

      if (!params.hasQuantity) {
        return {
          label: `Thuế (${taxRatePercent}):`,
          value: 'ước tính khi nhập khối lượng',
        };
      }

      return {
        label: `Thuế ước tính (${taxRatePercent}):`,
        value: 'calculated',
      };
    };

    it('renders BUY tab tax line with 0 — chỉ khấu trừ khi bán', () => {
      const info = getTaxLineInfo({ side: 'BUY', taxMode: 'WITHHOLD', isDomesticOrg: false, hasQuantity: true });
      expect(info.label).toBe('Thuế (0,1%):');
      expect(info.value).toBe('0 — chỉ khấu trừ khi bán');
    });

    it('renders SELL tab with taxMode OFF', () => {
      const info = getTaxLineInfo({ side: 'SELL', taxMode: 'OFF', isDomesticOrg: false, hasQuantity: true });
      expect(info.label).toBe('Thuế:');
      expect(info.value).toBe('không áp dụng (sàn đang tắt)');
    });

    it('renders SELL tab with DOMESTIC_ORG taxpayer', () => {
      const info = getTaxLineInfo({ side: 'SELL', taxMode: 'WITHHOLD', isDomesticOrg: true, hasQuantity: true });
      expect(info.label).toBe('Thuế:');
      expect(info.value).toBe('0 — tổ chức trong nước tự kê khai');
    });

    it('renders SELL tab when quantity is not yet entered', () => {
      const info = getTaxLineInfo({ side: 'SELL', taxMode: 'WITHHOLD', isDomesticOrg: false, hasQuantity: false });
      expect(info.label).toBe('Thuế (0,1%):');
      expect(info.value).toBe('ước tính khi nhập khối lượng');
    });
  });

  describe('Spot SELL Tax Breakdown Calculations', () => {
    it('calculates gross, fee, tax, and net accurately for SELL orders', () => {
      const price = dec('80000');
      const quantity = dec('0.5');
      const feeRate = dec('0.001');
      const taxRate = dec('0.001');

      const gross = price.mul(quantity);
      const fee = roundUp(gross.mul(feeRate));
      const tax = roundUp(gross.mul(taxRate));
      const net = gross.sub(fee).sub(tax);

      expect(gross.toString()).toBe('40000');
      expect(fee.toString()).toBe('40');
      expect(tax.toString()).toBe('40');
      expect(net.toString()).toBe('39920');
      expect(net.add(fee).add(tax).toString()).toBe(gross.toString());
    });
  });
});
