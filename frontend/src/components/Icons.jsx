import {
  Smartphone, Wallet, KeyRound, Backpack, Shirt, FileText, Gem, PawPrint,
  Puzzle, Trophy, Package,
} from 'lucide-react';

const CAT_ICONS = {
  electronics: Smartphone, wallet: Wallet, keys: KeyRound, bags: Backpack,
  clothing: Shirt, documents: FileText, jewelry: Gem, pets: PawPrint,
  toys: Puzzle, sports: Trophy, other: Package,
};

export function CatIcon({ category, size = 18, ...rest }) {
  const C = CAT_ICONS[category] ?? Package;
  return <C size={size} strokeWidth={1.75} aria-hidden="true" {...rest} />;
}