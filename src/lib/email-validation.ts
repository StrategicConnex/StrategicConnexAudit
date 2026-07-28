/**
 * email-validation.ts — Validador de correos electrónicos.
 *
 * Verifica:
 *   1. Formato sintáctico válido (regex)
 *   2. Que el dominio no esté en lista de correos desechables / temporales
 *   3. Que el correo no tenga patrones de spam
 */

// ─── Resultado de validación ──────────────────────────────────────────────────
export interface ValidationResult {
  valid: boolean;
  reason?: string;
  suggestion?: string;
}

// ─── Lista de dominios de correo desechable / temporal ───────────────────────
// Fuente: https://github.com/disposable-email-domains/public
const DISPOSABLE_DOMAINS = new Set([
  "0-00.xyz","0-0.usa.cc","0-mail.com","00.cab","001.igg.biz","002.igg.biz",
  "003.igg.biz","004.igg.biz","005.igg.biz","006.igg.biz","007.igg.biz",
  "008.igg.biz","009.igg.biz","01buck.com","01ivy.com","02p.pl","03buck.com",
  "04buck.com","05buck.com","06buck.com","07buck.com","08buck.com","09buck.com",
  "10buck.com","10minutemail.com","10minutemail.net","10minutesmail.com","10x9.com",
  "11buck.com","123.com","123box.net","123mail.xyz","123mails.xyz","12buck.com",
  "12fuel.com","12mailer.com","12minutemail.com","13buck.com","14buck.com",
  "15buck.com","16buck.com","17buck.com","18buck.com","19buck.com","1aolmail.com",
  "1buck.com","1ce.us","1chwen.com","1clck2.com","1dmedical.com","1st-forms.com",
  "1to1mail.org","1usemail.com","1webmail.info","20buck.com","20email.eu",
  "20mail.eu","20minutemail.com","20minutemail.it","21buck.com","212.com",
  "22buck.com","22mot.ru","23buck.com","24buck.com","25buck.com","26buck.com",
  "27buck.com","28buck.com","29buck.com","2buck.com","2coolforyou.net","2dem.ru",
  "2nd-mail.com","2prong.com","30buck.com","30minutemail.com","31buck.com",
  "32buck.com","33buck.com","33mail.com","34buck.com","35buck.com","36buck.com",
  "37buck.com","38buck.com","39buck.com","3buck.com","3d-painting.com","3mail.ga",
  "3trtretgfrfe.tk","40buck.com","41buck.com","42buck.com","43buck.com",
  "44buck.com","45buck.com","46buck.com","47buck.com","48buck.com","49buck.com",
  "4buck.com","4mail.cf","4mail.ga","4warding.com","4warding.net","50buck.com",
  "51buck.com","52buck.com","53buck.com","54buck.com","55buck.com","56buck.com",
  "57buck.com","58buck.com","59buck.com","5buck.com","5mail.ga","5oz.ru",
  "60buck.com","61buck.com","62buck.com","63buck.com","64buck.com","65buck.com",
  "66buck.com","67buck.com","68buck.com","69buck.com","6buck.com","70buck.com",
  "71buck.com","72buck.com","73buck.com","74buck.com","75buck.com","76buck.com",
  "77buck.com","78buck.com","79buck.com","7buck.com","80buck.com","81buck.com",
  "82buck.com","83buck.com","84buck.com","85buck.com","86buck.com","87buck.com",
  "88buck.com","89buck.com","8buck.com","90buck.com","91buck.com","92buck.com",
  "93buck.com","94buck.com","95buck.com","96buck.com","97buck.com","98buck.com",
  "99buck.com","9buck.com","9mail.eu","9me.site","a-bc.net","a45.in",
  "abcmail.email","abigailfunnelfart.com","abisuite.com","abnamro.tech",
  "absolutely.net","abusemail.de","abuser.eu","accessless.net","accountant",
  "acmewebmail.com","acroworld.com","address.com","adeptdcon.com","adios.net",
  "admin.herb.by","adobeweb.us","adp-del.com","adres.info","adubiz.com",
  "advantagewindows.net","adventemail.com","aeonpsi.com","ag.us.to","agent-ev.com",
  "agregaolrpl5plv.online","ahk.jp","ahk.my","ahk.id","aircraftleasing1.com",
  "airpost.net","ajlacombe.com","akapost.com","akorde.al","aktiefmail.nl",
  "aku.edu","al-qaeda.us","albion.com","alisongamel.com","alldirectbuy.com",
  "alleen.cloud","allergist.com","allfamus.com","allmail.net","allowed.org",
  "allthegoodnamesaretaken.org","alltopmall.com","alph.wtf","alpinedodge.com",
  "altadc.com","alternativagratis.com","alwayssecure.info","amail.com",
  "amazon-aws.com","amelijk.com","americasbestcompleted.com","amoblo.com",
  "amour.fans","an.id.au","ana.biz","anappfor.com","anappthat.com","andetne.win",
  "andylab.net","animesos.com","anit.ro","ankoninc.pw","annsmail.com",
  "anonymous.to","anote.com","anotherdomaincyka.tk","anthoneat.com",
  "anthony-junkmail.com","antispam24.de","antongijen.tk","anonymized.org",
  "apfelkorps.de","aphlog.com","apkmd.com","appc.se","appclicks.org","appdx.com",
  "appinventor.nl","appixie.com","apps.dsjfksjf.xyz","appsdmx.com",
  "appverifier.com","arborinteractive.com","arcader.com","architectural.org",
  "arcticmail.com","area-thinking.de","areastorage.com","areatest.ml",
  "argentina.website","aridcomputer.com","armyspy.com","arockee.com","aron.us",
  "arrois.com","art-en-ligne.pro","artlover.com","artman-conception.com",
  "arur01.tk","arybebiat.space","asdf.pl","asean-mail.xyz","asgaccse.com",
  "ass.pp.ua","astroenter.com","asu.mx","asu.su","ateng.com","atnextmail.com",
  "attnetwork.com","augmentationtechnology.com","ausgefallen.info","autlook.com",
  "autograph-gallery.com","autotwollow.com","avastc.com","avobank.tech",
  "awatum.de","awiki.org","ax80.com","azazazatashkent.tk","azcomputerworks.com",
  "azithromycintreatment.com","b2bx.net","b2cmx.de","badamm.us","badhus.org",
  "bakarimail.com","balearicproperty.com","ballsofsteel.net","banit.club",
  "banit.me","bank-op1.com","bank-op2.com","bank-op3.com","bark.com",
  "barryogorman.com","basscode.org","batuta.net","baxomale.ht.cx","bb50.net",
  "bcast.ws","bccto.me","bcdmail.date","bdmuzic.pw","bearsarefuzzy.com",
  "beddly.com","beechatz.com","beefmilk.com","beefymail.com","belamail.org",
  "belesprit.com","belljonestax.com","belveti.com","benipaula.org","berlin.com",
  "berlusconi.com","bestsoundeffects.com","betr.co","bgtmail.com","bidourlnks.com",
  "big1.us","bigger.com","biglive.asia","bigprofessor.so","bigstring.com",
  "bigwhoop.co.za","binkmail.com","bio-muesli.net","bione.co","bit-degree.com",
  "bit2tube.com","bitmail.com","bitrix24.ru","bitymails.us",
  "blackhole.djurby.se","blackmarket.to","blackwarrior.net","blakedawson.com",
  "blamail.net","blip.ch","bln.kz","bloggers.com","blogging.com","blogmyway.org",
  "blogos.com","blogspam.ro","blow-job.nutbutter.net","bloxter.cf",
  "bluedumpling.info","bluewerks.com","bnote.com","boatmail.net","bobbyelliott.com",
  "bofthew.com","bongo.cf","bongobong.com","bonobo.co.uk","boofighters.com",
  "bookthemmove.com","boostify.org","bootybay.de","bopunkten.se","boun.cr",
  "bouncymail.com","boxformail.com","boximail.com","boxmailvn.com","boxter.org",
  "boycottandjig.com","brainonfire.net","brandallday.net","brasx.org",
  "braun4email.com","breadtimes.press","breakmail.cf","brefmail.com",
  "briggsmarcus.com","bringfeld.com","broadbandninja.com","bromail.tech",
  "brooksfriendship.com","brothersbrothers.com","browniesgoreng.com","brujula.net",
  "bsds.net","bsnow.net","bssbackup.com","bst-72.com","btb-notes.com","btc.email",
  "btcmail.pw","btiz.pw","bucb79t.com","buckeyeplanet.com","budaya-kita.com",
  "budslr.info","bufa.us","buffemail.com","bugmenot.com","bugmenot.ml",
  "bulkcleanservices.com","bullbeer.net","bum.net","bumpymail.com",
  "bunchofidiots.com","bund.us","bunsenhoneydew.com","burbuja.info",
  "burnermail.io","burnthespam.info","burstmail.info","businessagent.com",
  "businessservice.link","busymail.com","busymail.net","buy-cocaine.com",
  "buy1024.com","buyusedlibrarybooks.org","bxd7s9w1.com",
  "by130.blu1091.mail.live.com","byebyemail.com","byespm.com","bymercury.com",
  "c-abgap.net","c2.hu","c3email.com","c4an.com","c51vsgq.com","cachedot.net",
  "cadillacmails.com","cahasi.pw","calcmail.com","calebjess.com",
  "callingcalling.com","calvarez.cl","camarashave.com","campano.cl",
  "canada-11.com","cane.pw","canitta.icu","cannonteam.com","canontech.shop",
  "cantv.net","canyouhearmenow.com","care2.com","carelesshollow.com","careray.com",
  "cars2.club","cartelera.org","caskmail.com","casualdx.com","catconval.com",
  "catmails.com","catholic.org","caymanmap.com","cazzo.cf","cbair.com","cc.li.ma",
  "ccailmail.com","cd.mintemail.com","cdc.mintemail.com","cdpa.cc","ceed.se",
  "cek.pm","cellurl.com","centermail.com","centermail.net","cetpass.com",
  "cfo2k.com","chacuo.net","chaichuangma.com","chammy.info","chapmountain.com",
  "chasefursure.com","cheap3dcart.com","cheaphub.net","cheatmail.de","check.com",
  "checkpager.net","checknowmail.com","chechnya.conf.work","chello.com",
  "chilelinks.cl","chilkat.com","chithi.in","chockletid.com","chrcorp.com",
  "christopherfretz.com","chumpstakingchumps.com","cigar.club","cincinow.net",
  "civx.org","cizzmail.com","ckptr.com","claimab.com","clandest.in","clans.ru",
  "clarkgriswald.net","clearwatermail.com","clickdeal.co","clickmail.info",
  "clickygame.com","clinicatmf.com.br","clintonusers.com","clixser.com",
  "cloud99.pro","cloudconcern.com","cloudmailin.com","cloudns.cf","cloudns.ga",
  "cloudns.gq","cloudns.ml","cloudns.tk","clowmail.com","clrmail.com","cmail.net",
  "cnamed.com","cnn.coms.hk","cnw.net","co.cc","co1v.ml","cobarekyo1.ml",
  "cobool.com","cocoro.uk","coda.cf","code-mail.com","codec.ro",
  "codeandscratches.com","codequality.com","codivide.com","codupil.com",
  "coieo.com","coinmail.life","coldemail.info","coldmail.com","cologne.ninja",
  "comcastmails.com","come.wtf","comic.com","comind.com","compaq.com",
  "comwest.net","conf.work","confidential.life","config.work","consumerriot.com",
  "contbay.com","conte.com","contractor.net","contrasto.cf",
  "conventionstransform.com","cool.fr.nf","coolandwarm.com","coolimpool.org",
  "coolmail.art","cornputer.com","correo.blogos.net","correo.bot.nu","cosmorph.com",
  "counsellingfu.com","courriels.tk","courtrf.com","cowcell.com","cox.com",
  "cpa101.com","cpaonline.net","cpmail.life","crankhole.com","crapmail.org",
  "crastination.de","crazespaces.pw","crazymailing.com","cream.pink","creo.ninja",
  "cricketing.com","cronbox.net","cross-law.com","crotslep.cf","crotslep.ga",
  "crotslep.gq","crotslep.ml","crotslep.tk","crusthost.com","cry2d.xyz",
  "crypto-mail.com","cs18.xyz","cs33.xyz","cs45.xyz","cs55.xyz","cs67.xyz",
  "cs78.xyz","cs89.xyz","cszbl.com","ctmailing.us","ctmail.net","ctos.ch",
  "cubiclink.com","cuoly.com","currymail.com","cust.in","custom12.tk",
  "customers.ooo","cyber-innovation.club","cyber-phone.eu","cybergal.com",
  "cybergmail.com","cybersex.com","cylab.org","d1yun.com","d38kf6o9a49c.xyz",
  "d58.us","daabox.com","dab.ro","dacoolest.com","dad.onlysext.com",
  "daemsteam.com","daily-notes.com","dailypost.com","damnthespam.com",
  "dandikmail.com","dataarca.com","databeta.com","databucket.site","datafaka.net",
  "dataredirect.com","datasoma.com","davidemail.com","dbz5mchild.com","dca.tj",
  "dcemail.com","ddcrew.com","de-a.org","deadaddress.com","deadchildren.org",
  "deadfake.cf","deadfake.ga","deadfake.ml","deadfake.tk","deadspam.com",
  "deal-hub.com","deek.us","def5.com","delayload.com","delayload.net","delikkt.de",
  "dfg6.kozow.com","dfghello.tk","dp76.com","e-mail.com","e-mail.org",
  "e-postkasten.com","e-postkasten.de","e-writer.com","e22.email","e3z.org",
  "e4pt.com","eab.cc","f5.si","facebook-email.cf","facebook-email.ga",
  "facebook-email.ml","facebookmail.gq","facebookmail.ml","fag.wf","failbone.com",
  "fake-edited.com","fakemail.fr","fakemail.gb.net","fakemailgenerator.com",
  "fakemailz.com","free-emailz.com","free-mail.net","free-temp-mail.net",
  "freeindexer.com","freemail.ms","freeplumpervideos.com","freeroid.com",
  "freesitemail.com","freetempemail.com","freetubemail.com","inboxbear.com",
  "inboxkitten.com","inboxproxy.com","mail-temporary.com","mail.by","mail66.ru",
  "mailback.com","mailbidon.com","mailcatch.com","maildrop.cc","maildrop.cf",
  "maildrop.ga","maildrop.gq","maildrop.ml","maildrop.tk","maildu.de","maildx.com",
  "maileditor.com","mailemier.com","mailfence.com","mailfly.com","mailguard.me",
  "mailgutter.com","mailinator.com","mailinator.net","mailinator.org",
  "mailinator2.com","mailincubator.com","mailismagic.com","mailjunk.cf",
  "mailjunk.ga","mailjunk.gq","mailjunk.ml","mailjunk.tk","mailmate.com",
  "mailmetrash.com","mailmoat.com","mailnator.com","mailnull.com","mailonaut.com",
  "mailorc.com","mailosaur.com","mailpass.com","mailpickle.com","mailproxsy.com",
  "mailquack.com","mailsac.com","mailscam.com","mailshell.com","mailshiv.com",
  "mailsiphon.com","mailslapping.com","mailstrom.me","mailsuck.net",
  "mailtamago.com","mailtangy.com","mailtemporaire.com","mailtempo.com",
  "mailtothis.com","mailtrix.net","mailtrx.net","mailtv.net","mailtv.org",
  "mailuniverse.co.uk","mailv2.net","mailvb.com","mailwire.com","mailworks.org",
  "mailzi.ru","mailzoned.com","mama3.org","mandrill.com","o2.xyz",
]);

