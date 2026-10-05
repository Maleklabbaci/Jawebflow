/**
 * Parcours sécurisé de modification/annulation d'une commande par le client.
 * Toute écriture attend une confirmation envoyée en réponse à un récapitulatif.
 */
import { extractLeadFacts } from './lead-facts.ts';
import { dealKindLabel, dealKindOf } from './sales-intent.ts';
import { isAffirmative } from './sales-intent.ts';

export type OrderChangeType = 'modify' | 'cancel';
export type OrderChangeDraft = {
  type: OrderChangeType;
  status: 'awaiting_order_selection' | 'awaiting_reason' | 'awaiting_details' | 'awaiting_confirmation';
  orderId?: string;
  orderIds?: string[];
  reference?: string;
  reason?: string;
  requestedChanges?: string;
  createdAt: string;
  updatedAt: string;
};

export type OrderChangeResult = {
  handled: boolean;
  reply?: string;
  orderChangeDraft?: OrderChangeDraft | null;
  orders?: Array<Record<string, any>>;
};

const EDITABLE_STATUSES = new Set(['pending_merchant_confirmation', 'confirmed', 'preparing']);

function normalize(input: unknown): string {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}+]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function has(text: string, terms: string[]): boolean {
  const padded = ` ${text} `;
  return terms.some((term) => {
    const normalized = normalize(term);
    return normalized.length > 0 && padded.includes(` ${normalized} `);
  });
}

function languageOf(input: unknown): 'fr' | 'dz' | 'ar' {
  const text = String(input || '');
  if (/[\u0600-\u06FF]/.test(text)) return 'ar';
  if (/\b(?:nheb|n7eb|nlgui|nlghi|nbdel|nbeddel|n3adel|rani|bghit|wesh|wach|saha)\b/i.test(text)) return 'dz';
  return 'fr';
}

function localized(input: unknown, fr: string, dz: string, ar: string): string {
  const language = languageOf(input);
  return language === 'ar' ? ar : language === 'dz' ? dz : fr;
}

export function detectOrderManagementIntent(input: unknown): OrderChangeType | null {
  const text = normalize(input);
  if (!text || isOrderChangeRefusal(input)) return null;

  const cancel = has(text, [
    'annuler ma commande', 'annule ma commande', 'annuler la commande', 'annule la commande',
    'annulation de ma commande', 'annulation commande', 'je veux annuler', 'je souhaite annuler',
    'je voudrais annuler', 'j aimerais annuler', 'je veux l annuler', 'je l annule', 'annule', 'annuler', 'annulation', 'je change d avis', 'j ai change d avis', 'changed my mind',
    'cancel my order', 'cancel the order', 'cancel order', 'i want to cancel', 'cancel it', 'cancel',
    'الغاء الطلب', 'إلغاء الطلب', 'الغاء', 'الغي', 'نلغي طلبي', 'نلغي الطلبية', 'نحب نلغي', 'حاب نلغي', 'الغيه',
    'nlgui', 'nlghi', 'n7eb nlghi', 'nheb nlgui', 'nheb nannuli', 'n7eb nannuli', 'annuli', 'nannuli',
  ]);
  const modify = has(text, [
    'modifier ma commande', 'modifier la commande', 'changer ma commande', 'changer la commande',
    'je veux modifier', 'je souhaite modifier', 'je voudrais modifier', 'je veux changer',
    'je souhaite changer', 'je voudrais changer', 'corriger ma commande', 'corriger la commande',
    'changer un detail', 'modifier un detail', 'changer le detail', 'modifier le detail',
    'change ma commande', 'change la commande', 'modifie ma commande', 'modifie la commande',
    'change', 'changer', 'modifie', 'modifier', 'corrige', 'corriger', 'remplace', 'remplacer', 'supprime', 'supprimer', 'enleve', 'enlever', 'ajouter a ma commande',
    'retirer de ma commande', 'change my order', 'modify my order', 'edit my order', 'update my order', 'replace', 'remove',
    'تعديل الطلب', 'تغيير الطلب', 'نبدل الطلبية', 'نغير الطلبية', 'نحب نبدل', 'نحب نغير', 'بدل الطلبية',
    'nbdel', 'nbeddel', 'n3adel', 'nheb nbedel', 'n7eb nbedel',
  ]);

  if (cancel && modify && has(text, ['plutot modifier', 'plutot changer', 'au lieu d annuler', 'instead change', 'rather modify'])) return 'modify';
  if (cancel) return 'cancel';
  if (modify) return 'modify';
  return null;
}

