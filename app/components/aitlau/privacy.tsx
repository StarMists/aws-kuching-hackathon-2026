'use client';

import { Info, ShieldCheck } from 'lucide-react';
import type { RuntimeConfig } from '@/lib/contracts';

export function DataAcknowledgement({ config, checked, onChange }: { config: RuntimeConfig | null; checked: boolean; onChange: (value: boolean) => void }) {
  if (config?.data_policy !== 'public-synthetic-only') return null;
  return <div className="data-acknowledgement"><div><Info size={15} /><p>{String(config.data_policy_notice || 'Free-tier model prompts may be used to improve the provider’s products. Only submit public or synthetic source material and prompts.')}</p></div><label><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /><span>I confirm these sources and this prompt are public or synthetic.</span></label></div>;
}

export function needsAcknowledgement(config: RuntimeConfig | null) { return config?.data_policy === 'public-synthetic-only'; }
