'use client';

import { useState, useEffect, useRef } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

const CATEGORY_LABELS: Record<string, string> = {
  GENERAL:   'Général',
  FOOD:      'Alimentation',
  MOBILITY:  'Mobilité',
  HEALTH:    'Santé',
  RETAIL:    'Commerce',
  EDUCATION: 'Éducation',
};

const SAAS_PRICES: Record<string, string> = {
  STANDARD: '75 000',
  PREMIUM:  '150 000',
};

interface DocCompany {
  id: string; name: string; siren: string | null; email: string | null;
  phone: string | null; address: string | null; plan: string; status: string;
}

interface DocMerchant {
  id: string; name: string; category: string;
  phone: string | null; address: string | null; status: string;
}

interface GeneratedDoc {
  id: string; type: string; entityName: string; generatedAt: Date; filename: string;
}

// ── Article helpers ────────────────────────────────────────────────────────────

function getArticles(type: 'eme' | 'saas' | 'avenant', company: DocCompany, duration: string) {
  if (type === 'eme') {
    return [
      { title: 'Article 1 — Objet', content: `La présente convention a pour objet de définir les conditions dans lesquelles KADO SAS confie à ${company.name} la distribution de titres cadeaux dématérialisés (ci-après « Bons Kado ») à destination des salariés et collaborateurs de ${company.name}.` },
      { title: 'Article 2 — Opérateur de Monnaie Électronique', content: "KADO SAS agit en qualité de distributeur agréé d'un Établissement de Monnaie Électronique (EME) autorisé par la BCEAO. Les fonds reçus de l'Entreprise sont logés dans un compte de provision ségrégué, conformément à la réglementation UEMOA en vigueur." },
      { title: "Article 3 — Obligations de l'Entreprise", content: "L'Entreprise s'engage à : (i) alimenter son compte de provision préalablement à toute émission de Bons Kado ; (ii) utiliser les Bons Kado exclusivement à des fins d'avantages salariaux légaux ; (iii) respecter les plafonds légaux en vigueur (limite IRPP)." },
      { title: 'Article 4 — Commission et tarification', content: 'KADO SAS perçoit une commission de 2 % (deux pour cent) sur chaque transaction de validation de Bon Kado effectuée chez un commerçant partenaire. Cette commission est prélevée automatiquement et déduite du montant reversé au commerçant.' },
      { title: 'Article 5 — Durée', content: `La présente convention est conclue pour une durée de ${duration} mois à compter de la date de signature, renouvelable par tacite reconduction sauf dénonciation par l'une des parties avec un préavis de 30 jours.` },
      { title: 'Article 6 — Confidentialité et données personnelles', content: "Les parties s'engagent à traiter les données personnelles des bénéficiaires conformément au Règlement sur la Protection des Données Personnelles de l'UEMOA et à la loi n°2008-12 du Sénégal sur la protection des données personnelles." },
    ];
  } else if (type === 'saas') {
    const price = SAAS_PRICES[company.plan] ?? '75 000';
    const features = company.plan === 'PREMIUM'
      ? "collaborateurs illimités, rapports avancés, API REST et assistance prioritaire"
      : "jusqu'à 50 collaborateurs, rapports standards et assistance par email";
    return [
      { title: 'Article 1 — Objet', content: `Le présent contrat régit l'accès de ${company.name} à la plateforme SaaS KADO en formule ${company.plan}, incluant le tableau de bord RH, la gestion des bons, les imports CSV et les rapports mensuels.` },
      { title: 'Article 2 — Tarif et facturation', content: `L'abonnement est facturé ${price} FCFA HT par mois, prélevé automatiquement sur la provision de l'Entreprise. La formule ${company.plan} inclut ${features}.` },
      { title: 'Article 3 — Disponibilité du service', content: "KADO SAS garantit une disponibilité de la plateforme de 99,5 % sur base mensuelle, hors maintenances planifiées notifiées 48h à l'avance. En cas d'indisponibilité prolongée, l'Entreprise bénéficie d'un avoir calculé prorata temporis." },
      { title: 'Article 4 — Durée', content: `Le contrat est conclu pour une durée de ${duration} mois à compter de la date de signature, renouvelable tacitement. La résiliation doit être notifiée par écrit avec un préavis de 30 jours.` },
    ];
  } else {
    return [
      { title: 'Préambule', content: `Par cet avenant, les parties conviennent de prolonger et de mettre à jour la convention initiale conclue entre KADO SAS et ${company.name}. Les conditions générales de la convention initiale restent applicables sauf modifications expressément stipulées ci-après.` },
      { title: "Article 1 — Objet de l'avenant", content: `Le présent avenant a pour objet le renouvellement de la convention de distribution pour une nouvelle période de ${duration} mois, à compter de la date de signature des présentes.` },
      { title: 'Article 2 — Conditions tarifaires', content: "Les conditions tarifaires demeurent inchangées, sous réserve de toute modification expressément convenue par les parties et annexée au présent avenant." },
      { title: 'Article 3 — Entrée en vigueur', content: "Le présent avenant entre en vigueur à la date de signature par les deux parties et se substitue aux dispositions contraires de la convention initiale." },
    ];
  }
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function DocumentsTab({ token }: { token: string }) {
  const [companies, setCompanies] = useState<DocCompany[]>([]);
  const [merchants, setMerchants] = useState<DocMerchant[]>([]);
  const [loading, setLoading] = useState(true);

  // Contract form
  const [selectedCompany, setSelectedCompany] = useState('');
  const [docType, setDocType] = useState<'eme' | 'saas' | 'avenant'>('eme');
  const [legalRep, setLegalRep] = useState('');
  const [docDate, setDocDate] = useState(new Date().toISOString().slice(0, 10));
  const [duration, setDuration] = useState('12');
  const [generating, setGenerating] = useState(false);

  // Kit form
  const [selectedMerchant, setSelectedMerchant] = useState('');
  const [kitGenerating, setKitGenerating] = useState(false);

  // History (in-memory, blobs stored in ref)
  const [docs, setDocs] = useState<GeneratedDoc[]>([]);
  const blobsRef = useRef<Map<string, Blob>>(new Map());

  // ── Data loading ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      fetch(`${API}/api/v1/admin/companies`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).catch(() => []),
      fetch(`${API}/api/v1/admin/merchants`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).catch(() => []),
    ]).then(([co, me]) => {
      setCompanies(Array.isArray(co) ? co.filter((c: DocCompany) => c.status === 'ACTIVE') : []);
      setMerchants(Array.isArray(me) ? me.filter((m: DocMerchant) => m.status === 'ACTIVE') : []);
    }).finally(() => setLoading(false));
  }, [token]);

  // ── Contract PDF ────────────────────────────────────────────────────────────

  async function generateContract() {
    if (!selectedCompany || !legalRep.trim()) return;
    setGenerating(true);
    try {
      const { jsPDF } = await import('jspdf');
      const company = companies.find(c => c.id === selectedCompany)!;
      const doc = new jsPDF({ format: 'a4', unit: 'mm' });
      const W = 210;
      const margin = 20;
      const contentW = W - 2 * margin;

      const docTitles = {
        eme:     'CONVENTION DE DISTRIBUTION',
        saas:    "CONTRAT D'ABONNEMENT SAAS",
        avenant: 'AVENANT DE RENOUVELLEMENT',
      };
      const docSubtitles = {
        eme:     'Accord de distribution de titres cadeaux dématérialisés',
        saas:    `Abonnement ${company.plan} — Plateforme Kado`,
        avenant: 'Prolongation de la convention initiale',
      };

      // Header band
      doc.setFillColor(83, 74, 183);
      doc.rect(0, 0, W, 38, 'F');
      doc.setFontSize(26);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('KADO', margin, 22);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('kado.sn  |  kado.africa', margin, 30);
      const ref = `KDO-${new Date().getFullYear()}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
      doc.setFontSize(8);
      doc.text(`Ref: ${ref}`, W - margin, 30, { align: 'right' });

      // Title
      let y = 52;
      doc.setFontSize(15);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text(docTitles[docType], W / 2, y, { align: 'center' });
      y += 7;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(docSubtitles[docType], W / 2, y, { align: 'center' });
      y += 5;
      doc.setDrawColor(83, 74, 183);
      doc.setLineWidth(0.6);
      doc.line(margin, y, W - margin, y);
      y += 7;
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      const dateDisplay = new Date(docDate + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      doc.text(`Date : ${dateDisplay}   |   Duree : ${duration} mois`, W / 2, y, { align: 'center' });

      // Parties
      y += 14;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('ENTRE LES SOUSSIGNES', margin, y);
      y += 8;

      const halfW = (contentW / 2) - 4;

      // Party 1 — Kado
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, y, halfW, 30, 2, 2, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, y, halfW, 30, 2, 2, 'D');
      doc.setFillColor(83, 74, 183);
      doc.rect(margin, y, 3, 30, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(83, 74, 183);
      doc.text('KADO SAS', margin + 7, y + 8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text('Dakar, Senegal  |  RCCM: SN-DKR-XXXX', margin + 7, y + 15);
      doc.text('Repr. par: [Dirigeant Kado]', margin + 7, y + 22);
      doc.text("Ci-apres : \"Kado\"", margin + 7, y + 28);

      // Party 2 — Enterprise
      const x2 = margin + halfW + 8;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(x2, y, halfW, 30, 2, 2, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.roundedRect(x2, y, halfW, 30, 2, 2, 'D');
      doc.setFillColor(71, 85, 105);
      doc.rect(x2, y, 3, 30, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text(company.name.slice(0, 32), x2 + 7, y + 8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      if (company.siren) doc.text(`NINEA : ${company.siren}`, x2 + 7, y + 15);
      doc.text(`Repr. par: ${legalRep.slice(0, 28)}`, x2 + 7, y + 22);
      doc.text("Ci-apres : \"L'Entreprise\"", x2 + 7, y + 28);
      y += 40;

      // Articles
      const articles = getArticles(docType, company, duration);
      for (const article of articles) {
        if (y > 255) { doc.addPage(); y = 20; }
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(83, 74, 183);
        doc.text(article.title, margin, y);
        y += 6;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(51, 65, 85);
        const lines = doc.splitTextToSize(article.content, contentW);
        for (const line of lines) {
          if (y > 268) { doc.addPage(); y = 20; }
          doc.text(line, margin, y);
          y += 5;
        }
        y += 5;
      }

      // Signatures
      if (y > 235) { doc.addPage(); y = 20; }
      y += 8;
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.line(margin, y, W - margin, y);
      y += 10;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('Fait a Dakar, en double exemplaire.', margin, y);
      y += 12;
      doc.text('Pour KADO SAS', margin, y);
      doc.text(`Pour ${company.name.slice(0, 22)}`, margin + halfW + 8, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('[Signature et cachet]', margin, y);
      doc.text(legalRep, margin + halfW + 8, y);
      y += 18;
      doc.setDrawColor(30, 41, 59);
      doc.setLineWidth(0.4);
      doc.line(margin, y, margin + halfW, y);
      doc.line(margin + halfW + 8, y, W - margin, y);

      // Footer on every page
      const total = doc.getNumberOfPages();
      for (let i = 1; i <= total; i++) {
        doc.setPage(i);
        doc.setFillColor(248, 250, 252);
        doc.rect(0, 286, W, 11, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.line(0, 286, W, 286);
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.setFont('helvetica', 'normal');
        doc.text('KADO SAS  |  kado.sn  |  Document confidentiel', margin, 292);
        doc.text(`Page ${i}/${total}`, W - margin, 292, { align: 'right' });
      }

      const cleanName = company.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const filename = `${docType}-${cleanName}-${docDate}.pdf`;
      doc.save(filename);

      const id = crypto.randomUUID();
      blobsRef.current.set(id, doc.output('blob'));
      setDocs(prev => [{ id, type: docTitles[docType], entityName: company.name, generatedAt: new Date(), filename }, ...prev]);
    } finally {
      setGenerating(false);
    }
  }

  // ── Welcome Kit PDF ─────────────────────────────────────────────────────────

  async function generateKit() {
    if (!selectedMerchant) return;
    setKitGenerating(true);
    try {
      const { jsPDF } = await import('jspdf');
      const { toDataURL } = await import('qrcode');
      const merchant = merchants.find(m => m.id === selectedMerchant)!;
      const doc = new jsPDF({ format: 'a4', unit: 'mm' });
      const W = 210;
      const H = 297;
      const margin = 20;

      // ── PAGE 1: STICKER VITRINE ──────────────────────────────────────────────

      // Purple background
      doc.setFillColor(83, 74, 183);
      doc.rect(0, 0, W, H, 'F');

      // Decorative circles
      doc.setFillColor(99, 88, 204);
      doc.ellipse(W - 15, 45, 55, 55, 'F');
      doc.setFillColor(72, 63, 163);
      doc.ellipse(15, H - 35, 45, 45, 'F');

      // White border frame
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(2.5);
      doc.roundedRect(12, 12, W - 24, H - 24, 10, 10);

      // Decorative dots
      doc.setFillColor(255, 255, 255);
      [35, 65, 145, 175].forEach(x => { doc.ellipse(x, 34, 1.2, 1.2, 'F'); });
      [35, 65, 145, 175].forEach(x => { doc.ellipse(x, H - 34, 1.2, 1.2, 'F'); });

      // KADO main text
      doc.setFontSize(64);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('KADO', W / 2, 85, { align: 'center' });

      // Tagline
      doc.setFontSize(13);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(200, 196, 240);
      doc.text('Le cadeau, digitalise.', W / 2, 97, { align: 'center' });

      // Divider line
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.5);
      doc.line(W / 2 - 50, 104, W / 2 + 50, 104);

      // Main message
      doc.setFontSize(28);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('ACCEPTE ICI', W / 2, 120, { align: 'center' });

      // QR white box
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(W / 2 - 45, 128, 90, 90, 6, 6, 'F');

      // QR code
      const qrDataUrl = await toDataURL('https://kado.sn/pos/login', {
        width: 400, margin: 1, color: { dark: '#1E293B', light: '#FFFFFF' },
      });
      doc.addImage(qrDataUrl, 'PNG', W / 2 - 42, 131, 84, 84);

      // Scan instruction
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('Scannez pour acceder au terminal', W / 2, 233, { align: 'center' });
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(200, 196, 240);
      doc.text('kado.sn/pos/login', W / 2, 241, { align: 'center' });

      // Bottom text
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(200, 196, 240);
      doc.text('Paiement par bons cadeaux numeriques', W / 2, 264, { align: 'center' });
      doc.setFontSize(8);
      doc.text('Powered by Kado  |  kado.sn', W / 2, 272, { align: 'center' });

      // ── PAGE 2: GUIDE 6 ÉTAPES ───────────────────────────────────────────────

      doc.addPage();

      // Header
      doc.setFillColor(83, 74, 183);
      doc.rect(0, 0, W, 44, 'F');
      doc.setFontSize(17);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('Comment accepter les bons Kado', W / 2, 18, { align: 'center' });
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(200, 196, 240);
      doc.text('Guide commerçant  |  6 etapes simples', W / 2, 29, { align: 'center' });
      doc.setFontSize(8);
      doc.text('kado.sn  |  Pour toute question, contactez le support WhatsApp', W / 2, 39, { align: 'center' });

      const steps = [
        { num: '1', title: 'Scanner le QR code', desc: "Demandez au client d'afficher son bon Kado. Scannez le QR code avec l'appareil photo du terminal ou l'application Kado POS." },
        { num: '2', title: 'Verifier le solde', desc: "Le solde disponible s'affiche automatiquement. Verifiez qu'il couvre le montant de l'achat avant de continuer." },
        { num: '3', title: 'Saisir le montant', desc: "Entrez le montant exact de la transaction. Le montant saisi ne peut pas depasser le solde disponible sur le bon." },
        { num: '4', title: 'Confirmer', desc: "Appuyez sur Valider. La transaction est verifiee en temps reel. Ne fermez pas l'application pendant la verification." },
        { num: '5', title: 'Ecran vert = succes', desc: "Un ecran vert s'affiche. Le terminal vibre 2 fois pour confirmer. Remettez la marchandise ou le service au client." },
        { num: '6', title: 'Reglement le lendemain', desc: "Votre solde est reverse chaque soir avant 23h sur votre Wave ou Orange Money enregistre. Aucune action requise." },
      ];

      const stepColors: Array<[number, number, number]> = [
        [83, 74, 183], [59, 130, 246], [34, 197, 94],
        [245, 158, 11], [16, 185, 129], [239, 68, 68],
      ];

      const boxW = (W - 50) / 2;
      const boxH = 52;
      const startY = 52;

      steps.forEach((step, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const bx = margin + col * (boxW + 10);
        const by = startY + row * (boxH + 6);
        const [r, g, b] = stepColors[i];

        // Box background
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(bx, by, boxW, boxH, 3, 3, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.roundedRect(bx, by, boxW, boxH, 3, 3, 'D');

        // Colored left strip
        doc.setFillColor(r, g, b);
        doc.roundedRect(bx, by, 4, boxH, 2, 2, 'F');

        // Step number circle
        doc.setFillColor(r, g, b);
        doc.ellipse(bx + 14, by + 12, 6, 6, 'F');
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text(step.num, bx + 14, by + 15, { align: 'center' });

        // Step title
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text(step.title, bx + 8, by + 28);

        // Step description
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        const descLines = doc.splitTextToSize(step.desc, boxW - 16) as string[];
        descLines.slice(0, 4).forEach((line, li) => {
          doc.text(line, bx + 8, by + 35 + li * 4.5);
        });
      });

      // Important note
      const noteY = startY + 3 * (boxH + 6) + 10;
      doc.setFillColor(254, 243, 199);
      doc.roundedRect(margin, noteY, W - 2 * margin, 22, 3, 3, 'F');
      doc.setDrawColor(253, 230, 138);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, noteY, W - 2 * margin, 22, 3, 3, 'D');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(146, 64, 14);
      doc.text('Important :', margin + 8, noteY + 8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 53, 15);
      doc.text('Ne jamais rendre la monnaie en especes. Le solde restant reste sur le bon du client.', margin + 36, noteY + 8);
      doc.setFontSize(8);
      doc.text("En cas de litige, conservez l'ecran de confirmation et contactez le support.", margin + 8, noteY + 16);

      // ── PAGE 3: INFOS COMMERÇANT ─────────────────────────────────────────────

      doc.addPage();

      // Dark header
      doc.setFillColor(30, 41, 59);
      doc.rect(0, 0, W, 48, 'F');
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('KADO', margin, 22);
      // Purple vertical divider
      doc.setFillColor(83, 74, 183);
      doc.rect(margin + 28, 13, 2, 16, 'F');
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text('Votre espace commercant', margin + 34, 22);
      doc.setFontSize(9);
      doc.text('kado.sn  |  kado.africa', W - margin, 22, { align: 'right' });
      // Merchant name in header
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(merchant.name.slice(0, 38), margin, 40);

      // Merchant info card
      let y3 = 60;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, y3, W - 2 * margin, 52, 5, 5, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, y3, W - 2 * margin, 52, 5, 5, 'D');
      doc.setFillColor(83, 74, 183);
      doc.rect(margin, y3, 4, 52, 'F');
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('Informations du point de vente', margin + 10, y3 + 12);

      const infoRows = [
        ['Categorie',     CATEGORY_LABELS[merchant.category] ?? merchant.category],
        ['Telephone',     merchant.phone    ?? 'Non renseigne'],
        ['Adresse',       merchant.address  ?? 'Non renseignee'],
        ['ID Partenaire', merchant.id.slice(0, 12).toUpperCase() + '...'],
      ];
      infoRows.forEach(([label, value], i) => {
        const iy = y3 + 22 + i * 8;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 116, 139);
        doc.text(`${label} :`, margin + 10, iy);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 41, 59);
        doc.text(value.slice(0, 55), margin + 44, iy);
      });
      y3 += 62;

      // Support card
      doc.setFillColor(240, 253, 244);
      doc.roundedRect(margin, y3, W - 2 * margin, 42, 5, 5, 'F');
      doc.setDrawColor(134, 239, 172);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, y3, W - 2 * margin, 42, 5, 5, 'D');
      doc.setFillColor(34, 197, 94);
      doc.rect(margin, y3, 4, 42, 'F');
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('Support Kado — Nous sommes la pour vous', margin + 10, y3 + 12);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(55, 65, 81);
      doc.text('WhatsApp : +221 77 XXX XX XX', margin + 10, y3 + 22);
      doc.text('Email : support@kado.sn', margin + 10, y3 + 30);
      doc.text('Disponible du lundi au samedi, 8h00 - 20h00', margin + 10, y3 + 38);
      y3 += 52;

      // FAQ
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('Questions frequentes', margin, y3);
      y3 += 8;

      const faq = [
        { q: 'Quand est-ce que je recois mon reglement ?', a: "Chaque soir avant 23h, automatiquement sur votre Wave ou Orange Money enregistre. Aucune action de votre part n'est necessaire." },
        { q: "Que faire si le QR code ne scanne pas ?", a: "Demandez au client de mettre son telephone en luminosite maximale. En dernier recours, saisissez le code manuellement." },
        { q: 'Puis-je rembourser un bon Kado en especes ?', a: "Non. Les transactions sont definitives. En cas de litige, conservez l'ecran de confirmation et contactez le support." },
      ];

      faq.forEach(item => {
        if (y3 > 245) return;
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(83, 74, 183);
        const qLines = doc.splitTextToSize(`Q : ${item.q}`, W - 2 * margin) as string[];
        qLines.forEach(l => { doc.text(l, margin, y3); y3 += 5; });
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        const aLines = doc.splitTextToSize(`R : ${item.a}`, W - 2 * margin) as string[];
        aLines.forEach(l => { doc.text(l, margin, y3); y3 += 5; });
        y3 += 4;
      });

      // QR code terminal — bottom right
      const posQrDataUrl = await toDataURL('https://kado.sn/pos/login', {
        width: 250, margin: 1, color: { dark: '#1E293B', light: '#FFFFFF' },
      });
      const qrX = W - margin - 48;
      const qrY = H - 80;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(qrX - 2, qrY - 2, 52, 56, 3, 3, 'F');
      doc.addImage(posQrDataUrl, 'PNG', qrX, qrY, 48, 48);
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('Acces terminal', qrX + 24, qrY + 52, { align: 'center' });

      // Footer on all pages
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFillColor(30, 41, 59);
        doc.rect(0, H - 10, W, 10, 'F');
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.setFont('helvetica', 'normal');
        doc.text(`KADO SAS  |  kado.sn  |  Document reserve au commercant partenaire  |  ${new Date().toLocaleDateString('fr-FR')}`, margin, H - 4);
        doc.text(`${i}/${totalPages}`, W - margin, H - 4, { align: 'right' });
      }

      const cleanName = merchant.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const filename = `kit-bienvenue-${cleanName}-${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(filename);

      const id = crypto.randomUUID();
      blobsRef.current.set(id, doc.output('blob'));
      setDocs(prev => [{ id, type: 'Kit de bienvenue commercant', entityName: merchant.name, generatedAt: new Date(), filename }, ...prev]);
    } finally {
      setKitGenerating(false);
    }
  }

  // ── Re-download ─────────────────────────────────────────────────────────────

  function redownload(docItem: GeneratedDoc) {
    const blob = blobsRef.current.get(docItem.id);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = docItem.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const selectedCo = companies.find(c => c.id === selectedCompany);
  const selectedMe = merchants.find(m => m.id === selectedMerchant);

  return (
    <div>
      <div style={ds.grid2col}>

        {/* ── Section 1: Contrats ── */}
        <section style={ds.section}>
          <h2 style={ds.sectionTitle}>
            <span style={ds.sectionDot} />
            Générateur de contrats
          </h2>
          <p style={ds.sectionDesc}>
            Générez des contrats PDF pré-remplis avec les données de l&apos;entreprise depuis la base.
          </p>

          {loading ? (
            <div style={ds.loadingText}>Chargement des entreprises…</div>
          ) : (
            <div style={ds.form}>

              {/* Company selector */}
              <div style={ds.field}>
                <label style={ds.label}>Entreprise *</label>
                <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} style={ds.select}>
                  <option value="">— Choisir une entreprise —</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.plan})</option>
                  ))}
                </select>
              </div>

              {/* Doc type */}
              <div style={ds.field}>
                <label style={ds.label}>Type de document *</label>
                <div style={ds.radioGroup}>
                  {([
                    { value: 'eme',     label: 'Convention de distribution EME' },
                    { value: 'saas',    label: 'Contrat SaaS' },
                    { value: 'avenant', label: 'Avenant de renouvellement' },
                  ] as const).map(opt => (
                    <label key={opt.value} style={ds.radioLabel}>
                      <input
                        type="radio" name="docType" value={opt.value}
                        checked={docType === opt.value}
                        onChange={() => setDocType(opt.value)}
                        style={{ accentColor: '#534AB7', cursor: 'pointer' }}
                      />
                      <span style={docType === opt.value ? ds.radioTextActive : ds.radioText}>
                        {opt.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Legal representative */}
              <div style={ds.field}>
                <label style={ds.label}>Représentant légal de l&apos;entreprise *</label>
                <input
                  type="text"
                  placeholder="M. Prénom NOM, Directeur Général"
                  value={legalRep}
                  onChange={e => setLegalRep(e.target.value)}
                  style={ds.input}
                />
              </div>

              {/* Date + Duration */}
              <div style={ds.fieldRow}>
                <div style={ds.field}>
                  <label style={ds.label}>Date du document *</label>
                  <input type="date" value={docDate} onChange={e => setDocDate(e.target.value)} style={ds.input} />
                </div>
                <div style={ds.field}>
                  <label style={ds.label}>Durée</label>
                  <select value={duration} onChange={e => setDuration(e.target.value)} style={ds.select}>
                    {['6', '12', '24', '36'].map(d => <option key={d} value={d}>{d} mois</option>)}
                  </select>
                </div>
              </div>

              {/* Company preview */}
              {selectedCo && (
                <div style={ds.preview}>
                  <p style={ds.previewTitle}>{selectedCo.name}</p>
                  {selectedCo.siren    && <p style={ds.previewSub}>NINEA : {selectedCo.siren}</p>}
                  {selectedCo.email    && <p style={ds.previewSub}>{selectedCo.email}</p>}
                  {selectedCo.address  && <p style={ds.previewSub}>{selectedCo.address}</p>}
                  <span style={ds.planBadge}>{selectedCo.plan}</span>
                </div>
              )}

              <button
                onClick={generateContract}
                disabled={!selectedCompany || !legalRep.trim() || generating}
                style={{ ...ds.generateBtn, opacity: (!selectedCompany || !legalRep.trim() || generating) ? 0.45 : 1 }}
              >
                {generating ? 'Génération en cours…' : '↓ Générer le PDF'}
              </button>
            </div>
          )}
        </section>

        {/* ── Section 2: Kit commerçant ── */}
        <section style={ds.section}>
          <h2 style={ds.sectionTitle}>
            <span style={{ ...ds.sectionDot, background: '#22C55E' }} />
            Kit de bienvenue commerçant
          </h2>
          <p style={ds.sectionDesc}>
            PDF 3 pages prêt à imprimer : sticker vitrine avec QR code, guide 6 étapes, fiche commerçant + FAQ.
          </p>

          {loading ? (
            <div style={ds.loadingText}>Chargement des commerçants…</div>
          ) : (
            <div style={ds.form}>

              <div style={ds.field}>
                <label style={ds.label}>Commerçant *</label>
                <select value={selectedMerchant} onChange={e => setSelectedMerchant(e.target.value)} style={ds.select}>
                  <option value="">— Choisir un commerçant —</option>
                  {merchants.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {CATEGORY_LABELS[m.category] ?? m.category}
                    </option>
                  ))}
                </select>
              </div>

              {/* Merchant preview */}
              {selectedMe && (
                <div style={{ ...ds.preview, borderLeftColor: '#22C55E' }}>
                  <p style={ds.previewTitle}>{selectedMe.name}</p>
                  <p style={ds.previewSub}>{CATEGORY_LABELS[selectedMe.category] ?? selectedMe.category}</p>
                  {selectedMe.phone   && <p style={ds.previewSub}>{selectedMe.phone}</p>}
                  {selectedMe.address && <p style={ds.previewSub}>{selectedMe.address}</p>}
                </div>
              )}

              {/* Kit content preview */}
              <div style={ds.kitPages}>
                {[
                  { num: 'P.1', title: 'Sticker vitrine',       desc: 'Logo Kado + QR code → kado.sn/pos/login' },
                  { num: 'P.2', title: 'Guide 6 étapes',        desc: 'Étapes illustrées en français simple' },
                  { num: 'P.3', title: 'Fiche commerçant + FAQ', desc: 'Infos, support WhatsApp + QR terminal' },
                ].map(p => (
                  <div key={p.num} style={ds.kitPage}>
                    <span style={ds.kitPageNum}>{p.num}</span>
                    <div>
                      <p style={ds.kitPageTitle}>{p.title}</p>
                      <p style={ds.kitPageDesc}>{p.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={generateKit}
                disabled={!selectedMerchant || kitGenerating}
                style={{ ...ds.generateBtn, background: '#14532D', color: '#86EFAC', opacity: (!selectedMerchant || kitGenerating) ? 0.45 : 1 }}
              >
                {kitGenerating ? 'Génération en cours…' : '↓ Générer le kit PDF (3 pages)'}
              </button>
            </div>
          )}
        </section>
      </div>

      {/* ── Historique ── */}
      {docs.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: '#94A3B8', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...ds.sectionDot, background: '#F59E0B' }} />
            Historique de cette session ({docs.length})
          </h2>
          <div style={ds.historyTable}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Date & heure', 'Type', 'Entité', 'Fichier', ''].map(h => (
                    <th key={h} style={ds.histTh}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docs.map(d => (
                  <tr key={d.id} style={{ borderBottom: '1px solid #334155' }}>
                    <td style={ds.histTd}>
                      <span style={{ color: '#64748B', fontSize: 12 }}>
                        {d.generatedAt.toLocaleString('fr-SN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td style={ds.histTd}><span style={{ color: '#CBD5E1', fontWeight: 600 }}>{d.type}</span></td>
                    <td style={ds.histTd}><span style={{ color: '#F1F5F9' }}>{d.entityName}</span></td>
                    <td style={ds.histTd}><span style={{ fontFamily: 'monospace', fontSize: 12, color: '#64748B' }}>{d.filename}</span></td>
                    <td style={ds.histTd}>
                      <button onClick={() => redownload(d)} style={ds.redownloadBtn}>
                        Retélécharger
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const ds: Record<string, React.CSSProperties> = {
  grid2col: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 20,
    alignItems: 'start',
  },
  section: {
    background: '#1E293B',
    border: '1px solid #334155',
    borderRadius: 14,
    padding: '24px',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: '#F1F5F9',
    margin: '0 0 8px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#534AB7',
    flexShrink: 0,
  },
  sectionDesc: {
    fontSize: 13,
    color: '#64748B',
    margin: '0 0 20px',
    lineHeight: '1.5',
  },
  loadingText: {
    color: '#475569',
    fontSize: 13,
    padding: '20px 0',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    flex: 1,
  },
  fieldRow: {
    display: 'flex',
    gap: 12,
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },
  input: {
    background: '#0F172A',
    border: '1px solid #334155',
    borderRadius: 8,
    padding: '9px 12px',
    fontSize: 13,
    color: '#F1F5F9',
    width: '100%',
    boxSizing: 'border-box',
  },
  select: {
    background: '#0F172A',
    border: '1px solid #334155',
    borderRadius: 8,
    padding: '9px 12px',
    fontSize: 13,
    color: '#F1F5F9',
    width: '100%',
    boxSizing: 'border-box',
    cursor: 'pointer',
  },
  radioGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
  },
  radioText: {
    fontSize: 13,
    color: '#64748B',
  },
  radioTextActive: {
    fontSize: 13,
    color: '#F1F5F9',
    fontWeight: 600,
  },
  preview: {
    background: '#0F172A',
    border: '1px solid #334155',
    borderRadius: 8,
    padding: '12px 14px',
    borderLeft: '3px solid #534AB7',
  },
  previewTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#F1F5F9',
    margin: '0 0 4px',
  },
  previewSub: {
    fontSize: 12,
    color: '#64748B',
    margin: '2px 0',
  },
  planBadge: {
    display: 'inline-block',
    marginTop: 6,
    fontSize: 11,
    fontWeight: 600,
    border: '1px solid #534AB7',
    borderRadius: 4,
    padding: '1px 8px',
    color: '#818CF8',
  },
  kitPages: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  kitPage: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    background: '#0F172A',
    borderRadius: 8,
    padding: '10px 12px',
  },
  kitPageNum: {
    fontSize: 10,
    fontWeight: 800,
    color: '#22C55E',
    background: 'rgba(34,197,94,0.1)',
    borderRadius: 4,
    padding: '2px 8px',
    flexShrink: 0,
    letterSpacing: '0.5px',
  },
  kitPageTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: '#F1F5F9',
    margin: 0,
  },
  kitPageDesc: {
    fontSize: 11,
    color: '#64748B',
    margin: '2px 0 0',
  },
  generateBtn: {
    background: '#534AB7',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 10,
    padding: '12px 20px',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    width: '100%',
    marginTop: 4,
  },
  historyTable: {
    background: '#1E293B',
    border: '1px solid #334155',
    borderRadius: 14,
    overflow: 'hidden',
  },
  histTh: {
    padding: '10px 16px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 700,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: '1px solid #334155',
  },
  histTd: {
    padding: '10px 16px',
    verticalAlign: 'middle',
  },
  redownloadBtn: {
    background: 'none',
    border: '1px solid #334155',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 600,
    color: '#94A3B8',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
};
