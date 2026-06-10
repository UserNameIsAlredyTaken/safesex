import { useState, useMemo, useEffect, useRef } from "react";
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

const C = { bg:"#0f141a", panel:"#161d26", panel2:"#1b2430", border:"#283442", hi:"#e8edf2", mid:"#9fb0c0", dim:"#64748b", accent:"#f0a500" };
const SEV = { 5:"#ff3b3b", 4:"#ff7b00", 3:"#ffc300", 2:"#b5d600", 1:"#38d9a9" };

const CDC = "CDC";
const WHO = { en: "WHO", ru: "ВОЗ", sr: "SZO" };
// acc уровни — ключи "high"|"low-mid"|"low"; локализуются через L.acc[...]
const STIS = [
  { key: "hiv", label: { en: "HIV", ru: "ВИЧ", sr: "HIV" }, color: "#4dabf7", sev: 5, p: 0.002, beta: 0.0008, e: 0.80, grounded: true,
    treat: { en: "Incurable — lifelong ART", ru: "Неизлечимо — пожизненная АРТ", sr: "Neizlečiv — doživotna ART" },
    cons: { en: "Untreated → AIDS, immune collapse", ru: "Без лечения — СПИД, иммунный отказ", sr: "Bez lečenja → SIDA, slom imuniteta" },
    acc: "high",
    src: { en: "Per-act transmission: Patel 2014 (CDC) — receptive vaginal 8 per 10,000. Condom ~80%: Cochrane. Anal ~17× riskier. Accuracy: high.",
      ru: "Передача/акт: Patel 2014 (CDC) — рецепт. вагинальный 8 на 10 000. Презерватив ~80%: Cochrane. Анальный ~в 17 раз опаснее. Точность: высокая.",
      sr: "Prenos po aktu: Patel 2014 (CDC) — receptivni vaginalni 8 na 10.000. Kondom ~80%: Cochrane. Analni ~17× rizičniji. Tačnost: visoka." },
    guide: {
      symptoms: {
        en: "Within 2–4 weeks some infected people get a flu-like syndrome (fever, rash, sore throat, swollen lymph nodes). Then years with no symptoms while immunity is gradually destroyed.",
        ru: "Через 2–4 недели у части заражённых — гриппоподобный синдром (лихорадка, сыпь, боль в горле, увеличение лимфоузлов). Затем годами без симптомов, пока иммунитет постепенно разрушается.",
        sr: "Tokom 2–4 nedelje kod dela zaraženih javlja se sindrom nalik gripu (groznica, osip, bol u grlu, otečeni limfni čvorovi). Zatim godinama bez simptoma dok se imunitet postepeno uništava." },
      treatment: {
        en: "There is no cure, but antiretroviral therapy (ART) suppresses the virus to undetectable levels — people live long, and when «undetectable» they do not transmit the virus sexually (U=U). Prevention: PrEP before exposure, PEP within 72 h after.",
        ru: "Излечения нет, но антиретровирусная терапия (АРТ) подавляет вирус до неопределяемого уровня — человек живёт долго и при «неопределяемом» не передаёт вирус половым путём (U=U). Профилактика: PrEP до контакта, PEP — в течение 72 ч после.",
        sr: "Lek ne postoji, ali antiretrovirusna terapija (ART) potiskuje virus do nedetektabilnog nivoa — osoba živi dugo i pri „nedetektabilnom“ ne prenosi virus polnim putem (U=U). Prevencija: PrEP pre kontakta, PEP — u roku od 72 h posle." },
      consequences: {
        en: "Untreated → AIDS: severe immunodeficiency, opportunistic infections and tumors, death.",
        ru: "Без лечения — СПИД: тяжёлый иммунодефицит, оппортунистические инфекции и опухоли, смерть.",
        sr: "Bez lečenja → SIDA: teška imunodeficijencija, oportunističke infekcije i tumori, smrt." },
      sources: [{ label: CDC, url: "https://www.cdc.gov/hiv/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/hiv-aids" }] } },
  { key: "hpv", label: { en: "HPV", ru: "ВПЧ", sr: "HPV" }, color: "#ff4d6d", sev: 4, p: 0.25, beta: 0.40, e: 0.40, grounded: false,
    vax: { ve: 0.85, note: { en: "More effective before sexual debut; ~90% of oncogenic types, but not all. Estimate.", ru: "Эффективнее до начала половой жизни; ~90% онкогенных типов, но не все. Оценка.", sr: "Efikasnija pre početka polnog života; ~90% onkogenih tipova, ali ne svi. Procena." } },
    treat: { en: "No drug; oncogenic", ru: "Нет лекарства; онкогенен", sr: "Nema leka; onkogen" },
    cons: { en: "Cancer (cervix, throat, anus), warts", ru: "Рак (шейка, горло, анус), кондиломы", sr: "Rak (grlić, grlo, anus), kondilomi" },
    acc: "low",
    src: { en: "Per-act transmission — rough estimate; HPV is highly contagious. Condom ~40% (CDC). Vaccine protects. Accuracy: low.",
      ru: "Передача/акт — грубая оценка; ВПЧ очень заразен. Презерватив ~40% (CDC). Защищает прививка. Точность: низкая.",
      sr: "Prenos po aktu — gruba procena; HPV je veoma zarazan. Kondom ~40% (CDC). Vakcina štiti. Tačnost: niska." },
    guide: {
      symptoms: {
        en: "Most often no symptoms; in 9 of 10 cases the infection clears on its own within ~2 years. Some types cause genital warts; oncogenic types are silent and found by screening.",
        ru: "Чаще всего бессимптомно; в 9 из 10 случаев инфекция уходит сама за ~2 года. Некоторые типы дают генитальные кондиломы (бородавки); онкогенные типы протекают скрыто и выявляются скринингом.",
        sr: "Najčešće bez simptoma; u 9 od 10 slučajeva infekcija prolazi sama za ~2 godine. Neki tipovi izazivaju genitalne kondilome (bradavice); onkogeni tipovi teku skriveno i otkrivaju se skriningom." },
      treatment: {
        en: "There is no drug against the virus itself — manifestations are treated: warts are removed, precancerous cervical changes are monitored and treated. Reliably prevented by vaccine (best before sexual debut).",
        ru: "Лекарства от самого вируса нет — лечат проявления: кондиломы удаляют, предраковые изменения шейки матки наблюдают и лечат. Надёжно предотвращается вакциной (лучше всего до начала половой жизни).",
        sr: "Leka protiv samog virusa nema — leče se manifestacije: kondilomi se uklanjaju, predkancerozne promene grlića materice prate se i leče. Pouzdano se sprečava vakcinom (najbolje pre početka polnog života)." },
      consequences: {
        en: "Oncogenic types cause cervical cancer, as well as cancer of the anus, oropharynx, penis, vulva and vagina.",
        ru: "Онкогенные типы вызывают рак шейки матки, а также рак ануса, ротоглотки, полового члена, вульвы и влагалища.",
        sr: "Onkogeni tipovi izazivaju rak grlića materice, kao i rak anusa, ždrela, penisa, vulve i vagine." },
      sources: [{ label: CDC, url: "https://www.cdc.gov/sti/about/about-genital-hpv-infection.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/human-papilloma-virus-and-cancer" }] } },
  { key: "hbv", label: { en: "Hepatitis B", ru: "Гепатит B", sr: "Hepatitis B" }, color: "#94d82d", sev: 4, p: 0.003, beta: 0.03, e: 0.90, grounded: false,
    vax: { ve: 0.95, note: { en: "With an immune response ~95%, infection is nearly ruled out. Estimate.", ru: "При иммунном ответе ~95%, заражение почти исключено. Оценка.", sr: "Uz imuni odgovor ~95%, zaraza je gotovo isključena. Procena." } },
    treat: { en: "Chronic incurable; vaccine exists", ru: "Хронический неизлечим; есть прививка", sr: "Hronični neizlečiv; postoji vakcina" },
    cons: { en: "Cirrhosis, liver cancer if chronic", ru: "Цирроз, рак печени при хронизации", sr: "Ciroza, rak jetre pri hroničnom toku" },
    acc: "low",
    src: { en: "Sexual per-act transmission — rough estimate. Condom ~90%. Depends on vaccination. Accuracy: low.",
      ru: "Сексуальная передача/акт — грубая оценка. Презерватив ~90%. Зависит от прививки. Точность: низкая.",
      sr: "Polni prenos po aktu — gruba procena. Kondom ~90%. Zavisi od vakcinacije. Tačnost: niska." },
    guide: {
      symptoms: {
        en: "Often no symptoms. Acute phase: fatigue, nausea, abdominal pain, dark urine, jaundice. The younger the infected person, the higher the chance of becoming chronic.",
        ru: "Часто бессимптомно. Острая фаза: усталость, тошнота, боль в животе, тёмная моча, желтуха. Чем младше заразившийся, тем выше шанс перехода в хроническую форму.",
        sr: "Često bez simptoma. Akutna faza: umor, mučnina, bol u stomaku, tamna mokraća, žutica. Što je zaražena osoba mlađa, to je veća šansa za prelazak u hronični oblik." },
      treatment: {
        en: "Acute hepatitis usually resolves on its own; chronic is incurable but controlled with antivirals. Reliably prevented by vaccination.",
        ru: "Острый гепатит обычно проходит сам; хронический неизлечим, но контролируется противовирусными препаратами. Надёжно предотвращается вакцинацией.",
        sr: "Akutni hepatitis obično prolazi sam; hronični je neizlečiv, ali se kontroliše antivirusnim lekovima. Pouzdano se sprečava vakcinacijom." },
      consequences: {
        en: "Chronic infection over time → cirrhosis and liver cancer.",
        ru: "Хроническая инфекция со временем → цирроз и рак печени.",
        sr: "Hronična infekcija vremenom → ciroza i rak jetre." },
      sources: [{ label: CDC, url: "https://www.cdc.gov/hepatitis-b/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/hepatitis-b" }] } },
  { key: "hcv", label: { en: "Hepatitis C", ru: "Гепатит C", sr: "Hepatitis C" }, color: "#748ffc", sev: 3, p: 0.005, beta: 0.0002, e: 0.70, grounded: false,
    treat: { en: "Curable (~95%, DAA)", ru: "Излечим (~95%, DAA)", sr: "Izlečiv (~95%, DAA)" },
    cons: { en: "Cirrhosis, liver cancer untreated", ru: "Цирроз, рак печени без лечения", sr: "Ciroza, rak jetre bez lečenja" },
    acc: "low",
    src: { en: "Mostly bloodborne; sexual transmission low and estimated. Curable (DAA ~95%). Accuracy: low.",
      ru: "В основном через кровь; сексуальная передача низкая и оценочная. Излечим (DAA ~95%). Точность: низкая.",
      sr: "Uglavnom preko krvi; polni prenos je nizak i procenjen. Izlečiv (DAA ~95%). Tačnost: niska." },
    guide: {
      symptoms: {
        en: "Usually no symptoms for years; sometimes fatigue, jaundice. Many do not know they are infected, so testing matters.",
        ru: "Обычно бессимптомно годами; иногда усталость, желтуха. Многие не знают, что заражены, поэтому важен анализ.",
        sr: "Obično bez simptoma godinama; ponekad umor, žutica. Mnogi ne znaju da su zaraženi, zato je analiza važna." },
      treatment: {
        en: "Curable: a course of direct-acting antivirals (DAA) gives ~95% cure in 8–12 weeks. No vaccine. Transmitted mainly via blood, sexual route less often.",
        ru: "Излечим: курс противовирусных прямого действия (DAA) даёт ~95% выздоровления за 8–12 недель. Вакцины нет. Передаётся в основном через кровь, половой путь — реже.",
        sr: "Izlečiv: kurs direktno delujućih antivirusnih lekova (DAA) daje ~95% izlečenja za 8–12 nedelja. Vakcine nema. Prenosi se uglavnom preko krvi, polnim putem ređe." },
      consequences: {
        en: "Untreated → cirrhosis, liver failure, liver cancer.",
        ru: "Без лечения — цирроз, печёночная недостаточность, рак печени.",
        sr: "Bez lečenja → ciroza, otkazivanje jetre, rak jetre." },
      sources: [{ label: CDC, url: "https://www.cdc.gov/hepatitis-c/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/hepatitis-c" }] } },
  { key: "syp", label: { en: "Syphilis", ru: "Сифилис", sr: "Sifilis" }, color: "#cc5de8", sev: 3, p: 0.004, beta: 0.10, e: 0.60, grounded: false,
    treat: { en: "Curable (penicillin)", ru: "Излечим (пенициллин)", sr: "Izlečiv (penicilin)" },
    cons: { en: "Brain, heart, nervous-system damage (tertiary)", ru: "Поражение мозга, сердца, НС (третичный)", sr: "Oštećenje mozga, srca, NS (tercijarni)" },
    acc: "low-mid",
    src: { en: "Per-act transmission — estimate; the chancre is often outside the condom area. Condom ~50–71% (CDC). Accuracy: low–medium.",
      ru: "Передача/акт — оценка; шанкр часто вне зоны презерватива. Презерватив ~50–71% (CDC). Точность: низкая–средняя.",
      sr: "Prenos po aktu — procena; šankr je često van zone kondoma. Kondom ~50–71% (CDC). Tačnost: niska–srednja." },
    guide: {
      symptoms: {
        en: "Staged course. Primary: a painless sore (chancre) at the infection site. Secondary: rash (often on palms and soles), fever, swollen lymph nodes. Then a latent stage with no symptoms.",
        ru: "Стадийное течение. Первичный: безболезненная язва (шанкр) в месте заражения. Вторичный: сыпь (часто на ладонях и стопах), температура, увеличение лимфоузлов. Затем латентная стадия без симптомов.",
        sr: "Tok po stadijumima. Primarni: bezbolna rana (šankr) na mestu zaraze. Sekundarni: osip (često na dlanovima i tabanima), temperatura, otečeni limfni čvorovi. Zatim latentni stadijum bez simptoma." },
      treatment: {
        en: "Curable with an antibiotic (penicillin). The earlier treatment starts, the simpler; tertiary-stage damage is irreversible.",
        ru: "Излечим антибиотиком (пенициллин). Чем раньше начато лечение, тем проще; повреждения третичной стадии необратимы.",
        sr: "Izlečiv antibiotikom (penicilin). Što se ranije počne s lečenjem, to je jednostavnije; oštećenja tercijarnog stadijuma su nepovratna." },
      consequences: {
        en: "Untreated, after years → tertiary syphilis: damage to the heart, brain and nervous system; in pregnancy — congenital syphilis in the baby.",
        ru: "Без лечения через годы — третичный сифилис: поражение сердца, мозга и нервной системы; при беременности — врождённый сифилис у ребёнка.",
        sr: "Bez lečenja nakon godina → tercijarni sifilis: oštećenje srca, mozga i nervnog sistema; u trudnoći — urođeni sifilis kod deteta." },
      sources: [{ label: CDC, url: "https://www.cdc.gov/syphilis/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/syphilis" }] } },
  { key: "gon", label: { en: "Gonorrhea", ru: "Гонорея", sr: "Gonoreja" }, color: "#ff922b", sev: 2, p: 0.008, beta: 0.20, e: 0.90, grounded: false,
    treat: { en: "Curable; resistance rising", ru: "Излечима; растёт устойчивость", sr: "Izlečiva; raste otpornost" },
    cons: { en: "Infertility, PID, dissemination", ru: "Бесплодие, ВЗОМТ, диссеминация", sr: "Neplodnost, PID, diseminacija" },
    acc: "low",
    src: { en: "Per-act transmission — rough estimate; condom >90% (CDC). Antibiotic resistance. Accuracy: low for β.",
      ru: "Передача/акт — грубая оценка; презерватив >90% (CDC). Антибиотикорезистентность. Точность: низкая для β.",
      sr: "Prenos po aktu — gruba procena; kondom >90% (CDC). Antibiotska rezistencija. Tačnost: niska za β." },
    guide: {
      symptoms: {
        en: "Often asymptomatic (especially in women). Possible: burning on urination, discharge (mucus, pus), in women — bleeding between cycles. Rectal and pharyngeal forms occur.",
        ru: "Часто бессимптомна (особенно у женщин). Возможны: жжение при мочеиспускании, выделения (бели, гной), у женщин — кровотечения между циклами. Бывает ректальная и глоточная формы.",
        sr: "Često bez simptoma (naročito kod žena). Moguće: pečenje pri mokrenju, sekret (sluz, gnoj), kod žena — krvarenje između ciklusa. Javljaju se rektalni i ždrelni oblici." },
      treatment: {
        en: "Curable with an antibiotic (ceftriaxone injection), but drug resistance is rising — treat strictly as prescribed by a doctor.",
        ru: "Излечима антибиотиком (инъекция цефтриаксона), но устойчивость к препаратам растёт — лечение строго по назначению врача.",
        sr: "Izlečiva antibiotikom (injekcija ceftriaksona), ali otpornost na lekove raste — lečenje strogo po preporuci lekara." },
      consequences: {
        en: "Untreated → PID, infertility, ectopic pregnancy; may spread to blood and joints; raises the risk of HIV infection.",
        ru: "Без лечения — ВЗОМТ, бесплодие, внематочная беременность; может распространиться в кровь и суставы; повышает риск заражения ВИЧ.",
        sr: "Bez lečenja → PID, neplodnost, vanmaterična trudnoća; može se proširiti u krv i zglobove; povećava rizik od zaraze HIV-om." },
      sources: [{ label: CDC, url: "https://www.cdc.gov/gonorrhea/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/sexually-transmitted-infections-(stis)" }] } },
  { key: "chl", label: { en: "Chlamydia", ru: "Хламидия", sr: "Hlamidija" }, color: "#ffd43b", sev: 2, p: 0.045, beta: 0.10, e: 0.70, grounded: false,
    treat: { en: "Curable with antibiotic", ru: "Излечима антибиотиком", sr: "Izlečiva antibiotikom" },
    cons: { en: "Infertility, PID (often silent)", ru: "Бесплодие, ВЗОМТ (часто скрыто)", sr: "Neplodnost, PID (često skriveno)" },
    acc: "low-mid",
    src: { en: "Per-act transmission — estimate; often asymptomatic. Condom 50–90% (CDC). Accuracy: low–medium.",
      ru: "Передача/акт — оценка; часто бессимптомна. Презерватив 50–90% (CDC). Точность: низкая–средняя.",
      sr: "Prenos po aktu — procena; često bez simptoma. Kondom 50–90% (CDC). Tačnost: niska–srednja." },
    guide: {
      symptoms: {
        en: "Often asymptomatic. Possible discharge, burning on urination, lower-abdominal pain; symptoms may appear only after several weeks.",
        ru: "Часто бессимптомна. Возможны выделения, жжение при мочеиспускании, боль внизу живота; симптомы могут появиться лишь через несколько недель.",
        sr: "Često bez simptoma. Mogući sekret, pečenje pri mokrenju, bol u donjem delu stomaka; simptomi se mogu pojaviti tek nakon nekoliko nedelja." },
      treatment: {
        en: "Curable with an antibiotic; it is important to finish the whole course and treat partners, otherwise reinfection.",
        ru: "Излечима антибиотиком; важно пройти весь курс и пролечить партнёров, иначе повторное заражение.",
        sr: "Izlečiva antibiotikom; važno je proći ceo kurs i lečiti partnere, inače ponovna zaraza." },
      consequences: {
        en: "Untreated → PID, scarring of the fallopian tubes, infertility, ectopic pregnancy.",
        ru: "Без лечения — ВЗОМТ, рубцевание маточных труб, бесплодие, внематочная беременность.",
        sr: "Bez lečenja → PID, ožiljci na jajovodima, neplodnost, vanmaterična trudnoća." },
      sources: [{ label: CDC, url: "https://www.cdc.gov/chlamydia/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/sexually-transmitted-infections-(stis)" }] } },
  { key: "tri", label: { en: "Trichomoniasis", ru: "Трихомониаз", sr: "Trihomonijaza" }, color: "#20c997", sev: 1, p: 0.02, beta: 0.12, e: 0.50, grounded: false,
    treat: { en: "Curable in one course", ru: "Излечим одним курсом", sr: "Izlečiv jednim kursom" },
    cons: { en: "Inflammation; raises other STI risk", ru: "Воспаление; повышает риск др. ИППП", sr: "Upala; povećava rizik od drugih PPI" },
    acc: "low",
    src: { en: "Per-act transmission — estimate; condom ~50%. Treated in one course. Accuracy: low.",
      ru: "Передача/акт — оценка; презерватив ~50%. Лечится одним курсом. Точность: низкая.",
      sr: "Prenos po aktu — procena; kondom ~50%. Leči se jednim kursom. Tačnost: niska." },
    guide: {
      symptoms: {
        en: "About 70% have no symptoms. Possible: itching, burning, redness, discharge (in women often frothy and smelly), discomfort on urination.",
        ru: "Около 70% — без симптомов. Возможны: зуд, жжение, покраснение, выделения (у женщин нередко пенистые с запахом), дискомфорт при мочеиспускании.",
        sr: "Oko 70% — bez simptoma. Moguće: svrab, pečenje, crvenilo, sekret (kod žena često penušav i sa mirisom), nelagodnost pri mokrenju." },
      treatment: {
        en: "Easily curable: a course of antibiotic (metronidazole or tinidazole); both partners must be treated.",
        ru: "Легко излечим: курс антибиотика (метронидазол или тинидазол); лечить нужно обоих партнёров.",
        sr: "Lako izlečiv: kurs antibiotika (metronidazol ili tinidazol); treba lečiti oba partnera." },
      consequences: {
        en: "Inflammation; raises the risk of acquiring and transmitting other STIs, including HIV; in pregnancy — preterm birth.",
        ru: "Воспаление; повышает риск заражения и передачи других ИППП, включая ВИЧ; при беременности — преждевременные роды.",
        sr: "Upala; povećava rizik od zaraze i prenosa drugih PPI, uključujući HIV; u trudnoći — prevremeni porođaj." },
      sources: [{ label: CDC, url: "https://www.cdc.gov/trichomoniasis/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/sexually-transmitted-infections-(stis)" }] } },
];

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