export function isOrderChangeRefusal(input: unknown): boolean {
  const text = normalize(input);
  const words = text.split(' ').filter(Boolean);
  if (words.length <= 5 && new Set([
    'non', 'non merci', 'non pas maintenant', 'no', 'no thanks', 'no keep it', 'لا', 'لا شكرا', 'لا خليه',
    'خليها', 'خلي الطلبية', 'laisse tomber', 'laisse comme ca', 'garde la commande', 'je garde la commande',
    'ne change rien', 'ne modifie rien', 'ne l annule pas', 'n annule pas', 'annule pas',
  ]).has(text)) return true;
  return has(text, [
    'je ne veux pas annuler', 'je veux pas annuler', 'je ne souhaite plus annuler', 'pas annuler', 'je veux garder la commande', 'je garde ma commande', 'garde la commande', 'gardez ma commande',
    'ne pas annuler', 'ne l annule pas', 'ne change rien', 'ne modifie rien',
    'keep my order', 'do not cancel', 'dont cancel', 'keep it as is',
    'ما تلغيش الطلبية', 'خلي الطلبية كيما راهي',
  ]);
}

function isExplicitCancellationConfirmation(input: unknown): boolean {
  const text = normalize(input);
  return has(text, [
    'oui annule', 'oui annuler', 'je confirme l annulation', 'je confirme annulation',
    'confirme l annulation', 'confirmer l annulation', 'je veux bien annuler', 'je veux annuler', 'annule quand meme', 'annuler quand meme',
    'annule la commande', 'annuler la commande', 'j annule ma commande', 'cancel it', 'cancel', 'yes cancel',
    'confirm cancellation', 'cancel my order', 'نعم الغي الطلب', 'نعم الغاء الطلب', 'اكد الالغاء', 'نأكد الالغاء', 'نلغي الطلبية',
  ]);
}

function isVagueChangeRequest(input: unknown): boolean {
  const text = normalize(input);
  const changeTerms = ['modifier', 'modifie', 'changer', 'change', 'corriger', 'corrige', 'remplacer', 'remplace', 'ajouter', 'retirer', 'بدل', 'نبدل', 'تعديل', 'nbdel', 'n3adel'];
  const changeIndex = changeTerms.map((term) => text.indexOf(normalize(term))).filter((index) => index >= 0).sort((a, b) => a - b)[0];
  if (changeIndex === undefined) return false;
  const tail = text.slice(changeIndex).split(' ').filter((word) => word && !new Set([
    'modifier', 'modifie', 'changer', 'change', 'corriger', 'corrige', 'remplacer', 'remplace', 'ajouter', 'retirer',
    'ma', 'mon', 'mes', 'la', 'le', 'les', 'un', 'une', 'de', 'du', 'des', 'a', 'pour', 'commande', 'detail', 'details',
    'svp', 'stp', 'please', 'my', 'the', 'order', 'to', 'l', 'd', 'en', 'vers', 'au', 'aux', 'avec', 'est', 'livraison', 'delivery', 'autre', 'another', 'نبدل', 'نغير', 'نعدل', 'الطلبية', 'الطلب',
    'commande', 'commandes', 'visite', 'visites', 'rdv', 'rendez', 'vous', 'reservation', 'reservations', 'devis', 'demande', 'الزيارة', 'الموعد', 'المواعيد', 'الحجز', 'عرض', 'السعر',
  ]).has(word));
  return tail.length < 2;
}

function cleanChangeText(input: unknown): string {
  return String(input || '').replace(/\s+/g, ' ').trim().slice(0, 600);
}

function orderLabel(order: Record<string, any>): string {
  return String(order.reference || order.id || dealKindLabel(order)).slice(0, 80);
}

type DealWords = { fr: string; dz: string; ar: string };

/**
 * Le MOT JUSTE pour parler de la demande : on n'annonce pas « la commande est
 * annulée » à un client qui avait validé une VISITE ou un RENDEZ-VOUS.
 */
