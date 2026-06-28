import { useState, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

/*
  ИЛЛЮСТРАТИВНАЯ МОДЕЛЬ кумулятивного риска ЗППП во времени. Не медицинский прогноз.
  Поведение задаётся тремя типами партнёров (постоянные / приходящие / хукапы), у каждого
  своя частота, длительность, презерватив, проверенность и фон среды (ассортативность).
  Вид секса (вагинальный/анальный/оральный × роль) — множитель к β за акт (опора на ВИЧ), практики
  складываются аддитивно: в каждом контакте присутствует каждая выбранная практика.
  Для типа: выживаемость за контакт = ∏ практик (1 − β·множитель·(1 − φ·e)·прививка);
  риск с заражённым партнёром = 1 − (выживаемость_за_контакт)^k;
  × p·фон·(1 − проверенность); вклады перемножаются по всем партнёрам; разворачивается во времени.
  ✓ grounded=true  → опирается на данные (сплошная линия)
  ◌ grounded=false → грубая оценка (пунктир); надёжных per-act чисел нет
*/

// Слейт-палитра (ЗППП) и фиалковая (Беременность) — одинаковый фон/панели, разный акцент.
const CS = { bg:"#0f141a", panel:"#161d26", panel2:"#1b2430", border:"#283442", hi:"#e8edf2", mid:"#9fb0c0", dim:"#64748b", accent:"#f0a500" };
const CP = { bg:"#0f141a", panel:"#161d26", panel2:"#1b2430", border:"#283442", hi:"#e8edf2", mid:"#9fb0c0", dim:"#64748b", accent:"#a78bfa" };
let C = CS; // активная палитра — переключается по режиму в App
let PREG = C.accent; // тематический цвет беременности = активный C.accent

// Цифры и математика — основной публичный режим (показываются всем).
// Флаг оставлен, чтобы при желании можно было снова спрятать числа одной строкой (DEV = false).
let DEV = true;
// Донат-строка в подвале временно скрыта. Чтобы вернуть — поставь true (и впиши свои ссылки Ko-fi/Liberapay).
let DONATE_ENABLED = false;
const SEV = { 5:"#ff3b3b", 4:"#ff7b00", 3:"#ffc300", 2:"#b5d600", 1:"#38d9a9" };

// === Тайминги анимации сценария «Риск ВИЧ» (мс) — НАСТРАИВАЙ ЗДЕСЬ руками ===
// Можно менять и вживую из консоли браузера: например `HIV_FX.ribbon = 2000`.
const HIV_FX = {
  intro: 260,           // пауза после клика «Риск ВИЧ» перед первым контролом
  scroll: 850,          // длительность плавной (eased) докрутки к контролу
  afterScroll: 120,     // пауза после докрутки, перед запуском рибона
  ribbon: 600,         // длительность полёта рибона до настройки
  ribbonFade: 300,      // затухание рибона после прилёта
  betweenSteps: 300,   // пауза после подсветки контрола — перед следующим
  moreFade: 1000,        // длительность анимации ПОЯВЛЕНИЯ надписи «Подробнее» (плавный въезд)
  condomDrop: 900,      // плавное опускание ползунка презерватива до 0
  highlightHold: 20000, // сколько держится подсветка контрола (кольцо/ручка)
};
if (typeof window !== "undefined") window.HIV_FX = HIV_FX; // доступ для ручной правки из консоли

const CDC = "CDC";
const WHO = { en: "WHO", ru: "ВОЗ", sr: "SZO" };
// acc уровни — ключи "high"|"low-mid"|"low"; локализуются через L.acc[...]
const STIS = [
  { key: "hiv", label: { en: "HIV", ru: "ВИЧ", sr: "HIV" }, color: "#4dabf7", sev: 5, p: 0.002, beta: 0.0008, e: 0.80, grounded: true,
    treat: { en: "Incurable — lifelong therapy", ru: "Неизлечимо — пожизненная терапия", sr: "Neizlečiv — doživotna terapija" },
    cons: { en: "Untreated → AIDS, immune collapse", ru: "Без лечения — СПИД, иммунный отказ", sr: "Bez lečenja → SIDA, slom imuniteta" },
    acc: "high",
    src: { en: "Per-act transmission: Patel 2014 (CDC) — receptive vaginal 8 per 10,000. Condom and anal-sex details — in «Prevention».",
      ru: "Передача за акт: Patel 2014 (CDC) — рецепт. вагинальный 8 на 10 000. Про презерватив и анальный секс — в «Предотвращении».",
      sr: "Prenos po aktu: Patel 2014 (CDC) — receptivni vaginalni 8 na 10.000. O kondomu i analnom seksu — u „Prevenciji“." },
    guide: {
      symptoms: {
        en: "Within 2–4 weeks some infected people get a flu-like syndrome (fever, rash, sore throat, swollen lymph nodes). Then years with no symptoms while immunity is gradually destroyed.",
        ru: "Через 2–4 недели у части заражённых — гриппоподобный синдром (лихорадка, сыпь, боль в горле, увеличение лимфоузлов). Затем годами без симптомов, пока иммунитет постепенно разрушается.",
        sr: "Tokom 2–4 nedelje kod dela zaraženih javlja se sindrom nalik gripu (groznica, osip, bol u grlu, otečeni limfni čvorovi). Zatim godinama bez simptoma dok se imunitet postepeno uništava." },
      treatment: {
        en: "There is no cure, but antiretroviral therapy (a lifelong course of pills) suppresses the virus to undetectable levels — people live long, and when «undetectable» they do not transmit the virus sexually (the «U=U» principle: undetectable = untransmittable). Prevention: pills taken before possible exposure (PrEP, pre-exposure prophylaxis), or an emergency course within 72 h after contact (PEP, post-exposure prophylaxis).",
        ru: "Излечения нет, но антиретровирусная терапия (пожизненный приём таблеток) подавляет вирус до неопределяемого уровня — человек живёт долго и при «неопределяемом уровне» не передаёт вирус половым путём.",
        sr: "Lek ne postoji, ali antiretrovirusna terapija (doživotno uzimanje tableta) potiskuje virus do nedetektabilnog nivoa — osoba živi dugo i pri „nedetektabilnom“ ne prenosi virus polnim putem (princip „U=U“: nedetektabilno = neprenosivo). Prevencija: tablete pre mogućeg kontakta (PrEP, pre-ekspoziciona profilaksa) ili hitni kurs u roku od 72 h posle kontakta (PEP, post-ekspoziciona profilaksa)." },
      consequences: {
        en: "Untreated → AIDS: severe immunodeficiency, opportunistic infections and tumors, death.",
        ru: "Без лечения — СПИД: тяжёлый иммунодефицит, оппортунистические инфекции и опухоли, смерть.",
        sr: "Bez lečenja → SIDA: teška imunodeficijencija, oportunističke infekcije i tumori, smrt." },
      prevent: {
        en: "Condoms cut the risk ~80% (Cochrane); receptive anal sex is ~17× riskier than vaginal, so be extra careful there. PrEP (pills before possible exposure) and PEP (an emergency course within 72 h after) strongly lower the risk; on treatment, a partner who is «undetectable» does not transmit it (U=U). Test regularly.",
        ru: "Презерватив снижает риск ~80% (Cochrane); рецептивный анальный секс ~в 17 раз опаснее вагинального. PrEP (таблетки до возможного контакта) и PEP (экстренный курс в течение 72 ч после) сильно снижают риск; при лечении партнёр с «неопределяемым» вирусом его не передаёт. Регулярное тестирование.",
        sr: "Kondom smanjuje rizik ~80% (Cochrane); receptivni analni seks je ~17× rizičniji od vaginalnog — tu poseban oprez. PrEP (tablete pre mogućeg kontakta) i PEP (hitni kurs u roku od 72 h posle) snažno smanjuju rizik; uz lečenje, partner sa „nedetektabilnim“ virusom ga ne prenosi (U=U). Testiraj se redovno." },
      sources: [{ label: CDC, url: "https://www.cdc.gov/hiv/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/hiv-aids" }] } },
  { key: "hpv", label: { en: "HPV", ru: "ВПЧ", sr: "HPV" }, color: "#ff4d6d", sev: 4, p: 0.25, beta: 0.40, e: 0.40, grounded: false,
    vax: { ve: 0.85, note: { en: "More effective before sexual debut; ~90% of oncogenic types, but not all. Estimate.", ru: "Эффективнее до начала половой жизни; ~90% онкогенных типов, но не все. Оценка.", sr: "Efikasnija pre početka polnog života; ~90% onkogenih tipova, ali ne svi. Procena." } },
    treat: { en: "No drug; oncogenic", ru: "Нет лекарства; онкогенен", sr: "Nema leka; onkogen" },
    cons: { en: "Cancer (cervix, throat, anus), warts", ru: "Рак, кондиломы", sr: "Rak (grlić, grlo, anus), kondilomi" },
    acc: "low",
    src: { en: "Per-act transmission — rough estimate; HPV is highly contagious. Condom ~40% (CDC). Vaccine protects. Prevalence (p=25%): any genital HPV ~42.5% among adults 18–59, high-risk types ~22.7% (NHANES 2013–2014, NCHS Data Brief 280).",
      ru: "Передача за акт — грубая оценка; ВПЧ очень заразен. Презерватив ~40% (CDC). Защищает прививка. Распространённость (p=25%): любой генитальный ВПЧ ~42,5% среди взрослых 18–59 лет, высокоонкогенные типы ~22,7% (NHANES 2013–2014, NCHS Data Brief 280).",
      sr: "Prenos po aktu — gruba procena; HPV je veoma zarazan. Kondom ~40% (CDC). Vakcina štiti. Rasprostranjenost (p=25%): bilo koji genitalni HPV ~42,5% među odraslima 18–59, visokorizični tipovi ~22,7% (NHANES 2013–2014, NCHS Data Brief 280)." },
    guide: {
      symptoms: {
        en: "Most often no symptoms; in 9 of 10 cases the infection clears on its own within ~2 years. Some types cause genital warts; oncogenic types are silent and found by screening.",
        ru: "Чаще всего бессимптомно; в 9 из 10 случаев инфекция уходит сама за ~2 года. Некоторые типы дают генитальные кондиломы (бородавки); онкогенные типы протекают скрыто и выявляются скринингом.",
        sr: "Najčešće bez simptoma; u 9 od 10 slučajeva infekcija prolazi sama za ~2 godine. Neki tipovi izazivaju genitalne kondilome (bradavice); onkogeni tipovi teku skriveno i otkrivaju se skriningom." },
      treatment: {
        en: "There is no drug against the virus itself — manifestations are treated: warts are removed, precancerous cervical changes are monitored and treated. Reliably prevented by vaccine (best before sexual debut).",
        ru: "Лекарства от самого вируса нет — лечат проявления: кондиломы удаляют, предраковые изменения шейки матки наблюдают и лечат.",
        sr: "Leka protiv samog virusa nema — leče se manifestacije: kondilomi se uklanjaju, predkancerozne promene grlića materice prate se i leče. Pouzdano se sprečava vakcinom (najbolje pre početka polnog života)." },
      consequences: {
        en: "Oncogenic types cause cervical cancer, as well as cancer of the anus, oropharynx, penis, vulva and vagina.",
        ru: "Онкогенные типы вызывают рак шейки матки, а также рак ануса, ротоглотки, полового члена, вульвы и влагалища.",
        sr: "Onkogeni tipovi izazivaju rak grlića materice, kao i rak anusa, ždrela, penisa, vulve i vagine." },
      prevent: {
        en: "The vaccine reliably prevents the main oncogenic types and warts (best before sexual debut). Condoms help only partly (~40%) — they don't cover all skin. Cervical screening (Pap/HPV test) catches precancer early.",
        ru: "Вакцина надёжно защищает от основных онкогенных типов и кондилом (лучше всего до начала половой жизни). Презерватив помогает лишь частично (~40%), так как не закрывает всю кожу. Скрининг шейки матки (Пап-тест/ВПЧ-тест) рано выявляет предрак.",
        sr: "Vakcina pouzdano štiti od glavnih onkogenih tipova i kondiloma (najbolje pre početka polnog života). Kondom pomaže samo delimično (~40%) — ne pokriva svu kožu. Skrining grlića materice (Pap/HPV test) rano otkriva predrak." },
      sources: [{ label: CDC, url: "https://www.cdc.gov/sti/about/about-genital-hpv-infection.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/human-papilloma-virus-and-cancer" }, { label: "NCHS Data Brief 280", url: "https://www.cdc.gov/nchs/products/databriefs/db280.htm" }] } },
  { key: "hbv", label: { en: "Hepatitis B", ru: "Гепатит B", sr: "Hepatitis B" }, color: "#94d82d", sev: 4, p: 0.003, beta: 0.03, e: 0.90, grounded: false,
    vax: { ve: 0.95, note: { en: "With an immune response ~95%, infection is nearly ruled out. Estimate.", ru: "При иммунном ответе ~95%, заражение почти исключено. Оценка.", sr: "Uz imuni odgovor ~95%, zaraza je gotovo isključena. Procena." } },
    treat: { en: "Chronic incurable; vaccine exists", ru: "Хронический неизлечим; есть прививка", sr: "Hronični neizlečiv; postoji vakcina" },
    cons: { en: "Cirrhosis, liver cancer if chronic", ru: "Цирроз, рак печени при хронизации", sr: "Ciroza, rak jetre pri hroničnom toku" },
    acc: "low",
    src: { en: "Per-act transmission — rough estimate. Condom ~90%. Depends on vaccination.",
      ru: "Передача за акт — грубая оценка. Презерватив ~90%. Зависит от прививки.",
      sr: "Prenos po aktu — gruba procena. Kondom ~90%. Zavisi od vakcinacije." },
    guide: {
      symptoms: {
        en: "Often no symptoms. Acute phase: fatigue, nausea, abdominal pain, dark urine, jaundice. The younger the infected person, the higher the chance of becoming chronic.",
        ru: "Часто бессимптомен. В острой фазе: усталость, тошнота, боль в животе, тёмная моча, желтуха. Чем младше заразившийся, тем выше шанс перехода в хроническую форму.",
        sr: "Često bez simptoma. Akutna faza: umor, mučnina, bol u stomaku, tamna mokraća, žutica. Što je zaražena osoba mlađa, to je veća šansa za prelazak u hronični oblik." },
      treatment: {
        en: "Acute hepatitis usually resolves on its own; chronic is incurable but controlled with antivirals. Reliably prevented by vaccination.",
        ru: "Острый гепатит обычно проходит сам; хронический неизлечим, но контролируется противовирусными препаратами. Надёжно предотвращается вакцинацией.",
        sr: "Akutni hepatitis obično prolazi sam; hronični je neizlečiv, ali se kontroliše antivirusnim lekovima. Pouzdano se sprečava vakcinacijom." },
      consequences: {
        en: "Chronic infection over time → cirrhosis and liver cancer.",
        ru: "Хроническая инфекция со временем → цирроз и рак печени.",
        sr: "Hronična infekcija vremenom → ciroza i rak jetre." },
      prevent: {
        en: "The main protection is the vaccine (highly effective, ~95%). Condoms lower the risk (~90%). Don't share needles or personal items that may contact blood (razors, toothbrushes).",
        ru: "Главная защита — прививка (высокоэффективна, ~95%). Презерватив снижает риск на ~90%. Не делить иглы и личные предметы с возможным контактом крови (бритвы, зубные щётки).",
        sr: "Glavna zaštita je vakcina (veoma efikasna, ~95%). Kondom smanjuje rizik (~90%). Ne deliti igle i lične predmete koji mogu doći u kontakt sa krvlju (brijači, četkice za zube)." },
      sources: [{ label: CDC, url: "https://www.cdc.gov/hepatitis-b/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/hepatitis-b" }] } },
  { key: "hcv", label: { en: "Hepatitis C", ru: "Гепатит C", sr: "Hepatitis C" }, color: "#748ffc", sev: 3, p: 0.005, beta: 0.0002, e: 0.70, grounded: false,
    treat: { en: "Curable (~95%)", ru: "Излечим (~95%)", sr: "Izlečiv (~95%)" },
    cons: { en: "Cirrhosis, liver cancer untreated", ru: "Цирроз, рак печени без лечения", sr: "Ciroza, rak jetre bez lečenja" },
    acc: "low",
    src: { en: "Mostly bloodborne; sexual transmission low and estimated. Curable (~95%).",
      ru: "В основном через кровь; сексуальная передача низкая и оценочная. Излечим (~95%).",
      sr: "Uglavnom preko krvi; polni prenos je nizak i procenjen. Izlečiv (~95%)." },
    guide: {
      symptoms: {
        en: "Usually no symptoms for years; sometimes fatigue, jaundice. Many do not know they are infected, so testing matters.",
        ru: "Обычно бессимптомен годами; иногда усталость, желтуха. Многие не знают, что заражены, поэтому важны анализы.",
        sr: "Obično bez simptoma godinama; ponekad umor, žutica. Mnogi ne znaju da su zaraženi, zato je analiza važna." },
      treatment: {
        en: "Curable: a course of direct-acting antivirals (DAA) gives ~95% cure in 8–12 weeks. No vaccine. Transmitted mainly via blood, sexual route less often.",
        ru: "Излечим: курс противовирусных прямого действия (DAA) даёт ~95% выздоровления за 8–12 недель.",
        sr: "Izlečiv: kurs direktno delujućih antivirusnih lekova (DAA) daje ~95% izlečenja za 8–12 nedelja. Vakcine nema. Prenosi se uglavnom preko krvi, polnim putem ređe." },
      consequences: {
        en: "Untreated → cirrhosis, liver failure, liver cancer.",
        ru: "Без лечения — цирроз, печёночная недостаточность, рак печени.",
        sr: "Bez lečenja → ciroza, otkazivanje jetre, rak jetre." },
      prevent: {
        en: "No vaccine. Mostly bloodborne — don't share needles, razors or toothbrushes; sexual transmission is low. It's now curable, so testing and treating helps stop spread. Condoms reduce the already-small sexual risk.",
        ru: "Вакцины нет. Передаётся в основном через кровь — не делить иглы, бритвы, зубные щётки; половым путём редже. Сейчас излечим, поэтому тестирование и лечение останавливают распространение. Презерватив снижает риск.",
        sr: "Vakcine nema. Prenosi se uglavnom preko krvi — ne deliti igle, brijače ili četkice za zube; polni prenos je redak. Sada je izlečiv, pa testiranje i lečenje zaustavljaju širenje. Kondom smanjuje ionako mali polni rizik." },
      sources: [{ label: CDC, url: "https://www.cdc.gov/hepatitis-c/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/hepatitis-c" }] } },
  { key: "syp", label: { en: "Syphilis", ru: "Сифилис", sr: "Sifilis" }, color: "#cc5de8", sev: 3, p: 0.004, beta: 0.10, e: 0.60, grounded: false,
    treat: { en: "Curable (penicillin)", ru: "Излечим", sr: "Izlečiv (penicilin)" },
    cons: { en: "Brain, heart, nervous-system damage (tertiary)", ru: "Поражение мозга, сердца, нервной системы", sr: "Oštećenje mozga, srca, nervnog sistema (tercijarni)" },
    acc: "low-mid",
    src: { en: "Per-act transmission — estimate; the chancre is often outside the condom area. Condom ~50–71% (CDC).",
      ru: "Передача за акт — оценка; шанкр часто вне зоны презерватива. Презерватив ~50–71% (CDC).",
      sr: "Prenos po aktu — procena; šankr je često van zone kondoma. Kondom ~50–71% (CDC)." },
    guide: {
      symptoms: {
        en: "Staged course. Primary: a painless sore (chancre) at the infection site. Secondary: rash (often on palms and soles), fever, swollen lymph nodes. Then a latent stage with no symptoms.",
        ru: "Стадийное течение. Первичный симптом: безболезненная язва (шанкр) в месте заражения. Вторичные симптомы: сыпь (часто на ладонях и стопах), температура, увеличение лимфоузлов. Затем латентная стадия без симптомов.",
        sr: "Tok po stadijumima. Primarni: bezbolna rana (šankr) na mestu zaraze. Sekundarni: osip (često na dlanovima i tabanima), temperatura, otečeni limfni čvorovi. Zatim latentni stadijum bez simptoma." },
      treatment: {
        en: "Curable with an antibiotic (penicillin). The earlier treatment starts, the simpler; tertiary-stage damage is irreversible.",
        ru: "Излечим антибиотиками. Чем раньше начато лечение, тем проще; повреждения третичной стадии необратимы.",
        sr: "Izlečiv antibiotikom (penicilin). Što se ranije počne s lečenjem, to je jednostavnije; oštećenja tercijarnog stadijuma su nepovratna." },
      consequences: {
        en: "Untreated, after years → tertiary syphilis: damage to the heart, brain and nervous system; in pregnancy — congenital syphilis in the baby.",
        ru: "Без лечения через годы наступает третичный сифилис: поражение сердца, мозга и нервной системы; при беременности — врождённый сифилис у ребёнка.",
        sr: "Bez lečenja nakon godina → tercijarni sifilis: oštećenje srca, mozga i nervnog sistema; u trudnoći — urođeni sifilis kod deteta." },
      prevent: {
        en: "Condoms lower the risk, but the sore (chancre) is often outside the covered area, so protection is partial (~50–71%). Avoid contact with sores; test and treat partners — it's fully curable with antibiotics when caught early.",
        ru: "Презерватив снижает риск, но язва (шанкр) часто вне закрытой зоны, поэтому защита частична (~50–71%). Избегайте контактов с язвами; сдавайте анализы — при раннем выявлении полностью излечим антибиотиками.",
        sr: "Kondom smanjuje rizik, ali je rana (šankr) često van pokrivene zone, pa je zaštita delimična (~50–71%). Izbegavaj kontakt sa ranama; testiraj i leči partnere — pri ranom otkrivanju potpuno je izlečiv antibioticima." },
      sources: [{ label: CDC, url: "https://www.cdc.gov/syphilis/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/syphilis" }] } },
  { key: "gon", label: { en: "Gonorrhea", ru: "Гонорея", sr: "Gonoreja" }, color: "#ff922b", sev: 2, p: 0.008, beta: 0.20, e: 0.90, grounded: false,
    treat: { en: "Curable; resistance rising", ru: "Излечима; растёт устойчивость", sr: "Izlečiva; raste otpornost" },
    cons: { en: "Infertility, pelvic inflammation, spread to blood", ru: "Бесплодие, воспаление малого таза, заражение крови", sr: "Neplodnost, zapaljenje karlice, širenje u krv" },
    acc: "low",
    src: { en: "Per-act transmission — rough estimate; condom >90% (CDC). Growing antibiotic resistance.",
      ru: "Передача за акт — грубая оценка; презерватив >90% (CDC). Растёт устойчивость к антибиотикам.",
      sr: "Prenos po aktu — gruba procena; kondom >90% (CDC). Raste otpornost na antibiotike." },
    guide: {
      symptoms: {
        en: "Often asymptomatic (especially in women). Possible: burning on urination, discharge (mucus, pus), in women — bleeding between cycles. Rectal and pharyngeal forms occur.",
        ru: "Часто бессимптомна (особенно у женщин). Возможны: жжение при мочеиспускании, выделения (бели, гной), у женщин — кровотечения между циклами. Бывает ректальная и глоточная формы.",
        sr: "Često bez simptoma (naročito kod žena). Moguće: pečenje pri mokrenju, sekret (sluz, gnoj), kod žena — krvarenje između ciklusa. Javljaju se rektalni i ždrelni oblici." },
      treatment: {
        en: "Curable with an antibiotic (ceftriaxone injection), but drug resistance is rising — treat strictly as prescribed by a doctor.",
        ru: "Излечима антибиотиком (инъекция цефтриаксона), но устойчивость к препаратам растёт, поэтому лечение строго по назначению врача.",
        sr: "Izlečiva antibiotikom (injekcija ceftriaksona), ali otpornost na lekove raste — lečenje strogo po preporuci lekara." },
      consequences: {
        en: "Untreated → pelvic inflammatory disease (inflammation of the uterus and tubes), infertility, ectopic pregnancy; may spread to blood and joints; raises the risk of HIV infection.",
        ru: "Без лечения — воспалительные заболевания органов малого таза (воспаление матки и труб), бесплодие, внематочная беременность; может распространиться в кровь и суставы; повышает риск заражения ВИЧ.",
        sr: "Bez lečenja → zapaljenska bolest male karlice (zapaljenje materice i jajovoda), neplodnost, vanmaterična trudnoća; može se proširiti u krv i zglobove; povećava rizik od zaraze HIV-om." },
      prevent: {
        en: "Condoms are effective (>90%). It's often symptomless, so test regularly and treat partners. Antibiotic resistance is rising — treat only as prescribed by a doctor.",
        ru: "Презерватив эффективно предотвращает переачу (>90%). Часто проходит бессимптомно, поэтому регулярно тестируйтесь.",
        sr: "Kondom je efikasan (>90%). Često je bez simptoma — testiraj se redovno i leči partnere. Raste otpornost na antibiotike — leči se samo po preporuci lekara." },
      sources: [{ label: CDC, url: "https://www.cdc.gov/gonorrhea/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/sexually-transmitted-infections-(stis)" }] } },
  { key: "chl", label: { en: "Chlamydia", ru: "Хламидия", sr: "Hlamidija" }, color: "#ffd43b", sev: 2, p: 0.045, beta: 0.10, e: 0.70, grounded: false,
    treat: { en: "Curable with antibiotic", ru: "Излечима антибиотиком", sr: "Izlečiva antibiotikom" },
    cons: { en: "Infertility, pelvic inflammation (often silent)", ru: "Бесплодие, воспаление малого таза", sr: "Neplodnost, zapaljenje karlice (često skriveno)" },
    acc: "low-mid",
    src: { en: "Per-act transmission — estimate; often asymptomatic. Condom 50–90% (CDC).",
      ru: "Передача за акт — оценка; часто бессимптомна. Презерватив 50–90% (CDC).",
      sr: "Prenos po aktu — procena; često bez simptoma. Kondom 50–90% (CDC)." },
    guide: {
      symptoms: {
        en: "Often asymptomatic. Possible discharge, burning on urination, lower-abdominal pain; symptoms may appear only after several weeks.",
        ru: "Часто бессимптомна. Возможны выделения, жжение при мочеиспускании, боль внизу живота; симптомы могут появиться лишь через несколько недель.",
        sr: "Često bez simptoma. Mogući sekret, pečenje pri mokrenju, bol u donjem delu stomaka; simptomi se mogu pojaviti tek nakon nekoliko nedelja." },
      treatment: {
        en: "Curable with an antibiotic; it is important to finish the whole course and treat partners, otherwise reinfection.",
        ru: "Излечима антибиотиком; важно пройти весь курс и пролечить партнёров, иначе возможно повторное заражение.",
        sr: "Izlečiva antibiotikom; važno je proći ceo kurs i lečiti partnere, inače ponovna zaraza." },
      consequences: {
        en: "Untreated → pelvic inflammatory disease (inflammation of the uterus and tubes), scarring of the fallopian tubes, infertility, ectopic pregnancy.",
        ru: "Без лечения — воспалительные заболевания органов малого таза (воспаление матки и труб), рубцевание маточных труб, бесплодие, внематочная беременность.",
        sr: "Bez lečenja → zapaljenska bolest male karlice (zapaljenje materice i jajovoda), ožiljci na jajovodima, neplodnost, vanmaterična trudnoća." },
      prevent: {
        en: "Condoms lower the risk (~50–90%). Often symptomless — test regularly and treat partners; it's easily cured with antibiotics.",
        ru: "Презерватив снижает риск (~50–90%). Часто проходит бессимптомно, поэтому регулярно тестируйтесь.",
        sr: "Kondom smanjuje rizik (~50–90%). Često je bez simptoma — testiraj se redovno i leči partnere; lako se leči antibioticima." },
      sources: [{ label: CDC, url: "https://www.cdc.gov/chlamydia/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/sexually-transmitted-infections-(stis)" }] } },
  { key: "tri", label: { en: "Trichomoniasis", ru: "Трихомониаз", sr: "Trihomonijaza" }, color: "#20c997", sev: 1, p: 0.02, beta: 0.12, e: 0.50, grounded: false,
    treat: { en: "Curable in one course", ru: "Излечим одним курсом", sr: "Izlečiv jednim kursom" },
    cons: { en: "Inflammation; raises other STI risk", ru: "Воспаление; повышает риск др. ИППП", sr: "Upala; povećava rizik od drugih PPI" },
    acc: "low",
    src: { en: "Per-act transmission — estimate; condom ~50%. Treated in one course.",
      ru: "Передача за акт — оценка; презерватив ~50%. Лечится одним курсом.",
      sr: "Prenos po aktu — procena; kondom ~50%. Leči se jednim kursom." },
    guide: {
      symptoms: {
        en: "About 70% have no symptoms. Possible: itching, burning, redness, discharge (in women often frothy and smelly), discomfort on urination.",
        ru: "Около 70% проходят без симптомов. Возможны: зуд, жжение, покраснение, выделения (у женщин нередко пенистые с запахом), дискомфорт при мочеиспускании.",
        sr: "Oko 70% — bez simptoma. Moguće: svrab, pečenje, crvenilo, sekret (kod žena često penušav i sa mirisom), nelagodnost pri mokrenju." },
      treatment: {
        en: "Easily curable: a course of antibiotic (metronidazole or tinidazole); both partners must be treated.",
        ru: "Легко излечим: курс антибиотика (метронидазол или тинидазол); лечить нужно обоих партнёров.",
        sr: "Lako izlečiv: kurs antibiotika (metronidazol ili tinidazol); treba lečiti oba partnera." },
      consequences: {
        en: "Inflammation; raises the risk of acquiring and transmitting other STIs, including HIV; in pregnancy — preterm birth.",
        ru: "Воспаление; повышает риск заражения и передачи других ИППП, включая ВИЧ; при беременности есть риск преждевременных родов.",
        sr: "Upala; povećava rizik od zaraze i prenosa drugih PPI, uključujući HIV; u trudnoći — prevremeni porođaj." },
      prevent: {
        en: "Condoms lower the risk (~50%). Test if there are symptoms; treat both partners at once to avoid reinfection — cured with a single antibiotic course.",
        ru: "Презерватив снижает риск (~50%). Часто проходит бессимптомно, поэтому регулярно тестируйтесь.",
        sr: "Kondom smanjuje rizik (~50%). Testiraj ako ima simptoma; leči oba partnera istovremeno da bi se izbeglo ponovno zaražavanje — leči se jednim kursom antibiotika." },
      sources: [{ label: CDC, url: "https://www.cdc.gov/trichomoniasis/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/sexually-transmitted-infections-(stis)" }] } },
];

// Множитель распространённости по «среде»: обычная (×1) / высокий фон / вспышка — СВОЙ для каждой болезни.
// Инфекции концентрируются в сексуальных сетях, поэтому локальная p бывает много выше средней. Оценки (порядок величины).
const WHO_STI = "https://www.who.int/news-room/fact-sheets/detail/sexually-transmitted-infections-(stis)";
const ENV = {
  hiv: { high: 22, out: 65,
    note: { en: "Average ~0.2%, but HIV concentrates in networks: in key groups (men who have sex with men, people who inject drugs) and high-burden regions a high-activity partner reaches 15–27%.",
      ru: "В среднем ~0,2%, но ВИЧ концентрируется в сетях: в ключевых группах (мужчины, имеющие секс с мужчинами; люди, употребляющие инъекционные наркотики) и регионах с высоким распространением до 15–27%.",
      sr: "U proseku ~0,2%, ali HIV se koncentriše u mrežama: u ključnim grupama (muškarci koji imaju seks sa muškarcima; ljudi koji koriste injekcione droge) i regionima sa visokim teretom kod aktivnog partnera dostiže 15–27%." },
    src: { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/hiv-aids" } },
  hpv: { high: 1.2, out: 1.5,
    note: { en: "Already extremely widespread (~25% at any moment, ~80% over a lifetime), so there is little room to rise and it saturates fast.",
      ru: "Уже распространён крайне широко ~25%, ~80% в среднем шанс подхватить за жизнь.",
      sr: "Već izuzetno raširen (~25% u svakom trenutku, ~80% tokom života), pa ima malo prostora za rast i brzo se zasiti." },
    src: { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/human-papilloma-virus-and-cancer" } },
  hbv: { high: 5, out: 15,
    note: { en: "In unvaccinated groups and endemic regions chronic hepatitis B reaches 5–10% and above.",
      ru: "В непривитых группах и эндемичных регионах хронический гепатит B достигает 5–10% и выше.",
      sr: "U nevakcinisanim grupama i endemskim regionima hronični hepatitis B dostiže 5–10% i više." },
    src: { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/hepatitis-b" } },
  hcv: { high: 17, out: 50,
    note: { en: "Explosive in networks of people who inject drugs, where prevalence runs 30–60%.",
      ru: "Взрывной в сетях инъекционных потребителей, где распространённость 30–60%.",
      sr: "Eksplozivan u mrežama injekcionih korisnika, gde je rasprostranjenost 30–60%." },
    src: { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/hepatitis-c" } },
  syp: { high: 5, out: 14,
    note: { en: "Resurgent in MSM sexual networks, where prevalence reaches 5–15% during outbreaks.",
      ru: "На подъёме в сексуальных сетях МСМ (мужчин имеющих секс с мужчинами), где во время вспышек достигает 5–15%.",
      sr: "U porastu u seksualnim mrežama MSM, gde tokom izbijanja dostiže 5–15%." },
    src: { label: WHO, url: WHO_STI } },
  gon: { high: 4, out: 11,
    note: { en: "Outbreak-prone in dense sexual networks (5–15%); antibiotic resistance prolongs spread.",
      ru: "Склонна к вспышкам в плотных сексуальных сетях (5–15%); устойчивость к антибиотикам продлевает распространение.",
      sr: "Sklona izbijanjima u gustim seksualnim mrežama (5–15%); otpornost na antibiotike produžava širenje." },
    src: { label: WHO, url: WHO_STI } },
  chl: { high: 1.5, out: 2,
    note: { en: "Already common (~4.5%); in active young networks 10–15%, so the multiplier is modest.",
      ru: "Уже часто распространён (~4,5%); в активных молодёжных сетях 10–15%, поэтому множитель и риска среды взяты небльшими.",
      sr: "Već čest (~4,5%); u aktivnim mladim mrežama 10–15%, pa je množilac skroman." },
    src: { label: WHO, url: WHO_STI } },
  tri: { high: 2, out: 5,
    note: { en: "Concentrated in specific populations, where prevalence reaches 10–20%.",
      ru: "Концентрируется в отдельных группах, где распространённость достигает 10–20%.",
      sr: "Koncentriše se u određenim grupama, gde rasprostranjenost dostiže 10–20%." },
    src: { label: WHO, url: WHO_STI } },
};
// Множитель среды для инфекции (1 / high / outbreak).
const envMulOf = (s, level) => { const e = ENV[s.key]; return e ? (level === "high" ? e.high : level === "outbreak" ? e.out : 1) : 1; };
// Масштабирование распространённости множителем в пространстве ШАНСОВ (odds), а не вероятности.
// odds = p/(1−p); ×M; обратно p = o/(1+o). Результат всегда в (0,1) — не вылетает за 100%
// (в отличие от наивного p×M). При малом p ≈ p×M. Множители (среда, пул) — это odds ratio,
// и перемножаются именно в odds-пространстве (это форма теоремы Байеса: шансы × LR).
const oddsScale = (p, M) => {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const o = (p / (1 - p)) * M;
  return o / (1 + o);
};
// Подменяем s.p эффективной распространённостью среды (в odds-пространстве) — не трогая survivalAt/Breakdown.
const withEnv = (s, level) => {
  const mul = envMulOf(s, level);
  return mul === 1 ? s : { ...s, p: oddsScale(s.p, mul) };
};

const ACC_COLOR = { "high": "#38d9a9", "low-mid": "#ffc300", "low": "#ff7b00" };

// Десятичный разделитель: en — точка, ru/sr — запятая.
const dec = (str, lang) => (lang === "en" ? str : str.replace(".", ","));

const pctVal = (x, lang = "en") => {
  if (x <= 0) return "0%";
  if (x >= 10) return Math.round(x) + "%";
  if (x >= 1) return x.toFixed(0) + "%";
  if (x >= 0.1) return dec(x.toFixed(1), lang) + "%";
  const d = Math.max(2, Math.ceil(-Math.log10(x)) + 1);
  return dec(parseFloat(x.toFixed(d)).toString(), lang) + "%";
};
const pctAct = (v, lang = "en") => {
  const x = v * 100;
  if (x <= 0) return "0%";
  if (x >= 10) return Math.round(x) + "%";
  if (x >= 1) return x.toFixed(0) + "%";
  const d = Math.max(2, Math.ceil(-Math.log10(x)) + 1);
  return dec(parseFloat(x.toFixed(d)).toString(), lang) + "%";
};
// Короткие единицы для длительности связи и оси таймлайна.
const U = {
  en: { oneoff: "one-off", wk: "wk", mo: "mo", yr: "y", monoSep: "." },
  ru: { oneoff: "разово", wk: "нед", mo: "мес", yr: "г", monoSep: "," },
  sr: { oneoff: "jednokratno", wk: "ned.", mo: "mes.", yr: "g.", monoSep: "," },
};
const fmtDur = (m, lang = "en") => {
  const u = U[lang] || U.en;
  if (m <= 0) return u.oneoff;
  if (m < 1) return `≈ ${Math.round(m * 4.33)} ${u.wk}`;
  if (m < 12) return `${Math.round(m)} ${u.mo}`;
  return `${dec((Math.round((m / 12) * 10) / 10).toString(), lang)} ${u.yr}`;
};
// Слово «год/years» с числом (плюрализация по языку).
const yearsWord = (n, lang = "en") => {
  if (lang === "en") return n === 1 ? "year" : "years";
  if (lang === "sr") {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "godina";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "godine";
    return "godina";
  }
  // ru
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "год";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "года";
  return "лет";
};
// Короткое «г/y/g.» рядом с числом на оси и в подсказке.
const yrShort = (lang = "en") => (U[lang] || U.en).yr;
const moWord = (lang = "en") => ({ en: "mo", ru: "мес", sr: "mes." }[lang] || "mo");

// Хелперы тултипов-формул (используются и в I18N, и в Breakdown — поэтому объявлены до I18N).
// FTtl — заголовок; FLeg — легенда «название = значение» над формулой; FStep — шаг иерархической
// формулы (подпись-название + полная самодостаточная формула, без «висящих» множителей).
const FTtl = ({ children }) => <div style={{ color: C.hi, fontWeight: 600, marginBottom: 2 }}>{children}</div>;
const FLeg = ({ items }) => (
  <div style={{ margin: "5px 0 2px", lineHeight: 1.65 }}>
    {items.map(([k, v], i) => <div key={i}><span style={{ color: C.dim }}>{k}</span> <span style={{ color: C.mid }}>=</span> <span style={{ color: C.hi, fontWeight: 600 }}>{v}</span></div>)}
  </div>
);
const FStep = ({ name, children }) => (
  <div className="fstep"><div style={{ color: C.dim, fontSize: 11 }}>{name}</div>{children}</div>
);

// ── Локализация (en — дефолт). t(key) читает текущий язык из L. ────────────────
const I18N = {
  en: {
    langName: "English",
    title: "STI risk over time",
    badge: "illustrative model",
    intro: "",
    warnTitle: "This is an amateur calculator, not a medical tool.",
    warnBody: (<>The real probabilities are <b style={{ color: C.accent }}>almost certainly inexact</b>, because the model relies on many assumptions and estimates with wide spreads. The author has no medical training — consult a specialist. The model's main use is comparing how different parameters may affect the chance of infection.</>),
    preset: "Behavior preset",
    tourStart: "Tour", tourNext: "Next", tourSkip: "Skip", tourDone: "Done",
    tour1: "Pick a relationship style — it fills the partner cards below.",
    tour2: "This curve is your cumulative chance of getting infected over the years.",
    tour3: "Try changing how often a condom is used.",
    tour4: "Mark which practices you do and in which role.",
    tour5: "Your chance depends heavily on the environment you live in.",
    presetInfo: (<>• <b>Celibacy</b> — no sex.<br />• <b>Monogamy</b> — one steady partner.<br />• <b>Serial monogamy</b> — one partner at a time, but they change over the years.<br />• <b>Monogamish</b> — mostly one partner + rare one-night stands.<br />• <b>Open / swing</b> — a steady partner plus sex on the side.<br />• <b>Polyamory</b> — several ongoing relationships at once.<br />• <b>ONS / one-night</b> — one-night stands, no follow-up.<br />• <b>Core group</b> — a tight circle with frequent partner turnover.</>),
    sexActs: "Sex acts",
    sexActsInfo: "Which practices and in which role. Per-act risk depends on the practice: receptive anal ≈ ×17 vs vaginal, insertive less, oral notably lower (based on HIV data; rough for other infections). For simplicity we assume every selected practice is present in each contact — so each one you add only raises the risk.",
    noActs: "No practice selected — risk is treated as zero.",
    protection: "Protection and immunity",
    vaxHpv: "Vaccinated against HPV",
    vaxHbv: "Vaccinated against hepatitis B",
    stiCof: "Untreated STIs (affects HIV)",
    stiCofInfo: (<><div><b data-hi>Untreated STIs</b> — an active untreated infection raises the chance of getting HIV</div><div style={{ marginTop: 6 }}>per-infection multipliers, accuracy and sources — in «Assumptions» below</div></>),
    vaccinated: "vaccinated",
    addBtn: "+ add",
    removeCard: "remove (count → 0)",
    shareBtn: "Share risk profile",
    shareDone: "Copied to clipboard!",
    shareHint: "Copy a link that reopens exactly these settings",
    poolInfo: (<>How «active» this partner type's pool is. One-night partners come from a more active circle → likelier infected.</>),
    bg: "activity", bgMul: (m) => `activity ×${m}`,
    oneActBg: (m) => `1 act · activity ×${m}`,
    condom: "Acts with a condom",
    condomInfo: "Share of acts with partners of this type that use a condom.",
    tested: "Partners with a test",
    testedInfo: "Share of partners of this type whose recent negative test you actually KNOW — only a result you know lowers your risk.",
    details: "details",
    sexPerWeek: "Sex per week",
    sexPerWeekHint: "how often sex happens with one such partner",
    relDuration: "Relationship duration",
    relDurationHint: "how long one such relationship lasts",
    oneoffNote: "One-off contact — one act per partner.",
    ongoingNote: "Lasts the whole period — exposure accumulates over time.",
    horizon: "Active sex-life period",
    horizonHint: "",
    scale: "Probability scale",
    scaleHint: "",
    atLeastOne: "at least one of the enabled",
    envLabel: "Environment",
    envNormal: "safe", envHigh: "high background", envOutbreak: "outbreak",
    envInfo: (<>Infections cluster in sexual networks, so a partner is likelier infected than the population average. The switch scales each infection's prevalence — its own factor, see the disease card.<br /><br /><b>High background</b> — a more active, higher-risk circle.<br /><b>Outbreak</b> — a concentrated network during an active epidemic.<br /><br />The multiplier estimates are big assumptions, not a prediction.</>),
    hivBtn: "HIV risk",
    hivTitle: "HIV risk isn't uniform",
    hivP1: "In everyday life HIV risk is low, but in a local outbreak inside a sexual network it can become very high. An outbreak flares up unnoticed — you may not know about it until it's too late.",
    hivP2: "Parallel untreated STIs raise the per-act chance of passing HIV: sores and inflammation open a 'gateway' and bring target cells to the mucosa.",
    hivP3: "Barrier contraception (a condom) sharply lowers the chance of infection — especially for HIV.",
    hivChanged: "The scenario set:",
    hivChip1: "Environment → outbreak",
    hivChip2: "Untreated STIs → on",
    hivChip3: "Acts with a condom → 0%",
    hivBannerText: "Elevated HIV-risk scenario",
    hivBannerMore: "Details",
    envGuideLabel: "Risk environment",
    anyLabel: "At least one",
    topRiskLine: (years, yw, name, col) => (<>Over {years} {yw} of active sex life, the highest risk is <span style={{ color: col, fontWeight: 600 }}>{name}</span>.</>),
    enableOne: "Enable at least one infection below.",
    structTitle: "Partnership structure over time",
    structStats: (avg, lanes, total) => (<>sex ≈ <b data-hi>{avg}×</b>/wk · peak <b data-hi>{lanes}</b> · total relationships: <b data-hi>{total}</b></>),
    legSteady: "steady partners", legCasual: "recurring partners", legHookup: "one-night",
    structLegendTail: "",
    noPartners: "No partners — add some in the cards on the left.",
    shownPart: (total) => `part of the relationships shown for clarity — statistics over all ${total}`,
    perWk: "/wk",
    thInfection: "Infection",
    thRisk: (years, yw) => `Risk over ${years} ${yw}`,
    thPerAct: "Per act: without → with condom",
    thTreatment: "Treatment",
    thConsequences: "Consequences",
    thSource: "Source",
    accuracyLab: "Accuracy",
    acc: { "high": "high", "low-mid": "low–medium", "low": "low" },
    sourcesLab: "Sources",
    guideTail: "",
    sympt: "Symptoms", treatm: "Treatment", conseq: "Consequences", prevent: "Prevention",
    collapseGuide: "collapse guide", openGuide: "open the disease guide",
    breakdownTitle: "Calculation breakdown — where the number comes from",
    breakdownIntro: "",
    condomBlockTitle: "What a condom gives (if used in every contact with everyone)",
    withoutCondom: "without condom", withCondom: "with condom",
    barAct: "Per 1 contact (all practices, if the partner is infected)",
    barHor: (years, yw) => `Over ${years} ${yw}`,
    perActHead: "One contact with an infected partner",
    onePartnerHead: "Over 100 contacts with an infected partner",
    onePartnerSub: "over all your contacts with them",
    actsAxis: "100 contacts",
    horizonCond: "all your partners — usually not infected",
    bandNote: "green band = the risk a condom removes",
    satDrop: (<>Per <b data-hi>one contact</b> a condom removes noticeably more relative risk than over <b data-hi>100 contacts</b> with the same infected partner.</>),
    satFlat: (<>Per <b data-hi>one contact</b> and over <b data-hi>100 contacts</b> with one infected partner a condom removes about the same.</>),
    contribIntro: (years, yw) => (<>The contribution of each <b data-hi>partner type</b> over {years} {yw} (its own frequency, duration, condom, tested share, background), then they combine:</>),
    thType: "Type", thPartners: "Partners", thContacts: "Contacts", thTransPerAct: "Transmission per contact", thChanceInf: "Chance partner infected", thRiskHor: (years, yw) => `Risk over ${years} ${yw}`,
    perYear: "/yr",
    noActivePartners: "No active partners — add someone in the cards on the left to see the breakdown.",
    thContactsInfo: (<><div><b data-hi>Sex acts with one partner</b> of this type over the period</div><span data-f>sex/week × 52/12 × duration (months)</span><div>a one-night partner = 1 act</div><div style={{ marginTop: 6 }}>this number feeds the «Risk» column — transmission builds up over all these contacts</div></>),
    thTransPerActInfo: (<><div><b data-hi>Transmission in one contact</b>, if the partner is infected</div><div>already includes this type's condom; the vaccine is separate (lowers the whole risk, not the per-act transmission)</div><div style={{ marginTop: 6 }}>each sex act has its own transmission</div><span data-f>per&#8209;act&#8209;transmission × act&#8209;multiplier × (1 − share&#8209;with&#8209;condom × condom&#8209;protection)</span><div>acts are combined</div><span data-f>1 − product over acts (1 − act&#8209;transmission)</span></>),
    thChanceInfInfo: (<><div><b data-hi>Chance the partner is already infected</b> — in two steps</div><FStep name="chance before testing"><span data-f>odds(prevalence) × environment × activity</span></FStep><FStep name="chance infected"><span data-f>chance before testing × (1 − tested)</span></FStep><div style={{ marginTop: 8 }}><b data-hi>odds</b> are «odds» instead of probability; environment and activity multiply in odds so the result can't exceed 100%, then back to probability</div><span data-f>odds = p / (1 − p)</span><span data-f>p = odds / (1 + odds)</span><div>more in «Assumptions»</div></>),
    thRiskHorInfo: (<><div><b data-hi>Risk of catching it from this type over the period</b> — three steps, as in the cell</div><FStep name="transmission over all contacts"><span data-f>1 − (1 − transmission per contact)^contacts</span></FStep><FStep name="risk from 1 partner"><span data-f>transmission over all contacts × chance infected</span></FStep><FStep name="risk over the period"><span data-f>1 − (1 − risk from 1 partner)^partners</span></FStep><div style={{ marginTop: 8 }}>for recurring and one-night partners «partners» = count per year × years</div><div>then the types are combined in the «Total» row below</div></>),
    thTotal: "Total",
    thTotalInfo: (<><div><b data-hi>The final risk — the height of the curve</b></div><div>the types are independent, so they combine</div><span data-f>total = 1 − product of «not infected» across all types</span></>),
    vaccRow: (vePct) => `After the vaccine ×(1 − ${vePct}%)`,
    vaccRowInfo: (<><div><b data-hi>The vaccine protects you the whole time</b>, not separately on each act</div><span data-f>result = risk without the vaccine × (1 − VE)</span><div>so, unlike a condom, it doesn't depend on the number of contacts; more in «Assumptions»</div></>),
    assumTitle: "Assumptions and how this is computed",
    assumP1: (<>Only for <b data-hi>HIV</b> are per-act transmission and condom effectiveness taken from research (solid line). For the others there are no reliable numbers — these are order-of-magnitude estimates (dashed) based on CDC and WHO; the source for each infection is in the «Source» column of the table.</>),
    assumP2: (<><b data-hi>Partner types.</b> Behavior is set by three types — steady, recurring and one-night partners. For each you can separately set how often a condom is used and how much you know about partners' test status. The multiplier «how likely the partner is already infected» is relative to an average random partner (from surveillance data): a steady partner ≈ that average (×1), while non-steady ones — both recurring and one-night — are roughly twice as likely to be infected (×2). Direct «casual vs steady» estimates are weak and vary (about ×1.5–2; <a href="https://pubmed.ncbi.nlm.nih.gov/1411843/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "underline" }}>casual vs steady ↗</a>, <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5737755/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "underline" }}>once-off prevalence ↗</a>), so we take a conservative ×2. The difference between «several meetings» and «one night» is carried not by this multiplier but by the number of partners and acts with each. The multiplier is relative — the overall community level is set by «Environment», and the two multiply in odds-space without double-counting.</>),
    assumP3: (<><b data-hi>Sex acts add up.</b> We assume every selected practice is present in each contact, so adding one only raises the risk (a simplification — not always true in reality). The risk ratios rely on HIV; for other infections this is a rough approximation.</>),
    assumP4: (<><b data-hi>Tested share.</b> A test has a «window» between infection and a positive result, so even 100% tested does not guarantee zero — it's an estimate.</>),
    assumP5: (<><b data-hi>Partner pool.</b> Estimates how much more active this type's circle is, and therefore how much likelier the partner is already infected. Relative multipliers (steady &lt; recurring &lt; hookups), not exact values.</>),
    assumP6: (<><b data-hi>How it's computed.</b> Per type the number of contacts is <span data-f>k = frequency × duration</span> (one-night = 1). The chance of catching it from a partner grows with k and is multiplied by the chance the partner is infected. The contributions of all types multiply → cumulative risk rises over time. The exact per-column formulas are in the breakdown tooltips.</>),
    assumPEnv: (<><b data-hi>Environment.</b> The partner-type multiplier reflects the circle of a specific partner, while «Environment» shifts the baseline of the whole community: safe / high background / outbreak — its own multiplier on each infection's prevalence (values and sources on the disease cards). The type picks the partner's circle, the environment sets the overall level. Both multipliers are odds ratios and are applied to prevalence <b data-hi>in odds-space</b>: <span data-f>odds = p/(1−p)</span>, multiply by environment and activity, convert back <span data-f>p = o/(1+o)</span>. So the «chance the partner is infected» never exceeds 100%: for common infections it saturates gently, for rare ones it's almost like plain multiplication. Example (HIV): in an outbreak, core-group prevalence is roughly 130× the average; part of that is already carried by the partner-type multiplier (non-steady ×2), so for the environment we use ×65 — together <span data-f>×65 × 2 = ×130</span> in odds-space (<a href="https://www.who.int/news-room/fact-sheets/detail/hiv-aids" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "underline" }}>WHO ↗</a>). This is essentially a form of Bayes' theorem: odds × likelihood ratio.</>),
    assumCof: (<><b data-hi>Untreated STIs (HIV cofactor).</b> An active untreated infection (sores/inflammation) raises the chance of acquiring HIV. The multiplier differs by infection — from meta-analyses: herpes ~2.7×, gonorrhea ~2.8×, syphilis ~1.7×, chlamydia and trichomoniasis ~1.5×. We use a single <span data-f>×2.5</span>, applied to HIV only (uniquely susceptible to this). Accuracy is low — estimates come mostly from women but are applied to everyone. Sources: <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5700807/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "underline" }}>Looker 2017 ↗</a>, <a href="https://pubmed.ncbi.nlm.nih.gov/35034049/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "underline" }}>Barker 2022 ↗</a>.</>),
    assumVacc: (<><b data-hi>Vaccine (HPV / hepatitis B).</b> Lowers the final risk by its efficacy — we multiply the result by <span data-f>1 − efficacy</span> (85% removes 85%). We take it off the whole result, not each act: the vaccine neutralizes the virus with antibodies at the entry point, so protection doesn't weaken with the amount of sex, unlike a condom. The share of risk removed is the same with one partner or a hundred — but the absolute risk still grows with the number of partners.<br /><br />A simplification: the HPV vaccine covers only some virus types, protection is strongest before sexual debut, and in some people (especially for hepatitis B) the response is weaker — so 85% / 95% are average estimates, not a personal guarantee.</>),
    assumExTitle: "Example: how environment and pool combine",
    assumExFormula: (<>Chance a partner is already infected = prevalence multiplied by environment and pool <span data-f>in odds-space (odds × environment × pool)</span>.</>),
    assumSources: (<>Sources: <a href="https://pubmed.ncbi.nlm.nih.gov/1411843/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>casual vs steady ↗</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5737755/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>once-off prevalence ↗</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5431278/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>assortative mixing ↗</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC6380304/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>NATSAL-3 ↗</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC2563886/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>condom by partnership (NATSAL, Britain) ↗</a> · <a href="https://www.who.int/news-room/fact-sheets/detail/sexually-transmitted-infections-(stis)" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>WHO ↗</a></>),
    footerDisclaimer: "This is an amateur educational model, not a medical forecast and not a basis for medical decisions.",
    footerNoWarranty: "Provided “as is”, for educational use only, without any warranty — use at your own risk.",
    footerSource: "Source code",
    footerFree: "Non-commercial amateur educational project — no cookies, open source",
    footerContactLink: "Contact & feedback",
    githubLink: "Source code on GitHub ↗",
    contactTitle: "Contact & feedback",
    contactIntro: "There are a few ways to get in touch:",
    contactGithub: (<>Open an <a href="https://github.com/UserNameIsAlredyTaken/safesex/issues" target="_blank" rel="noopener noreferrer" style={{ color: C.accent, textDecoration: "underline" }}>issue on GitHub</a> — good for questions and suggestions (issues are public, answers may help others).</>),
    contactEmailLine: (<>Email: <a href="mailto:contact@sexhealth.info" style={{ color: C.accent, textDecoration: "underline" }}>contact@sexhealth.info</a></>),
    donateCta: "Support the project",
    donateWhy: "— free, no ads or trackers",
    donateTitle: "Support the project",
    donateIntro: "Any amount helps keep it running and ad-free. Thank you!",
    donateKofi: (<>One-time or monthly — <a href="https://ko-fi.com/sexhealth" target="_blank" rel="noopener noreferrer" style={{ color: C.accent, textDecoration: "underline" }}>Ko-fi</a></>),
    donateLiberapay: (<>Recurring (weekly) — <a href="https://liberapay.com/sexhealth" target="_blank" rel="noopener noreferrer" style={{ color: C.accent, textDecoration: "underline" }}>Liberapay</a></>),
    donateGithub: (<>Via <a href="https://github.com/sponsors/UserNameIsAlredyTaken" target="_blank" rel="noopener noreferrer" style={{ color: C.accent, textDecoration: "underline" }}>GitHub Sponsors</a></>),
    contactClose: "Close",
    yrAxis: "y",
    // ── Режим / Mode switcher ──
    modeSti: "🦠 STIs",
    modePreg: "🤰 Pregnancy",
    pregTitle: "Probability of pregnancy over time",
    pregIntro: "",
    pregWarnTitle: "This is an amateur calculator, not a medical tool.",
    pregWarnBody: "The model mixes rough approximations with reliable data. Don't use it for pregnancy planning, choosing contraception, or fertility problems — consult a specialist.",
    pregWoman: "👩 Woman / couple",
    pregMan: "👨 Man",
    pregWomanExpl: (<><b data-hi>The «Woman» model is equivalent to the «Couple» model.</b> You can get pregnant at most once per cycle. Partners <b>do not add up</b>: only the total amount of sex and contraception matter, not the number of partners.</>),
    pregManExpl: (<>We count «at least one pregnancy among partners»: here partners <b>do add up</b> (more partners/acts → higher chance of ≥1 event).</>),
    pregProfile: "Profile",
    pregWomanAge: "Woman's age",
    pregWomanAgeInfo: "The main fertility factor; a sharp drop after 35. Age values are a trend estimate (ASRM/Dunson/NICE).",
    pregFreqInfo: "Frequency matters through hitting the fertile window; a plateau ~every other day. The shape of the dependence is an estimate.",
    pregLineWoman: "Probability of pregnancy",
    pregLineNoContra: "no contraception",
    pregHeadWoman: (years, yw, pct, hasContra) => (<>Over {years} {yw} the chance of getting pregnant ≈ <b data-hi>{pct}</b>{hasContra ? " with the chosen contraception" : " without contraception"}.</>),
    pregBehaviorPreset: "Behavior preset",
    pregPresetInfo: (<>• <b>No partners</b> — no partners.<br />• <b>Monogamy</b> — one steady partner.<br />• <b>Dating</b> — recurring partners.<br />• <b>Active dating</b> — many recurring + one-night.<br />• <b>One-night</b> — one-night sex, no follow-up.</>),
    pregMyAge: "My age",
    pregMyAgeInfo: "A man's age weakly affects fertility (more noticeable after ~45). Here it's a rough estimate — so the effect is visible on the chart.",
    pregPartnerAge: "Partner's age",
    pregPartnerAgeInfo: "A woman's age is the main fertility factor. For the man it's an estimate (often not known precisely).",
    pregLineMan: "≥1 pregnancy from me",
    pregLineIfNoContra: "if without contraception",
    pregHeadMan: (years, yw, pct) => (<>Over {years} {yw} the chance that at least one partner gets pregnant ≈ <b data-hi>{pct}</b>.</>),
    pregOneoffCap: "one-off act",
    pregOngoingCap: "lasts the whole period",
    pregRelCap: (d) => `relationship ${d}`,
    pregNoPartnersF: "No partners — add some in the cards on the left.",
    // ── Контрацепция / WomanMethods ──
    contraLabel: "Contraception",
    contraInfo: "Add the methods you use — as many as you like and combine them. For «per-act» methods (condom etc.) the slider sets the share of acts. Details and sources — in the reference below.",
    addMethod: "+ add method",
    allMethodsAdded: "All methods added",
    sevTitle: "side-effect severity (estimate)",
    removeMethod: "remove method",
    shareOfActs: "share of acts using it",
    // ── Справочная таблица контрацепции ──
    contraTableTitle: "Contraception methods reference",
    contraTableSub: "",
    thMethod: "Method",
    thPerfect: "Perfect",
    thTypical: "Typical",
    pregPerYear: "% preg./yr",
    typicalInfo: (<>This is the share of women who got pregnant during the first year of use.<br /><br />«Perfect» — if the method is always used correctly.<br />«Typical» — real-world use with misses and mistakes, as for most people.</>),
    thSideFx: "Side effects",
    howWorks: "How it works",
    sideRisks: "Side effects and risks",
    whoFor: "Who / contraindications",
    contraSourcesTail: "— for reference, not a prescription.",
    // ── Допущения (беременность) ──
    pregAssumTitle: "Assumptions and how this is computed",
    pregAssum1: (<><b data-hi>The unit is a cycle (≈month).</b> Cumulative <span data-f>P(t) = 1 − (1 − annual_failure)^years</span> — the same «survival» logic as in the STI mode.</>),
    pregAssum2: (<><b data-hi>Fertility depends on age.</b> A young couple ~20–25% per cycle, a sharp drop after 35. We use population-average values (ASRM, Dunson, NICE) — a trend estimate, not a personal probability; the individual spread is large.</>),
    pregAssum3: (<><b data-hi>Conception only.</b> The model estimates the chance of conception, not of a live birth: miscarriages, ectopic pregnancy and other outcomes are not counted.</>),
    pregAssum4: (<><b data-hi>Random day of the cycle.</b> If the fertile window isn't tracked, we assume acts happen on random days — base fertility is averaged over the whole cycle.</>),
    pregAssum5: (<><b data-hi>Contraception.</b> From the typical-use table (<a href="https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" target="_blank" rel="noopener noreferrer" style={{ color: "#a78bfa", textDecoration: "none" }}>CDC/Trussell ↗</a>). Several methods combine by multiplication (a lower bound).</>),
    pregAssum6: (<><b data-hi>Woman and man.</b> For the woman, partners don't add up — one conception per cycle. For the man we count «at least one pregnancy among partners»: more partners and unprotected sex → higher chance.</>),
    pregAssum7: (<><b data-hi>Man = STI logic.</b> «At least one pregnancy among partners»: the contribution of each type is multiplied. Steady — by cycles over the whole period; recurring — a relationship of duration dur, refreshed yearly; hookups — a single act (per-act ≈ ⅕ of the per-cycle f — a rough estimate).</>),
    pregAssum8: (<><b data-hi>Why the number of partners matters for the man.</b> Each partner is a separate «draw»: she can get pregnant independently of the others, so we count not «how many children total» but the chance that <b>at least one</b> pregnancy happens. The more partners — and the more unprotected sex with each — the higher that chance, because independent opportunities pile up. For each partner we take her «did not get pregnant» probability and multiply them together; one minus that product is «at least one». For the woman it is the opposite: partners do not add up, because her cycle is the shared bottleneck (one conception per cycle).</>),
    pregAssumSources: (<>Sources: <a href="https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>CDC / Trussell (contraception) ↗</a> · <a href="https://www.nice.org.uk/guidance/cg156" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>NICE (fertility &amp; age) ↗</a> · <a href="https://www.who.int/news-room/fact-sheets/detail/infertility" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>WHO (infertility) ↗</a></>),
  },
  ru: {
    langName: "Русский",
    title: "Риск ЗППП во времени",
    badge: "иллюстративная модель",
    intro: "",
    warnTitle: "Это любительский калькулятор, а не медицинский инструмент.",
    warnBody: (<>Реальные вероятности <b style={{ color: C.accent }}>практически гарантированно не точные</b>, так как использовано много допущений и оценок с большими разбросами. Автор не имеет медицинского образования — не принимайте на основе этой модели медицинских решений и консультируйтесь со специалистом. Основная польза этой модели — сравнение того, как разные параметры могут влиять на вероятность заражения.</>),
    preset: "Пресет поведения",
    tourStart: "Тур", tourNext: "Далее", tourSkip: "Пропустить", tourDone: "Готово",
    tour1: "Выбери стиль отношений — он заполнит карточки партнёров ниже.",
    tour2: "Эта кривая — твой накопленный шанс заразиться за годы.",
    tour3: "Попробуй изменить, как часто используется презерватив.",
    tour4: "Отметь, каким сексом ты занимаешься и в какой роли.",
    tour5: "Шанс сильно зависит от среды, в которой ты живёшь.",
    presetInfo: (<>• <b>Целибат</b> — без секса.<br />• <b>Моногамия</b> — один постоянный партнёр.<br />• <b>Серийная моногамия</b> — один партнёр, но со временем они меняются.<br />• <b>Monogamish</b> — постоянный партнёр + редкие связи на одну ночь.<br />• <b>Открытые / свинг</b> — постоянный партнёр плюс секс на стороне.<br />• <b>Полиамория</b> — несколько постоянных связей одновременно.<br />• <b>ONS / на одну ночь</b> — секс на одну ночь, без продолжения.<br />• <b>Core group</b> — тесный круг с частой сменой партнёров.</>),
    sexActs: "Виды секса",
    sexActsInfo: <>Риск за акт зависит от практики.<br />Например рецептивный анальный ≈ ×17 вероятнее передаёт ВИЧ чем вагинальноый. <br /><br />Для упрощения считаем, что в каждом контакте присутствуют все выбранные практики.</>,
    noActs: "Не выбрано ни одной практики — риск считается нулевым.",
    protection: "Защита и иммунитет",
    vaxHpv: "Привит от ВПЧ",
    vaxHbv: "Привит от гепатита B",
    stiCof: "Не пролеченные ЗППП (влияет на ВИЧ)",
    stiCofInfo: (<><div><b data-hi>Не пролеченные ЗППП</b> — активная нелеченая инфекция повышает шанс заразиться ВИЧ</div><div style={{ marginTop: 6 }}>множители по болезням, точность и источники — в «Допущениях» ниже</div></>),
    vaccinated: "привит",
    addBtn: "+ добавить",
    removeCard: "убрать (количество → 0)",
    shareBtn: "Поделиться профилем риска",
    shareDone: "Скопировано в буфер!",
    shareHint: "Скопировать ссылку, открывающую именно эти настройки",
    poolInfo: (<>Насколько «активен» круг партнёров этого типа. Партнёры из более активного круга → чаще заражены.</>),
    bg: "активность", bgMul: (m) => `активность ×${m}`,
    oneActBg: (m) => `1 акт · активность ×${m}`,
    condom: "Актов в презервативе",
    condomInfo: "Доля актов, в которых используется презерватив.",
    tested: "Партнёров с анализами",
    testedInfo: "Доля партнёров, чей недавний отрицательный тест ты ЗНАЕШЬ.",
    details: "детали",
    sexPerWeek: "Секс в неделю",
    sexPerWeekHint: "как часто секс с одним таким партнёром",
    relDuration: "Длительность связи",
    relDurationHint: "как долго длится одна такая связь",
    oneoffNote: "Разовый контакт — один акт на партнёра.",
    ongoingNote: "Длится весь период — экспозиция копится со временем.",
    horizon: "Период активной половой жизни",
    horizonHint: "",
    scale: "Масштаб шкалы вероятности",
    scaleHint: "",
    atLeastOne: "хотя бы одна из включённых",
    envLabel: "Среда",
    envNormal: "безопасная", envHigh: "высокий фон", envOutbreak: "вспышка",
    envInfo: (<><b>Высокий фон</b> — риск инфекции выше в активных сексуальных сетях.<br /><b>Вспышка</b> — концентрированная сеть во время активной эпидемии. Эпидемия может проходить не заметно.<br /><br />Оценки множителей выбраны с грубыми допущениями. У каждой инфекции — свои множители (см. карточку болезни).</>),
    hivBtn: "Риск ВИЧ",
    hivTitle: "Риск ВИЧ",
    hivP1: "В локальной вспышке внутри сексуальной сети шанс заразиться ВИЧ может стать очень высоким. Вспышка разгорается незаметно — ты можешь о ней не знать.",
    hivP2: "Параллельные нелеченые ЗППП повышают шанс передачи ВИЧ.",
    hivP3: "Барьерная контрацепция (презерватив) сильно снижает шанс заразиться — для ВИЧ особенно.",
    hivChanged: "Сценарий выставил:",
    hivChip1: "Среда → вспышка",
    hivChip2: "Не пролеченные ЗППП → вкл",
    hivChip3: "Актов в презервативе → 0%",
    hivBannerText: "Сценарий повышенного риска ВИЧ",
    hivBannerMore: "Подробнее",
    envGuideLabel: "Среда риска",
    anyLabel: "Хотя бы одна",
    topRiskLine: (years, yw, name, col) => (<>За {years} {yw} активной половой жизни выше всего риск <span style={{ color: col, fontWeight: 600 }}>{name}</span>.</>),
    enableOne: "Включи хотя бы одну инфекцию ниже.",
    structTitle: "Структура партнёрств во времени",
    structStats: (avg, lanes, total) => (<>секс ≈ <b data-hi>{avg}×</b>/нед · пик <b data-hi>{lanes}</b> · всего связей: <b data-hi>{total}</b></>),
    legSteady: "постоянные партнёры", legCasual: "приходящие партнёры", legHookup: "на одну ночь",
    structLegendTail: "",
    noPartners: "Нет партнёров — добавь в карточках слева.",
    shownPart: (total) => `показана часть связей для наглядности — статистика по всем ${total}`,
    perWk: "/нед",
    thInfection: "Инфекция",
    thRisk: (years, yw) => `Риск за ${years} ${yw}`,
    thPerAct: "За контакт: без → с презервативом",
    thTreatment: "Лечение",
    thConsequences: "Последствия",
    thSource: "Источник",
    accuracyLab: "Точность",
    acc: { "high": "высокая", "low-mid": "низкая–средняя", "low": "низкая" },
    sourcesLab: "Источники",
    guideTail: "",
    sympt: "Симптомы", treatm: "Лечение", conseq: "Последствия", prevent: "Предотвращение",
    collapseGuide: "свернуть гайд", openGuide: "открыть гайд по болезни",
    breakdownTitle: "Разбор расчёта",
    breakdownIntro: "",
    condomBlockTitle: "Шанс передачи",
    withoutCondom: "без презерватива", withCondom: "с презервативом",
    barAct: "За 1 контакт (если партнёр заражён)",
    barHor: (years, yw) => `За ${years} ${yw}`,
    perActHead: "Один контакт с заражённым партнёром",
    onePartnerHead: "За 100 контактов с заражённым партнёром",
    onePartnerSub: "за все ваши контакты с ним",
    actsAxis: "100 контактов",
    horizonCond: "со всеми вашими партнёрами — обычно не заражены",
    bandNote: "зелёная зона — риск, который убирает презерватив",
    satDrop: (<>За <b data-hi>один контакт</b> презерватив убирает заметно больше относительного риска, чем за <b data-hi>100 контактов</b> с тем же заражённым партнёром.</>),
    satFlat: (<>И за <b data-hi>один контакт</b>, и за <b data-hi>100 контактов</b> с одним заражённым партнёром презерватив убирает примерно одинаково.</>),
    contribIntro: (years, yw) => (<>Вклад каждого <b data-hi>типа партнёров</b> за {years} {yw} (своя частота, длительность, презерватив, проверенность, фон), затем они объединяются:</>),
    thType: "Тип", thPartners: "Партнёров", thContacts: "Контактов", thTransPerAct: "Передача за контакт", thChanceInf: "Шанс партнёр заразен", thRiskHor: (years, yw) => `Риск за ${years} ${yw}`,
    perYear: "/год",
    noActivePartners: "Нет активных партнёров — добавь кого-нибудь в карточках слева, чтобы увидеть разбор.",
    thContactsInfo: (<><div><b data-hi>Половых актов с одним партнёром</b> этого типа за период</div><span data-f>секс/нед × 52/12 × длительность (мес)</span><div>партнёр на одну ночь = 1 акт</div><div style={{ marginTop: 6 }}>это число идёт в колонку «Риск» — передача копится за все эти контакты</div></>),
    thTransPerActInfo: (<><div><b data-hi>Передача за один контакт</b>, если партнёр заражён</div><div>уже учитывает презерватив этого типа; прививка — отдельно (она снижает весь риск, а не передачу за акт)</div><div style={{ marginTop: 6 }}>у каждого вида секса своя передача</div><span data-f>передача&#8209;за&#8209;акт × множитель&#8209;вида × (1 − доля&#8209;в&#8209;презервативе × защита&#8209;презерватива)</span><div>виды объединяются</div><span data-f>1 − произведение по видам (1 − передача&#8209;вида)</span></>),
    thChanceInfInfo: (<><div><b data-hi>Шанс, что партнёр уже заражён</b> — в два шага</div><FStep name="шанс до анализов"><span data-f>odds(распространённость) × среда × активность</span></FStep><FStep name="шанс заражён"><span data-f>шанс до анализов × (1 − проверенность)</span></FStep><div style={{ marginTop: 8 }}><b data-hi>odds</b> — это «шансы» вместо вероятности; среда и активность умножаются в odds, чтобы итог не вышел за 100%, и конвертирвется обратно в вероятность</div><span data-f>odds = p / (1 − p)</span><span data-f>p = odds / (1 + odds)</span><div>подробнее — в «Допущениях»</div></>),
    thRiskHorInfo: (<><div><b data-hi>Риск заразиться от этого типа за период</b></div><FStep name="передача за все контакты"><span data-f>1 − (1 − передача за контакт)^контактов</span></FStep><FStep name="риск от 1 партнёра"><span data-f>передача за все контакты × шанс заражён</span></FStep><FStep name="риск за период"><span data-f>1 − (1 − риск от 1 партнёра)^партнёров</span></FStep><div style={{ marginTop: 8 }}>у приходящих и хукапов «партнёров» = число в год × годы</div><div>затем типы объединяются в строке «Всего» ниже</div></>),
    thTotal: "Всего",
    thTotalInfo: (<><div><b data-hi>Итоговый риск — высота кривой</b></div><div>типы независимы, поэтому объединяются</div><span data-f>всего = 1 − произведение «не заразиться» по всем типам</span></>),
    vaccRow: (vePct) => `После прививки ×(1 − ${vePct}%)`,
    vaccRowInfo: (<><div><b data-hi>Прививка защищает постоянно</b>, а не отдельно в каждом акте</div><span data-f>итог = риск без прививки × (1 − VE)</span><div>поэтому, в отличие от презерватива, она не зависит от числа контактов; подробнее — в «Допущениях»</div></>),
    assumTitle: "Допущения и логика",
    assumP1: (<>Только для <b data-hi>ВИЧ</b> передача за акт и эффективность презерватива взяты из исследований (сплошная линия). Для остальных инфекций надёжных чисел нет — это правдоподобные оценки по порядку величины (пунктир) на основе данных CDC и ВОЗ;</>),
    assumP2: (<><b data-hi>Типы партнёров.</b> Поведение задаётся тремя типами — постоянные, приходящие и партнёры на одну ночь. У каждого можно отдельно настроить, как часто используется презерватив и как часто ты знаешь о негативных анализах партнёров. Разные партнёры по разному сексуально активны. Из этого взято допущение что преходищие партнёры и хукапы имеют в 2 раза больше вероятности быть заразными чем постоянный партнёр. Прямые оценки «казуальный vs постоянный» слабые и разнятся (примерно ×1,5–2; <a href="https://pubmed.ncbi.nlm.nih.gov/1411843/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "underline" }}>казуальные vs постоянные ↗</a>, <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5737755/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "underline" }}>распространённость у разовых ↗</a>), поэтому берём консервативную ×2.</>),
    assumP3: (<><b data-hi>Виды секса складываются.</b> Считаем, что в каждом контакте присутствуют все выбранные практики, поэтому каждая добавленная только повышает риск (упрощение — в реальности не всегда так). Соотношения рисков опираются на исследования ВИЧ; для остальных инфекций это грубое приближение.</>),
    assumP4: (<><b data-hi>Проверенность.</b> У теста есть «окно» между заражением и положительным результатом, поэтому даже 100% проверенных не гарантируют ноль — это оценка.</>),
    assumP5: (<><b data-hi>Пул партнёров.</b> Оценивает, насколько активнее круг этого типа и потому вероятнее уже заражён партнёр. Относительные множители (постоянные &lt; приходящие &lt; хукапы), не точные величины.</>),
    assumP6: (<><b data-hi>Как считается.</b> Для типа число контактов <span data-f>k = частота × длительность</span> (на одну ночь = 1). Шанс заразиться от партнёра растёт с k и умножается на шанс, что партнёр заражён. Вклады всех типов перемножаются → кумулятивный риск растёт во времени. Точные формулы по столбцам — в подсказках таблицы разбора.</>),
    assumPEnv: (<><b data-hi>Среда.</b> Множитель типа партнёра отражает круг конкретного партнёра, а «Среда» сдвигает фон всего сообщества: безопасная / высокий фон / вспышка задают свой множитель к распространённости каждой инфекции (значения и источники — в таблице с информацией по болезням). Тип партнёра (постоянный/приходящий/хукап) выбирает круг партнёра, а среда задаёт общий уровень. Оба множителя — это отношения шансов (odds ratio) и применяются к распространённости <b data-hi>в пространстве шансов</b>: <span data-f>odds = p/(1−p)</span>. Пример (ВИЧ): во время вспышки распространённость в «кор-группе» примерно в 130 раз выше; множитель типа партнёра (непостоянный ×2) уже учитывается в множители среды, поэтому для среды берём ×65 — вместе <span data-f>×65 × 2 = ×130</span> в odds-пространстве (<a href="https://www.who.int/news-room/fact-sheets/detail/hiv-aids" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "underline" }}>ВОЗ ↗</a>).</>),
    assumCof: (<><b data-hi>Не пролеченные ЗППП (кофактор ВИЧ).</b> Активная нелеченая инфекция (язвы/воспаление) повышает шанс заразиться ВИЧ. Множитель разный у разных инфекций. По мета-анализам: герпес ~2,7×, гонорея ~2,8×, сифилис ~1,7×, хламидия и трихомониаз ~1,5×. Берём единый множитель <span data-f>×2,5</span> — множитель действует только на ВИЧ (он уникально чувствителен к этому). Точность оценки низкая: оценки в основном по женщинам, но применяются ко всем. Источники: <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5700807/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "underline" }}>Looker 2017 ↗</a>, <a href="https://pubmed.ncbi.nlm.nih.gov/35034049/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "underline" }}>Barker 2022 ↗</a>.</>),
    assumVacc: (<><b data-hi>Прививка (ВПЧ / гепатит B).</b> Снижает итоговый риск на свою эффективность — умножаем итог на <span data-f>1 − эффективность</span> (85% убирают 85%). Считаем из всего итога, а не из каждого акта: вакцина гасит вирус антителами на входе, поэтому защита не слабеет от количества секса, в отличие от презерватива. Доля убранного риска одинакова при одном партнёре и при сотне — но абсолютный риск с числом партнёров всё равно растёт.<br /><br />Упрощение: вакцина от ВПЧ покрывает не все типы вируса, защита надёжнее всего до начала половой жизни, у части людей (особенно к гепатиту B) ответ слабее — так что 85% / 95% это оценки, а не личная гарантия.</>),
    assumExTitle: "Пример: как комбинируются среда и активность",
    assumExFormula: (<>Шанс, что партнёр уже заражён = распространённость, домноженная на среду и активность <span data-f>в пространстве шансов (odds × среда × активность)</span>.</>),
    assumSources: (<>Источники: <a href="https://pubmed.ncbi.nlm.nih.gov/1411843/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>казуальные vs постоянные ↗</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5737755/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>распространённость у разовых ↗</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5431278/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>ассортативное смешивание ↗</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC6380304/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>NATSAL-3 ↗</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC2563886/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>презерватив по типу связи (NATSAL, Британия) ↗</a> · <a href="https://www.who.int/news-room/fact-sheets/detail/sexually-transmitted-infections-(stis)" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>ВОЗ ↗</a></>),
    footerDisclaimer: "Это любительская образовательная модель, а не медицинский прогноз и не основание для медицинских решений.",
    footerNoWarranty: "Предоставляется «как есть», только в образовательных целях, без каких-либо гарантий — на свой риск.",
    footerSource: "Исходный код",
    footerFree: "Некоммерческий любительский образовательный проект без куки и с открытым кодом",
    footerContactLink: "Контакты и фидбек",
    githubLink: "Исходный код на GitHub ↗",
    contactTitle: "Контакты и фидбек",
    contactIntro: "Есть несколько способов связаться:",
    contactGithub: (<>Открыть <a href="https://github.com/UserNameIsAlredyTaken/safesex/issues" target="_blank" rel="noopener noreferrer" style={{ color: C.accent, textDecoration: "underline" }}>issue на GitHub</a> — подходит для вопросов и багрепортов (issues публичны, ответы могут пригодиться другим).</>),
    contactEmailLine: (<>Почта: <a href="mailto:contact@sexhealth.info" style={{ color: C.accent, textDecoration: "underline" }}>contact@sexhealth.info</a></>),
    donateCta: "Поддержать проект",
    donateWhy: "— бесплатно, без рекламы и трекеров",
    donateTitle: "Поддержать проект",
    donateIntro: "Любая сумма помогает держать сайт живым и без рекламы. Спасибо!",
    donateKofi: (<>Разово или подпиской — <a href="https://ko-fi.com/sexhealth" target="_blank" rel="noopener noreferrer" style={{ color: C.accent, textDecoration: "underline" }}>Ko-fi</a></>),
    donateLiberapay: (<>Регулярно (раз в неделю) — <a href="https://liberapay.com/sexhealth" target="_blank" rel="noopener noreferrer" style={{ color: C.accent, textDecoration: "underline" }}>Liberapay</a></>),
    donateGithub: (<>Через <a href="https://github.com/sponsors/UserNameIsAlredyTaken" target="_blank" rel="noopener noreferrer" style={{ color: C.accent, textDecoration: "underline" }}>GitHub Sponsors</a></>),
    contactClose: "Закрыть",
    yrAxis: "г",
    modeSti: "🦠 ЗППП",
    modePreg: "🤰 Беременность",
    pregTitle: "Вероятность беременности во времени",
    pregIntro: "",
    pregWarnTitle: "Это любительский калькулятор, а не медицинский инструмент.",
    pregWarnBody: "Модель использует грубые приближения вперемешку с надёжными данными. Не используйте её для планирования беременности, выбора контрацепции или при проблемах с зачатием. Автор не имеет медицинского образования — обратитесь к специалисту.",
    pregWoman: "👩 Девушка / пара",
    pregMan: "👨 Парень",
    pregWomanExpl: (<>Забеременеть можно максимум раз за цикл. Разные партнёры <b>не суммируются</b>: в модели важно только суммарное количество секса и контрацепция, а не число уникальных партнёров.</>),
    pregManExpl: (<>Считаем «хотя бы одна беременность среди партнёрш»: здесь партнёрши <b>суммируются</b> (больше партнёрш/актов → выше шанс ≥1 события).</>),
    pregProfile: "Профиль",
    pregWomanAge: "Возраст женщины",
    pregWomanAgeInfo: "Главный фактор фертильности. В изспользуемой модели резкий спад после 35. (ASRM/Dunson/NICE).",
    pregFreqInfo: "Частота влияет через вероятность попадания в фертильное окно. Плато ~через день.",
    pregLineWoman: "Вероятность беременности",
    pregLineNoContra: "без контрацепции",
    pregHeadWoman: (years, yw, pct, hasContra) => (<>За {years} {yw} вероятность забеременеть ≈ <b data-hi>{pct}</b>{hasContra ? " с выбранной контрацепцией" : " без контрацепции"}.</>),
    pregBehaviorPreset: "Пресет поведения",
    pregPresetInfo: (<>• <b>Без партнёрш</b> — нет партнёрш.<br />• <b>Моногамия</b> — одна постоянная партнёрша.<br />• <b>Встречается</b> — приходящие партнёрши.<br />• <b>Активные знакомства</b> — много приходящих + на одну ночь.<br />• <b>На одну ночь</b> — секс на одну ночь, без продолжения.</>),
    pregMyAge: "Мой возраст",
    pregMyAgeInfo: "Возраст мужчины слабо влияет на фертильность (заметнее после ~45). Здесь грубая оценка — чтобы эффект было видно на графике.",
    pregPartnerAge: "Возраст партнёрши",
    pregPartnerAgeInfo: "Возраст женщины — главный фактор фертильности. Для парня это оценка (часто неизвестен точно).",
    pregLineMan: "≥1 беременность от меня",
    pregLineIfNoContra: "если без контрацепции",
    pregHeadMan: (years, yw, pct) => (<>За {years} {yw} вероятность, что хотя бы одна партнёрша забеременеет ≈ <b data-hi>{pct}</b>.</>),
    pregOneoffCap: "разовый акт",
    pregOngoingCap: "длится весь период",
    pregRelCap: (d) => `связь ${d}`,
    pregNoPartnersF: "Нет партнёрш — добавь в карточках слева.",
    contraLabel: "Контрацепция",
    contraInfo: "При добавлении методов в модели считается что все они используются одновременно каждый акт. У методов которые нужно применять каждый акт есть ползунок частоты использования.",
    addMethod: "+ добавить метод",
    allMethodsAdded: "Все методы добавлены",
    sevTitle: "серьёзность побочек (оценка)",
    removeMethod: "убрать метод",
    shareOfActs: "доля актов с использованием",
    contraTableTitle: "Справка по методам контрацепции",
    contraTableSub: "",
    thMethod: "Метод",
    thPerfect: "Идеальное",
    thTypical: "Реальное",
    pregPerYear: "% бер./год",
    typicalInfo: (<>Это доля женщин, забеременевших за первый год использования метода.<br /><br />«Идеальное» — если применять метод всегда и правильно.<br />«Реальное» — реальное использование с пропусками и ошибками, как у большинства.</>),
    thSideFx: "Побочки",
    howWorks: "Как работает",
    sideRisks: "Побочки и риски",
    whoFor: "Кому / противопоказания",
    contraSourcesTail: "— справочно, не назначение.",
    pregAssumTitle: "Допущения и логика",
    pregAssum1: (<><b data-hi>Вероятность забеременеть</b> накапливается во временем <span data-f>P(t) = 1 − (1 − годовой_отказ)^лет</span>.</>),
    pregAssum2: (<><b data-hi>Фертильность зависит от возраста.</b> Молодая пара имеет вероятность забеременеть ~20–25% за цикл, и после 35 происходит спад. Берём усреднённые популяционные значения (ASRM, Dunson, NICE), хотя индивидуальный разброс вероятности большой.</>),
    pregAssum3: (<><b data-hi>Только зачатие.</b> Модель оценивает вероятность зачатия, а не рождения ребёнка: выкидыши, внематочную беременность и прочие исходы не учитывает.</>),
    pregAssum4: (<><b data-hi>Случайный день цикла.</b> Если фертильное окно не отслеживается, считаем, что акты происходят в случайные дни — базовая фертильность в модели усредняется по всему циклу.</>),
    pregAssum5: (<><b data-hi>Контрацепция.</b> Берётся таблица типичного использования (<a href="https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" target="_blank" rel="noopener noreferrer" style={{ color: "#a78bfa", textDecoration: "none" }}>CDC/Trussell ↗</a>). Несколько методов сочетаются перемножением эффективности.</>),
    pregAssum6: (<><b data-hi>Девушка и парень.</b> В модели рассчитывающей веростность забеременеть девушки партнёры не суммируются, а в каждый цикл возможно только одно зачатие. У парня модель считает «хотя бы одну беременность среди всех партнёрш». Тоесть больше партнёрш и секса без контрацепции → выше шанс что хоть одна из них забеременеет.</>),
    pregAssum7: (<><b data-hi>Парень = ЗППП-логика.</b> «Хотя бы одна беременность среди партнёрш»: вклад каждого типа перемножается. Постоянные — по циклам весь период; приходящие — связь длительностью dur, обновляется за год; хукапы — один акт (per-act ≈ ⅕ от цикловой f — грубая оценка).</>),
    pregAssum8: (<><b data-hi>Почему у парня важно число партнёрш.</b> Каждая партнёрша — отдельный «розыгрыш»: забеременеть она может независимо от других, поэтому считаем не «сколько всего детей», а шанс, что произойдёт <b>хотя бы одна</b> беременность. Чем больше партнёрш и чем больше с каждой секса без надёжной контрацепции — тем выше этот шанс, потому что независимые возможности складываются. Для каждой партнёрши берём вероятность «не забеременела» и перемножаем их; единица минус это произведение и есть «хотя бы одна». У девушки наоборот: партнёры не складываются, потому что её цикл — общее узкое место (одно зачатие за цикл).</>),
    pregAssumSources: (<>Источники: <a href="https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>CDC / Trussell (контрацепция) ↗</a> · <a href="https://www.nice.org.uk/guidance/cg156" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>NICE (фертильность и возраст) ↗</a> · <a href="https://www.who.int/news-room/fact-sheets/detail/infertility" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>ВОЗ (бесплодие) ↗</a></>),
  },
  sr: {
    langName: "Srpski",
    title: "Rizik od PPI tokom vremena",
    badge: "ilustrativni model",
    intro: "",
    warnTitle: "Ovo je amaterski kalkulator, a ne medicinski alat.",
    warnBody: (<>Stvarne verovatnoće su <b style={{ color: C.accent }}>gotovo sigurno netačne</b>, jer model koristi mnogo pretpostavki i procena sa velikim rasponima. Autor nema medicinsko obrazovanje — posavetuj se sa stručnjakom. Glavna korist modela je poređenje kako različiti parametri mogu uticati na verovatnoću zaraze.</>),
    preset: "Preset ponašanja",
    tourStart: "Tura", tourNext: "Dalje", tourSkip: "Preskoči", tourDone: "Gotovo",
    tour1: "Izaberi stil odnosa — popuniće kartice partnera ispod.",
    tour2: "Ova kriva je tvoja kumulativna šansa da se zaraziš tokom godina.",
    tour3: "Probaj da promeniš koliko se često koristi kondom.",
    tour4: "Označi kojim praksama se baviš i u kojoj ulozi.",
    tour5: "Šansa mnogo zavisi od sredine u kojoj živiš.",
    presetInfo: (<>• <b>Celibat</b> — bez seksa.<br />• <b>Monogamija</b> — jedan stalni partner.<br />• <b>Serijska monogamija</b> — jedan partner, ali se vremenom menjaju.<br />• <b>Monogamish</b> — uglavnom jedan + retke veze za jednu noć.<br />• <b>Otvorene / sving</b> — stalni partner plus seks sa strane.<br />• <b>Poliamorija</b> — nekoliko stalnih veza istovremeno.<br />• <b>ONS / jedna noć</b> — seks za jednu noć, bez nastavka.<br />• <b>Core group</b> — uzak krug sa čestom izmenom partnera.</>),
    sexActs: "Vrste seksa",
    sexActsInfo: "Koje prakse i u kojoj ulozi. Rizik po aktu zavisi od prakse: receptivni analni ≈ ×17 u odnosu na vaginalni, insertivni manje, oralni znatno niže (po podacima o HIV-u; grubo za ostale infekcije). Radi jednostavnosti smatramo da su u svakom kontaktu prisutne sve izabrane prakse — pa svaka dodata samo povećava rizik.",
    noActs: "Nijedna praksa nije izabrana — rizik se računa kao nula.",
    protection: "Zaštita i imunitet",
    vaxHpv: "Vakcinisan/a protiv HPV-a",
    vaxHbv: "Vakcinisan/a protiv hepatitisa B",
    stiCof: "Nelečene PPI (utiče na HIV)",
    stiCofInfo: (<><div><b data-hi>Nelečene PPI</b> — aktivna nelečena infekcija povećava šansu zaražavanja HIV-om</div><div style={{ marginTop: 6 }}>množioci po bolestima, tačnost i izvori — u „Pretpostavkama“ ispod</div></>),
    vaccinated: "vakcinisan/a",
    addBtn: "+ dodaj",
    removeCard: "ukloni (broj → 0)",
    shareBtn: "Podeli profil rizika",
    shareDone: "Kopirano u klipbord!",
    shareHint: "Kopiraj link koji otvara baš ova podešavanja",
    poolInfo: (<>Koliko je „aktivan“ krug ovog tipa partnera. Partneri za jednu noć — iz aktivnijeg kruga → češće zaražene.</>),
    bg: "aktivnost", bgMul: (m) => `aktivnost ×${m}`,
    oneActBg: (m) => `1 akt · aktivnost ×${m}`,
    condom: "Akata sa kondomom",
    condomInfo: "Udeo akata sa partnerima ovog tipa u kojima se koristi kondom.",
    tested: "Partneri sa testom",
    testedInfo: "Udeo partnera ovog tipa čiji nedavni negativan test ZNAŠ — rizik smanjuje samo poznat rezultat.",
    details: "detalji",
    sexPerWeek: "Seks nedeljno",
    sexPerWeekHint: "koliko često ima seksa sa jednim takvim partnerom",
    relDuration: "Trajanje veze",
    relDurationHint: "koliko dugo traje jedna takva veza",
    oneoffNote: "Jednokratni kontakt — jedan akt po partneru.",
    ongoingNote: "Traje ceo period — izloženost se gomila tokom vremena.",
    horizon: "Period aktivnog polnog života",
    horizonHint: "",
    scale: "Razmera skale verovatnoće",
    scaleHint: "",
    atLeastOne: "bar jedna od uključenih",
    envLabel: "Sredina",
    envNormal: "bezbedna", envHigh: "visok fon", envOutbreak: "epidemija",
    envInfo: (<>Infekcije se koncentrišu u seksualnim mrežama, pa je partner zaražen češće nego po prosečnoj rasprostranjenosti. Prekidač množi rasprostranjenost svake infekcije — sopstveni množilac, vidi karticu bolesti.<br /><br /><b>Visok fon</b> — aktivniji, rizičniji krug.<br /><b>Epidemija</b> — koncentrisana mreža tokom aktivne epidemije.<br /><br />Procene množilaca su velike pretpostavke, a ne predviđanje.</>),
    hivBtn: "Rizik od HIV-a",
    hivTitle: "Rizik od HIV-a nije ravnomeran",
    hivP1: "U svakodnevnom životu rizik od HIV-a je nizak, ali u lokalnoj epidemiji unutar seksualne mreže može postati vrlo visok. Epidemija se razbukti neprimetno — možda nećeš znati za nju dok ne bude kasno.",
    hivP2: "Paralelne nelečene PPI povećavaju šansu prenosa HIV-a po aktu: rane i upala otvaraju „vrata“ i dovode ciljne ćelije do sluzokože.",
    hivP3: "Barijerna kontracepcija (kondom) snažno smanjuje šansu zaražavanja — naročito za HIV.",
    hivChanged: "Scenario je postavio:",
    hivChip1: "Sredina → epidemija",
    hivChip2: "Nelečene PPI → uključeno",
    hivChip3: "Akata sa kondomom → 0%",
    hivBannerText: "Scenario povišenog rizika od HIV-a",
    hivBannerMore: "Detalji",
    envGuideLabel: "Rizik sredine",
    anyLabel: "Bar jedna",
    topRiskLine: (years, yw, name, col) => (<>Tokom {years} {yw} aktivnog polnog života najviši rizik je <span style={{ color: col, fontWeight: 600 }}>{name}</span>.</>),
    enableOne: "Uključi bar jednu infekciju ispod.",
    structTitle: "Struktura partnerstava tokom vremena",
    structStats: (avg, lanes, total) => (<>seks ≈ <b data-hi>{avg}×</b>/ned · vrh <b data-hi>{lanes}</b> · ukupno veza: <b data-hi>{total}</b></>),
    legSteady: "stalni partneri", legCasual: "povremeni partneri", legHookup: "za jednu noć",
    structLegendTail: "",
    noPartners: "Nema partnera — dodaj u karticama levo.",
    shownPart: (total) => `prikazan deo veza radi preglednosti — statistika po svih ${total}`,
    perWk: "/ned",
    thInfection: "Infekcija",
    thRisk: (years, yw) => `Rizik za ${years} ${yw}`,
    thPerAct: "Po aktu: bez → sa kondomom",
    thTreatment: "Lečenje",
    thConsequences: "Posledice",
    thSource: "Izvor",
    accuracyLab: "Tačnost",
    acc: { "high": "visoka", "low-mid": "niska–srednja", "low": "niska" },
    sourcesLab: "Izvori",
    guideTail: "",
    sympt: "Simptomi", treatm: "Lečenje", conseq: "Posledice", prevent: "Prevencija",
    collapseGuide: "skupi vodič", openGuide: "otvori vodič o bolesti",
    breakdownTitle: "Razrada računa — odakle dolazi broj",
    breakdownIntro: "",
    condomBlockTitle: "Šta daje kondom (ako se koristi u svakom kontaktu sa svima)",
    withoutCondom: "bez kondoma", withCondom: "sa kondomom",
    barAct: "Po 1 kontaktu (sve prakse, ako je partner zaražen)",
    barHor: (years, yw) => `Za ${years} ${yw}`,
    perActHead: "Jedan kontakt sa zaraženim partnerom",
    onePartnerHead: "Za 100 kontakata sa zaraženim partnerom",
    onePartnerSub: "tokom svih vaših kontakata s njim",
    actsAxis: "100 kontakata",
    horizonCond: "sa svim vašim partnerima — obično nezaraženi",
    bandNote: "zelena zona — rizik koji kondom uklanja",
    satDrop: (<>Po <b data-hi>jednom kontaktu</b> kondom uklanja primetno više relativnog rizika nego za <b data-hi>100 kontakata</b> sa istim zaraženim partnerom.</>),
    satFlat: (<>I po <b data-hi>jednom kontaktu</b> i za <b data-hi>100 kontakata</b> sa jednim zaraženim partnerom kondom uklanja otprilike isto.</>),
    contribIntro: (years, yw) => (<>Doprinos svakog <b data-hi>tipa partnera</b> za {years} {yw} (sopstvena učestalost, trajanje, kondom, udeo testiranih, pozadina), zatim se kombinuju:</>),
    thType: "Tip", thPartners: "Partnera", thContacts: "Kontakata", thTransPerAct: "Prenos po kontaktu", thChanceInf: "Šansa da je partner zaražen", thRiskHor: (years, yw) => `Rizik za ${years} ${yw}`,
    perYear: "/god",
    noActivePartners: "Nema aktivnih partnera — dodaj nekoga u karticama levo da bi video/la razradu.",
    thContactsInfo: (<><div><b data-hi>Polnih akata sa jednim partnerom</b> ovog tipa tokom perioda</div><span data-f>seks/ned × 52/12 × trajanje (mes)</span><div>partner za jednu noć = 1 akt</div><div style={{ marginTop: 6 }}>ovaj broj ulazi u kolonu „Rizik“ — prenos se gomila kroz sve ove kontakte</div></>),
    thTransPerActInfo: (<><div><b data-hi>Prenos u jednom kontaktu</b>, ako je partner zaražen</div><div>već uračunava kondom ovog tipa; vakcina je posebno (smanjuje ceo rizik, a ne prenos po aktu)</div><div style={{ marginTop: 6 }}>svaka vrsta seksa ima svoj prenos</div><span data-f>prenos&#8209;po&#8209;aktu × množilac&#8209;vrste × (1 − udeo&#8209;sa&#8209;kondomom × zaštita&#8209;kondoma)</span><div>vrste se objedinjuju</div><span data-f>1 − proizvod po vrstama (1 − prenos&#8209;vrste)</span></>),
    thChanceInfInfo: (<><div><b data-hi>Šansa da je partner već zaražen</b> — u dva koraka</div><FStep name="šansa pre testiranja"><span data-f>odds(rasprostranjenost) × sredina × aktivnost</span></FStep><FStep name="šansa da je zaražen"><span data-f>šansa pre testiranja × (1 − testirani)</span></FStep><div style={{ marginTop: 8 }}><b data-hi>odds</b> su „šanse“ umesto verovatnoće; sredina i aktivnost se množe u odds da rezultat ne pređe 100%, pa nazad u verovatnoću</div><span data-f>odds = p / (1 − p)</span><span data-f>p = odds / (1 + odds)</span><div>više u „Pretpostavkama“</div></>),
    thRiskHorInfo: (<><div><b data-hi>Rizik od zaraze od ovog tipa tokom perioda</b> — tri koraka, kao u ćeliji</div><FStep name="prenos po svim kontaktima"><span data-f>1 − (1 − prenos po kontaktu)^kontakata</span></FStep><FStep name="rizik od 1 partnera"><span data-f>prenos po svim kontaktima × šansa da je zaražen</span></FStep><FStep name="rizik za period"><span data-f>1 − (1 − rizik od 1 partnera)^partnera</span></FStep><div style={{ marginTop: 8 }}>kod povremenih i partnera za jednu noć „partnera“ = broj godišnje × godine</div><div>zatim se tipovi objedinjuju u redu „Ukupno“ ispod</div></>),
    thTotal: "Ukupno",
    thTotalInfo: (<><div><b data-hi>Konačni rizik — visina krive</b></div><div>tipovi su nezavisni, pa se objedinjuju</div><span data-f>ukupno = 1 − proizvod „ne zaraziti se“ po svim tipovima</span></>),
    vaccRow: (vePct) => `Posle vakcine ×(1 − ${vePct}%)`,
    vaccRowInfo: (<><div><b data-hi>Vakcina štiti sve vreme</b>, a ne posebno u svakom aktu</div><span data-f>ukupno = rizik bez vakcine × (1 − VE)</span><div>zato, za razliku od kondoma, ne zavisi od broja kontakata; više u „Pretpostavkama“</div></>),
    assumTitle: "Pretpostavke i kako se ovo računa",
    assumP1: (<>Samo za <b data-hi>HIV</b> su prenos po aktu i efikasnost kondoma uzeti iz istraživanja (puna linija). Za ostale infekcije nema pouzdanih brojeva — to su procene reda veličine (isprekidana) na osnovu CDC i SZO; izvor za svaku infekciju je u koloni „Izvor“ tabele.</>),
    assumP2: (<><b data-hi>Tipovi partnera.</b> Ponašanje se zadaje sa tri tipa — stalni, povremeni i partneri za jednu noć. Za svaki posebno možeš podesiti koliko se često koristi kondom i koliko znaš o testovima partnera. Množilac „koliko je verovatno da je partner već zaražen“ računa se u odnosu na prosečnog slučajnog partnera (iz podataka nadzora): stalni ≈ taj prosek (×1), dok su nestalni — i povremeni i za jednu noć — otprilike dvostruko verovatnije zaraženi (×2). Direktne procene „povremeni vs stalni“ su slabe i variraju (oko ×1,5–2; <a href="https://pubmed.ncbi.nlm.nih.gov/1411843/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "underline" }}>povremeni vs stalni ↗</a>, <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5737755/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "underline" }}>prevalencija kod jednokratnih ↗</a>), pa uzimamo konzervativnih ×2. Razliku između „nekoliko susreta“ i „jedne noći“ ne nosi ovaj množilac, već broj partnera i akata sa svakim. Množilac je relativan — opšti nivo zajednice zadaje „Sredina“, i množe se u prostoru šansi, bez dvostrukog brojanja.</>),
    assumP3: (<><b data-hi>Vrste seksa se sabiraju.</b> Smatramo da je u svakom kontaktu prisutna svaka izabrana praksa, pa dodavanje samo povećava rizik (pojednostavljenje — u stvarnosti nije uvek tako). Odnosi rizika oslanjaju se na HIV; za ostale infekcije to je gruba aproksimacija.</>),
    assumP4: (<><b data-hi>Udeo testiranih.</b> Test ima „prozor“ između zaraze i pozitivnog rezultata, pa čak ni 100% testiranih ne garantuje nulu — to je procena.</>),
    assumP5: (<><b data-hi>Pul partnera.</b> Procenjuje koliko je aktivniji krug ovog tipa i zato verovatnije da je partner već zaražen. Relativni množioci (stalni &lt; povremeni &lt; avanture), ne tačne vrednosti.</>),
    assumP6: (<><b data-hi>Kako se računa.</b> Po tipu broj kontakata je <span data-f>k = učestalost × trajanje</span> (jedna noć = 1). Šansa za zarazu od partnera raste sa k i množi se šansom da je partner zaražen. Doprinosi svih tipova se množe → kumulativni rizik raste tokom vremena. Tačne formule po kolonama su u podsetnicima tabele razrade.</>),
    assumPEnv: (<><b data-hi>Sredina.</b> Množilac tipa partnera odražava krug konkretnog partnera, a „Sredina“ pomera osnovu cele zajednice: bezbedna / visok fon / epidemija — sopstveni množilac na rasprostranjenost svake infekcije (vrednosti i izvori na karticama bolesti). Tip bira krug partnera, sredina zadaje opšti nivo. Oba množioca su odnosi šansi (odds ratio) i primenjuju se na rasprostranjenost <b data-hi>u prostoru šansi</b>: <span data-f>odds = p/(1−p)</span>, množimo sredinom i aktivnošću, vraćamo nazad <span data-f>p = o/(1+o)</span>. Zato „šansa da je partner zaražen“ nikada ne prelazi 100%: za česte infekcije se blago zasiti, za retke je skoro kao obično množenje. Primer (HIV): u epidemiji je prevalencija u „core-grupi“ otprilike 130× viša od proseka; deo toga već nosi množilac tipa partnera (nestalni ×2), pa za sredinu uzimamo ×65 — zajedno <span data-f>×65 × 2 = ×130</span> u prostoru šansi (<a href="https://www.who.int/news-room/fact-sheets/detail/hiv-aids" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "underline" }}>SZO ↗</a>). To je u suštini oblik Bajesove teoreme: šanse × odnos verodostojnosti.</>),
    assumCof: (<><b data-hi>Nelečene PPI (kofaktor HIV-a).</b> Aktivna nelečena infekcija (rane/upala) povećava šansu zaražavanja HIV-om. Množilac se razlikuje po infekciji — po meta-analizama: herpes ~2,7×, gonoreja ~2,8×, sifilis ~1,7×, hlamidija i trihomonijaza ~1,5×. Uzimamo jedinstven <span data-f>×2,5</span> — deluje samo na HIV (jedinstveno osetljiv na ovo). Tačnost je niska: procene su uglavnom iz podataka o ženama, ali se primenjuju na sve. Izvori: <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5700807/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "underline" }}>Looker 2017 ↗</a>, <a href="https://pubmed.ncbi.nlm.nih.gov/35034049/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "underline" }}>Barker 2022 ↗</a>.</>),
    assumVacc: (<><b data-hi>Vakcina (HPV / hepatitis B).</b> Smanjuje konačni rizik za svoju efikasnost — množimo ukupno sa <span data-f>1 − efikasnost</span> (85% uklanja 85%). Računamo od celog rezultata, a ne od svakog akta: vakcina gasi virus antitelima na ulazu, pa zaštita ne slabi od količine seksa, za razliku od kondoma. Udeo uklonjenog rizika je isti i sa jednim partnerom i sa sto — ali apsolutni rizik ipak raste sa brojem partnera.<br /><br />Uprošćenje: vakcina protiv HPV-a pokriva samo neke tipove virusa, zaštita je najpouzdanija pre početka polnog života, a kod nekih ljudi (naročito za hepatitis B) odgovor je slabiji — pa su 85% / 95% prosečne procene, a ne lična garancija.</>),
    assumExTitle: "Primer: kako se kombinuju sredina i pul",
    assumExFormula: (<>Šansa da je partner već zaražen = rasprostranjenost pomnožena sredinom i pulom <span data-f>u prostoru šansi (odds × sredina × pul)</span>.</>),
    assumSources: (<>Izvori: <a href="https://pubmed.ncbi.nlm.nih.gov/1411843/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>povremeni vs stalni ↗</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5737755/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>prevalencija kod jednokratnih ↗</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5431278/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>asortativno mešanje ↗</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC6380304/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>NATSAL-3 ↗</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC2563886/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>kondom po tipu veze (NATSAL, Britanija) ↗</a> · <a href="https://www.who.int/news-room/fact-sheets/detail/sexually-transmitted-infections-(stis)" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>SZO ↗</a></>),
    footerDisclaimer: "Ovo je amaterski edukativni model, a ne medicinska prognoza ni osnov za medicinske odluke.",
    footerNoWarranty: "Pruža se „kao takvo“, samo u edukativne svrhe, bez ikakvih garancija — na sopstveni rizik.",
    footerSource: "Izvorni kod",
    footerFree: "Nekomercijalni amaterski edukativni projekat — bez kolačića, otvoren kod",
    footerContactLink: "Kontakt i utisci",
    githubLink: "Izvorni kod na GitHub-u ↗",
    contactTitle: "Kontakt i utisci",
    contactIntro: "Postoji nekoliko načina da me kontaktirate:",
    contactGithub: (<>Otvorite <a href="https://github.com/UserNameIsAlredyTaken/safesex/issues" target="_blank" rel="noopener noreferrer" style={{ color: C.accent, textDecoration: "underline" }}>issue na GitHub-u</a> — pogodno za pitanja i predloge (issues su javni, odgovori mogu pomoći drugima).</>),
    contactEmailLine: (<>Imejl: <a href="mailto:contact@sexhealth.info" style={{ color: C.accent, textDecoration: "underline" }}>contact@sexhealth.info</a></>),
    donateCta: "Podrži projekat",
    donateWhy: "— besplatno, bez reklama i trekera",
    donateTitle: "Podrži projekat",
    donateIntro: "Bilo koji iznos pomaže da sajt živi i bez reklama. Hvala!",
    donateKofi: (<>Jednokratno ili mesečno — <a href="https://ko-fi.com/sexhealth" target="_blank" rel="noopener noreferrer" style={{ color: C.accent, textDecoration: "underline" }}>Ko-fi</a></>),
    donateLiberapay: (<>Redovno (nedeljno) — <a href="https://liberapay.com/sexhealth" target="_blank" rel="noopener noreferrer" style={{ color: C.accent, textDecoration: "underline" }}>Liberapay</a></>),
    donateGithub: (<>Preko <a href="https://github.com/sponsors/UserNameIsAlredyTaken" target="_blank" rel="noopener noreferrer" style={{ color: C.accent, textDecoration: "underline" }}>GitHub Sponsors</a></>),
    contactClose: "Zatvori",
    yrAxis: "g",
    modeSti: "🦠 PPI",
    modePreg: "🤰 Trudnoća",
    pregTitle: "Verovatnoća trudnoće tokom vremena",
    pregIntro: "",
    pregWarnTitle: "Ovo je amaterski kalkulator, a ne medicinski alat.",
    pregWarnBody: "Model meša grube aproksimacije sa pouzdanim podacima. Ne koristi ga za planiranje trudnoće, izbor kontracepcije ili kod problema sa začećem — obrati se stručnjaku.",
    pregWoman: "👩 Devojka / par",
    pregMan: "👨 Mladić",
    pregWomanExpl: (<><b data-hi>Model „Devojka“ je ekvivalentan modelu „Par“.</b> Trudnoća je moguća najviše jednom po ciklusu. Partneri se <b>ne sabiraju</b>: bitna je samo ukupna količina seksa i kontracepcija, a ne broj partnera.</>),
    pregManExpl: (<>Računamo „bar jednu trudnoću među partnerkama“: ovde se partnerke <b>sabiraju</b> (više partnerki/akata → veća šansa za ≥1 događaj).</>),
    pregProfile: "Profil",
    pregWomanAge: "Starost žene",
    pregWomanAgeInfo: "Glavni faktor plodnosti; nagli pad posle 35. Vrednosti po starosti su procena trenda (ASRM/Dunson/NICE).",
    pregFreqInfo: "Učestalost utiče preko pogađanja plodnog prozora; plato ~svaki drugi dan. Oblik zavisnosti je procena.",
    pregLineWoman: "Verovatnoća trudnoće",
    pregLineNoContra: "bez kontracepcije",
    pregHeadWoman: (years, yw, pct, hasContra) => (<>Za {years} {yw} verovatnoća da se zatrudni ≈ <b data-hi>{pct}</b>{hasContra ? " sa izabranom kontracepcijom" : " bez kontracepcije"}.</>),
    pregBehaviorPreset: "Preset ponašanja",
    pregPresetInfo: (<>• <b>Bez partnerki</b> — nema partnerki.<br />• <b>Monogamija</b> — jedna stalna partnerka.<br />• <b>Zabavlja se</b> — povremene partnerke.<br />• <b>Aktivna upoznavanja</b> — mnogo povremenih + jedna noć.<br />• <b>Jedna noć</b> — seks za jednu noć, bez nastavka.</>),
    pregMyAge: "Moja starost",
    pregMyAgeInfo: "Starost muškarca slabo utiče na plodnost (uočljivije posle ~45). Ovde je gruba procena — da bi efekat bio vidljiv na grafikonu.",
    pregPartnerAge: "Starost partnerke",
    pregPartnerAgeInfo: "Starost žene je glavni faktor plodnosti. Za mladića je to procena (često nije tačno poznata).",
    pregLineMan: "≥1 trudnoća od mene",
    pregLineIfNoContra: "ako bez kontracepcije",
    pregHeadMan: (years, yw, pct) => (<>Za {years} {yw} verovatnoća da bar jedna partnerka zatrudni ≈ <b data-hi>{pct}</b>.</>),
    pregOneoffCap: "jednokratni akt",
    pregOngoingCap: "traje ceo period",
    pregRelCap: (d) => `veza ${d}`,
    pregNoPartnersF: "Nema partnerki — dodaj u karticama levo.",
    contraLabel: "Kontracepcija",
    contraInfo: "Dodaj metode koje koristiš — koliko god želiš i kombinuj ih. Kod metoda „po aktu“ (kondom itd.) klizač zadaje udeo akata. Detalji i izvori — u referenci ispod.",
    addMethod: "+ dodaj metod",
    allMethodsAdded: "Svi metodi su dodati",
    sevTitle: "ozbiljnost neželjenih efekata (procena)",
    removeMethod: "ukloni metod",
    shareOfActs: "udeo akata sa korišćenjem",
    contraTableTitle: "Referenca metoda kontracepcije",
    contraTableSub: "",
    thMethod: "Metod",
    thPerfect: "Idealno",
    thTypical: "Stvarno",
    pregPerYear: "% trud./god.",
    typicalInfo: (<>Ovo je udeo žena koje su zatrudnele tokom prve godine korišćenja metoda.<br /><br />„Idealno“ — ako se metod uvek koristi pravilno.<br />„Stvarno“ — stvarno korišćenje sa propustima i greškama, kao kod većine.</>),
    thSideFx: "Neželjeni efekti",
    howWorks: "Kako radi",
    sideRisks: "Neželjeni efekti i rizici",
    whoFor: "Za koga / kontraindikacije",
    contraSourcesTail: "— informativno, ne propisivanje.",
    pregAssumTitle: "Pretpostavke i kako se ovo računa",
    pregAssum1: (<><b data-hi>Jedinica je ciklus (≈mesec).</b> Kumulativ <span data-f>P(t) = 1 − (1 − godišnji_neuspeh)^godina</span> — ista „logika preživljavanja“ kao u PPI režimu.</>),
    pregAssum2: (<><b data-hi>Plodnost zavisi od starosti.</b> Mlad par ~20–25% po ciklusu, nagli pad posle 35. Uzimamo prosečne populacione vrednosti (ASRM, Dunson, NICE) — procena trenda, ne lična verovatnoća; individualni raspon je velik.</>),
    pregAssum3: (<><b data-hi>Samo začeće.</b> Model procenjuje verovatnoću začeća, a ne rođenja deteta: pobačaji, vanmaterična trudnoća i drugi ishodi se ne računaju.</>),
    pregAssum4: (<><b data-hi>Slučajan dan ciklusa.</b> Ako se plodni prozor ne prati, smatramo da se akti dešavaju slučajnih dana — osnovna plodnost je usrednjena po celom ciklusu.</>),
    pregAssum5: (<><b data-hi>Kontracepcija.</b> Iz tabele tipičnog korišćenja (<a href="https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" target="_blank" rel="noopener noreferrer" style={{ color: "#a78bfa", textDecoration: "none" }}>CDC/Trussell ↗</a>). Više metoda se kombinuje množenjem (procena odozdo).</>),
    pregAssum6: (<><b data-hi>Devojka i mladić.</b> Kod devojke se partneri ne sabiraju — jedno začeće po ciklusu. Kod mladića računamo „bar jednu trudnoću među partnerkama“: više partnerki i seksa bez kontracepcije → veća šansa.</>),
    pregAssum7: (<><b data-hi>Mladić = PPI logika.</b> „Bar jedna trudnoća među partnerkama“: doprinos svakog tipa se množi. Stalni — po ciklusima ceo period; povremeni — veza trajanja dur, obnavlja se godišnje; avanture — jedan akt (per-act ≈ ⅕ ciklusne f — gruba procena).</>),
    pregAssum8: (<><b data-hi>Zašto je broj partnerki bitan za mladića.</b> Svaka partnerka je zaseban „pokušaj“: ona može zatrudneti nezavisno od drugih, pa računamo ne „koliko dece ukupno“ već šansu da se desi <b>bar jedna</b> trudnoća. Što više partnerki — i što više seksa bez pouzdane kontracepcije sa svakom — to je ta šansa veća, jer se nezavisne mogućnosti sabiraju. Za svaku partnerku uzimamo verovatnoću „nije zatrudnela“ i množimo ih; jedan minus taj proizvod je „bar jedna“. Kod devojke je obrnuto: partneri se ne sabiraju, jer je njen ciklus zajedničko usko grlo (jedno začeće po ciklusu).</>),
    pregAssumSources: (<>Izvori: <a href="https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>CDC / Trussell (kontracepcija) ↗</a> · <a href="https://www.nice.org.uk/guidance/cg156" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>NICE (plodnost i starost) ↗</a> · <a href="https://www.who.int/news-room/fact-sheets/detail/infertility" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>SZO (neplodnost) ↗</a></>),
  },
};
const LANGS = ["en", "ru", "sr"];

const TYPES = [
  { key:"steady", label:{ en:"Steady partners", ru:"Постоянные партнёры", sr:"Stalni partneri" }, color:"#f0a500", kind:"ongoing",  countMax:3,  countLab:{ en:"how many", ru:"сколько", sr:"koliko" }, addCount:1 },
  { key:"casual", label:{ en:"Recurring partners", ru:"Приходящие партнёры", sr:"Povremeni partneri" }, color:"#2ec4b6", kind:"recurring", countMax:12, countLab:{ en:"such partners per year", ru:"Таких партнёров в год", sr:"takvih partnera godišnje" }, addCount:2 },
  { key:"hookup", label:{ en:"One-night partner", ru:"Партнёр на одну ночь", sr:"Partner za jednu noć" }, color:"#4dabf7", kind:"oneoff",   countMax:50, countLab:{ en:"such partners per year", ru:"Таких партнёров в год", sr:"takvih partnera godišnje" }, addCount:5 },
];
const BASE = {
  steady: { count:1, condom:100, perWeek:2.5, dur:0,   tested:0, poolMul:1.0 },
  casual: { count:2, condom:100, perWeek:1,   dur:2.5, tested:0, poolMul:2.0 },
  hookup: { count:2, condom:100, perWeek:0,   dur:0,   tested:0, poolMul:2.0 },
};
const mkCfg = (over = {}) => ({
  steady: { ...BASE.steady, ...(over.steady || { count: 0 }) },
  casual: { ...BASE.casual, ...(over.casual || { count: 0 }) },
  hookup: { ...BASE.hookup, ...(over.hookup || { count: 0 }) },
});
const PRESETS = [
  { key:"celibate", label:{ en:"Celibacy", ru:"Целибат", sr:"Celibat" } },
  { key:"mono", label:{ en:"Monogamy", ru:"Моногамия", sr:"Monogamija" }, steady:{count:1,perWeek:3} },
  { key:"serial", label:{ en:"Serial monogamy", ru:"Серийная моногамия", sr:"Serijska monogamija" }, casual:{count:0.4,perWeek:3,dur:24} },
  { key:"monogamish", label:{ en:"Monogamish", ru:"Monogamish", sr:"Monogamish" }, steady:{count:1,perWeek:3}, hookup:{count:2} },
  { key:"open", label:{ en:"Open / swing", ru:"Открытые / свинг", sr:"Otvorene / sving" }, steady:{count:1,perWeek:2}, casual:{count:4,perWeek:1,dur:2}, hookup:{count:3} },
  { key:"poly", label:{ en:"Polyamory", ru:"Полиамория", sr:"Poliamorija" }, steady:{count:2,perWeek:2}, casual:{count:1,perWeek:1,dur:6} },
  { key:"ons", label:{ en:"ONS / one-night", ru:"ONS / на одну ночь", sr:"ONS / jedna noć" }, hookup:{count:12} },
  { key:"core", label:{ en:"Core group", ru:"Core group", sr:"Core grupa" }, casual:{count:2,perWeek:1,dur:1}, hookup:{count:30} },
];

// Кофактор: активная нелеченая ЗППП повышает передачу ВИЧ за акт (язвы/воспаление → ворота + клетки-мишени).
// Единый множитель к β ТОЛЬКО для ВИЧ (он уникально чувствителен). β мал → odds-формула не нужна, βeff клампится.
const HIV_COFACTOR = 2.5;
// Множитель к β ЗА АКТ — только биологический кофактор (нелеченая ЗППП повышает передачу ВИЧ за акт).
// ВАЖНО: прививка СЮДА НЕ входит. Прививка — стойкий иммунитет на уровне ЧЕЛОВЕКА, а не свойство одного
// акта. Если моделировать её как множитель к β за акт (как презерватив), при многих контактах она
// «насыщается» и исчезает из кумулятивного риска (так было у ВПЧ) — это противоречит тому, как VE
// измеряют в исследованиях (доля заболевших у привитых vs непривитых за весь период). Поэтому прививка
// применяется person-level: × (1 − VE) к итоговому риску, в survivalAt. См. «Допущения».
const cofMulOf = (s, stiCof) => ((s.key === "hiv" && stiCof) ? HIV_COFACTOR : 1);
// Эффективность прививки VE (доля полностью защищённых, модель «всё-или-ничего»); 0 если не привит.
const vaccVeOf = (s, vaxHpv, vaxHbv) => (((s.key === "hpv" && vaxHpv) || (s.key === "hbv" && vaxHbv)) && s.vax ? s.vax.ve : 0);

// Множитель передачи на акт по виду секса, относительно рецептивного вагинального (=1).
// Опорные значения по ВИЧ (Patel 2014, CDC, на 10 000 экспозиций): рец.ваг 8, ввод.ваг 4,
// рец.анал 138, ввод.анал 11, оральный — очень низкий. Для не-ВИЧ — грубое приближение.
// vagVV — вульва к вульве (трибадизм), непроникающий контакт слизистых. Для ВИЧ (анкер) риск
// очень низкий (только описания случаев, per-act оценок нет) → ставим низкий множитель. ВАЖНО: для
// ВПЧ/герпеса/трихомониаза это, наоборот, основной путь, но HIV-анкерная модель его не отражает —
// помечено как грубое приближение (см. принципы честности). vagVV в конце ACT_KEYS — чтобы не ломать
// старые share-ссылки (биты маски 0–5 сохранены).
const ACT_MUL = { vagR: 1, vagI: 0.5, analR: 17, analI: 1.4, oralR: 0.1, oralI: 0.02, vagVV: 0.1 };
const ACT_KEYS = ["vagR", "vagI", "analR", "analI", "oralR", "oralI", "vagVV"];
const actSelOf = (acts) => ACT_KEYS.filter((k) => acts[k]).map((k) => ACT_MUL[k]);

// Аддитивная модель видов секса: в каждом контакте практикуется каждая выбранная практика
// (со своим множителем к β). Выживаемость за один контакт = произведение «не заразиться» по
// всем практикам, поэтому добавление практики риск только повышает (или не меняет, если β·m≈0).
// factor = (1 − презерватив·e)·прививка. Пустой набор → 1 (риск 0). Каждый βeff клампится.
const encSurvOf = (s, actSel, factor) => {
  let surv = 1;
  for (let i = 0; i < actSel.length; i++) surv *= 1 - Math.min(0.999, s.beta * actSel[i] * factor);
  return surv;
};

// betaMul — множитель к β за акт (кофактор); vaccVe — эффективность прививки на уровне человека.
function survivalAt(s, t, cfg, betaMul, actSel = [1], vaccVe = 0) {
  let Srec = 1;
  ["casual", "hookup"].forEach((key) => {
    const T = cfg[key]; const cnt = T.count; // приходящие/хукапы — дробное число в год (флот)
    if (cnt <= 0) return;
    const encSurv = encSurvOf(s, actSel, (1 - (T.condom / 100) * s.e) * betaMul);
    const k = key === "hookup" ? 1 : Math.max(1, T.perWeek * (52 / 12) * T.dur);
    const pEff = oddsScale(s.p, T.poolMul) * (1 - T.tested / 100);
    const transmit = 1 - Math.pow(encSurv, k);
    Srec *= Math.pow(1 - pEff * transmit, cnt);
  });
  const recCum = Math.pow(Srec, t / 12);
  let steadySurv = 1;
  const ST = cfg.steady; const sc = Math.round(ST.count);
  if (sc > 0) {
    const encSurv = encSurvOf(s, actSel, (1 - (ST.condom / 100) * s.e) * betaMul);
    const k = Math.max(1, ST.perWeek * (52 / 12) * t);
    const pEff = oddsScale(s.p, ST.poolMul) * (1 - ST.tested / 100);
    const transmit = 1 - Math.pow(encSurv, k);
    steadySurv = Math.pow(1 - pEff * transmit, sc);
  }
  const S = recCum * steadySurv;
  // Прививка — person-level: с вероятностью VE человек полностью невосприимчив → итоговый риск × (1 − VE).
  // НЕ зависит от числа контактов (в отличие от презерватива). Так VE и измеряют в исследованиях.
  return vaccVe > 0 ? 1 - (1 - vaccVe) * (1 - S) : S;
}

function Info({ text, dn }) {
  return (
    <span className={"src" + (dn ? " dn" : "")} tabIndex={0} style={{ marginLeft: 6, verticalAlign: "middle" }}>
      <span className="ic">i</span>
      <span className="box">{text}</span>
    </span>
  );
}
// Значение в таблице с тултипом-формулой. f — JSX: подпись + блоки <span data-f> с подставленными
// числами, у каждого числа подписана переменная. Пунктир — намёк на наведение.
function CellTip({ children, f }) {
  return (
    <span className="src" tabIndex={0}>
      <span style={{ borderBottom: `1px dotted ${C.dim}` }}>{children}</span>
      <span className="box" style={{ fontWeight: 400, textAlign: "left" }}>{f}</span>
    </span>
  );
}

const RECV = { en: "receptive", ru: "принимающий", sr: "receptivni" };
const INS = { en: "insertive", ru: "вводящий", sr: "insertivni" };
const GIVE = { en: "giving", ru: "отдающий", sr: "aktivni" };
const VV = { en: "vulva-to-vulva", ru: "вульва к вульве", sr: "vulva uz vulvu" };
const SEXACTS = [
  { grp: { en: "Vaginal", ru: "Вагинальный", sr: "Vaginalni" }, excl: true, items: [["vagR", RECV], ["vagI", INS], ["vagVV", VV]] },
  { grp: { en: "Anal", ru: "Анальный", sr: "Analni" }, excl: false, items: [["analR", RECV], ["analI", INS]] },
  { grp: { en: "Oral", ru: "Оральный", sr: "Oralni" }, excl: false, items: [["oralR", RECV], ["oralI", GIVE]] },
];
// Подпись каждой практики (для легенды тултипа «передача за акт»): «группа роль», по языку. vagVV самодостаточна.
const ACT_LABEL = {};
SEXACTS.forEach((g) => g.items.forEach(([k, role]) => {
  const low = (str) => str.charAt(0).toLowerCase() + str.slice(1);
  ACT_LABEL[k] = k === "vagVV" ? role : { en: `${low(g.grp.en)} ${role.en}`, ru: `${low(g.grp.ru)} ${role.ru}`, sr: `${low(g.grp.sr)} ${role.sr}` };
}));
// Анатомические противоречия: рецептивный вагинальный требует вагины, вводящие акты — пениса.
// Поэтому рец. вагинальный взаимоисключается с вводящим вагинальным И вводящим анальным.
// vagVV (вульва к вульве) тоже требует вульву — ведёт себя как vagR: совместим с принимающими
// актами (рец. вагинальный/анальный), исключает только акты с пенисом (вводящий ваг./анал.).
const ACT_CONFLICTS = {
  vagR: ["vagI", "analI"],
  vagI: ["vagR", "vagVV"],
  analI: ["vagR", "vagVV"],
  vagVV: ["vagI", "analI"],
};
function SexActs({ acts, setActs, lang }) {
  const toggle = (grp, key) => setActs((a) => {
    const next = { ...a, [key]: !a[key] };
    if (next[key]) (ACT_CONFLICTS[key] || []).forEach((k) => { next[k] = false; });
    return next;
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {SEXACTS.map((grp) => (
        <div key={grp.grp.en} style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
          <span style={{ color: C.mid, fontSize: 12.5, width: 96, flex: "0 0 96px", paddingTop: 6 }}>{grp.grp[lang]}</span>
          <div style={{ display: "flex", gap: 6, rowGap: 6, flexWrap: "wrap", flex: "1 1 230px" }}>
            {grp.items.map(([key, lab]) => {
              const on = !!acts[key];
              return (
                <button key={key} onClick={() => toggle(grp, key)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: on ? `${C.accent}22` : "transparent", border: `1px solid ${on ? C.accent : C.border}`, color: on ? C.hi : C.dim, padding: "5px 11px", borderRadius: 999, cursor: "pointer", fontSize: 12.5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: on ? C.accent : C.dim, opacity: on ? 1 : 0.5 }} />{lab[lang]}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Slider({ label, value, set, min, max, step, valueText, hint, info, labelH, subtle, dataTour }) {
  return (
    <div data-tour={dataTour} style={{ flex: 1, minWidth: 150, opacity: subtle ? 0.75 : 1 }}>
      <div style={{ display: "flex", flexDirection: subtle ? "column" : "row", justifyContent: "space-between", alignItems: subtle ? "stretch" : "baseline", gap: subtle ? 2 : 8, marginBottom: 8, minHeight: labelH }}>
        <span style={{ color: subtle ? C.dim : C.mid, fontSize: subtle ? 12 : 13, letterSpacing: 0.2, flex: 1, whiteSpace: "nowrap" }}>{label}{info && <Info text={info} />}</span>
        <span style={{ color: subtle ? C.mid : C.accent, fontSize: subtle ? 13 : 16, fontWeight: subtle ? 500 : 600, fontFamily: "ui-monospace, monospace", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0 }}>{valueText || " "}</span>
      </div>
      <input className={"rng" + (subtle ? " rng-mini" : "")} type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(parseFloat(e.target.value))} />
      {hint && <div style={{ color: C.dim, fontSize: 11, marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

// Плавное сворачивание/разворачивание по высоте + прозрачности (для появления/исчезновения карточек, гайдов).
function Collapse({ open, dur = 420, style, children }) {
  const ref = useRef(null);
  const [h, setH] = useState(open ? "auto" : 0);
  const init = useRef(true);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (init.current) { init.current = false; return; }
    if (open) {
      setH(el.scrollHeight);
      const tm = setTimeout(() => setH("auto"), dur);
      return () => clearTimeout(tm);
    } else {
      setH(el.scrollHeight);
      requestAnimationFrame(() => requestAnimationFrame(() => setH(0)));
    }
  }, [open]);
  return (
    <div ref={ref} style={{ height: h === "auto" ? "auto" : h, overflow: "hidden", opacity: open ? 1 : 0, transition: `height ${dur}ms ease, opacity ${dur}ms ease`, ...style }}>
      {children}
    </div>
  );
}
function TypeCard({ meta, t, setT, open, toggleOpen, lang, L }) {
  const col = meta.color;
  const floatCount = meta.kind !== "ongoing"; // приходящие/хукапы — дробное число в год
  const cnt = floatCount ? Math.round(t.count * 10) / 10 : Math.round(t.count);
  const active = t.count > 0;
  const cap = meta.kind === "ongoing" ? L.bgMul(t.poolMul) : meta.kind === "oneoff" ? L.oneActBg(t.poolMul) : `${fmtDur(t.dur, lang)} · ${L.bgMul(t.poolMul)}`;
  return (
    <div>
      <Collapse open={!active}>
        <button onClick={() => setT({ count: meta.addCount })} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", background: "transparent", border: `1px dashed ${C.border}`, borderLeft: `3px solid ${col}77`, borderRadius: 10, padding: "11px 14px", cursor: "pointer" }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: col, opacity: 0.55 }} />
          <span style={{ color: C.mid, fontSize: 13.5 }}>{meta.label[lang]}</span>
          <span style={{ marginLeft: "auto", color: col, fontSize: 12.5, fontWeight: 600 }}>{L.addBtn}</span>
        </button>
      </Collapse>
      <Collapse open={active}>
        <div style={{ background: C.panel, border: `1px solid ${col}55`, borderLeft: `3px solid ${col}`, borderRadius: 12, padding: "13px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: col, flexShrink: 0 }} />
        <span style={{ color: C.hi, fontSize: 14, fontWeight: 600 }}>{meta.label[lang]}</span>
        <button onClick={() => setT({ count: 0 })} title={L.removeCard} aria-label={L.removeCard} onMouseEnter={(e) => (e.currentTarget.style.color = C.hi)} onMouseLeave={(e) => (e.currentTarget.style.color = C.dim)} style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontSize: 17, lineHeight: 1, padding: "0 2px", marginLeft: "auto" }}>×</button>
        {/* подпись (длительность · активность) — на своей строке слева, чтобы не было кривых переносов */}
        <span style={{ flexBasis: "100%", display: "inline-flex", alignItems: "center", justifyContent: "flex-start", gap: 4, color: C.dim, fontSize: 11, whiteSpace: "nowrap" }}>{cap}<Info text={L.poolInfo} /></span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <Slider label={meta.countLab[lang]} value={t.count} set={(v) => setT({ count: floatCount ? Math.round(v * 10) / 10 : Math.round(v) })} min={0} max={meta.countMax} step={floatCount ? 0.1 : 1} valueText={floatCount ? dec(cnt.toString(), lang) : `${cnt}`} />
        <Slider label={L.condom} value={t.condom} set={(v) => setT({ condom: v })} min={0} max={100} step={1} valueText={`${t.condom}%`} info={L.condomInfo} dataTour={active ? "condom" : undefined} />
        <Slider label={L.tested} value={t.tested} set={(v) => setT({ tested: v })} min={0} max={100} step={1} valueText={`${t.tested}%`} info={L.testedInfo} />
      </div>
      <button onClick={toggleOpen} style={{ background: "transparent", border: "none", color: col, fontSize: 12, cursor: "pointer", padding: 0, marginTop: 12 }}>{open ? `▾ ${L.details}` : `▸ ${L.details}`}</button>
      {open && (
        <div className="fade-in" style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 13 }}>
          {meta.kind !== "oneoff" && (
            <Slider label={L.sexPerWeek} value={t.perWeek} set={(v) => setT({ perWeek: Math.round(v * 10) / 10 })} min={0.1} max={14} step={0.1} valueText={`${dec(t.perWeek.toFixed(1), lang)}×`} />
          )}
          {meta.kind === "recurring" && (
            <Slider label={L.relDuration} value={t.dur} set={(v) => setT({ dur: v })} min={0} max={60} step={1} valueText={fmtDur(t.dur, lang)} />
          )}
          {meta.kind === "oneoff" && <div style={{ color: C.dim, fontSize: 12 }}>{L.oneoffNote}</div>}
          {meta.kind === "ongoing" && <div style={{ color: C.dim, fontSize: 12 }}>{L.ongoingNote}</div>}
        </div>
      )}
        </div>
      </Collapse>
    </div>
  );
}

// Каждый тип пакуем В СВОЙ блок строк (по start, жадно). Раньше сортировка по типу ломала жадную
// укладку: поздние хукапы переезжали в строку «приходящих» (визуальные переносы между рядами).
function packLanes(list) {
  const out = [];
  let laneOffset = 0;
  ["steady", "casual", "hookup"].forEach((type) => {
    const items = list.filter((p) => p.type === type).sort((a, b) => a.start - b.start);
    if (!items.length) return;
    const laneEnd = [];
    items.forEach((p) => {
      let lane = -1;
      for (let i = 0; i < laneEnd.length; i++) { if (laneEnd[i] <= p.start + 0.01) { lane = i; break; } }
      if (lane === -1) { lane = laneEnd.length; laneEnd.push(p.end); } else laneEnd[lane] = p.end;
      p.lane = laneOffset + lane;
      out.push(p);
    });
    laneOffset += laneEnd.length;
  });
  return { list: out, lanes: Math.max(1, laneOffset) };
}
function buildPartnersTyped(cfg, horizonM) {
  const years = horizonM / 12;
  const list = [];
  const nSteady = Math.round(cfg.steady.count);
  for (let i = 0; i < nSteady; i++) list.push({ start: 0, end: horizonM, type: "steady" });
  let total = nSteady;
  const flow = (key, durM, seed) => {
    const perYear = cfg[key].count; if (perYear <= 0) return; // дробное число в год (флот)
    const tot = Math.round(perYear * years); total += tot;
    const shown = Math.min(tot, 240); if (shown <= 0) return;  // рисуем максимум столько, но спред — на весь горизонт
    const spacing = horizonM / shown;          // средний промежуток между началами связей
    const dense = durM > spacing;              // связь длиннее промежутка → настоящая одновременность
    for (let j = 0; j < shown; j++) {
      const h = Math.abs(Math.sin((j + 1 + seed) * 12.9898) * 43758.5453) % 1;
      if (dense) {                             // плотно: связи накладываются (свинг/поли/хукапы)
        const base = (j + 0.5) * spacing;
        const start = Math.min(horizonM - 0.05, Math.max(0, base + (h - 0.5) * spacing * 0.8));
        const d = Math.max(0.2, durM * (0.7 + h * 0.6));
        list.push({ start, end: Math.min(horizonM, start + d), type: key });
      } else {                                 // последовательно: один партнёр за раз (серийная моногамия)
        const start = Math.min(horizonM - 0.05, j * spacing + h * spacing * 0.1);
        const d = Math.max(0.2, Math.min(durM * (0.8 + h * 0.25), spacing * 0.85));
        list.push({ start, end: Math.min(horizonM, start + d), type: key });
      }
    }
  };
  flow("casual", cfg.casual.dur, 0);
  flow("hookup", 0.3, 99);
  return { list, total };
}
function Timeline({ packed, horizonM, years, lang }) {
  const { list, lanes } = packed;
  const gap = lanes > 12 ? 2 : 4;
  const rowH = Math.max(4, Math.min(15, Math.floor(240 / Math.max(1, lanes)) - gap));
  const yt = []; const ts = years <= 12 ? 1 : years <= 30 ? 5 : 10;
  for (let y = 0; y <= years; y += ts) yt.push(y);
  return (
    <div>
      <div style={{ position: "relative", height: lanes * (rowH + gap) }}>
        {Array.from({ length: lanes }).map((_, i) => (<div key={"l" + i} style={{ position: "absolute", left: 0, right: 0, top: i * (rowH + gap), height: rowH, background: C.panel2, borderRadius: 3 }} />))}
        {list.map((p, idx) => { const col = p.type === "steady" ? "#f0a500" : p.type === "casual" ? "#2ec4b6" : "#4dabf7"; return <div key={idx} title={p.type} style={{ position: "absolute", top: p.lane * (rowH + gap), height: rowH, left: `${(p.start / horizonM) * 100}%`, width: `${Math.max(0.5, ((p.end - p.start) / horizonM) * 100)}%`, background: col, borderRadius: 3, opacity: 0.88 }} />; })}
      </div>
      <div style={{ position: "relative", height: 16, marginTop: 4 }}>
        {yt.map((y) => (<span key={y} style={{ position: "absolute", left: `${(y / years) * 100}%`, fontSize: 11, color: C.dim, transform: y === 0 ? "none" : "translateX(-50%)" }}>{y === 0 ? "0" : `${y}${yrShort(lang)}`}</span>))}
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label, hidden, lang, L }) {
  if (!active || !payload?.length) return null;
  const yrs = Math.floor(label / 12), mos = label % 12;
  const rows = payload.filter((e) => !hidden[e.dataKey]).sort((a, b) => b.value - a.value);
  return (
    <div style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 12 }}>
      <div style={{ color: C.mid, marginBottom: 6 }}>{yrs > 0 ? yrs + " " + yrShort(lang) + " " : ""}{mos} {moWord(lang)}</div>
      {rows.map((e) => { const s = STIS.find((x) => x.key === e.dataKey); return (<div key={e.dataKey} style={{ display: DEV ? "flex" : "block", justifyContent: "space-between", gap: 18, color: C.hi }}><span><span style={{ color: e.stroke }}>●</span> {s ? s.label[lang] : L.anyLabel}</span>{DEV && <span>{pctVal(e.value, lang)}</span>}</div>); })}
    </div>
  );
}

// График накопления риска за период. Смысл несут ЗОНЫ, а не только линии — поэтому он остаётся
// читаемым даже когда кривые «без» и «с презервативом» совпадают (наложение):
//   • бледно-красная заливка до верхней кривой = весь риск без презерватива;
//   • зелёная полоса между кривыми = риск, который УБИРАЕТ презерватив.
// Когда защита «насыщается» и кривые сходятся, зелёной полосы нет → видно «защита ничего не даёт»
// (а не загадочная одиночная линия). Подписи концов сливаются в одну с двумя метками, если значения равны.
// Фикс. высота + растяжение по ширине (preserveAspectRatio=none, non-scaling-stroke); подписи — HTML поверх.
function AccumCurve({ pts, rMax, finals, fmt, xRight, note, tickEvery, rowLabels, contWord }) {
  const [hi, setHi] = useState(null); // наведённый индекс (== k, т.к. pts[k][0]=k)
  const wrapRef = useRef(null);
  const W = 320, H = 100, padT = 6, baseY = 88, HPX = 116;
  const tMax = pts[pts.length - 1][0] || 1;
  const x = (t) => (W * t) / tMax;
  const y = (r) => baseY - (baseY - padT) * Math.min(1, r / (rMax || 1e-9));
  const line = (idx) => pts.map((p, i) => (i ? "L" : "M") + x(p[0]).toFixed(1) + " " + y(p[idx]).toFixed(1)).join(" ");
  const underRed = `M0 ${baseY} ` + pts.map((p) => "L" + x(p[0]).toFixed(1) + " " + y(p[1]).toFixed(1)).join(" ") + ` L${W} ${baseY} Z`;
  // полоса между верхней (без, idx 1) и нижней (с, idx 2) кривыми = «убранный» риск
  const band = "M" + pts.map((p, i) => (i ? "L" : "") + x(p[0]).toFixed(1) + " " + y(p[1]).toFixed(1)).join(" ") + " " + pts.slice().reverse().map((p) => "L" + x(p[0]).toFixed(1) + " " + y(p[2]).toFixed(1)).join(" ") + " Z";
  const sw = (c) => ({ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: c, verticalAlign: "middle" });
  const topPx = (r) => (y(r) / H) * HPX - 8; // позиция подписи конца кривой (центрируем ~16px текст)
  const coincide = fmt(finals[0]) === fmt(finals[1]);
  let tR = Math.max(0, topPx(finals[0]));
  let tG = Math.min(HPX - 15, Math.max(tR + 15, topPx(finals[1]))); // развести подписи и не выпасть за низ
  const lblBase = { position: "absolute", right: 2, fontSize: 11.5, fontWeight: 700, background: C.bg, padding: "0 3px", borderRadius: 3, whiteSpace: "nowrap" };
  // отсечки по оси X
  const ticks = [];
  if (tickEvery) for (let k = tickEvery; k <= tMax - 1e-9; k += tickEvery) ticks.push(k);
  // наведение курсора (как на основном графике): вертикальная линия + точки + всплывашка
  const onMove = (e) => {
    const el = wrapRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    setHi(Math.round(Math.max(0, Math.min(1, cx / r.width)) * tMax));
  };
  const hk = hi == null ? null : Math.max(0, Math.min(pts.length - 1, hi));
  const hp = hk == null ? null : pts[hk];
  const leftPct = hk == null ? 0 : (x(hk) / W) * 100;
  const tipRight = leftPct > 55;
  const dotPx = (r) => (y(r) / H) * HPX; // px-позиция точки по вертикали
  const interactive = !!tickEvery;
  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", cursor: interactive ? "crosshair" : "default" }}
      onMouseMove={interactive ? onMove : undefined} onMouseLeave={interactive ? () => setHi(null) : undefined}
      onTouchStart={interactive ? onMove : undefined} onTouchMove={interactive ? onMove : undefined} onTouchEnd={interactive ? () => setHi(null) : undefined}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: HPX, display: "block" }}>
        <line x1="0" y1={baseY} x2={W} y2={baseY} stroke={C.border} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {ticks.map((k, i) => <line key={i} x1={x(k)} y1={baseY - 2.5} x2={x(k)} y2={baseY + 2.5} stroke={C.dim} strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        <path d={underRed} fill="#ff7b73" opacity="0.10" />
        <path d={band} fill="#4dd4ac" opacity="0.20" />
        <path d={line(1)} fill="none" stroke="#ff7b73" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={line(2)} fill="none" stroke="#4dd4ac" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {hk != null && <line x1={x(hk)} y1={2} x2={x(hk)} y2={baseY} stroke={C.mid} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      </svg>
      {hp != null && <span style={{ position: "absolute", left: `${leftPct}%`, top: dotPx(hp[1]), width: 7, height: 7, marginLeft: -3.5, marginTop: -3.5, borderRadius: "50%", background: "#ff7b73", boxShadow: `0 0 0 2px ${C.bg}`, pointerEvents: "none" }} />}
      {hp != null && <span style={{ position: "absolute", left: `${leftPct}%`, top: dotPx(hp[2]), width: 7, height: 7, marginLeft: -3.5, marginTop: -3.5, borderRadius: "50%", background: "#4dd4ac", boxShadow: `0 0 0 2px ${C.bg}`, pointerEvents: "none" }} />}
      {hp != null && rowLabels && (
        <div style={{ position: "absolute", top: 2, left: `${leftPct}%`, transform: `translateX(${tipRight ? "calc(-100% - 8px)" : "8px"})`, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 9px", fontSize: 11.5, whiteSpace: "nowrap", pointerEvents: "none", zIndex: 6 }}>
          <div style={{ color: C.mid, marginBottom: 5 }}>{hk} {contWord ? contWord(hk) : ""}</div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, color: C.hi }}><span><i style={sw("#ff7b73")} /> {rowLabels[0]}</span><span style={{ fontWeight: 600 }}>{fmt(hp[1])}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, color: C.hi, marginTop: 2 }}><span><i style={sw("#4dd4ac")} /> {rowLabels[1]}</span><span style={{ fontWeight: 600 }}>{fmt(hp[2])}</span></div>
        </div>
      )}
      {DEV && hk == null && (coincide ? (
        <span style={{ ...lblBase, top: Math.max(0, topPx(finals[0])), color: C.hi, display: "inline-flex", alignItems: "center", gap: 3 }}><i style={sw("#ff7b73")} /><i style={sw("#4dd4ac")} />{fmt(finals[0])}</span>
      ) : (<>
        <span style={{ ...lblBase, top: tR, color: "#ff7b73" }}>{fmt(finals[0])}</span>
        <span style={{ ...lblBase, top: tG, color: "#4dd4ac" }}>{fmt(finals[1])}</span>
      </>))}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.dim, marginTop: 3 }}><span>0</span><span>{xRight}</span></div>
      {note && <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: C.dim, marginTop: 5 }}><i style={sw("#4dd4ac")} />{note}</div>}
    </div>
  );
}

// Локализованные подписи формул в «Разборе расчёта» (используются внутри Breakdown).
const BD = {
  en: { kTitle: "Contacts with one partner over the period", actTitle: "Transmission per contact (if the partner is infected)", chanceTitle: "Chance the partner is already infected", riskTitle: "Risk of catching it from this type over the period", totalTitle: "Types are independent — we multiply «not infected»", vaccTitle: "The vaccine lowers the whole result at once",
    oneMeeting: "= 1 (a single meeting)", sexWk: "sex per week", wholePeriod: "whole period", relDur: "relationship length", mo: "mo", perActFb: "transmission per act",
    prevalence: "prevalence", environment: "environment", activity: "activity", tested: "tested", chanceBefore: "chance before testing", chanceInf: "chance infected",
    transContact: "transmission per contact", contacts: "contacts", partners: "partners", transAll: "transmission over all contacts", risk1: "risk from 1 partner", riskPeriod: "risk over the period",
    riskNoVacc: "risk without the vaccine", veEff: "efficacy VE", perYr: "/yr", contW: (n) => n === 1 ? "contact" : "contacts" },
  ru: { kTitle: "Контактов с одним партнёром за период", actTitle: "Передача за один контакт (если партнёр заражён)", chanceTitle: "Шанс, что партнёр уже заражён", riskTitle: "Риск заразиться от этого типа за период", totalTitle: "Типы независимы — перемножаем «не заразиться»", vaccTitle: "Прививка снижает весь итог сразу",
    oneMeeting: "= 1 (одна встреча)", sexWk: "секс в неделю", wholePeriod: "весь период", relDur: "длительность связи", mo: "мес", perActFb: "передача за акт",
    prevalence: "распространённость", environment: "среда", activity: "активность", tested: "проверены", chanceBefore: "шанс до проверки", chanceInf: "шанс что заразен",
    transContact: "передача за контакт", contacts: "контактов", partners: "партнёров", transAll: "передача за все контакты", risk1: "риск от 1 партнёра", riskPeriod: "риск за период",
    riskNoVacc: "риск без прививки", veEff: "эффективность VE", perYr: "/год", contW: (n) => { const a = n % 100, b = n % 10; return (a >= 11 && a <= 14) ? "контактов" : b === 1 ? "контакт" : (b >= 2 && b <= 4) ? "контакта" : "контактов"; } },
  sr: { kTitle: "Kontakata sa jednim partnerom tokom perioda", actTitle: "Prenos po kontaktu (ako je partner zaražen)", chanceTitle: "Šansa da je partner već zaražen", riskTitle: "Rizik od zaraze od ovog tipa tokom perioda", totalTitle: "Tipovi su nezavisni — množimo „ne zaraziti se“", vaccTitle: "Vakcina smanjuje ceo rezultat odjednom",
    oneMeeting: "= 1 (jedan susret)", sexWk: "seks nedeljno", wholePeriod: "ceo period", relDur: "trajanje veze", mo: "mes", perActFb: "prenos po aktu",
    prevalence: "rasprostranjenost", environment: "sredina", activity: "aktivnost", tested: "testirani", chanceBefore: "šansa pre testiranja", chanceInf: "šansa da je zaražen",
    transContact: "prenos po kontaktu", contacts: "kontakata", partners: "partnera", transAll: "prenos po svim kontaktima", risk1: "rizik od 1 partnera", riskPeriod: "rizik za period",
    riskNoVacc: "rizik bez vakcine", veEff: "efikasnost VE", perYr: "/god", contW: (n) => { const a = n % 100, b = n % 10; return (a >= 11 && a <= 14) ? "kontakata" : b === 1 ? "kontakt" : (b >= 2 && b <= 4) ? "kontakta" : "kontakata"; } },
};

function Breakdown({ s, envMul = 1, cfg, years, veMul, vaccVe = 0, actSel = [1], actKeys = [], lang, L }) {
  const b = BD[lang] || BD.en;
  const vf = 1 - vaccVe; // person-level прививка: множитель к итоговому риску (1 при отсутствии прививки)
  const horizonM = years * 12;
  const yw = yearsWord(years, lang);
  const fmtP = (v) => pctVal(v * 100, lang);
  // Точность для формул: для малых значений оставляем десятую, чтобы умножения сходились (4,5% × 2 = 9%).
  const pp = (x) => dec(x * 100 < 10 ? (x * 100).toFixed(1).replace(/\.0$/, "") : String(Math.round(x * 100)), lang) + "%";
  const rows = TYPES.map((meta) => {
    const T = cfg[meta.key]; const cnt = meta.kind === "ongoing" ? Math.round(T.count) : T.count;
    if (cnt <= 0) return { meta, T, cnt: 0, inactive: true, k: 0, actEff: 0, pEff: 0, toHorizon: 0 };
    const encSurv = encSurvOf(s, actSel, (1 - (T.condom / 100) * s.e) * veMul);
    const actEff = 1 - encSurv; // передача за один контакт (все практики), если партнёр заражён
    const k = meta.kind === "oneoff" ? 1 : meta.kind === "ongoing" ? Math.max(1, T.perWeek * (52 / 12) * horizonM) : Math.max(1, T.perWeek * (52 / 12) * T.dur);
    const pEff = oddsScale(s.p, T.poolMul) * (1 - T.tested / 100);
    const transmit = 1 - Math.pow(encSurv, k);
    const perPartner = pEff * transmit;
    const toHorizon = meta.kind === "ongoing" ? 1 - Math.pow(1 - perPartner, cnt) : 1 - Math.pow(Math.pow(1 - perPartner, cnt), years);
    // Формулы с подставленными числами и подписью каждой переменной — тултип на каждую ячейку.
    const D = (x) => dec(String(x), lang);
    const mK = Math.round(k);
    const factor = (1 - (T.condom / 100) * s.e) * veMul;
    const betas = actSel.map((m) => Math.min(0.999, s.beta * m * factor));
    const basePrev = oddsScale(s.p, 1 / envMul);          // распространённость без среды (тоже в odds)
    const pEffNoTest = oddsScale(s.p, T.poolMul);          // = oddsScale(basePrev, envMul·poolMul)
    const fK = (<><FTtl>{b.kTitle}</FTtl>
      {meta.kind === "oneoff"
        ? <span data-f>{b.oneMeeting}</span>
        : (<><FLeg items={[[b.sexWk, D(T.perWeek)], [meta.kind === "ongoing" ? b.wholePeriod : b.relDur, `${meta.kind === "ongoing" ? horizonM : D(T.dur)} ${b.mo}`]]} />
          <span data-f>{D(T.perWeek)} × 52/12 × {meta.kind === "ongoing" ? horizonM : D(T.dur)} = {mK}</span></>)}</>);
    const fAct = (<><FTtl>{b.actTitle}</FTtl>
      <FLeg items={betas.map((bv, i) => [actKeys[i] && ACT_LABEL[actKeys[i]] ? ACT_LABEL[actKeys[i]][lang] : b.perActFb, pctAct(bv, lang)])} />
      <span data-f>{betas.length ? `1 − ${betas.map((bv) => `(1 − ${pctAct(bv, lang)})`).join("")} = ${pctAct(actEff, lang)}` : "= 0%"}</span></>);
    const fChance = (<><FTtl>{b.chanceTitle}</FTtl>
      <FLeg items={[[b.prevalence, pp(basePrev)], [b.environment, `×${D(envMul)}`], [b.activity, `×${D(T.poolMul)}`], [b.tested, `${D(T.tested)}%`]]} />
      <FStep name={b.chanceBefore}><span data-f>odds({pp(basePrev)}) × {D(envMul)} × {D(T.poolMul)} = {pp(pEffNoTest)}</span></FStep>
      <FStep name={b.chanceInf}><span data-f>{pp(pEffNoTest)} × (1 − {D(T.tested)}%) = {pp(pEff)}</span></FStep></>);
    const fRisk = (<><FTtl>{b.riskTitle}</FTtl>
      <FLeg items={[[b.transContact, pctAct(actEff, lang)], [b.contacts, String(mK)], [b.chanceInf, pp(pEff)], [b.partners, meta.kind === "ongoing" ? String(cnt) : `${D(cnt)}${b.perYr} × ${years} ${yw}`]]} />
      <FStep name={b.transAll}><span data-f>1 − (1 − {pctAct(actEff, lang)})^{mK} = {fmtP(transmit)}</span></FStep>
      <FStep name={b.risk1}><span data-f>{fmtP(transmit)} × {pp(pEff)} = {fmtP(perPartner)}</span></FStep>
      <FStep name={b.riskPeriod}><span data-f>{meta.kind === "ongoing" ? `1 − (1 − ${fmtP(perPartner)})^${cnt} = ${fmtP(toHorizon)}` : `1 − (1 − ${fmtP(perPartner)})^(${D(cnt)} × ${years}) = ${fmtP(toHorizon)}`}</span></FStep></>);
    return { meta, T, cnt, actEff, k, pEff, toHorizon, fK, fAct, fChance, fRisk };
  });
  const active = rows.filter((r) => !r.inactive);
  if (active.length === 0) return <div style={{ color: C.mid, fontSize: 13, padding: "8px 0" }}>{L.noActivePartners}</div>;
  // baseTotal — риск БЕЗ прививки (разложение по типам сходится к нему); totalRisk — после прививки (× vf).
  const baseTotal = 1 - survivalAt(s, horizonM, cfg, veMul, actSel);
  const totalRisk = vf * baseTotal;
  const fTotal = (<><FTtl>{b.totalTitle}</FTtl>
    <span data-f>1 − {active.map((r) => `(1 − ${fmtP(r.toHorizon)})`).join(" × ")} = {fmtP(baseTotal)}</span></>);
  const fVacc = (<><FTtl>{b.vaccTitle}</FTtl>
    <FLeg items={[[b.riskNoVacc, fmtP(baseTotal)], [b.veEff, `${Math.round(vaccVe * 100)}%`]]} />
    <span data-f>{fmtP(baseTotal)} × (1 − {Math.round(vaccVe * 100)}%) = {fmtP(totalRisk)}</span></>);
  // Уровень 1 (один контакт, если партнёр заражён) и уровень 2 (один заражённый партнёр за k контактов).
  // Оба — гипотеза «партнёр заражён»: чистая биология акта + презерватив, без прививки и среды.
  const encBare = encSurvOf(s, actSel, 1);          // выживаемость за контакт без презерватива
  const encCond = encSurvOf(s, actSel, 1 - s.e);    // с презервативом
  const bareAct = 1 - encBare;
  const condAct = 1 - encCond;
  const cutAct = bareAct > 0 ? Math.round((1 - condAct / bareAct) * 100) : Math.round(s.e * 100);
  const actMax = Math.max(bareAct, condAct, 1e-9);
  // Уровень 2: накопление риска от ОДНОГО заражённого партнёра за k контактов. Фикс. 100 актов —
  // НЕ зависит от настроек времени пользователя (это про «насыщение» внутри партнёра, не про годы).
  // perPartner[1] == [1, bareAct, condAct] → первый контакт совпадает с уровнем 1.
  const KMAX = 100;
  const perPartner = [];
  for (let kk = 0; kk <= KMAX; kk++) perPartner.push([kk, 1 - Math.pow(encBare, kk), 1 - Math.pow(encCond, kk)]);
  const pp100Bare = 1 - Math.pow(encBare, KMAX);
  const pp100Cond = 1 - Math.pow(encCond, KMAX);
  const cutK100 = pp100Bare > 0 ? Math.round((1 - pp100Cond / pp100Bare) * 100) : 0;
  const contWord = b.contW;
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ color: C.hi, fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>{L.condomBlockTitle}</div>
        <div style={{ display: "flex", gap: 16, fontSize: 12, color: C.mid, marginBottom: 14, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: "#ff7b73" }} />{L.withoutCondom}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: "#4dd4ac" }} />{L.withCondom}</span>
        </div>

        {/* Один контакт с заражённым партнёром. Статичные полоски. */}
        <div style={{ fontSize: 12.5, color: C.hi, fontWeight: 600, marginBottom: 9 }}>{L.perActHead}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <div style={{ flex: 1, height: 14, background: C.panel2, borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${Math.max(2, (bareAct / actMax) * 100)}%`, height: "100%", background: "#ff7b73" }} /></div>
          {DEV && <span className="num" style={{ width: 56, textAlign: "right", fontSize: 12.5, color: C.hi, fontWeight: 600 }}>{pctAct(bareAct, lang)}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, height: 14, background: C.panel2, borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${Math.max(2, (condAct / actMax) * 100)}%`, height: "100%", background: "#4dd4ac" }} /></div>
          {DEV && <span className="num" style={{ width: 56, textAlign: "right", fontSize: 12.5, color: C.hi, fontWeight: 600 }}>{pctAct(condAct, lang)}</span>}
        </div>

        {/* За 100 контактов с заражённым партнёром — накопление риска внутри одного партнёра (насыщение). */}
        <div style={{ fontSize: 12.5, color: C.hi, fontWeight: 600, margin: "22px 0 4px" }}>{L.onePartnerHead}</div>
        <AccumCurve pts={perPartner} rMax={pp100Bare} finals={[pp100Bare, pp100Cond]} fmt={(v) => pctAct(v, lang)} xRight={L.actsAxis} tickEvery={10} rowLabels={[L.withoutCondom, L.withCondom]} contWord={contWord} />
        <div className="rich" style={{ fontSize: 12.5, color: C.mid, lineHeight: 1.55, marginTop: 10 }}>
          {cutAct - cutK100 >= 4 ? L.satDrop : L.satFlat}
        </div>
      </div>
      {DEV && (<>
      <div style={{ borderTop: `1px solid ${C.border}`, margin: "4px 0 14px" }} />
      <div className="rich" style={{ fontSize: 13, color: C.mid, lineHeight: 1.6, marginBottom: 12 }}>{L.contribIntro(years, yw)}</div>
      <div style={{ overflowX: "auto" }}>
        <table className="inf" style={{ minWidth: 560 }}>
          <thead><tr><th>{L.thType}</th><th>{L.thPartners}</th><th><span style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>{L.thContacts}<Info dn text={L.thContactsInfo} /></span></th><th><span style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>{L.thTransPerAct}<Info dn text={L.thTransPerActInfo} /></span></th><th><span style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>{L.thChanceInf}<Info dn text={L.thChanceInfInfo} /></span></th><th><span style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>{L.thRiskHor(years, yw)}<Info dn text={L.thRiskHorInfo} /></span></th></tr></thead>
          <tbody>
            {rows.map((r) => r.inactive ? (
              <tr key={r.meta.key} style={{ borderLeft: `3px solid ${r.meta.color}55`, color: C.dim }}>
                <td style={{ whiteSpace: "nowrap", color: C.dim }}><span style={{ color: `${r.meta.color}77`, marginRight: 6 }}>●</span>{r.meta.label[lang]}</td>
                <td className="num">0</td>
                <td className="num">0</td>
                <td className="num">0%</td>
                <td className="num">0%</td>
                <td className="num">0%</td>
              </tr>
            ) : (
              <tr key={r.meta.key} style={{ borderLeft: `3px solid ${r.meta.color}` }}>
                <td style={{ whiteSpace: "nowrap", color: C.hi }}><span style={{ color: r.meta.color, marginRight: 6 }}>●</span>{r.meta.label[lang]}</td>
                <td className="num">{dec((Math.round(r.cnt * 10) / 10).toString(), lang)}{r.meta.kind !== "ongoing" ? L.perYear : ""}</td>
                <td className="num"><CellTip f={r.fK}>{Math.round(r.k)}</CellTip></td>
                <td className="num"><CellTip f={r.fAct}>{pctAct(r.actEff, lang)}</CellTip></td>
                <td className="num"><CellTip f={r.fChance}>{pp(r.pEff)}</CellTip></td>
                <td className="num" style={{ color: C.hi, fontWeight: 600 }}><CellTip f={r.fRisk}>{fmtP(r.toHorizon)}</CellTip></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `2px solid ${C.border}` }}>
              <td colSpan={5} style={{ color: C.hi, fontWeight: 600 }}><span style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>{L.thTotal}<Info dn text={L.thTotalInfo} /></span></td>
              <td className="num" style={{ color: vaccVe > 0 ? C.mid : s.color, fontWeight: 700 }}><CellTip f={fTotal}>{fmtP(baseTotal)}</CellTip></td>
            </tr>
            {vaccVe > 0 && (
              <tr>
                <td colSpan={5} style={{ color: C.hi, fontWeight: 600 }}><span style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>{L.vaccRow(Math.round(vaccVe * 100))}<Info dn text={L.vaccRowInfo} /></span></td>
                <td className="num" style={{ color: s.color, fontWeight: 700 }}><CellTip f={fVacc}>{fmtP(totalRisk)}</CellTip></td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>
      </>)}
    </div>
  );
}

const ONS = PRESETS.find((p) => p.key === "ons");
// Дефолтная стартовая конфигурация (по запросу): только «приходящие» — count 0.4, презерватив 0%,
// секс 3/нед, длительность 24 мес; постоянные и хукапы выключены; среда — «вспышка».
const DEFAULT_CFG = {
  steady: { ...BASE.steady, count: 0 },
  casual: { ...BASE.casual, count: 0.4, condom: 0, perWeek: 3, dur: 24, tested: 0 },
  hookup: { ...BASE.hookup, count: 0 },
};

// ───────────────────────── МОДЕЛЬ БЕРЕМЕННОСТИ (отдельный движок) ─────────────────────────
// Единица — менструальный цикл (≈месяц). Кумулятив P = 1 − (1 − годовой_отказ)^лет.
// Надёжно: таблица эффективности контрацепции (CDC/Trussell, типичное использование).
// Оценка: фертильность по возрасту f(age), частотная кривая, per-act для разовых контактов.
const SEG = (on) => ({ padding: "9px 18px", borderRadius: 10, border: `1px solid ${on ? C.accent : C.border}`, background: on ? C.accent : "transparent", color: on ? C.bg : C.mid, fontWeight: on ? 700 : 500, cursor: "pointer", fontSize: 14 });
const SUBSEG = (on, col) => ({ padding: "7px 14px", borderRadius: 999, border: `1px solid ${on ? col : C.border}`, background: on ? `${col}22` : "transparent", color: on ? C.hi : C.mid, cursor: "pointer", fontSize: 13, fontWeight: on ? 600 : 400 });

// Кусочно-линейная интерполяция по таблице опорных точек — чтобы значения менялись плавно,
// а не ступеньками (иначе при тяге слайдера кривая прыгает на границах диапазонов).
function lerpTable(x, pts) {
  if (x <= pts[0][0]) return pts[0][1];
  const n = pts.length;
  if (x >= pts[n - 1][0]) return pts[n - 1][1];
  for (let i = 1; i < n; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
  }
  return pts[n - 1][1];
}
// Фертильность за цикл при регулярном незащищённом сексе, по возрасту женщины (ОЦЕНКА тренда; теперь плавная).
const F_AGE_PTS = [[25, 0.23], [29, 0.20], [31, 0.17], [34, 0.15], [37, 0.11], [39, 0.09], [41, 0.06], [43, 0.035], [45, 0.015], [50, 0.005]];
function fAge(age) { return lerpTable(age, F_AGE_PTS); }
// Множитель частоты секса к f за цикл (ОЦЕНКА формы; теперь плавный).
const F_FREQ_PTS = [[0.1, 0.45], [0.5, 0.6], [1, 0.8], [2, 1.0], [3, 1.1], [4, 1.15]];
function kFreq(perWeek) { return lerpTable(perWeek, F_FREQ_PTS); }
// Контрацепция: типичное использование, % незапланированных беременностей за 1 год (CDC/Trussell).
// perfect/typical — доля за ПЕРВЫЙ ГОД (0..1). sev — РЕДАКТОРСКАЯ шкала 1–5 (цвет-код, не данные).
// control: 'toggle' — постоянно; 'perAct' — на акт (слайдер доли); 'oneOff' — разово (не на кривую).
// label/side/guide.{how,side,who} — локализованы {en,ru,sr}; sources/числа — общие.
const CONTRA = [
  { key: "none", label: { en: "No method", ru: "Без метода", sr: "Bez metoda" }, perfect: 0.85, typical: 0.85, sev: 1, control: "toggle",
    side: { en: "No side effects, but the maximum chance of pregnancy and zero protection from STIs.", ru: "Побочек нет, но максимальный шанс беременности и ноль защиты от ИППП.", sr: "Nema neželjenih efekata, ali maksimalna šansa za trudnoću i nula zaštite od PPI." },
    guide: { how: { en: "No contraception is used. Baseline: ~85 of 100 couples conceive within a year.", ru: "Контрацепция не используется. Базовая линия: ~85 из 100 пар беременеют за год.", sr: "Kontracepcija se ne koristi. Osnovna linija: ~85 od 100 parova zatrudni za godinu." }, side: { en: "There is no method as such; the risk is unwanted pregnancy and infections. Only for those planning a pregnancy or ready for one.", ru: "Метод как таковой отсутствует; риск — нежелательная беременность и инфекции. Только для тех, кто планирует беременность или готов к ней.", sr: "Metoda kao takvog nema; rizik je neželjena trudnoća i infekcije. Samo za one koji planiraju trudnoću ili su spremni na nju." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "withdrawal", label: { en: "Withdrawal", ru: "Прерванный акт", sr: "Prekinuti akt" }, perfect: 0.04, typical: 0.22, sev: 1, control: "perAct",
    side: { en: "Harmless in itself; high failure rate and zero protection from STIs.", ru: "Сам по себе безвреден; высокая частота ошибок и ноль защиты от ИППП.", sr: "Sam po sebi bezopasan; visoka stopa grešaka i nula zaštite od PPI." },
    guide: { how: { en: "Withdrawing the penis before ejaculation.", ru: "Извлечение полового члена до эякуляции.", sr: "Izvlačenje penisa pre ejakulacije." }, side: { en: "Needs self-control, but pre-ejaculate may still contain sperm. Cheap and always available, but one of the least reliable methods in typical use.", ru: "Необходим самоконтроль, но предэякулят всё равно может содержать сперматозоиды. Дёшево и всегда доступно, но один из наименее надёжных методов при типичном использовании.", sr: "Potrebna je samokontrola, ali predejakulat ipak može sadržati spermatozoide. Jeftino i uvek dostupno, ali jedan od najmanje pouzdanih metoda pri tipičnom korišćenju." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "fam", label: { en: "Calendar / fertile window", ru: "Календарь / фертильное окно", sr: "Kalendar / plodni prozor" }, perfect: 0.004, typical: 0.24, sev: 1, control: "perAct",
    side: { en: "No side effects; needs discipline, the gap between perfect and typical is huge.", ru: "Без побочек; нужна дисциплина, разрыв идеальной и типичной эффективности огромен.", sr: "Bez neželjenih efekata; potrebna disciplina, jaz između idealnog i tipičnog je ogroman." },
    guide: { how: { en: "Tracking fertility signs (temperature, mucus, calendar) and abstinence/barrier on fertile days.", ru: "Отслеживание признаков фертильности (температура, слизь, календарь) и воздержание/барьер в фертильные дни.", sr: "Praćenje znakova plodnosti (temperatura, sluz, kalendar) i uzdržavanje/barijera u plodnim danima." }, side: { en: "No harm; self-discipline and abstinence are needed. Errors in recognizing the window lead to pregnancy.", ru: "Вреда нет, необходимы самодисциплина и воздержание. Ошибки распознавания окна ведут к беременности.", sr: "Nema štete; potrebni su samodisciplina i uzdržavanje. Greške u prepoznavanju prozora vode trudnoći." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "condom_m", label: { en: "Condom (male)", ru: "Презерватив (муж.)", sr: "Kondom (muški)" }, perfect: 0.02, typical: 0.13, sev: 1, control: "perAct",
    side: { en: "Occasional latex allergy; may tear/slip. Protects from STIs.", ru: "Изредка аллергия на латекс, может порваться или соскользнуть. Снижает риск ИППП.", sr: "Ponekad alergija na lateks; može pući/skliznuti. Štiti od PPI." },
    guide: { how: { en: "A barrier on the penis that holds sperm. Also lowers STI risk.", ru: "Барьер на половом члене, удерживающий сперму. Снижает и риск ИППП.", sr: "Barijera na penisu koja zadržava spermu. Smanjuje i rizik od PPI." }, side: { en: "Possible latex allergy (polyurethane exists); risk of tearing/slipping. Suits almost everyone, no prescription. Lowers STI risk.", ru: "Возможна аллергия на латекс (есть полиуретановые). Риск разрыва или соскальзывания. Подходит почти всем, без рецепта. Снижает риск ИППП.", sr: "Moguća alergija na lateks (postoje poliuretanski); rizik od pucanja/klizanja. Odgovara skoro svima, bez recepta. Smanjuje rizik od PPI." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }, { label: "CDC", url: "https://www.cdc.gov/contraception/about/index.html" }] },
  { key: "condom_f", label: { en: "Condom (female)", ru: "Презерватив (жен.)", sr: "Kondom (ženski)" }, perfect: 0.05, typical: 0.21, sev: 1, control: "perAct",
    side: { en: "May shift/be noisy; protects from STIs.", ru: "Может смещаться или шуметь. Снижает риск ИППП.", sr: "Može se pomerati/biti bučan; štiti od PPI." },
    guide: { how: { en: "A soft sleeve in the vagina with rings that holds sperm.", ru: "Мягкий рукав во влагалище с кольцами, задерживает сперму.", sr: "Mekani rukav u vagini sa prstenovima koji zadržava spermu." }, side: { en: "Sometimes shifts or causes discomfort; irritation is rare. Lowers STI risk. An alternative to the male condom — gives the woman control over contraception. No prescription.", ru: "Иногда смещается или вызывает дискомфорт. Редко бывают раздражения. Снижает риск ИППП. Альтернатива мужскому презервативу — даёт женщине контроль над контрацепцией. Рецепта не требует.", sr: "Ponekad se pomera ili izaziva nelagodnost; iritacije su retke. Smanjuje rizik od PPI. Alternativa muškom kondomu — daje ženi kontrolu nad kontracepcijom. Bez recepta." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "diaphragm", label: { en: "Diaphragm / cap", ru: "Диафрагма / колпачок", sr: "Dijafragma / kapica" }, perfect: 0.06, typical: 0.12, sev: 1, control: "perAct",
    side: { en: "Needs fitting by size; slightly higher cystitis risk.", ru: "Нужен подбор по размеру. Чуть выше риск цистита.", sr: "Potrebno biranje po veličini. Malo veći rizik od cistitisa." },
    guide: { how: { en: "A cup with spermicide covering the cervix; inserted before the act.", ru: "Чашечка со спермицидом, закрывающая шейку матки. Вводится перед актом.", sr: "Čašica sa spermicidom koja pokriva grlić materice; uvodi se pre akta." }, side: { en: "More frequent cystitis, irritation from spermicide; needs fitting and training. An option when hormones are contraindicated. For women who have given birth (and for the cap) effectiveness is notably lower.", ru: "Учащённый цистит, раздражение от спермицида. Нужен подбор и обучение. Вариант при противопоказаниях к гормонам. У рожавших эффективность заметно ниже.", sr: "Češći cistitisi, iritacija od spermicida; potrebno biranje i obuka. Opcija pri kontraindikacijama na hormone. Kod žena koje su rađale (i za kapicu) efikasnost je znatno niža." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "spermicide", label: { en: "Spermicides", ru: "Спермициды", sr: "Spermicidi" }, perfect: 0.18, typical: 0.28, sev: 1, control: "perAct",
    side: { en: "Mucosal irritation; may raise STI risk.", ru: "Раздражение слизистой, может повышать риск ИППП.", sr: "Iritacija sluznice; može povećati rizik od PPI." },
    guide: { how: { en: "Gel/foam/suppositories with a substance that kills sperm; inserted before the act.", ru: "Гель/пена/свечи с веществом, убивающим сперматозоиды. Вводятся перед актом.", sr: "Gel/pena/supozitorije sa supstancom koja ubija spermatozoide; uvode se pre akta." }, side: { en: "Irritation; with frequent use nonoxynol-9 damages the mucosa and may RAISE STI risk. One of the least reliable alone; usually combined with a barrier. No prescription.", ru: "Раздражение. При частом применении ноноксинол-9 повреждает слизистую и может ПОВЫШАТЬ риск ИППП. Один из наименее надёжных и обычно сочетают с барьером. Рецепт не требуется.", sr: "Iritacija; pri čestom korišćenju nonoksinol-9 oštećuje sluznicu i može POVEĆATI rizik od PPI. Jedan od najmanje pouzdanih samostalno; obično se kombinuje sa barijerom. Bez recepta." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "cok", label: { en: "Combined pill (COC)", ru: "КОК (таблетки)", sr: "Kombinovana pilula (KOK)" }, perfect: 0.003, typical: 0.09, sev: 2, control: "toggle",
    side: { en: "Nausea, mood changes, weight fluctuations, rarely thrombosis. Consultation with a doctor required.", ru: "Тошнота, изменения настроения, колебания веса, редко тромбозы. Требуется консультация с врачом.", sr: "Mučnina, promene raspoloženja, kolebanja težine, retko tromboze. Potrebna konsultacija sa lekarom." },
    guide: { how: { en: "Estrogen + progestin daily: suppress ovulation, thicken mucus.", ru: "Приём эстрогена и прогестина ежедневно: подавляет овуляцию и сгущает слизь.", sr: "Estrogen + progestin dnevno: potiskuju ovulaciju, zgušnjavaju sluz." }, side: { en: "Nausea, breast tenderness, mood/libido changes, spotting. A rare but serious risk — venous thrombosis (higher in smokers 35+). Contraindicated in migraine with aura, thrombosis, smoking after 35, severe hypertension. Prescription required and a mandatory consultation with a doctor.", ru: "Тошнота, болезненность груди, изменения настроения/либидо, мажущие выделения. Редкий, но серьёзный риск — венозный тромбоз (выше у курящих 35+). Противопоказаны при мигрени с аурой, тромбозах, курении после 35, тяжёлой гипертензии. Нужен рецепт и обязательная консультация с врачом.", sr: "Mučnina, osetljivost grudi, promene raspoloženja/libida, krvarenje. Redak ali ozbiljan rizik — venska tromboza (veći kod pušača 35+). Kontraindikovane kod migrene sa aurom, tromboze, pušenja posle 35, teške hipertenzije. Potreban recept i obavezna konsultacija sa lekarom." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }, { label: "CDC", url: "https://www.cdc.gov/contraception/about/index.html" }] },
  { key: "minipill", label: { en: "Mini-pill (progestin)", ru: "Мини-пили (прогестин)", sr: "Mini-pilula (progestin)" }, perfect: 0.003, typical: 0.09, sev: 2, control: "toggle",
    side: { en: "Require strict dosing timing. May cause irregular bleeding.", ru: "Требуют строгого времени приёма. Могут вызывать нерегулярные кровотечения.", sr: "Zahtevaju strogo vreme uzimanja. Mogu izazvati nepravilna krvarenja." },
    guide: { how: { en: "Progestin only daily; thickens mucus, partially suppresses ovulation. Strictly tied to dosing time.", ru: "Прогестин ежедневно. Сгущают слизь, частично подавляют овуляцию. Жёстко привязаны ко времени приёма.", sr: "Samo progestin dnevno; zgušnjava sluz, delimično potiskuje ovulaciju. Strogo vezana za vreme uzimanja." }, side: { en: "Irregular/spotting bleeding — the most common effect. Contains no estrogen, so the chance of thrombosis is lower. An option when estrogen is contraindicated (breastfeeding, migraine with aura, smoking 35+). Available by prescription.", ru: "Нерегулярные/мажущие кровотечения — самый частый эффект. Не содержит эстрогена, поэтому ниже шанс тромбозов. Вариант при противопоказаниях к эстрогену (ГВ, мигрень с аурой, курение 35+). Отпускаются по рецепту.", sr: "Nepravilna/oskudna krvarenja — najčešći efekat. Ne sadrži estrogen, pa je šansa za trombozu niža. Opcija pri kontraindikacijama na estrogen (dojenje, migrena sa aurom, pušenje 35+). Izdaju se na recept." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "patch", label: { en: "Patch", ru: "Пластырь", sr: "Flaster" }, perfect: 0.003, typical: 0.09, sev: 2, control: "toggle",
    side: { en: "Like COC (estrogen); skin irritation under the patch.", ru: "Побочки как у КОК (эстроген). Раздражение кожи под пластырем.", sr: "Kao KOK (estrogen); iritacija kože ispod flastera." },
    guide: { how: { en: "A skin patch with estrogen + progestin; changed once a week.", ru: "Накожный пластырь с эстрогеном + прогестином. Меняется раз в неделю.", sr: "Flaster na koži sa estrogenom + progestinom; menja se jednom nedeljno." }, side: { en: "Profile like COC; skin irritation, risk of detaching. At ≥90 kg effectiveness may drop. Same contraindications as COC. Convenient for those who forget daily pills. Available by prescription.", ru: "Побочки как у КОК. Раздражение кожи, риск отклеивания. При весе ≥90 кг эффективность может снижаться. Те же противопоказания, что у КОК. Удобен забывающим ежедневные таблетки. Отпускается по рецепту.", sr: "Profil kao KOK; iritacija kože, rizik od odlepljivanja. Pri težini ≥90 kg efikasnost može opasti. Iste kontraindikacije kao KOK. Pogodan za one koji zaboravljaju dnevne pilule. Izdaje se na recept." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "ring", label: { en: "Vaginal ring", ru: "Вагинальное кольцо", sr: "Vaginalni prsten" }, perfect: 0.003, typical: 0.09, sev: 2, control: "toggle",
    side: { en: "Like COC; sometimes discharge/irritation, may fall out.", ru: "Как у КОК; иногда выделения/раздражение, может выпадать.", sr: "Kao KOK; ponekad sekret/iritacija, može ispasti." },
    guide: { how: { en: "A flexible ring in the vagina with estrogen + progestin; stays 3 weeks.", ru: "Гибкое кольцо во влагалище с эстрогеном + прогестином. Стоит 3 недели.", sr: "Fleksibilni prsten u vagini sa estrogenom + progestinom; stoji 3 nedelje." }, side: { en: "Profile like COC; locally — discharge, irritation, rarely falling out. Same contraindications as COC. Convenient, since it is changed once a month. Available by prescription.", ru: "Побочки как у КОК. Выделения, раздражение, изредка выпадение. Те же противопоказания, что у КОК. Удобно, так как меняется раз в месяц. Отпускается по рецепту.", sr: "Profil kao KOK; lokalno — sekret, iritacija, retko ispadanje. Iste kontraindikacije kao KOK. Pogodno, jer se menja jednom mesečno. Izdaje se na recept." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "depo", label: { en: "Injection (Depo)", ru: "Инъекции (Депо)", sr: "Injekcija (Depo)" }, perfect: 0.002, typical: 0.06, sev: 3, control: "toggle",
    side: { en: "Reversible bone-mass loss; irregular bleeding; slow return of fertility.", ru: "Обратимая потеря костной массы, нерегулярные кровотечения, долгий возврат фертильности.", sr: "Reverzibilni gubitak koštane mase; nepravilna krvarenja; spor povratak plodnosti." },
    guide: { how: { en: "A progestin injection every ~3 months: suppresses ovulation.", ru: "Инъекция прогестина каждые ~3 месяца: подавляет овуляцию.", sr: "Injekcija progestina svaka ~3 meseca: potiskuje ovulaciju." }, side: { en: "Irregular bleeding (often amenorrhea), weight gain, reversible drop in bone density. Return of fertility — up to 9–12 mo after stopping. Convenient for those suited by a quarterly shot. Caution with osteoporosis risk and near-term pregnancy planning. Available by prescription, the injection is given by a doctor.", ru: "Нерегулярные кровотечения (часто аменорея), набор веса, обратимое снижение костной плотности. Возврат фертильности — до 9–12 мес после отмены. Удобно тем, кому подходит укол раз в квартал. Использовать с осторожностью при риске остеопороза и скором планировании беременности. Отпускается по рецепту, инъекцию делает врач.", sr: "Nepravilna krvarenja (često amenoreja), dobijanje na težini, reverzibilno smanjenje koštane gustine. Povratak plodnosti — do 9–12 mes. nakon prestanka. Pogodno onima kojima odgovara injekcija jednom kvartalno. Oprez kod rizika od osteoporoze i skorog planiranja trudnoće. Izdaje se na recept, injekciju daje lekar." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "iud_cu", label: { en: "Copper IUD", ru: "Медная ВМС (внутриматочная спираль)", sr: "Bakarna spirala" }, perfect: 0.006, typical: 0.008, sev: 2, control: "toggle",
    side: { en: "Heavier/more painful periods; insertion risk (rarely perforation).", ru: "Более обильные/болезненные месячные. Редкая перфорация при установке.", sr: "Obilnije/bolnije menstruacije; rizik pri postavljanju (retko perforacija)." },
    guide: { how: { en: "A T-shaped device in the uterus; copper is toxic to sperm. Hormone-free. Works 5–10 years. Effectiveness does not depend on user error — fit and forget.", ru: "Т-образное устройство в матке. Медь токсична для сперматозоидов. Не использует гормоны. Работает 5–10 лет. Эффективность не зависит от ошибок пользователя — можно поставить и забыть.", sr: "Uređaj u obliku slova T u materici; bakar je toksičan za spermatozoide. Bez hormona. Radi 5–10 godina. Efikasnost ne zavisi od grešaka korisnika — postavi i zaboravi." }, side: { en: "Heavier and more painful periods, especially the first months. On insertion — pain, rarely perforation. Spontaneous expulsion of the device. A hormone-free long-term method. Can be used as emergency contraception within the first 5 days. Inserted and removed by a doctor.", ru: "Более обильные и болезненные менструации, особенно в первые месяцы. Риск при установке — боль и редко перфорация. Самопроизвольное выпадение спирали. Негормональный и долгосрочный метод. Можно использовать как экстренную контрацепцию в первые 5 дней. Устанавливает и удаляет врач.", sr: "Obilnije i bolnije menstruacije, naročito prvih meseci. Rizik pri postavljanju — bol, retko perforacija. Spontano ispadanje spirale. Nehormonski dugotrajni metod. Može se koristiti kao hitna kontracepcija u prvih 5 dana. Postavlja i uklanja lekar." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "iud_lng", label: { en: "Hormonal IUD", ru: "Гормональная ВМС (внутриматочная спираль)", sr: "Hormonska spirala" }, perfect: 0.002, typical: 0.002, sev: 2, control: "toggle",
    side: { en: "Irregular/scant bleeding the first months; insertion risks.", ru: "Нерегулярные/скудные кровотечения в первые месяцы и риски при установке.", sr: "Nepravilna/oskudna krvarenja prvih meseci; rizici pri postavljanju." },
    guide: { how: { en: "A T-shaped device releases progestin: thickens mucus, thins the endometrium. Works 3–8 years. A very reliable method of contraception that does not depend on user error. Fit and forget.", ru: "Т-образное устройство выделяет прогестин: сгущает слизь, истончает эндометрий. Работает 3–8 лет. Очень надёжное средство контрацепции и не зависит от ошибок пользователя. Можно поставить и забыть.", sr: "Uređaj u obliku slova T oslobađa progestin: zgušnjava sluz, istanjuje endometrijum. Radi 3–8 godina. Veoma pouzdano sredstvo kontracepcije koje ne zavisi od grešaka korisnika. Postavi i zaboravi." }, side: { en: "Irregular spotting the first months, then often scant periods or no menstruation. On insertion — pain, rarely perforation. Inserted and removed by a doctor.", ru: "Нерегулярные мажущие выделения в первые месяцы, затем часто скудные месячные или отсутствие менструаций. Риск при установке — боль и редко перфорация. Устанавливает и удаляет врач.", sr: "Nepravilna oskudna krvarenja prvih meseci, zatim često oskudne menstruacije ili izostanak menstruacija. Rizik pri postavljanju — bol, retko perforacija. Postavlja i uklanja lekar." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "implant", label: { en: "Implant", ru: "Имплант", sr: "Implant" }, perfect: 0.0005, typical: 0.0005, sev: 2, control: "toggle",
    side: { en: "Unpredictable bleeding; insertion/removal — a minor subcutaneous procedure.", ru: "Непредсказуемые кровотечения. Установка/удаление требуют малой процедуры под кожей.", sr: "Nepredvidiva krvarenja; postavljanje/uklanjanje — mala potkožna procedura." },
    guide: { how: { en: "A flexible rod with progestin under the upper-arm skin; suppresses ovulation. Works ~3–5 years. The most effective reversible method that does not depend on user error. Fit and forget.", ru: "Гибкий стержень с прогестином под кожей плеча, подавляет овуляцию. Работает ~3–5 лет. Самый эффективный обратимый метод и не зависит от ошибок пользователя. Можно поставить и забыть.", sr: "Fleksibilni štapić sa progestinom ispod kože nadlaktice; potiskuje ovulaciju. Radi ~3–5 godina. Najefikasniji reverzibilni metod koji ne zavisi od grešaka korisnika. Postavi i zaboravi." }, side: { en: "Unpredictable bleeding, possible acne, headaches. Insertion and removal need a minor procedure under the skin. Inserted and removed by a doctor.", ru: "Непредсказуемые кровотечения, возможны акне, головные боли. Для введения и удаления нужна мелкая процедура под кожей. Ставит и удаляет врач.", sr: "Nepredvidiva krvarenja, mogući akne, glavobolje. Za postavljanje i uklanjanje potrebna je mala procedura ispod kože. Postavlja i uklanja lekar." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "steril_f", label: { en: "Female sterilization", ru: "Женская стерилизация", sr: "Ženska sterilizacija" }, perfect: 0.005, typical: 0.005, sev: 4, control: "toggle",
    side: { en: "Surgery and anesthesia; considered irreversible; small ectopic risk on failure.", ru: "Хирургия и наркоз. Считается необратимой. Существует малый риск внематочной беременности.", sr: "Hirurgija i anestezija; smatra se nepovratnom; mali rizik od vanmaterične pri neuspehu." },
    guide: { how: { en: "Surgical blocking/removal of the fallopian tubes.", ru: "Хирургическое перекрытие/удаление маточных труб.", sr: "Hirurško zatvaranje/uklanjanje jajovoda." }, side: { en: "Surgical risks (anesthesia, bleeding, infection); on a rare failure a higher share of ectopic pregnancy. Hormones unchanged. The method is IRREVERSIBLE, so the decision must be weighed carefully in advance.", ru: "Операционные риски (наркоз, кровотечение, инфекция), при редкой неудаче выше доля внематочной беременности. Гормоны не меняются. Метод НЕОБРАТИМЫЙ, поэтому решение нужно тщательно взвешивать заранее.", sr: "Hirurški rizici (anestezija, krvarenje, infekcija); pri retkom neuspehu veći udeo vanmaterične trudnoće. Hormoni se ne menjaju. Metod je NEPOVRATAN, pa odluku treba pažljivo odvagati unapred." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "vasectomy", label: { en: "Vasectomy", ru: "Вазэктомия", sr: "Vazektomija" }, perfect: 0.001, typical: 0.0015, sev: 4, control: "toggle",
    side: { en: "Minor surgery. Not effective immediately. Reversibility is not guaranteed.", ru: "Малая операция. Не сразу эффективна. Обратимость не гарантирована.", sr: "Mala operacija. Nije odmah efikasna. Reverzibilnost nije zagarantovana." },
    guide: { how: { en: "Cutting/tying the vas deferens — sperm no longer enters the ejaculate. The effect is lifelong, and the hormonal background does not change.", ru: "Пересечение/перевязка семявыносящих протоков — в эякулят больше не попадают сперматозоиды. Эффект пожизненный, и гормональный фон не меняется.", sr: "Presecanje/podvezivanje semenovoda — u ejakulat više ne dospevaju spermatozoidi. Efekat je doživotan, i hormonski balans se ne menja." }, side: { en: "Minor surgery, may cause pain, swelling, bruising, rarely chronic pain. The effect is not instant — a control sperm test is needed (~3 mo). Reversibility is not guaranteed.", ru: "Малая операция, может вызывать боль, отёк, синяк, редко хроническая боль. Эффект не мгновенный — нужен контрольный анализ спермы (~3 мес). Обратимость не гарантирована.", sr: "Mala operacija, može izazvati bol, otok, modricu, retko hroničan bol. Efekat nije trenutan — potrebna je kontrolna analiza sperme (~3 mes.). Reverzibilnost nije zagarantovana." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "lam", label: { en: "LAM (lactational amenorrhea)", ru: "LAM (лактационная аменорея)", sr: "LAM (laktaciona amenoreja)" }, perfect: 0.005, typical: 0.02, sev: 1, control: "toggle",
    side: { en: "Works only the first ~6 mo under strict conditions.", ru: "Работает лишь первые ~6 мес при соблюдении строгих условий.", sr: "Radi samo prvih ~6 mes. pod strogim uslovima." },
    guide: { how: { en: "Amenorrhea during exclusive breastfeeding suppresses ovulation. Only under all three conditions: baby <6 mo, no menstruation, exclusive breastfeeding.", ru: "Отсутствие менструации при исключительно грудном вскармливании подавляет овуляцию. Работает только при всех трёх условиях: ребёнку <6 мес, нет менструаций и кормление исключительно грудью.", sr: "Amenoreja pri isključivom dojenju potiskuje ovulaciju. Samo pod sva tri uslova: beba <6 mes., nema menstruacija, isključivo dojenje." }, side: { en: "No side effects, but breaking any of the three conditions sharply lowers protection. After 6 mo or the first period it does not work. A temporary method for nursing mothers in the first half-year. The effectiveness percentage shows the figure for 6 mo, not for a year as with the other methods.", ru: "Побочек нет, но нарушение любого из трёх условий резко снижает защиту. После 6 мес или первой менструации не действует. Временный метод для кормящих матерей в первые полгода. Процент эффективности показывает процент за 6 мес, а не за год как для остальных методов.", sr: "Nema neželjenih efekata, ali kršenje bilo kog od tri uslova naglo smanjuje zaštitu. Posle 6 mes. ili prve menstruacije ne deluje. Privremeni metod za dojilje u prvih pola godine. Procenat efikasnosti pokazuje vrednost za 6 mes., a ne za godinu kao kod ostalih metoda." } },
    sources: [{ label: "CDC", url: "https://www.cdc.gov/contraception/about/index.html" }, { label: "Cochrane", url: "https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD001329.pub2/full" }] },
  { key: "ec", label: { en: "Emergency contraception", ru: "Экстренная контрацепция", sr: "Hitna kontracepcija" }, oneOff: true, perfect: null, typical: null, sev: 2, control: "oneOff",
    side: { en: "Nausea, vomiting, cycle disruption. Contains a large dose of hormones, so it is not used as a planned method of contraception.", ru: "Тошнота, рвота, сбой цикла. Содержит большую дозу гормонов, поэтому не применяется как запланированный способ контрацепции.", sr: "Mučnina, povraćanje, poremećaj ciklusa. Sadrži veliku dozu hormona, pa se ne koristi kao planirani metod kontracepcije." },
    guide: { how: { en: "A single dose after unprotected sex: levonorgestrel (up to 72 h) or ulipristal (up to 120 h) shifts ovulation; a copper IUD within 5 days is the most effective option.", ru: "Разовый приём после незащищённого акта. Содержит левоноргестрел (до 72 ч) или улипристал (до 120 ч). Сдвигает овуляцию. Медная ВМС в течение 5 дней — самый эффективный вариант.", sr: "Jednokratna doza posle nezaštićenog akta: levonorgestrel (do 72 h) ili ulipristal (do 120 h) pomera ovulaciju; bakarna spirala u roku od 5 dana — najefikasnija opcija." }, side: { en: "Nausea, headache, breast tenderness, temporary cycle disruption. Does not terminate an established pregnancy and does not protect during subsequent acts. Used as a backup method «just in case» and not for regular use. The sooner it is taken, the more effectively it works.", ru: "Тошнота, головная боль, болезненность груди, временный сбой цикла. Не прерывает наступившую беременность и не защищает при последующих актах. Применяется как резервный метод «на всякий случай» и не применяется для регулярного использования. Чем раньше была принята, тем эффективнее работает.", sr: "Mučnina, glavobolja, osetljivost grudi, privremeni poremećaj ciklusa. Ne prekida nastalu trudnoću i ne štiti pri narednim aktima. Koristi se kao rezervni metod „za svaki slučaj“ i ne za redovnu upotrebu. Što je ranije uzeta, to efikasnije deluje." } },
    sources: [{ label: "CDC", url: "https://www.cdc.gov/contraception/about/index.html" }] },
];
const CONTRA_MAP = Object.fromEntries(CONTRA.map((m) => [m.key, m]));
const methodFactors = (keys) => keys.filter((k) => k && k !== "none").reduce((f, k) => { const m = CONTRA_MAP[k]; return m ? f * (m.typical / 0.85) : f; }, 1);
function Qnat(age, perWeek) { const fc = fAge(age) * kFreq(perWeek); return 1 - Math.pow(1 - fc, 12); }
// Множитель контрацепции для «Девушки»: toggle (вкл/выкл) и perAct (доля актов u).
const womanFactor = (meth) => {
  let f = 1;
  CONTRA.forEach((m) => {
    if (m.key === "none" || m.oneOff) return;
    if (m.control === "toggle") { if (meth[m.key]) f *= (m.typical / 0.85); }
    else { const u = Math.max(0, Math.min(1, (meth[m.key] || 0) / 100)); if (u > 0) f *= ((1 - u) + u * (m.typical / 0.85)); }
  });
  return f;
};
const pregCumWomanF = (age, perWeek, factor, months) => 1 - Math.pow(1 - Math.min(0.999, Qnat(age, perWeek) * factor), months / 12);
// Парень: «хотя бы одна беременность среди партнёрш» — перемножаем вклады типов (ЗППП-логика).
function pregSurvivalMan(cfg, months, mFactor = 1) {
  let S = 1;
  TYPES.forEach((meta) => {
    const t = cfg[meta.key]; const cnt = t.count; if (cnt <= 0) return;
    const factors = womanFactor(t.meth) * mFactor;
    if (meta.kind === "oneoff") {
      const pa = Math.min(0.9, fAge(t.age) * 0.2 * factors);
      S *= Math.pow(Math.pow(1 - pa, cnt), months / 12);
    } else if (meta.kind === "ongoing") {
      const a = Math.min(0.999, Qnat(t.age, t.perWeek) * factors);
      const pPartner = 1 - Math.pow(1 - a, months / 12);
      S *= Math.pow(1 - pPartner, cnt);
    } else {
      const a = Math.min(0.999, Qnat(t.age, t.perWeek) * factors);
      const pRel = 1 - Math.pow(1 - a, Math.max(1, t.dur) / 12);
      S *= Math.pow(Math.pow(1 - pRel, cnt), months / 12);
    }
  });
  return S;
}
const PREG_BASE = {
  steady: { count: 1, perWeek: 3, dur: 0, age: 26, meth: { condom_m: 100 } },
  casual: { count: 2, perWeek: 1, dur: 12, age: 26, meth: { condom_m: 100 } },
  hookup: { count: 3, perWeek: 0, dur: 0, age: 26, meth: { condom_m: 100 } },
};
// Возраст мужчины — слабый фактор фертильности (заметнее после ~45). ОЦЕНКА.
function mAge(age) {
  if (age <= 40) return 1;
  if (age <= 55) return 1 - (age - 40) * 0.012;
  return Math.max(0.5, 0.82 - (age - 55) * 0.0073);
}
const PREG_PRESETS = [
  { key: "single", label: { en: "No partners", ru: "Без партнёрш", sr: "Bez partnerki" } },
  { key: "mono", label: { en: "Monogamy", ru: "Моногамия", sr: "Monogamija" }, steady: { count: 1, perWeek: 3, age: 26 } },
  { key: "dating", label: { en: "Dating", ru: "Встречается", sr: "Zabavlja se" }, casual: { count: 2, perWeek: 1, dur: 12, age: 26 } },
  { key: "active", label: { en: "Active dating", ru: "Активные знакомства", sr: "Aktivna upoznavanja" }, casual: { count: 4, perWeek: 1, dur: 3, age: 26 }, hookup: { count: 6, age: 26 } },
  { key: "hookups", label: { en: "One-night", ru: "На одну ночь", sr: "Jedna noć" }, hookup: { count: 15, age: 26 } },
];
const mkPregCfg = (over = {}) => ({
  steady: { ...PREG_BASE.steady, ...(over.steady || { count: 0 }) },
  casual: { ...PREG_BASE.casual, ...(over.casual || { count: 0 }) },
  hookup: { ...PREG_BASE.hookup, ...(over.hookup || { count: 0 }) },
});

function PregTip({ active, payload, label, lang }) {
  if (!active || !payload?.length) return null;
  const yrs = Math.floor(label / 12), mos = label % 12;
  return (
    <div style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 12 }}>
      <div style={{ color: C.mid, marginBottom: 6 }}>{yrs > 0 ? yrs + " " + yrShort(lang) + " " : ""}{mos} {moWord(lang)}</div>
      {payload.map((e) => (<div key={e.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 18, color: C.hi }}><span><span style={{ color: e.stroke }}>●</span> {e.name}</span><span>{pctVal(e.value, lang)}</span></div>))}
    </div>
  );
}
// На мобильном при прокрутке вниз залипающий график сжимается (прячет .chart-extra: слайдеры,
// легенду, строку-итог). Общий хук — используется и в графике ЗППП, и в графике беременности.
function useCondensed() {
  const [condensed, setCondensed] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width:879px)");
    const onScroll = () => { setCondensed(mq.matches && window.scrollY > 60); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, []);
  return condensed;
}

// Лёгкая разовая подсказка-анимация: включается, когда элемент впервые попадает на экран,
// держится ms миллисекунд и больше не повторяется. Возвращает [ref, active].
function useHintOnView(ms = 5000) {
  const ref = useRef(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let timer;
    const io = new IntersectionObserver((ents) => {
      if (ents.some((e) => e.isIntersecting)) {
        io.disconnect();
        setActive(true);
        timer = setTimeout(() => setActive(false), ms);
      }
    }, { threshold: 0.6 });
    io.observe(el);
    return () => { io.disconnect(); clearTimeout(timer); };
  }, [ms]);
  return [ref, active];
}

function PregChartPanel({ data, lines, years, setYears, yMax, setYMax, headline, lang, L }) {
  const condensed = useCondensed();
  const horizonM = years * 12;
  const ts = years <= 12 ? 1 : years <= 30 ? 5 : 10;
  const ticks = []; for (let y = 0; y <= years; y += ts) ticks.push(y * 12);
  // Анимация кривых только при дискретных изменениях; слайдеры — без анимации.
  const [chartAnim, setChartAnim] = useState(true);
  useEffect(() => {
    const isRange = (el) => el && el.matches && el.matches('input[type="range"]');
    const onInput = (e) => { if (isRange(e.target)) setChartAnim(false); };
    const onClick = (e) => { if (!isRange(e.target)) setChartAnim(true); };
    document.addEventListener("input", onInput, true);
    document.addEventListener("click", onClick, true);
    return () => { document.removeEventListener("input", onInput, true); document.removeEventListener("click", onClick, true); };
  }, []);
  return (
    <div className={"studio-chart" + (condensed ? " condensed" : "")} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 16px 12px" }}>
      <div className="chart-extra" style={{ display: "flex", gap: 26, flexWrap: "wrap", marginBottom: 16 }}>
        <Slider label={L.horizon} value={years} set={setYears} min={1} max={50} step={1} valueText={`${years} ${yearsWord(years, lang)}`} hint={L.horizonHint} subtle />
        <Slider label={L.scale} value={yMax} set={setYMax} min={1} max={100} step={1} valueText={`${lang === "en" ? "to" : lang === "sr" ? "do" : "до"} ${yMax}%`} hint={L.scaleHint} subtle />
      </div>
      <div className="chart-extra" style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
        {lines.map((ln) => (<span key={ln.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.mid }}><span style={{ width: 14, height: 0, borderTop: `3px ${ln.dash ? "dashed" : "solid"} ${ln.color}`, display: "inline-block" }} />{ln.label}</span>))}
      </div>
      <div className="chartbox">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="t" type="number" domain={[0, horizonM]} ticks={ticks} interval={0} stroke={C.dim} tick={{ fontSize: 12, fill: C.dim }} tickFormatter={(t) => (t === 0 ? "0" : `${t / 12}${L.yrAxis}`)} />
            <YAxis domain={[0, yMax]} allowDataOverflow stroke={C.dim} tick={{ fontSize: 12, fill: C.dim }} tickFormatter={(v) => `${v}%`} width={46} />
            <Tooltip content={(p) => <PregTip {...p} lang={lang} />} />
            {lines.map((ln) => (<Line key={ln.key} type="monotone" dataKey={ln.key} name={ln.label} stroke={ln.color} strokeWidth={ln.dash ? 1.6 : 2.4} strokeDasharray={ln.dash ? "6 4" : "0"} dot={false} isAnimationActive={chartAnim} animationDuration={320} animationEasing="ease" />))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {headline && <div className="chart-extra" style={{ color: C.mid, fontSize: 13, marginTop: 8 }}>{headline}</div>}
    </div>
  );
}
function PregTypeCard({ meta, t, setT, lang, L }) {
  const col = meta.color; const floatCount = meta.kind !== "ongoing"; const cnt = floatCount ? Math.round(t.count * 10) / 10 : Math.round(t.count);
  const active = t.count > 0;
  const cap = meta.kind === "oneoff" ? L.pregOneoffCap : meta.kind === "ongoing" ? L.pregOngoingCap : L.pregRelCap(fmtDur(t.dur, lang));
  return (
    <div>
      <Collapse open={!active}>
        <button onClick={() => setT({ count: meta.addCount })} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", background: "transparent", border: `1px dashed ${C.border}`, borderLeft: `3px solid ${col}77`, borderRadius: 10, padding: "11px 14px", cursor: "pointer" }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: col, opacity: 0.55 }} />
          <span style={{ color: C.mid, fontSize: 13.5 }}>{meta.label[lang]}</span>
          <span style={{ marginLeft: "auto", color: col, fontSize: 12.5, fontWeight: 600 }}>{L.addBtn}</span>
        </button>
      </Collapse>
      <Collapse open={active}>
        <div style={{ background: C.panel, border: `1px solid ${col}55`, borderLeft: `3px solid ${col}`, borderRadius: 12, padding: "13px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: col, flexShrink: 0 }} />
            <span style={{ color: C.hi, fontSize: 14, fontWeight: 600 }}>{meta.label[lang]}</span>
            <button onClick={() => setT({ count: 0 })} title={L.removeCard} aria-label={L.removeCard} onMouseEnter={(e) => (e.currentTarget.style.color = C.hi)} onMouseLeave={(e) => (e.currentTarget.style.color = C.dim)} style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontSize: 17, lineHeight: 1, padding: "0 2px", marginLeft: "auto" }}>×</button>
            {/* подпись на своей строке слева — как в TypeCard (без кривых переносов) */}
            <span style={{ flexBasis: "100%", display: "inline-flex", alignItems: "center", justifyContent: "flex-start", color: C.dim, fontSize: 11, whiteSpace: "nowrap" }}>{cap}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            <Slider label={meta.countLab[lang]} value={t.count} set={(v) => setT({ count: floatCount ? Math.round(v * 10) / 10 : Math.round(v) })} min={0} max={meta.countMax} step={floatCount ? 0.1 : 1} valueText={floatCount ? dec(cnt.toString(), lang) : `${cnt}`} />
            <Slider label={L.pregPartnerAge} value={t.age} set={(v) => setT({ age: Math.round(v) })} min={16} max={99} step={1} valueText={`${Math.round(t.age)}`} info={L.pregPartnerAgeInfo} />
            {meta.kind !== "oneoff" && <Slider label={L.sexPerWeek} value={t.perWeek} set={(v) => setT({ perWeek: Math.round(v * 10) / 10 })} min={0.1} max={14} step={0.1} valueText={`${dec(t.perWeek.toFixed(1), lang)}×`} />}
            {meta.kind === "recurring" && <Slider label={L.relDuration} value={t.dur} set={(v) => setT({ dur: v })} min={1} max={60} step={1} valueText={fmtDur(t.dur, lang)} />}
            <WomanMethods meth={t.meth} setMeth={(fn) => setT({ meth: fn(t.meth) })} lang={lang} L={L} />
          </div>
        </div>
      </Collapse>
    </div>
  );
}
function WomanMethods({ meth, setMeth, lang, L }) {
  const usable = CONTRA.filter((m) => m.key !== "none" && !m.oneOff);
  const added = usable.filter((m) => m.key in meth);
  const avail = usable.filter((m) => !(m.key in meth));
  const add = (k) => { const m = CONTRA_MAP[k]; setMeth((s) => ({ ...s, [k]: m.control === "perAct" ? 100 : true })); };
  const rm = (k) => setMeth((s) => { const n = { ...s }; delete n[k]; return n; });
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div>
      <div style={{ color: C.mid, fontSize: 13, marginBottom: 8, display: "inline-flex", alignItems: "center" }}>{L.contraLabel}<Info text={L.contraInfo} /></div>
      <div>
        {usable.map((m) => (
          <Collapse key={m.key} open={m.key in meth}>
            <div style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 10px", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: SEV[m.sev], flex: "0 0 8px" }} title={L.sevTitle} />
                <span style={{ color: C.hi, fontSize: 13, flex: 1, minWidth: 0 }}>{m.label[lang]}</span>
                {m.control === "perAct" && <span className="num" style={{ color: C.accent, fontSize: 12 }} title={L.shareOfActs}>{meth[m.key] || 0}%</span>}
                <button onClick={() => rm(m.key)} title={L.removeMethod} style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontSize: 17, lineHeight: 1, padding: "0 2px" }}>×</button>
              </div>
              {m.control === "perAct" && (
                <input className="rng" type="range" min={0} max={100} step={5} value={meth[m.key] || 0} onChange={(e) => setMeth((s) => ({ ...s, [m.key]: parseFloat(e.target.value) }))} style={{ marginTop: 8 }} title={L.shareOfActs} />
              )}
            </div>
          </Collapse>
        ))}
      </div>
      <div ref={ref} style={{ position: "relative" }}>
        <button onClick={() => setOpen((o) => !o)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: C.panel2, color: C.accent, border: `1px dashed ${C.accent}66`, borderRadius: 8, padding: "9px 12px", fontSize: 13, cursor: "pointer" }}>
          <span>{L.addMethod}</span>
          <span style={{ color: C.dim, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
        </button>
        {open && (
          <div className="fade-in" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 30, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, boxShadow: "0 10px 28px rgba(0,0,0,.5)", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {avail.map((m) => <button key={m.key} onClick={() => add(m.key)} className="pill">{m.label[lang]}</button>)}
            {avail.length === 0 && <span style={{ color: C.dim, fontSize: 12 }}>{L.allMethodsAdded}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// Разрыв «идеальное/реальное» по каждому методу — локализован.
const GAP = {
  withdrawal: { en: "In real use, effectiveness is much lower than ideal: it's hard to always pull out in time, and pre-ejaculate may contain sperm.", ru: "При реальном применении эффективность сильно ниже, чем при идеальном: трудно всегда успеть вывести вовремя, а предэякулят может содержать сперматозоиды.", sr: "Pri stvarnom korišćenju efikasnost je mnogo niža nego pri idealnom: teško je uvek izvući na vreme, a predejakulat može sadržati spermatozoide." },
  fam: { en: "The biggest effectiveness gap: easy to misjudge fertile days or not resist sex during the fertile window.", ru: "Самый большой разрыв эффективности: легко ошибиться в определении фертильных дней или не удержаться от секса в фертильное окно.", sr: "Najveći jaz u efikasnosti: lako je pogrešiti u određivanju plodnih dana ili ne odoleti seksu u plodnom prozoru." },
  condom_m: { en: "Tears, slips, or put on late.", ru: "Рвётся, слетает, надевается с опозданием.", sr: "Puca, sklizne, stavlja se sa zakašnjenjem." },
  condom_f: { en: "Shifts or inserted wrong.", ru: "Смещается или вводится неправильно.", sr: "Pomera se ili se uvodi pogrešno." },
  diaphragm: { en: "Wrong placement or shifting.", ru: "Неправильная установка или смещение.", sr: "Pogrešno postavljanje ili pomeranje." },
  spermicide: { en: "Not always applied in advance and correctly; even with perfect use the method is weak.", ru: "Применяют не всегда заранее и правильно; даже при идеальном использовании метод слабый.", sr: "Ne nanosi se uvek unapred i pravilno; čak i pri idealnom korišćenju metod je slab." },
  cok: { en: "Pills are missed or taken late.", ru: "Таблетки пропускаются или принимаются с опозданием.", sr: "Pilule se preskaču ili uzimaju sa zakašnjenjem." },
  minipill: { en: "Very sensitive to dosing time — even a small delay lowers protection.", ru: "Очень чувствительны ко времени приёма — даже небольшое опоздание снижает защиту.", sr: "Veoma osetljive na vreme uzimanja — čak i malo kašnjenje smanjuje zaštitu." },
  patch: { en: "Forgetting to change the patch on time or it peeling off.", ru: "Забывают вовремя поменять пластырь или он отклеивается.", sr: "Zaboravljaju da promene flaster na vreme ili se odlepi." },
  ring: { en: "Forgetting to insert or replace the ring on time.", ru: "Забывают вовремя поставить или сменить кольцо.", sr: "Zaboravljaju da postave ili promene prsten na vreme." },
  depo: { en: "Missing the next injection deadline (needed every ~3 months).", ru: "Пропускают срок очередной инъекции (нужна каждые ~3 месяца).", sr: "Propuštaju rok sledeće injekcije (potrebna svaka ~3 meseca)." },
  iud_cu: { en: "Almost no difference — the method does not depend on the user («fit and forget»).", ru: "Почти нет разницы — метод не зависит от пользователя («поставил и забыл»).", sr: "Skoro nema razlike — metod ne zavisi od korisnika („postavi i zaboravi“)." },
  iud_lng: { en: "No difference — the method does not depend on the user.", ru: "Разницы нет — метод не зависит от пользователя.", sr: "Nema razlike — metod ne zavisi od korisnika." },
  implant: { en: "No difference — the method does not depend on the user.", ru: "Разницы нет — метод не зависит от пользователя.", sr: "Nema razlike — metod ne zavisi od korisnika." },
  steril_f: { en: "No difference — the method does not depend on the user.", ru: "Разницы нет — метод не зависит от пользователя.", sr: "Nema razlike — metod ne zavisi od korisnika." },
  vasectomy: { en: "Almost no difference; the only risk is sex before the control sperm test (~3 mo).", ru: "Почти нет разницы; единственный риск — секс до контрольного анализа спермы (~3 мес).", sr: "Skoro nema razlike; jedini rizik je seks pre kontrolne analize sperme (~3 mes.)." },
  lam: { en: "The gap comes from breaking the strict conditions: feeding regimen, baby under 6 mo, no menstruation.", ru: "Разрыв из-за нарушения строгих условий: режим кормления, возраст ребёнка до 6 мес, отсутствие менструаций.", sr: "Jaz zbog kršenja strogih uslova: režim dojenja, uzrast bebe do 6 mes., odsustvo menstruacija." },
  ec: { en: "A one-off remedy — there is no annual figure. Effectiveness depends on how quickly it's taken after the act.", ru: "Разовое средство — годового показателя нет. Эффективность зависит от того, насколько быстро принять после акта.", sr: "Jednokratno sredstvo — godišnjeg pokazatelja nema. Efikasnost zavisi od toga koliko brzo se uzme posle akta." },
};

function ContraTable({ lang, L }) {
  const [open, setOpen] = useState({});
  const [hintRef, hint] = useHintOnView(); // разовая подсказка на шевроне первого метода
  const fmtP = (v) => (v == null ? "—" : pctAct(v, lang));
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "6px 6px", margin: "14px 0" }}>
      <div className="tbl-wrap">
        <table className="inf">
          <thead><tr>
            <th>{L.thMethod}</th>
            <th><span style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>{L.thPerfect}</span><div style={{ fontWeight: 400, color: C.dim, fontSize: 10, textTransform: "none", letterSpacing: 0, marginTop: 3 }}>{L.pregPerYear}</div></th>
            <th><span style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>{L.thTypical}<Info dn text={L.typicalInfo} /></span><div style={{ fontWeight: 400, color: C.dim, fontSize: 10, textTransform: "none", letterSpacing: 0, marginTop: 3 }}>{L.pregPerYear}</div></th>
            <th>{L.thSideFx}</th>
          </tr></thead>
          <tbody>
            {CONTRA.filter((m) => m.key !== "none").flatMap((m, mi) => {
              const exp = !!open[m.key];
              const rows = [
                <tr key={m.key} className={"inf-row" + (exp ? " on" : "")} onClick={() => setOpen((o) => ({ ...o, [m.key]: !o[m.key] }))} title={exp ? L.collapseGuide : L.openGuide} style={{ borderLeft: `3px solid ${SEV[m.sev]}` }}>
                  <td style={{ whiteSpace: "nowrap", color: C.hi }}>{m.label[lang]}<span aria-hidden ref={mi === 0 ? hintRef : undefined} className={mi === 0 && hint && !exp ? "hint-pulse" : undefined} style={{ marginLeft: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: 5, background: exp ? `${PREG}22` : C.panel2, border: `1px solid ${exp ? PREG : C.border}`, color: exp ? PREG : C.mid, fontSize: 11, verticalAlign: "middle", ["--hint-glow"]: `${PREG}aa` }}>{exp ? "▾" : "▸"}</span></td>
                  <td className="num">{fmtP(m.perfect)}</td>
                  <td className="num" style={{ whiteSpace: "nowrap" }}>{fmtP(m.typical)}{GAP[m.key] && <Info dn text={GAP[m.key][lang]} />}</td>
                  <td><span style={{ background: `${SEV[m.sev]}22`, color: SEV[m.sev], padding: "3px 8px", borderRadius: 6, fontSize: 12, fontWeight: 500, display: "inline-block" }}>{m.side[lang]}</span></td>
                </tr>,
              ];
              rows.push(
                <tr key={m.key + "-g"} style={{ borderLeft: `3px solid ${SEV[m.sev]}` }}>
                  <td colSpan={4} style={{ background: C.panel2, padding: 0, borderBottom: "none" }}>
                   <Collapse open={exp}>
                    <div style={{ padding: "14px 16px" }}>
                    <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                      <div><div className="ghd">{L.howWorks}</div><div className="gtx">{m.guide.how[lang]}</div></div>
                      <div><div className="ghd">{L.sideRisks}</div><div className="gtx">{m.guide.side[lang]}</div></div>
                    </div>
                    <div style={{ marginTop: 12, fontSize: 12, color: C.dim }}>{L.sourcesLab}: {m.sources.map((s, i) => (<span key={i}>{i > 0 ? " · " : ""}<a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: PREG, textDecoration: "none" }}>{s.label} ↗</a></span>))}</div>
                    </div>
                   </Collapse>
                  </td>
                </tr>
              );
              return rows;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Pregnancy({ who, setWho, years, setYears, yMax, setYMax, lang, L, w, setW, meth, setMeth, mcfg, setMcfg, manAge, setManAge, activePreg, setActivePreg }) {
  const months = years * 12;
  const setMType = (key, patch) => { setMcfg((c) => ({ ...c, [key]: { ...c[key], ...patch } })); setActivePreg(null); };
  const applyPreg = (pr) => { setMcfg(mkPregCfg(pr)); setActivePreg(pr.key); };
  const mFac = mAge(manAge);
  const yw = yearsWord(years, lang);

  const wFac = womanFactor(meth);
  const wData = useMemo(() => {
    const pts = []; const step = Math.max(1, Math.ceil(months / 170));
    for (let t = 0; t <= months; t += step) pts.push({ t, p: pregCumWomanF(w.age, w.perWeek, wFac, t) * 100, ref: pregCumWomanF(w.age, w.perWeek, 1, t) * 100 });
    return pts;
  }, [w, meth, months]); // eslint-disable-line react-hooks/exhaustive-deps
  const wEnd = pregCumWomanF(w.age, w.perWeek, wFac, months) * 100;

  const refCfg = useMemo(() => ({ steady: { ...mcfg.steady, meth: {} }, casual: { ...mcfg.casual, meth: {} }, hookup: { ...mcfg.hookup, meth: {} } }), [mcfg]);
  const mData = useMemo(() => {
    const pts = []; const step = Math.max(1, Math.ceil(months / 170));
    for (let t = 0; t <= months; t += step) pts.push({ t, p: (1 - pregSurvivalMan(mcfg, t, mFac)) * 100, ref: (1 - pregSurvivalMan(refCfg, t, mFac)) * 100 });
    return pts;
  }, [mcfg, refCfg, months, mFac]);
  const mEnd = (1 - pregSurvivalMan(mcfg, months, mFac)) * 100;
  const mBuilt = useMemo(() => buildPartnersTyped(mcfg, months), [mcfg, months]);
  const mPacked = useMemo(() => packLanes(mBuilt.list), [mBuilt]);
  const mAvg = mcfg.steady.count * mcfg.steady.perWeek + mcfg.casual.count * mcfg.casual.dur / 12 * mcfg.casual.perWeek + mcfg.hookup.count / 52;

  return (
    <>
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 18px", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setWho("woman")} style={SUBSEG(who === "woman", PREG)}>{L.pregWoman}</button>
          <button onClick={() => setWho("man")} style={SUBSEG(who === "man", "#4dabf7")}>{L.pregMan}</button>
        </div>
        <div className="rich" style={{ fontSize: 12.5, color: C.mid, lineHeight: 1.55, marginTop: 12 }}>{who === "woman" ? L.pregWomanExpl : L.pregManExpl}</div>
      </div>

      {who === "woman" ? (
        <div className="studio">
          <div className="studio-controls">
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 15 }}>
              <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 0.6 }}>{L.pregProfile}</div>
              <Slider label={L.pregWomanAge} value={w.age} set={(v) => setW((s) => ({ ...s, age: Math.round(v) }))} min={16} max={99} step={1} valueText={`${w.age}`} info={L.pregWomanAgeInfo} />
              <Slider label={L.sexPerWeek} value={w.perWeek} set={(v) => setW((s) => ({ ...s, perWeek: Math.round(v * 10) / 10 }))} min={0.1} max={14} step={0.1} valueText={`${dec(w.perWeek.toFixed(1), lang)}×`} info={L.pregFreqInfo} />
              <WomanMethods meth={meth} setMeth={setMeth} lang={lang} L={L} />
            </div>
          </div>
          <PregChartPanel data={wData} lines={[{ key: "p", label: L.pregLineWoman, color: PREG }, { key: "ref", label: L.pregLineNoContra, color: C.dim, dash: true }]} years={years} setYears={setYears} yMax={yMax} setYMax={setYMax} lang={lang} L={L} headline={L.pregHeadWoman(years, yw, pctVal(wEnd, lang), wFac < 1)} />
        </div>
      ) : (
        <>
        <div className="studio">
          <div className="studio-controls">
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 18px", marginBottom: 14 }}>
              <Slider label={L.pregMyAge} value={manAge} set={setManAge} min={16} max={99} step={1} valueText={`${manAge}`} info={L.pregMyAgeInfo} />
            </div>
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.6, display: "inline-flex", alignItems: "center" }}>{L.pregBehaviorPreset}<Info text={L.pregPresetInfo} /></div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {PREG_PRESETS.map((pr) => (<button key={pr.key} onClick={() => applyPreg(pr)} className={"pill " + (activePreg === pr.key ? "on" : "")}>{pr.label[lang]}</button>))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
                {TYPES.map((meta) => (<PregTypeCard key={meta.key} meta={meta} t={mcfg[meta.key]} setT={(patch) => setMType(meta.key, patch)} lang={lang} L={L} />))}
              </div>
            </div>
          </div>
          <PregChartPanel data={mData} lines={[{ key: "p", label: L.pregLineMan, color: PREG }, { key: "ref", label: L.pregLineIfNoContra, color: C.dim, dash: true }]} years={years} setYears={setYears} yMax={yMax} setYMax={setYMax} lang={lang} L={L} headline={L.pregHeadMan(years, yw, pctVal(mEnd, lang))} />
        </div>
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 18px 14px", margin: "14px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{L.structTitle}</h2>
            <div className="rich" style={{ fontSize: 12, color: C.mid }}>{L.structStats(dec(mAvg.toFixed(1), lang), mPacked.lanes, mBuilt.total)}</div>
          </div>
          <p style={{ color: C.dim, fontSize: 12, margin: "0 0 14px", lineHeight: 1.5 }}>
            <span style={{ color: "#f0a500" }}>● {L.legSteady}</span> · <span style={{ color: "#2ec4b6" }}>● {L.legCasual}</span> · <span style={{ color: "#4dabf7" }}>● {L.legHookup}</span>{L.structLegendTail}
          </p>
          {mPacked.list.length === 0 ? <div style={{ color: C.mid, fontSize: 13, padding: "20px 0", textAlign: "center" }}>{L.pregNoPartnersF}</div> : <><Timeline packed={mPacked} horizonM={months} years={years} lang={lang} />{mBuilt.total > mPacked.list.length && <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>{L.shownPart(mBuilt.total)}</div>}</>}
        </div>
        </>
      )}

      <ContraTable lang={lang} L={L} />

      <details style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, margin: "14px 0" }}>
        <summary style={{ color: C.hi, fontSize: 15, fontWeight: 600 }}>{L.pregAssumTitle}</summary>
        <div className="rich" style={{ color: C.mid, fontSize: 13, lineHeight: 1.6, marginTop: 14 }}>
          {[L.pregAssum1, L.pregAssum2, L.pregAssum4, L.pregAssum5, L.pregAssum6].map((a, i) => (
            <div key={i} style={{ borderLeft: `2px solid ${C.border}`, paddingLeft: 12, marginBottom: 13 }}>{a}</div>
          ))}
          <div style={{ fontSize: 12, color: C.dim }}>{L.pregAssumSources}</div>
        </div>
      </details>
    </>
  );
}

function LangSwitch({ lang, setLang }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "absolute", top: 0, right: 0, zIndex: 50 }}>
      <button onClick={() => setOpen((o) => !o)} aria-label="Language" style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", color: C.mid, border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 7px", fontSize: 11.5, cursor: "pointer", opacity: 0.8 }}>
        <span aria-hidden style={{ fontSize: 11 }}>🌐</span>{lang.toUpperCase()}
        <span aria-hidden style={{ color: C.dim, fontSize: 9, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
      </button>
      {open && (
        <div className="fade-in" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 8, boxShadow: "0 10px 28px rgba(0,0,0,.5)", display: "flex", gap: 6 }}>
          {LANGS.map((lg) => (
            <button key={lg} onClick={() => { setLang(lg); setOpen(false); }} style={{ background: lang === lg ? C.accent : "transparent", color: lang === lg ? C.bg : C.mid, border: `1px solid ${lang === lg ? C.accent : C.border}`, borderRadius: 999, padding: "5px 12px", fontSize: 13, fontWeight: lang === lg ? 600 : 500, cursor: "pointer" }}>{lg.toUpperCase()}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// --- «Поделиться»: КОМПАКТНАЯ сериализация состояния ⇄ ссылка (хэш #c=base64url) ---
// Короткие ключи + пропуск дефолтов + битовые маски + индекс пресета вместо полного cfg.
// Hash работает на любом подпути GitHub Pages без перезагрузки. Старый формат v:1 принимается как есть.
const SHARE_TKEYS = ["steady", "casual", "hookup"];
const STI_KEYS = STIS.map((s) => s.key);
const PRESET_KEYS = PRESETS.map((p) => p.key);
const PREG_PRESET_KEYS = PREG_PRESETS.map((p) => p.key);
const STI_FIELDS = ["count", "condom", "perWeek", "dur", "tested"]; // poolMul — производное, не сериализуем
const PREG_FIELDS = ["count", "perWeek", "dur", "age"];             // + meth отдельным слотом
const actsToMask = (a) => ACT_KEYS.reduce((m, k, i) => m | (a && a[k] ? 1 << i : 0), 0);
const maskToActs = (m) => { const o = {}; ACT_KEYS.forEach((k, i) => { o[k] = !!(m & (1 << i)); }); return o; };
const DEF_ACTS_MASK = actsToMask({ vagR: true, oralR: true, oralI: true });
const hiddenToMask = (h) => STI_KEYS.reduce((m, k, i) => m | (h && h[k] ? 1 << i : 0), 0);
const maskToHidden = (m) => { const o = {}; STI_KEYS.forEach((k, i) => { if (m & (1 << i)) o[k] = true; }); return o; };
const isDefMeth = (m) => !!m && Object.keys(m).length === 1 && m.condom_m === 100;
const packStiCfg = (cfg) => SHARE_TKEYS.map((k) => (cfg[k].count > 0 ? STI_FIELDS.map((f) => cfg[k][f]) : 0));
const unpackStiCfg = (arr) => {
  const c = mkCfg(); // все count 0, остальное из BASE (incl. poolMul)
  (arr || []).forEach((a, i) => { if (Array.isArray(a)) STI_FIELDS.forEach((f, j) => (c[SHARE_TKEYS[i]][f] = a[j])); });
  return c;
};
const packPregCfg = (cfg) => SHARE_TKEYS.map((k) => { const t = cfg[k]; return t.count > 0 ? [...PREG_FIELDS.map((f) => t[f]), isDefMeth(t.meth) ? 0 : t.meth] : 0; });
const unpackPregCfg = (arr) => {
  const c = mkPregCfg();
  (arr || []).forEach((a, i) => { if (Array.isArray(a)) { const t = c[SHARE_TKEYS[i]]; PREG_FIELDS.forEach((f, j) => (t[f] = a[j])); t.meth = a[4] ? a[4] : { condom_m: 100 }; } });
  return c;
};

function buildShare(s) {
  const o = { v: 2 };
  if (s.lang !== "en") o.l = s.lang;
  if (s.mode !== "sti") o.m = 1;
  if (s.who !== "woman") o.g = 1;
  if (s.years !== 10) o.y = s.years;
  if (s.yMax !== 100) o.ym = s.yMax;
  // ЗППП: «open» — дефолт (опускаем); другой пресет → индекс; кастом → компактный cfg.
  // Любая ручная правка обнуляет activePreset, поэтому при наличии пресета cfg всегда = mkCfg(preset).
  if (s.preset === "open") { /* дефолт */ }
  else if (s.preset && PRESET_KEYS.indexOf(s.preset) >= 0) o.ps = PRESET_KEYS.indexOf(s.preset);
  else o.c = packStiCfg(s.cfg);
  const am = actsToMask(s.acts); if (am !== DEF_ACTS_MASK) o.a = am;
  const hm = hiddenToMask(s.hidden); if (hm) o.h = hm;
  if (s.vaxHpv) o.vh = 1;
  if (s.vaxHbv) o.vb = 1;
  if (s.sti) o.st = 1;
  if (s.selected !== "chl" && STI_KEYS.indexOf(s.selected) >= 0) o.s = STI_KEYS.indexOf(s.selected);
  if (s.env && s.env !== "normal") o.e = s.env === "high" ? 1 : 2;
  // Беременность — девушка
  if (s.w && s.w.age !== 26) o.wa = s.w.age;
  if (s.w && s.w.perWeek !== 3) o.wf = s.w.perWeek;
  if (!isDefMeth(s.meth)) o.wm = s.meth;
  // Беременность — парень: «dating» — дефолт (опускаем)
  if (s.preg === "dating") { /* дефолт */ }
  else if (s.preg && PREG_PRESET_KEYS.indexOf(s.preg) >= 0) o.pp = PREG_PRESET_KEYS.indexOf(s.preg);
  else o.mc = packPregCfg(s.mcfg);
  if (s.manAge !== 28) o.ma = s.manAge;
  return o;
}

function parseShare(o) {
  if (!o || typeof o !== "object") return null;
  if (o.v === 1) return o; // старый полный формат — уже в форме SHARE_INIT
  if (o.v !== 2) return null;
  const r = { lang: o.l || "en", mode: o.m ? "preg" : "sti", who: o.g ? "man" : "woman",
    years: o.y ?? 10, yMax: o.ym ?? 100, preset: "ons", preg: "dating" };
  if (typeof o.ps === "number" && PRESETS[o.ps]) { r.preset = PRESET_KEYS[o.ps]; r.cfg = mkCfg(PRESETS[o.ps]); }
  else if (o.c) { r.preset = null; r.cfg = unpackStiCfg(o.c); }
  if (typeof o.a === "number") r.acts = maskToActs(o.a);
  if (o.h) r.hidden = maskToHidden(o.h);
  if (o.vh) r.vaxHpv = true;
  if (o.vb) r.vaxHbv = true;
  if (o.st) r.sti = true;
  if (typeof o.s === "number" && STI_KEYS[o.s]) r.selected = STI_KEYS[o.s];
  if (o.e === 1) r.env = "high"; else if (o.e === 2) r.env = "outbreak";
  if (typeof o.wa === "number" || typeof o.wf === "number") r.w = { age: o.wa ?? 26, perWeek: o.wf ?? 3 };
  if (o.wm) r.meth = o.wm;
  if (typeof o.pp === "number" && PREG_PRESETS[o.pp]) { r.preg = PREG_PRESET_KEYS[o.pp]; r.mcfg = mkPregCfg(PREG_PRESETS[o.pp]); }
  else if (o.mc) { r.preg = null; r.mcfg = unpackPregCfg(o.mc); }
  if (typeof o.ma === "number") r.manAge = o.ma;
  return r;
}

function encodeShare(snap) {
  try { return btoa(unescape(encodeURIComponent(JSON.stringify(buildShare(snap))))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  catch { return ""; }
}
function decodeShare() {
  try {
    const h = (typeof window !== "undefined" ? window.location.hash : "") || "";
    const m = h.match(/[#&]c=([^&]+)/);
    if (!m) return null;
    let b = m[1].replace(/-/g, "+").replace(/_/g, "/"); while (b.length % 4) b += "=";
    return parseShare(JSON.parse(decodeURIComponent(escape(atob(b)))));
  } catch { return null; }
}
// Накладываем сохранённый конфиг поверх дефолта по каждому типу партнёров (устойчиво к нехватке полей).
const mergeTypes = (base, over) => over ? {
  steady: { ...base.steady, ...(over.steady || {}) },
  casual: { ...base.casual, ...(over.casual || {}) },
  hookup: { ...base.hookup, ...(over.hookup || {}) },
} : base;
const SHARE_INIT = decodeShare();
// Прямая ссылка на раздел: «#preg» (или ?preg / ?mode=preg) открывает подсайт беременности сразу,
// без полного профиля. Полный шэр (#c=…) и так несёт режим (o.m) — у него приоритет.
const MODE_FROM_URL = (() => {
  if (SHARE_INIT && SHARE_INIT.mode) return SHARE_INIT.mode;
  try {
    const h = (window.location.hash || "").toLowerCase();
    const s = (window.location.search || "").toLowerCase();
    if (h === "#preg" || h === "#pregnancy" || /[?&](preg|mode=preg)(=1)?(&|$)/.test(s)) return "preg";
  } catch {}
  return "sti";
})();

// Кнопка «Поделиться»: копирует ссылку с текущими настройками в буфер, с явным визуальным фидбеком.
function ShareButton({ snapshot, L }) {
  const [copied, setCopied] = useState(false);
  const tRef = useRef(null);
  useEffect(() => () => clearTimeout(tRef.current), []);
  const copy = async () => {
    const url = window.location.href.split("#")[0] + "#c=" + encodeShare(snapshot());
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch {}
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = url; ta.style.position = "fixed"; ta.style.left = "-9999px";
        document.body.appendChild(ta); ta.select(); ok = document.execCommand("copy"); document.body.removeChild(ta);
      } catch {}
    }
    try { window.history.replaceState(null, "", url); } catch {} // и сама страница становится «расшариваемой»
    if (ok) { setCopied(true); clearTimeout(tRef.current); tRef.current = setTimeout(() => setCopied(false), 2200); }
  };
  return (
    <button onClick={copy} title={L.shareHint} aria-label={L.shareBtn}
      onMouseDown={(e) => { e.currentTarget.style.opacity = "0.7"; }}
      onMouseUp={(e) => { e.currentTarget.style.opacity = ""; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = ""; }}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, background: copied ? "#2ea043" : C.panel2, color: copied ? "#fff" : C.hi, border: `1px solid ${copied ? "#2ea043" : C.border}`, borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", transition: "background .15s, border-color .15s, opacity .1s" }}>
      <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>{copied ? "✓" : "🔗"}</span>
      {copied ? L.shareDone : L.shareBtn}
    </button>
  );
}

// ── Онбординг-тур: подсветка-кольцо + пузырёк. Без затемнения — элементы остаются интерактивными. ──
const TOUR_ENABLED = false; // фича-тур выключена (код сохранён — можно вернуть, поставив true)
const TOUR_STEPS = [
  { sel: '[data-tour="chart"]', k: "tour2" },     // график — первым
  { sel: '[data-tour="presets"]', k: "tour1" },
  { sel: '[data-tour="condom"]', k: "tour3" },
  { sel: '[data-tour="acts"]', k: "tour4" },
  { sel: '[data-tour="env"]', k: "tour5" },
];
function Tour({ step, setStep, L }) {
  const [rects, setRects] = useState(null);   // { t: целевой бокс, c: бокс графика }
  const [moving, setMoving] = useState(false); // окно анимации перемещения пятна
  useEffect(() => {
    if (step < 0 || step >= TOUR_STEPS.length) return;
    const el = document.querySelector(TOUR_STEPS[step].sel);
    if (!el) { setRects(null); return; }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setMoving(true);
    const mv = setTimeout(() => setMoving(false), 420);
    const pad = 6;
    const box = (r) => ({ x: r.left - pad, y: r.top - pad, w: r.width + 2 * pad, h: r.height + 2 * pad });
    let raf, prev = "";
    const tick = () => {
      const t = box(el.getBoundingClientRect());
      const ce = document.querySelector('[data-tour="chart"]');
      const c = ce ? box(ce.getBoundingClientRect()) : t;
      const key = `${t.x},${t.y},${t.w},${t.h}|${c.x},${c.y},${c.w},${c.h}`;
      if (key !== prev) { prev = key; setRects({ t, c }); }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); clearTimeout(mv); };
  }, [step]);
  if (step < 0 || step >= TOUR_STEPS.length || !rects) return null;
  const last = step === TOUR_STEPS.length - 1;
  const finish = () => { try { localStorage.setItem("tour_done", "1"); } catch (e) {} setStep(-1); };
  const t = rects.t;
  const below = t.y + t.h + 180 < window.innerHeight;
  const left = Math.max(155, Math.min(window.innerWidth - 155, t.x + t.w / 2));
  const bub = below
    ? { left, top: t.y + t.h + 14, transform: "translateX(-50%)" }
    : { left, top: Math.max(12, t.y - 14), transform: "translate(-50%, -100%)" };
  const cls = moving ? "tour-hole" : undefined; // плавное перемещение только при смене шага, не при скролле
  return (
    <>
      <svg aria-hidden style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1000 }}>
        <defs>
          <mask id="tourmask">
            <rect x="0" y="0" width="100%" height="100%" fill="#fff" />
            <rect className={cls} x={rects.c.x} y={rects.c.y} width={rects.c.w} height={rects.c.h} rx="12" fill="#000" />
            <rect className={cls} x={rects.t.x} y={rects.t.y} width={rects.t.w} height={rects.t.h} rx="10" fill="#000" />
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#tourmask)" />
      </svg>
      <div style={{ position: "fixed", left: bub.left, top: bub.top, transform: bub.transform, maxWidth: 290, width: "calc(100vw - 32px)", boxSizing: "border-box", background: C.panel2, border: "none", borderRadius: 12, padding: "14px 16px", boxShadow: "0 14px 38px rgba(0,0,0,0.62)", zIndex: 1001 }}>
        <div style={{ color: C.hi, fontSize: 14, lineHeight: 1.5, marginBottom: 12 }}>{L[TOUR_STEPS[step].k]}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: C.dim, fontSize: 12 }}>{step + 1}/{TOUR_STEPS.length}</span>
          <button onClick={finish} style={{ marginLeft: "auto", background: "transparent", border: "none", color: C.mid, cursor: "pointer", fontSize: 13 }}>{L.tourSkip}</button>
          <button onClick={() => (last ? finish() : setStep(step + 1))} style={{ background: C.accent, color: C.bg, border: "none", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>{last ? L.tourDone : L.tourNext}</button>
        </div>
      </div>
    </>
  );
}

// Поповер «Контакты и фидбек»: компактное окно у ссылки в футере.
// Без формы — mailto ненадёжен на ПК; показываем только GitHub issue и почту.
function ContactPopover({ L, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    const onDown = (e) => { const box = ref.current && ref.current.parentElement; if (box && !box.contains(e.target)) onClose(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [onClose]);
  return (
    <div ref={ref} className="fade-in" role="dialog" style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", width: 280, maxWidth: "calc(100vw - 24px)", boxSizing: "border-box", background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 14px 38px rgba(0,0,0,0.55)", padding: "14px 16px", zIndex: 100, textAlign: "left", cursor: "default" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ color: C.hi, fontSize: 14, fontWeight: 700 }}>{L.contactTitle}</span>
        <button onClick={onClose} aria-label={L.contactClose} style={{ background: "transparent", border: "none", color: C.mid, fontSize: 20, lineHeight: 1, cursor: "pointer", padding: 2 }}>×</button>
      </div>
      <p style={{ color: C.mid, fontSize: 12.5, lineHeight: 1.5, margin: "0 0 8px" }}>{L.contactIntro}</p>
      <ul style={{ color: C.mid, fontSize: 12.5, lineHeight: 1.5, margin: 0, paddingLeft: 18 }}>
        <li style={{ marginBottom: 5 }}>{L.contactGithub}</li>
        <li>{L.contactEmailLine}</li>
      </ul>
    </div>
  );
}

// Поповер доната — список платформ. URL-ы — ПЛЕЙСХОЛДЕРЫ: впиши свои хэндлы Ko-fi/Liberapay
// (в i18n: donateKofi/donateLiberapay; GitHub Sponsors — уже на ник владельца репо).
function DonatePopover({ L, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    const onDown = (e) => { const box = ref.current && ref.current.parentElement; if (box && !box.contains(e.target)) onClose(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [onClose]);
  return (
    <div ref={ref} className="fade-in" role="dialog" style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", width: 280, maxWidth: "calc(100vw - 24px)", boxSizing: "border-box", background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 14px 38px rgba(0,0,0,0.55)", padding: "14px 16px", zIndex: 100, textAlign: "left", cursor: "default" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ color: C.hi, fontSize: 14, fontWeight: 700 }}>{L.donateTitle}</span>
        <button onClick={onClose} aria-label={L.contactClose} style={{ background: "transparent", border: "none", color: C.mid, fontSize: 20, lineHeight: 1, cursor: "pointer", padding: 2 }}>×</button>
      </div>
      <p style={{ color: C.mid, fontSize: 12.5, lineHeight: 1.5, margin: "0 0 8px" }}>{L.donateIntro}</p>
      <ul style={{ color: C.mid, fontSize: 12.5, lineHeight: 1.6, margin: 0, paddingLeft: 18 }}>
        <li style={{ marginBottom: 5 }}>{L.donateKofi}</li>
        <li style={{ marginBottom: 5 }}>{L.donateLiberapay}</li>
        <li>{L.donateGithub}</li>
      </ul>
    </div>
  );
}

// Окно «Риск ВИЧ»: объясняет неравномерность риска (вспышки, кофактор ЗППП, презерватив)
// и показывает, какие параметры выставил сценарий.
function HivRiskModal({ L, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const p = { color: C.mid, fontSize: 13.5, lineHeight: 1.6, margin: "0 0 10px" };
  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 2000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px", overflowY: "auto" }}>
      <div className="fade-in" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()} style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: "0 18px 50px rgba(0,0,0,0.6)", width: "100%", maxWidth: 480, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ margin: 0, color: C.hi, fontSize: 18, fontWeight: 700 }}>{L.hivTitle}</h2>
          <button onClick={onClose} aria-label={L.contactClose} style={{ background: "transparent", border: "none", color: C.mid, fontSize: 22, lineHeight: 1, cursor: "pointer", padding: 4 }}>×</button>
        </div>
        <p style={p}>{L.hivP1}</p>
        <p style={p}>{L.hivP2}</p>
        <p style={{ ...p, marginBottom: 16 }}>{L.hivP3}</p>
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
          <div style={{ color: C.dim, fontSize: 12, marginBottom: 9 }}>{L.hivChanged}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[L.hivChip1, L.hivChip2, L.hivChip3].map((c, i) => (
              <span key={i} style={{ background: `${C.accent}1f`, border: `1px solid ${C.accent}`, color: C.hi, borderRadius: 8, padding: "5px 11px", fontSize: 12.5 }}>{c}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [lang, setLang] = useState(() => {
    if (SHARE_INIT && SHARE_INIT.lang && LANGS.includes(SHARE_INIT.lang)) return SHARE_INIT.lang;
    try { const v = localStorage.getItem("lang"); if (v && LANGS.includes(v)) return v; } catch {}
    return "en"; // дефолт — английский, без авто-детекта языка браузера
  });
  useEffect(() => {
    try { localStorage.setItem("lang", lang); } catch {}
    document.documentElement.lang = lang;
  }, [lang]);
  const L = I18N[lang];

  const [cfg, setCfg] = useState(() => mergeTypes(DEFAULT_CFG, SHARE_INIT && SHARE_INIT.cfg));
  const [years, setYears] = useState(SHARE_INIT?.years ?? 10);
  const [yMax, setYMax] = useState(SHARE_INIT?.yMax ?? 100);
  const [hidden, setHidden] = useState(SHARE_INIT?.hidden ?? {});
  const [env, setEnv] = useState(SHARE_INIT?.env ?? "high");
  // Анимация кривых: только при дискретных изменениях (кнопки). Слайдеры тянут значение плавно сами —
  // их изменения применяем к графику без анимации, иначе кривые отстают/дёргаются.
  const [chartAnim, setChartAnim] = useState(true);
  useEffect(() => {
    const isRange = (el) => el && el.matches && el.matches('input[type="range"]');
    const onInput = (e) => { if (isRange(e.target)) setChartAnim(false); };
    const onClick = (e) => { if (!isRange(e.target)) setChartAnim(true); };
    document.addEventListener("input", onInput, true);
    document.addEventListener("click", onClick, true);
    return () => { document.removeEventListener("input", onInput, true); document.removeEventListener("click", onClick, true); };
  }, []);
  const [selected, setSelected] = useState(SHARE_INIT?.selected ?? "chl");
  const [vaxHpv, setVaxHpv] = useState(SHARE_INIT?.vaxHpv ?? false);
  const [vaxHbv, setVaxHbv] = useState(SHARE_INIT?.vaxHbv ?? false);
  const [stiCof, setStiCof] = useState(SHARE_INIT?.sti ?? false);
  const [acts, setActs] = useState(SHARE_INIT?.acts ?? { vagR: true, vagI: false, analR: false, analI: false, oralR: true, oralI: true, vagVV: false });
  const [activePreset, setActivePreset] = useState(SHARE_INIT ? (SHARE_INIT.preset ?? null) : null);
  const [tourStep, setTourStep] = useState(() => { if (!TOUR_ENABLED) return -1; try { return localStorage.getItem("tour_done") ? -1 : 0; } catch (e) { return -1; } });
  const [open, setOpen] = useState({});
  const [guideOpen, setGuideOpen] = useState({});
  const [contactOpen, setContactOpen] = useState(false);
  const [donateOpen, setDonateOpen] = useState(false);
  const [hivModal, setHivModal] = useState(false);   // опциональное окно-объяснение (по «Подробнее»)
  const [hivBanner, setHivBanner] = useState(false); // тонкий баннер над графиком
  const [hivFxTick, setHivFxTick] = useState(0);     // триггер анимации частиц + скролла
  const [hivFxDone, setHivFxDone] = useState(false); // все рибоны прилетели → показать «Подробнее»

  // Подсветить контрол на 20 c после «прилёта» рибона. cls: hl-ring (кольцо вокруг кнопки) или hl-thumb (свечение ручки слайдера).
  const flashTarget = (el, cls = "hl-ring") => {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth; // рестарт анимации, если класс уже был
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), HIV_FX.highlightHold);
  };

  // Сценарий «Риск ВИЧ» — ПОСЛЕДОВАТЕЛЬНЫЙ показ: по очереди докручиваем к каждому изменённому контролу,
  // пускаем ОДИН рибон к его конкретной настройке, подсвечиваем на 20 c, пауза — и следующий. По одному,
  // чтобы пользователь успевал проследить (и потому что под залипающим графиком соседний контрол может быть скрыт).
  const hivFxRun = useRef(0);
  const runHivFx = async () => {
    const myRun = ++hivFxRun.current;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const alive = () => hivFxRun.current === myRun && hivOpenRef.current; // прервать при закрытии плашки/перезапуске
    const src = document.querySelector('[data-hl="hivsrc"]'); // источник — кнопка/плашка «Риск ВИЧ»
    const center = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    // точка на ползунке, соответствующая его значению (для презерватива 0% — у левого края)
    const thumb = (inp) => { const r = inp.getBoundingClientRect(); const v = +inp.value, mn = +inp.min, mx = +inp.max; const f = mx > mn ? (v - mn) / (mx - mn) : 0; return { x: r.left + 8 + f * (r.width - 16), y: r.top + r.height / 2 }; };
    const envOut = document.querySelector('[data-hl="env"] [data-env="outbreak"]'); // целим в пилюлю «вспышка»
    const cof = document.querySelector('[data-hl="cofactor"]');
    const condWrap = document.querySelector('[data-tour="condom"]');
    const condInput = condWrap && condWrap.querySelector('input[type="range"]');
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // плавно опустить презерватив до 0 (если он ещё не 0) — НЕ скачком
    const animateCondom = (inp) => {
      const startVal = +inp.value; if (startVal <= 0) return;
      const dur = HIV_FX.condomDrop; let t0 = null; const ease = (k) => 1 - Math.pow(1 - k, 3);
      const step = (t) => {
        if (!alive()) return;
        if (t0 === null) t0 = t;
        const k = Math.min(1, (t - t0) / dur);
        setType("casual", { condom: Math.round(startVal * (1 - ease(k))) });
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    // hl — что подсветить (cls: hl-ring вокруг кнопки / hl-thumb свечение ручки); point() — куда рибон; apply() — что переключить по прилёте
    const targets = [
      envOut && { hl: envOut, cls: "hl-ring", point: () => center(envOut), apply: () => setEnv("outbreak") },
      cof && { hl: cof, cls: "hl-ring", point: () => center(cof), apply: () => setStiCof(true) },
      condInput && { hl: condWrap, cls: "hl-thumb", point: () => thumb(condInput), apply: () => animateCondom(condInput) }, // класс на обёртке (input React пере-рендерит и сбрасывает className)
    ].filter(Boolean);
    if (!src || !targets.length) return;

    // точка на границе прямоугольника rect в направлении toward (чтобы рибон стартовал от КРАЯ источника, не из-под текста)
    const edgePt = (rect, toward) => {
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      const dx = toward.x - cx, dy2 = toward.y - cy;
      if (!dx && !dy2) return { x: cx, y: cy };
      const s = Math.min(dx ? (rect.width / 2) / Math.abs(dx) : Infinity, dy2 ? (rect.height / 2) / Math.abs(dy2) : Infinity);
      return { x: cx + dx * s, y: cy + dy2 * s }; // на самой границе источника
    };
    // один рибон от источника к конкретной настройке; промис резолвится, когда долетел
    const fireOne = (tg, side) => new Promise((resolve) => {
      const to = tg.point();
      const from = edgePt(src.getBoundingClientRect(), to); // старт от края источника, не из-под текста
      const NS = "http://www.w3.org/2000/svg";
      document.querySelectorAll("svg[data-hivfx]").forEach((s) => s.remove());
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("data-hivfx", "1");
      svg.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:3000;overflow:visible";
      document.body.appendChild(svg);
      const safety = setTimeout(() => { svg.remove(); resolve(); }, 4000);
      const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
      const dx = to.x - from.x, dyy = to.y - from.y;
      const len = Math.hypot(dx, dyy) || 1;
      const bow = Math.min(130, len * 0.3) * side; // изгиб дуги, сторону чередуем
      const cx = mx + (-dyy / len) * bow, cy = my + (dx / len) * bow;
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "#ff5b5b");
      path.setAttribute("stroke-width", "3.5");
      path.setAttribute("stroke-linecap", "round");
      path.style.filter = "drop-shadow(0 0 5px rgba(255,91,91,.85))";
      svg.appendChild(path);
      const L = path.getTotalLength();
      path.style.strokeDasharray = L;
      path.style.strokeDashoffset = L;
      const draw = path.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: HIV_FX.ribbon, easing: "cubic-bezier(.45,0,.2,1)", fill: "forwards" });
      const done = () => {
        clearTimeout(safety);
        const fade = path.animate([{ opacity: 1 }, { opacity: 0 }], { duration: HIV_FX.ribbonFade, fill: "forwards" });
        const rm = () => svg.remove();
        fade.onfinish = rm; fade.oncancel = rm;
        resolve();
      };
      draw.onfinish = done; draw.oncancel = done;
    });

    // плавная докрутка с easing (мягче нативного smooth) — центрируем контрол; резолвится по завершении
    const smoothScrollToEl = (el, dur = 850) => new Promise((resolve) => {
      const r = el.getBoundingClientRect();
      const startY = window.scrollY;
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const targetY = Math.max(0, Math.min(maxY, startY + r.top - window.innerHeight / 2 + r.height / 2));
      const dist = targetY - startY;
      if (Math.abs(dist) < 2) { resolve(); return; }
      let t0 = null;
      const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2); // ease-in-out quad
      const step = (t) => {
        if (!alive()) { resolve(); return; }
        if (t0 === null) t0 = t;
        const k = Math.min(1, (t - t0) / dur);
        window.scrollTo(0, startY + dist * ease(k));
        if (k < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });

    await wait(reduce ? 0 : HIV_FX.intro); // дать пресету примениться/карточкам раскрыться
    for (let i = 0; i < targets.length; i++) {
      if (!alive()) return;
      const tg = targets[i];
      if (reduce) tg.hl.scrollIntoView({ block: "center" });
      else await smoothScrollToEl(tg.hl, HIV_FX.scroll); // плавная докрутка к контролу (ждём завершения)
      await wait(reduce ? 0 : HIV_FX.afterScroll);       // короткая пауза после докрутки
      if (!alive()) return;
      if (!reduce) await fireOne(tg, i % 2 ? -1 : 1);    // один рибон, ждём прилёта
      if (!alive()) return;
      tg.apply();                            // переключаем контрол ТОЛЬКО после прилёта рибона
      flashTarget(tg.hl, tg.cls);            // и подсвечиваем (кольцо/ручка)
      await wait(reduce ? 300 : HIV_FX.betweenSteps); // пауза перед следующим
    }
    if (alive()) setHivFxDone(true); // все рибоны прилетели — показать «Подробнее» (всё выставлено)
  };

  useEffect(() => {
    if (!hivFxTick) return;
    const id = setTimeout(runHivFx, 360); // дождаться применения пресета и перерисовки DOM
    return () => clearTimeout(id);
  }, [hivFxTick]);

  // Плашка открыта? — зеркало hivBanner в ref, чтобы runHivFx (замыкание) мог проверять актуальность (alive).
  const hivOpenRef = useRef(false);
  useEffect(() => { hivOpenRef.current = hivBanner; }, [hivBanner]);
  // Полностью остановить сценарий «Риск ВИЧ»: прервать последовательность, убрать рибоны и все подсветки.
  const stopHivFx = () => {
    hivFxRun.current++; // инвалидируем текущий прогон → alive() станет false, анимация остановится
    document.querySelectorAll("svg[data-hivfx]").forEach((s) => s.remove());
    document.querySelectorAll(".hl-ring, .hl-thumb").forEach((e) => e.classList.remove("hl-ring", "hl-thumb"));
  };
  const closeHivPlate = () => { setHivBanner(false); stopHivFx(); }; // закрытие плашки = стоп всей анимации
  const condensed = useCondensed(); // мобильное сжатие графика при прокрутке (общий хук с графиком беременности)
  const [diseaseHintRef, diseaseHint] = useHintOnView(); // разовая подсказка на шевроне первой болезни
  const [mode, setMode] = useState(MODE_FROM_URL);
  // Переключение раздела отражаем в адресной строке: беременность → «#preg» (ссылку можно слать отдельно), ЗППП → чистый URL.
  const switchMode = (m) => {
    setMode(m);
    try {
      const base = window.location.href.split("#")[0].split("?")[0];
      window.history.replaceState(null, "", m === "preg" ? base + "#preg" : base);
    } catch {}
  };
  const [pregWho, setPregWho] = useState(SHARE_INIT?.who ?? "woman");
  // Состояние беременности поднято в App — чтобы «Поделиться» сериализовал и его.
  const [w, setW] = useState(() => SHARE_INIT?.w ?? { age: 26, perWeek: 3 });
  const [meth, setMeth] = useState(() => SHARE_INIT?.meth ?? { condom_m: 100 });
  const [mcfg, setMcfg] = useState(() => mergeTypes(mkPregCfg(PREG_PRESETS.find((p) => p.key === "dating")), SHARE_INIT && SHARE_INIT.mcfg));
  const [manAge, setManAge] = useState(SHARE_INIT?.manAge ?? 28);
  const [activePreg, setActivePreg] = useState(SHARE_INIT ? (SHARE_INIT.preg ?? null) : "dating");
  C = mode === "preg" ? CP : CS;
  PREG = C.accent;

  const actSel = useMemo(() => actSelOf(acts), [acts]);
  const actKeys = useMemo(() => ACT_KEYS.filter((k) => acts[k]), [acts]);

  // Снимок всех настроек для ссылки «Поделиться» (актуален на момент клика).
  const snapshot = () => ({ v: 1, lang, mode, who: pregWho, cfg, years, yMax, hidden, env, selected, vaxHpv, vaxHbv, sti: stiCof, acts, preset: activePreset, w, meth, mcfg, manAge, preg: activePreg });

  // Всплывашки .box у кнопок «i»: position:fixed + зажим в границы экрана.
  // Fixed не расширяет документ, поэтому всплывашка не порождает скролл и не вылезает за край.
  useEffect(() => {
    const place = (e) => {
      const src = e.target && e.target.closest && e.target.closest(".src");
      if (!src) return;
      const box = src.querySelector(".box"); if (!box) return;
      const m = 8;
      const ir = src.getBoundingClientRect();
      const bw = box.offsetWidth, bh = box.offsetHeight; // box уже display:block (hover/focus)
      box.style.position = "fixed";
      box.style.right = "auto"; box.style.bottom = "auto";
      // предварительно ставим над иконкой, выровняв правый край — без скачка из угла
      box.style.left = Math.max(m, ir.right - bw) + "px";
      box.style.top = Math.max(m, ir.top - bh - 6) + "px";
      requestAnimationFrame(() => {
        const vw = window.innerWidth, vh = window.innerHeight;
        const r = src.getBoundingClientRect();
        const w = box.offsetWidth, h = box.offsetHeight;
        const left = Math.max(m, Math.min(r.right - w, vw - w - m));
        let top = r.top - h - 6;            // по умолчанию над иконкой
        if (top < m) top = r.bottom + 6;    // не влезает сверху — под иконку
        top = Math.max(m, Math.min(top, vh - h - m));
        box.style.left = left + "px";
        box.style.top = top + "px";
      });
    };
    document.addEventListener("mouseover", place);
    document.addEventListener("focusin", place);
    return () => { document.removeEventListener("mouseover", place); document.removeEventListener("focusin", place); };
  }, []);

  const horizonM = years * 12;
  const setType = (key, patch) => { setCfg((c) => ({ ...c, [key]: { ...c[key], ...patch } })); setActivePreset(null); };
  const applyPreset = (pr) => { setCfg(mkCfg(pr)); setActivePreset(pr.key); };
  // «Риск ВИЧ»: сценарий максимального риска ВИЧ — вспышка + нелеченые ЗППП + без презерватива,
  // показана только кривая ВИЧ. Открывает окно с объяснением и подсветкой изменённых параметров.
  const applyHivRisk = () => {
    // casual-пресет, но СОХРАНЯЕМ текущий презерватив — его опустим ПЛАВНО по прилёте рибона
    setCfg((c) => ({ ...DEFAULT_CFG, casual: { ...DEFAULT_CFG.casual, condom: c.casual.condom } }));
    setHidden({ hpv: true, hbv: true, hcv: true, syp: true, gon: true, chl: true, tri: true });
    setSelected("hiv");
    setActivePreset(null);
    setHivBanner(true);
    setHivFxDone(false);          // «Подробнее» появится только в конце, после всех рибонов
    setHivFxTick((n) => n + 1);
    // env, «нелеченые ЗППП» и презерватив НЕ трогаем здесь — они переключаются по очереди
    // в runHivFx, каждый только когда до него долетит свой рибон (см. ниже).
  };
  const toggle = (k) => setHidden((h) => ({ ...h, [k]: !h[k] }));

  const riskPct = (s, t) => (1 - survivalAt(withEnv(s, env), t, cfg, cofMulOf(s, stiCof), actSel, vaccVeOf(s, vaxHpv, vaxHbv))) * 100;

  const chartData = useMemo(() => {
    const st = Math.max(1, Math.ceil(horizonM / 170));
    const pts = [];
    for (let t = 0; t <= horizonM; t += st) {
      const row = { t };
      STIS.forEach((s) => {
        const sv = survivalAt(withEnv(s, env), t, cfg, cofMulOf(s, stiCof), actSel, vaccVeOf(s, vaxHpv, vaxHbv));
        row[s.key] = (1 - sv) * 100;
      });
      pts.push(row);
    }
    return pts;
  }, [cfg, years, vaxHpv, vaxHbv, stiCof, actSel, env]);

  const built = useMemo(() => buildPartnersTyped(cfg, horizonM), [cfg, horizonM]);
  const packed = useMemo(() => packLanes(built.list), [built]);
  const avgWeek = cfg.steady.count * cfg.steady.perWeek + cfg.casual.count * cfg.casual.dur / 12 * cfg.casual.perWeek + cfg.hookup.count / 52;

  const ts = years <= 12 ? 1 : years <= 30 ? 5 : 10;
  const ticks = []; for (let y = 0; y <= years; y += ts) ticks.push(y * 12);
  const top = [...STIS].filter((s) => !hidden[s.key]).sort((a, b) => riskPct(b, horizonM) - riskPct(a, horizonM))[0];
  const selSti = STIS.find((x) => x.key === selected);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.hi, fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif", padding: "28px 18px 48px" }}>
      <style>{`
        .rng { -webkit-appearance:none; appearance:none; width:100%; height:4px; border-radius:4px; background:${C.border}; outline:none; }
        .rng::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:18px; height:18px; border-radius:50%; background:${C.accent}; cursor:grab; border:3px solid ${C.bg}; box-shadow:0 0 0 1px ${C.accent}; }
        .rng::-webkit-slider-thumb:active { cursor:grabbing; }
        .rng::-moz-range-thumb { width:18px; height:18px; border-radius:50%; background:${C.accent}; cursor:grab; border:3px solid ${C.bg}; }
        /* Слайдеры настроек отображения графика — другая форма/цвет/размер, чтобы отличались от поведенческих */
        .rng-mini { height:3px; background:${C.border}; }
        .rng-mini::-webkit-slider-thumb { width:10px; height:18px; border-radius:3px; background:${C.mid}; border:2px solid ${C.bg}; box-shadow:0 0 0 1px ${C.border}; }
        .rng-mini::-moz-range-thumb { width:10px; height:18px; border-radius:3px; background:${C.mid}; border:2px solid ${C.bg}; box-shadow:0 0 0 1px ${C.border}; }
        .rng-mini::-webkit-slider-thumb:hover, .rng-mini::-webkit-slider-thumb:active { background:${C.hi}; }
        .rng-mini::-moz-range-thumb:hover { background:${C.hi}; }
        summary { cursor:pointer; }
        .tbl-wrap { overflow-x:auto; }
        table.inf { border-collapse:collapse; width:100%; min-width:760px; font-size:13px; }
        table.inf th, table.inf td { text-align:left; padding:10px 12px; border-bottom:1px solid ${C.border}; vertical-align:middle; }
        table.inf th { color:${C.dim}; font-weight:500; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; }
        .num { font-variant-numeric:tabular-nums; }
        .chk { width:17px; height:17px; cursor:pointer; }
        .studio { display:grid; grid-template-columns:1fr; gap:14px; align-items:start; margin-bottom:14px; }
        .studio-chart { position:sticky; top:0; z-index:5; order:-1; box-shadow:0 8px 16px -6px rgba(0,0,0,.55); }
        .chart-extra { overflow:hidden; max-height:260px; transition:max-height .35s ease, opacity .25s ease, margin .35s ease; }
        .studio-chart.condensed .chart-extra { max-height:0; opacity:0; margin-top:0 !important; margin-bottom:0 !important; pointer-events:none; }
        .chartbox { height:150px; }
        @media (min-width:880px) {
          .studio { grid-template-columns:360px minmax(0,1fr); }
          .studio-controls { grid-column:1; grid-row:1; }
          .studio-chart { grid-column:2; grid-row:1; top:16px; order:0; box-shadow:none; }
          .chartbox { height:380px; }
        }
        .src { position:relative; display:inline-flex; align-items:center; gap:5px; cursor:help; }
        .src .ic { width:12px; height:12px; border-radius:50%; border:1px solid ${C.dim}; color:${C.dim}; font-size:9px; line-height:1; display:inline-flex; align-items:center; justify-content:center; opacity:.85; }
        .src .box { display:none; position:absolute; right:0; bottom:140%; width:280px; max-width:calc(100vw - 16px); white-space:normal; word-break:break-word; background:${C.panel2}; border:1px solid ${C.border}; border-radius:8px; padding:10px 12px; font-size:12px; line-height:1.5; color:${C.mid}; z-index:20; box-shadow:0 8px 24px rgba(0,0,0,.4); text-transform:none; letter-spacing:0; font-weight:400; text-align:left; }
        .src:hover .box, .src:focus-within .box { display:block; }
        .src.dn .box { top:150%; bottom:auto; }
        .pill { background:${C.panel2}; border:1px solid ${C.border}; color:${C.mid}; padding:6px 12px; border-radius:999px; font-size:12px; cursor:pointer; }
        .pill.on { background:${C.accent}; color:${C.bg}; border-color:${C.accent}; font-weight:600; }
        .ghd { color:${C.dim}; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:5px; }
        .gtx { color:${C.mid}; font-size:12.5px; line-height:1.55; }
        table.inf tbody tr.inf-row { cursor:pointer; transition:background .12s; }
        table.inf tbody tr.inf-row:hover { background:#ffffff0a; }
        table.inf tbody tr.inf-row.on { background:#ffffff12; }
        table.inf tbody tr.inf-row.on:hover { background:#ffffff16; }
        /* лёгкая подсказка «можно раскрыть» — мягкое пульсирующее кольцо на шевроне (5 c, 4 удара) */
        @keyframes hintRing {
          0%   { box-shadow:0 0 0 0 var(--hint-glow, rgba(240,165,0,.6)); transform:scale(1); }
          70%  { box-shadow:0 0 0 7px rgba(255,255,255,0); transform:scale(1.16); }
          100% { box-shadow:0 0 0 7px rgba(255,255,255,0); transform:scale(1); }
        }
        .hint-pulse { animation:hintRing 1.25s ease-out 4; will-change:transform, box-shadow; }
        @media (prefers-reduced-motion: reduce) { .hint-pulse { animation:none; } }
        .leg-item { transition:background .12s, border-color .12s; }
        .leg-item:hover { background:#ffffff0d; border-color:${C.mid} !important; }
        .rich [data-hi] { color:${C.hi}; }
        .rich [data-grn] { color:#4dd4ac; }
        .rich [data-red] { color:#ff7b73; }
        [data-f] { font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace; color:#8fd0e6; font-size:0.93em; letter-spacing:0.1px; }
        /* В тултипах формула — отдельный блок (свой «колодец»), а не вперемешку с текстом. */
        .box [data-f] { display:block; margin:7px 0; padding:6px 9px; background:${C.bg}; border-radius:6px; line-height:1.6; white-space:normal; overflow-wrap:anywhere; }
        .box [data-f]:first-child { margin-top:1px; }
        .box [data-f]:last-child { margin-bottom:1px; }
        /* шаг иерархической формулы: подпись вплотную к своей формуле, шаги — с отступом друг от друга */
        .box .fstep { margin-top:8px; }
        .box .fstep > [data-f] { margin:2px 0 0; }
        button { transition: background-color .16s ease, border-color .16s ease, color .16s ease, opacity .16s ease, box-shadow .16s ease; }
        button:active { transform: scale(0.97); }
        .rng::-webkit-slider-thumb { transition: transform .12s ease, box-shadow .16s ease; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:none; } }
        .fade-in { animation: fadeIn .42s ease both; }
        @keyframes fadeSoft { from { opacity:0; } to { opacity:1; } }
        .fade-soft { animation: fadeSoft .45s ease both; }
        .tour-hole { transition: x .42s ease, y .42s ease, width .42s ease, height .42s ease; }
        @keyframes hivpulse { 0%,100% { box-shadow:0 0 0 0 rgba(255,91,91,0); } 50% { box-shadow:0 0 0 4px rgba(255,91,91,0.22); } }
        /* кнопка «Риск ВИЧ» — красная пилюля на строке среды, справа */
        .hiv-btn-pill { background:#ff5b5b; color:#fff; border:none; border-radius:999px; padding:6px 14px; font-size:12.5px; font-weight:700; cursor:pointer; white-space:nowrap; animation: hivpulse 2.1s ease-in-out infinite; }
        .hiv-btn-pill:hover { filter:brightness(1.08); }
        /* инфо-плашка (красная, в стиле дисклеймера) — отдельной строкой по центру; въезжает по диагонали от кнопки (сверху-справа) */
        @keyframes plateInD { from { opacity:0; transform: translate(34px,-10px) scale(.95); } to { opacity:1; transform:none; } }
        .hiv-plate-card { display:inline-flex; align-items:center; gap:7px; background:#ff5b5b1a; border:1px solid #ff5b5b; border-radius:10px; padding:6px 10px; max-width:100%; animation: plateInD .42s cubic-bezier(.2,.7,.3,1) both; }
        /* «Подробнее» появляется в конце (после всех рибонов) — только мягкий въезд, без мигания */
        @keyframes moreIn { from { opacity:0; transform: translateX(-8px); } to { opacity:1; transform:none; } }
        .more-cta { animation: moreIn .35s ease both; }
        .hiv-bang { display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; border-radius:50%; background:#ff5b5b; color:#fff; font-size:11px; font-weight:800; line-height:1; flex:0 0 auto; }
        /* подсветка контрола после «прилёта» рибона из кнопки «Риск ВИЧ» — мягкая пульсация ~10 c (класс снимает JS) */
        @keyframes hlpulse { 0%,100% { box-shadow:0 0 0 0 rgba(255,91,91,0); } 50% { box-shadow:0 0 0 5px rgba(255,91,91,.55); } }
        .hl-ring { border-radius:10px; animation: hlpulse 1.5s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .hl-ring { animation:none; box-shadow:0 0 0 3px rgba(255,91,91,.5); } }
        /* для слайдера подсвечиваем САМУ РУЧКУ (не всю строку — иначе кольцо пересекает соседние элементы) */
        @keyframes thumbglow { 0%,100% { box-shadow:0 0 0 1px ${C.accent}, 0 0 0 2px rgba(255,91,91,0); } 50% { box-shadow:0 0 0 1px ${C.accent}, 0 0 0 7px rgba(255,91,91,.5); } }
        .hl-thumb .rng::-webkit-slider-thumb { animation: thumbglow 1.4s ease-in-out infinite; }
        .hl-thumb .rng::-moz-range-thumb { box-shadow:0 0 0 6px rgba(255,91,91,.45); animation: thumbglow 1.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .hl-thumb .rng::-webkit-slider-thumb { animation:none; box-shadow:0 0 0 1px ${C.accent}, 0 0 0 5px rgba(255,91,91,.5); } }
      `}</style>

      <div style={{ maxWidth: 940, margin: "0 auto", position: "relative" }}>
        {TOUR_ENABLED && mode === "sti" && <Tour step={tourStep} setStep={setTourStep} L={L} />}
        <LangSwitch lang={lang} setLang={setLang} />
        <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          <button onClick={() => switchMode("sti")} style={SEG(mode === "sti")}>{L.modeSti}</button>
          <button onClick={() => switchMode("preg")} style={SEG(mode === "preg")}>{L.modePreg}</button>
        </div>

        <div style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, margin: 0 }}>{mode === "sti" ? L.title : L.pregTitle}</h1>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
              {TOUR_ENABLED && mode === "sti" && <button onClick={() => setTourStep(0)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.mid, borderRadius: 8, padding: "7px 12px", fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>👋 {L.tourStart}</button>}
              <ShareButton snapshot={snapshot} L={L} />
            </div>
          </div>
          {(mode === "sti" ? L.intro : L.pregIntro) && <p style={{ color: C.mid, fontSize: 14, margin: 0, lineHeight: 1.5 }}>{mode === "sti" ? L.intro : L.pregIntro}</p>}
        </div>

        <div style={{ background: `${C.accent}1a`, border: `1px solid ${C.accent}`, borderRadius: 12, padding: "14px 16px", marginBottom: 18, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ flex: "0 0 24px", width: 24, height: 24, borderRadius: "50%", background: C.accent, color: C.bg, fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>!</span>
          <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.55 }}><b style={{ color: C.hi }}>{mode === "sti" ? L.warnTitle : L.pregWarnTitle}</b> {mode === "sti" ? L.warnBody : L.pregWarnBody}</div>
        </div>

        {mode === "sti" && (<>
        <div className="studio">
          <div className="studio-controls">
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.6, display: "inline-flex", alignItems: "center" }}>{L.preset}<Info text={L.presetInfo} /></div>
              <div data-tour="presets" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {PRESETS.map((pr) => (<button key={pr.key} onClick={() => applyPreset(pr)} className={"pill " + (activePreset === pr.key ? "on" : "")}>{pr.label[lang]}</button>))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
                {TYPES.map((meta) => (<TypeCard key={meta.key} meta={meta} t={cfg[meta.key]} setT={(patch) => setType(meta.key, patch)} open={!!open[meta.key]} toggleOpen={() => setOpen((o) => ({ ...o, [meta.key]: !o[meta.key] }))} lang={lang} L={L} />))}
              </div>
            </div>

            <div data-tour="acts" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 18px" }}>
              <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10, display: "inline-flex", alignItems: "center" }}>{L.sexActs}<Info text={L.sexActsInfo} /></div>
              <SexActs acts={acts} setActs={setActs} lang={lang} />
              {actSel.length === 0 && <div style={{ color: "#ff922b", fontSize: 12, marginTop: 10 }}>{L.noActs}</div>}

              <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 0.6, margin: "16px 0 10px" }}>{L.protection}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {[{ k: "hpv", on: vaxHpv, set: setVaxHpv, lab: L.vaxHpv }, { k: "hbv", on: vaxHbv, set: setVaxHbv, lab: L.vaxHbv }].map((v) => (
                  <button key={v.k} onClick={() => v.set((x) => !x)} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: v.on ? `${C.accent}22` : "transparent", border: `1px solid ${v.on ? C.accent : C.border}`, color: v.on ? C.hi : C.mid, padding: "8px 13px", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
                    <span style={{ width: 16, height: 16, borderRadius: 4, border: `1px solid ${v.on ? C.accent : C.dim}`, background: v.on ? C.accent : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", color: C.bg, fontSize: 11, fontWeight: 700 }}>{v.on ? "✓" : ""}</span><span style={{ whiteSpace: "nowrap" }}>{v.lab}<span style={{ fontWeight: 700, marginLeft: 4 }}>↑</span></span>
                  </button>
                ))}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <button data-hl="cofactor" onClick={() => setStiCof((x) => !x)} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: stiCof ? "#cf667922" : "transparent", border: `1px solid ${stiCof ? "#cf6679" : C.border}`, color: stiCof ? C.hi : C.mid, padding: "8px 13px", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
                    <span style={{ width: 16, height: 16, borderRadius: 4, border: `1px solid ${stiCof ? "#cf6679" : C.dim}`, background: stiCof ? "#cf6679" : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", color: C.bg, fontSize: 11, fontWeight: 700 }}>{stiCof ? "✓" : ""}</span><span style={{ whiteSpace: "nowrap" }}>{L.stiCof}<span style={{ fontWeight: 700, marginLeft: 4 }}>↓</span></span>
                  </button>
                  <Info text={L.stiCofInfo} />
                </span>
              </div>
            </div>
          </div>

          <div className={"studio-chart" + (condensed ? " condensed" : "")} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 16px 12px" }}>
            <div className="chart-extra" style={{ display: "flex", gap: 26, flexWrap: "wrap", marginBottom: 16 }}>
              <Slider label={L.horizon} value={years} set={setYears} min={1} max={50} step={1} valueText={`${years} ${yearsWord(years, lang)}`} hint={L.horizonHint} subtle />
              <Slider label={L.scale} value={yMax} set={setYMax} min={1} max={100} step={1} valueText={DEV ? `${lang === "en" ? "to" : lang === "sr" ? "do" : "до"} ${yMax}%` : ""} hint={L.scaleHint} subtle />
            </div>
            <div className="chart-extra" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              {STIS.map((s) => { const off = hidden[s.key]; return (
                <span key={s.key} className="leg-item" onClick={() => toggle(s.key)} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: off ? C.dim : C.mid, cursor: "pointer", userSelect: "none", padding: "2px 8px", borderRadius: 6, border: `1px solid ${C.border}`, opacity: off ? 0.5 : 1 }}>
                  <span style={{ width: 14, height: 0, borderTop: `3px ${s.grounded ? "solid" : "dashed"} ${off ? C.dim : s.color}`, display: "inline-block" }} />{s.label[lang]}
                </span>
              ); })}
            </div>
            <div className="chartbox" data-tour="chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: DEV ? 0 : 8 }}>
                  {DEV && <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />}
                  <XAxis dataKey="t" type="number" domain={[0, horizonM]} ticks={ticks} interval={0} stroke={C.dim} tick={{ fontSize: 12, fill: C.dim }} tickFormatter={(t) => (t === 0 ? "0" : `${t / 12}${L.yrAxis}`)} />
                  {DEV
                    ? <YAxis domain={[0, yMax]} allowDataOverflow stroke={C.dim} tick={{ fontSize: 12, fill: C.dim }} tickFormatter={(v) => `${v}%`} width={46} />
                    : <YAxis hide domain={[0, yMax]} allowDataOverflow />}
                  <Tooltip content={(p) => <ChartTooltip {...p} hidden={hidden} lang={lang} L={L} />} />
                  {STIS.map((s) => (hidden[s.key] ? null : <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2.2} dot={false} strokeDasharray={s.grounded ? "0" : "6 4"} isAnimationActive={chartAnim} animationDuration={320} animationEasing="ease" />))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
              <div className="chart-extra" style={{ color: C.mid, fontSize: 13 }}>{top ? (<>{L.topRiskLine(years, yearsWord(years, lang), top.label[lang], top.color)}{DEV && <> — <b style={{ color: C.hi }}>{pctVal(riskPct(top, horizonM), lang)}</b></>}</>) : L.enableOne}</div>
              <div data-tour="env" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", flexBasis: "100%" }}>
                <span data-hl="env" style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap", borderRadius: 8, padding: 2 }}>
                  <span style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5, marginRight: 2 }}>{L.envLabel}</span>
                  {[["normal", L.envNormal], ["high", L.envHigh], ["outbreak", L.envOutbreak]].map(([k, lab]) => (
                    <button key={k} data-env={k} className={"pill " + (env === k ? "on" : "")} onClick={() => setEnv(k)}>{lab}</button>
                  ))}
                  <Info text={L.envInfo} />
                </span>
                {/* кнопка «Риск ВИЧ» — на строке среды, справа. При нажатии прячется, а ниже по центру выезжает плашка. */}
                {!hivBanner && (
                  <button data-hl="hivsrc" className="hiv-btn-pill" onClick={applyHivRisk} style={{ marginLeft: "auto", flexShrink: 0 }}>{L.hivBtn}</button>
                )}
              </div>
            </div>
            {/* инфо-плашка: отдельной строкой ПО ЦЕНТРУ, плавно разворачивающаяся высота (grid) + диагональный въезд */}
            <div style={{ display: "grid", gridTemplateRows: hivBanner ? "1fr" : "0fr", transition: "grid-template-rows .4s ease, margin-top .4s ease", marginTop: hivBanner ? 8 : 0 }}>
              <div style={{ overflow: "hidden", minHeight: 0, display: "flex", justifyContent: "flex-start" }}>
                {hivBanner && (
                  <span data-hl="hivsrc" className="hiv-plate-card">
                    <span className="hiv-bang" aria-hidden>!</span>
                    <span style={{ color: C.hi, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{L.hivBannerText}</span>
                    {hivFxDone && <button className="more-cta" onClick={() => setHivModal(true)} style={{ background: "transparent", border: "none", color: "#ff9a9a", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "2px 4px", whiteSpace: "nowrap", animationDuration: HIV_FX.moreFade + "ms" }}>{L.hivBannerMore} ▸</button>}
                    <button onClick={closeHivPlate} aria-label={L.contactClose} style={{ background: "transparent", border: "none", color: C.dim, fontSize: 16, lineHeight: 1, cursor: "pointer", padding: "0 4px" }}>×</button>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 18px 14px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{L.structTitle}</h2>
            <div className="rich" style={{ fontSize: 12, color: C.mid }}>{L.structStats(dec(avgWeek.toFixed(1), lang), packed.lanes, built.total)}</div>
          </div>
          <p style={{ color: C.dim, fontSize: 12, margin: "0 0 14px", lineHeight: 1.5 }}>
            <span style={{ color: "#f0a500" }}>● {L.legSteady}</span> · <span style={{ color: "#2ec4b6" }}>● {L.legCasual}</span> · <span style={{ color: "#4dabf7" }}>● {L.legHookup}</span>{L.structLegendTail}
          </p>
          {packed.list.length === 0 ? <div style={{ color: C.mid, fontSize: 13, padding: "20px 0", textAlign: "center" }}>{L.noPartners}</div> : <><Timeline packed={packed} horizonM={horizonM} years={years} lang={lang} />{built.total > packed.list.length && <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>{L.shownPart(built.total)}</div>}</>}
        </div>

        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "6px 6px", marginBottom: 14 }}>
          <div className="tbl-wrap">
            <table className="inf">
              <thead><tr><th>{L.thInfection}</th>{DEV && <th>{L.thRisk(years, yearsWord(years, lang))}</th>}<th>{L.thPerAct}</th><th>{L.thTreatment}</th><th>{L.thConsequences}</th></tr></thead>
              <tbody>
                {STIS.flatMap((s, si) => {
                  const exp = !!guideOpen[s.key];
                  const accLab = L.acc[s.acc];
                  const rows = [
                  <tr key={s.key} className={"inf-row" + ((selected === s.key || exp) ? " on" : "")} onClick={() => { setSelected(s.key); setGuideOpen((g) => ({ ...g, [s.key]: !g[s.key] })); }} title={exp ? L.collapseGuide : L.openGuide} style={{ borderLeft: `3px solid ${SEV[s.sev]}`, opacity: hidden[s.key] ? 0.45 : 1 }}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span style={{ color: s.color, marginRight: 7 }}>{s.grounded ? "●" : "◌"}</span>{s.label[lang]}
                      {((s.key === "hpv" && vaxHpv) || (s.key === "hbv" && vaxHbv)) && <span title={s.vax.note[lang]} style={{ marginLeft: 8, fontSize: 11, color: "#38d9a9", background: "#38d9a922", border: "1px solid #38d9a955", padding: "1px 7px", borderRadius: 6 }}>{L.vaccinated}</span>}
                      <span aria-hidden ref={si === 0 ? diseaseHintRef : undefined} className={si === 0 && diseaseHint && !exp ? "hint-pulse" : undefined} style={{ marginLeft: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: 5, background: exp ? `${s.color}22` : C.panel2, border: `1px solid ${exp ? s.color : C.border}`, color: exp ? s.color : C.mid, fontSize: 11, verticalAlign: "middle", ["--hint-glow"]: `${s.color}aa` }}>{exp ? "▾" : "▸"}</span>
                    </td>
                    {DEV && <td className="num" style={{ color: C.hi, fontWeight: 600 }}>{pctVal(riskPct(s, horizonM), lang)}</td>}
                    <td className="num" style={{ color: C.mid, whiteSpace: "nowrap" }}>{pctAct(1 - encSurvOf(s, actSel, 1), lang)} <span style={{ color: C.dim }}>→</span> {pctAct(1 - encSurvOf(s, actSel, 1 - s.e), lang)}</td>
                    <td><span style={{ background: `${SEV[s.sev]}22`, color: SEV[s.sev], padding: "3px 8px", borderRadius: 6, fontSize: 12, fontWeight: 500, display: "inline-block" }}>{s.treat[lang]}</span></td>
                    <td style={{ color: C.mid, fontSize: 12.5 }}>{s.cons[lang]}</td>
                  </tr>,
                  ];
                  rows.push(
                    <tr key={s.key + "-g"} style={{ borderLeft: `3px solid ${s.color}` }}>
                      <td colSpan={DEV ? 5 : 4} style={{ background: C.panel2, padding: 0, borderBottom: "none" }}>
                       <Collapse open={exp} style={{ position: "sticky", left: 0, width: "calc(100vw - 84px)", maxWidth: 860, boxSizing: "border-box" }}>
                       <div style={{ padding: "14px 16px" }}>
                        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                          <div><div className="ghd">{L.sympt}</div><div className="gtx">{s.guide.symptoms[lang]}</div></div>
                          <div><div className="ghd">{L.treatm}</div><div className="gtx">{s.guide.treatment[lang]}</div></div>
                          <div><div className="ghd">{L.conseq}</div><div className="gtx">{s.guide.consequences[lang]}</div></div>
                          {s.guide.prevent && <div><div className="ghd">{L.prevent}</div><div className="gtx">{s.guide.prevent[lang]}</div></div>}
                        </div>
                        {ENV[s.key] && (
                          <div style={{ marginTop: 14 }}>
                            <div className="ghd">{L.envGuideLabel}</div>
                            {DEV && (
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "7px 0 9px" }}>
                                {[[L.envNormal, 1], [L.envHigh, ENV[s.key].high], [L.envOutbreak, ENV[s.key].out]].map(([lab, mul], i) => (
                                  <span key={i} style={{ display: "inline-flex", alignItems: "baseline", gap: 6, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 10px" }}>
                                    <span style={{ fontSize: 11, color: C.dim }}>{lab}</span>
                                    <span className="num" style={{ fontSize: 12.5, color: C.mid }}>×{dec(String(mul), lang)}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className="gtx" style={{ marginTop: 7 }}>{ENV[s.key].note[lang]}</div>
                          </div>
                        )}
                        <div style={{ marginTop: 12, fontSize: 12, color: C.dim }}>{L.sourcesLab}: {s.guide.sources.map((src, i) => (<span key={i}>{i > 0 ? " · " : ""}<a href={src.url} target="_blank" rel="noopener noreferrer" style={{ color: s.color, textDecoration: "none" }}>{typeof src.label === "string" ? src.label : src.label[lang]} ↗</a></span>))} {L.guideTail}</div>
                       </div>
                       </Collapse>
                      </td>
                    </tr>
                  );
                  return rows;
                })}
              </tbody>
            </table>
          </div>
        </div>

        <details style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 14 }}>
          <summary style={{ color: C.hi, fontSize: 15, fontWeight: 600 }}>{L.breakdownTitle}</summary>
          {L.breakdownIntro && <p style={{ color: C.mid, fontSize: 13, lineHeight: 1.6, margin: "12px 0 12px" }}>{L.breakdownIntro}</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14, marginBottom: 16 }}>
            {STIS.map((s) => (<button key={s.key} onClick={() => setSelected(s.key)} style={{ border: `1px solid ${selected === s.key ? s.color : C.border}`, background: selected === s.key ? `${s.color}22` : "transparent", color: selected === s.key ? C.hi : C.mid, padding: "6px 12px", borderRadius: 999, fontSize: 12.5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ color: s.color }}>●</span>{s.label[lang]}</button>))}
          </div>
          <Breakdown s={withEnv(selSti, env)} envMul={envMulOf(selSti, env)} cfg={cfg} years={years} veMul={cofMulOf(selSti, stiCof)} vaccVe={vaccVeOf(selSti, vaxHpv, vaxHbv)} actSel={actSel} actKeys={actKeys} lang={lang} L={L} />
        </details>

        <details style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 14 }}>
          <summary style={{ color: C.hi, fontSize: 15, fontWeight: 600 }}>{L.assumTitle}</summary>
          <div className="rich" style={{ color: C.mid, fontSize: 13, lineHeight: 1.6, marginTop: 14 }}>
            {[L.assumP1, L.assumP2, L.assumPEnv, L.assumP3, L.assumCof, L.assumVacc, L.assumP4, L.assumP6].map((a, i) => (
              <div key={i} style={{ borderLeft: `2px solid ${C.border}`, paddingLeft: 12, marginBottom: 13 }}>{a}</div>
            ))}
            <div style={{ fontSize: 12, color: C.dim }}>{L.assumSources}</div>
          </div>
        </details>
        </>)}

        {mode === "preg" && <Pregnancy who={pregWho} setWho={setPregWho} years={years} setYears={setYears} yMax={yMax} setYMax={setYMax} lang={lang} L={L} w={w} setW={setW} meth={meth} setMeth={setMeth} mcfg={mcfg} setMcfg={setMcfg} manAge={manAge} setManAge={setManAge} activePreg={activePreg} setActivePreg={setActivePreg} />}

        {/* Донат: «почему» (надпись) видна сразу, без клика; платформы — в поповере по «Поддержать». Скрыто за флагом DONATE_ENABLED. */}
        {DONATE_ENABLED && <p style={{ fontSize: 12.5, textAlign: "center", margin: "12px 0 0", display: "flex", justifyContent: "center", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ position: "relative", display: "inline-block" }}>
            <button onClick={() => setDonateOpen((v) => !v)} style={{ background: "transparent", border: "none", color: C.accent, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 0, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span aria-hidden style={{ fontSize: 13 }}>♥</span>{L.donateCta}
            </button>
            {donateOpen && <DonatePopover L={L} onClose={() => setDonateOpen(false)} />}
          </span>
          <span style={{ color: C.dim }}>{L.donateWhy}</span>
        </p>}
        <p style={{ color: C.dim, fontSize: 12, textAlign: "center", margin: "10px 0 0" }}>{L.footerFree}</p>
        <p style={{ color: C.dim, fontSize: 12, textAlign: "center", margin: "4px 0 0", display: "flex", justifyContent: "center", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <a href="https://github.com/UserNameIsAlredyTaken/safesex" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "none" }}>{L.footerSource}</a>
          <span style={{ color: C.border }}>|</span>
          <span style={{ position: "relative", display: "inline-block" }}>
            <button onClick={() => setContactOpen((v) => !v)} style={{ background: "transparent", border: "none", color: C.mid, fontSize: 12, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>{L.footerContactLink}</button>
            {contactOpen && <ContactPopover L={L} onClose={() => setContactOpen(false)} />}
          </span>
        </p>
      </div>
      {hivModal && <HivRiskModal L={L} onClose={() => setHivModal(false)} />}
    </div>
  );
}