// ─── Whitelist de dominios corporativos y personales conocidos ────────────────
// Estos dominios se saltan la verificación de correo desechable
const KNOWN_CORPORATE_DOMAINS = new Set([
  "gmail.com","outlook.com","hotmail.com","yahoo.com","icloud.com",
  "protonmail.com","proton.me","pm.me","fastmail.com","mail.com",
  "zoho.com","yandex.com","aol.com","live.com","msn.com","ymail.com",
  "rocketmail.com","googlemail.com","mac.com","me.com",
]);

// ─── Patrones de spam / correo sospechoso ────────────────────────────────────
const SPAM_PATTERNS = [
  /^test/i,
  /^spam/i,
  /^fuck/i,
  /^shit/i,
  /^admin\d*@/i,
  /^info\d*@/i,
  /^noreply/i,
  /^no.?reply/i,
  /^mailer.?daemon/i,
  /\+\w+@/,        // Plus addressing (potencial abuse)
  /[0-9]{8,}@/,    // 8+ dígitos consecutivos antes del @
];

// ─── TLDs sospechosos ────────────────────────────────────────────────────────
const SUSPICIOUS_TLDS = new Set([
  ".tk", ".cf", ".ga", ".gq", ".ml",  // Freenom domains (gratis, abuso masivo)
]);