function dealWords(order: Record<string, any>): DealWords {
  switch (dealKindOf(order)) {
    case 'visit': return { fr: 'la visite', dz: 'la visite', ar: 'الزيارة' };
    case 'appointment': return { fr: 'le rendez-vous', dz: 'rdv', ar: 'الموعد' };
    case 'booking': return { fr: 'la réservation', dz: 'la réservation', ar: 'الحجز' };
    case 'quote': return { fr: 'le devis', dz: 'devis', ar: 'عرض السعر' };
    default: return { fr: 'la commande', dz: 'la commande', ar: 'الطلبية' };
  }
}

/** Ce qui est réellement modifiable selon la nature de la demande. */
function editableDetails(order: Record<string, any>): DealWords {
  if (dealKindOf(order) === 'order') {
    return {
      fr: 'article, taille/couleur, quantité ou adresse',
      dz: 'article, taille/couleur, quantité wela l\'adresse',
      ar: 'المنتج، المقاس/اللون، الكمية أو العنوان',
    };
  }
  return {
    fr: 'date, heure ou coordonnées',
    dz: 'date, sa3a wela coordonnées',
    ar: 'التاريخ، الساعة أو معلومات التواصل',
  };
}

function editableOrders(orders: Array<Record<string, any>>): Array<Record<string, any>> {
  return orders
    .filter((order) => order && typeof order.id === 'string' && EDITABLE_STATUSES.has(String(order.status)))
    .sort((a, b) => Date.parse(String(b.createdAt || '')) - Date.parse(String(a.createdAt || '')));
}

function orderStatusMessage(order: Record<string, any>, input: unknown): string {
  const status = String(order.status || '');
  const ref = orderLabel(order);
  const w = dealWords(order);
  if (status === 'cancelled') return localized(input,
    `${cap(w.fr)} ${ref} est déjà annulée. Si vous souhaitez en fixer une nouvelle, dites-moi ce qu’il vous faut.`,
    `${cap(w.dz)} ${ref} rah t'annulat déjà. Ida hab tdir wa7da jdida, goli chno t7eb.`,
    `${w.ar} ${ref} ملغاة من قبل. إذا حبيت تدير واحدة جديدة، قولّي واش تحتاج.`);
  if (status === 'shipped' || status === 'delivered') return localized(input,
    `Je ne peux plus modifier ni annuler ${w.fr} ${ref} : cette demande est déjà ${status === 'shipped' ? 'expédiée' : 'clôturée'}. Je peux transmettre votre demande à la boutique pour qu’elle vous aide.`,
    `Ma n9derch nbdel wela nlghi ${w.dz} ${ref}: had talab ${status === 'shipped' ? 'tsefat' : 'tseddat'} déjà. N9der nwessel talabek l'équipe ta3 lma7al.`,
    `ما نقدرش نبدل أو نلغي ${w.ar} ${ref}: الطلبية ${status === 'shipped' ? 'تبعثت' : 'تسكرت'} من قبل. نقدر نوصل طلبك للمحل باش يعاونك.`);
  return localized(input,
    `Je ne trouve pas de demande modifiable dans cette conversation. Donnez-moi sa référence ou contactez la boutique.`,
    `Ma l9itch 7aja n9der nbdelha f had la conversation. Goli référence wela 3ayet lma7al.`,
    `ما لقيتش طلب نقدر نبدلو في هاذ المحادثة. ابعثلي الرقم أو تواصل مع المحل.`);
}

/** Majuscule en début de phrase, sans casser la suite. */
function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function askWhyToCancel(order: Record<string, any>, input: unknown): string {
  const ref = orderLabel(order);
  const w = dealWords(order);
  return localized(input,
    `Je comprends. Qu’est-ce qui vous pousse à annuler ${w.fr} ${ref} ? Si c’est un détail à corriger (${editableDetails(order).fr}), je peux d’abord vous aider à le changer. Rien ne sera changé sans votre confirmation.`,
    `Fhemtk. 3lach hab t'annuli ${w.dz} ${ref} ? Ida lmochkil f détail (${editableDetails(order).dz}), n9der n3awnek nbdlouh. Ma nbedel walo 7ta tconfirmi.`,
    `نتفهمك. علاش حاب تلغي ${w.ar} ${ref}؟ إذا المشكل في تفصيل (${editableDetails(order).ar})، نقدر نعاونك نبدلو. ما يتبدل والو حتى تأكدلي.`);
}

