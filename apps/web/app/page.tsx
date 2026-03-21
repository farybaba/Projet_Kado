import { redirect } from 'next/navigation';

// Page racine — redirige vers le portefeuille bénéficiaire par défaut
export default function RootPage() {
  redirect('/app/login');
}