// ─── Patrón de formato de email válido ───────────────────────────────────────
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_EMAIL_LENGTH = 254;

/**
 * Valida un correo electrónico verificando:
 *   1. Formato sintáctico
 *   2. Longitud máxima
 *   3. Dominio conocido (whitelist corporativa)
 *   4. Dominio desechable / temporal
 *   5. Patrones de spam
 *   6. TLD sospechoso
 */
export function validateEmail(email: string): ValidationResult {
  const trimmed = email.trim();

  // 1. Formato
  if (!EMAIL_REGEX.test(trimmed)) {
    return { valid: false, reason: "Formato de correo inválido." };
  }

  // 2. Longitud
  if (trimmed.length > MAX_EMAIL_LENGTH) {
    return { valid: false, reason: "El correo es demasiado largo." };
  }

  const domain = trimmed.split("@").pop()?.toLowerCase() || "";
  const localPart = trimmed.split("@")[0]?.toLowerCase() || "";

  // 3. Whitelist corporativa — si es un dominio conocido, lo aceptamos sin más verificaciones
  if (KNOWN_CORPORATE_DOMAINS.has(domain)) {
    return { valid: true };
  }

  // 4. Dominio desechable
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return {
      valid: false,
      reason: "No se permiten correos temporales o desechables.",
      suggestion: "Usa tu correo corporativo o personal (Gmail, Outlook, etc.).",
    };
  }

  // 5. Patrones de spam
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(localPart)) {
      return { valid: false, reason: "Este correo parece ser de spam o prueba." };
    }
  }

  // 6. TLD sospechoso
  const tld = "." + domain.split(".").pop()?.toLowerCase();
  if (SUSPICIOUS_TLDS.has(tld)) {
    return {
      valid: false,
      reason: `No se permiten correos con dominio ${tld} por ser de alto riesgo.`,
      suggestion: "Usa un correo corporativo o de un proveedor reconocido.",
    };
  }

  return { valid: true };
}