function askForChangeDetails(order: Record<string, any>, input: unknown): string {
  const ref = orderLabel(order);
  const w = dealWords(order);
  const details = editableDetails(order);
  return localized(input,
    `Bien sûr. Que souhaitez-vous modifier sur ${w.fr} ${ref} exactement (${details.fr}) ? Rien ne sera modifié avant votre accord final.`,
    `Machi mochkil. Wach hab tbedel f ${w.dz} ${ref} exactement (${details.dz}) ? Ma nbedel walo 7ta tconfirmi.`,
    `أكيد. واش حاب تبدل بالضبط في ${w.ar} ${ref} (${details.ar})؟ ما نبدل والو حتى تأكدلي في الأخير.`);
}

function askToConfirmChange(order: Record<string, any>, changes: string, input: unknown): string {
  const ref = orderLabel(order);
  const detail = changes.slice(0, 280);
  const w = dealWords(order);
  return localized(input,
    `Pour ${w.fr} ${ref}, je récapitule la modification demandée : « ${detail} ». Confirmez-vous ? Répondez « Oui, confirme la modification » ou « Non ». Rien ne sera changé avant votre accord.`,
    `F ${w.dz} ${ref}, rah nbedel hakda : « ${detail} ». Tconfirmi ? Goli « oui, confirme » wela « non ». Ma nbedel walo 7ta tconfirmi.`,
    `بالنسبة لـ${w.ar} ${ref}، التغيير المطلوب هو: « ${detail} ». تأكدلي؟ جاوب « نعم، أكد التغيير » أو « لا ». ما يتبدل والو حتى توافق.`);
}

function cancelAlternative(reason: string, input: unknown): string {
  const text = normalize(reason);
  if (has(text, ['prix', 'cher', 'chere', 'budget', 'expensive', 'price', 'غالي', 'السعر', 'غلا'])) {
    return localized(input,
      `Je comprends pour le budget. On peut vérifier avec la boutique s’il existe une option moins chère ou retirer un article, sans promettre de remise.`,
      `Fhemtk 3la budget. Nchoufou m3a lma7al ida kayen choix arkhess wela n7iyou article, bla wa3d b remise.`,
      `نتفهم موضوع الميزانية. يمكن التحقق مع المحل إذا كاين اختيار أرخص أو نحيو منتج، بلا وعد بتخفيض.`);
  }
  if (has(text, ['delai', 'retard', 'livraison', 'livrer', 'shipping', 'late', 'delivery', 'وقت', 'تأخير', 'توصيل'])) {
    return localized(input,
      `Je comprends pour le délai. La boutique pourra vérifier l’estimation de livraison ; si l’adresse est incorrecte, je peux vous aider à la corriger, sans garantir un délai plus court.`,
      `Fhemtk 3la délai. Lma7al y9der yverifi date ta3 livraison; ida l'adresse ghalta, n9der n3awnek nsah7ha, bla ma ndmen délai a9sar.`,
      `نتفهم موضوع التأخير. يقدر المحل يتحقق من موعد التوصيل؛ وإذا العنوان غلط نقدر نعاونك نصححه، بلا ما نضمن وقت أقصر.`);
  }
  if (has(text, ['taille', 'couleur', 'adresse', 'erreur', 'mauvais', 'wrong', 'size', 'color', 'quantity', 'quantite', 'مقاس', 'لون', 'عنوان'])) {
    return localized(input,
      `Si le problème concerne un détail de la commande, je peux essayer de le corriger au lieu de tout annuler. Dites-moi le changement souhaité.`,
      `Ida lmochkil f détail ta3 commande, n9der nbdlou bla ma nlghiwha kamel. Goli wach hab tbedel.`,
      `إذا المشكل في تفصيل من الطلبية، نقدر نحاول نبدلو بلا ما نلغيوها كاملة. قولّي واش حاب تبدل.`);
  }
  return localized(input,
    `Merci de me l’avoir expliqué. Je peux vérifier avec la boutique si une modification peut résoudre le problème, sans rien vous imposer.`,
    `Saha 3la tawdih. N9der nchouf m3a lma7al ida kayen modification t7el lmochkil, bla ma ndir 3lik pressions.`,
    `شكراً على التوضيح. نقدر نتحقق مع المحل إذا كاين تعديل يحل المشكل، بلا ما نفرض عليك والو.`);
}