// ── Локализация (en — дефолт). t(key) читает текущий язык из L. ────────────────
const I18N = {
  en: {
    langName: "English",
    title: "STI risk over time",
    badge: "illustrative model",
    intro: "Cumulative probability of getting infected at least once. Set up your partners by type on the left. The estimates may be imprecise — but the comparisons and the shapes of the curves can be useful as an illustration.",
    warnTitle: "This is an amateur calculator, not a medical tool.",
    warnBody: "The numbers are rough illustrative estimates (reliable data exists only for HIV) and do not predict your personal risk. Do not make decisions about testing, treatment or prevention based on it — consult a doctor (a sexual-health / infectious-disease specialist) or a specialized service.",
    preset: "Behavior preset",
    sexActs: "Sex acts",
    sexActsInfo: "Which practices you engage in and in which role. Different acts transmit infection differently: receptive anal is roughly 17× riskier than vaginal, insertive less so, oral notably lower. These ratios rely on HIV data (Patel 2014, CDC); for other infections this is a rough approximation. Practices add up: every selected practice is counted in each contact, so adding a practice only raises the risk.",
    noActs: "No practice selected — risk is treated as zero.",
    protection: "Protection and immunity",
    vaxHpv: "Vaccinated against HPV",
    vaxHbv: "Vaccinated against hepatitis B",
    vaccinated: "vaccinated",
    addBtn: "+ add",
    poolInfo: "Background environment — an estimate of assortativity (mixing): casual and hookup partners more often come from a more active/risky pool, so the chance a partner is infected is higher for them. Multiplier on prevalence p: steady ×1, recurring ×1.4, hookups ×1.8 (estimate).",
    bg: "background", bgMul: (m) => `background ×${m}`,
    oneActBg: (m) => `1 act · background ×${m}`,
    condom: "Condom",
    condomInfo: "Share of acts with partners of this type that use a condom.",
    tested: "Tested",
    testedInfo: "Share of partners of this type with a recent negative STI test — lowers the chance a partner is infected. Tests are not perfect (there is a «window»), so this is an estimate.",
    details: "details",
    sexPerWeek: "Sex per week",
    sexPerWeekHint: "how often sex happens with one such partner",
    relDuration: "Relationship duration",
    relDurationHint: "how long one such relationship lasts",
    oneoffNote: "One-off contact — one act per partner.",
    ongoingNote: "Lasts the whole period — exposure accumulates over time.",
    horizon: "Active sex-life period",
    horizonHint: "calculation horizon, not age",
    scale: "Probability scale",
    scaleHint: "lower it to see rare ones",
    atLeastOne: "at least one of the enabled",
    anyLabel: "At least one",
    topRiskLine: (years, yw, name, pct, col) => (<>Over {years} {yw} of active sex life, the highest risk is <span style={{ color: col, fontWeight: 600 }}>{name}</span> — about <span style={{ color: C.hi, fontWeight: 600 }}>{pct}</span>.</>),
    enableOne: "Enable at least one infection below.",
    structTitle: "Partnership structure over time",
    structStats: (avg, lanes, total) => (<>sex ≈ <b data-hi>{avg}×</b>/wk · peak <b data-hi>{lanes}</b> · total relationships: <b data-hi>{total}</b></>),
    legSteady: "steady", legCasual: "recurring", legHookup: "hookups",
    structLegendTail: ". Vertical overlap = concurrent partners.",
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
    guideTail: "— reference information about the disease, not a diagnosis.",
    sympt: "Symptoms", treatm: "Treatment", conseq: "Consequences",
    collapseGuide: "collapse guide", openGuide: "open the disease guide",
    breakdownTitle: "Calculation breakdown — where the number comes from",
    breakdownIntro: "Pick an infection — we'll show the contribution of each partner type and how they add up:",
    condomBlockTitle: "What a condom gives (if used in every contact with everyone)",
    withoutCondom: "without condom", withCondom: "with condom",
    barAct: "Per 1 contact (all practices, if the partner is infected)",
    barHor: (years, yw) => `Over ${years} ${yw}`,
    satDrop: (years, yw, cutAct, cutHor) => (<>Per <b data-hi>one contact</b> a condom removes <b data-grn>{cutAct}%</b> of the risk. But over <b data-hi>{years} {yw}</b> with repeats — only <b data-red>{cutHor}%</b>: with many contacts the risk «saturates», and relative protection falls.</>),
    satFlat: (years, yw, cutHor) => (<>Both per <b data-hi>one contact</b> and over <b data-hi>{years} {yw}</b> a condom removes about the same (~<b data-grn>{cutHor}%</b>). For rarely transmitted infections the risk does not «saturate», so relative protection does not fall over time.</>),
    contribIntro: (years, yw) => (<>The contribution of each <b data-hi>partner type</b> over {years} {yw} (its own frequency, duration, condom, tested share, background), then they combine:</>),
    thType: "Type", thPartners: "Partners", thContacts: "Contacts k", thTransPerAct: "Transmission per contact", thChanceInf: "Chance partner infected", thRiskHor: (years, yw) => `Risk over ${years} ${yw}`,
    perYear: "/yr",
    noActivePartners: "No active partners — add someone in the cards on the left to see the breakdown.",
    breakdownFoot: (name, pct, years, yw, col) => (<>«Chance partner infected» = prevalence p × background environment × (1 − tested). «Transmission per contact» adds up the selected sex acts and already accounts for this type's condom and vaccine. Total risk = 1 − product of «not getting infected» across all types = <b style={{ color: col }}>{pct}</b> — that is the height of the «{name}» curve over {years} {yw}.</>),
    assumTitle: "Assumptions and how this is computed",
    assumP1: (<>Only for <b data-hi>HIV</b> are the per-act transmission probability and condom effectiveness taken from research (solid line). For the others there are no reliable per-act numbers — plausible averages (dashed). This is a comparison and a shape, not an exact forecast.</>),
    assumP2: (<><b data-hi>Partner types.</b> Behavior is set by three types — steady, recurring, hookups — each with its own count, frequency, duration, condom and «tested» share. This reflects reality: with different partners things differ in how often, how long, and how protected (a barrier is used less with close partners, more with casual ones).</>),
    assumP3: (<><b data-hi>Sex acts.</b> Per-act transmission depends on the practice and role: receptive anal is roughly 17× riskier than vaginal, insertive about half, oral notably lower. These ratios are taken from HIV data (Patel 2014, CDC); for other infections they are applied as a rough approximation. Practices add up (additively): we assume every selected practice is present in each contact with its own β, and «not getting infected per contact» = the product over practices — so adding any practice only raises the risk (a simplification: in reality not every contact includes all practices). Receptive and insertive vaginal are mutually exclusive (anatomy).</>),
    assumP4: (<><b data-hi>Tested.</b> Lowers the chance a partner of this type is infected, in proportion to the tested share. A test is not perfect — there is a «window» between infection and a positive test, so even 100% tested does not guarantee zero; we treat this as an estimate.</>),
    assumP5: (<><b data-hi>Background environment (multiplier).</b> An estimate of assortativity — that people more often pair with others of similar activity. Casual and hookup partners are on average from a more active/risky pool, so the chance such a partner is already infected is higher than in the general population. This is a multiplier on prevalence p: steady ×1.0, recurring ×1.4, hookups ×1.8 — these are estimates, not data, and easy to change.</>),
    assumP6: (<><b data-hi>Formula.</b> For a type: k = frequency × duration (hookup = 1 contact); for each selected practice βeff = β·practice_multiplier·(1 − condom·e)·vaccine; survival per contact = ∏(1 − βeff) over practices; chance of infection from an infected partner = 1 − (survival_per_contact)^k; multiplied by p · background · (1 − tested); contributions are multiplied across all partners of all types. Steady — an ongoing relationship (exposure accumulates over time); recurring and hookups refresh each year. «At least one» — independence of infections (a rough upper bound).</>),
    footerDisclaimer: "This is an amateur educational model, not a medical forecast and not a basis for medical decisions.",
    githubLink: "Source code on GitHub ↗",
    yrAxis: "y",
  },
  ru: {
    langName: "Русский",
    title: "Риск ЗППП во времени",
    badge: "иллюстративная модель",
    intro: "Кумулятивная вероятность заразиться хотя бы раз. Настрой партнёров по типам слева. Оценки могут быть не точными — но сравнения и формы кривых могут быть полезны для иллюстративности.",
    warnTitle: "Это любительский калькулятор, а не медицинский инструмент.",
    warnBody: "Цифры — грубые иллюстративные оценки (надёжные данные есть только по ВИЧ) и не предсказывают твой личный риск. Не принимай решения о тестировании, лечении или профилактике, опираясь на него, — консультируйся с врачом (венеролог/инфекционист) или в профильной службе.",
    preset: "Пресет поведения",
    sexActs: "Виды секса",
    sexActsInfo: "Какими практиками ты занимаешься и в какой роли. Разные акты передают инфекцию по-разному: рецептивный анальный примерно в 17 раз рискованнее вагинального, вводящий — меньше, оральный — заметно ниже. Эти соотношения опираются на данные по ВИЧ (Patel 2014, CDC); для остальных инфекций это грубое приближение. Практики складываются: в каждом контакте учитывается каждая выбранная, поэтому добавление практики риск только повышает.",
    noActs: "Не выбрано ни одной практики — риск считается нулевым.",
    protection: "Защита и иммунитет",
    vaxHpv: "Привит от ВПЧ",
    vaxHbv: "Привит от гепатита B",
    vaccinated: "привит",
    addBtn: "+ добавить",
    poolInfo: "Фон среды — оценка ассортативности (смешивания): случайные и хукап-партнёры чаще из более активного/рискового круга, поэтому шанс, что партнёр заражён, у них выше. Множитель к распространённости p: постоянные ×1, приходящие ×1,4, хукапы ×1,8 (оценка).",
    bg: "фон среды", bgMul: (m) => `фон среды ×${m}`,
    oneActBg: (m) => `1 акт · фон ×${m}`,
    condom: "Презерватив",
    condomInfo: "Доля актов с партнёрами этого типа, в которых используется презерватив.",
    tested: "Проверены",
    testedInfo: "Доля партнёров этого типа с недавним отрицательным тестом на ИППП — снижает шанс, что партнёр заражён. Тест не идеален (есть «окно»), поэтому это оценка.",
    details: "детали",
    sexPerWeek: "Секс в неделю",
    sexPerWeekHint: "как часто секс с одним таким партнёром",
    relDuration: "Длительность связи",
    relDurationHint: "как долго длится одна такая связь",
    oneoffNote: "Разовый контакт — один акт на партнёра.",
    ongoingNote: "Длится весь период — экспозиция копится со временем.",
    horizon: "Период активной половой жизни",
    horizonHint: "горизонт расчёта, не возраст",
    scale: "Масштаб шкалы вероятности",
    scaleHint: "уменьши, чтобы разглядеть редкие",
    atLeastOne: "хотя бы одна из включённых",
    anyLabel: "Хотя бы одна",
    topRiskLine: (years, yw, name, pct, col) => (<>За {years} {yw} активной половой жизни выше всего риск <span style={{ color: col, fontWeight: 600 }}>{name}</span> — около <span style={{ color: C.hi, fontWeight: 600 }}>{pct}</span>.</>),
    enableOne: "Включи хотя бы одну инфекцию ниже.",
    structTitle: "Структура партнёрств во времени",
    structStats: (avg, lanes, total) => (<>секс ≈ <b data-hi>{avg}×</b>/нед · пик <b data-hi>{lanes}</b> · всего связей: <b data-hi>{total}</b></>),
    legSteady: "постоянные", legCasual: "приходящие", legHookup: "хукапы",
    structLegendTail: ". Наложение по вертикали = одновременные партнёры.",
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
    guideTail: "— справочная информация о болезни, не диагноз.",
    sympt: "Симптомы", treatm: "Лечение", conseq: "Последствия",
    collapseGuide: "свернуть гайд", openGuide: "открыть гайд по болезни",
    breakdownTitle: "Разбор расчёта — откуда берётся цифра",
    breakdownIntro: "Выбери инфекцию — покажем вклад каждого типа партнёров и как они складываются:",
    condomBlockTitle: "Что даёт презерватив (если использовать в каждом контакте со всеми)",
    withoutCondom: "без презерватива", withCondom: "с презервативом",
    barAct: "За 1 контакт (все практики, если партнёр заражён)",
    barHor: (years, yw) => `За ${years} ${yw}`,
    satDrop: (years, yw, cutAct, cutHor) => (<>За <b data-hi>один контакт</b> презерватив убирает <b data-grn>{cutAct}%</b> риска. Но за <b data-hi>{years} {yw}</b> с повторами — уже только <b data-red>{cutHor}%</b>: при многих контактах риск «насыщается», и относительная защита падает.</>),
    satFlat: (years, yw, cutHor) => (<>И за <b data-hi>один контакт</b>, и за <b data-hi>{years} {yw}</b> презерватив убирает примерно одинаково (~<b data-grn>{cutHor}%</b>). У редко передающихся инфекций риск не «насыщается», поэтому относительная защита со временем не падает.</>),
    contribIntro: (years, yw) => (<>Вклад каждого <b data-hi>типа партнёров</b> за {years} {yw} (своя частота, длительность, презерватив, проверенность, фон), затем они объединяются:</>),
    thType: "Тип", thPartners: "Партнёров", thContacts: "Контактов k", thTransPerAct: "Передача за контакт", thChanceInf: "Шанс партнёр заразен", thRiskHor: (years, yw) => `Риск за ${years} ${yw}`,
    perYear: "/год",
    noActivePartners: "Нет активных партнёров — добавь кого-нибудь в карточках слева, чтобы увидеть разбор.",
    breakdownFoot: (name, pct, years, yw, col) => (<>«Шанс партнёр заразен» = распространённость p × фон среды × (1 − проверенность). «Передача за контакт» складывает выбранные виды секса и уже учитывает презерватив и прививку этого типа. Общий риск = 1 − произведение «не заразиться» по всем типам = <b style={{ color: col }}>{pct}</b> — это и есть высота кривой «{name}» за {years} {yw}.</>),
    assumTitle: "Допущения и как это считается",
    assumP1: (<>Только для <b data-hi>ВИЧ</b> вероятность передачи на акт и эффективность презерватива взяты из исследований (сплошная линия). Для остальных надёжных per-act чисел нет — правдоподобные средние (пунктир). Это сравнение и форма, а не точный прогноз.</>),
    assumP2: (<><b data-hi>Типы партнёров.</b> Поведение задаётся тремя типами — постоянные, приходящие, хукапы — у каждого свои число, частота, длительность, презерватив и «проверенность». Это отражает реальность: с разными партнёрами по-разному и часто, и долго, и насколько защищённо (барьер с близкими используют реже, со случайными — чаще).</>),
    assumP3: (<><b data-hi>Виды секса.</b> Передача за акт зависит от практики и роли: рецептивный анальный примерно в 17 раз рискованнее вагинального, вводящий — около половины, оральный — заметно ниже. Эти соотношения взяты из данных по ВИЧ (Patel 2014, CDC); для остальных инфекций они применены как грубое приближение. Практики складываются (аддитивно): считаем, что в каждом контакте присутствует каждая выбранная практика со своим β, а «не заразиться за контакт» = произведение по практикам — поэтому добавление любой практики риск только повышает (упрощение: в реальности не каждый контакт включает все практики). Рецептивный и вводящий вагинальный взаимоисключают друг друга (анатомия).</>),
    assumP4: (<><b data-hi>Проверены.</b> Снижает шанс, что партнёр этого типа заражён, пропорционально доле проверенных. Тест не идеален — между заражением и положительным тестом есть «окно», поэтому даже 100% проверенных не гарантируют ноль; считаем это оценкой.</>),
    assumP5: (<><b data-hi>Фон среды (множитель).</b> Оценка ассортативности — того, что люди чаще сходятся с похожими по активности. Случайные и хукап-партнёры в среднем из более активного/рискового круга, поэтому шанс, что такой партнёр уже заражён, выше, чем по общей популяции. Это множитель к распространённости p: постоянные ×1,0, приходящие ×1,4, хукапы ×1,8 — это оценки, не данные, и их легко поменять.</>),
    assumP6: (<><b data-hi>Формула.</b> Для типа: k = частота × длительность (хукап = 1 контакт); для каждой выбранной практики βeff = β·множитель_практики·(1 − презерватив·e)·прививка; выживаемость за контакт = ∏(1 − βeff) по практикам; шанс заразиться от заражённого партнёра = 1 − (выживаемость_за_контакт)^k; умножается на p · фон · (1 − проверенность); вклады перемножаются по всем партнёрам всех типов. Постоянные — длящаяся связь (экспозиция копится со временем); приходящие и хукапы обновляются каждый год. «Хотя бы одна» — независимость инфекций (грубая верхняя оценка).</>),
    footerDisclaimer: "Это любительская образовательная модель, а не медицинский прогноз и не основание для медицинских решений.",
    githubLink: "Исходный код на GitHub ↗",
    yrAxis: "г",
  },
  sr: {
    langName: "Srpski",
    title: "Rizik od PPI tokom vremena",
    badge: "ilustrativni model",
    intro: "Kumulativna verovatnoća da se zaraziš bar jednom. Podesi partnere po tipovima levo. Procene mogu biti netačne — ali poređenja i oblici krivih mogu biti korisni kao ilustracija.",
    warnTitle: "Ovo je amaterski kalkulator, a ne medicinski alat.",
    warnBody: "Brojevi su grube ilustrativne procene (pouzdani podaci postoje samo za HIV) i ne predviđaju tvoj lični rizik. Ne donosi odluke o testiranju, lečenju ili prevenciji na osnovu njega — posavetuj se sa lekarom (venerolog/infektolog) ili u specijalizovanoj službi.",
    preset: "Preset ponašanja",
    sexActs: "Vrste seksa",
    sexActsInfo: "Kojim praksama se baviš i u kojoj ulozi. Različiti akti prenose infekciju različito: receptivni analni je otprilike 17× rizičniji od vaginalnog, insertivni manje, oralni znatno niže. Ti odnosi se oslanjaju na podatke o HIV-u (Patel 2014, CDC); za ostale infekcije ovo je gruba aproksimacija. Prakse se sabiraju: u svakom kontaktu se računa svaka izabrana, pa dodavanje prakse samo povećava rizik.",
    noActs: "Nijedna praksa nije izabrana — rizik se računa kao nula.",
    protection: "Zaštita i imunitet",
    vaxHpv: "Vakcinisan/a protiv HPV-a",
    vaxHbv: "Vakcinisan/a protiv hepatitisa B",
    vaccinated: "vakcinisan/a",
    addBtn: "+ dodaj",
    poolInfo: "Pozadinska sredina — procena asortativnosti (mešanja): povremeni i partneri iz avantura češće dolaze iz aktivnijeg/rizičnijeg kruga, pa je šansa da je partner zaražen kod njih veća. Množilac na prevalenciju p: stalni ×1, povremeni ×1,4, avanture ×1,8 (procena).",
    bg: "pozadinska sredina", bgMul: (m) => `pozadina ×${m}`,
    oneActBg: (m) => `1 akt · pozadina ×${m}`,
    condom: "Kondom",
    condomInfo: "Udeo akata sa partnerima ovog tipa u kojima se koristi kondom.",
    tested: "Testirani",
    testedInfo: "Udeo partnera ovog tipa sa nedavnim negativnim testom na PPI — smanjuje šansu da je partner zaražen. Test nije savršen (postoji „prozor“), pa je ovo procena.",
    details: "detalji",
    sexPerWeek: "Seks nedeljno",
    sexPerWeekHint: "koliko često ima seksa sa jednim takvim partnerom",
    relDuration: "Trajanje veze",
    relDurationHint: "koliko dugo traje jedna takva veza",
    oneoffNote: "Jednokratni kontakt — jedan akt po partneru.",
    ongoingNote: "Traje ceo period — izloženost se gomila tokom vremena.",
    horizon: "Period aktivnog polnog života",
    horizonHint: "horizont računanja, ne starost",
    scale: "Razmera skale verovatnoće",
    scaleHint: "smanji da bi se videle retke",
    atLeastOne: "bar jedna od uključenih",
    anyLabel: "Bar jedna",
    topRiskLine: (years, yw, name, pct, col) => (<>Tokom {years} {yw} aktivnog polnog života najviši rizik je <span style={{ color: col, fontWeight: 600 }}>{name}</span> — oko <span style={{ color: C.hi, fontWeight: 600 }}>{pct}</span>.</>),
    enableOne: "Uključi bar jednu infekciju ispod.",
    structTitle: "Struktura partnerstava tokom vremena",
    structStats: (avg, lanes, total) => (<>seks ≈ <b data-hi>{avg}×</b>/ned · vrh <b data-hi>{lanes}</b> · ukupno veza: <b data-hi>{total}</b></>),
    legSteady: "stalni", legCasual: "povremeni", legHookup: "avanture",
    structLegendTail: ". Preklapanje po vertikali = istovremeni partneri.",
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
    guideTail: "— referentne informacije o bolesti, ne dijagnoza.",
    sympt: "Simptomi", treatm: "Lečenje", conseq: "Posledice",
    collapseGuide: "skupi vodič", openGuide: "otvori vodič o bolesti",
    breakdownTitle: "Razrada računa — odakle dolazi broj",
    breakdownIntro: "Izaberi infekciju — pokazaćemo doprinos svakog tipa partnera i kako se sabiraju:",
    condomBlockTitle: "Šta daje kondom (ako se koristi u svakom kontaktu sa svima)",
    withoutCondom: "bez kondoma", withCondom: "sa kondomom",
    barAct: "Po 1 kontaktu (sve prakse, ako je partner zaražen)",
    barHor: (years, yw) => `Za ${years} ${yw}`,
    satDrop: (years, yw, cutAct, cutHor) => (<>Po <b data-hi>jednom kontaktu</b> kondom uklanja <b data-grn>{cutAct}%</b> rizika. Ali za <b data-hi>{years} {yw}</b> sa ponavljanjima — već samo <b data-red>{cutHor}%</b>: pri mnogo kontakata rizik se „zasiti“, i relativna zaštita opada.</>),
    satFlat: (years, yw, cutHor) => (<>I po <b data-hi>jednom kontaktu</b> i za <b data-hi>{years} {yw}</b> kondom uklanja otprilike isto (~<b data-grn>{cutHor}%</b>). Kod retko prenosivih infekcija rizik se ne „zasiti“, pa relativna zaštita tokom vremena ne opada.</>),
    contribIntro: (years, yw) => (<>Doprinos svakog <b data-hi>tipa partnera</b> za {years} {yw} (sopstvena učestalost, trajanje, kondom, udeo testiranih, pozadina), zatim se kombinuju:</>),
    thType: "Tip", thPartners: "Partnera", thContacts: "Kontakata k", thTransPerAct: "Prenos po kontaktu", thChanceInf: "Šansa da je partner zaražen", thRiskHor: (years, yw) => `Rizik za ${years} ${yw}`,
    perYear: "/god",
    noActivePartners: "Nema aktivnih partnera — dodaj nekoga u karticama levo da bi video/la razradu.",
    breakdownFoot: (name, pct, years, yw, col) => (<>„Šansa da je partner zaražen“ = prevalencija p × pozadinska sredina × (1 − testirani). „Prenos po kontaktu“ sabira izabrane vrste seksa i već uračunava kondom i vakcinu ovog tipa. Ukupni rizik = 1 − proizvod „ne zaraziti se“ po svim tipovima = <b style={{ color: col }}>{pct}</b> — to je visina krive „{name}“ za {years} {yw}.</>),
    assumTitle: "Pretpostavke i kako se ovo računa",
    assumP1: (<>Samo za <b data-hi>HIV</b> su verovatnoća prenosa po aktu i efikasnost kondoma uzete iz istraživanja (puna linija). Za ostale ne postoje pouzdani per-act brojevi — verodostojni proseci (isprekidana). Ovo je poređenje i oblik, a ne tačna prognoza.</>),
    assumP2: (<><b data-hi>Tipovi partnera.</b> Ponašanje se zadaje sa tri tipa — stalni, povremeni, avanture — svaki ima svoj broj, učestalost, trajanje, kondom i udeo „testiranih“. To odražava stvarnost: sa različitim partnerima razlikuje se i koliko često, i koliko dugo, i koliko zaštićeno (barijera se sa bliskima koristi ređe, sa slučajnima češće).</>),
    assumP3: (<><b data-hi>Vrste seksa.</b> Prenos po aktu zavisi od prakse i uloge: receptivni analni je otprilike 17× rizičniji od vaginalnog, insertivni oko polovine, oralni znatno niže. Ti odnosi su uzeti iz podataka o HIV-u (Patel 2014, CDC); za ostale infekcije primenjeni su kao gruba aproksimacija. Prakse se sabiraju (aditivno): smatramo da je u svakom kontaktu prisutna svaka izabrana praksa sa svojim β, a „ne zaraziti se po kontaktu“ = proizvod po praksama — pa dodavanje bilo koje prakse samo povećava rizik (pojednostavljenje: u stvarnosti ne uključuje svaki kontakt sve prakse). Receptivni i insertivni vaginalni se međusobno isključuju (anatomija).</>),
    assumP4: (<><b data-hi>Testirani.</b> Smanjuje šansu da je partner ovog tipa zaražen, srazmerno udelu testiranih. Test nije savršen — između zaraze i pozitivnog testa postoji „prozor“, pa čak ni 100% testiranih ne garantuje nulu; smatramo to procenom.</>),
    assumP5: (<><b data-hi>Pozadinska sredina (množilac).</b> Procena asortativnosti — toga da se ljudi češće spajaju sa sličnima po aktivnosti. Slučajni i partneri iz avantura su u proseku iz aktivnijeg/rizičnijeg kruga, pa je šansa da je takav partner već zaražen veća nego u opštoj populaciji. To je množilac na prevalenciju p: stalni ×1,0, povremeni ×1,4, avanture ×1,8 — to su procene, ne podaci, i lako ih je promeniti.</>),
    assumP6: (<><b data-hi>Formula.</b> Za tip: k = učestalost × trajanje (avantura = 1 kontakt); za svaku izabranu praksu βeff = β·množilac_prakse·(1 − kondom·e)·vakcina; preživljavanje po kontaktu = ∏(1 − βeff) po praksama; šansa za zarazu od zaraženog partnera = 1 − (preživljavanje_po_kontaktu)^k; množi se sa p · pozadina · (1 − testirani); doprinosi se množe po svim partnerima svih tipova. Stalni — trajna veza (izloženost se gomila tokom vremena); povremeni i avanture se obnavljaju svake godine. „Bar jedna“ — nezavisnost infekcija (gruba gornja procena).</>),
    footerDisclaimer: "Ovo je amaterski edukativni model, a ne medicinska prognoza ni osnov za medicinske odluke.",
    githubLink: "Izvorni kod na GitHub-u ↗",
    yrAxis: "g",
  },
};
const LANGS = ["en", "ru", "sr"];

const TYPES = [
  { key:"steady", label:{ en:"Steady", ru:"Постоянные", sr:"Stalni" }, color:"#f0a500", kind:"ongoing",  countMax:3,  countLab:{ en:"how many", ru:"сколько", sr:"koliko" }, addCount:1 },
  { key:"casual", label:{ en:"Recurring", ru:"Приходящие", sr:"Povremeni" }, color:"#2ec4b6", kind:"recurring", countMax:12, countLab:{ en:"how many per year", ru:"сколько в год", sr:"koliko godišnje" }, addCount:2 },
  { key:"hookup", label:{ en:"Hookups", ru:"Хукапы", sr:"Avanture" }, color:"#4dabf7", kind:"oneoff",   countMax:50, countLab:{ en:"how many per year", ru:"сколько в год", sr:"koliko godišnje" }, addCount:5 },
];
const BASE = {
  steady: { count:1, condom:15, perWeek:2.5, dur:0,   tested:100, poolMul:1.0 },
  casual: { count:2, condom:50, perWeek:1,   dur:2.5, tested:0,   poolMul:1.4 },
  hookup: { count:2, condom:75, perWeek:0,   dur:0,   tested:0,   poolMul:1.8 },
};
const mkCfg = (over = {}) => ({
  steady: { ...BASE.steady, ...(over.steady || { count: 0 }) },
  casual: { ...BASE.casual, ...(over.casual || { count: 0 }) },
  hookup: { ...BASE.hookup, ...(over.hookup || { count: 0 }) },
});
const PRESETS = [
  { key:"celibate", label:{ en:"Celibacy", ru:"Целибат", sr:"Celibat" } },
  { key:"mono", label:{ en:"Monogamy", ru:"Моногамия", sr:"Monogamija" }, steady:{count:1,condom:10,tested:100,perWeek:3} },
  { key:"serial", label:{ en:"Serial monogamy", ru:"Серийная моногамия", sr:"Serijska monogamija" }, casual:{count:1,condom:20,perWeek:3,dur:18,tested:30} },
  { key:"monogamish", label:{ en:"Monogamish", ru:"Monogamish", sr:"Monogamish" }, steady:{count:1,condom:15,tested:80,perWeek:3}, hookup:{count:2,condom:80} },
  { key:"open", label:{ en:"Open / swing", ru:"Открытые / свинг", sr:"Otvorene / sving" }, steady:{count:1,condom:30,tested:60,perWeek:2}, casual:{count:4,condom:60,perWeek:1,dur:2,tested:20}, hookup:{count:3,condom:80} },
  { key:"poly", label:{ en:"Polyamory", ru:"Полиамория", sr:"Poliamorija" }, steady:{count:2,condom:40,tested:60,perWeek:2}, casual:{count:1,condom:50,perWeek:1,dur:6,tested:30} },
  { key:"ons", label:{ en:"ONS / hookups", ru:"ONS / хукапы", sr:"ONS / avanture" }, hookup:{count:12,condom:80} },
  { key:"core", label:{ en:"Core group", ru:"Core group", sr:"Core grupa" }, casual:{count:2,condom:40,perWeek:1,dur:1,tested:0}, hookup:{count:30,condom:60} },
];

const veMulOf = (s, vaxHpv, vaxHbv) => {
  const vacc = (s.key === "hpv" && vaxHpv) || (s.key === "hbv" && vaxHbv);
  return s.vax && vacc ? (1 - s.vax.ve) : 1;
};

// Множитель передачи на акт по виду секса, относительно рецептивного вагинального (=1).
// Опорные значения по ВИЧ (Patel 2014, CDC, на 10 000 экспозиций): рец.ваг 8, ввод.ваг 4,
// рец.анал 138, ввод.анал 11, оральный — очень низкий. Для не-ВИЧ — грубое приближение.
const ACT_MUL = { vagR: 1, vagI: 0.5, analR: 17, analI: 1.4, oralR: 0.1, oralI: 0.02 };
const ACT_KEYS = ["vagR", "vagI", "analR", "analI", "oralR", "oralI"];
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

function survivalAt(s, t, cfg, veMul, actSel = [1]) {
  let Srec = 1;
  ["casual", "hookup"].forEach((key) => {
    const T = cfg[key]; const cnt = Math.round(T.count);
    if (cnt <= 0) return;
    const encSurv = encSurvOf(s, actSel, (1 - (T.condom / 100) * s.e) * veMul);
    const k = key === "hookup" ? 1 : Math.max(1, T.perWeek * (52 / 12) * T.dur);
    const pEff = Math.min(1, s.p * T.poolMul * (1 - T.tested / 100));
    const transmit = 1 - Math.pow(encSurv, k);
    Srec *= Math.pow(1 - pEff * transmit, cnt);
  });
  const recCum = Math.pow(Srec, t / 12);
  let steadySurv = 1;
  const ST = cfg.steady; const sc = Math.round(ST.count);
  if (sc > 0) {
    const encSurv = encSurvOf(s, actSel, (1 - (ST.condom / 100) * s.e) * veMul);
    const k = Math.max(1, ST.perWeek * (52 / 12) * t);
    const pEff = Math.min(1, s.p * ST.poolMul * (1 - ST.tested / 100));
    const transmit = 1 - Math.pow(encSurv, k);
    steadySurv = Math.pow(1 - pEff * transmit, sc);
  }
  return recCum * steadySurv;
}

function Info({ text }) {
  return (
    <span className="src" tabIndex={0} style={{ marginLeft: 6, verticalAlign: "middle" }}>
      <span className="ic">i</span>
      <span className="box">{text}</span>
    </span>
  );
}

const RECV = { en: "receptive", ru: "принимающий", sr: "receptivni" };
const INS = { en: "insertive", ru: "вводящий", sr: "insertivni" };
const GIVE = { en: "giving", ru: "отдающий", sr: "aktivni" };
const SEXACTS = [
  { grp: { en: "Vaginal", ru: "Вагинальный", sr: "Vaginalni" }, excl: true, items: [["vagR", RECV], ["vagI", INS]] },
  { grp: { en: "Anal", ru: "Анальный", sr: "Analni" }, excl: false, items: [["analR", RECV], ["analI", INS]] },
  { grp: { en: "Oral", ru: "Оральный", sr: "Oralni" }, excl: false, items: [["oralR", RECV], ["oralI", GIVE]] },
];
function SexActs({ acts, setActs, lang }) {
  const toggle = (grp, key) => setActs((a) => {
    const next = { ...a, [key]: !a[key] };
    if (grp.excl && next[key]) grp.items.forEach(([k]) => { if (k !== key) next[k] = false; });
    return next;
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {SEXACTS.map((grp) => (
        <div key={grp.grp.en} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ color: C.mid, fontSize: 12.5, width: 96, flex: "0 0 96px" }}>{grp.grp[lang]}</span>
          <div style={{ display: "flex", gap: 6 }}>
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

function Slider({ label, value, set, min, max, step, valueText, hint, info }) {
  return (
    <div style={{ flex: 1, minWidth: 150 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <span style={{ color: C.mid, fontSize: 13, letterSpacing: 0.2, display: "inline-flex", alignItems: "center" }}>{label}{info && <Info text={info} />}</span>
        <span style={{ color: C.accent, fontSize: 16, fontWeight: 600, fontFamily: "ui-monospace, monospace", fontVariantNumeric: "tabular-nums" }}>{valueText}</span>
      </div>
      <input className="rng" type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(parseFloat(e.target.value))} />
      {hint && <div style={{ color: C.dim, fontSize: 11, marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

function TypeCard({ meta, t, setT, open, toggleOpen, lang, L }) {
  const col = meta.color;
  const cnt = Math.round(t.count);
  if (cnt <= 0) {
    return (
      <button onClick={() => setT({ count: meta.addCount })} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", background: "transparent", border: `1px dashed ${C.border}`, borderLeft: `3px solid ${col}77`, borderRadius: 10, padding: "11px 14px", cursor: "pointer" }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: col, opacity: 0.55 }} />
        <span style={{ color: C.mid, fontSize: 13.5 }}>{meta.label[lang]}</span>
        <span style={{ marginLeft: "auto", color: col, fontSize: 12.5, fontWeight: 600 }}>{L.addBtn}</span>
      </button>
    );
  }
  const cap = meta.kind === "ongoing" ? L.bgMul(t.poolMul) : meta.kind === "oneoff" ? L.oneActBg(t.poolMul) : `${fmtDur(t.dur, lang)} · ${L.bgMul(t.poolMul)}`;
  return (
    <div style={{ background: C.panel, border: `1px solid ${col}55`, borderLeft: `3px solid ${col}`, borderRadius: 12, padding: "13px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: col }} />
        <span style={{ color: C.hi, fontSize: 14, fontWeight: 600 }}>{meta.label[lang]}</span>
        <span style={{ color: C.dim, fontSize: 11, marginLeft: "auto", display: "inline-flex", alignItems: "center" }}>{cap}<Info text={L.poolInfo} /></span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <Slider label={meta.countLab[lang]} value={t.count} set={(v) => setT({ count: Math.round(v) })} min={0} max={meta.countMax} step={1} valueText={`${cnt}`} />
        <Slider label={L.condom} value={t.condom} set={(v) => setT({ condom: v })} min={0} max={100} step={1} valueText={`${t.condom}%`} info={L.condomInfo} />
        <Slider label={L.tested} value={t.tested} set={(v) => setT({ tested: v })} min={0} max={100} step={1} valueText={`${t.tested}%`} info={L.testedInfo} />
      </div>
      <button onClick={toggleOpen} style={{ background: "transparent", border: "none", color: col, fontSize: 12, cursor: "pointer", padding: 0, marginTop: 12 }}>{open ? `▾ ${L.details}` : `▸ ${L.details}`}</button>
      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 13 }}>
          {meta.kind !== "oneoff" && (
            <Slider label={L.sexPerWeek} value={t.perWeek} set={(v) => setT({ perWeek: Math.round(v * 10) / 10 })} min={0.1} max={14} step={0.1} valueText={`${dec(t.perWeek.toFixed(1), lang)}×`} hint={L.sexPerWeekHint} />
          )}
          {meta.kind === "recurring" && (
            <Slider label={L.relDuration} value={t.dur} set={(v) => setT({ dur: v })} min={0} max={60} step={1} valueText={fmtDur(t.dur, lang)} hint={L.relDurationHint} />
          )}
          {meta.kind === "oneoff" && <div style={{ color: C.dim, fontSize: 12 }}>{L.oneoffNote}</div>}
          {meta.kind === "ongoing" && <div style={{ color: C.dim, fontSize: 12 }}>{L.ongoingNote}</div>}
        </div>
      )}
    </div>
  );
}

function packLanes(list) {
  const order = { steady: 0, casual: 1, hookup: 2 };
  const sorted = [...list].sort((a, b) => (order[a.type] - order[b.type]) || (a.start - b.start));
  const laneEnd = [];
  sorted.forEach((p) => {
    let lane = -1;
    for (let i = 0; i < laneEnd.length; i++) { if (laneEnd[i] <= p.start + 0.01) { lane = i; break; } }
    if (lane === -1) { lane = laneEnd.length; laneEnd.push(p.end); } else laneEnd[lane] = p.end;
    p.lane = lane;
  });
  return { list: sorted, lanes: Math.max(1, laneEnd.length) };
}
function buildPartnersTyped(cfg, horizonM) {
  const years = horizonM / 12;
  const list = [];
  const nSteady = Math.round(cfg.steady.count);
  for (let i = 0; i < nSteady; i++) list.push({ start: 0, end: horizonM, type: "steady" });
  let total = nSteady;
  const flow = (key, durM, seed) => {
    const perYear = Math.round(cfg[key].count); if (perYear <= 0) return;
    const tot = Math.round(perYear * years); total += tot;
    const shown = Math.min(tot, 240);           // рисуем максимум столько, но спред — на весь горизонт
    for (let j = 0; j < shown; j++) {
      const h = Math.abs(Math.sin((j + 1 + seed) * 12.9898) * 43758.5453) % 1;
      const base = (j + 0.5) / shown * horizonM;
      const start = Math.min(horizonM - 0.05, Math.max(0, base + (h - 0.5) * (horizonM / shown) * 0.8));
      const d = Math.max(0.2, durM * (0.7 + h * 0.6));
      list.push({ start, end: Math.min(horizonM, start + d), type: key });
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

function ChartTooltip({ active, payload, label, hidden, showAny, lang, L }) {
  if (!active || !payload?.length) return null;
  const yrs = Math.floor(label / 12), mos = label % 12;
  const rows = payload.filter((e) => (e.dataKey === "any" ? showAny : !hidden[e.dataKey])).sort((a, b) => b.value - a.value);
  return (
    <div style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 12 }}>
      <div style={{ color: C.mid, marginBottom: 6 }}>{yrs > 0 ? yrs + " " + yrShort(lang) + " " : ""}{mos} {moWord(lang)}</div>
      {rows.map((e) => { const s = STIS.find((x) => x.key === e.dataKey); return (<div key={e.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 18, color: C.hi }}><span><span style={{ color: e.stroke }}>●</span> {s ? s.label[lang] : L.anyLabel}</span><span>{pctVal(e.value, lang)}</span></div>); })}
    </div>
  );
}

function Breakdown({ s, cfg, years, veMul, actSel = [1], lang, L }) {
  const horizonM = years * 12;
  const yw = yearsWord(years, lang);
  const fmtP = (v) => pctVal(v * 100, lang);
  const active = TYPES.map((meta) => {
    const T = cfg[meta.key]; const cnt = Math.round(T.count);
    if (cnt <= 0) return null;
    const encSurv = encSurvOf(s, actSel, (1 - (T.condom / 100) * s.e) * veMul);
    const actEff = 1 - encSurv; // передача за один контакт (все практики), если партнёр заражён
    const k = meta.kind === "oneoff" ? 1 : meta.kind === "ongoing" ? Math.max(1, T.perWeek * (52 / 12) * horizonM) : Math.max(1, T.perWeek * (52 / 12) * T.dur);
    const pEff = Math.min(1, s.p * T.poolMul * (1 - T.tested / 100));
    const transmit = 1 - Math.pow(encSurv, k);
    const perPartner = pEff * transmit;
    const toHorizon = meta.kind === "ongoing" ? 1 - Math.pow(1 - perPartner, cnt) : 1 - Math.pow(Math.pow(1 - perPartner, cnt), years);
    return { meta, T, cnt, actEff, k, pEff, toHorizon };
  }).filter(Boolean);
  if (active.length === 0) return <div style={{ color: C.mid, fontSize: 13, padding: "8px 0" }}>{L.noActivePartners}</div>;
  const totalRisk = 1 - survivalAt(s, horizonM, cfg, veMul, actSel);
  const condAll = (pct) => ({ steady: { ...cfg.steady, condom: pct }, casual: { ...cfg.casual, condom: pct }, hookup: { ...cfg.hookup, condom: pct } });
  const ho0 = 1 - survivalAt(s, horizonM, condAll(0), veMul, actSel);
  const ho100 = 1 - survivalAt(s, horizonM, condAll(100), veMul, actSel);
  const bareAct = 1 - encSurvOf(s, actSel, 1);
  const condAct = 1 - encSurvOf(s, actSel, 1 - s.e);
  const cutAct = bareAct > 0 ? Math.round((1 - condAct / bareAct) * 100) : Math.round(s.e * 100);
  const cutHor = ho0 > 0 ? Math.round((1 - ho100 / ho0) * 100) : 0;
  const bars = [
    { lab: L.barAct, a: bareAct, b: condAct, fmt: (v) => pctAct(v, lang) },
    { lab: L.barHor(years, yw), a: ho0, b: ho100, fmt: fmtP },
  ];
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ color: C.hi, fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>{L.condomBlockTitle}</div>
        <div style={{ display: "flex", gap: 16, fontSize: 12, color: C.mid, marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: "#ff7b73" }} />{L.withoutCondom}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: "#4dd4ac" }} />{L.withCondom}</span>
        </div>
        {bars.map((row, i) => { const max = Math.max(row.a, row.b, 1e-9); return (
          <div key={i} style={{ marginBottom: 13 }}>
            <div style={{ fontSize: 12, color: C.dim, marginBottom: 6 }}>{row.lab}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <div style={{ flex: 1, height: 16, background: C.panel2, borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${Math.max(2, (row.a / max) * 100)}%`, height: "100%", background: "#ff7b73" }} /></div>
              <span className="num" style={{ width: 56, textAlign: "right", fontSize: 12.5, color: C.hi, fontWeight: 600 }}>{row.fmt(row.a)}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, height: 16, background: C.panel2, borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${Math.max(2, (row.b / max) * 100)}%`, height: "100%", background: "#4dd4ac" }} /></div>
              <span className="num" style={{ width: 56, textAlign: "right", fontSize: 12.5, color: C.hi, fontWeight: 600 }}>{row.fmt(row.b)}</span>
            </div>
          </div>
        ); })}
        <div className="rich" style={{ fontSize: 12.5, color: C.mid, lineHeight: 1.55, marginTop: 6 }}>
          {cutAct - cutHor >= 4 ? L.satDrop(years, yw, cutAct, cutHor) : L.satFlat(years, yw, cutHor)}
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, margin: "4px 0 14px" }} />
      <div className="rich" style={{ fontSize: 13, color: C.mid, lineHeight: 1.6, marginBottom: 12 }}>{L.contribIntro(years, yw)}</div>
      <div style={{ overflowX: "auto" }}>
        <table className="inf" style={{ minWidth: 560 }}>
          <thead><tr><th>{L.thType}</th><th>{L.thPartners}</th><th>{L.thContacts}</th><th>{L.thTransPerAct}</th><th>{L.thChanceInf}</th><th>{L.thRiskHor(years, yw)}</th></tr></thead>
          <tbody>
            {active.map((r) => (
              <tr key={r.meta.key} style={{ borderLeft: `3px solid ${r.meta.color}` }}>
                <td style={{ whiteSpace: "nowrap", color: C.hi }}><span style={{ color: r.meta.color, marginRight: 6 }}>●</span>{r.meta.label[lang]}</td>
                <td className="num">{r.cnt}{r.meta.kind !== "ongoing" ? L.perYear : ""}</td>
                <td className="num">{Math.round(r.k)}</td>
                <td className="num">{pctAct(r.actEff, lang)}</td>
                <td className="num">{fmtP(r.pEff)}</td>
                <td className="num" style={{ color: C.hi, fontWeight: 600 }}>{fmtP(r.toHorizon)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rich" style={{ marginTop: 12, padding: "12px 14px", background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, color: C.mid, lineHeight: 1.55 }}>
        {L.breakdownFoot(s.label[lang], fmtP(totalRisk), years, yw, s.color)}
      </div>
    </div>
  );
}

const OPEN = PRESETS.find((p) => p.key === "open");

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
      <button onClick={() => setOpen((o) => !o)} aria-label="Language" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.panel2, color: C.hi, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 13, cursor: "pointer" }}>
        <span aria-hidden>🌐</span>{lang.toUpperCase()}
        <span aria-hidden style={{ color: C.dim, fontSize: 10, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 8, boxShadow: "0 10px 28px rgba(0,0,0,.5)", display: "flex", gap: 6 }}>
          {LANGS.map((lg) => (
            <button key={lg} onClick={() => { setLang(lg); setOpen(false); }} style={{ background: lang === lg ? C.accent : "transparent", color: lang === lg ? C.bg : C.mid, border: `1px solid ${lang === lg ? C.accent : C.border}`, borderRadius: 999, padding: "5px 12px", fontSize: 13, fontWeight: lang === lg ? 600 : 500, cursor: "pointer" }}>{lg.toUpperCase()}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [lang, setLang] = useState(() => {
    try { const v = localStorage.getItem("lang"); if (v && LANGS.includes(v)) return v; } catch {}
    return "en"; // дефолт — английский, без авто-детекта языка браузера
  });
  useEffect(() => {
    try { localStorage.setItem("lang", lang); } catch {}
    document.documentElement.lang = lang;
  }, [lang]);
  const L = I18N[lang];

  const [cfg, setCfg] = useState(mkCfg(OPEN));
  const [years, setYears] = useState(10);
  const [yMax, setYMax] = useState(100);
  const [hidden, setHidden] = useState({});
  const [showAny, setShowAny] = useState(false);
  const [selected, setSelected] = useState("chl");
  const [vaxHpv, setVaxHpv] = useState(false);
  const [vaxHbv, setVaxHbv] = useState(false);
  const [acts, setActs] = useState({ vagR: true, vagI: false, analR: false, analI: false, oralR: false, oralI: false });
  const [activePreset, setActivePreset] = useState("open");
  const [open, setOpen] = useState({});
  const [guideOpen, setGuideOpen] = useState({});

  const actSel = useMemo(() => actSelOf(acts), [acts]);

  // Всплывашки .box у кнопок «i» не должны уезжать за край экрана.
  useEffect(() => {
    const place = (e) => {
      const src = e.target && e.target.closest && e.target.closest(".src");
      if (!src) return;
      const box = src.querySelector(".box"); if (!box) return;
      box.style.left = ""; box.style.right = ""; box.style.top = ""; box.style.bottom = "";
      requestAnimationFrame(() => {
        const m = 8, vw = window.innerWidth;
        let r = box.getBoundingClientRect();
        if (r.right > vw - m) { box.style.right = "0"; box.style.left = "auto"; }
        if (r.left < m) { box.style.left = "0"; box.style.right = "auto"; }
        r = box.getBoundingClientRect();
        if (r.top < m) { box.style.top = "140%"; box.style.bottom = "auto"; }
      });
    };
    document.addEventListener("mouseover", place);
    document.addEventListener("focusin", place);
    return () => { document.removeEventListener("mouseover", place); document.removeEventListener("focusin", place); };
  }, []);

  const horizonM = years * 12;
  const setType = (key, patch) => { setCfg((c) => ({ ...c, [key]: { ...c[key], ...patch } })); setActivePreset(null); };
  const applyPreset = (pr) => { setCfg(mkCfg(pr)); setActivePreset(pr.key); };
  const toggle = (k) => setHidden((h) => ({ ...h, [k]: !h[k] }));

  const riskPct = (s, t) => (1 - survivalAt(s, t, cfg, veMulOf(s, vaxHpv, vaxHbv), actSel)) * 100;

  const chartData = useMemo(() => {
    const st = Math.max(1, Math.ceil(horizonM / 170));
    const pts = [];
    for (let t = 0; t <= horizonM; t += st) {
      const row = { t }; let anyS = 1;
      STIS.forEach((s) => {
        const sv = survivalAt(s, t, cfg, veMulOf(s, vaxHpv, vaxHbv), actSel);
        row[s.key] = (1 - sv) * 100;
        if (!hidden[s.key]) anyS *= sv;
      });
      row.any = (1 - anyS) * 100;
      pts.push(row);
    }
    return pts;
  }, [cfg, years, vaxHpv, vaxHbv, hidden, actSel]);

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
        summary { cursor:pointer; }
        .tbl-wrap { overflow-x:auto; }
        table.inf { border-collapse:collapse; width:100%; min-width:760px; font-size:13px; }
        table.inf th, table.inf td { text-align:left; padding:10px 12px; border-bottom:1px solid ${C.border}; vertical-align:middle; }
        table.inf th { color:${C.dim}; font-weight:500; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; }
        .num { font-variant-numeric:tabular-nums; }
        .chk { width:17px; height:17px; cursor:pointer; }
        .studio { display:grid; grid-template-columns:1fr; gap:14px; align-items:start; margin-bottom:14px; }
        .studio-chart { position:sticky; top:0; z-index:5; order:-1; box-shadow:0 8px 16px -6px rgba(0,0,0,.55); }
        .chartbox { height:150px; }
        @media (min-width:880px) {
          .studio { grid-template-columns:360px minmax(0,1fr); }
          .studio-controls { grid-column:1; grid-row:1; }
          .studio-chart { grid-column:2; grid-row:1; top:16px; order:0; box-shadow:none; }
          .chartbox { height:380px; }
        }
        .src { position:relative; display:inline-flex; align-items:center; gap:5px; cursor:help; }
        .src .ic { width:12px; height:12px; border-radius:50%; border:1px solid ${C.dim}; color:${C.dim}; font-size:9px; line-height:1; display:inline-flex; align-items:center; justify-content:center; opacity:.85; }
        .src .box { display:none; position:absolute; right:0; bottom:140%; width:280px; background:${C.panel2}; border:1px solid ${C.border}; border-radius:8px; padding:10px 12px; font-size:12px; line-height:1.5; color:${C.mid}; z-index:20; box-shadow:0 8px 24px rgba(0,0,0,.4); text-transform:none; letter-spacing:0; font-weight:400; }
        .src:hover .box, .src:focus-within .box { display:block; }
        .pill { background:${C.panel2}; border:1px solid ${C.border}; color:${C.mid}; padding:6px 12px; border-radius:999px; font-size:12px; cursor:pointer; }
        .pill.on { background:${C.accent}; color:${C.bg}; border-color:${C.accent}; font-weight:600; }
        .ghd { color:${C.dim}; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:5px; }
        .gtx { color:${C.mid}; font-size:12.5px; line-height:1.55; }
        table.inf tbody tr.inf-row { cursor:pointer; transition:background .12s; }
        table.inf tbody tr.inf-row:hover { background:#ffffff0a; }
        table.inf tbody tr.inf-row.on { background:#ffffff12; }
        table.inf tbody tr.inf-row.on:hover { background:#ffffff16; }
        .rich [data-hi] { color:${C.hi}; }
        .rich [data-grn] { color:#4dd4ac; }
        .rich [data-red] { color:#ff7b73; }
      `}</style>

      <div style={{ maxWidth: 940, margin: "0 auto", position: "relative" }}>
        <LangSwitch lang={lang} setLang={setLang} />
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, margin: 0 }}>{L.title}</h1>
            <span style={{ fontSize: 10, color: C.accent, border: `1px solid ${C.accent}`, borderRadius: 4, padding: "3px 7px", letterSpacing: 0.5, textTransform: "uppercase" }}>{L.badge}</span>
          </div>
          <p style={{ color: C.mid, fontSize: 14, margin: 0, lineHeight: 1.5 }}>{L.intro}</p>
        </div>

        <div style={{ background: "#241a0e", border: `1px solid ${C.accent}`, borderRadius: 12, padding: "14px 16px", marginBottom: 18, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ flex: "0 0 24px", width: 24, height: 24, borderRadius: "50%", background: C.accent, color: C.bg, fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>!</span>
          <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.55 }}><b style={{ color: C.hi }}>{L.warnTitle}</b> {L.warnBody}</div>
        </div>

        <div className="studio">
          <div className="studio-controls">
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.6 }}>{L.preset}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {PRESETS.map((pr) => (<button key={pr.key} onClick={() => applyPreset(pr)} className={"pill " + (activePreset === pr.key ? "on" : "")}>{pr.label[lang]}</button>))}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
              {TYPES.map((meta) => (<TypeCard key={meta.key} meta={meta} t={cfg[meta.key]} setT={(patch) => setType(meta.key, patch)} open={!!open[meta.key]} toggleOpen={() => setOpen((o) => ({ ...o, [meta.key]: !o[meta.key] }))} lang={lang} L={L} />))}
            </div>

            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 18px" }}>
              <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10, display: "inline-flex", alignItems: "center" }}>{L.sexActs}<Info text={L.sexActsInfo} /></div>
              <SexActs acts={acts} setActs={setActs} lang={lang} />
              {actSel.length === 0 && <div style={{ color: "#ff922b", fontSize: 12, marginTop: 10 }}>{L.noActs}</div>}

              <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 0.6, margin: "16px 0 10px" }}>{L.protection}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[{ k: "hpv", on: vaxHpv, set: setVaxHpv, lab: L.vaxHpv }, { k: "hbv", on: vaxHbv, set: setVaxHbv, lab: L.vaxHbv }].map((v) => (
                  <button key={v.k} onClick={() => v.set((x) => !x)} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: v.on ? `${C.accent}22` : "transparent", border: `1px solid ${v.on ? C.accent : C.border}`, color: v.on ? C.hi : C.mid, padding: "8px 13px", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
                    <span style={{ width: 16, height: 16, borderRadius: 4, border: `1px solid ${v.on ? C.accent : C.dim}`, background: v.on ? C.accent : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", color: C.bg, fontSize: 11, fontWeight: 700 }}>{v.on ? "✓" : ""}</span>{v.lab}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="studio-chart" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 16px 12px" }}>
            <div style={{ display: "flex", gap: 26, flexWrap: "wrap", marginBottom: 16 }}>
              <Slider label={L.horizon} value={years} set={setYears} min={1} max={50} step={1} valueText={`${years} ${yearsWord(years, lang)}`} hint={L.horizonHint} />
              <Slider label={L.scale} value={yMax} set={setYMax} min={1} max={100} step={1} valueText={`${lang === "en" ? "to" : lang === "sr" ? "do" : "до"} ${yMax}%`} hint={L.scaleHint} />
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
              {STIS.filter((s) => !hidden[s.key]).map((s) => (<span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.mid }}><span style={{ width: 14, height: 0, borderTop: `3px ${s.grounded ? "solid" : "dashed"} ${s.color}`, display: "inline-block" }} />{s.label[lang]}</span>))}
            </div>
            <div className="chartbox">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="t" type="number" domain={[0, horizonM]} ticks={ticks} interval={0} stroke={C.dim} tick={{ fontSize: 12, fill: C.dim }} tickFormatter={(t) => (t === 0 ? "0" : `${t / 12}${L.yrAxis}`)} />
                  <YAxis domain={[0, yMax]} allowDataOverflow stroke={C.dim} tick={{ fontSize: 12, fill: C.dim }} tickFormatter={(v) => `${v}%`} width={46} />
                  <Tooltip content={(p) => <ChartTooltip {...p} hidden={hidden} showAny={showAny} lang={lang} L={L} />} />
                  {STIS.map((s) => (hidden[s.key] ? null : <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2.2} dot={false} strokeDasharray={s.grounded ? "0" : "6 4"} isAnimationActive={false} />))}
                  {showAny && <Line type="monotone" dataKey="any" stroke={C.hi} strokeWidth={1.6} strokeDasharray="1 3" dot={false} isAnimationActive={false} />}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
              <div style={{ color: C.mid, fontSize: 13 }}>{top ? L.topRiskLine(years, yearsWord(years, lang), top.label[lang], pctVal(riskPct(top, horizonM), lang), top.color) : L.enableOne}</div>
              <button className={"pill " + (showAny ? "on" : "")} onClick={() => setShowAny((v) => !v)}>{L.atLeastOne}</button>
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
              <thead><tr><th style={{ width: 34 }}></th><th>{L.thInfection}</th><th>{L.thRisk(years, yearsWord(years, lang))}</th><th>{L.thPerAct}</th><th>{L.thTreatment}</th><th>{L.thConsequences}</th><th style={{ width: 60, textAlign: "right" }}>{L.thSource}</th></tr></thead>
              <tbody>
                {STIS.flatMap((s) => {
                  const exp = !!guideOpen[s.key];
                  const accLab = L.acc[s.acc];
                  const rows = [
                  <tr key={s.key} className={"inf-row" + ((selected === s.key || exp) ? " on" : "")} onClick={() => { setSelected(s.key); setGuideOpen((g) => ({ ...g, [s.key]: !g[s.key] })); }} title={exp ? L.collapseGuide : L.openGuide} style={{ borderLeft: `3px solid ${SEV[s.sev]}`, opacity: hidden[s.key] ? 0.45 : 1 }}>
                    <td onClick={(e) => e.stopPropagation()}><input className="chk" type="checkbox" checked={!hidden[s.key]} onChange={() => toggle(s.key)} style={{ accentColor: s.color }} /></td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span style={{ color: s.color, marginRight: 7 }}>{s.grounded ? "●" : "◌"}</span>{s.label[lang]}
                      {((s.key === "hpv" && vaxHpv) || (s.key === "hbv" && vaxHbv)) && <span title={s.vax.note[lang]} style={{ marginLeft: 8, fontSize: 11, color: "#38d9a9", background: "#38d9a922", border: "1px solid #38d9a955", padding: "1px 7px", borderRadius: 6 }}>{L.vaccinated}</span>}
                      <span aria-hidden style={{ marginLeft: 8, color: exp ? s.color : C.dim, fontSize: 10 }}>{exp ? "▾" : "▸"}</span>
                    </td>
                    <td className="num" style={{ color: C.hi, fontWeight: 600 }}>{pctVal(riskPct(s, horizonM), lang)}</td>
                    <td className="num" style={{ color: C.mid, whiteSpace: "nowrap" }}>{pctAct(1 - encSurvOf(s, actSel, 1), lang)} <span style={{ color: C.dim }}>→</span> {pctAct(1 - encSurvOf(s, actSel, 1 - s.e), lang)}</td>
                    <td><span style={{ background: `${SEV[s.sev]}22`, color: SEV[s.sev], padding: "3px 8px", borderRadius: 6, fontSize: 12, fontWeight: 500, display: "inline-block" }}>{s.treat[lang]}</span></td>
                    <td style={{ color: C.mid, fontSize: 12.5 }}>{s.cons[lang]}</td>
                    <td style={{ textAlign: "right" }}><span className="src" tabIndex={0}><span style={{ width: 8, height: 8, borderRadius: "50%", background: ACC_COLOR[s.acc] }} title={`${L.accuracyLab}: ${accLab}`} /><span className="ic">i</span><span className="box"><b style={{ color: C.hi }}>{L.accuracyLab}: {accLab}</b><br />{s.src[lang]}</span></span></td>
                  </tr>,
                  ];
                  if (exp) rows.push(
                    <tr key={s.key + "-g"} style={{ borderLeft: `3px solid ${s.color}` }}>
                      <td />
                      <td colSpan={6} style={{ background: C.panel2, padding: "14px 16px" }}>
                        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                          <div><div className="ghd">{L.sympt}</div><div className="gtx">{s.guide.symptoms[lang]}</div></div>
                          <div><div className="ghd">{L.treatm}</div><div className="gtx">{s.guide.treatment[lang]}</div></div>
                          <div><div className="ghd">{L.conseq}</div><div className="gtx">{s.guide.consequences[lang]}</div></div>
                        </div>
                        <div style={{ marginTop: 12, fontSize: 12, color: C.dim }}>{L.sourcesLab}: {s.guide.sources.map((src, i) => (<span key={i}>{i > 0 ? " · " : ""}<a href={src.url} target="_blank" rel="noopener noreferrer" style={{ color: s.color, textDecoration: "none" }}>{typeof src.label === "string" ? src.label : src.label[lang]} ↗</a></span>))} {L.guideTail}</div>
                      </td>
                    </tr>
                  );
                  return rows;
                })}
              </tbody>
            </table>
          </div>
        </div>

        <details open style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 14 }}>
          <summary style={{ color: C.hi, fontSize: 15, fontWeight: 600 }}>{L.breakdownTitle}</summary>
          <p style={{ color: C.mid, fontSize: 13, lineHeight: 1.6, margin: "12px 0 12px" }}>{L.breakdownIntro}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {STIS.map((s) => (<button key={s.key} onClick={() => setSelected(s.key)} style={{ border: `1px solid ${selected === s.key ? s.color : C.border}`, background: selected === s.key ? `${s.color}22` : "transparent", color: selected === s.key ? C.hi : C.mid, padding: "6px 12px", borderRadius: 999, fontSize: 12.5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ color: s.color }}>●</span>{s.label[lang]}</button>))}
          </div>
          <Breakdown s={selSti} cfg={cfg} years={years} veMul={veMulOf(selSti, vaxHpv, vaxHbv)} actSel={actSel} lang={lang} L={L} />
        </details>

        <details style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 14 }}>
          <summary style={{ color: C.hi, fontSize: 15, fontWeight: 600 }}>{L.assumTitle}</summary>
          <div className="rich" style={{ color: C.mid, fontSize: 13, lineHeight: 1.65, marginTop: 14 }}>
            <p style={{ marginTop: 0 }}>{L.assumP1}</p>
            <p>{L.assumP2}</p>
            <p>{L.assumP3}</p>
            <p>{L.assumP4}</p>
            <p>{L.assumP5}</p>
            <p style={{ marginBottom: 0 }}>{L.assumP6}</p>
          </div>
        </details>

        <p style={{ color: C.dim, fontSize: 12, lineHeight: 1.6, textAlign: "center", marginTop: 0 }}>{L.footerDisclaimer}</p>
        <p style={{ color: C.dim, fontSize: 12, textAlign: "center", marginTop: 8 }}><a href="https://github.com/UserNameIsAlredyTaken/safesex" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "none" }}>{L.githubLink}</a></p>
      </div>
    </div>
  );
}
