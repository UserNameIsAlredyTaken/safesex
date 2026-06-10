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

// Слейт-палитра (ЗППП) и фиалковая (Беременность) — одинаковый фон/панели, разный акцент.
const CS = { bg:"#0f141a", panel:"#161d26", panel2:"#1b2430", border:"#283442", hi:"#e8edf2", mid:"#9fb0c0", dim:"#64748b", accent:"#f0a500" };
const CP = { bg:"#0f141a", panel:"#161d26", panel2:"#1b2430", border:"#283442", hi:"#e8edf2", mid:"#9fb0c0", dim:"#64748b", accent:"#a78bfa" };
let C = CS; // активная палитра — переключается по режиму в App
let PREG = C.accent; // тематический цвет беременности = активный C.accent
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
    // ── Режим / Mode switcher ──
    modeSti: "🦠 STIs",
    modePreg: "🤰 Pregnancy",
    pregTitle: "Probability of pregnancy over time",
    pregIntro: "Cumulative probability of conception over time. The profile is on the left, the curve on the right. The contraception-effectiveness tables are reliable; fertility by age is an estimate.",
    pregWarnTitle: "This is an amateur calculator, not a medical tool.",
    pregWarnBody: "The contraception-effectiveness tables (CDC/Trussell) are reliable; fertility by age and the per-act estimate are rough approximations, not a personal forecast. Do not use this for pregnancy planning, choosing contraception, or fertility problems — see a doctor (gynecologist/reproductologist).",
    pregWoman: "👩 Woman / couple",
    pregMan: "👨 Man",
    pregWomanExpl: (<><b data-hi>The «Woman» model = the «Couple» model.</b> You can get pregnant at most once per cycle, and the bottleneck is her body and her cycle. Partners <b>do not add up</b>: only the total amount of sex and contraception matter, not the number of partners. So a separate «couple model» is not needed — it's the same curve.</>),
    pregManExpl: (<><b data-hi>The man's view — as in STIs.</b> We count «at least one pregnancy among partners»: here partners <b>do add up</b> (more partners/acts → higher chance of ≥1 event). The main factor is the partners' age (for the man this is an estimate).</>),
    pregProfile: "Profile",
    pregWomanAge: "Woman's age",
    pregWomanAgeInfo: "The main fertility factor; a sharp drop after 35. Age values are a trend estimate (ASRM/Dunson/NICE).",
    pregFreqInfo: "Frequency matters through hitting the fertile window; a plateau ~every other day. The shape of the dependence is an estimate.",
    pregLineWoman: "Probability of pregnancy",
    pregLineNoContra: "no contraception",
    pregHeadWoman: (years, yw, pct, hasContra) => (<>Over {years} {yw} the chance of getting pregnant ≈ <b data-hi>{pct}</b>{hasContra ? " with the chosen contraception" : " without contraception"}.</>),
    pregBehaviorPreset: "Behavior preset",
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
    contraTableSub: "— shared by both modes",
    thMethod: "Method",
    thPerfect: "Perfect",
    thTypical: "Typical",
    pregPerYear: "% preg./yr",
    typicalInfo: "This is the share of women who got pregnant during the first year of use. «Perfect» — if the method is always used correctly; «Typical» — real-world use with misses and mistakes, as for most people.",
    thSideFx: "Side effects",
    howWorks: "How it works",
    sideRisks: "Side effects and risks",
    whoFor: "Who / contraindications",
    contraSourcesTail: "— for reference, not a prescription.",
    // ── Допущения (беременность) ──
    pregAssumTitle: "Assumptions and how this is computed",
    pregAssum1: (<><b data-hi>The unit is a cycle (≈month).</b> Cumulative P(t) = 1 − (1 − annual_failure)^years. The same «survival» logic as in the STI mode.</>),
    pregAssum2: (<><b data-hi>Fertility f(age).</b> A young couple ~20–25% per cycle with regular sex; a sharp drop after 35. <b>The fertility of the specific participants is unknown</b> — so we take population-average values by age (the population-mean fertility; individual spread is large, up to an order of magnitude). This is a <b>trend estimate</b> (ASRM, Dunson, NICE), not a personal probability. Frequency of sex is a multiplier on f (plateau ~every other day) — also a shape estimate. The geometric model slightly overestimates the cumulative (it ignores the spread of couple fertility).</>),
    pregAssum3: (<><b data-hi>Conception only.</b> The model estimates the probability of <b>conception</b>, not of a live birth: miscarriages (whose risk grows with age), ectopic pregnancy and other outcomes are not accounted for.</>),
    pregAssum4: (<><b data-hi>Random day of the cycle.</b> If a calendar method / fertile-window tracking is not used, we assume sex acts happen on <b>random days of the cycle</b> and are not tied to ovulation — so the base f is averaged over the whole cycle.</>),
    pregAssum5: (<><b data-hi>Contraception — the reliable part.</b> The typical-use table (% pregnancies per year, CDC/Trussell): a method lowers the annual failure relative to «no method» (85%/yr). Methods combine by multiplication — a <b>lower bound</b>: in reality it's higher because of dependence (a shared user factor). Source: <a href="https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" target="_blank" rel="noopener noreferrer" style={{ color: "#a78bfa", textDecoration: "none" }}>CDC ↗</a>.</>),
    pregAssum6: (<><b data-hi>Woman = couple.</b> Partners do not add up — you can conceive once per cycle, the bottleneck is her cycle. So the total amount of sex and contraception matter, not the number of partners.</>),
    pregAssum7: (<><b data-hi>Man = STI logic.</b> «At least one pregnancy among partners»: the contribution of each type is multiplied. Steady — by cycles over the whole period; recurring — a relationship of duration dur, refreshed yearly; hookups — a single act (per-act ≈ ⅕ of the per-cycle f — a rough estimate).</>),
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
    modeSti: "🦠 ЗППП",
    modePreg: "🤰 Беременность",
    pregTitle: "Вероятность беременности во времени",
    pregIntro: "Кумулятивная вероятность зачатия во времени. Слева — профиль, справа — кривая. Надёжны таблицы эффективности контрацепции; фертильность по возрасту — оценка.",
    pregWarnTitle: "Это любительский калькулятор, а не медицинский инструмент.",
    pregWarnBody: "Надёжны таблицы эффективности контрацепции (CDC/Trussell); фертильность по возрасту и оценка за акт — грубые приближения, не личный прогноз. Не используй это для планирования беременности, выбора контрацепции или при проблемах с зачатием — обратись к врачу (гинеколог/репродуктолог).",
    pregWoman: "👩 Девушка / пара",
    pregMan: "👨 Парень",
    pregWomanExpl: (<><b data-hi>Модель «Девушка» = модель «Пара».</b> Забеременеть можно максимум раз за цикл, и узкое место — её тело и цикл. Партнёры <b>не суммируются</b>: важно только суммарное количество секса и контрацепция, а не число партнёров. Поэтому отдельная «модель пары» не нужна — это та же кривая.</>),
    pregManExpl: (<><b data-hi>Взгляд парня — как в ЗППП.</b> Считаем «хотя бы одна беременность среди партнёрш»: здесь партнёрши <b>суммируются</b> (больше партнёрш/актов → выше шанс ≥1 события). Главный фактор — возраст партнёрш (для парня это оценка).</>),
    pregProfile: "Профиль",
    pregWomanAge: "Возраст женщины",
    pregWomanAgeInfo: "Главный фактор фертильности; резкий спад после 35. Значения по возрасту — оценка тренда (ASRM/Dunson/NICE).",
    pregFreqInfo: "Частота влияет через попадание в фертильное окно; плато ~через день. Форма зависимости — оценка.",
    pregLineWoman: "Вероятность беременности",
    pregLineNoContra: "без контрацепции",
    pregHeadWoman: (years, yw, pct, hasContra) => (<>За {years} {yw} вероятность забеременеть ≈ <b data-hi>{pct}</b>{hasContra ? " с выбранной контрацепцией" : " без контрацепции"}.</>),
    pregBehaviorPreset: "Пресет поведения",
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
    contraInfo: "Добавляй методы, которыми пользуешься — можно сколько угодно и сочетать. У методов «на каждый акт» (презерватив и т.п.) ползунок задаёт долю актов. Подробности и источники — в справке ниже.",
    addMethod: "+ добавить метод",
    allMethodsAdded: "Все методы добавлены",
    sevTitle: "серьёзность побочек (оценка)",
    removeMethod: "убрать метод",
    shareOfActs: "доля актов с использованием",
    contraTableTitle: "Справка по методам контрацепции",
    contraTableSub: "— общая для обоих режимов",
    thMethod: "Метод",
    thPerfect: "Идеальное",
    thTypical: "Реальное",
    pregPerYear: "% берем./год",
    typicalInfo: "Это доля женщин, забеременевших за первый год использования метода. «Идеальное» — если применять метод всегда и правильно; «Реальное» — реальное использование с пропусками и ошибками, как у большинства.",
    thSideFx: "Побочки",
    howWorks: "Как работает",
    sideRisks: "Побочки и риски",
    whoFor: "Кому / противопоказания",
    contraSourcesTail: "— справочно, не назначение.",
    pregAssumTitle: "Допущения и как это считается",
    pregAssum1: (<><b data-hi>Единица — цикл (≈месяц).</b> Кумулятив P(t) = 1 − (1 − годовой_отказ)^лет. Та же «выживаемостная» логика, что в ЗППП-режиме.</>),
    pregAssum2: (<><b data-hi>Фертильность f(возраст).</b> Молодая пара ~20–25% за цикл при регулярном сексе; резкий спад после 35. <b>Фертильность конкретных участников неизвестна</b> — поэтому берём усреднённые популяционные значения по возрасту (средняя по популяции фертильность; индивидуальный разброс большой, вплоть до порядка). Это <b>оценка тренда</b> (ASRM, Dunson, NICE), а не личная вероятность. Частота секса — множитель к f (плато ~через день) — тоже оценка формы. Геометрическая модель слегка завышает кумулятив (игнорирует разброс фертильности пар).</>),
    pregAssum3: (<><b data-hi>Только зачатие.</b> Модель оценивает вероятность <b>зачатия</b>, а не рождения ребёнка: выкидыши (их риск растёт с возрастом), внематочную беременность и прочие исходы она не учитывает.</>),
    pregAssum4: (<><b data-hi>Случайный день цикла.</b> Если не используется календарный метод / отслеживание фертильного окна, считаем, что половые акты происходят в <b>случайные дни цикла</b> и не привязаны к овуляции — поэтому базовая f усреднена по всему циклу.</>),
    pregAssum5: (<><b data-hi>Контрацепция — надёжная часть.</b> Таблица типичного использования (% беременностей за год, CDC/Trussell): метод снижает годовой отказ относительно «без метода» (85%/год). Методы сочетаются перемножением — <b>оценка снизу</b>: реально выше из-за зависимости (общий пользовательский фактор). Источник: <a href="https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" target="_blank" rel="noopener noreferrer" style={{ color: "#a78bfa", textDecoration: "none" }}>CDC ↗</a>.</>),
    pregAssum6: (<><b data-hi>Девушка = пара.</b> Партнёры не суммируются — забеременеть можно раз за цикл, узкое место — её цикл. Поэтому важно суммарное количество секса и контрацепция, а не число партнёров.</>),
    pregAssum7: (<><b data-hi>Парень = ЗППП-логика.</b> «Хотя бы одна беременность среди партнёрш»: вклад каждого типа перемножается. Постоянные — по циклам весь период; приходящие — связь длительностью dur, обновляется за год; хукапы — один акт (per-act ≈ ⅕ от цикловой f — грубая оценка).</>),
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
    modeSti: "🦠 PPI",
    modePreg: "🤰 Trudnoća",
    pregTitle: "Verovatnoća trudnoće tokom vremena",
    pregIntro: "Kumulativna verovatnoća začeća tokom vremena. Levo — profil, desno — kriva. Pouzdane su tabele efikasnosti kontracepcije; plodnost po starosti je procena.",
    pregWarnTitle: "Ovo je amaterski kalkulator, a ne medicinski alat.",
    pregWarnBody: "Pouzdane su tabele efikasnosti kontracepcije (CDC/Trussell); plodnost po starosti i procena po aktu su grube aproksimacije, ne lična prognoza. Ne koristi ovo za planiranje trudnoće, izbor kontracepcije ili kod problema sa začećem — obrati se lekaru (ginekolog/reproduktolog).",
    pregWoman: "👩 Devojka / par",
    pregMan: "👨 Mladić",
    pregWomanExpl: (<><b data-hi>Model „Devojka“ = model „Par“.</b> Trudnoća je moguća najviše jednom po ciklusu, a usko grlo je njeno telo i ciklus. Partneri se <b>ne sabiraju</b>: bitna je samo ukupna količina seksa i kontracepcija, a ne broj partnera. Zato poseban „model para“ nije potreban — to je ista kriva.</>),
    pregManExpl: (<><b data-hi>Pogled mladića — kao kod PPI.</b> Računamo „bar jedna trudnoća među partnerkama“: ovde se partnerke <b>sabiraju</b> (više partnerki/akata → veća šansa za ≥1 događaj). Glavni faktor je starost partnerki (za mladića je to procena).</>),
    pregProfile: "Profil",
    pregWomanAge: "Starost žene",
    pregWomanAgeInfo: "Glavni faktor plodnosti; nagli pad posle 35. Vrednosti po starosti su procena trenda (ASRM/Dunson/NICE).",
    pregFreqInfo: "Učestalost utiče preko pogađanja plodnog prozora; plato ~svaki drugi dan. Oblik zavisnosti je procena.",
    pregLineWoman: "Verovatnoća trudnoće",
    pregLineNoContra: "bez kontracepcije",
    pregHeadWoman: (years, yw, pct, hasContra) => (<>Za {years} {yw} verovatnoća da se zatrudni ≈ <b data-hi>{pct}</b>{hasContra ? " sa izabranom kontracepcijom" : " bez kontracepcije"}.</>),
    pregBehaviorPreset: "Preset ponašanja",
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
    contraTableSub: "— zajednička za oba režima",
    thMethod: "Metod",
    thPerfect: "Idealno",
    thTypical: "Stvarno",
    pregPerYear: "% trud./god.",
    typicalInfo: "Ovo je udeo žena koje su zatrudnele tokom prve godine korišćenja metoda. „Idealno“ — ako se metod uvek koristi pravilno; „Stvarno“ — stvarno korišćenje sa propustima i greškama, kao kod većine.",
    thSideFx: "Neželjeni efekti",
    howWorks: "Kako radi",
    sideRisks: "Neželjeni efekti i rizici",
    whoFor: "Za koga / kontraindikacije",
    contraSourcesTail: "— informativno, ne propisivanje.",
    pregAssumTitle: "Pretpostavke i kako se ovo računa",
    pregAssum1: (<><b data-hi>Jedinica je ciklus (≈mesec).</b> Kumulativ P(t) = 1 − (1 − godišnji_neuspeh)^godina. Ista „logika preživljavanja“ kao u PPI režimu.</>),
    pregAssum2: (<><b data-hi>Plodnost f(starost).</b> Mlad par ~20–25% po ciklusu uz redovan seks; nagli pad posle 35. <b>Plodnost konkretnih učesnika je nepoznata</b> — zato uzimamo prosečne populacione vrednosti po starosti (populaciona srednja plodnost; individualni raspon je veliki, do reda veličine). Ovo je <b>procena trenda</b> (ASRM, Dunson, NICE), a ne lična verovatnoća. Učestalost seksa je množilac na f (plato ~svaki drugi dan) — takođe procena oblika. Geometrijski model blago precenjuje kumulativ (ignoriše raspon plodnosti parova).</>),
    pregAssum3: (<><b data-hi>Samo začeće.</b> Model procenjuje verovatnoću <b>začeća</b>, a ne rođenja deteta: pobačaji (čiji rizik raste sa starošću), vanmaterična trudnoća i drugi ishodi se ne uračunavaju.</>),
    pregAssum4: (<><b data-hi>Slučajan dan ciklusa.</b> Ako se ne koristi kalendarski metod / praćenje plodnog prozora, smatramo da se polni akti dešavaju <b>slučajnih dana ciklusa</b> i nisu vezani za ovulaciju — pa je osnovna f usrednjena po celom ciklusu.</>),
    pregAssum5: (<><b data-hi>Kontracepcija — pouzdani deo.</b> Tabela tipičnog korišćenja (% trudnoća godišnje, CDC/Trussell): metod smanjuje godišnji neuspeh u odnosu na „bez metoda“ (85%/god.). Metodi se kombinuju množenjem — <b>procena odozdo</b>: realno je više zbog zavisnosti (zajednički korisnički faktor). Izvor: <a href="https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" target="_blank" rel="noopener noreferrer" style={{ color: "#a78bfa", textDecoration: "none" }}>CDC ↗</a>.</>),
    pregAssum6: (<><b data-hi>Devojka = par.</b> Partneri se ne sabiraju — začeće je moguće jednom po ciklusu, usko grlo je njen ciklus. Zato je bitna ukupna količina seksa i kontracepcija, a ne broj partnera.</>),
    pregAssum7: (<><b data-hi>Mladić = PPI logika.</b> „Bar jedna trudnoća među partnerkama“: doprinos svakog tipa se množi. Stalni — po ciklusima ceo period; povremeni — veza trajanja dur, obnavlja se godišnje; avanture — jedan akt (per-act ≈ ⅕ ciklusne f — gruba procena).</>),
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

function Info({ text, dn }) {
  return (
    <span className={"src" + (dn ? " dn" : "")} tabIndex={0} style={{ marginLeft: 6, verticalAlign: "middle" }}>
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

// ───────────────────────── МОДЕЛЬ БЕРЕМЕННОСТИ (отдельный движок) ─────────────────────────
// Единица — менструальный цикл (≈месяц). Кумулятив P = 1 − (1 − годовой_отказ)^лет.
// Надёжно: таблица эффективности контрацепции (CDC/Trussell, типичное использование).
// Оценка: фертильность по возрасту f(age), частотная кривая, per-act для разовых контактов.
const SEG = (on) => ({ padding: "9px 18px", borderRadius: 10, border: `1px solid ${on ? C.accent : C.border}`, background: on ? C.accent : "transparent", color: on ? C.bg : C.mid, fontWeight: on ? 700 : 500, cursor: "pointer", fontSize: 14 });
const SUBSEG = (on, col) => ({ padding: "7px 14px", borderRadius: 999, border: `1px solid ${on ? col : C.border}`, background: on ? `${col}22` : "transparent", color: on ? C.hi : C.mid, cursor: "pointer", fontSize: 13, fontWeight: on ? 600 : 400 });

// Фертильность за цикл при регулярном незащищённом сексе, по возрасту женщины (ОЦЕНКА тренда).
function fAge(age) {
  if (age <= 25) return 0.23;
  if (age <= 29) return 0.20;
  if (age <= 31) return 0.17;
  if (age <= 34) return 0.15;
  if (age <= 37) return 0.11;
  if (age <= 39) return 0.09;
  if (age <= 41) return 0.06;
  if (age <= 43) return 0.035;
  if (age <= 45) return 0.015;
  return 0.005;
}
// Множитель частоты секса к f за цикл (ОЦЕНКА формы).
function kFreq(perWeek) {
  if (perWeek >= 4) return 1.15;
  if (perWeek >= 3) return 1.1;
  if (perWeek >= 2) return 1.0;
  if (perWeek >= 1) return 0.8;
  if (perWeek >= 0.5) return 0.6;
  return 0.45;
}
// Контрацепция: типичное использование, % незапланированных беременностей за 1 год (CDC/Trussell).
// perfect/typical — доля за ПЕРВЫЙ ГОД (0..1). sev — РЕДАКТОРСКАЯ шкала 1–5 (цвет-код, не данные).
// control: 'toggle' — постоянно; 'perAct' — на акт (слайдер доли); 'oneOff' — разово (не на кривую).
// label/side/guide.{how,side,who} — локализованы {en,ru,sr}; sources/числа — общие.
const CONTRA = [
  { key: "none", label: { en: "No method", ru: "Без метода", sr: "Bez metoda" }, perfect: 0.85, typical: 0.85, sev: 1, control: "toggle",
    side: { en: "No side effects, but the maximum chance of pregnancy and zero protection from STIs.", ru: "Побочек нет, но максимальный шанс беременности и ноль защиты от ИППП.", sr: "Nema neželjenih efekata, ali maksimalna šansa za trudnoću i nula zaštite od PPI." },
    guide: { how: { en: "No contraception is used. Baseline: ~85 of 100 couples conceive within a year.", ru: "Контрацепция не используется. Базовая линия: ~85 из 100 пар беременеют за год.", sr: "Kontracepcija se ne koristi. Osnovna linija: ~85 od 100 parova zatrudni za godinu." }, side: { en: "There is no method as such; the risk is unwanted pregnancy and infections.", ru: "Метод как таковой отсутствует; риск — нежелательная беременность и инфекции.", sr: "Metoda kao takvog nema; rizik je neželjena trudnoća i infekcije." }, who: { en: "Only for those planning a pregnancy or ready for one.", ru: "Только для тех, кто планирует беременность или готов к ней.", sr: "Samo za one koji planiraju trudnoću ili su spremni na nju." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "withdrawal", label: { en: "Withdrawal", ru: "Прерванный акт", sr: "Prekinuti akt" }, perfect: 0.04, typical: 0.22, sev: 1, control: "perAct",
    side: { en: "Harmless in itself; high failure rate and zero protection from STIs.", ru: "Сам по себе безвреден; высокая частота ошибок и ноль защиты от ИППП.", sr: "Sam po sebi bezopasan; visoka stopa grešaka i nula zaštite od PPI." },
    guide: { how: { en: "Withdrawing the penis before ejaculation.", ru: "Извлечение полового члена до эякуляции.", sr: "Izvlačenje penisa pre ejakulacije." }, side: { en: "No physical harm; depends on self-control, pre-ejaculate may contain sperm.", ru: "Физического вреда нет; зависит от самоконтроля, предэякулят может содержать сперматозоиды.", sr: "Nema fizičke štete; zavisi od samokontrole, predejakulat može sadržati spermatozoide." }, who: { en: "Cheap and always available, but one of the least reliable methods in typical use.", ru: "Дёшево и всегда доступно, но один из наименее надёжных методов при типичном использовании.", sr: "Jeftino i uvek dostupno, ali jedan od najmanje pouzdanih metoda pri tipičnom korišćenju." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "fam", label: { en: "Calendar / fertile window", ru: "Календарь / фертильное окно", sr: "Kalendar / plodni prozor" }, perfect: 0.004, typical: 0.24, sev: 1, control: "perAct",
    side: { en: "No side effects; needs discipline, the gap between perfect and typical is huge.", ru: "Без побочек; нужна дисциплина, разрыв идеального и типичного огромен.", sr: "Bez neželjenih efekata; potrebna disciplina, jaz između idealnog i tipičnog je ogroman." },
    guide: { how: { en: "Tracking fertility signs (temperature, mucus, calendar) and abstinence/barrier on fertile days.", ru: "Отслеживание признаков фертильности (температура, слизь, календарь) и воздержание/барьер в фертильные дни.", sr: "Praćenje znakova plodnosti (temperatura, sluz, kalendar) i uzdržavanje/barijera u plodnim danima." }, side: { en: "No harm; the cost is self-discipline and abstinence; errors in recognizing the window lead to pregnancy.", ru: "Вреда нет; цена — самодисциплина и воздержание; ошибки распознавания окна ведут к беременности.", sr: "Nema štete; cena je samodisciplina i uzdržavanje; greške u prepoznavanju prozora vode trudnoći." }, who: { en: "Perfect use (symptothermal) is very effective, typical use is one of the least reliable. The ideal depends on the method (symptothermal ~0.4%, calendar ~5%).", ru: "Идеальное использование (симптотермальный) очень эффективно, типичное — одно из самых ненадёжных. Идеал зависит от метода (символотермальный ~0,4%, календарный ~5%).", sr: "Idealno korišćenje (simptotermalni) je veoma efikasno, tipično — jedno od najmanje pouzdanih. Idealno zavisi od metoda (simptotermalni ~0,4%, kalendarski ~5%)." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "condom_m", label: { en: "Condom (male)", ru: "Презерватив (муж.)", sr: "Kondom (muški)" }, perfect: 0.02, typical: 0.18, sev: 1, control: "perAct",
    side: { en: "Occasional latex allergy; may tear/slip. Protects from STIs.", ru: "Изредка аллергия на латекс; может порваться/соскользнуть. Защищает от ИППП.", sr: "Ponekad alergija na lateks; može pući/skliznuti. Štiti od PPI." },
    guide: { how: { en: "A barrier on the penis that holds sperm. Also lowers STI risk.", ru: "Барьер на половом члене, удерживающий сперму. Снижает и риск ИППП.", sr: "Barijera na penisu koja zadržava spermu. Smanjuje i rizik od PPI." }, side: { en: "Possible latex allergy (polyurethane exists); risk of tearing/slipping.", ru: "Возможна аллергия на латекс (есть полиуретановые); риск разрыва/соскальзывания.", sr: "Moguća alergija na lateks (postoje poliuretanski); rizik od pucanja/klizanja." }, who: { en: "Suits almost everyone, no prescription. STI protection is a plus to any method. (Updated CDC gives typical 13% instead of 18%.)", ru: "Подходит почти всем, без рецепта. Защита от ИППП — плюс к любому методу. (Обновлённая CDC даёт типичное 13% вместо 18%.)", sr: "Odgovara skoro svima, bez recepta. Zaštita od PPI je plus uz svaki metod. (Ažurirani CDC daje tipično 13% umesto 18%.)" } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }, { label: "CDC", url: "https://www.cdc.gov/contraception/about/index.html" }] },
  { key: "condom_f", label: { en: "Condom (female)", ru: "Презерватив (жен.)", sr: "Kondom (ženski)" }, perfect: 0.05, typical: 0.21, sev: 1, control: "perAct",
    side: { en: "May shift/be noisy; protects from STIs.", ru: "Может смещаться/шуметь; защищает от ИППП.", sr: "Može se pomerati/biti bučan; štiti od PPI." },
    guide: { how: { en: "A soft sleeve in the vagina with rings that holds sperm.", ru: "Мягкий рукав во влагалище с кольцами, задерживает сперму.", sr: "Mekani rukav u vagini sa prstenovima koji zadržava spermu." }, side: { en: "Sometimes shifting/discomfort; irritation is rare. Protects from STIs.", ru: "Иногда смещение/дискомфорт; раздражения редки. Защищает от ИППП.", sr: "Ponekad pomeranje/nelagodnost; iritacije su retke. Štiti od PPI." }, who: { en: "An alternative to the latex male one; gives the woman control over the barrier. No prescription.", ru: "Альтернатива латексному мужскому; даёт женщине контроль над барьером. Без рецепта.", sr: "Alternativa lateksu muškom; daje ženi kontrolu nad barijerom. Bez recepta." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "diaphragm", label: { en: "Diaphragm / cap", ru: "Диафрагма / колпачок", sr: "Dijafragma / kapica" }, perfect: 0.06, typical: 0.12, sev: 1, control: "perAct",
    side: { en: "Size fitting; slightly higher cystitis risk; used with spermicide.", ru: "Подбор по размеру; чуть выше риск цистита; со спермицидом.", sr: "Biranje veličine; malo veći rizik od cistitisa; sa spermicidom." },
    guide: { how: { en: "A cup with spermicide covering the cervix; inserted before the act.", ru: "Чашечка со спермицидом, закрывающая шейку матки; вводится перед актом.", sr: "Čašica sa spermicidom koja pokriva grlić materice; uvodi se pre akta." }, side: { en: "More frequent cystitis, irritation from spermicide; needs fitting and training.", ru: "Учащённые циститы, раздражение от спермицида; нужен подбор и обучение.", sr: "Češći cistitisi, iritacija od spermicida; potrebno biranje i obuka." }, who: { en: "An option when hormones are contraindicated. For women who have given birth (and for the cap) effectiveness is notably lower.", ru: "Вариант при противопоказаниях к гормонам. У рожавших (и для колпачка) эффективность заметно ниже.", sr: "Opcija pri kontraindikacijama na hormone. Kod žena koje su rađale (i za kapicu) efikasnost je znatno niža." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "spermicide", label: { en: "Spermicides", ru: "Спермициды", sr: "Spermicidi" }, perfect: 0.18, typical: 0.28, sev: 1, control: "perAct",
    side: { en: "Mucosal irritation; frequent nonoxynol-9 may raise STI risk.", ru: "Раздражение слизистой; частый ноноксинол-9 может повышать риск ИППП.", sr: "Iritacija sluznice; čest nonoksinol-9 može povećati rizik od PPI." },
    guide: { how: { en: "Gel/foam/suppositories with a substance that kills sperm; inserted before the act.", ru: "Гель/пена/свечи с веществом, убивающим сперматозоиды; вводятся перед актом.", sr: "Gel/pena/supozitorije sa supstancom koja ubija spermatozoide; uvode se pre akta." }, side: { en: "Irritation; with frequent use nonoxynol-9 damages the mucosa and may RAISE STI risk.", ru: "Раздражение; при частом применении ноноксинол-9 повреждает слизистую и может ПОВЫШАТЬ риск ИППП.", sr: "Iritacija; pri čestom korišćenju nonoksinol-9 oštećuje sluznicu i može POVEĆATI rizik od PPI." }, who: { en: "One of the least reliable alone; usually combined with a barrier. No prescription.", ru: "Один из наименее надёжных в одиночку; обычно сочетают с барьером. Без рецепта.", sr: "Jedan od najmanje pouzdanih samostalno; obično se kombinuje sa barijerom. Bez recepta." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "cok", label: { en: "Combined pill (COC)", ru: "КОК (таблетки)", sr: "Kombinovana pilula (KOK)" }, perfect: 0.003, typical: 0.09, sev: 2, control: "toggle",
    side: { en: "Estrogen: nausea, mood changes, rarely thrombosis; not with some risk factors.", ru: "Эстроген: тошнота, изменения настроения, редко тромбозы; не при ряде факторов риска.", sr: "Estrogen: mučnina, promene raspoloženja, retko tromboze; ne uz neke faktore rizika." },
    guide: { how: { en: "Estrogen + progestin daily: suppress ovulation, thicken mucus.", ru: "Эстроген + прогестин ежедневно: подавляют овуляцию, сгущают слизь.", sr: "Estrogen + progestin dnevno: potiskuju ovulaciju, zgušnjavaju sluz." }, side: { en: "Nausea, breast tenderness, mood/libido changes, spotting. A rare but serious risk — venous thrombosis (higher in smokers 35+).", ru: "Тошнота, болезненность груди, изменения настроения/либидо, мажущие выделения. Редкий, но серьёзный риск — венозный тромбоз (выше у курящих 35+).", sr: "Mučnina, osetljivost grudi, promene raspoloženja/libida, krvarenje. Redak ali ozbiljan rizik — venska tromboza (veći kod pušača 35+)." }, who: { en: "Contraindicated in migraine with aura, thrombosis, smoking after 35, severe hypertension. Bonuses: regular cycle, less acne.", ru: "Противопоказаны при мигрени с аурой, тромбозах, курении после 35, тяжёлой гипертензии. Бонусы: регулярный цикл, меньше акне.", sr: "Kontraindikovane kod migrene sa aurom, tromboze, pušenja posle 35, teške hipertenzije. Bonusi: redovan ciklus, manje akni." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }, { label: "CDC", url: "https://www.cdc.gov/contraception/about/index.html" }] },
  { key: "minipill", label: { en: "Mini-pill (progestin)", ru: "Мини-пили (прогестин)", sr: "Mini-pilula (progestin)" }, perfect: 0.003, typical: 0.09, sev: 2, control: "toggle",
    side: { en: "Require strict timing; irregular bleeding. (Numbers = same as COC — estimate.)", ru: "Требуют строгого времени приёма; нерегулярные кровотечения. (Числа = как у КОК — оценка.)", sr: "Zahtevaju strogo vreme uzimanja; nepravilna krvarenja. (Brojevi = kao KOK — procena.)" },
    guide: { how: { en: "Progestin only daily; thickens mucus, partially suppresses ovulation. Strictly tied to dosing time.", ru: "Только прогестин ежедневно; сгущают слизь, частично подавляют овуляцию. Жёстко привязаны ко времени приёма.", sr: "Samo progestin dnevno; zgušnjava sluz, delimično potiskuje ovulaciju. Strogo vezana za vreme uzimanja." }, side: { en: "Irregular/spotting bleeding — the most common effect. Without estrogen — fewer thromboses.", ru: "Нерегулярные/мажущие кровотечения — самый частый эффект. Без эстрогена — меньше тромбозов.", sr: "Nepravilna/oskudna krvarenja — najčešći efekat. Bez estrogena — manje tromboza." }, who: { en: "An option when estrogen is contraindicated (breastfeeding, migraine with aura, smoking 35+). CDC gives a row shared with COC — no separate numbers, this is an estimate.", ru: "Вариант при противопоказаниях к эстрогену (ГВ, мигрень с аурой, курение 35+). CDC даёт общую с КОК строку — отдельных чисел нет, это оценка.", sr: "Opcija pri kontraindikacijama na estrogen (dojenje, migrena sa aurom, pušenje 35+). CDC daje red zajednički sa KOK — zasebnih brojeva nema, ovo je procena." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "patch", label: { en: "Patch", ru: "Пластырь", sr: "Flaster" }, perfect: 0.003, typical: 0.09, sev: 2, control: "toggle",
    side: { en: "Like COC (estrogen); skin irritation under the patch.", ru: "Как у КОК (эстроген); раздражение кожи под пластырем.", sr: "Kao KOK (estrogen); iritacija kože ispod flastera." },
    guide: { how: { en: "A skin patch with estrogen + progestin; changed once a week.", ru: "Накожный пластырь с эстрогеном + прогестином; меняется раз в неделю.", sr: "Flaster na koži sa estrogenom + progestinom; menja se jednom nedeljno." }, side: { en: "Profile like COC; skin irritation, risk of detaching. At ≥90 kg effectiveness may drop.", ru: "Профиль как у КОК; раздражение кожи, риск отклеивания. При весе ≥90 кг эффективность может снижаться.", sr: "Profil kao KOK; iritacija kože, rizik od odlepljivanja. Pri težini ≥90 kg efikasnost može opasti." }, who: { en: "Same contraindications as COC. Convenient for those who forget daily pills.", ru: "Те же противопоказания, что у КОК. Удобен забывающим ежедневные таблетки.", sr: "Iste kontraindikacije kao KOK. Pogodan za one koji zaboravljaju dnevne pilule." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "ring", label: { en: "Vaginal ring", ru: "Вагинальное кольцо", sr: "Vaginalni prsten" }, perfect: 0.003, typical: 0.09, sev: 2, control: "toggle",
    side: { en: "Like COC; sometimes discharge/irritation, may fall out.", ru: "Как у КОК; иногда выделения/раздражение, может выпадать.", sr: "Kao KOK; ponekad sekret/iritacija, može ispasti." },
    guide: { how: { en: "A flexible ring in the vagina with estrogen + progestin; stays 3 weeks.", ru: "Гибкое кольцо во влагалище с эстрогеном + прогестином; стоит 3 недели.", sr: "Fleksibilni prsten u vagini sa estrogenom + progestinom; stoji 3 nedelje." }, side: { en: "Profile like COC; locally — discharge, irritation, rarely falling out.", ru: "Профиль как у КОК; локально — выделения, раздражение, изредка выпадение.", sr: "Profil kao KOK; lokalno — sekret, iritacija, retko ispadanje." }, who: { en: "Same contraindications as COC. Convenient: once a month, not daily.", ru: "Те же противопоказания, что у КОК. Удобно: раз в месяц, не ежедневно.", sr: "Iste kontraindikacije kao KOK. Pogodno: jednom mesečno, ne svakodnevno." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "depo", label: { en: "Injection (Depo)", ru: "Инъекции (Депо)", sr: "Injekcija (Depo)" }, perfect: 0.002, typical: 0.06, sev: 3, control: "toggle",
    side: { en: "Reversible bone-mass loss; irregular bleeding; slow return of fertility.", ru: "Обратимая потеря костной массы; нерегулярные кровотечения; долгий возврат фертильности.", sr: "Reverzibilni gubitak koštane mase; nepravilna krvarenja; spor povratak plodnosti." },
    guide: { how: { en: "A progestin injection every ~3 months: suppresses ovulation.", ru: "Инъекция прогестина каждые ~3 месяца: подавляет овуляцию.", sr: "Injekcija progestina svaka ~3 meseca: potiskuje ovulaciju." }, side: { en: "Irregular bleeding (often amenorrhea), weight gain, reversible drop in bone density. Return of fertility — up to 9–12 mo after stopping.", ru: "Нерегулярные кровотечения (часто аменорея), набор веса, обратимое снижение костной плотности. Возврат фертильности — до 9–12 мес после отмены.", sr: "Nepravilna krvarenja (često amenoreja), dobijanje na težini, reverzibilno smanjenje koštane gustine. Povratak plodnosti — do 9–12 mes. nakon prestanka." }, who: { en: "Convenient for those suited by a quarterly shot. Caution with osteoporosis risk and near-term pregnancy planning.", ru: "Удобно тем, кому подходит укол раз в квартал. Осторожно при риске остеопороза и скором планировании беременности.", sr: "Pogodno onima kojima odgovara injekcija jednom kvartalno. Oprez kod rizika od osteoporoze i skorog planiranja trudnoće." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "iud_cu", label: { en: "Copper IUD", ru: "Медная ВМС", sr: "Bakarna spirala" }, perfect: 0.006, typical: 0.008, sev: 2, control: "toggle",
    side: { en: "Heavier/more painful periods; insertion risk (rarely perforation).", ru: "Более обильные/болезненные месячные; риск при установке (редко перфорация).", sr: "Obilnije/bolnije menstruacije; rizik pri postavljanju (retko perforacija)." },
    guide: { how: { en: "A T-shaped device in the uterus; copper is toxic to sperm. Hormone-free, up to 10–12 years.", ru: "Т-образное устройство в матке; медь токсична для сперматозоидов. Без гормонов, до 10–12 лет.", sr: "Uređaj u obliku slova T u materici; bakar je toksičan za spermatozoide. Bez hormona, do 10–12 godina." }, side: { en: "Heavier and more painful periods, especially the first months. On insertion — pain, rarely perforation/expulsion.", ru: "Более обильные и болезненные менструации, особенно первые месяцы. При установке — боль, редко перфорация/экспульсия.", sr: "Obilnije i bolnije menstruacije, naročito prvih meseci. Pri postavljanju — bol, retko perforacija/ekspulzija." }, who: { en: "A hormone-free long-term method; works as emergency contraception within the first 5 days. «Fit and forget» — perfect ≈ typical.", ru: "Негормональный долгий метод; годится как экстренная контрацепция в первые 5 дней. «Поставил и забыл» — идеальное≈типичное.", sr: "Nehormonski dugotrajni metod; služi kao hitna kontracepcija u prvih 5 dana. „Postavi i zaboravi“ — idealno≈tipično." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "iud_lng", label: { en: "Hormonal IUD", ru: "Гормональная ВМС", sr: "Hormonska spirala" }, perfect: 0.002, typical: 0.002, sev: 2, control: "toggle",
    side: { en: "Irregular/scant bleeding the first months; insertion risks.", ru: "Нерегулярные/скудные кровотечения первые месяцы; риски при установке.", sr: "Nepravilna/oskudna krvarenja prvih meseci; rizici pri postavljanju." },
    guide: { how: { en: "A T-shaped device releases progestin: thickens mucus, thins the endometrium. 3–8 years.", ru: "Т-образное устройство выделяет прогестин: сгущает слизь, истончает эндометрий. 3–8 лет.", sr: "Uređaj u obliku slova T oslobađa progestin: zgušnjava sluz, istanjuje endometrijum. 3–8 godina." }, side: { en: "Irregular spotting the first months, then often scant periods or amenorrhea. On insertion — pain, rarely perforation.", ru: "Нерегулярные мажущие выделения первые месяцы, затем часто скудные месячные или аменорея. При установке — боль, редко перфорация.", sr: "Nepravilna oskudna krvarenja prvih meseci, zatim često oskudne menstruacije ili amenoreja. Pri postavljanju — bol, retko perforacija." }, who: { en: "Very reliable, «fit and forget»; reduces heavy periods. Perfect = typical.", ru: "Очень надёжно, «поставил-забыл»; уменьшает обильные месячные. Идеальное=типичное.", sr: "Veoma pouzdano, „postavi i zaboravi“; smanjuje obilne menstruacije. Idealno=tipično." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "implant", label: { en: "Implant", ru: "Имплант", sr: "Implant" }, perfect: 0.0005, typical: 0.0005, sev: 2, control: "toggle",
    side: { en: "Unpredictable bleeding; insertion/removal — a minor subcutaneous procedure.", ru: "Непредсказуемые кровотечения; установка/удаление — малая процедура под кожей.", sr: "Nepredvidiva krvarenja; postavljanje/uklanjanje — mala potkožna procedura." },
    guide: { how: { en: "A flexible rod with progestin under the upper-arm skin; suppresses ovulation. ~3–5 years.", ru: "Гибкий стержень с прогестином под кожей плеча; подавляет овуляцию. ~3–5 лет.", sr: "Fleksibilni štapić sa progestinom ispod kože nadlaktice; potiskuje ovulaciju. ~3–5 godina." }, side: { en: "Unpredictable bleeding — the main reason for discontinuation; possible acne, headaches. Insertion/removal — a minor procedure.", ru: "Непредсказуемые кровотечения — главная причина отказа; возможны акне, головные боли. Введение/удаление — мелкая процедура.", sr: "Nepredvidiva krvarenja — glavni razlog za prekid; mogući akne, glavobolje. Postavljanje/uklanjanje — mala procedura." }, who: { en: "The most effective reversible method; perfect = typical. Good for those who want «fit and forget».", ru: "Самый эффективный обратимый метод; идеальное=типичное. Хорош тем, кто хочет «поставить и забыть».", sr: "Najefikasniji reverzibilni metod; idealno=tipično. Dobar za one koji žele „postavi i zaboravi“." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "steril_f", label: { en: "Female sterilization", ru: "Женская стерилизация", sr: "Ženska sterilizacija" }, perfect: 0.005, typical: 0.005, sev: 4, control: "toggle",
    side: { en: "Surgery and anesthesia; considered irreversible; small ectopic risk on failure.", ru: "Хирургия и наркоз; считается необратимой; малый риск внематочной при отказе.", sr: "Hirurgija i anestezija; smatra se nepovratnom; mali rizik od vanmaterične pri neuspehu." },
    guide: { how: { en: "Surgical blocking/removal of the fallopian tubes.", ru: "Хирургическое перекрытие/удаление маточных труб.", sr: "Hirurško zatvaranje/uklanjanje jajovoda." }, side: { en: "Surgical risks (anesthesia, bleeding, infection); on a rare failure a higher share of ectopic. Hormones unchanged.", ru: "Операционные риски (наркоз, кровотечение, инфекция); при редкой неудаче выше доля внематочной. Гормоны не меняются.", sr: "Hirurški rizici (anestezija, krvarenje, infekcija); pri retkom neuspehu veći udeo vanmaterične. Hormoni se ne menjaju." }, who: { en: "For those done with childbearing: the method is PERMANENT and irreversible. Weigh the decision in advance.", ru: "Для завершивших деторождение: метод ПОСТОЯННЫЙ и необратимый. Решение взвешивать заранее.", sr: "Za one koji su završili sa rađanjem: metod je TRAJAN i nepovratan. Odluku odvagati unapred." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "vasectomy", label: { en: "Vasectomy", ru: "Вазэктомия", sr: "Vazektomija" }, perfect: 0.001, typical: 0.0015, sev: 4, control: "toggle",
    side: { en: "Minor surgery; not effective immediately (needs sperm check); considered irreversible.", ru: "Малая операция; не сразу эффективна (нужен контроль спермы); считается необратимой.", sr: "Mala operacija; nije odmah efikasna (potrebna provera sperme); smatra se nepovratnom." },
    guide: { how: { en: "Cutting/tying the vas deferens — no sperm in the ejaculate.", ru: "Пересечение/перевязка семявыносящих протоков — в эякуляте нет сперматозоидов.", sr: "Presecanje/podvezivanje semenovoda — u ejakulatu nema spermatozoida." }, side: { en: "Minor surgery: pain, swelling, bruising, rarely chronic pain. The effect is not instant — a control sperm test is needed (~3 mo).", ru: "Малая операция: боль, отёк, синяк, редко хроническая боль. Эффект не мгновенный — нужен контрольный анализ спермы (~3 мес).", sr: "Mala operacija: bol, otok, modrica, retko hroničan bol. Efekat nije trenutan — potrebna kontrolna analiza sperme (~3 mes.)." }, who: { en: "A permanent method for men done with childbearing. Simpler than female sterilization, but just as irreversible.", ru: "Постоянный метод для мужчин, завершивших деторождение. Проще женской стерилизации, но столь же необратим.", sr: "Trajni metod za muškarce koji su završili sa rađanjem. Jednostavniji od ženske sterilizacije, ali jednako nepovratan." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "lam", label: { en: "LAM (lactational amenorrhea)", ru: "LAM (лактационная аменорея)", sr: "LAM (laktaciona amenoreja)" }, perfect: 0.005, typical: 0.02, sev: 1, control: "toggle",
    side: { en: "Works only the first ~6 mo under strict conditions; «breaks» easily. (6-mo numbers — estimate.)", ru: "Работает лишь первые ~6 мес при строгих условиях; легко «ломается». (Числа за 6 мес — оценка.)", sr: "Radi samo prvih ~6 mes. pod strogim uslovima; lako se „pokvari“. (Brojevi za 6 mes. — procena.)" },
    guide: { how: { en: "Amenorrhea during exclusive breastfeeding suppresses ovulation. Only under all three conditions: baby <6 mo, no menstruation, exclusive breastfeeding.", ru: "Аменорея при исключительно грудном вскармливании подавляет овуляцию. Только при всех трёх условиях: ребёнку <6 мес, нет менструаций, кормление исключительно грудью.", sr: "Amenoreja pri isključivom dojenju potiskuje ovulaciju. Samo pod sva tri uslova: beba <6 mes., nema menstruacija, isključivo dojenje." }, side: { en: "No side effects; breaking any of the three conditions sharply lowers protection; after 6 mo or the first period it does not work.", ru: "Побочек нет; нарушение любого из трёх условий резко снижает защиту; после 6 мес или первой менструации не действует.", sr: "Nema neželjenih efekata; kršenje bilo kog od tri uslova naglo smanjuje zaštitu; posle 6 mes. ili prve menstruacije ne deluje." }, who: { en: "A temporary method for nursing mothers in the first half-year. Numbers are an estimate for 6 mo (Trussell/Cochrane), not a year.", ru: "Временный метод для кормящих в первые полгода. Числа — оценка за 6 мес (Trussell/Cochrane), не за год.", sr: "Privremeni metod za dojilje u prvih pola godine. Brojevi su procena za 6 mes. (Trussell/Cochrane), ne za godinu." } },
    sources: [{ label: "CDC", url: "https://www.cdc.gov/contraception/about/index.html" }, { label: "Cochrane", url: "https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD001329.pub2/full" }] },
  { key: "ec", label: { en: "Emergency contraception", ru: "Экстренная контрацепция", sr: "Hitna kontracepcija" }, oneOff: true, perfect: null, typical: null, sev: 2, control: "oneOff",
    side: { en: "Nausea, cycle disruption; more effective the sooner taken. One-off — not on the curve.", ru: "Тошнота, сбой цикла; тем эффективнее, чем раньше принята. Разовая — не на кривую.", sr: "Mučnina, poremećaj ciklusa; efikasnija što se ranije uzme. Jednokratna — nije na krivi." },
    guide: { how: { en: "A single dose after unprotected sex: levonorgestrel (up to 72 h) or ulipristal (up to 120 h) shifts ovulation; a copper IUD within 5 days is the most effective option.", ru: "Разовый приём после незащищённого акта: левоноргестрел (до 72 ч) или улипристал (до 120 ч) сдвигает овуляцию; медная ВМС в течение 5 дней — самый эффективный вариант.", sr: "Jednokratna doza posle nezaštićenog akta: levonorgestrel (do 72 h) ili ulipristal (do 120 h) pomera ovulaciju; bakarna spirala u roku od 5 dana — najefikasnija opcija." }, side: { en: "Nausea, headache, breast tenderness, temporary cycle disruption. Does not terminate an established pregnancy and does not protect during subsequent acts.", ru: "Тошнота, головная боль, болезненность груди, временный сбой цикла. Не прерывает наступившую беременность и не защищает при последующих актах.", sr: "Mučnina, glavobolja, osetljivost grudi, privremeni poremećaj ciklusa. Ne prekida nastalu trudnoću i ne štiti pri narednim aktima." }, who: { en: "A backup method «just in case», not for regular use. The sooner — the more effective. Levonorgestrel is less effective at high body weight.", ru: "Резервный метод «на случай», не для регулярного использования. Чем раньше — тем эффективнее. Левоноргестрел менее эффективен при высоком весе.", sr: "Rezervni metod „za svaki slučaj“, ne za redovnu upotrebu. Što ranije — to efikasnije. Levonorgestrel je manje efikasan pri visokoj telesnoj težini." } },
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
  { key: "mono", label: { en: "Monogamy", ru: "Моногамия", sr: "Monogamija" }, steady: { count: 1, perWeek: 3, age: 26, meth: { condom_m: 100 } } },
  { key: "dating", label: { en: "Dating", ru: "Встречается", sr: "Zabavlja se" }, casual: { count: 2, perWeek: 1, dur: 12, age: 26, meth: { condom_m: 100 } } },
  { key: "active", label: { en: "Active dating", ru: "Активные знакомства", sr: "Aktivna upoznavanja" }, casual: { count: 4, perWeek: 1, dur: 3, age: 26, meth: { condom_m: 100 } }, hookup: { count: 6, age: 26, meth: { condom_m: 100 } } },
  { key: "hookups", label: { en: "Hookups", ru: "Хукапы", sr: "Avanture" }, hookup: { count: 15, age: 26, meth: { condom_m: 100 } } },
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
function PregChartPanel({ data, lines, years, setYears, yMax, setYMax, headline, lang, L }) {
  const horizonM = years * 12;
  const ts = years <= 12 ? 1 : years <= 30 ? 5 : 10;
  const ticks = []; for (let y = 0; y <= years; y += ts) ticks.push(y * 12);
  return (
    <div className="studio-chart" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 16px 12px" }}>
      <div style={{ display: "flex", gap: 26, flexWrap: "wrap", marginBottom: 16 }}>
        <Slider label={L.horizon} value={years} set={setYears} min={1} max={50} step={1} valueText={`${years} ${yearsWord(years, lang)}`} hint={L.horizonHint} />
        <Slider label={L.scale} value={yMax} set={setYMax} min={1} max={100} step={1} valueText={`${lang === "en" ? "to" : lang === "sr" ? "do" : "до"} ${yMax}%`} hint={L.scaleHint} />
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
        {lines.map((ln) => (<span key={ln.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.mid }}><span style={{ width: 14, height: 0, borderTop: `3px ${ln.dash ? "dashed" : "solid"} ${ln.color}`, display: "inline-block" }} />{ln.label}</span>))}
      </div>
      <div className="chartbox">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="t" type="number" domain={[0, horizonM]} ticks={ticks} interval={0} stroke={C.dim} tick={{ fontSize: 12, fill: C.dim }} tickFormatter={(t) => (t === 0 ? "0" : `${t / 12}${L.yrAxis}`)} />
            <YAxis domain={[0, yMax]} allowDataOverflow stroke={C.dim} tick={{ fontSize: 12, fill: C.dim }} tickFormatter={(v) => `${v}%`} width={46} />
            <Tooltip content={(p) => <PregTip {...p} lang={lang} />} />
            {lines.map((ln) => (<Line key={ln.key} type="monotone" dataKey={ln.key} name={ln.label} stroke={ln.color} strokeWidth={ln.dash ? 1.6 : 2.4} strokeDasharray={ln.dash ? "6 4" : "0"} dot={false} isAnimationActive={false} />))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {headline && <div style={{ color: C.mid, fontSize: 13, marginTop: 8 }}>{headline}</div>}
    </div>
  );
}
function PregTypeCard({ meta, t, setT, lang, L }) {
  const col = meta.color; const cnt = t.count;
  if (cnt <= 0) {
    return (
      <button onClick={() => setT({ count: meta.addCount })} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", background: "transparent", border: `1px dashed ${C.border}`, borderLeft: `3px solid ${col}77`, borderRadius: 10, padding: "11px 14px", cursor: "pointer" }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: col, opacity: 0.55 }} />
        <span style={{ color: C.mid, fontSize: 13.5 }}>{meta.label[lang]}</span>
        <span style={{ marginLeft: "auto", color: col, fontSize: 12.5, fontWeight: 600 }}>{L.addBtn}</span>
      </button>
    );
  }
  const cap = meta.kind === "oneoff" ? L.pregOneoffCap : meta.kind === "ongoing" ? L.pregOngoingCap : L.pregRelCap(fmtDur(t.dur, lang));
  return (
    <div style={{ background: C.panel, border: `1px solid ${col}55`, borderLeft: `3px solid ${col}`, borderRadius: 12, padding: "13px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: col }} />
        <span style={{ color: C.hi, fontSize: 14, fontWeight: 600 }}>{meta.label[lang]}</span>
        <span style={{ color: C.dim, fontSize: 11, marginLeft: "auto" }}>{cap}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <Slider label={meta.countLab[lang]} value={t.count} set={(v) => setT({ count: v })} min={0} max={meta.countMax} step={0.5} valueText={`${dec((Math.round(cnt * 10) / 10).toString(), lang)}`} />
        <Slider label={L.pregPartnerAge} value={t.age} set={(v) => setT({ age: Math.round(v) })} min={16} max={99} step={1} valueText={`${Math.round(t.age)}`} info={L.pregPartnerAgeInfo} />
        {meta.kind !== "oneoff" && <Slider label={L.sexPerWeek} value={t.perWeek} set={(v) => setT({ perWeek: Math.round(v * 10) / 10 })} min={0.1} max={14} step={0.1} valueText={`${dec(t.perWeek.toFixed(1), lang)}×`} />}
        {meta.kind === "recurring" && <Slider label={L.relDuration} value={t.dur} set={(v) => setT({ dur: v })} min={1} max={60} step={1} valueText={fmtDur(t.dur, lang)} />}
        <WomanMethods meth={t.meth} setMeth={(fn) => setT({ meth: fn(t.meth) })} lang={lang} L={L} />
      </div>
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
      {added.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
          {added.map((m) => (
            <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 8, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 10px" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: SEV[m.sev], flex: "0 0 8px" }} title={L.sevTitle} />
              <span style={{ color: C.hi, fontSize: 13 }}>{m.label[lang]}</span>
              {m.control === "perAct" && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", minWidth: 118 }} title={L.shareOfActs}>
                  <input className="rng" type="range" min={0} max={100} step={5} value={meth[m.key] || 0} onChange={(e) => setMeth((s) => ({ ...s, [m.key]: parseFloat(e.target.value) }))} />
                  <span className="num" style={{ color: C.accent, fontSize: 12, width: 34, textAlign: "right" }}>{meth[m.key] || 0}%</span>
                </div>
              )}
              <button onClick={() => rm(m.key)} title={L.removeMethod} style={{ marginLeft: m.control === "perAct" ? 4 : "auto", background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontSize: 17, lineHeight: 1, padding: "0 2px" }}>×</button>
            </div>
          ))}
        </div>
      )}
      <div ref={ref} style={{ position: "relative" }}>
        <button onClick={() => setOpen((o) => !o)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: C.panel2, color: C.accent, border: `1px dashed ${C.accent}66`, borderRadius: 8, padding: "9px 12px", fontSize: 13, cursor: "pointer" }}>
          <span>{L.addMethod}</span>
          <span style={{ color: C.dim, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
        </button>
        {open && (
          <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 30, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, boxShadow: "0 10px 28px rgba(0,0,0,.5)", display: "flex", gap: 8, flexWrap: "wrap" }}>
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
  withdrawal: { en: "The gap is huge: it's hard to always pull out in time, and pre-ejaculate may contain sperm.", ru: "Разрыв огромный: трудно всегда успеть вывести вовремя, а предэякулят может содержать сперматозоиды.", sr: "Jaz je ogroman: teško je uvek izvući na vreme, a predejakulat može sadržati spermatozoide." },
  fam: { en: "The biggest gap: easy to misjudge fertile days or not resist sex in the risky window.", ru: "Самый большой разрыв: легко ошибиться в определении фертильных дней или не удержаться от секса в опасное окно.", sr: "Najveći jaz: lako je pogrešiti u određivanju plodnih dana ili ne odoleti seksu u opasnom prozoru." },
  condom_m: { en: "Tears, slips, put on late, or not used every act.", ru: "Рвётся, слетает, надевается с опозданием или используется не на каждый акт.", sr: "Puca, sklizne, stavlja se sa zakašnjenjem ili se ne koristi pri svakom aktu." },
  condom_f: { en: "Shifts, inserted wrong, or not used every time.", ru: "Смещается, вводится неправильно или используется не каждый раз.", sr: "Pomera se, uvodi se pogrešno ili se ne koristi svaki put." },
  diaphragm: { en: "Wrong placement, shifting, no spermicide, or not every act.", ru: "Неправильная установка, смещение, без спермицида или не на каждый акт.", sr: "Pogrešno postavljanje, pomeranje, bez spermicida ili ne pri svakom aktu." },
  spermicide: { en: "Not always applied in advance and correctly; even ideally the method is weak.", ru: "Применяют не всегда заранее и правильно; даже идеально метод слабый.", sr: "Ne nanosi se uvek unapred i pravilno; čak i idealno metod je slab." },
  cok: { en: "The main cause of the gap — missed and late daily pills.", ru: "Главная причина разрыва — пропуски и опоздания в ежедневном приёме таблеток.", sr: "Glavni uzrok jaza — propusti i kašnjenja u dnevnom uzimanju pilula." },
  minipill: { en: "Very sensitive to dosing time — even a small delay lowers protection.", ru: "Очень чувствительны ко времени приёма — даже небольшое опоздание снижает защиту.", sr: "Veoma osetljive na vreme uzimanja — čak i malo kašnjenje smanjuje zaštitu." },
  patch: { en: "Forgetting to change the patch on time or it peeling off.", ru: "Забывают вовремя поменять пластырь или он отклеивается.", sr: "Zaboravljaju da promene flaster na vreme ili se odlepi." },
  ring: { en: "Forgetting to insert or replace the ring on time.", ru: "Забывают вовремя поставить или сменить кольцо.", sr: "Zaboravljaju da postave ili promene prsten na vreme." },
  depo: { en: "Missing the next injection deadline (needed every ~3 months).", ru: "Пропускают срок очередной инъекции (нужна каждые ~3 месяца).", sr: "Propuštaju rok sledeće injekcije (potrebna svaka ~3 meseca)." },
  iud_cu: { en: "Almost no difference — the method does not depend on the user («fit and forget»).", ru: "Почти нет разницы — метод не зависит от пользователя («поставил и забыл»).", sr: "Skoro nema razlike — metod ne zavisi od korisnika („postavi i zaboravi“)." },
  iud_lng: { en: "No difference — the method does not depend on the user.", ru: "Разницы нет — метод не зависит от пользователя.", sr: "Nema razlike — metod ne zavisi od korisnika." },
  implant: { en: "No difference — the method does not depend on the user.", ru: "Разницы нет — метод не зависит от пользователя.", sr: "Nema razlike — metod ne zavisi od korisnika." },
  steril_f: { en: "Almost no difference — a permanent method, user error is impossible.", ru: "Разницы практически нет — постоянный метод, ошибка пользователя невозможна.", sr: "Praktično nema razlike — trajan metod, korisnička greška je nemoguća." },
  vasectomy: { en: "Almost no difference; the only risk is sex before the control sperm test (~3 mo).", ru: "Почти нет разницы; единственный риск — секс до контрольного анализа спермы (~3 мес).", sr: "Skoro nema razlike; jedini rizik je seks pre kontrolne analize sperme (~3 mes.)." },
  lam: { en: "The gap comes from breaking the strict conditions: feeding regimen, baby under 6 mo, no menstruation.", ru: "Разрыв из-за нарушения строгих условий: режим кормления, возраст ребёнка до 6 мес, отсутствие менструаций.", sr: "Jaz zbog kršenja strogih uslova: režim dojenja, uzrast bebe do 6 mes., odsustvo menstruacija." },
  ec: { en: "A one-off remedy — there is no annual figure. Effectiveness depends on how quickly it's taken after the act.", ru: "Разовое средство — годового показателя нет. Эффективность зависит от того, насколько быстро принять после акта.", sr: "Jednokratno sredstvo — godišnjeg pokazatelja nema. Efikasnost zavisi od toga koliko brzo se uzme posle akta." },
};

function ContraTable({ lang, L }) {
  const [open, setOpen] = useState({});
  const fmtP = (v) => (v == null ? "—" : pctAct(v, lang));
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "6px 6px", margin: "14px 0" }}>
      <div style={{ padding: "12px 12px 6px", fontSize: 13, color: C.hi, fontWeight: 600 }}>{L.contraTableTitle} <span style={{ color: C.dim, fontWeight: 400, fontSize: 12 }}>{L.contraTableSub}</span></div>
      <div className="tbl-wrap">
        <table className="inf">
          <thead><tr>
            <th>{L.thMethod}</th>
            <th><span style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>{L.thPerfect}</span><div style={{ fontWeight: 400, color: C.dim, fontSize: 10, textTransform: "none", letterSpacing: 0, marginTop: 3 }}>{L.pregPerYear}</div></th>
            <th><span style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>{L.thTypical}<Info dn text={L.typicalInfo} /></span><div style={{ fontWeight: 400, color: C.dim, fontSize: 10, textTransform: "none", letterSpacing: 0, marginTop: 3 }}>{L.pregPerYear}</div></th>
            <th>{L.thSideFx}</th>
          </tr></thead>
          <tbody>
            {CONTRA.filter((m) => m.key !== "none").flatMap((m) => {
              const exp = !!open[m.key];
              const rows = [
                <tr key={m.key} className={"inf-row" + (exp ? " on" : "")} onClick={() => setOpen((o) => ({ ...o, [m.key]: !o[m.key] }))} title={exp ? L.collapseGuide : L.openGuide} style={{ borderLeft: `3px solid ${SEV[m.sev]}` }}>
                  <td style={{ whiteSpace: "nowrap", color: C.hi }}>{m.label[lang]}<span aria-hidden style={{ marginLeft: 8, color: exp ? PREG : C.dim, fontSize: 10 }}>{exp ? "▾" : "▸"}</span></td>
                  <td className="num">{fmtP(m.perfect)}</td>
                  <td className="num" style={{ whiteSpace: "nowrap" }}>{fmtP(m.typical)}{GAP[m.key] && <Info dn text={GAP[m.key][lang]} />}</td>
                  <td><span style={{ background: `${SEV[m.sev]}22`, color: SEV[m.sev], padding: "3px 8px", borderRadius: 6, fontSize: 12, fontWeight: 500, display: "inline-block" }}>{m.side[lang]}</span></td>
                </tr>,
              ];
              if (exp) rows.push(
                <tr key={m.key + "-g"} style={{ borderLeft: `3px solid ${SEV[m.sev]}` }}>
                  <td colSpan={4} style={{ background: C.panel2, padding: "14px 16px" }}>
                    <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                      <div><div className="ghd">{L.howWorks}</div><div className="gtx">{m.guide.how[lang]}</div></div>
                      <div><div className="ghd">{L.sideRisks}</div><div className="gtx">{m.guide.side[lang]}</div></div>
                      <div><div className="ghd">{L.whoFor}</div><div className="gtx">{m.guide.who[lang]}</div></div>
                    </div>
                    <div style={{ marginTop: 12, fontSize: 12, color: C.dim }}>{L.sourcesLab}: {m.sources.map((s, i) => (<span key={i}>{i > 0 ? " · " : ""}<a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: PREG, textDecoration: "none" }}>{s.label} ↗</a></span>))} {L.contraSourcesTail}</div>
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

function Pregnancy({ who, setWho, years, setYears, yMax, setYMax, lang, L }) {
  const months = years * 12;
  const [w, setW] = useState({ age: 26, perWeek: 3 });
  const [meth, setMeth] = useState({ condom_m: 100 });
  const [mcfg, setMcfg] = useState(() => mkPregCfg(PREG_PRESETS.find((p) => p.key === "dating")));
  const [manAge, setManAge] = useState(28);
  const [activePreg, setActivePreg] = useState("dating");
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
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.6 }}>{L.pregBehaviorPreset}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {PREG_PRESETS.map((pr) => (<button key={pr.key} onClick={() => applyPreg(pr)} className={"pill " + (activePreg === pr.key ? "on" : "")}>{pr.label[lang]}</button>))}
              </div>
            </div>
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 18px", marginBottom: 14 }}>
              <Slider label={L.pregMyAge} value={manAge} set={setManAge} min={16} max={99} step={1} valueText={`${manAge}`} info={L.pregMyAgeInfo} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {TYPES.map((meta) => (<PregTypeCard key={meta.key} meta={meta} t={mcfg[meta.key]} setT={(patch) => setMType(meta.key, patch)} lang={lang} L={L} />))}
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
        <div className="rich" style={{ color: C.mid, fontSize: 13, lineHeight: 1.65, marginTop: 14 }}>
          <p style={{ marginTop: 0 }}>{L.pregAssum1}</p>
          <p>{L.pregAssum2}</p>
          <p>{L.pregAssum3}</p>
          <p>{L.pregAssum4}</p>
          <p>{L.pregAssum5}</p>
          <p>{L.pregAssum6}</p>
          <p style={{ marginBottom: 0 }}>{L.pregAssum7}</p>
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
  const [mode, setMode] = useState("sti");
  const [pregWho, setPregWho] = useState("woman");
  C = mode === "preg" ? CP : CS;
  PREG = C.accent;

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
        .src.dn .box { top:150%; bottom:auto; }
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
        <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          <button onClick={() => setMode("sti")} style={SEG(mode === "sti")}>{L.modeSti}</button>
          <button onClick={() => setMode("preg")} style={SEG(mode === "preg")}>{L.modePreg}</button>
        </div>

        <div style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, margin: 0 }}>{mode === "sti" ? L.title : L.pregTitle}</h1>
            <span style={{ fontSize: 10, color: C.accent, border: `1px solid ${C.accent}`, borderRadius: 4, padding: "3px 7px", letterSpacing: 0.5, textTransform: "uppercase" }}>{L.badge}</span>
          </div>
          <p style={{ color: C.mid, fontSize: 14, margin: 0, lineHeight: 1.5 }}>{mode === "sti" ? L.intro : L.pregIntro}</p>
        </div>

        <div style={{ background: `${C.accent}1a`, border: `1px solid ${C.accent}`, borderRadius: 12, padding: "14px 16px", marginBottom: 18, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ flex: "0 0 24px", width: 24, height: 24, borderRadius: "50%", background: C.accent, color: C.bg, fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>!</span>
          <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.55 }}><b style={{ color: C.hi }}>{mode === "sti" ? L.warnTitle : L.pregWarnTitle}</b> {mode === "sti" ? L.warnBody : L.pregWarnBody}</div>
        </div>

        {mode === "sti" && (<>
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
        </>)}

        {mode === "preg" && <Pregnancy who={pregWho} setWho={setPregWho} years={years} setYears={setYears} yMax={yMax} setYMax={setYMax} lang={lang} L={L} />}

        <p style={{ color: C.dim, fontSize: 12, lineHeight: 1.6, textAlign: "center", marginTop: 0 }}>{L.footerDisclaimer}</p>
        <p style={{ color: C.dim, fontSize: 12, textAlign: "center", marginTop: 8 }}><a href="https://github.com/UserNameIsAlredyTaken/safesex" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "none" }}>{L.githubLink}</a></p>
      </div>
    </div>
  );
}