function askToConfirmCancellation(order: Record<string, any>, reason: string, input: unknown): string {
  const ref = orderLabel(order);
  const alternative = cancelAlternative(reason, input);
  const w = dealWords(order);
  return localized(input,
    `${alternative} Souhaitez-vous toujours annuler ${w.fr} ${ref} ? Répondez « Oui, annuler » pour confirmer ou « Non, garder ». Rien ne change avant votre confirmation.`,
    `${alternative} Hab mazal t'annuli ${w.dz} ${ref} ? Goli « oui, annule » pour confirmer wela « non, nkhaliha ». Ma yetbedel walo 7ta tconfirmi.`,
    `${alternative} ما زلت حاب تلغي ${w.ar} ${ref}؟ جاوب « نعم، ألغي » للتأكيد أو « لا، خليها ». ما يتبدل والو حتى تأكد.`);
}

function keepOrderReply(order: Record<string, any>, input: unknown): string {
  const w = dealWords(order);
  return localized(input,
    `D’accord, je ne change rien : ${w.fr} ${orderLabel(order)} reste comme elle est. Si vous souhaitez une modification plus tard, dites-moi laquelle.`,
    `D'accord, ma nbedel walo: ${w.dz} ${orderLabel(order)} yeb9a kif ma howa. Ida hab tbedel haja men ba3d, goli.`,
    `حسناً، ما نبدل والو: ${w.ar} ${orderLabel(order)} يبقى كيما هو. إذا حبيت تبدل حاجة من بعد، قولّي.`);
}

function updatedOrderReply(order: Record<string, any>, input: unknown): string {
  const w = dealWords(order);
  return localized(input,
    `C’est fait : la modification sur ${w.fr} ${orderLabel(order)} est enregistrée. La boutique la verra dans son suivi.`,
    `Srat: modification ta3 ${w.dz} ${orderLabel(order)} tsajlat. L'équipe ta3 lma7al tchoufha f suivi.`,
    `تم تسجيل التغيير على ${w.ar} ${orderLabel(order)}. المحل يشوفه في المتابعة.`);
}

function cancelledOrderReply(order: Record<string, any>, input: unknown): string {
  const w = dealWords(order);
  return localized(input,
    `${cap(w.fr)} ${orderLabel(order)} est annulée ; l’annulation apparaîtra dans le suivi de la boutique.`,
    `${cap(w.dz)} ${orderLabel(order)} t'annulat; l'annulation taban f suivi ta3 lma7al.`,
    `تم إلغاء ${w.ar} ${orderLabel(order)}، وسيظهر الإلغاء في متابعة المحل.`);
}

function selectOrderPrompt(type: OrderChangeType, orders: Array<Record<string, any>>, input: unknown): string {
  const refs = orders.slice(0, 5).map((order, index) => `${index + 1}. ${orderLabel(order)}`).join(' · ');
  if (type === 'cancel') return localized(input,
    `Vous avez plusieurs demandes en cours (${refs}). Laquelle souhaitez-vous annuler ? Indiquez sa référence.`,
    `3andek plusieurs demandes en cours (${refs}). Anahi wa7da hab t'annuli? Goli référence ta3ha.`,
    `عندك عدة طلبات قيد المتابعة (${refs}). أي واحد حاب تلغي؟ ابعثلي رقمه.`);
  return localized(input,
    `Vous avez plusieurs demandes en cours (${refs}). Laquelle souhaitez-vous modifier ? Indiquez sa référence.`,
    `3andek plusieurs demandes en cours (${refs}). Anahi wa7da hab tbedel? Goli référence ta3ha.`,
    `عندك عدة طلبات قيد المتابعة (${refs}). أي واحد حاب تبدل؟ ابعثلي رقمه.`);
}

function findSelectedOrder(input: unknown, orders: Array<Record<string, any>>): Record<string, any> | null {
  const text = normalize(input);
  const byReference = orders.find((order) => {
    const reference = normalize(orderLabel(order));
    return reference && text.includes(reference);
  });
  if (byReference) return byReference;
  if (orders.length === 2 && has(text, ['deuxieme', '2eme', 'second', 'second one', '2'])) return orders[1];
  if (has(text, ['premiere', '1ere', 'premier', 'first', 'first one', '1'])) return orders[0];
  if (orders.length === 2 && text === '2') return orders[1];
  if (text === '1') return orders[0];
  return null;
}

function startChange(order: Record<string, any>, type: OrderChangeType, input: unknown, nowIso: string): OrderChangeResult {
  const base = { type, orderId: order.id, reference: orderLabel(order), createdAt: nowIso, updatedAt: nowIso };
  if (type === 'cancel') {
    const reasonMatch = String(input || '').match(/(?:parce que|car|because|motif\s*[:：]|خاطر|بسبب|لأن)\s*(.+)$/i);
    const reason = reasonMatch ? cleanChangeText(reasonMatch[1]) : '';
    if (reason) {
      const draft = { ...base, status: 'awaiting_confirmation' as const, reason };
      return { handled: true, reply: askToConfirmCancellation(order, reason, input), orderChangeDraft: draft };
    }
    return {
      handled: true,
      reply: askWhyToCancel(order, input),
      orderChangeDraft: { ...base, status: 'awaiting_reason' },
    };
  }
  if (!cleanChangeText(input) || isVagueChangeRequest(input)) {
    return {
      handled: true,
      reply: askForChangeDetails(order, input),
      orderChangeDraft: { ...base, status: 'awaiting_details' },
    };
  }
  const requestedChanges = cleanChangeText(input);
  return {
    handled: true,
    reply: askToConfirmChange(order, requestedChanges, input),
    orderChangeDraft: { ...base, status: 'awaiting_confirmation', requestedChanges },
  };
}

function cancelOrder(
  orders: Array<Record<string, any>>,
  order: Record<string, any>,
  draft: OrderChangeDraft,
  nowIso: string,
  input: unknown,
): OrderChangeResult {
  const reason = String(draft.reason || '').trim().slice(0, 400);
  const event = { type: 'customer_cancellation', reason, confirmedAt: nowIso };
  const updatedOrders = orders.map((candidate) => candidate?.id === order.id
    ? {
        ...candidate,
        status: 'cancelled',
        updatedAt: nowIso,
        cancelledAt: nowIso,
        cancelledBy: 'customer',
        ...(reason ? { cancellationReason: reason } : {}),
        changeHistory: [...(Array.isArray(candidate.changeHistory) ? candidate.changeHistory : []), event].slice(-20),
      }
    : candidate);
  return { handled: true, reply: cancelledOrderReply(order, input), orderChangeDraft: null, orders: updatedOrders };
}

function applyModification(
  orders: Array<Record<string, any>>,
  order: Record<string, any>,
  draft: OrderChangeDraft,
  nowIso: string,
  input: unknown,
): OrderChangeResult {
  const changes = cleanChangeText(draft.requestedChanges);
  const event = { type: 'customer_modification', details: changes, requestedAt: draft.updatedAt, confirmedAt: nowIso };
  const facts = extractLeadFacts(changes);
  const normalized = normalize(changes);
  const addressMatch = changes.match(/(?:adresse(?:\s+de\s+livraison)?|delivery\s+address|address)\s*(?:est\s+|:|=|à\s+|a\s+|vers\s+|to\s+)?(.{4,180})$/i);
  const deliveryAddress = addressMatch?.[1]?.trim().replace(/[.,!?;:]+$/g, '');
  const hasStreetAddress = Boolean(deliveryAddress && (/[0-9]/.test(deliveryAddress) || deliveryAddress.trim().split(/\s+/).length >= 3));
  const updatedOrders = orders.map((candidate) => {
    if (candidate?.id !== order.id) return candidate;
    const update: Record<string, any> = {
      ...candidate,
      updatedAt: nowIso,
      summary: `${String(candidate.summary || dealKindLabel(candidate)).trim()}\n\nModification confirmée par le client : ${changes}`.slice(-2_000),
      changeHistory: [...(Array.isArray(candidate.changeHistory) ? candidate.changeHistory : []), event].slice(-20),
    };
    if (facts.phone && has(normalized, ['telephone', 'numero', 'phone', 'mobile'])) update.phone = facts.phone;
    if (facts.city && has(normalized, ['ville', 'city', 'adresse de livraison', 'livrer a', 'delivery to'])) update.city = facts.city;
    if (hasStreetAddress) update.deliveryAddress = deliveryAddress;
    if (facts.name && has(normalized, ['nom', 'name'])) update.customerName = facts.name;
    return update;
  });
  return { handled: true, reply: updatedOrderReply(order, input), orderChangeDraft: null, orders: updatedOrders };
}

function isUncertain(input: unknown): boolean {
  return new Set(['je ne sais pas', 'je sais pas', 'jsp', 'i dont know', 'not sure', 'معرفتش', 'ما نعرفش']).has(normalize(input));
}

/** Traite un message de gestion de commande, sans jamais appliquer un changement implicite. */
export function processOrderChangeMessage(input: {
  message: unknown;
  orders?: Array<Record<string, any>>;
  draft?: OrderChangeDraft | null;
  now?: Date;
}): OrderChangeResult {
  const message = String(input.message || '').trim();
  const orders = Array.isArray(input.orders) ? input.orders : [];
  const draft = input.draft && typeof input.draft === 'object' ? input.draft : null;
  const nowIso = (input.now || new Date()).toISOString();
  const intent = detectOrderManagementIntent(message);

  if (!draft && !intent) return { handled: false };
  if (draft && (!normalize(message) || /^(?:image envoyee|contenu instagram partage format non identifie|piece jointe recue)$/.test(normalize(message)))) {
    return {
      handled: true,
      reply: localized(message,
        'Pour continuer, écrivez le détail de la modification ou le motif d’annulation dans un message.',
        `Bach nkemlo, ekteb détail ta3 modification wela 3lach hab t'annuli f message.`,
        `باش نكملو، اكتبلي واش حاب تبدل أو علاش حاب تلغي في رسالة.`),
      orderChangeDraft: { ...draft, updatedAt: nowIso },
    };
  }

  let order: Record<string, any> | null = null;
  if (draft?.orderId) order = orders.find((candidate) => candidate?.id === draft.orderId) || null;
  if (draft?.status === 'awaiting_order_selection') {
    const candidates = editableOrders(orders).filter((candidate) => (draft.orderIds || []).includes(candidate.id));
    if (!candidates.length) {
      return {
        handled: true,
        reply: localized(message,
          'Ces commandes ne sont plus modifiables depuis cette conversation. Contactez la boutique pour vérifier leur état.',
          `Had les commandes ma walawch n9dro nbdlouhom hna. 3ayet lma7al bach yverifiw l'état ta3hom.`,
          `هاذ الطلبيات ما بقاوش قابلين للتعديل من هنا. تواصل مع المحل باش يتأكد من حالتهم.`),
        orderChangeDraft: null,
      };
    }
    const selected = findSelectedOrder(message, candidates);
    if (!selected) {
      return {
        handled: true,
        reply: selectOrderPrompt(draft.type, candidates, message),
        orderChangeDraft: { ...draft, updatedAt: nowIso },
      };
    }
    return startChange(selected, draft.type, '', nowIso);
  }

  if (draft && !order) {
    return {
      handled: true,
      reply: localized(message,
        'Je ne retrouve plus cette commande dans le suivi. Contactez la boutique pour vérifier son état.',
        `Ma l9itch had la commande f suivi. 3ayet lma7al bach yverifiw l'état ta3ha.`,
        `ما لقيتش هاذ الطلبية في المتابعة. تواصل مع المحل باش يتأكد من حالتها.`),
      orderChangeDraft: null,
    };
  }

  if (draft && order && !EDITABLE_STATUSES.has(String(order.status))) {
    return { handled: true, reply: orderStatusMessage(order, message), orderChangeDraft: null };
  }

  if (draft && order) {
    if (draft.status === 'awaiting_reason') {
      if (isOrderChangeRefusal(message)) return { handled: true, reply: keepOrderReply(order, message), orderChangeDraft: null };
      if (intent === 'modify') return startChange(order, 'modify', message, nowIso);
      if (isExplicitCancellationConfirmation(message)) return cancelOrder(orders, order, draft, nowIso, message);
      if (isAffirmative(message)) {
        return {
          handled: true,
          reply: localized(message,
            `Le motif est facultatif. Si vous confirmez l’annulation de ${orderLabel(order)}, répondez « Oui, annuler ». Sinon, dites-moi ce qui vous gêne et je chercherai une autre solution. Rien n’est annulé pour l’instant.`,
            `Le motif machi obligatoire. Ida tconfirmi l'annulation ta3 ${orderLabel(order)}, goli « oui, annule ». Sinon goli wach rah y9ale9ek bach nchoufou solution. Mazal ma t'annalat walo.`,
            `السبب ماشي ضروري. إذا تأكدلي إلغاء ${orderLabel(order)}، جاوب « نعم، ألغي ». أو قولّي واش مقلقك باش نشوفو حل آخر. مازال ما تلغات والو.`),
          orderChangeDraft: { ...draft, updatedAt: nowIso },
        };
      }
      const reason = cleanChangeText(message);
      const nextDraft = { ...draft, status: 'awaiting_confirmation' as const, reason, updatedAt: nowIso };
      return { handled: true, reply: askToConfirmCancellation(order, reason, message), orderChangeDraft: nextDraft };
    }

    if (draft.status === 'awaiting_details') {
      if (isOrderChangeRefusal(message)) return { handled: true, reply: keepOrderReply(order, message), orderChangeDraft: null };
      if (intent === 'cancel') return startChange(order, 'cancel', message, nowIso);
      if (isUncertain(message) || isVagueChangeRequest(message)) {
        return { handled: true, reply: askForChangeDetails(order, message), orderChangeDraft: { ...draft, updatedAt: nowIso } };
      }
      const requestedChanges = cleanChangeText(message);
      const nextDraft = { ...draft, status: 'awaiting_confirmation' as const, requestedChanges, updatedAt: nowIso };
      return { handled: true, reply: askToConfirmChange(order, requestedChanges, message), orderChangeDraft: nextDraft };
    }

    if (draft.status === 'awaiting_confirmation') {
      if (isOrderChangeRefusal(message)) return { handled: true, reply: keepOrderReply(order, message), orderChangeDraft: null };
      if (draft.type === 'cancel' && intent === 'modify') return startChange(order, 'modify', message, nowIso);
      if (draft.type === 'modify' && intent === 'cancel') return startChange(order, 'cancel', message, nowIso);
      if (draft.type === 'cancel' && (isExplicitCancellationConfirmation(message) || isAffirmative(message))) {
        return cancelOrder(orders, order, draft, nowIso, message);
      }
      if (draft.type === 'modify' && isAffirmative(message)) return applyModification(orders, order, draft, nowIso, message);
      if (draft.type === 'cancel') {
        const reason = cleanChangeText(message);
        const nextDraft = { ...draft, reason, updatedAt: nowIso };
        return { handled: true, reply: askToConfirmCancellation(order, reason, message), orderChangeDraft: nextDraft };
      }
      if (isUncertain(message) || isVagueChangeRequest(message)) {
        return { handled: true, reply: askForChangeDetails(order, message), orderChangeDraft: { ...draft, status: 'awaiting_details', updatedAt: nowIso } };
      }
      const requestedChanges = cleanChangeText(message);
      const nextDraft = { ...draft, requestedChanges, updatedAt: nowIso };
      return { handled: true, reply: askToConfirmChange(order, requestedChanges, message), orderChangeDraft: nextDraft };
    }
  }

  if (!intent) return { handled: false };
  const editable = editableOrders(orders);
  if (editable.length > 1) {
    const candidateOrders = editable.slice(0, 5);
    return {
      handled: true,
      reply: selectOrderPrompt(intent, candidateOrders, message),
      orderChangeDraft: {
        type: intent,
        status: 'awaiting_order_selection',
        orderIds: candidateOrders.map((candidate) => candidate.id),
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    };
  }
  if (editable.length === 1) return startChange(editable[0], intent, message, nowIso);

  const latest = orders.slice().sort((a, b) => Date.parse(String(b?.createdAt || '')) - Date.parse(String(a?.createdAt || '')))[0];
  return {
    handled: true,
    reply: latest ? orderStatusMessage(latest, message) : localized(message,
      'Je ne vois pas de commande en cours dans cette conversation. Si vous avez une référence, envoyez-la à la boutique pour vérification.',
      `Ma banlich hata commande en cours f had la conversation. Ida 3andek référence, siftha lma7al bach yverifiwha.`,
      `ما بانليش طلبية قيد المتابعة في هاذ المحادثة. إذا عندك رقم الطلبية ابعثه للمحل باش يتأكد.`),
    orderChangeDraft: null,
  };
}
